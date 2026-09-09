"use client";

import {
  type AtUriString,
  type DidString,
  type BlobRef,
  type CidString,
  Client,
  currentDatetimeString,
  isBlobRef,
  jsonToLex,
} from "@atproto/lex";
import {
  PasswordSession,
  type SessionData,
} from "@atproto/lex-password-session";
import {
  api,
  deletePost as deletePostAction,
  post as postAction,
} from "@bsky/sdk";
import { app, com } from "@bsky/sdk/lexicons";
import { RichText } from "@bsky/sdk/richtext";
import { resolveIdentity, resolveHandleToDid } from "./identity";
import {
  buildPostUri,
  didFromUri,
  rkeyFromUri,
  type PostRef,
} from "./aturi";


export type Profile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type Account = {
  session: PasswordSession;
  client: Client;
  did: DidString;
  handle: string;
  pds: string;
};

export const SESSION_KEY = "live-skeet:session";

export function loadStoredSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

function storeSession(data: SessionData) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // Private browsing; the session simply will not survive a reload.
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do.
  }
}

function buildAccount(session: PasswordSession, pds: string, handle: string): Account {
  return {
    session,
    // Reads are proxied to the appview; writes go straight to the PDS.
    client: new Client(session, { service: api.app.service }),
    did: session.did,
    handle,
    pds,
  };
}

export async function signIn(options: {
  identifier: string;
  password: string;
  authFactorToken?: string;
  remember: boolean;
}): Promise<Account> {
  const identity = await resolveIdentity(options.identifier);
  const session = await PasswordSession.login({
    service: identity.pds,
    identifier: identity.did,
    password: options.password.trim(),
    authFactorToken: options.authFactorToken,
    onUpdated: (data) => {
      if (options.remember) storeSession(data);
    },
    onDeleted: () => clearStoredSession(),
  });
  return buildAccount(session, identity.pds, identity.handle);
}

export async function resumeSession(data: SessionData): Promise<Account> {
  const session = await PasswordSession.resume(data, {
    onUpdated: (fresh) => storeSession(fresh),
    onDeleted: () => clearStoredSession(),
  });
  return buildAccount(session, data.service, data.handle);
}

export async function fetchProfile(account: Account): Promise<Profile> {
  const res = await account.client.call(app.bsky.actor.getProfile, {
    actor: account.did,
  });
  return {
    did: res.did,
    handle: res.handle,
    displayName: res.displayName,
    avatar: res.avatar,
  };
}

/* ------------------------------------------------------------------ */
/* Blobs                                                               */
/* ------------------------------------------------------------------ */

export async function uploadImageBlob(
  account: Account,
  blob: Blob,
): Promise<BlobRef> {
  const res = await account.client.uploadBlob(blob, {
    encoding: (blob.type || "image/jpeg") as `${string}/${string}`,
    service: null,
  });
  return res.body.blob;
}

const VIDEO_SERVICE = "https://video.bsky.app";
const VIDEO_SERVICE_DID = "did:web:video.bsky.app";

/**
 * Videos do not go to the PDS directly; they are handed to Bluesky's video
 * service with a short-lived service token, processed, and handed back as a
 * blob we can embed.
 */
