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
import { storedRootUri, useThread } from "@/lib/store";
import { SignIn } from "@/components/SignIn";
import { Composer, composerHint } from "@/components/Composer";
import { ThreadList } from "@/components/ThreadList";
import { SettingsSheet } from "@/components/SettingsSheet";
import { ThreadBar, TopBar } from "@/components/TopBar";
import { SpinnerIcon } from "@/components/icons";

export default function Page() {
  const account = useThread((state) => state.account);
  const setAccount = useThread((state) => state.setAccount);
  const attachThread = useThread((state) => state.attachThread);
  const poll = useThread((state) => state.poll);
  const lastPolledAt = useThread((state) => state.lastPolledAt);

  const theme = useSettings((state) => state.theme);
  const pollSeconds = useSettings((state) => state.pollSeconds);
  const compact = useSettings((state) => state.compact);

  const [restoring, setRestoring] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        setAccount(next, {
          did: next.did,
          handle: next.handle,
        });
      }
    },
    [setAccount],
  );

  // Bring back the previous session and thread on load.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
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

  // Refresh straight away when the window comes back into focus.
  useEffect(() => {
    if (!account) return;
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [account, poll]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  return (
    <div className="mx-auto flex h-full max-w-[38rem] flex-col border-line sm:border-x">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <ThreadBar />
      <Composer />

      <main className="ls-scroller min-h-0 flex-1 overflow-y-auto">
        <ThreadList />
      </main>

      <footer
        className={`ls-safe-bottom flex items-center gap-2 border-t border-line bg-bg px-3 pt-1.5 text-[0.7rem] text-ink-faint ${
          compact ? "pt-1" : ""
        }`}
      >
        <span>{composerHint()}</span>
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
    </div>
  );
}
