"use client";

import type { AtUriString, BlobRef, CidString } from "@atproto/lex";
import { create } from "zustand";
import {
  type Account,
  type Profile,
  type StrongRef,
  type ThreadPostView,
  type QuotePreview,
  createPost,
  deletePostByUri,
  hydratePosts,
  loadOwnThreadPosts,
  resolveQuote,
  resolveRootRef,
  uploadImageBlob,
  uploadVideoBlob,
} from "./bsky";
import { altTextConfigured, generateAltText } from "./altText";
import {
  checkVideo,
  prepareImage,
  readImageSize,
  readVideoInfo,
} from "./media";
import { useSettings } from "./settings";
import { didFromUri, parsePostRef } from "./aturi";
import { MAX_TAGS, buildRecordTags, dedupeTags, tagKey, tagsInText } from "./tags";

export const MAX_GRAPHEMES = 300;
export const MAX_IMAGES = 4;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function graphemeCount(text: string): number {
  if (!text) return 0;
  if (!segmenter) return [...text].length;
  let count = 0;
  for (const segment of segmenter.segment(text)) {
    void segment;
    count += 1;
  }
  return count;
}

export type MediaItem = {
  id: string;
  kind: "image" | "video";
  file: File;
  previewUrl: string;
  alt: string;
  width: number;
  height: number;
  altStatus: "none" | "generating" | "ready" | "error";
  altError?: string;
  uploadStatus: "uploading" | "ready" | "error";
  uploadLabel?: string;
  uploadError?: string;
  blob?: BlobRef;
  /** Resolves once the blob is on the server, so sending never waits twice. */
  upload?: Promise<BlobRef>;
};

export type Lane = "thread" | "aside";

export type LocalPost = {
  id: string;
  lane: Lane;
  text: string;
  createdAt: string;
  status: "sending" | "sent" | "failed";
  error?: string;
  uri?: AtUriString;
  cid?: CidString;
  previews: { url: string; alt: string; kind: "image" | "video" }[];
  /** False for someone else's root post that we are replying underneath. */
  deletable: boolean;
  /** Hidden hashtags carried in the record rather than the visible text. */
  tags: string[];
  quote?: { handle: string; text: string };
  stats: { likes: number; reposts: number; replies: number; quotes: number };
};

type ThreadState = {
  account: Account | null;
  profile: Profile | null;

  rootRef: StrongRef | null;
  rootIsMine: boolean;
  posts: LocalPost[];
  /** Standalone posts made this session, kept in a lane beside the thread. */
  aside: LocalPost[];

  /** Which lane the composer posts into. */
  lane: Lane;
  /** The thread post a reply will hang off. Null means the tip of the thread. */
  replyToId: string | null;
  /** Keyboard selection across whichever lane has focus. */
  selectedId: string | null;

  draft: string;
  media: MediaItem[];
  mediaError: string | null;
  quote: QuotePreview | null;
  quoteLoading: boolean;

  /** Hidden tags applied to every post in the current thread. */
  threadTags: string[];
  /** Hidden tags for the post being written. */
  draftTags: string[];
  /** Tags used before, most recent first, offered back as suggestions. */
  knownTags: string[];

  loadingThread: boolean;
  threadError: string | null;
  lastPolledAt: number | null;

  setAccount: (account: Account | null, profile: Profile | null) => void;
  setDraft: (text: string) => void;
  clearMediaError: () => void;

  /** Opens the separate composer for a post that is not part of the thread. */
  openAside: () => void;
  closeAside: () => void;
  selectPost: (id: string | null) => void;
  moveSelection: (delta: number) => void;
  replyToSelected: () => void;
  setReplyTo: (id: string | null) => void;

  setQuoteFrom: (input: string) => Promise<boolean>;
  clearQuote: () => void;

  addDraftTag: (tag: string) => void;
  removeDraftTag: (tag: string) => void;
  setThreadTags: (tags: string[]) => void;
  forgetTag: (tag: string) => void;

  addFiles: (files: File[]) => Promise<void>;
  removeMedia: (id: string) => void;
  setAlt: (id: string, alt: string) => void;
  regenerateAlt: (id: string) => Promise<void>;

  startNewThread: () => void;
  attachThread: (input: string) => Promise<void>;
  leaveThread: () => void;

  send: () => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  removePost: (id: string) => Promise<void>;

  poll: () => Promise<void>;
  clearAside: () => void;
};