export async function uploadVideoBlob(
  account: Account,
  file: File,
  onProgress?: (label: string) => void,
): Promise<BlobRef> {
  onProgress?.("Authorising");
  const auth = await account.client.call(
    com.atproto.server.getServiceAuth,
    {
      aud: VIDEO_SERVICE_DID,
      lxm: "app.bsky.video.uploadVideo",
      exp: Math.floor(Date.now() / 1000) + 30 * 60,
    },
    { service: null },
  );

  const url = new URL(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`);
  url.searchParams.set("did", account.did);
  url.searchParams.set("name", file.name || `video-${Date.now()}.mp4`);

  onProgress?.("Uploading");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": file.type || "video/mp4",
    },
    body: file,
  });

  const body = (await res.json().catch(() => null)) as {
    jobStatus?: { jobId: string; state: string; blob?: unknown; error?: string };
    error?: string;
    message?: string;
  } | null;

  if (!res.ok && !body?.jobStatus) {
    throw new Error(
      body?.message || body?.error || `The video service refused the upload (${res.status}).`,
    );
  }

  let job = body?.jobStatus;
  if (!job) throw new Error("The video service did not return a job.");

  onProgress?.("Processing");
  const deadline = Date.now() + 5 * 60 * 1000;
  while (job.state !== "JOB_STATE_COMPLETED") {
    if (job.state === "JOB_STATE_FAILED") {
      throw new Error(job.error || "Video processing failed.");
    }
    if (Date.now() > deadline) throw new Error("Video processing timed out.");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const statusRes = await fetch(
      `${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(job.jobId)}`,
    );
    const statusBody = (await statusRes.json().catch(() => null)) as {
      jobStatus?: { jobId: string; state: string; blob?: unknown; error?: string };
    } | null;
    if (!statusBody?.jobStatus) throw new Error("Lost track of the video job.");
    job = statusBody.jobStatus;
  }

  if (!job.blob) throw new Error("The video finished processing without a blob.");
  // The video service replies with plain JSON, so the blob needs decoding.
  const blob = jsonToLex(job.blob as never);
  if (!isBlobRef(blob)) {
    throw new Error("The video service returned an unreadable blob.");
  }
  return blob;
}

/* ------------------------------------------------------------------ */
/* Posting                                                             */
/* ------------------------------------------------------------------ */

export type StrongRef = { uri: AtUriString; cid: CidString };

export type OutgoingEmbed =
  | {
      kind: "images";
      images: { blob: BlobRef; alt: string; width: number; height: number }[];
    }
  | {
      kind: "video";
      blob: BlobRef;
      alt: string;
      width?: number;
      height?: number;
    };

export async function createPost(options: {
  account: Account;
  text: string;
  langs: string[];
  /** Hidden hashtags, carried in the record rather than the visible text. */
  tags?: string[];
  reply?: { root: StrongRef; parent: StrongRef };
  embed?: OutgoingEmbed;
  quote?: StrongRef;
}): Promise<StrongRef> {
  const { account, text } = options;

  const rich = await RichText.resolve(text, { resolver: account.client });

  let media: app.bsky.feed.post.Main["embed"];
  if (options.embed?.kind === "images") {
    media = {
      $type: "app.bsky.embed.images",
      images: options.embed.images.map((image) => ({
        image: image.blob,
        alt: image.alt,
        aspectRatio: { width: image.width, height: image.height },
      })),
    };
  } else if (options.embed?.kind === "video") {
    media = {
      $type: "app.bsky.embed.video",
      video: options.embed.blob,
      alt: options.embed.alt || undefined,
      ...(options.embed.width && options.embed.height
        ? { aspectRatio: { width: options.embed.width, height: options.embed.height } }
        : {}),
    };
  }

  // A quote alone is a record embed; a quote with media is the combined form.
  let embed: app.bsky.feed.post.Main["embed"];
  if (options.quote && media) {
    embed = {
      $type: "app.bsky.embed.recordWithMedia",
      record: { $type: "app.bsky.embed.record", record: options.quote },
      media: media as never,
    };
  } else if (options.quote) {
    embed = { $type: "app.bsky.embed.record", record: options.quote };
  } else {
    embed = media;
  }

  const res = await account.client.call(postAction, {
    text: rich.text,
    facets: rich.facets,
    langs: options.langs,
    ...(options.tags?.length ? { tags: options.tags } : {}),
    createdAt: currentDatetimeString(),
    ...(options.reply
      ? {
          reply: {
            root: options.reply.root,
            parent: options.reply.parent,
          },
        }
      : {}),
    ...(embed ? { embed } : {}),
  });

  return { uri: res.uri, cid: res.cid };
}

export async function deletePostByUri(account: Account, uri: AtUriString) {
  await account.client.call(deletePostAction, uri);
}

/* ------------------------------------------------------------------ */
/* Threads                                                             */
/* ------------------------------------------------------------------ */

export type ThreadPostView = {
  uri: AtUriString;
  cid: CidString;
  text: string;
  createdAt: string;
  images: { thumb: string; alt: string }[];
  hasVideo: boolean;
  hasQuote: boolean;
  tags: string[];
  stats: { likes: number; reposts: number; replies: number; quotes: number };
};

/** Turns a pasted link into the strong reference of the thread root. */
export async function resolveRootRef(
  account: Account,
  ref: PostRef,
): Promise<{ root: StrongRef; authorDid: string }> {
  const did = ref.repo.startsWith("did:")
    ? ref.repo
    : await resolveHandleToDid(ref.repo);
  const uri = buildPostUri(did, ref.rkey);
  const res = await account.client.call(app.bsky.feed.getPosts, {
    uris: [uri],
  });
  const found = res.posts[0];
  if (!found) throw new Error("That post could not be found.");
  return { root: { uri: found.uri, cid: found.cid }, authorDid: did };
}

export type QuotePreview = {
  ref: StrongRef;
  handle: string;
  displayName?: string;
  avatar?: string;
  text: string;
};

/** Turns a pasted post link into something we can embed and show in the composer. */
export async function resolveQuote(
  account: Account,
  ref: PostRef,
): Promise<QuotePreview> {
  const did = ref.repo.startsWith("did:")
    ? ref.repo
    : await resolveHandleToDid(ref.repo);
  const uri = buildPostUri(did, ref.rkey);
  const res = await account.client.call(app.bsky.feed.getPosts, { uris: [uri] });
  const found = res.posts[0];
  if (!found) throw new Error("That post could not be found.");
  const record = found.record as { text?: string };
  return {
    ref: { uri: found.uri, cid: found.cid },
    handle: found.author.handle,
    displayName: found.author.displayName,
    avatar: found.author.avatar,
    text: record.text ?? "",
  };
}

function viewFromPost(post: app.bsky.feed.defs.PostView): ThreadPostView {
  const record = post.record as { text?: string; createdAt?: string };
  const embed = post.embed as
    | { $type?: string; images?: { thumb?: string; alt?: string }[] }
    | undefined;
  const images =
    embed?.$type === "app.bsky.embed.images#view" && embed.images
      ? embed.images.map((image) => ({
          thumb: image.thumb ?? "",
          alt: image.alt ?? "",
        }))
      : [];
  return {
    uri: post.uri,
    cid: post.cid,
    text: record.text ?? "",
    createdAt: record.createdAt ?? post.indexedAt,
    images,
    hasVideo:
      embed?.$type === "app.bsky.embed.video#view" ||
      embed?.$type === "app.bsky.embed.recordWithMedia#view",
    hasQuote:
      embed?.$type === "app.bsky.embed.record#view" ||
      embed?.$type === "app.bsky.embed.recordWithMedia#view",
    tags: Array.isArray((post.record as { tags?: unknown }).tags)
      ? ((post.record as { tags: string[] }).tags ?? [])
      : [],
    stats: {
      likes: post.likeCount ?? 0,
      reposts: post.repostCount ?? 0,
      replies: post.replyCount ?? 0,
      quotes: post.quoteCount ?? 0,
    },
  };
}

/** Fetches full views (and engagement) for a list of post URIs. */
export async function hydratePosts(
  account: Account,
  uris: AtUriString[],
): Promise<Map<string, ThreadPostView>> {
  const out = new Map<string, ThreadPostView>();
  for (let index = 0; index < uris.length; index += 25) {
    const chunk = uris.slice(index, index + 25);
    const res = await account.client.call(app.bsky.feed.getPosts, {
      uris: chunk,
    });
    for (const post of res.posts) out.set(post.uri, viewFromPost(post));
  }
  return out;
}

type PostRecord = {
  text?: string;
  createdAt?: string;
  reply?: { root?: { uri?: string }; parent?: { uri?: string } };
};

/**
 * Walks the author's own post records to find every reply they have made in a
 * given thread, in the order they were written. This works no matter how long
 * the thread grows.
 */
export async function loadOwnThreadPosts(
  account: Account,
  rootUri: AtUriString,
): Promise<StrongRef[]> {
  const found: StrongRef[] = [];
  const rootIsOurs = didFromUri(rootUri) === account.did;
  const rootRkey = rkeyFromUri(rootUri);
  let cursor: string | undefined;
  let scanned = 0;

  while (scanned < 500) {
    const page = await account.client.call(
      com.atproto.repo.listRecords,
      {
        repo: account.did,
        collection: "app.bsky.feed.post",
        limit: 100,
        cursor,
      },
      { service: null },
    );
    for (const record of page.records) {
      scanned += 1;
      const value = record.value as PostRecord;
      if (record.uri === rootUri || value.reply?.root?.uri === rootUri) {
        found.push({ uri: record.uri, cid: record.cid });
      }
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
    // Record keys are time-ordered, so once a page is entirely older than the
    // root there are no more replies left to find.
    const oldest = page.records.at(-1);
    if (rootIsOurs && oldest && rkeyFromUri(oldest.uri) < rootRkey) break;
  }

  // listRecords returns newest first; the thread reads oldest first.
  return found.reverse();
}
