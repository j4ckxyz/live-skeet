"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeChoice = "system" | "light" | "dark";

export type AltProvider = "openrouter" | "custom";

export type Settings = {
  theme: ThemeChoice;

  /** Automatically write alt text for images with a vision model. */
  altTextEnabled: boolean;
  altProvider: AltProvider;
  openrouterKey: string;
  openrouterModel: string;
  /** OpenAI-compatible endpoint, e.g. https://api.openai.com/v1 */
  customBaseUrl: string;
  customKey: string;
  customModel: string;
  /** Language the alt text is written in, as a plain name. */
  altLanguage: string;
  altExtraGuidance: string;

  /** Seconds between engagement refreshes. */
  pollSeconds: number;
  /** Warn before sending an image with no alt text. */
  warnMissingAlt: boolean;
  /** Show a compact, denser layout. */
  compact: boolean;
  /** Keep the app password so sessions can be rebuilt silently. */
  rememberSession: boolean;
  /** Downscale large images before upload so posting stays quick. */
  compressImages: boolean;
  /** Language tag written onto each post record. */
  postLanguage: string;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  altTextEnabled: false,
  altProvider: "openrouter",
  openrouterKey: "",
  openrouterModel: "google/gemini-2.5-flash",
  customBaseUrl: "",
  customKey: "",
  customModel: "",
  altLanguage: "English (British)",
  altExtraGuidance: "",
  pollSeconds: 30,
  warnMissingAlt: true,
  compact: false,
  rememberSession: true,
  compressImages: true,
  postLanguage: "en-GB",
};

type SettingsStore = Settings & {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "live-skeet:settings",
      version: 1,
      partialize: (state) => {
        const { set: _set, reset: _reset, ...rest } = state;
        void _set;
        void _reset;
        return rest;
      },
    },
  ),
);

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("live-skeet:theme", choice);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
}
