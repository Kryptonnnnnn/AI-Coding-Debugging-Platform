import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold">404</p>
      <p className="text-muted-foreground">This page doesn&apos;t exist.</p>
      <Link href="/dashboard" className="text-primary underline">Go to dashboard</Link>
    </main>
  );
}
