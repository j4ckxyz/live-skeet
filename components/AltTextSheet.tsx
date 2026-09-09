"use client";

import { useEffect, useRef } from "react";
import { ALT_TEXT_LIMIT } from "@/lib/altText";
import { type MediaItem, useThread } from "@/lib/store";
import { altTextConfigured } from "@/lib/altText";
import { useSettings } from "@/lib/settings";
import { CloseIcon, SparkIcon, SpinnerIcon } from "./icons";

type Props = {
  item: MediaItem;
  onClose: () => void;
};

export function AltTextSheet({ item, onClose }: Props) {
  const setAlt = useThread((state) => state.setAlt);
  const regenerate = useThread((state) => state.regenerateAlt);
  const settings = useSettings();
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (item.altStatus !== "generating") {
      const timer = setTimeout(() => textRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
  }, [item.altStatus]);

  const canGenerate = altTextConfigured(settings) && item.kind === "image";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ls-enter flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-bg sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
          <h2 className="text-[0.9rem] font-semibold">Alt text</h2>
          <button
            type="button"
            onClick={onClose}
            className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 overflow-hidden rounded-xl border border-line-soft bg-bg-sunken">
            {item.kind === "video" ? (
              <video
                src={item.previewUrl}
                controls
                className="max-h-[38svh] w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt=""
                className="max-h-[38svh] w-full object-contain"
              />
            )}
          </div>

          {item.altStatus === "generating" ? (
            <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] text-ink-muted">
              <SpinnerIcon className="size-3.5" /> Writing alt text
            </p>
          ) : null}
          {item.altStatus === "error" ? (
            <p className="mb-2 text-[0.78rem] text-danger">{item.altError}</p>
          ) : null}

          <textarea
            ref={textRef}
            value={item.alt}
            onChange={(event) => setAlt(item.id, event.target.value.slice(0, ALT_TEXT_LIMIT))}
            rows={5}
            placeholder="Describe the image for people who cannot see it."
            className="w-full resize-y rounded-xl border border-line bg-bg-raised p-2.5 text-[0.9rem] leading-relaxed outline-none placeholder:text-ink-faint focus:border-ink-muted"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            {canGenerate ? (
              <button
                type="button"
                onClick={() => void regenerate(item.id)}
                disabled={item.altStatus === "generating"}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[0.8rem] font-medium text-ink-muted hover:bg-bg-sunken disabled:opacity-40"
              >
                <SparkIcon /> Rewrite with AI
              </button>
            ) : (
              <span />
            )}
            <span className="text-[0.75rem] tabular-nums text-ink-faint">
              {item.alt.length} / {ALT_TEXT_LIMIT}
            </span>
          </div>
        </div>

        <footer className="border-t border-line-soft px-3 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="ls-press w-full rounded-full bg-accent px-4 py-2 text-[0.9rem] font-semibold text-on-accent hover:bg-accent-hover"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
