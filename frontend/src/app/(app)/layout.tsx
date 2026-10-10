"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/shell";
import { ShellProvider } from "@/components/shell-context";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <Spinner label="Checking session" />;
  return <ShellProvider><AppShell>{children}</AppShell></ShellProvider>;
}
