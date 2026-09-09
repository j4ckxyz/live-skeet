"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Account,
  clearStoredSession,
  fetchProfile,
  loadStoredSession,
  resumeSession,
} from "@/lib/bsky";
import { applyTheme, useSettings } from "@/lib/settings";
import { loadLocalState, storedRootUri, useThread } from "@/lib/store";
import { webUrlForPost } from "@/lib/aturi";
import { SignIn } from "@/components/SignIn";
import {
  AsideComposerSheet,
  Composer,
  composerHint,
} from "@/components/Composer";
import { ThreadList } from "@/components/ThreadList";
import { SettingsSheet } from "@/components/SettingsSheet";
import { ShortcutsSheet } from "@/components/ShortcutsSheet";
import { ThreadBar, TopBar } from "@/components/TopBar";
import { KeyboardIcon, SpinnerIcon } from "@/components/icons";

/** True when the user is typing, so single-letter shortcuts stay out of the way. */
function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable;
}

export default function Page() {
  const account = useThread((state) => state.account);
  const setAccount = useThread((state) => state.setAccount);
  const attachThread = useThread((state) => state.attachThread);
  const poll = useThread((state) => state.poll);
  const lastPolledAt = useThread((state) => state.lastPolledAt);
  const aside = useThread((state) => state.aside);
  const lane = useThread((state) => state.lane);
  const openAside = useThread((state) => state.openAside);
  const closeAside = useThread((state) => state.closeAside);
  const moveSelection = useThread((state) => state.moveSelection);
  const selectPost = useThread((state) => state.selectPost);
  const replyToSelected = useThread((state) => state.replyToSelected);
  const setReplyTo = useThread((state) => state.setReplyTo);

  const theme = useSettings((state) => state.theme);
  const pollSeconds = useSettings((state) => state.pollSeconds);
  const compact = useSettings((state) => state.compact);

  const threadRef = useRef<HTMLElement>(null);
  const stuckToBottom = useRef(true);
  const [laneView, setLaneView] = useState<"thread" | "aside">("thread");
  const [restoring, setRestoring] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const restored = useRef(false);

  // Theme follows the OS unless it has been overridden in settings.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  const adopt = useCallback(
    async (next: Account) => {
      setAccount(next, null);
      try {
        const profile = await fetchProfile(next);
        setAccount(next, profile);
      } catch {
        setAccount(next, { did: next.did, handle: next.handle });
      }
    },
    [setAccount],
  );

  // Bring back the previous session, thread, tags and aside lane on load.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    useThread.setState(loadLocalState());
    void (async () => {
      try {
        const stored = loadStoredSession();
        if (!stored) return;
        const next = await resumeSession(stored);
        await adopt(next);
        const root = storedRootUri();
        if (root) await attachThread(root);
      } catch {
        clearStoredSession();
      } finally {
        setRestoring(false);
      }
    })();
  }, [adopt, attachThread]);

  // Engagement refresh.
  useEffect(() => {
    if (!account || pollSeconds <= 0) return;
    const id = setInterval(() => void poll(), pollSeconds * 1000);
    return () => clearInterval(id);
  }, [account, pollSeconds, poll]);

  useEffect(() => {
    if (!account) return;
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [account, poll]);

  const copySelected = useCallback(async () => {
    const state = useThread.getState();
    const post =
      state.posts.find((entry) => entry.id === state.selectedId) ??
      state.aside.find((entry) => entry.id === state.selectedId);
    if (!post?.uri || !state.profile) return;
    try {
      await navigator.clipboard.writeText(
        webUrlForPost(state.profile.handle, post.uri),
      );
    } catch {
      // Clipboard access can be refused; nothing else to do.
    }
  }, []);

  const openSelected = useCallback(() => {
    const state = useThread.getState();
    const post =
      state.posts.find((entry) => entry.id === state.selectedId) ??
      state.aside.find((entry) => entry.id === state.selectedId);
    if (!post?.uri || !state.profile) return;
    window.open(webUrlForPost(state.profile.handle, post.uri), "_blank", "noreferrer");
  }, []);

  const focusComposer = useCallback(() => {
    document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, []);

  // The newest post should stay in view just above the composer, unless the
  // reader has deliberately scrolled back up the thread.
  const threadCount = useThread((state) => state.posts.length);
  const threadLoading = useThread((state) => state.loadingThread);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      stuckToBottom.current = distance < 160;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || !stuckToBottom.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [threadCount]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || threadLoading) return;
    stuckToBottom.current = true;
    node.scrollTop = node.scrollHeight;
  }, [threadLoading]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const typing = isTyping(event.target);

      if (mod && event.key === ",") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }
      if (mod && event.key === "/") {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (useThread.getState().lane === "aside") closeAside();
        else openAside();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelected();
        return;
      }
      if (mod && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        moveSelection(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.altKey && event.key === "Enter") {
        event.preventDefault();
        replyToSelected();
        focusComposer();
        return;
      }
      if (event.key === "Escape") {
        const state = useThread.getState();
        if (state.lane === "aside") {
          return; // The separate composer handles its own dismissal.
        }
        if (typing) {
          (event.target as HTMLElement).blur();
        } else if (state.selectedId) {
          selectPost(null);
        } else if (state.replyToId) {
          setReplyTo(null);
        }
        return;
      }

      if (typing || mod || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case "j":
          event.preventDefault();
          moveSelection(1);
          break;
        case "k":
          event.preventDefault();
          moveSelection(-1);
          break;
        case "arrowdown":
          event.preventDefault();
          moveSelection(1);
          break;
        case "arrowup":
          event.preventDefault();
          moveSelection(-1);
          break;
        case "enter":
          event.preventDefault();
          focusComposer();
          break;
        case "r":
          event.preventDefault();
          replyToSelected();
          focusComposer();
          break;
        case "c":
          event.preventDefault();
          void copySelected();
          break;
        case "o":
          event.preventDefault();
          openSelected();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copySelected,
    focusComposer,
    moveSelection,
    openSelected,
    replyToSelected,
    selectPost,
    openAside,
    closeAside,
    setReplyTo,
  ]);

  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center text-ink-muted">
        <SpinnerIcon className="size-5" />
      </div>
    );
  }

  if (!account) {
    return <SignIn onSignedIn={(next) => void adopt(next)} />;
  }

  const showAside = aside.length > 0;

  return (
    <div
      className={`mx-auto flex h-full flex-col border-line sm:border-x ${
        showAside ? "max-w-[62rem]" : "max-w-[38rem]"
      }`}
    >
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onNewAside={openAside}
        onShowAside={() => setLaneView("aside")}
        asideCount={aside.length}
      />
      <ThreadBar />

      <div className="ls-lanes min-h-0 flex-1" data-lane={laneView}>
        <main ref={threadRef} className="ls-scroller ls-tail min-h-0 overflow-y-auto">
          <ThreadList lane="thread" />
        </main>

        {showAside ? <AsideLane onShowThread={() => setLaneView("thread")} /> : null}
      </div>

      <Composer />

      {lane === "aside" ? <AsideComposerSheet /> : null}

      <LiveStatus />

      <footer
        className={`ls-safe-bottom flex items-center gap-2 border-t border-line bg-bg px-3 pt-1.5 text-xs text-ink-faint ${
          compact ? "pt-1" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="ls-tap ls-press flex items-center gap-1 hover:text-ink"
          title="Keyboard shortcuts"
        >
          <KeyboardIcon className="size-3.5" />
          {composerHint()}
        </button>
        <span className="flex-1" />
        {lastPolledAt ? (
          <span>
            Stats updated{" "}
            {new Date(lastPolledAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        ) : null}
      </footer>

      {settingsOpen ? (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => {
            clearStoredSession();
            setAccount(null, null);
            setSettingsOpen(false);
          }}
        />
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * Sending happens behind the composer, so screen reader users get told about it
 * rather than having to go looking.
 */
function LiveStatus() {
  const posts = useThread((state) => state.posts);
  const aside = useThread((state) => state.aside);
  const [seen, setSeen] = useState<Map<string, string>>(() => new Map());
  const [message, setMessage] = useState("");

  // Derived during render rather than in an effect, so the announcement lands
  // in the same paint as the change it describes.
  const all = [...posts, ...aside];
  let announcement = "";
  let changed = false;
  for (const post of all) {
    const was = seen.get(post.id);
    if (was === post.status) continue;
    changed = true;
    if (was === "sending" && post.status === "sent") announcement = "Posted.";
    if (was === "sending" && post.status === "failed") {
      announcement = `Post failed. ${post.error ?? ""}`.trim();
    }
  }
  if (changed) {
    setSeen(new Map(all.map((post) => [post.id, post.status])));
    if (announcement) setMessage(announcement);
  }

  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

function AsideLane({
  onShowThread,
}: {
  onShowThread: () => void;
}) {
  const count = useThread((state) => state.aside.length);
  const clearAside = useThread((state) => state.clearAside);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  return (
    <aside className="ls-aside flex min-h-0 flex-col border-line">
      <div className="flex items-center gap-2 border-b border-line-soft bg-bg-raised px-3 py-1.5 text-xs">
        <button
          type="button"
          onClick={onShowThread}
          className="ls-tap ls-press hidden text-ink-muted hover:text-ink max-[779px]:block"
        >
          Back to the thread
        </button>
        <span className="flex-1 truncate text-ink-muted max-[779px]:hidden">
          On their own · {count} {count === 1 ? "post" : "posts"}
        </span>
        {count > 0 ? (
          <button
            type="button"
            onClick={clearAside}
            className="ls-tap ls-press rounded font-medium text-ink-muted hover:text-ink"
            title="Clear this lane. The posts stay on Bluesky."
          >
            Clear
          </button>
        ) : null}
      </div>
      <div ref={scroller} className="ls-scroller ls-tail min-h-0 flex-1 overflow-y-auto">
        <ThreadList lane="aside" />
      </div>
    </aside>
  );
}
