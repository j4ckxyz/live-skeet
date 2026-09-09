"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_GRAPHEMES,
  type MediaItem,
  graphemeCount,
  useThread,
} from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { AltTextSheet } from "./AltTextSheet";
import { CloseIcon, ImageIcon, SparkIcon, SpinnerIcon, WarningIcon } from "./icons";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Composer() {
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
  const warnMissingAlt = useSettings((state) => state.warnMissingAlt);
  const compact = useSettings((state) => state.compact);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openAltFor, setOpenAltFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sentTick, setSentTick] = useState(0);

  // The "send without alt text" confirmation is tied to the exact draft it was
  // raised for, so editing anything clears it without needing an effect.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  const count = useMemo(() => graphemeCount(draft.trim()), [draft]);
  const overLimit = count > MAX_GRAPHEMES;
  const empty = draft.trim().length === 0 && media.length === 0;
  const missingAlt = media.some((item) => item.alt.trim().length === 0);
  const draftSignature = `${draft}|${media.map((item) => `${item.id}:${item.alt}`).join(",")}`;
  const confirmNoAlt = confirmedFor === draftSignature;

  const focus = useCallback(() => {
    const node = textRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  // The composer is the whole point of this app, so it keeps the caret.
  useEffect(() => {
    focus();
  }, [focus, posts.length, rootRef?.uri]);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 260)}px`;
  }, [draft, compact]);

  const trySend = useCallback(() => {
    if (empty || overLimit) return;
    if (warnMissingAlt && missingAlt && !confirmNoAlt) {
      setConfirmedFor(draftSignature);
      return;
    }
    setConfirmedFor(null);
    send();
    setSentTick((tick) => tick + 1);
    requestAnimationFrame(focus);
  }, [
    empty,
    overLimit,
    warnMissingAlt,
    missingAlt,
    confirmNoAlt,
    draftSignature,
    send,
    focus,
  ]);

  // Paste images straight from the clipboard.
  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const openItem = media.find((item) => item.id === openAltFor);

  return (
    <div
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
      className={`border-b border-line bg-bg ${
        dragging ? "outline outline-2 -outline-offset-2 outline-ink-muted" : ""
      }`}
    >
      <span key={sentTick} className="ls-sent" aria-hidden />
      <div className={`flex gap-2.5 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
        {account?.did ? <ComposerAvatar /> : null}

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
            placeholder={rootRef ? "Add to the thread" : "Start the thread"}
            spellCheck
            className={`w-full resize-none bg-transparent leading-snug outline-none placeholder:text-ink-faint ${
              compact ? "text-[0.9rem]" : "text-[1rem]"
            }`}
          />

          {media.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
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

          {mediaError ? (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[0.78rem] text-danger">
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
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-bg-sunken px-2.5 py-1.5 text-[0.78rem] text-ink-muted">
              <WarningIcon className="size-3.5 text-danger" />
              <span className="flex-1">No alt text yet. Send anyway?</span>
              <button
                type="button"
                onClick={trySend}
                className="ls-press rounded-full bg-accent px-2.5 py-1 text-[0.75rem] font-semibold text-on-accent"
              >
                Send
              </button>
            </div>
          ) : null}

          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full p-1.5 text-ink hover:bg-accent/10"
              aria-label="Add images or a video"
              title="Add images or a video"
            >
              <ImageIcon />
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

            <span className="flex-1" />

            <span
              className={`text-[0.75rem] tabular-nums ${
                overLimit
                  ? "text-danger"
                  : count > MAX_GRAPHEMES - 40
                    ? "text-ink-muted"
                    : "text-ink-faint"
              }`}
            >
              {MAX_GRAPHEMES - count}
            </span>

            <button
              type="button"
              onClick={trySend}
              disabled={empty || overLimit}
              title={`${isMac ? "Cmd" : "Ctrl"} + Enter`}
              className="ls-press rounded-full bg-accent px-3.5 py-1.5 text-[0.85rem] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-35"
            >
              {rootRef ? "Reply" : "Post"}
            </button>
          </div>
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
  const size = compact ? "size-8" : "size-9";
  if (!profile?.avatar) {
    return <span className={`${size} shrink-0 rounded-full bg-bg-sunken`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar}
      alt=""
      className={`${size} shrink-0 rounded-full object-cover`}
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
        className={`absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wide ${
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
        <span className="pointer-events-none absolute bottom-1 right-1 truncate rounded bg-black/65 px-1 py-0.5 text-[0.6rem] text-white">
          {item.uploadLabel ?? "Uploading"}
        </span>
      ) : null}
      {item.uploadStatus === "error" ? (
        <span className="pointer-events-none absolute bottom-1 right-1 truncate rounded bg-danger px-1 py-0.5 text-[0.6rem] text-white">
          Failed
        </span>
      ) : null}
    </div>
  );
}

export function composerHint(): string {
  return `${isMac ? "Cmd" : "Ctrl"} + Enter to send`;
}
