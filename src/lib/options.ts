// SHARED CONTRACT — used by the browser and the server. No secrets here.

export const LANGUAGES = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  hi: "हिन्दी",
  ja: "日本語",
  zh: "简体中文",
} as const;

export const READING_LEVELS = {
  plain: "Plain language: no jargon, short sentences, define every term",
  standard: "Standard: a working developer new to this topic",
  expert: "Expert: concise, assume strong engineering background",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type ReadingLevel = keyof typeof READING_LEVELS;

/** Returns value if it is an own key of options, otherwise fallback. */
export function pick<T extends object>(
  options: T,
  value: unknown,
  fallback: keyof T
): keyof T {
  return typeof value === "string" && Object.hasOwn(options, value)
    ? (value as keyof T)
    : fallback;
}