const ROOT_KEY = "live-skeet:root";
const TAGS_KEY = "live-skeet:tags";
const THREAD_TAGS_KEY = "live-skeet:thread-tags";
const ASIDE_KEY = "live-skeet:aside";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing; the app still works, it just forgets between visits.
  }
}

/** The aside lane is a convenience, so only the displayable parts are kept. */
function persistAside(posts: LocalPost[]) {
  writeLocal(
    ASIDE_KEY,
    posts
      .filter((post) => post.status === "sent")
      .slice(-40)
      .map(({ id, lane, text, createdAt, status, uri, cid, deletable, tags, quote, stats }) => ({
        id,
        lane,
        text,
        createdAt,
        status,
        uri,
        cid,
        deletable,
        tags,
        quote,
        stats,
        previews: [],
      })),
  );
}

/** Restores the tag memory and the aside lane from a previous visit. */
export function loadLocalState(): {
  knownTags: string[];
  threadTags: string[];
  aside: LocalPost[];
} {
  return {
    knownTags: readLocal<string[]>(TAGS_KEY, []),
    threadTags: readLocal<string[]>(THREAD_TAGS_KEY, []),
    aside: readLocal<LocalPost[]>(ASIDE_KEY, []),
  };
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

type StashedDraft = {
  draft: string;
  media: MediaItem[];
  quote: QuotePreview | null;
  draftTags: string[];
};

/** Holds the thread draft while the separate composer is open. */
let stashedDraft: StashedDraft | null = null;

type PendingSend = {
  media: MediaItem[];
  quote: StrongRef | null;
  tags: string[];
  lane: Lane;
  parentId: string | null;
};

/** Everything a post needs, kept aside so a failed send can be retried intact. */
const pendingSends = new Map<string, PendingSend>();

/** Posts go out strictly in order, so each reply lands under the last one. */
let chain: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<void>) {
  chain = chain.then(task, task);
  return chain;
}

