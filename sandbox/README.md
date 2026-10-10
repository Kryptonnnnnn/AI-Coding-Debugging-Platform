# Execution sandbox (local development only)

The API **never** runs user code itself. Execution is delegated to a `SandboxProvider`
(`backend/app/sandbox/`). The bundled `DockerSandbox` starts one throw-away container per job.
If Docker, the image or `EXECUTION_ENABLED=true` is missing, execution is **disabled and fails closed**:
the API answers `503 execution_disabled` and no result is ever simulated.

## Enable locally
```bash
docker build -t aicp-sandbox:latest sandbox      # or: docker compose --profile sandbox build sandbox-image
# backend/.env
EXECUTION_ENABLED=true
```
Check: `curl -H "Authorization: Bearer <token>" localhost:8000/api/v1/sandbox/status`.

## Isolation applied to every job
| Control | Setting |
|---|---|
| User | `65534:65534` (non-root), `--cap-drop ALL`, `no-new-privileges` |
| Network | `--network none` |
| Filesystem | `--read-only` root, input mounted `:ro`, `/tmp` tmpfs 16 MB `noexec` |
| Limits | memory 128 MB (no swap), 0.5 CPU, 64 pids, 10 s wall clock (all configurable) |
| Secrets | container gets no app env vars; no Docker socket; no host mounts except the temp input dir |
| Output | stdout/stderr capped at 32 KB each, flagged `truncated` |
| Cleanup | `docker kill` on timeout and `docker rm -f` always; temp dir deleted |
| Quotas | 5 executions/minute/user; job rows expire after 7 days |

`backend/tests/test_sandbox_docker.py` verifies these against real containers (skipped when Docker is absent).

## Limits of this design
Docker containers share the host kernel. This is acceptable for **your own machine**, not for a public server
running untrusted code. For production use a hardened remote runner (gVisor/Firecracker, e.g. a separate
service) implementing `SandboxProvider`. Free hosts (Render, Vercel) cannot run this safely, so keep
`EXECUTION_ENABLED=false` there. Never mount the Docker socket into the API container.
