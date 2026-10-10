"use client";
import { BarChart3, Braces, Bug, ChevronRight, FlaskConical, FolderKanban, History, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Search, SearchCheck, Settings, ShieldAlert, Sun, Terminal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { applyTheme } from "@/components/theme";
import { useShell } from "@/components/shell-context";
import { Dialog, Input, Kbd, Menu, MenuItem, MenuSeparator, Tooltip } from "@/components/ui";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useAuth } from "@/lib/auth";
import { get } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Page, Project } from "@/types/api";

export const NAV = [
  { group: "Workspace", items: [
    { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
    { href: "/projects", label: "My projects", icon: FolderKanban },
  ] },
  { group: "History", items: [
    { href: "/sessions", label: "Code sessions", icon: History },
    { href: "/debug-history", label: "Debug history", icon: Bug },
    { href: "/reviews", label: "Code reviews", icon: SearchCheck },
    { href: "/tests", label: "Test generation", icon: FlaskConical },
  ] },
  { group: "Tools", items: [
    { href: "/security", label: "Security analysis", icon: ShieldAlert },
    { href: "/sandbox", label: "Sandbox", icon: Terminal },
  ] },
];
const ALL = [...NAV.flatMap((g) => g.items), { href: "/settings", label: "Settings", icon: Settings }];

function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1" aria-label="AI Coding & Debugging – dashboard">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-card"><Braces className="h-4 w-4" /></span>
      {!small && <span className="leading-tight"><span className="block text-[13px] font-semibold">AI Coding &amp; Debugging</span><span className="block text-2xs text-muted-foreground">Platform</span></span>}
    </Link>
  );
}

function NavLink({ href, label, icon: I, collapsed, active }: { href: string; label: string; icon: typeof BarChart3; collapsed: boolean; active: boolean }) {
  const link = (
    <Link href={href} aria-current={active ? "page" : undefined} aria-label={collapsed ? label : undefined}
      className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]", collapsed && "justify-center", active ? "bg-primary/12 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <I className={cn("h-4 w-4 shrink-0", active && "text-primary")} aria-hidden />
      {!collapsed && label}
    </Link>
  );
  return collapsed ? <Tooltip label={label} side="right">{link}</Tooltip> : link;
}

function Sidebar({ collapsed, path, onToggle }: { collapsed: boolean; path: string; onToggle?: () => void }) {
  const isActive = (h: string) => path === h || (h !== "/dashboard" && path.startsWith(h));
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-4 p-2.5">
      <div className={cn("flex h-9 items-center", collapsed ? "justify-center" : "justify-between")}>
        <Logo small={collapsed} />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto">
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && <p className="mb-1 px-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground/70">{g.group}</p>}
            <div className="space-y-0.5">{g.items.map((i) => <NavLink key={i.href} {...i} collapsed={collapsed} active={isActive(i.href)} />)}</div>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 border-t pt-2">
        <NavLink href="/settings" label="Settings" icon={Settings} collapsed={collapsed} active={isActive("/settings")} />
        {onToggle && (
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right" shortcut="Ctrl B">
            <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground", collapsed && "justify-center")}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!collapsed && "Collapse"}
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}

function GoTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    if (!open) return;
    setQ("");
    get<Page<Project>>("/projects?page_size=50").then((r) => setProjects(r.items)).catch(() => setProjects([]));
  }, [open]);
  const items = useMemo(() => {
    const all = [...ALL.map((n) => ({ label: n.label, href: n.href, hint: "Page" })), ...projects.map((p) => ({ label: p.name, href: `/projects/${p.id}`, hint: "Project" }))];
    return all.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  }, [q, projects]);
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <Dialog open={open} onClose={onClose} title="Go to…">
      <Input aria-label="Search pages and projects" autoFocus placeholder="Search pages and projects…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && items[0] && go(items[0].href)} />
      <ul className="mt-2 max-h-72 overflow-auto">
        {items.map((i) => (
          <li key={i.href}><button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted" onClick={() => go(i.href)}>{i.label}<span className="text-2xs text-muted-foreground">{i.hint}</span></button></li>
        ))}
        {items.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">No matches.</li>}
      </ul>
    </Dialog>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { crumbs } = useShell();
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useLocalStorage("aicp.sidebar.collapsed", false);
  const [drawer, setDrawer] = useState(false);
  const [goto, setGoto] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setGoto(true); }
      if (mod && e.key.toLowerCase() === "b" && !e.shiftKey) { e.preventDefault(); setCollapsed((c) => !c); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsed]);

  const trail = useMemo(() => {
    if (crumbs) return crumbs;
    const cur = ALL.find((n) => path === n.href || path.startsWith(n.href + "/"));
    const out = [{ label: cur?.label ?? "Home", href: cur?.href }];
    if (cur && path !== cur.href) out.push({ label: path.includes("/patches/") ? "Patch review" : "Details", href: undefined });
    return out;
  }, [crumbs, path]);

  const toggleTheme = () => { applyTheme(dark ? "light" : "dark"); setDark(!dark); };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className={cn("hidden shrink-0 border-r bg-card transition-[width] duration-150 md:block", collapsed ? "w-[52px]" : "w-56")}>
        <Sidebar collapsed={collapsed} path={path} onToggle={() => setCollapsed((c) => !c)} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="relative h-full w-64 border-r bg-card" onClick={(e) => e.stopPropagation()}><Sidebar collapsed={false} path={path} /></aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card/60 px-3">
          <button aria-label="Open menu" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted md:hidden" onClick={() => setDrawer(true)}><MenuIcon className="h-4 w-4" /></button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
            {trail.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                {c.href && i < trail.length - 1 ? <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
                  : <span aria-current={i === trail.length - 1 ? "page" : undefined} className={cn("truncate", i === trail.length - 1 ? "font-medium" : "text-muted-foreground")}>{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip align="end" label="Go to page or project" shortcut="Ctrl K">
              <button onClick={() => setGoto(true)} aria-label="Go to page or project" className="hidden h-7 items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground sm:flex">
                <Search className="h-3.5 w-3.5" /> Go to… <Kbd>Ctrl K</Kbd>
              </button>
            </Tooltip>
            <Tooltip align="end" label={dark ? "Switch to light theme" : "Switch to dark theme"}>
              <button onClick={toggleTheme} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </Tooltip>
            <Menu label="User menu" trigger={<span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{(user?.email ?? "?")[0].toUpperCase()}</span>}>
              <div className="px-2 py-1.5"><p className="truncate text-[13px] font-medium">{user?.display_name || "Account"}</p><p className="truncate text-2xs text-muted-foreground">{user?.email}</p></div>
              <MenuSeparator />
              <MenuItem icon={<Settings className="h-3.5 w-3.5" />} onSelect={() => router.push("/settings")}>Settings</MenuItem>
              <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} danger onSelect={() => { logout(); router.replace("/login"); }}>Log out</MenuItem>
            </Menu>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <GoTo open={goto} onClose={() => setGoto(false)} />
    </div>
  );
}
