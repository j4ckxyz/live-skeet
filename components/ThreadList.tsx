"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Lane, type LocalPost, useThread } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { webUrlForPost } from "@/lib/aturi";
import {
  BranchIcon,
  CopyIcon,
  HeartIcon,
  LinkIcon,
  QuoteIcon,
  ReplyIcon,
  RepostIcon,
  SpinnerIcon,
  TagIcon,
  WarningIcon,
} from "./icons";

function shortTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Re-renders on a slow tick so relative timestamps stay honest. */
function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ThreadList({ lane = "thread" }: { lane?: Lane }) {
  const posts = useThread((state) => (lane === "aside" ? state.aside : state.posts));
  const loading = useThread((state) => state.loadingThread);
  const rootRef = useThread((state) => state.rootRef);
  const compact = useSettings((state) => state.compact);
  const now = useNow();

  // Oldest first, so the thread reads downwards and the newest post sits
  // directly above the composer.
  const ordered = useMemo(() => posts, [posts]);

  if (lane === "thread" && loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[0.85rem] text-ink-muted">
        <SpinnerIcon className="size-4" /> Loading the thread
      </p>
    );
  }

  if (ordered.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[0.85rem] text-ink-faint">
        {lane === "aside"
          ? "Standalone posts from this session collect here."
          : rootRef
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
          number={index + 1}
          isTip={index === ordered.length - 1}
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
  isTip,
  compact,
  now,
}: {
  post: LocalPost;
  number: number;
  isTip: boolean;
  compact: boolean;
  now: number;
}) {
  const profile = useThread((state) => state.profile);
  const retry = useThread((state) => state.retry);
  const discard = useThread((state) => state.discard);
  const removePost = useThread((state) => state.removePost);
  const selectPost = useThread((state) => state.selectPost);
  const setReplyTo = useThread((state) => state.setReplyTo);
  const selected = useThread((state) => state.selectedId === post.id);
  const replyTarget = useThread((state) => state.replyToId === post.id);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  const link = post.uri && profile ? webUrlForPost(profile.handle, post.uri) : null;

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be refused; the link is still on screen.
    }
  }

  return (
    <li
      ref={ref}
      onClick={() => selectPost(post.id)}
      className={`ls-enter ls-row group/post border-b border-line-soft ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      } ${post.status === "sending" ? "opacity-60" : ""} ${
        selected ? "bg-bg-raised" : ""
      } ${replyTarget ? "border-l-2 border-l-ink" : ""}`}
    >
      <div className="flex items-baseline gap-1.5 text-[0.78rem] text-ink-faint">
        {post.lane === "thread" ? (
          <>
            <span className="font-medium tabular-nums text-ink-muted">
              #{number}
            </span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span>{shortTime(post.createdAt, now)}</span>
        {post.status === "sending" ? (
          <span className="flex items-center gap-1 text-ink-muted">
            <SpinnerIcon className="size-3" /> sending
          </span>
        ) : null}
        <span className="flex-1" />

        {link ? (
          <button
            type="button"
            onClick={copyLink}
            className={`ls-tap ls-press rounded p-1 text-ink-faint hover:text-ink ${
              selected ? "" : "opacity-0 group-hover/post:opacity-100 group-focus-within/post:opacity-100"
            }`}
            aria-label="Copy the link to this post"
            title="Copy link"
          >
            {copied ? (
              <span className="text-[0.7rem] font-medium text-ink">Copied</span>
            ) : (
              <CopyIcon />
            )}
          </button>
        ) : null}

        {post.lane === "thread" && post.status === "sent" && !isTip ? (
          <button
            type="button"
            onClick={() => setReplyTo(replyTarget ? null : post.id)}
            className={`ls-tap ls-press rounded p-1 ${
              replyTarget
                ? "text-ink"
                : "text-ink-faint opacity-0 hover:text-ink group-hover/post:opacity-100 group-focus-within/post:opacity-100"
            } ${selected ? "opacity-100" : ""}`}
            title={
              replyTarget
                ? "Back to the end of the thread"
                : "Add the next post under this one"
            }
            aria-label="Add the next post under this one"
          >
            <BranchIcon />
          </button>
        ) : null}

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className={`ls-tap ls-press rounded p-1 text-ink-faint hover:text-ink ${
              selected ? "" : "opacity-0 group-hover/post:opacity-100 group-focus-within/post:opacity-100"
            }`}
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
              className={`text-[0.75rem] hover:text-danger ${
                selected ? "" : "opacity-0 group-hover/post:opacity-100 group-focus-within/post:opacity-100"
              }`}
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

      {post.quote ? (
        <div className="mt-1.5 rounded-lg border border-line-soft px-2 py-1.5 text-[0.78rem] text-ink-muted">
          <span className="font-medium text-ink">@{post.quote.handle}</span>{" "}
          <span className="line-clamp-2">{post.quote.text}</span>
        </div>
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

      {post.tags.length > 0 ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[0.72rem] text-ink-faint">
          <TagIcon className="size-3" />
          {post.tags.map((tag) => (
            <span key={tag} className="rounded bg-bg-sunken px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </p>
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
          <button
            type="button"
            onClick={() => discard(post.id)}
            className="underline underline-offset-2"
          >
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
