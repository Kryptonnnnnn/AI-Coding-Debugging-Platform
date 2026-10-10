import asyncio
import contextlib
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import analysis, auth, chat, dashboard, debug, health, intel, patches, projects, review, sandbox, settings, tests
from app.core.config import get_settings
from app.core.errors import install_handlers
from app.core.ratelimit import limiter
from app.services.execution import cleanup_expired

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


async def _janitor():
    while True:
        try:
            await cleanup_expired()
        except Exception as e:  # noqa: BLE001
            logging.getLogger("app").warning("cleanup failed: %s", type(e).__name__)
        await asyncio.sleep(3600)


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_janitor())
    yield
    task.cancel()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.app_name, version="1.0.0", lifespan=lifespan,
                  description="AI coding & debugging platform API. AI output is advisory; tool findings are deterministic.")
    install_handlers(app)
    @app.middleware("http")
    async def guard(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > s.max_request_bytes:
            return JSONResponse({"error": {"code": "request_too_large", "message": "Request body too large."}}, status_code=413)
        ip = request.client.host if request.client else "unknown"
        if request.method != "OPTIONS":
            try:
                limiter.check(f"ip:{ip}", s.rate_limit_per_minute)
            except Exception:
                return JSONResponse({"error": {"code": "rate_limited", "message": "Too many requests."}}, status_code=429,
                                    headers={"Retry-After": "30"})
        try:
            resp = await call_next(request)
        except Exception as e:  # noqa: BLE001 - keep CORS headers on 500s so browsers show the real error
            logging.getLogger("app").error("unhandled error: %s", type(e).__name__)
            return JSONResponse({"error": {"code": "internal_error", "message": "Internal server error"}}, status_code=500)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Cache-Control"] = "no-store"
        return resp

    # Added last = outermost: CORS headers are applied to every response, including errors.
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"])

    for r in (health.router, auth.router, projects.router, analysis.router, debug.router, review.router, tests.router,
              patches.router, intel.router, chat.router, sandbox.router, dashboard.router, settings.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
