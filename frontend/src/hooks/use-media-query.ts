"use client";
import { useEffect, useState } from "react";

/** Returns undefined until mounted so the first client render matches the server. */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
