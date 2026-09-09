"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_GRAPHEMES,
  type MediaItem,
  graphemeCount,
  useThread,
} from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { isLikelyPostLink } from "@/lib/aturi";
import { MAX_TAGS, normaliseTag, suggestTags, tagsInText } from "@/lib/tags";
import { AltTextSheet } from "./AltTextSheet";
import {
  BranchIcon,
  CloseIcon,
  ImageIcon,
  SparkIcon,
  SpinnerIcon,
  TagIcon,
  WarningIcon,
} from "./icons";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The bar under the thread. One line tall, growing downwards as you write. */
export function Composer() {
  const lane = useThread((state) => state.lane);
  // While the separate composer is open it owns the draft, so the bar behind it
  // shows nothing rather than mirroring what is being typed in the sheet.
  if (lane === "aside") return <RestingBar />;
  return <ComposerBody variant="inline" />;
}

function RestingBar() {
  const rootRef = useThread((state) => state.rootRef);
  const compact = useSettings((state) => state.compact);
  return (
    <div
      aria-hidden
      className={`flex items-start gap-2 border-t border-line bg-bg ${
        compact ? "px-2.5 py-1.5" : "px-3 py-2"
      }`}
    >
      <span className={`${compact ? "size-6" : "size-7"} mt-1 shrink-0 rounded-full bg-bg-sunken`} />
      <span
        className={`flex-1 py-1 leading-snug text-ink-faint ${
          compact ? "text-base" : "text-base"
        }`}
      >
        {rootRef ? "Add to the thread" : "Start the thread"}
      </span>
      <span className="mt-0.5 rounded-full bg-bg-sunken px-3 py-1.5 text-sm font-semibold text-ink-faint">
        {rootRef ? "Reply" : "Post"}
      </span>
    </div>
  );
}

/** The separate composer for a post that stands on its own. */
export function AsideComposerSheet() {
  const closeAside = useThread((state) => state.closeAside);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeAside();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeAside]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-start sm:p-4 sm:pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAside();
      }}
    >
      <div className="ls-enter flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-bg sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
          <h2 className="text-lg font-semibold">A post on its own</h2>
          <button
            type="button"
            onClick={closeAside}
            className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
            aria-label="Close without posting"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="ls-scroller min-h-0 flex-1 overflow-y-auto">
          <ComposerBody variant="sheet" />
        </div>
      </div>
    </div>
  );
}

