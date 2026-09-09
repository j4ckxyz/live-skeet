"use client";

import { useEffect, useMemo, useState } from "react";
import { type LocalPost, useThread } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { webUrlForPost } from "@/lib/aturi";
import {
  HeartIcon,
  LinkIcon,
  QuoteIcon,
  ReplyIcon,
  RepostIcon,
  SpinnerIcon,
  WarningIcon,
} from "./icons";

/** Re-renders on a slow tick so relative timestamps stay honest. */
function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function shortTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function ThreadList() {
  const posts = useThread((state) => state.posts);
  const loading = useThread((state) => state.loadingThread);
  const rootRef = useThread((state) => state.rootRef);
  const compact = useSettings((state) => state.compact);

  const now = useNow();

  // Newest first, so the post you just sent sits right under the composer.
  const ordered = useMemo(() => [...posts].reverse(), [posts]);

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[0.85rem] text-ink-muted">
        <SpinnerIcon className="size-4" /> Loading the thread
      </p>
    );
  }

  if (ordered.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[0.85rem] text-ink-faint">
        {rootRef
          ? "Nothing of yours in this thread yet."
          : "Nothing posted yet. Whatever you send first becomes the top of the thread."}
      </p>
    );
  }

  return (
    <ol>
      {ordered.map((post, index) => (
        <PostRow
          key={post.id}
          post={post}
          number={ordered.length - index}
          compact={compact}
          now={now}
        />
      ))}
    </ol>
  );
}

function PostRow({
  post,
  number,
  compact,
  now,
}: {
  post: LocalPost;
  number: number;
  compact: boolean;
  now: number;
}) {
  const profile = useThread((state) => state.profile);
  const retry = useThread((state) => state.retry);
  const discard = useThread((state) => state.discard);
  const removePost = useThread((state) => state.removePost);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const link =
    post.uri && profile ? webUrlForPost(profile.handle, post.uri) : null;

  return (
    <li
      className={`ls-enter ls-row border-b border-line-soft ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${
        post.status === "sending" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-baseline gap-1.5 text-[0.78rem] text-ink-faint">
        <span className="font-medium text-ink-muted tabular-nums">#{number}</span>
        <span aria-hidden>·</span>
        <span>{shortTime(post.createdAt, now)}</span>
        {post.status === "sending" ? (
          <span className="flex items-center gap-1 text-ink-muted">
            <SpinnerIcon className="size-3" /> sending
          </span>
        ) : null}
        <span className="flex-1" />
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="ls-tap ls-press rounded p-1 text-ink-faint hover:text-ink"
            aria-label="Open on Bluesky"
            title="Open on Bluesky"
          >
            <LinkIcon />
          </a>
        ) : null}
        {post.status === "sent" && post.deletable ? (
          confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void removePost(post.id)}
                className="text-[0.75rem] font-medium text-danger"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[0.75rem]"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[0.75rem] hover:text-danger"
            >
              Delete
            </button>
          )
        ) : null}
      </div>

      {post.text ? (
        <p
          className={`mt-0.5 whitespace-pre-wrap break-words ${
            compact ? "text-[0.87rem]" : "text-[0.95rem]"
          } leading-snug`}
        >
          {post.text}
        </p>
      ) : null}

      {post.previews.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {post.previews.map((preview, index) => (
            <span
              key={index}
              className="block size-14 overflow-hidden rounded-lg border border-line-soft bg-bg-sunken"
              title={preview.alt || "No alt text"}
            >
              {preview.kind === "video" ? (
                <video src={preview.url} className="size-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.alt}
                  className="size-full object-cover"
                />
              )}
            </span>
          ))}
        </div>
      ) : null}

      {post.status === "failed" ? (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-danger/10 px-2 py-1.5 text-[0.78rem] text-danger">
          <WarningIcon className="mt-0.5 size-3.5" />
          <span className="flex-1 break-words">{post.error}</span>
          <button
            type="button"
            onClick={() => retry(post.id)}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
          <button type="button" onClick={() => discard(post.id)} className="underline underline-offset-2">
            Discard
          </button>
        </div>
      ) : null}

      {post.status === "sent" ? (
        <div className="mt-1.5 flex items-center gap-3.5 text-[0.75rem] tabular-nums text-ink-faint">
          <Stat icon={<ReplyIcon />} value={post.stats.replies} label="replies" />
          <Stat icon={<RepostIcon />} value={post.stats.reposts} label="reposts" />
          <Stat icon={<HeartIcon />} value={post.stats.likes} label="likes" />
          <Stat icon={<QuoteIcon />} value={post.stats.quotes} label="quotes" />
        </div>
      ) : null}
    </li>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1" title={`${value} ${label}`}>
      {icon}
      {value > 0 ? value : ""}
    </span>
  );
}
