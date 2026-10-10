"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { applyTheme, storedTheme } from "@/components/theme";
import { Badge, Button, Card, Dialog, ErrorState, Input, Label, Select, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { api, get, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import type { ProviderInfo, Settings } from "@/types/api";

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const { logout } = useAuth();
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const settings = useAsync(() => get<Settings>("/settings"), []);
  const providers = useAsync(() => get<{ providers: ProviderInfo[]; data_flow: string }>("/ai/providers"), []);
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setForm({ ...settings.data, theme: storedTheme() }); }, [settings.data]);

  if (settings.loading || providers.loading) return <Spinner />;
  if (settings.error || !form) return <ErrorState error={settings.error ?? "No data"} retry={settings.reload} />;
  const chosen = providers.data?.providers.find((p) => p.name === form.provider);
  const effective = chosen ?? providers.data?.providers.find((p) => p.is_server_default);

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDelBusy(true);
    try {
      await api("/auth/me", { method: "DELETE", body: { password: delPw } });
      logout();
      router.replace("/login");
    } catch (err) { toast.error(err); } finally { setDelBusy(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await put<Settings>("/settings", { provider: form!.provider, model: form!.model, theme: form!.theme, data_retention_days: form!.data_retention_days, external_ai_acknowledged: form!.external_ai_acknowledged });
      applyTheme(s.theme);
      toast.ok("Settings saved");
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }

  return (
    <PageBody>
      <PageHeader title="Settings" description="AI provider, privacy and appearance." />
      <Card className="mb-4 flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-2 p-3 text-[13px]">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Active AI</span>
        <span>Provider <b className="font-medium">{effective?.name ?? "server default"}</b></span>
        <span>Model <b className="font-mono text-xs font-medium">{form.model || effective?.default_model || "default"}</b></span>
        {effective && <Badge tone={effective.external ? "warn" : "ok"}>{effective.external ? "external service" : "stays local"}</Badge>}
        <span className="text-2xs text-muted-foreground">API keys are configured on the server and never shown here.</span>
      </Card>
      <form onSubmit={save} className="grid max-w-2xl gap-4">
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">AI provider</h2>
          <div><Label htmlFor="prov">Provider</Label>
            <Select id="prov" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value, model: "" })}>
              <option value="">Server default</option>
              {providers.data?.providers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.external ? " (external)" : ""}{!p.configured ? " — not configured" : ""}</option>)}
            </Select></div>
          <div><Label htmlFor="model">Model (blank = {effective?.default_model ?? "default"})</Label><Input id="model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} list="models" />
            <datalist id="models">{effective?.installed_models?.map((m) => <option key={m} value={m} />)}</datalist></div>
          {chosen?.name === "ollama" && <p className="text-xs text-muted-foreground">Ollama: <Badge tone={chosen.reachable ? "ok" : "danger"}>{chosen.reachable ? "reachable" : "not reachable"}</Badge></p>}
          {chosen?.name === "groq" && !chosen.configured && <p className="text-xs text-danger">The server has no GROQ_API_KEY configured.</p>}
          <p className="rounded-md bg-muted p-2 text-xs">{providers.data?.data_flow}</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.external_ai_acknowledged} onChange={(e) => setForm({ ...form, external_ai_acknowledged: e.target.checked })} />
            <span>I understand that selecting an external provider sends the selected source code to that provider (secret-like values are redacted first). Don&apos;t upload code you aren&apos;t allowed to share.</span></label>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Appearance &amp; data</h2>
          <div><Label htmlFor="theme">Theme</Label><Select id="theme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value as Settings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></div>
          <div><Label htmlFor="ret">Data retention preference (days, 0 = keep)</Label><Input id="ret" type="number" min={0} max={3650} value={form.data_retention_days} onChange={(e) => setForm({ ...form, data_retention_days: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Stored as your preference; operators enforce it via the server cleanup job.</p></div>
        </Card>
        <div><Button type="submit" loading={busy}>Save settings</Button></div>
      </form>
      <Card className="mt-6 max-w-2xl border-danger/40 p-4">
        <h2 className="text-sm font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Permanently deletes your account and everything it owns: projects, files, version history, reports, reviews, chats and usage records. This cannot be undone.</p>
        <Button variant="danger" className="mt-3" onClick={() => { setDelPw(""); setDelOpen(true); }}>Delete my account…</Button>
      </Card>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account?" description="Enter your password to confirm.">
        <form onSubmit={deleteAccount} className="space-y-3">
          <div><Label htmlFor="del-pw">Password</Label><Input id="del-pw" type="password" required autoFocus autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDelOpen(false)}>Cancel</Button><Button type="submit" variant="danger" loading={delBusy}>Delete everything</Button></div>
        </form>
      </Dialog>
    </PageBody>
  );
}
