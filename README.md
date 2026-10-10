# AI Coding & Debugging Platform

A full-stack developer workspace: paste or upload code, get **evidence-based debugging reports**, **severity-labelled code reviews**, **generated tests** and **diff-reviewed patches**, with a project file explorer, Monaco editor, streaming chat, version history and an optional **Docker-isolated execution sandbox**.

Design principle: *deterministic tool findings and AI hypotheses are always labelled differently.* Line numbers are only shown when the server finds the quoted code in the file; coverage is never invented; nothing is applied without an explicit click.

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind, Monaco (+ diff editor), react-markdown (sanitized), Lucide |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic, PostgreSQL |
| AI | Provider interface: **Groq**, **Ollama**, deterministic **mock** (no OpenAI dependency) |
| Analysis | `ast`, Ruff, Bandit, `node --check` (fixed-arg subprocesses) |
| Sandbox | Separate provider abstraction; local Docker implementation, disabled by default |

## Features
Auth & per-user isolation · projects (create/rename/archive/delete/search/paginate) · file tree, upload files or ZIP · Monaco editor with resizable panels, dark/light themes · debugging tasks (debug, explain error, root cause, fix, alternatives, line-by-line, edge cases, readability, optimize, refactor, repro) · reports saved + Markdown export · code review (quick/standard/deep, file or project manifest) · pytest / Vitest / Jest test generation with diff preview and save-to-project · patch create/apply/reject with conflict detection · file version history & restore · streaming chat with explicit context selection, preview, secret warnings, rename/search/delete · static analysis & secret scan page · dashboard with real usage stats · provider/model settings · sandbox status & execution results · retention cleanup job.

## Run locally (macOS / Linux / Windows)
Requirements: Python 3.11+, Node 20+, PostgreSQL 14+ (or Docker). Quickest path uses SQLite-free Postgres via Docker:

```bash
docker compose up -d db            # PostgreSQL on :5432 (set DB_PORT=5433 if taken)
cp .env.example backend/.env       # then edit; defaults use the mock provider
```
**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head               # create/upgrade the schema
uvicorn app.main:app --reload --port 8000
```
**Frontend**
```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm install
npm run dev                        # http://localhost:3000
```
Without Postgres you can set `DATABASE_URL=sqlite+aiosqlite:///./dev.db` for a quick try.

**Health checks**: `curl localhost:8000/api/v1/health` · `curl localhost:8000/api/v1/ready` · OpenAPI docs at `http://localhost:8000/docs`.

### AI providers
- **mock** (default): deterministic, offline; recognises a few patterns (e.g. `sum(x)/len(x)`, `== None`) so every workflow is demoable.
- **Ollama**: `ollama pull llama3.1`, then `AI_PROVIDER=ollama OLLAMA_MODEL=llama3.1`. Code stays on your machine.
- **Groq**: create a key at console.groq.com, set `AI_PROVIDER=groq GROQ_API_KEY=...`. In the app, Settings → acknowledge the data-flow notice (selected code is sent to Groq, secrets redacted first). Free-tier limits change; recent third-party sources list ~30 requests/min and ~1,000 requests/day for `llama-3.3-70b-versatile` — check your Groq console. 429s are surfaced to the UI.

Users can pick provider/model in Settings; the server default comes from env.

### Sandbox (optional, local only)
See [`sandbox/README.md`](sandbox/README.md). Short version: `docker build -t aicp-sandbox:latest sandbox` and `EXECUTION_ENABLED=true`.

## Tests (results from the last run on macOS, Python 3.11, Node 22)
```bash
cd backend  && pytest -q                 # 65 passed (incl. 10 real-Docker sandbox tests; they skip if Docker is absent)
cd frontend && npm run typecheck && npm run lint && npm test   # tsc clean, eslint clean, 23 vitest tests passed
cd frontend && npx playwright install chromium && npm run test:e2e   # 3 passed against live backend + Postgres + Monaco
```
Backend tests also pass against PostgreSQL: `TEST_DATABASE_URL=postgresql://... pytest -q`. Migrations were verified on Postgres 14 and 16 and SQLite (upgrade → downgrade → upgrade).
E2E expects the backend on :8000 with `AI_PROVIDER=mock`, `EXECUTION_ENABLED=false`, and the frontend on :3000.

## Deployment (not yet deployed; nothing here has been verified on the hosts)
Quotas verified from Render docs ([render.com/docs/free](https://render.com/docs/free)): free web services spin down after 15 min idle (~1 min cold start); free Postgres is 1 GB and **expires after 30 days**, so use a permanent free Postgres such as Neon or Supabase for the long term.

1. **Database**: create a Neon/Supabase project, copy the connection string (`postgresql://…`; `sslmode=require` is fine—the app rewrites the driver to asyncpg; if the host needs SSL params, append `?ssl=require`).
2. **Backend (Render)**: New → Blueprint → select this repo (`render.yaml`), or create a Web Service with root `backend`, build `pip install -r requirements.txt`, start `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `ENVIRONMENT=production`, `SECRET_KEY` (random), `DATABASE_URL`, `CORS_ORIGINS=https://<your-app>.vercel.app`, `AI_PROVIDER`, `GROQ_API_KEY` if used, and keep `EXECUTION_ENABLED=false`.
3. **Frontend (Vercel)**: import the repo, Root Directory `frontend`, env `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`. Redeploy, then update `CORS_ORIGINS`.
4. **Verify**: `/api/v1/ready` returns `ready`; register in the UI; run a debug request.
Execution stays disabled in production: free hosts cannot provide safe isolation. To add it later, deploy a separate hardened runner implementing `SandboxProvider`.

## Layout
```
frontend/  src/{app,components,features,editor,lib,hooks,types}  tests/  e2e/
backend/   app/{api,core,models,schemas,services,ai,debugging,code_review,static_analysis,patching,sandbox}  migrations/  tests/
sandbox/   Dockerfile README.md
docker-compose.yml  render.yaml  .env.example  SECURITY.md
```

## Known limitations
- Static analysis is real only for Python (ast, Ruff, Bandit) and JavaScript syntax (`node --check`); TypeScript and other languages get AI analysis only and are labelled "skipped/unavailable".
- Generated tests are never executed automatically; sandboxed pytest runs are manual from the Run tab and only if the sandbox is enabled.
- Review line verification relies on the model quoting code exactly; unmatched quotes show "line not verified".
- Mock provider is rule-based, for testing/demo only. Small local models may produce schema-invalid JSON (one automatic repair retry, then a clear error).
- Monaco loads its assets from a CDN at runtime. Rate limiting is per-process. See `SECURITY.md`.
- Free-tier cold starts and quota changes are outside this project's control.
