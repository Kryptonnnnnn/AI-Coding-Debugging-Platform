"use client";
import { ErrorState } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center"><ErrorState error={error} retry={reset} /></main>;
}