export const useThread = create<ThreadState>((set, get) => ({
  account: null,
  profile: null,
  rootRef: null,
  rootIsMine: true,
  posts: [],
  aside: [],
  lane: "thread",
  replyToId: null,
  selectedId: null,
  draft: "",
  media: [],
  mediaError: null,
  quote: null,
  quoteLoading: false,
  threadTags: [],
  draftTags: [],
  knownTags: [],
  loadingThread: false,
  threadError: null,
  lastPolledAt: null,

  setAccount: (account, profile) => {
    set({ account, profile });
    if (!account) {
      set({
        rootRef: null,
        posts: [],
        aside: [],
        draft: "",
        media: [],
        quote: null,
        draftTags: [],
        replyToId: null,
        selectedId: null,
      });
    }
  },

  setDraft: (text) => set({ draft: text }),

  clearMediaError: () => set({ mediaError: null }),

  openAside: () => {
    if (get().lane === "aside") return;
    const { draft, media, quote, draftTags } = get();
    // The thread draft is put aside rather than lost, and comes back when the
    // separate composer closes.
    stashedDraft = { draft, media, quote, draftTags };
    set({
      lane: "aside",
      draft: "",
      media: [],
      quote: null,
      draftTags: [],
      mediaError: null,
      selectedId: null,
    });
  },

  closeAside: () => {
    if (get().lane !== "aside") return;
    // Anything still attached to the abandoned draft is released.
    for (const item of get().media) URL.revokeObjectURL(item.previewUrl);
    set({
      lane: "thread",
      draft: stashedDraft?.draft ?? "",
      media: stashedDraft?.media ?? [],
      quote: stashedDraft?.quote ?? null,
      draftTags: stashedDraft?.draftTags ?? [],
      mediaError: null,
    });
    stashedDraft = null;
  },

  selectPost: (id) => set({ selectedId: id }),

  moveSelection: (delta) => {
    const { lane, posts, aside, selectedId } = get();
    // Both lanes read oldest first, so moving down goes towards the composer.
    const list = lane === "aside" ? aside : posts;
    if (list.length === 0) return;
    const current = list.findIndex((post) => post.id === selectedId);
    const next =
      current === -1
        ? // Nothing selected yet: come in from whichever end you are heading from.
          delta > 0
          ? 0
          : list.length - 1
        : Math.min(list.length - 1, Math.max(0, current + delta));
    set({ selectedId: list[next].id });
  },

  replyToSelected: () => {
    const { selectedId, posts } = get();
    const post = posts.find((entry) => entry.id === selectedId);
    if (!post || post.status !== "sent") return;
    const isTip = posts.at(-1)?.id === post.id;
    set({ lane: "thread", replyToId: isTip ? null : post.id });
  },

  setReplyTo: (id) => set({ replyToId: id, lane: "thread" }),

  setQuoteFrom: async (input) => {
    const account = get().account;
    const ref = parsePostRef(input);
    if (!account || !ref) return false;
    set({ quoteLoading: true, mediaError: null });
    try {
      const quote = await resolveQuote(account, ref);
      set({ quote, quoteLoading: false });
      return true;
    } catch (error) {
      set({ quoteLoading: false, mediaError: errorMessage(error) });
      return false;
    }
  },

  clearQuote: () => set({ quote: null }),

  addDraftTag: (tag) => {
    const next = dedupeTags([...get().draftTags, tag]).slice(0, MAX_TAGS);
    set({ draftTags: next });
  },

  removeDraftTag: (tag) =>
    set({
      draftTags: get().draftTags.filter((entry) => tagKey(entry) !== tagKey(tag)),
    }),

  setThreadTags: (tags) => {
    const next = dedupeTags(tags).slice(0, MAX_TAGS);
    set({ threadTags: next });
    writeLocal(THREAD_TAGS_KEY, next);
    rememberTags(set, get, next);
  },

  forgetTag: (tag) => {
    const next = get().knownTags.filter((entry) => tagKey(entry) !== tagKey(tag));
    set({ knownTags: next });
    writeLocal(TAGS_KEY, next);
  },

  addFiles: async (files) => {
    const settings = useSettings.getState();
    set({ mediaError: null });

    for (const file of files) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) {
        set({ mediaError: "Only images and videos can be attached." });
        continue;
      }

      const current = get().media;
      if (current.some((item) => item.kind === "video")) {
        set({ mediaError: "A post can hold one video and nothing else." });
        continue;
      }
      if (isVideo && current.length > 0) {
        set({ mediaError: "A video cannot be posted alongside images." });
        continue;
      }
      if (isImage && current.length >= MAX_IMAGES) {
        set({ mediaError: `Up to ${MAX_IMAGES} images per post.` });
        continue;
      }

      const id = uid();
      const previewUrl = URL.createObjectURL(file);

      let width = 0;
      let height = 0;
      if (isImage) {
        try {
          const size = await readImageSize(file);
          width = size.width;
          height = size.height;
        } catch {
          // Not fatal; the aspect ratio is simply left off.
        }
      } else {
        try {
          const info = await readVideoInfo(file);
          const problem = checkVideo(file, info);
          if (problem) {
            URL.revokeObjectURL(previewUrl);
            set({ mediaError: problem });
            continue;
          }
          width = info.width;
          height = info.height;
        } catch (error) {
          URL.revokeObjectURL(previewUrl);
          set({ mediaError: errorMessage(error) });
          continue;
        }
      }

      const item: MediaItem = {
        id,
        kind: isVideo ? "video" : "image",
        file,
        previewUrl,
        alt: "",
        width,
        height,
        altStatus: "none",
        uploadStatus: "uploading",
      };
      set({ media: [...get().media, item] });

      // Upload straight away so pressing send is instant.
      const account = get().account;
      if (account) {
        const upload = (async () => {
          if (isVideo) {
            const blob = await uploadVideoBlob(account, file, (label) =>
              patchMedia(set, get, id, { uploadLabel: label }),
            );
            return blob;
          }
          const prepared = await prepareImage(file, settings.compressImages);
          patchMedia(set, get, id, {
            width: prepared.width,
            height: prepared.height,
          });
          return uploadImageBlob(account, prepared.blob);
        })();

        patchMedia(set, get, id, { upload });
        upload
          .then((blob) =>
            patchMedia(set, get, id, { blob, uploadStatus: "ready" }),
          )
          .catch((error: unknown) =>
            patchMedia(set, get, id, {
              uploadStatus: "error",
              uploadError: errorMessage(error),
            }),
          );
      }

      if (isImage && altTextConfigured(settings)) {
        void runAltText(set, get, id, file);
      }
    }
  },

  removeMedia: (id) => {
    const item = get().media.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    set({
      media: get().media.filter((entry) => entry.id !== id),
      mediaError: null,
    });
  },

  setAlt: (id, alt) => patchMedia(set, get, id, { alt, altStatus: "ready" }),

  regenerateAlt: async (id) => {
    const item = get().media.find((entry) => entry.id === id);
    if (!item || item.kind !== "image") return;
    await runAltText(set, get, id, item.file);
  },

  startNewThread: () => {
    try {
      localStorage.removeItem(ROOT_KEY);
    } catch {
      // Ignore.
    }
    set({
      rootRef: null,
      rootIsMine: true,
      posts: [],
      threadError: null,
      replyToId: null,
      selectedId: null,
      lane: "thread",
    });
  },

  attachThread: async (input) => {
    const account = get().account;
    if (!account) return;
    const ref = parsePostRef(input);
    if (!ref) {
      set({ threadError: "That does not look like a Bluesky post link." });
      return;
    }
    set({ loadingThread: true, threadError: null });
    try {
      const { root, authorDid } = await resolveRootRef(account, ref);
      const refs = await loadOwnThreadPosts(account, root.uri);
      const uris = refs.map((entry) => entry.uri);
      if (authorDid !== account.did && !uris.includes(root.uri)) {
        uris.unshift(root.uri);
      }
      const views = await hydratePosts(account, uris);
      set({
        rootRef: root,
        rootIsMine: authorDid === account.did,
        posts: uris
          .map((uri) => views.get(uri))
          .filter((view): view is ThreadPostView => Boolean(view))
          .map((view) => toLocalPost(view, didFromUri(view.uri) === account.did)),
        loadingThread: false,
        lastPolledAt: Date.now(),
      });
      try {
        localStorage.setItem(ROOT_KEY, root.uri);
      } catch {
        // Ignore.
      }
    } catch (error) {
      set({ loadingThread: false, threadError: errorMessage(error) });
    }
  },

  leaveThread: () => {
    try {
      localStorage.removeItem(ROOT_KEY);
    } catch {
      // Ignore.
    }
    set({
      rootRef: null,
      posts: [],
      threadError: null,
      replyToId: null,
      selectedId: null,
    });
  },

  send: () => {
    const state = get();
    const account = state.account;
    if (!account) return;

    const text = state.draft.trim();
    const media = state.media;
    const quote = state.quote;
    if (!text && media.length === 0 && !quote) return;
    if (graphemeCount(text) > MAX_GRAPHEMES) return;

    const lane = state.lane;
    // Thread-wide hidden tags ride along on every reply; the aside lane only
    // carries whatever was set on the post itself.
    const tags = dedupeTags([
      ...(lane === "thread" ? state.threadTags : []),
      ...state.draftTags,
    ]).slice(0, MAX_TAGS);

    const id = uid();
    const localPost: LocalPost = {
      id,
      lane,
      text,
      createdAt: new Date().toISOString(),
      status: "sending",
      previews: media.map((item) => ({
        url: item.previewUrl,
        alt: item.alt,
        kind: item.kind,
      })),
      deletable: true,
      tags,
      quote: quote ? { handle: quote.handle, text: quote.text } : undefined,
      stats: { likes: 0, reposts: 0, replies: 0, quotes: 0 },
    };

    pendingSends.set(id, {
      media,
      quote: quote?.ref ?? null,
      tags,
      lane,
      parentId: lane === "thread" ? state.replyToId : null,
    });

    // Clear the composer immediately; the network work happens behind it.
    set({
      ...(lane === "aside"
        ? { aside: [...state.aside, localPost] }
        : { posts: [...state.posts, localPost] }),
      draft: "",
      media: [],
      mediaError: null,
      quote: null,
      draftTags: [],
      replyToId: null,
      selectedId: null,
    });

    rememberTags(set, get, [...tagsInText(text), ...tags]);
    void enqueue(() => deliver(set, get, id));
  },

  retry: (id) => {
    const post = findPost(get(), id);
    if (!post || post.status !== "failed") return;
    patchPost(set, get, id, { status: "sending", error: undefined });
    void enqueue(() => deliver(set, get, id));
  },

  discard: (id) => {
    pendingSends.delete(id);
    set({
      posts: get().posts.filter((entry) => entry.id !== id),
      aside: get().aside.filter((entry) => entry.id !== id),
    });
  },

  removePost: async (id) => {
    const account = get().account;
    const post = findPost(get(), id);
    if (!account || !post || !post.deletable) return;
    set({
      posts: get().posts.filter((entry) => entry.id !== id),
      aside: get().aside.filter((entry) => entry.id !== id),
    });
    persistAside(get().aside);
    if (post.uri) {
      try {
        await deletePostByUri(account, post.uri);
      } catch {
        // The post list is already updated; a failed delete is not worth
        // interrupting a live thread for.
      }
    }
  },

  poll: async () => {
    const { account, posts, aside } = get();
    if (!account) return;
    const uris = [...posts, ...aside]
      .filter((post) => post.status === "sent" && post.uri)
      .map((post) => post.uri as AtUriString)
      .slice(-75);
    if (uris.length === 0) return;
    try {
      const views = await hydratePosts(account, uris);
      const apply = (post: LocalPost) => {
        const view = post.uri ? views.get(post.uri) : undefined;
        return view ? { ...post, stats: view.stats } : post;
      };
      set({
        posts: get().posts.map(apply),
        aside: get().aside.map(apply),
        lastPolledAt: Date.now(),
      });
    } catch {
      // A missed poll is harmless; the next one will catch up.
    }
  },

  clearAside: () => {
    set({ aside: [], selectedId: null, lane: "thread" });
    persistAside([]);
  },
}));

