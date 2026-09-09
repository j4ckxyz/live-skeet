"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ActorSuggestion, resolveIdentity, suggestActors } from "@/lib/identity";
import { signIn } from "@/lib/bsky";
import { useSettings } from "@/lib/settings";
import { errorMessage } from "@/lib/store";
import { SpinnerIcon, WarningIcon } from "./icons";

type Props = {
  onSignedIn: (account: Awaited<ReturnType<typeof signIn>>) => void;
};

export function SignIn({ onSignedIn }: Props) {
  const remember = useSettings((state) => state.rememberSession);
  const setSettings = useSettings((state) => state.set);

  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState("");
  const [needsFactor, setNeedsFactor] = useState(false);
  const [suggestions, setSuggestions] = useState<ActorSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [showList, setShowList] = useState(false);
  const [pds, setPds] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleRef.current?.focus();
  }, []);

  // Typeahead against the public appview.
  useEffect(() => {
    const term = handle.trim().replace(/^@/, "");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (term.length < 2 || term.startsWith("did:")) {
        setSuggestions([]);
        return;
      }
      const results = await suggestActors(term, controller.signal);
      setSuggestions(results);
      setHighlighted(-1);
    }, 160);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [handle]);

  // Work out which server the account actually lives on.
  useEffect(() => {
    const term = handle.trim().replace(/^@/, "");
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPds(null);
      if (term.length < 4 || !term.includes(".")) return;
      setResolving(true);
      try {
        const identity = await resolveIdentity(term);
        if (!cancelled) setPds(identity.pds);
      } catch {
        if (!cancelled) setPds(null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  const choose = useCallback((suggestion: ActorSuggestion) => {
    setHandle(suggestion.handle);
    setShowList(false);
    setSuggestions([]);
    requestAnimationFrame(() => passwordRef.current?.focus());
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const account = await signIn({
        identifier: handle,
        password,
        authFactorToken: factor.trim() || undefined,
        remember,
      });
      onSignedIn(account);
    } catch (caught) {
      const message = errorMessage(caught);
      if (/factor|token required|AuthFactorTokenRequired/i.test(message)) {
        setNeedsFactor(true);
        setError("Enter the sign-in code Bluesky has emailed you.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const listOpen = showList && suggestions.length > 0;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-7 text-center">
          <h1 className="text-[1.6rem] font-bold tracking-tight">Live Skeet</h1>
          <p className="mt-1 text-[0.85rem] text-ink-muted">
            A stripped-back Bluesky client for posting a thread as it happens.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <label
              htmlFor="handle"
              className="mb-1.5 block text-[0.78rem] font-medium text-ink-muted"
            >
              Handle
            </label>
            <input
              id="handle"
              ref={handleRef}
              value={handle}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="you.bsky.social"
              onChange={(event) => {
                setHandle(event.target.value);
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 120)}
              onKeyDown={(event) => {
                if (!listOpen) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlighted((index) => (index + 1) % suggestions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlighted((index) =>
                    index <= 0 ? suggestions.length - 1 : index - 1,
                  );
                } else if (event.key === "Enter" && highlighted >= 0) {
                  event.preventDefault();
                  choose(suggestions[highlighted]);
                } else if (event.key === "Escape") {
                  setShowList(false);
                }
              }}
              className="w-full rounded-xl border border-line bg-bg-raised px-3 py-2.5 text-[0.95rem] outline-none placeholder:text-ink-faint focus:border-ink-muted"
            />

            {listOpen ? (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-bg shadow-lg shadow-black/10">
                {suggestions.map((suggestion, index) => (
                  <li key={suggestion.did}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(suggestion)}
                      onMouseEnter={() => setHighlighted(index)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                        index === highlighted ? "bg-bg-sunken" : ""
                      }`}
                    >
                      {suggestion.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={suggestion.avatar}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : (
                        <span className="size-7 rounded-full bg-bg-sunken" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[0.85rem] font-medium">
                          {suggestion.displayName || suggestion.handle}
                        </span>
                        <span className="block truncate text-[0.78rem] text-ink-muted">
                          @{suggestion.handle}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-1.5 flex h-4 items-center gap-1.5 text-[0.75rem] text-ink-faint">
              {resolving ? (
                <>
                  <SpinnerIcon className="size-3" /> Looking up your server
                </>
              ) : pds ? (
                <>Server: {new URL(pds).host}</>
              ) : null}
            </p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[0.78rem] font-medium text-ink-muted"
            >
              App password
            </label>
            <input
              id="password"
              ref={passwordRef}
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-line bg-bg-raised px-3 py-2.5 text-[0.95rem] outline-none placeholder:text-ink-faint focus:border-ink-muted"
            />
          </div>

          {needsFactor ? (
            <div>
              <label
                htmlFor="factor"
                className="mb-1.5 block text-[0.78rem] font-medium text-ink-muted"
              >
                Sign-in code
              </label>
              <input
                id="factor"
                value={factor}
                autoComplete="one-time-code"
                placeholder="XXXXX-XXXXX"
                onChange={(event) => setFactor(event.target.value)}
                className="w-full rounded-xl border border-line bg-bg-raised px-3 py-2.5 text-[0.95rem] outline-none placeholder:text-ink-faint focus:border-ink-muted"
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 pt-0.5 text-[0.8rem] text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setSettings({ rememberSession: event.target.checked })}
              className="size-4 accent-[color:var(--color-accent)]"
            />
            Stay signed in on this device
          </label>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
              <WarningIcon className="mt-0.5 size-3.5" />
              <span>{error}</span>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !handle.trim() || !password.trim()}
            className="ls-press flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[0.95rem] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? <SpinnerIcon className="size-4" /> : null}
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-line-soft bg-bg-raised p-3.5 text-[0.78rem] leading-relaxed text-ink-muted">
          <p className="mb-1.5 font-medium text-ink">Why an app password?</p>
          <p>
            Live Skeet has no backend. Everything runs in this browser tab and talks
            to your PDS directly, so there is no server to hold an OAuth session for
            you. An app password is the safe way to do that: it cannot change your
            email or password, and you can revoke it at any time.
          </p>
          <p className="mt-2">
            Create one under Settings, then Privacy and security, then App passwords in
            the Bluesky app, or at{" "}
            <a
              href="https://bsky.app/settings/app-passwords"
              target="_blank"
              rel="noreferrer"
              className="text-ink underline underline-offset-2"
            >
              bsky.app/settings/app-passwords
            </a>
            . It is kept in this browser only.
          </p>
        </div>
      </div>
    </div>
  );
}
