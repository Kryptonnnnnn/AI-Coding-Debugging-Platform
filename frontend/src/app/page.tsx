import { ArrowRight, Braces, Bug, FileDiff, FlaskConical, GitBranch, MessagesSquare, SearchCheck, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

const features = [
  { icon: Bug, title: "Evidence-based debugging", text: "Reports with root cause, quoted evidence and line numbers the server verifies against your code. Unverifiable lines are never invented." },
  { icon: FileDiff, title: "Patches you approve", text: "Every fix is a diff. Nothing is written until you confirm, conflicts are detected, and each change is kept in version history." },
  { icon: SearchCheck, title: "Reviews with severities", text: "Quick, standard or deep. Findings are marked tool-confirmed when Ruff, Bandit or a parser independently agrees." },
  { icon: FlaskConical, title: "Test generation", text: "pytest and Vitest/Jest tests with fixtures and mocks, labelled “generated, not executed”. Coverage is never invented." },
  { icon: MessagesSquare, title: "Context you control", text: "Streaming assistant that only sees the files you tick, with a preview of what is sent and secret warnings." },
  { icon: Terminal, title: "Sandboxed execution", text: "Optional Docker sandbox with no network and hard limits. Disabled and fail-closed unless isolation is verified." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <span className="flex items-center gap-2.5 text-[13px] font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Braces className="h-4 w-4" /></span> AI Coding &amp; Debugging</span>
        <nav className="flex items-center gap-1 text-[13px]">
          <ThemeToggle />
          <Link className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground" href="/login">Log in</Link>
          <Link className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:brightness-110" href="/register">Get started</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-2xs text-muted-foreground"><GitBranch className="h-3 w-3 text-primary" /> Verify AI output, don&apos;t just trust it</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Debug, review and test code with an AI you can verify</h1>
            <p className="mt-4 max-w-xl text-[15px] text-muted-foreground">A developer workspace that keeps deterministic tool findings apart from AI hypotheses, puts you in control of every change, and runs locally with Ollama or a mock provider.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:brightness-110" href="/register">Create a free account <ArrowRight className="h-3.5 w-3.5" /></Link>
              <Link className="rounded-md border bg-card px-4 py-2 text-[13px] font-medium hover:bg-muted" href="/login">Log in</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card shadow-pop" aria-hidden>
            <div className="flex items-center gap-1.5 border-b px-3 py-2"><span className="h-2 w-2 rounded-full bg-danger/70" /><span className="h-2 w-2 rounded-full bg-warn/70" /><span className="h-2 w-2 rounded-full bg-ok/70" /><span className="ml-2 font-mono text-2xs text-muted-foreground">calc.py</span></div>
            <pre className="p-3 font-mono text-xs leading-5"><span className="text-muted-foreground">1  </span><span className="text-primary">def</span> <span className="text-accent">average</span>(xs):{"\n"}<span className="bg-danger/15 text-danger">2 -    return sum(xs) / len(xs)</span>{"\n"}<span className="bg-ok/15 text-ok">2 +    return sum(xs) / len(xs) if xs else 0</span></pre>
            <div className="border-t bg-primary/[0.05] px-3 py-2 text-2xs"><span className="font-medium text-primary">AI hypothesis · </span>Dividing by <code className="font-mono">len(xs)</code> raises ZeroDivisionError on an empty list. <span className="text-ok">line 2 (verified)</span></div>
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
          {features.map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-lg border bg-card p-4 shadow-card">
              <I className="mb-2 h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[13px] font-semibold">{title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
        <section className="mt-8 flex gap-3 rounded-lg border bg-card p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p><span className="font-medium text-foreground">Data flow &amp; limits. </span>Code is sent only to the AI provider you select: Groq (external), Ollama (your machine) or the built-in mock. Secret-like values are redacted first. AI output can be wrong and reviews are not exhaustive. Treat findings as leads, not guarantees.</p>
        </section>
      </main>
    </div>
  );
}
