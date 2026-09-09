import { type AtUriString, isAtUriString } from "@atproto/syntax";

export type PostRef = {
  /** DID or handle, exactly as it appeared. */
  repo: string;
  rkey: string;
};

const POST_COLLECTION = "app.bsky.feed.post";

/** Hosts that use the /profile/<actor>/post/<rkey> path shape. */
const KNOWN_WEB_HOSTS = [
  "bsky.app",
  "staging.bsky.app",
  "main.bsky.dev",
  "deer.social",
  "zeppelin.social",
  "bsky.link",
];

/**
 * Accepts an at:// URI, a bsky.app style URL, or anything close enough, and
 * pulls out the repo and record key of a post.
 */
export function parsePostRef(input: string): PostRef | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("at://")) {
    const rest = raw.slice("at://".length);
    const [repo, collection, rkey] = rest.split("/");
    if (!repo || collection !== POST_COLLECTION || !rkey) return null;
    return { repo, rkey };
  }

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // /profile/<actor>/post/<rkey>
  const profileIndex = segments.indexOf("profile");
  if (profileIndex !== -1 && segments[profileIndex + 2] === "post") {
    const repo = segments[profileIndex + 1];
    const rkey = segments[profileIndex + 3];
    if (repo && rkey) return { repo: decodeURIComponent(repo), rkey };
  }

  // Unknown host with a path we did not recognise.
  if (!KNOWN_WEB_HOSTS.includes(host)) return null;
  return null;
}

export function isLikelyPostLink(input: string): boolean {
  return parsePostRef(input) !== null;
}

/** Builds the at:// URI for a post. `repo` must already be a DID. */
export function buildPostUri(did: string, rkey: string): AtUriString {
  const uri = `at://${did}/${POST_COLLECTION}/${rkey}`;
  if (!isAtUriString(uri)) throw new Error("That post link is not valid.");
  return uri;
}

/** Pulls the record key off the end of an at:// URI. */
export function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

export function didFromUri(uri: string): string {
  return uri.replace("at://", "").split("/")[0] ?? "";
}

/** The public bsky.app permalink for a post. */
export function webUrlForPost(handleOrDid: string, uri: string): string {
  return `https://bsky.app/profile/${handleOrDid}/post/${rkeyFromUri(uri)}`;
}
