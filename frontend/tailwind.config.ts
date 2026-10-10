import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: "hsl(var(--card))",
        elevated: "hsl(var(--elevated))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        accent: "hsl(var(--accent))",
        danger: "hsl(var(--danger))",
        warn: "hsl(var(--warn))",
        ok: "hsl(var(--ok))",
      },
      borderRadius: { lg: "0.625rem", md: "0.4rem", sm: "0.25rem" },
      boxShadow: { pop: "0 8px 30px hsl(0 0% 0% / 0.35)", card: "0 1px 0 hsl(0 0% 100% / 0.03) inset, 0 1px 2px hsl(0 0% 0% / 0.25)" },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
    },
  },
  plugins: [],
};
export default config;
