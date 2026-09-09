import type { Settings } from "./settings";
import { toDataUrl } from "./media";

export const ALT_TEXT_LIMIT = 2000;

function buildSystemPrompt(language: string, extra: string): string {
  return [
    "You write alternative text for images posted on social media. Your alt text is read aloud by screen readers, shown when an image fails to load, and indexed by search engines, so it has to carry the full meaning of the image on its own.",
    "",
    `Write the alt text in ${language}. Use that language for every word, including any labels you add around transcribed text. Match the spelling conventions of that language.`,
    "",
    "Rules:",
    "1. Lead with what matters most. The first few words should tell someone what they are looking at, because screen reader users often skip ahead.",
    "2. Transcribe every piece of legible text in the image verbatim: headlines, captions, screenshots of posts, scoreboards, slides, signage, subtitles, chyrons, charts axes and labels. Transcribed text is usually the single most useful part of the alt text. If the image is mostly text, the alt text is mostly that transcription. Quote it exactly rather than summarising it, unless it runs past the length limit, in which case transcribe the most important parts and summarise the rest.",
    "3. Describe what is visually happening: subjects, actions, setting, notable objects, spatial relationships, and anything that carries emotion or meaning. Include colour, lighting and composition only when they carry meaning.",
    "4. For charts and tables, state the chart type, what the axes measure, the units, the overall trend, and the specific values that matter. Do not make a reader guess the numbers.",
    "5. For screenshots, say what application or site it is if that is visible, then transcribe the content in reading order.",
    "6. Describe people by what is visible: apparent action, clothing, expression, and setting. Do not guess names, ethnicity, gender, age or emotional state beyond what a viewer could reasonably observe. If a person is identified by visible text such as a name badge or caption, you may use that name.",
    "7. Do not begin with phrases like 'Image of', 'A photo of', 'This picture shows', or 'Alt text:'. State the content directly. Only name the medium when it matters, for example an illustration, screenshot, diagram, map or meme.",
    "8. Write in plain, natural, specific prose using concrete nouns. Specific wording helps both screen reader users and search engines. Never stuff keywords, never repeat a phrase for emphasis, and never add hashtags, emoji or promotional wording.",
    "9. Aim for one to three sentences for a simple image. Go longer only when there is real content to convey, such as dense text or a detailed chart. Never exceed 1800 characters.",
    "10. Do not repeat the post text word for word. Add what the reader cannot get from the post alone.",
    "11. If something is genuinely illegible or ambiguous, say so briefly rather than inventing it. Never invent text, numbers, logos or details you cannot see.",
    "",
    "Output only the alt text itself. No preamble, no quotation marks, no markdown, no explanation, no trailing commentary.",
    extra.trim() ? `\nAdditional instructions from the author: ${extra.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type Endpoint = {
  url: string;
  key: string;
  model: string;
  headers: Record<string, string>;
};

export function resolveEndpoint(settings: Settings): Endpoint | null {
  if (settings.altProvider === "openrouter") {
    if (!settings.openrouterKey || !settings.openrouterModel) return null;
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: settings.openrouterKey,
      model: settings.openrouterModel,
      headers: {
        "HTTP-Referer":
          typeof window === "undefined" ? "" : window.location.origin,
        "X-Title": "Live Skeet",
      },
    };
  }
  if (!settings.customBaseUrl || !settings.customModel) return null;
  const base = settings.customBaseUrl.replace(/\/+$/, "");
  return {
    url: `${base}/chat/completions`,
    key: settings.customKey,
    model: settings.customModel,
    headers: {},
  };
}

export function altTextConfigured(settings: Settings): boolean {
  return settings.altTextEnabled && resolveEndpoint(settings) !== null;
}

export async function generateAltText(options: {
  blob: Blob;
  settings: Settings;
  postText?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const endpoint = resolveEndpoint(options.settings);
  if (!endpoint) throw new Error("No vision model is configured in settings.");

  const dataUrl = await toDataUrl(options.blob);
  const context = options.postText?.trim();

  const userContent: unknown[] = [
    {
      type: "text",
      text: context
        ? `Write the alt text for this image. For context, the post it is attached to says:\n\n"""\n${context}\n"""\n\nDo not repeat the post text. Reply with the alt text only.`
        : "Write the alt text for this image. Reply with the alt text only.",
    },
    { type: "image_url", image_url: { url: dataUrl } },
  ];

  const res = await fetch(endpoint.url, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      ...(endpoint.key ? { authorization: `Bearer ${endpoint.key}` } : {}),
      ...endpoint.headers,
    },
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(
            options.settings.altLanguage || "English (British)",
            options.settings.altExtraGuidance,
          ),
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Alt text request failed (${res.status}). ${detail.slice(0, 200)}`.trim(),
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (json.error?.message) throw new Error(json.error.message);

  const raw = json.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => part.text ?? "").join("")
        : "";

  const cleaned = text
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(alt text|alt)\s*[:\-–]\s*/i, "")
    .trim();

  if (!cleaned) throw new Error("The model returned an empty response.");
  return cleaned.slice(0, ALT_TEXT_LIMIT);
}
