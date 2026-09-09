"use client";

import { useEffect } from "react";
import { modifierLabel } from "./Composer";
import { CloseIcon } from "./icons";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Anywhere",
    rows: [
      ["MOD + Enter", "Send the post or reply"],
      ["MOD + ↑ / ↓", "Move between posts in the current lane"],
      ["Alt + Enter", "Continue the thread under the selected post"],
      ["MOD + Shift + C", "Copy the link to the selected post"],
      ["MOD + Shift + N", "Switch between the thread and a post on its own"],
      ["MOD + ,", "Settings"],
      ["MOD + /", "This list"],
      ["Escape", "Clear the selection, or leave the composer"],
    ],
  },
  {
    title: "When the composer is not focused",
    rows: [
      ["J / ↓", "Next post"],
      ["K / ↑", "Previous post"],
      ["Enter", "Back to the composer"],
      ["R", "Continue the thread under the selected post"],
      ["C", "Copy the link to the selected post"],
      ["O", "Open the selected post on Bluesky"],
    ],
  },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mod = modifierLabel();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ls-enter flex max-h-[92svh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-line bg-bg sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
          <h2 className="text-[0.95rem] font-semibold">Keyboard</h2>
          <button
            type="button"
            onClick={onClose}
            className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="ls-scroller min-h-0 flex-1 space-y-5 overflow-y-auto p-3.5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.rows.map(([keys, description]) => (
                  <div key={keys} className="flex items-baseline gap-3">
                    <dt className="w-36 shrink-0 text-[0.78rem] font-medium tabular-nums">
                      {keys.replaceAll("MOD", mod)}
                    </dt>
                    <dd className="text-[0.82rem] text-ink-muted">{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
