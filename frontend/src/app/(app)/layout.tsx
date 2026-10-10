"use client";
import { BarChart3, Bug, FlaskConical, FolderKanban, History, Menu, SearchCheck, Settings, ShieldAlert, Terminal, LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/projects", label: "My projects", icon: FolderKanban },
  { href: "/sessions", label: "Code sessions", icon: History },
  { href: "/debug-history", label: "Debug history", icon: Bug },
  { href: "/reviews", label: "Code reviews", icon: SearchCheck },
  { href: "/tests", label: "Test generation", icon: FlaskConical },
  { href: "/security", label: "Security analysis", icon: ShieldAlert },
  { href: "/sandbox", label: "Sandbox", icon: Terminal },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  useEffect(() => setOpen(false), [path]);

  if (loading || !user) return <Spinner label="Checking session" />;

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <Link href="/dashboard" className="mb-3 px-2 text-sm font-semibold">AI Coding &amp; Debugging</Link>
      {nav.map(({ href, label, icon: I }) => {
        const active = path === href || (href !== "/dashboard" && path.startsWith(href));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-md px-2.5 py-2 text-sm", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <I className="h-4 w-4" aria-hidden /> {label}
          </Link>
        );
      })}
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <span className="truncate px-2 text-xs text-muted-foreground" title={user.email}>{user.email}</span>
        <div className="flex">
          <ThemeToggle />
          <button aria-label="Log out" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" onClick={() => { logout(); router.replace("/login"); }}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-56 shrink-0 border-r bg-card md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="relative h-full w-64 bg-card" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b p-2 md:hidden">
          <button aria-label={open ? "Close menu" : "Open menu"} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-semibold">AI Coding &amp; Debugging</span>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
