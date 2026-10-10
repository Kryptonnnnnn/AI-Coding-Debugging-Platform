export interface User { id: string; email: string; display_name: string }
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface Project { id: string; name: string; description: string; archived: boolean; settings: Record<string, unknown>; created_at: string; updated_at: string; file_count: number }
export interface FileMeta { id: string; path: string; language: string; size_bytes: number; sha256: string; updated_at: string }
export interface FileFull extends FileMeta { content: string; secret_warnings: { line: number; kind: string }[] }
export interface Version { id: string; file_id: string; version_no: number; path: string; sha256: string; reason: string; patch_id: string | null; created_at: string }
export interface Evidence { file: string; quote: string; note: string; line_start: number | null; line_end: number | null; line_verified: boolean }
export interface DebugReport {
  summary: string; root_cause: string; evidence: Evidence[]; confidence: "low" | "medium" | "high"; confidence_reasoning: string;
  suggested_fix: string; corrected_code: string | null; fix_explanation: string; regressions: string[]; verification_steps: string[];
  alternative_fixes: { title: string; description: string; corrected_code: string | null }[]; sections: { heading: string; body: string }[];
}
export interface ToolFinding { tool: string; rule_id: string; severity: string; file: string; line: number | null; column?: number | null; message: string; remediation: string; deterministic: boolean }
export interface ToolStatus { tool: string; status: string; detail: string }
export interface ContextSummary { files: { path: string; chars: number; truncated: boolean; redacted: boolean }[]; skipped: { path: string; reason: string }[]; secret_warnings: { path: string; line: number; kind: string }[]; total_chars: number }
export interface DebugResponse {
  id: string; task: string; language: string; provider: string; model: string; created_at: string; report: DebugReport; tool_findings: ToolFinding[];
  patch_id: string | null; disclaimer: string; meta?: { usage: { prompt_tokens: number; completion_tokens: number; source: string }; context: ContextSummary };
}
export interface Finding { id: string; severity: "critical" | "high" | "medium" | "low" | "info"; category: string; file_path: string; line_start: number | null; line_end: number | null; title: string; description: string; evidence: string; remediation: string; source: "ai" | "tool"; tool_confirmed: boolean; rule_id: string }
export interface Review { id: string; depth: string; scope: string[]; summary: string; limitations: string[]; provider: string; model: string; created_at: string; findings: Finding[]; counts?: Record<string, number> }
export interface GeneratedTest { id: string; project_id: string; file_id: string | null; framework: string; test_path: string; code: string; description: string; details: { behaviors: string[]; branches_covered: string[]; fixtures_mocks: string[]; setup_instructions: string; syntax_valid: boolean | null; coverage: string }; saved: boolean; executed: boolean; status_label: string; diff: string; provider: string; model: string; created_at: string }
export interface Patch { id: string; project_id: string; file_id: string; title: string; explanation: string; diff: string; status: "proposed" | "applied" | "rejected"; created_at: string; resolved_at: string | null; added: number; removed: number; original_content?: string; proposed_content?: string }
export interface Conversation { id: string; project_id: string | null; title: string; created_at: string; updated_at: string }
export interface Message { id: string; role: "user" | "assistant" | "system"; content: string; context_files: { path: string; chars: number; truncated: boolean; redacted: boolean }[]; created_at: string }
export interface Session { id: string; kind: string; title: string; project_id: string | null; ref_id: string | null; created_at: string }
export interface SandboxStatus { available: boolean; provider: string; reason: string; supported_languages: string[]; limits: Record<string, string | number> }
export interface ExecJob { id: string; file_path: string; language: string; kind: string; status: string; created_at: string; finished_at: string | null; result: null | { exit_code: number | null; stdout: string; stderr: string; timed_out: boolean; truncated: boolean; duration_ms: number } }
export interface Settings { provider: string; model: string; theme: "light" | "dark" | "system"; data_retention_days: number; external_ai_acknowledged: boolean; preferences: Record<string, unknown> }
export interface ProviderInfo { name: string; default_model: string; external: boolean; configured: boolean; is_server_default: boolean; reachable?: boolean; installed_models?: string[] }
export interface Dashboard {
  totals: Record<string, number>; findings_by_severity: Record<string, number>;
  usage: { requests: number; tokens: number; token_note: string; last_14_days: { date: string; requests: number; tokens: number }[]; by_provider: Record<string, number> };
}
export interface UploadResult { created: string[]; updated: string[]; skipped: { path: string; reason: string }[] }
