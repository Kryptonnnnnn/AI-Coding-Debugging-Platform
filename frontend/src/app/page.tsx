import Link from "next/link";
import { Bug, FileDiff, FlaskConical, MessagesSquare, SearchCheck, ShieldCheck, Terminal } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

const features = [
  { icon: Bug, title: "Evidence-based debugging", text: "Structured reports with root cause, quoted evidence and line numbers that the server verifies against your code. Unverifiable lines are never invented." },
  { icon: FileDiff, title: "Patches you approve", text: "Every fix is a diff. Nothing is written until you apply it, conflicts are detected, and each change is saved to version history." },
  { icon: SearchCheck, title: "Code review with severities", text: "Quick, standard or deep reviews. Findings are labelled by severity and flagged when Ruff, Bandit or a parser independently confirms them." },
  { icon: FlaskConical, title: "Test generation", text: "pytest and Vitest/Jest tests with fixtures and mocks. Tests are labelled “generated, not executed” and coverage is never invented." },
  { icon: MessagesSquare, title: "Context-aware chat", text: "Streaming assistant where you choose exactly which files are sent, with a preview of the context and secret warnings." },
  { icon: Terminal, title: "Sandboxed execution", text: "Optional Docker sandbox: no network, non-root, read-only filesystem, resource limits. Disabled (fail-closed) unless isolation is available." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> AI Coding &amp; Debugging Platform</span>
        <nav className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          <Link className="rounded-md px-3 py-1.5 hover:bg-muted" href="/login">Log in</Link>
          <Link className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" href="/register">Get started</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="py-16 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Debug, review and test code with an AI you can verify</h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            A developer workspace that separates deterministic tool findings from AI hypotheses, keeps you in control of every change,
            and runs fully locally with Ollama or a mock provider. No OpenAI key needed.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground" href="/register">Create a free account</Link>
            <Link className="rounded-md border px-5 py-2.5 font-medium hover:bg-muted" href="/login">Log in</Link>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
          {features.map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <I className="mb-3 h-5 w-5 text-primary" aria-hidden />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
        <section className="mt-10 rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="mb-1 font-semibold text-foreground">Data flow &amp; limits</h2>
          Code you analyze is sent only to the AI provider you select: Groq (external), Ollama (your machine) or the built-in mock. Secret-like values are
          redacted first. AI output can be wrong and reviews are not exhaustive. Treat findings as leads, not guarantees.
        </section>
      </main>
    </div>
  );
}
