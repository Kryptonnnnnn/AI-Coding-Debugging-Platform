"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export function storedTheme(): "light" | "dark" | "system" {
  const t = typeof window === "undefined" ? null : window.localStorage.getItem("aicp.theme");
  return t === "light" || t === "system" ? t : "dark";
}

export function applyTheme(theme: "light" | "dark" | "system") {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.localStorage.setItem("aicp.theme", theme);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => { applyTheme(dark ? "light" : "dark"); setDark(!dark); }}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export const themeInitScript = `try{var t=localStorage.getItem('aicp.theme')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;