function ComposerBody({ variant }: { variant: "inline" | "sheet" }) {
  const draft = useThread((state) => state.draft);
  const media = useThread((state) => state.media);
  const setDraft = useThread((state) => state.setDraft);
  const addFiles = useThread((state) => state.addFiles);
  const removeMedia = useThread((state) => state.removeMedia);
  const mediaError = useThread((state) => state.mediaError);
  const clearMediaError = useThread((state) => state.clearMediaError);
  const send = useThread((state) => state.send);
  const account = useThread((state) => state.account);
  const rootRef = useThread((state) => state.rootRef);
  const posts = useThread((state) => state.posts);
  const lane = useThread((state) => state.lane);
  const replyToId = useThread((state) => state.replyToId);
  const setReplyTo = useThread((state) => state.setReplyTo);
  const quote = useThread((state) => state.quote);
  const quoteLoading = useThread((state) => state.quoteLoading);
  const setQuoteFrom = useThread((state) => state.setQuoteFrom);
  const clearQuote = useThread((state) => state.clearQuote);
  const draftTags = useThread((state) => state.draftTags);
  const threadTags = useThread((state) => state.threadTags);
  const knownTags = useThread((state) => state.knownTags);
  const addDraftTag = useThread((state) => state.addDraftTag);
  const removeDraftTag = useThread((state) => state.removeDraftTag);

  const warnMissingAlt = useSettings((state) => state.warnMissingAlt);
  const compact = useSettings((state) => state.compact);

  const rootNode = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [openAltFor, setOpenAltFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sentTick, setSentTick] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  const count = useMemo(() => graphemeCount(draft.trim()), [draft]);
  const overLimit = count > MAX_GRAPHEMES;
  const empty = draft.trim().length === 0 && media.length === 0 && !quote;
  const missingAlt = media.some((item) => item.alt.trim().length === 0);
  const draftSignature = `${draft}|${media.map((item) => `${item.id}:${item.alt}`).join(",")}`;
  const confirmNoAlt = confirmedFor === draftSignature;

  const activeTags = useMemo(
    () => [...tagsInText(draft), ...draftTags, ...(lane === "thread" ? threadTags : [])],
    [draft, draftTags, threadTags, lane],
  );
  const suggestions = useMemo(
    () => suggestTags(knownTags, activeTags, 5),
    [knownTags, activeTags],
  );

  const replyTarget = posts.find((post) => post.id === replyToId);
  const replyNumber = replyTarget ? posts.indexOf(replyTarget) + 1 : null;

  const focus = useCallback(() => {
    const node = textRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  useEffect(() => {
    if (variant === "sheet") requestAnimationFrame(focus);
  }, [focus, variant]);

  // After a post goes out the caret belongs back in the box.
  useEffect(() => {
    if (variant === "inline") focus();
  }, [focus, variant, posts.length, rootRef?.uri]);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, variant === "sheet" ? 320 : 220)}px`;
  }, [draft, compact, variant]);

  const trySend = useCallback(() => {
    if (empty || overLimit) return;
    if (warnMissingAlt && missingAlt && !confirmNoAlt) {
      setConfirmedFor(draftSignature);
      return;
    }
    setConfirmedFor(null);
    send();
    setSentTick((tick) => tick + 1);
    setTagsOpen(false);
    if (variant === "inline") requestAnimationFrame(focus);
  }, [
    empty,
    overLimit,
    warnMissingAlt,
    missingAlt,
    confirmNoAlt,
    draftSignature,
    send,
    focus,
    variant,
  ]);

  // Pasting a post link attaches it as a quote rather than dumping a URL.
  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
        return;
      }
      const text = event.clipboardData.getData("text").trim();
      if (!quote && isLikelyPostLink(text)) {
        event.preventDefault();
        void setQuoteFrom(text);
      }
    },
    [addFiles, quote, setQuoteFrom],
  );

  function commitTag(value: string) {
    const tag = normaliseTag(value);
    if (!tag) return;
    addDraftTag(tag);
    setTagInput("");
  }

  const openItem = media.find((item) => item.id === openAltFor);
  const sendLabel = lane === "aside" ? "Post" : rootRef ? "Reply" : "Post";
  const placeholder =
    lane === "aside"
      ? "Say something on its own"
      : replyTarget
        ? `Continue under post #${replyNumber}`
        : rootRef
          ? "Add to the thread"
          : "Start the thread";

  return (
    <div
      ref={rootNode}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) void addFiles(files);
      }}
      className={`bg-bg ${variant === "inline" ? "border-t border-line" : ""} ${
        dragging ? "outline outline-2 -outline-offset-2 outline-ink-muted" : ""
      }`}
    >
      {variant === "inline" ? (
        <span key={sentTick} className="ls-sent" aria-hidden />
      ) : null}

      {lane === "thread" && replyTarget ? (
        <div className="flex items-center gap-1.5 px-3 pt-1.5 text-xs text-ink-muted">
          <BranchIcon className="size-3" />
          <span className="truncate">Continuing under post #{replyNumber}</span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="ls-tap ls-press rounded p-0.5 hover:text-ink"
            aria-label="Back to the end of the thread"
          >
            <CloseIcon className="size-3" />
          </button>
        </div>
      ) : null}

      <div
        className={`gap-2 ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} ${
          variant === "sheet" ? "flex flex-col" : "flex items-start"
        }`}
      >
        {account?.did && variant === "inline" ? <ComposerAvatar /> : null}

        <div className="min-w-0 flex-1">
          <textarea
            ref={textRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                trySend();
              }
            }}
            rows={1}
            placeholder={placeholder}
            spellCheck
            className={`ls-composer-input block w-full resize-none bg-transparent py-1 leading-snug outline-none placeholder:text-ink-faint ${
              compact ? "text-base" : "text-base"
            }`}
          />

          {quoteLoading ? (
            <p className="mb-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <SpinnerIcon className="size-3.5" /> Loading the quoted post
            </p>
          ) : null}

          {quote ? (
            <div className="mb-1.5 flex gap-2 rounded-lg border border-line px-2 py-1.5">
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">
                  {quote.displayName || quote.handle}{" "}
                  <span className="font-normal text-ink-muted">@{quote.handle}</span>
                </p>
                <p className="line-clamp-3 text-ink-muted">{quote.text}</p>
              </div>
              <button
                type="button"
                onClick={clearQuote}
                className="ls-tap ls-press self-start p-0.5 text-ink-faint hover:text-ink"
                aria-label="Remove the quoted post"
              >
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          ) : null}

          {media.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {media.map((item) => (
                <MediaThumb
                  key={item.id}
                  item={item}
                  onOpen={() => setOpenAltFor(item.id)}
                  onRemove={() => removeMedia(item.id)}
                />
              ))}
            </div>
          ) : null}

          {tagsOpen ? (
            <div className="mb-1.5 rounded-lg border border-line px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {draftTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeDraftTag(tag)}
                    className="ls-press flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-xs"
                    title="Remove"
                  >
                    #{tag}
                    <CloseIcon className="size-2.5" />
                  </button>
                ))}
                <input
                  ref={tagRef}
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === "," ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      commitTag(tagInput);
                    } else if (
                      event.key === "Backspace" &&
                      !tagInput &&
                      draftTags.length
                    ) {
                      removeDraftTag(draftTags[draftTags.length - 1]);
                    } else if (event.key === "Escape") {
                      setTagsOpen(false);
                      focus();
                    }
                  }}
                  placeholder={
                    draftTags.length >= MAX_TAGS
                      ? "Eight is the limit"
                      : "Hidden hashtag"
                  }
                  disabled={draftTags.length >= MAX_TAGS}
                  className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-ink-faint"
                />
              </div>
              {lane === "thread" && threadTags.length > 0 ? (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-faint">
                  On every post in this thread:
                  {threadTags.map((tag) => (
                    <span key={tag} className="rounded bg-bg-sunken px-1.5 py-0.5">
                      #{tag}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Suggestions only earn their line once there is something to tag. */}
          {!empty && suggestions.length > 0 ? (
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <span className="sr-only">Hashtags you have used before:</span>
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addDraftTag(tag)}
                  className="ls-press rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted hover:bg-bg-sunken hover:text-ink"
                  aria-label={`Add ${tag} as a hidden hashtag`}
                  title="Used before. Adds it as a hidden hashtag."
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}

          {mediaError ? (
            <div className="mb-1.5 flex items-start gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-sm text-danger">
              <WarningIcon className="mt-0.5 size-3.5" />
              <span className="flex-1">{mediaError}</span>
              <button
                type="button"
                onClick={clearMediaError}
                aria-label="Dismiss"
                className="p-0.5"
              >
                <CloseIcon className="size-3" />
              </button>
            </div>
          ) : null}

          {confirmNoAlt ? (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-bg-sunken px-2.5 py-1.5 text-sm text-ink-muted">
              <WarningIcon className="size-3.5 text-danger" />
              <span className="flex-1">No alt text yet. Send anyway?</span>
              <button
                type="button"
                onClick={trySend}
                className="ls-press rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent"
              >
                Send
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`flex shrink-0 items-center gap-0.5 ${
            variant === "sheet" ? "justify-end" : "self-end pb-0.5"
          }`}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ls-tap ls-press rounded-full p-1.5 text-ink-faint hover:bg-bg-sunken hover:text-ink"
            aria-label="Add images or a video"
            title="Add images or a video"
          >
            <ImageIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              setTagsOpen((state) => !state);
              if (!tagsOpen) requestAnimationFrame(() => tagRef.current?.focus());
            }}
            className={`ls-tap ls-press flex items-center gap-0.5 rounded-full p-1.5 text-xs font-medium hover:bg-bg-sunken hover:text-ink ${
              draftTags.length > 0 ? "text-ink" : "text-ink-faint"
            }`}
            aria-label="Hidden hashtags"
            title="Hidden hashtags"
          >
            <TagIcon className="size-[18px]" />
            {draftTags.length > 0 ? draftTags.length : null}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm,video/mpeg"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void addFiles(files);
              event.target.value = "";
            }}
          />

          {count > 0 ? (
            <span
              className={`px-1 text-xs tabular-nums ${
                overLimit
                  ? "text-danger"
                  : count > MAX_GRAPHEMES - 40
                    ? "text-ink-muted"
                    : "text-ink-faint"
              }`}
            >
              {MAX_GRAPHEMES - count}
            </span>
          ) : null}

          <button
            type="button"
            onClick={trySend}
            disabled={empty || overLimit}
            title={`${isMac ? "Cmd" : "Ctrl"} + Enter`}
            className="ls-press ml-0.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:bg-bg-sunken disabled:text-ink-faint"
          >
            {sendLabel}
          </button>
        </div>
      </div>

      {openItem ? (
        <AltTextSheet
          item={openItem}
          onClose={() => {
            setOpenAltFor(null);
            requestAnimationFrame(focus);
          }}
        />
      ) : null}
    </div>
  );
}

