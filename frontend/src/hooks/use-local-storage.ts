"use client";
import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      /* ignore corrupt value */
    }
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((p) => {
        const n = typeof v === "function" ? (v as (p: T) => T)(p) : v;
        try {
          window.localStorage.setItem(key, JSON.stringify(n));
        } catch {
          /* storage full or blocked */
        }
        return n;
      });
    },
    [key],
  );
  return [value, set] as const;
}
