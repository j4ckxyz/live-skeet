"use client";

import { useEffect, useState } from "react";
import { applyTheme, useSettings, type ThemeChoice } from "@/lib/settings";
import { useThread } from "@/lib/store";
import { MAX_TAGS, normaliseTag } from "@/lib/tags";
import { CloseIcon } from "./icons";

type Props = {
  onClose: () => void;
  onSignOut: () => void;
};

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsSheet({ onClose, onSignOut }: Props) {
  const settings = useSettings();
  const set = useSettings((state) => state.set);
  const account = useThread((state) => state.account);
  const profile = useThread((state) => state.profile);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ls-enter flex max-h-[94svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-bg sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
          <h2 className="text-[0.95rem] font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="ls-tap ls-press rounded-full p-1.5 text-ink-muted hover:bg-bg-sunken"
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3.5">
          <Section title="Appearance">
            <Field label="Theme">
              <div className="flex gap-1 rounded-full bg-bg-sunken p-1">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => {
                      set({ theme: theme.value });
                      applyTheme(theme.value);
                    }}
                    className={`flex-1 rounded-full px-3 py-1.5 text-[0.82rem] font-medium transition-colors ${
                      settings.theme === theme.value
                        ? "bg-bg text-ink shadow-sm"
                        : "text-ink-muted"
                    }`}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </Field>

            <Toggle
              label="Compact layout"
              hint="Tighter spacing, better for a narrow split-screen window."
              checked={settings.compact}
              onChange={(compact) => set({ compact })}
            />
          </Section>

          <Section title="Posting">
            <Field
              label="Post language"
              hint="Written onto each post as its language tag."
            >
              <input
                value={settings.postLanguage}
                onChange={(event) => set({ postLanguage: event.target.value })}
                placeholder="en-GB"
                className={inputClass}
              />
            </Field>

            <Field
              label="Refresh engagement every"
              hint="How often likes, reposts and replies are re-read."
            >
              <select
                value={settings.pollSeconds}
                onChange={(event) => set({ pollSeconds: Number(event.target.value) })}
                className={inputClass}
              >
                <option value={10}>10 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={0}>Never</option>
              </select>
            </Field>

            <Toggle
              label="Ask before posting without alt text"
              checked={settings.warnMissingAlt}
              onChange={(warnMissingAlt) => set({ warnMissingAlt })}
            />
            <Toggle
              label="Shrink large images before upload"
              hint="Keeps sending quick and stays under the size limit."
              checked={settings.compressImages}
              onChange={(compressImages) => set({ compressImages })}
            />
          </Section>

          <Section title="Hidden hashtags">
            <ThreadTagEditor />
          </Section>

          <Section title="Alt text">
            <Toggle
              label="Write alt text automatically"
              hint="Runs as soon as an image is added, before you send."
              checked={settings.altTextEnabled}
              onChange={(altTextEnabled) => set({ altTextEnabled })}
            />

            {settings.altTextEnabled ? (
              <>
                <Field label="Provider">
                  <div className="flex gap-1 rounded-full bg-bg-sunken p-1">
                    {(["openrouter", "custom"] as const).map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => set({ altProvider: provider })}
                        className={`flex-1 rounded-full px-3 py-1.5 text-[0.82rem] font-medium ${
                          settings.altProvider === provider
                            ? "bg-bg text-ink shadow-sm"
                            : "text-ink-muted"
                        }`}
                      >
                        {provider === "openrouter" ? "OpenRouter" : "Custom endpoint"}
                      </button>
                    ))}
                  </div>
                </Field>

                {settings.altProvider === "openrouter" ? (
                  <>
                    <Field label="OpenRouter API key">
                      <input
                        type="password"
                        value={settings.openrouterKey}
                        onChange={(event) => set({ openrouterKey: event.target.value })}
                        placeholder="sk-or-..."
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Model ID"
                      hint="Any OpenRouter model that accepts images."
                    >
                      <input
                        value={settings.openrouterModel}
                        onChange={(event) => set({ openrouterModel: event.target.value })}
                        placeholder="google/gemini-2.5-flash"
                        className={inputClass}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field
                      label="Base URL"
                      hint="Any OpenAI-compatible endpoint, without /chat/completions."
                    >
                      <input
                        value={settings.customBaseUrl}
                        onChange={(event) => set({ customBaseUrl: event.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="API key">
                      <input
                        type="password"
                        value={settings.customKey}
                        onChange={(event) => set({ customKey: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Model ID">
                      <input
                        value={settings.customModel}
                        onChange={(event) => set({ customModel: event.target.value })}
                        placeholder="gpt-4.1-mini"
                        className={inputClass}
                      />
                    </Field>
                  </>
                )}

                <Field
                  label="Alt text language"
                  hint="Write it in the language you are posting in."
                >
                  <input
                    value={settings.altLanguage}
                    onChange={(event) => set({ altLanguage: event.target.value })}
                    placeholder="English (British)"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Extra guidance"
                  hint="Optional. Added to the prompt, for example a house style."
                >
                  <textarea
                    value={settings.altExtraGuidance}
                    onChange={(event) => set({ altExtraGuidance: event.target.value })}
                    rows={3}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </>
            ) : null}

            <p className="text-[0.75rem] leading-relaxed text-ink-faint">
              Keys are stored in this browser only and are sent straight to the
              provider you choose.
            </p>
          </Section>

          <Section title="Account">
            <div className="rounded-xl border border-line-soft bg-bg-raised p-3 text-[0.82rem]">
              <p className="font-medium">
                {profile?.displayName || profile?.handle || "Signed in"}
              </p>
              <p className="text-ink-muted">@{profile?.handle}</p>
              {account ? (
                <p className="mt-1 text-ink-faint">
                  Server: {new URL(account.pds).host}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-full border border-line px-4 py-2 text-[0.85rem] font-semibold text-danger hover:bg-danger/10"
            >
              Sign out
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}

function ThreadTagEditor() {
  const threadTags = useThread((state) => state.threadTags);
  const setThreadTags = useThread((state) => state.setThreadTags);
  const knownTags = useThread((state) => state.knownTags);
  const forgetTag = useThread((state) => state.forgetTag);
  const [value, setValue] = useState("");

  const add = (raw: string) => {
    const tag = normaliseTag(raw);
    if (!tag) return;
    setThreadTags([...threadTags, tag]);
    setValue("");
  };

  return (
    <>
      <Field
        label="Applied to every post in this thread"
        hint="Stored on each post record and indexed by Bluesky, but never shown in the text. Eight tags at most, counting any written into the text itself."
      >
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-bg-raised px-2 py-1.5">
          {threadTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                setThreadTags(threadTags.filter((entry) => entry !== tag))
              }
              className="ls-press flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-[0.78rem]"
              title="Remove"
            >
              #{tag}
              <CloseIcon className="size-2.5" />
            </button>
          ))}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "," || event.key === " ") {
                event.preventDefault();
                add(value);
              }
            }}
            onBlur={() => add(value)}
            disabled={threadTags.length >= MAX_TAGS}
            placeholder={
              threadTags.length >= MAX_TAGS ? "Eight is the limit" : "Add a tag"
            }
            className="min-w-28 flex-1 bg-transparent py-0.5 text-[0.85rem] outline-none placeholder:text-ink-faint"
          />
        </div>
      </Field>

      {knownTags.length > 0 ? (
        <div>
          <p className="mb-1 text-[0.82rem] font-medium">Used before</p>
          <div className="flex flex-wrap gap-1">
            {knownTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.75rem] text-ink-muted"
              >
                <button
                  type="button"
                  onClick={() => setThreadTags([...threadTags, tag])}
                  className="hover:text-ink"
                  title="Apply to the whole thread"
                >
                  #{tag}
                </button>
                <button
                  type="button"
                  onClick={() => forgetTag(tag)}
                  aria-label={`Forget ${tag}`}
                  className="text-ink-faint hover:text-danger"
                >
                  <CloseIcon className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-bg-raised px-3 py-2 text-[0.88rem] outline-none placeholder:text-ink-faint focus:border-ink-muted";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.82rem] font-medium">{label}</span>
      {hint ? (
        <span className="mb-1.5 block text-[0.75rem] text-ink-faint">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-[0.85rem] font-medium">{label}</span>
        {hint ? (
          <span className="block text-[0.75rem] text-ink-faint">{hint}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors ${
          checked ? "bg-accent" : "bg-bg-sunken border border-line"
        }`}
      >
        <span
          className={`block size-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </label>
  );
}
