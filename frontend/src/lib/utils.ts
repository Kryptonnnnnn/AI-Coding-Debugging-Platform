import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

/** Maps our language ids to Monaco language ids. */
export function monacoLanguage(lang: string) {
  const m: Record<string, string> = { cpp: "cpp", c: "c", shell: "shell", text: "plaintext" };
  return m[lang] ?? lang;
}

export const LANGUAGES = ["python", "javascript", "typescript", "java", "c", "cpp", "go", "sql", "json", "markdown", "text"];
