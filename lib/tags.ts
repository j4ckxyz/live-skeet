/** Bluesky allows at most eight tags on a post record. */
export const MAX_TAGS = 8;
/** Tag values are capped by the lexicon at 64 graphemes. */
export const MAX_TAG_LENGTH = 64;

const TAG_IN_TEXT = /(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;

/** Strips the leading hash and trims a tag to something postable. */
export function normaliseTag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

/** Case-insensitive key so "AtProto" and "atproto" count as one tag. */
export function tagKey(tag: string): string {
  return normaliseTag(tag).toLowerCase();
}

/** Every hashtag written into the visible text of a post. */
export function tagsInText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(TAG_IN_TEXT)) {
    const tag = normaliseTag(match[1]);
    if (tag) found.push(tag);
  }
  return dedupeTags(found);
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = normaliseTag(tag);
    if (!clean) continue;
    const key = tagKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Works out the `tags` field for a post record. Hidden tags are carried in the
 * record rather than the text, so they are indexed without cluttering the post.
 * Tags already written into the text are left out, since they are facets
 * already and would otherwise be counted twice.
 */
export function buildRecordTags(
  text: string,
  hiddenTags: string[],
): string[] | undefined {
  const inText = new Set(tagsInText(text).map(tagKey));
  const hidden = dedupeTags(hiddenTags).filter((tag) => !inText.has(tagKey(tag)));
  if (hidden.length === 0) return undefined;
  return hidden.slice(0, MAX_TAGS);
}

/** Ranks remembered tags, most recently used first, excluding ones in use. */
export function suggestTags(
  remembered: string[],
  alreadyUsed: string[],
  limit = 6,
): string[] {
  const used = new Set(alreadyUsed.map(tagKey));
  return remembered.filter((tag) => !used.has(tagKey(tag))).slice(0, limit);
}
