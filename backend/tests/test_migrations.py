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