/* ------------------------------------------------------------------ */

type Setter = (partial: Partial<ThreadState>) => void;
type Getter = () => ThreadState;

/** Finds a post in whichever lane holds it. */
function findPost(state: ThreadState, id: string): LocalPost | undefined {
  return (
    state.posts.find((entry) => entry.id === id) ??
    state.aside.find((entry) => entry.id === id)
  );
}

function patchPost(
  set: Setter,
  get: Getter,
  id: string,
  patch: Partial<LocalPost>,
) {
  const apply = (entry: LocalPost) =>
    entry.id === id ? { ...entry, ...patch } : entry;
  set({ posts: get().posts.map(apply), aside: get().aside.map(apply) });
}

/** Keeps a most-recent-first list of tags to offer back as suggestions. */
function rememberTags(set: Setter, get: Getter, tags: string[]) {
  const fresh = dedupeTags(tags);
  if (fresh.length === 0) return;
  const next = dedupeTags([...fresh, ...get().knownTags]).slice(0, 40);
  set({ knownTags: next });
  writeLocal(TAGS_KEY, next);
}

function patchMedia(
  set: Setter,
  get: Getter,
  id: string,
  patch: Partial<MediaItem>,
) {
  set({
    media: get().media.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  });
}

async function runAltText(set: Setter, get: Getter, id: string, file: File) {
  patchMedia(set, get, id, { altStatus: "generating", altError: undefined });
  try {
    const alt = await generateAltText({
      blob: file,
      settings: useSettings.getState(),
      postText: get().draft,
    });
    const still = get().media.find((item) => item.id === id);
    if (!still) return;
    patchMedia(set, get, id, { alt, altStatus: "ready" });
  } catch (error) {
    patchMedia(set, get, id, {
      altStatus: "error",
      altError: errorMessage(error),
    });
  }
}

