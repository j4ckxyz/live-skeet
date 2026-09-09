import { Client } from "@atproto/lex";
import { extractPdsEndpoint } from "@atproto/lex-password-session";
import { api } from "@bsky/sdk";
import { app, com } from "@bsky/sdk/lexicons";

/** Unauthenticated client against the public Bluesky appview. */
export const publicClient = new Client(api.app.urlPublic);

export type ActorSuggestion = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

/** Handle suggestions for the login box, as you type. */
export async function suggestActors(
  query: string,
  signal?: AbortSignal,
): Promise<ActorSuggestion[]> {
  const term = query.trim().replace(/^@/, "");
  if (term.length < 2) return [];
  try {
    const res = await publicClient.call(
      app.bsky.actor.searchActorsTypeahead,
      { q: term, limit: 8 },
      { signal },
    );
    return res.actors.map((actor) => ({
      did: actor.did,
      handle: actor.handle,
      displayName: actor.displayName,
      avatar: actor.avatar,
    }));
  } catch {
    return [];
  }
}

export async function resolveHandleToDid(handle: string): Promise<string> {
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  if (clean.startsWith("did:")) return clean;
  const res = await publicClient.call(com.atproto.identity.resolveHandle, {
    handle: clean as `${string}.${string}`,
  });
  return res.did;
}

/** Fetches the DID document from the PLC directory or the did:web host. */
export async function fetchDidDoc(did: string): Promise<Record<string, unknown>> {
  let url: string;
  if (did.startsWith("did:plc:")) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length));
    url = `https://${host}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not read the DID document (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

export type ResolvedIdentity = {
  did: string;
  handle: string;
  pds: string;
};

/**
 * Turns a handle (or DID) into the DID plus the PDS it lives on, so we can log
 * in against the right server rather than assuming bsky.social.
 */
export async function resolveIdentity(input: string): Promise<ResolvedIdentity> {
  const did = await resolveHandleToDid(input);
  const doc = await fetchDidDoc(did);
  const pds = extractPdsEndpoint(doc as never);
  if (!pds) throw new Error("That account has no PDS listed in its DID document.");

  let handle = input.trim().replace(/^@/, "").toLowerCase();
  const alsoKnownAs = (doc as { alsoKnownAs?: string[] }).alsoKnownAs;
  const primary = alsoKnownAs?.find((entry) => entry.startsWith("at://"));
  if (primary) handle = primary.slice("at://".length);

  return { did, handle, pds };
}
