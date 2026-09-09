"use client";

import { useState } from "react";
import { useThread } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { webUrlForPost } from "@/lib/aturi";
import { LinkIcon, PlusIcon, SettingsIcon, SpinnerIcon } from "./icons";

export function TopBar({
  onOpenSettings,
  onNewAside,
  onShowAside,
  asideCount,
}: {
  onOpenSettings: () => void;
  onNewAside: () => void;
  onShowAside: () => void;
  asideCount: number;
}) {
  const profile = useThread((state) => state.profile);
  const posts = useThread((state) => state.posts);
  const rootRef = useThread((state) => state.rootRef);
  const compact = useSettings((state) => state.compact);

  const sent = posts.filter((post) => post.status === "sent").length;

  return (
    <header
      className={`ls-safe-top flex items-center gap-2 border-b border-line bg-bg pb-1.5 ${
        compact ? "px-2.5" : "px-3 pb-2"
      }`}
    >
      {profile?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar}
          alt=""
          className="size-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="size-7 shrink-0 rounded-full bg-bg-sunken" />
      )}

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[0.85rem] font-semibold">
          {profile?.displayName || profile?.handle || "Live Skeet"}
        </p>
        <p className="truncate text-[0.75rem] text-ink-muted">
          @{profile?.handle}
          {rootRef ? (
            <span className="text-ink-faint">
              {" "}
              · {sent} {sent === 1 ? "post" : "posts"}
            </span>
          ) : null}
        </p>
      </div>

      {rootRef && profile ? (
        <a
          href={webUrlForPost(profile.handle, rootRef.uri)}
          target="_blank"
          rel="noreferrer"
          className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
          aria-label="Open the thread on Bluesky"
          title="Open the thread on Bluesky"
        >
          <LinkIcon className="size-[18px]" />
        </a>
      ) : null}

      {asideCount > 0 ? (
        <button
          type="button"
          onClick={onShowAside}
          className="ls-tap ls-press hidden rounded-full bg-bg-sunken px-2 py-1 text-[0.75rem] font-medium text-ink-muted max-[779px]:block"
          title="Posts on their own"
        >
          {asideCount} aside
        </button>
      ) : null}

      <button
        type="button"
        onClick={onNewAside}
        className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
        aria-label="Write a post on its own"
        title="Write a post on its own"
      >
        <PlusIcon />
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon />
      </button>
    </header>
  );
}

export function ThreadBar() {
  const rootRef = useThread((state) => state.rootRef);
  const attachThread = useThread((state) => state.attachThread);
  const startNewThread = useThread((state) => state.startNewThread);
  const leaveThread = useThread((state) => state.leaveThread);
  const loading = useThread((state) => state.loadingThread);
  const error = useThread((state) => state.threadError);
  const posts = useThread((state) => state.posts);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (rootRef) {
    return (
      <div className="flex items-center gap-2 border-b border-line-soft bg-bg-raised px-3 py-1.5 text-[0.78rem]">
        <span className="size-1.5 shrink-0 rounded-full bg-good" />
        <span className="min-w-0 flex-1 truncate text-ink-muted">
          Adding to your thread
        </span>
        <button
          type="button"
          onClick={() => {
            if (posts.length === 0) {
              leaveThread();
            } else {
              startNewThread();
            }
          }}
          className="shrink-0 font-medium font-medium text-ink underline-offset-2 hover:underline"
        >
          New thread
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-line-soft bg-bg-raised px-3 py-1.5 text-[0.78rem]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ink-muted">
          New thread
        </span>
        <button
          type="button"
          onClick={() => setOpen((state) => !state)}
          className="shrink-0 font-medium font-medium text-ink underline-offset-2 hover:underline"
        >
          {open ? "Cancel" : "Continue a thread"}
        </button>
      </div>

      {open ? (
        <form
          className="mt-1.5 flex gap-1.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            void attachThread(value);
          }}
        >
          <input
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (pasted) {
                event.preventDefault();
                setValue(pasted);
                void attachThread(pasted);
              }
            }}
            placeholder="https://bsky.app/profile/.../post/... or at://..."
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[0.8rem] outline-none placeholder:text-ink-faint focus:border-ink-muted"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-semibold text-on-accent disabled:opacity-40"
          >
            {loading ? <SpinnerIcon className="size-3.5" /> : null}
            Load
          </button>
        </form>
      ) : null}

      {error ? <p className="pb-1 text-[0.75rem] text-danger">{error}</p> : null}
    </div>
  );
}
