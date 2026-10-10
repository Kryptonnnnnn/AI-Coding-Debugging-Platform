import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { themeInitScript } from "@/components/theme";
import { AuthProvider } from "@/lib/auth";
import { ConfirmProvider } from "@/components/ui";
import { ToastProvider } from "@/lib/toast";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "AI Coding & Debugging Platform",
  description: "An AI-assisted workspace for debugging, code review, safe patching and test generation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <AuthProvider><ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider></AuthProvider>
      </body>
    </html>
  );
}
