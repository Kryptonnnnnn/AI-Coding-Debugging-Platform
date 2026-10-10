# Security notes

This project applies defence in depth but is **not claimed to be fully secure**. Review before exposing it publicly.

## Implemented
- **Auth**: Argon2 password hashing, signed JWT (HS256, 12 h), per-IP rate limit on login/register, uniform error for unknown email vs bad password.
- **Authorization**: every query is scoped to the owning user server-side (`api/deps.py`); other users' resources return 404. Covered by `test_cross_user_*`.
- **Uploads**: size limits, UTF-8 only, binary/dependency files skipped, ZIPs read in memory (never extracted to disk), traversal/absolute/symlink entries rejected, zip-bomb size check.
- **Secrets**: scanner + redaction runs before any content reaches an AI provider and on error/trace text; sensitive filenames (`.env`, keys) are excluded from automatic project reviews; warnings are shown in the UI. Secret values are never logged or returned.
- **External AI consent**: Groq is blocked until the user acknowledges the data flow in Settings.
- **Prompt injection**: file contents are wrapped as untrusted data with explicit system rules; model output is schema-validated; patches never auto-apply and only target one owned file.
- **Honest output**: line numbers are kept only when the quoted text is found in the file; tool-confirmed findings are separated from AI hypotheses.
- **Rendering**: model Markdown is sanitized (`rehype-sanitize`), links get `noopener nofollow`; tested against script/onerror/javascript: payloads.
- **Execution**: see `sandbox/README.md`. Off by default, fail-closed, never in the API process.
- **Static analysis**: fixed-argument subprocesses, no shell, scrubbed env, 15 s timeout, source parsed not executed.
- **Errors/logging**: generic 500s, only exception type logged, bounded request size, CORS allow-list, `nosniff`/`no-store` headers.

## Known limitations
- Tokens live in `localStorage` (cross-origin Vercel↔Render setup); an XSS bug would expose them. Prefer same-site cookies if you host both under one domain.
- Rate limiting is in-memory per process; use a shared store (Redis) when running multiple instances.
- Secret detection is pattern-based and will miss some secrets. Reviews are not exhaustive.
- No email verification or password reset; no per-user storage quota beyond project limits.
- Docker sandbox shares the host kernel (see above).

Report issues privately to the repository owner.
