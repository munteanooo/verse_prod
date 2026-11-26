import { ro } from "./ro";

export const locales = ["ro", "en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale = "ro" satisfies Locale;

export const messages = ro;
