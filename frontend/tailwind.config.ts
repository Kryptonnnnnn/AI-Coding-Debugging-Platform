import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: "hsl(var(--card))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        danger: "hsl(var(--danger))",
        warn: "hsl(var(--warn))",
        ok: "hsl(var(--ok))",
      },
      borderRadius: { lg: "0.6rem", md: "0.45rem", sm: "0.3rem" },
    },
  },
  plugins: [],
};
export default config;
