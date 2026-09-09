"use client";

import type { AtUriString, BlobRef, CidString } from "@atproto/lex";
import { create } from "zustand";
import {
  type Account,
  type Profile,
  type StrongRef,
  type ThreadPostView,
  createPost,
  deletePostByUri,
  hydratePosts,
  loadOwnThreadPosts,
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

export type LocalPost = {
  id: string;
  text: string;
  createdAt: string;
  status: "sending" | "sent" | "failed";
  error?: string;
  uri?: AtUriString;
  cid?: CidString;
  previews: { url: string; alt: string; kind: "image" | "video" }[];
  /** False for someone else's root post that we are replying underneath. */
  deletable: boolean;
  stats: { likes: number; reposts: number; replies: number; quotes: number };
};

type ThreadState = {
  account: Account | null;
  profile: Profile | null;

  rootRef: StrongRef | null;
  rootIsMine: boolean;
  posts: LocalPost[];

  draft: string;
  media: MediaItem[];
  mediaError: string | null;

  loadingThread: boolean;
  threadError: string | null;
  lastPolledAt: number | null;

  setAccount: (account: Account | null, profile: Profile | null) => void;
  setDraft: (text: string) => void;
  clearMediaError: () => void;

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
};

const ROOT_KEY = "live-skeet:root";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Attachments are kept aside so a failed post can be retried intact. */
const pendingMedia = new Map<string, MediaItem[]>();

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
  draft: "",
  media: [],
  mediaError: null,
  loadingThread: false,
  threadError: null,
  lastPolledAt: null,

  setAccount: (account, profile) => {
    set({ account, profile });
    if (!account) {
      set({ rootRef: null, posts: [], draft: "", media: [] });
    }
  },

  setDraft: (text) => set({ draft: text }),

  clearMediaError: () => set({ mediaError: null }),

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
    set({ rootRef: null, rootIsMine: true, posts: [], threadError: null });
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
    set({ rootRef: null, posts: [], threadError: null });
  },

  send: () => {
    const state = get();
    const account = state.account;
    if (!account) return;

    const text = state.draft.trim();
    const media = state.media;
    if (!text && media.length === 0) return;
    if (graphemeCount(text) > MAX_GRAPHEMES) return;

    const id = uid();
    const localPost: LocalPost = {
      id,
      text,
      createdAt: new Date().toISOString(),
      status: "sending",
      previews: media.map((item) => ({
        url: item.previewUrl,
        alt: item.alt,
        kind: item.kind,
      })),
      deletable: true,
      stats: { likes: 0, reposts: 0, replies: 0, quotes: 0 },
    };

    pendingMedia.set(id, media);
    // Clear the composer immediately; the network work happens behind it.
    set({
      posts: [...get().posts, localPost],
      draft: "",
      media: [],
      mediaError: null,
    });

    void enqueue(() => deliver(set, get, id));
  },

  retry: (id) => {
    const post = get().posts.find((entry) => entry.id === id);
    if (!post || post.status !== "failed") return;
    set({
      posts: get().posts.map((entry) =>
        entry.id === id ? { ...entry, status: "sending", error: undefined } : entry,
      ),
    });
    void enqueue(() => deliver(set, get, id));
  },

  discard: (id) => {
    pendingMedia.delete(id);
    set({ posts: get().posts.filter((entry) => entry.id !== id) });
  },

  removePost: async (id) => {
    const account = get().account;
    const post = get().posts.find((entry) => entry.id === id);
    if (!account || !post || !post.deletable) return;
    set({ posts: get().posts.filter((entry) => entry.id !== id) });
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
    const { account, posts } = get();
    if (!account) return;
    const uris = posts
      .filter((post) => post.status === "sent" && post.uri)
      .map((post) => post.uri as AtUriString)
      .slice(-75);
    if (uris.length === 0) return;
    try {
      const views = await hydratePosts(account, uris);
      set({
        posts: get().posts.map((post) => {
          const view = post.uri ? views.get(post.uri) : undefined;
          return view ? { ...post, stats: view.stats } : post;
        }),
        lastPolledAt: Date.now(),
      });
    } catch {
      // A missed poll is harmless; the next one will catch up.
    }
  },
}));

/* ------------------------------------------------------------------ */

type Setter = (partial: Partial<ThreadState>) => void;
type Getter = () => ThreadState;

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

function toLocalPost(view: ThreadPostView, deletable: boolean): LocalPost {
  return {
    id: view.uri,
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
    stats: view.stats,
  };
}

async function deliver(set: Setter, get: Getter, id: string) {
  const media = pendingMedia.get(id) ?? [];
  const account = get().account;
  const post = get().posts.find((entry) => entry.id === id);
  if (!account || !post) return;

  const patch = (changes: Partial<LocalPost>) =>
    set({
      posts: get().posts.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    });

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

    const rootRef = get().rootRef;
    const previous = [...get().posts]
      .slice(0, get().posts.findIndex((entry) => entry.id === id))
      .reverse()
      .find((entry) => entry.status === "sent" && entry.uri && entry.cid);

    const parent =
      previous && previous.uri && previous.cid
        ? { uri: previous.uri, cid: previous.cid }
        : rootRef;

    const ref = await createPost({
      account,
      text: post.text,
      langs: [useSettings.getState().postLanguage || "en-GB"],
      embed,
      reply: rootRef && parent ? { root: rootRef, parent } : undefined,
    });

    pendingMedia.delete(id);
    patch({ status: "sent", uri: ref.uri, cid: ref.cid });

    if (!rootRef) {
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
