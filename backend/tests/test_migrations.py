import os
import subprocess
import sys
import tempfile

import sqlalchemy as sa


def test_alembic_upgrade_and_downgrade():
    with tempfile.TemporaryDirectory() as d:
        env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{d}/m.db"}
        for args in (["upgrade", "head"], ["downgrade", "base"], ["upgrade", "head"]):
            r = subprocess.run([sys.executable, "-m", "alembic", *args], env=env, capture_output=True, text=True)
            assert r.returncode == 0, r.stderr
        tables = set(sa.inspect(sa.create_engine(f"sqlite:///{d}/m.db")).get_table_names())
        expected = {"users", "projects", "project_files", "code_sessions", "conversations", "messages", "debugging_reports",
                    "code_reviews", "code_review_findings", "generated_tests", "code_patches", "file_versions",
                    "execution_jobs", "execution_results", "user_settings", "usage_events"}
        assert expected <= tables


def test_neon_style_urls_are_translated_for_asyncpg():
    from app.core.db import engine_args
    url, kw = engine_args("postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/db?sslmode=require&channel_binding=require")
    assert url.startswith("postgresql+asyncpg://u:p@ep-x-pooler")
    assert "sslmode" not in url and "channel_binding" not in url
    assert kw["connect_args"]["ssl"] == "require" and kw["connect_args"]["statement_cache_size"] == 0
    url, kw = engine_args("postgres://u:p@ep-x.neon.tech/db?sslmode=require")  # direct (non-pooled) endpoint
    assert url.startswith("postgresql+asyncpg://") and "statement_cache_size" not in kw["connect_args"]
    assert engine_args("sqlite+aiosqlite:///x.db") == ("sqlite+aiosqlite:///x.db", {})