function ComposerAvatar() {
  const profile = useThread((state) => state.profile);
  const compact = useSettings((state) => state.compact);
  const size = compact ? "size-6" : "size-7";
  // Sits beside the first line of the box rather than drifting to the bottom.
  if (!profile?.avatar) {
    return <span className={`${size} mt-1 shrink-0 rounded-full bg-bg-sunken`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar}
      alt=""
      className={`${size} mt-1 shrink-0 rounded-full object-cover`}
    />
  );
}

function MediaThumb({
  item,
  onOpen,
  onRemove,
}: {
  item: MediaItem;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const hasAlt = item.alt.trim().length > 0;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="block size-[74px] overflow-hidden rounded-lg border border-line-soft bg-bg-sunken"
        aria-label="Open alt text"
      >
        {item.kind === "video" ? (
          <video src={item.previewUrl} className="size-full object-cover" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
        )}
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="ls-press absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white backdrop-blur-sm"
        aria-label="Remove"
      >
        <CloseIcon className="size-3" />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className={`absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-bold tracking-wide ${
          hasAlt ? "bg-black/70 text-white" : "bg-danger text-white"
        }`}
      >
        {item.altStatus === "generating" ? (
          <SpinnerIcon className="size-2.5" />
        ) : hasAlt && item.altStatus === "ready" ? (
          <SparkIcon className="size-2.5" />
        ) : null}
        ALT
      </button>

      {item.uploadStatus === "uploading" ? (
        <span className="pointer-events-none absolute bottom-1 right-1 truncate rounded bg-black/65 px-1 py-0.5 text-2xs text-white">
          {item.uploadLabel ?? "Uploading"}
        </span>
      ) : null}
      {item.uploadStatus === "error" ? (
        <span className="pointer-events-none absolute bottom-1 right-1 truncate rounded bg-danger px-1 py-0.5 text-2xs text-white">
          Failed
        </span>
      ) : null}
    </div>
  );
}

export function composerHint(): string {
  return `${isMac ? "Cmd" : "Ctrl"} + Enter to send`;
}

export function modifierLabel(): string {
  return isMac ? "Cmd" : "Ctrl";
}