function toLocalPost(
  view: ThreadPostView,
  deletable: boolean,
  lane: Lane = "thread",
): LocalPost {
  return {
    id: view.uri,
    lane,
    text: view.text,
    createdAt: view.createdAt,
    status: "sent",
    uri: view.uri,
    cid: view.cid,
    previews: view.images.map((image) => ({
      url: image.thumb,
      alt: image.alt,
      kind: "image" as const,
    })),
    deletable,
    tags: view.tags,
    stats: view.stats,
  };
}

async function deliver(set: Setter, get: Getter, id: string) {
  const pending = pendingSends.get(id);
  const media = pending?.media ?? [];
  const account = get().account;
  const post = findPost(get(), id);
  if (!account || !post) return;

  const patch = (changes: Partial<LocalPost>) =>
    patchPost(set, get, id, changes);

  try {
    let embed;
    if (media.length > 0) {
      const settled = await Promise.all(
        media.map(async (item) => {
          const blob = item.blob ?? (await item.upload);
          if (!blob) throw new Error("An attachment failed to upload.");
          return { item, blob };
        }),
      );
      const video = settled.find((entry) => entry.item.kind === "video");
      if (video) {
        embed = {
          kind: "video" as const,
          blob: video.blob,
          alt: video.item.alt,
          width: video.item.width || undefined,
          height: video.item.height || undefined,
        };
      } else {
        embed = {
          kind: "images" as const,
          images: settled.map((entry) => ({
            blob: entry.blob,
            alt: entry.item.alt,
            width: entry.item.width || 1000,
            height: entry.item.height || 1000,
          })),
        };
      }
    }

    const standalone = (pending?.lane ?? post.lane) === "aside";
    const rootRef = standalone ? null : get().rootRef;

    // Replies hang off the chosen post, or off the tip of the thread.
    let parent: StrongRef | null = rootRef;
    if (rootRef) {
      const chosen = pending?.parentId
        ? get().posts.find((entry) => entry.id === pending.parentId)
        : undefined;
      const fallback = [...get().posts]
        .slice(0, get().posts.findIndex((entry) => entry.id === id))
        .reverse()
        .find((entry) => entry.status === "sent" && entry.uri && entry.cid);
      const target = chosen ?? fallback;
      if (target?.uri && target.cid) parent = { uri: target.uri, cid: target.cid };
    }

    const ref = await createPost({
      account,
      text: post.text,
      langs: [useSettings.getState().postLanguage || "en-GB"],
      tags: buildRecordTags(post.text, pending?.tags ?? post.tags),
      embed,
      quote: pending?.quote ?? undefined,
      reply: rootRef && parent ? { root: rootRef, parent } : undefined,
    });

    pendingSends.delete(id);
    patch({ status: "sent", uri: ref.uri, cid: ref.cid });

    if (standalone) {
      persistAside(get().aside);
    } else if (!rootRef) {
      set({ rootRef: ref, rootIsMine: true });
      try {
        localStorage.setItem(ROOT_KEY, ref.uri);
      } catch {
        // Ignore.
      }
    }
  } catch (error) {
    patch({ status: "failed", error: errorMessage(error) });
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

export function storedRootUri(): string | null {
  try {
    return localStorage.getItem(ROOT_KEY);
  } catch {
    return null;
  }
}
