"""List (and, with explicit confirmation, delete) throw-away test accounts.

Safe by design:
  * dry-run by default: prints matching accounts and what they own, deletes nothing;
  * only patterns ending in '@example.com' are accepted;
  * deletion requires --delete AND --expect N where N equals the number of matches shown in the dry run,
    so the set cannot change between review and deletion;
  * prints only email, creation time and row counts. Never hashes, tokens or file contents.

Usage (DATABASE_URL must be set in your shell; it is not read from Git):
  python -m scripts.cleanup_test_accounts                      # dry run with the default patterns
  python -m scripts.cleanup_test_accounts --delete --expect 7  # delete exactly those 7 accounts
"""
import argparse
import asyncio
import sys

from sqlalchemy import func, or_, select

from app.core.db import get_sessionmaker, reset_engine
from app.models.models import CodeReview, DebuggingReport, Project, ProjectFile, User

DEFAULT_PATTERNS = ["live-check-%@example.com", "api-check-%@example.com", "audit-%@example.com", "e2e-%@example.com", "shots-%@example.com"]


def validate_patterns(patterns: list[str]) -> list[str]:
    for p in patterns:
        if not p.lower().endswith("@example.com") or p.strip("%") == "@example.com":
            raise SystemExit(f"Refusing pattern {p!r}: only patterns like 'prefix-%@example.com' are allowed.")
    return patterns


async def find_accounts(patterns: list[str]) -> list[dict]:
    async with get_sessionmaker()() as db:
        users = (await db.scalars(select(User).where(or_(*[User.email.ilike(p) for p in patterns])).order_by(User.created_at))).all()
        out = []
        for u in users:
            pids = select(Project.id).where(Project.owner_id == u.id)
            out.append({
                "email": u.email, "created_at": u.created_at.isoformat(timespec="seconds"),
                "projects": await db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == u.id)),
                "files": await db.scalar(select(func.count()).select_from(ProjectFile).where(ProjectFile.project_id.in_(pids))),
                "reports": await db.scalar(select(func.count()).select_from(DebuggingReport).where(DebuggingReport.user_id == u.id)),
                "reviews": await db.scalar(select(func.count()).select_from(CodeReview).where(CodeReview.user_id == u.id)),
            })
        return out


async def delete_accounts(patterns: list[str]) -> int:
    async with get_sessionmaker()() as db:
        users = (await db.scalars(select(User).where(or_(*[User.email.ilike(p) for p in patterns])))).all()
        for u in users:
            await db.delete(u)  # ON DELETE CASCADE removes projects, files, history, reports, chats and usage
        await db.commit()
        return len(users)


async def run(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pattern", action="append", help="SQL LIKE pattern ending in @example.com (repeatable)")
    ap.add_argument("--delete", action="store_true", help="actually delete (requires --expect)")
    ap.add_argument("--expect", type=int, help="number of accounts you reviewed in the dry run")
    a = ap.parse_args(argv)
    patterns = validate_patterns(a.pattern or DEFAULT_PATTERNS)
    found = await find_accounts(patterns)
    print(f"Patterns: {patterns}\nMatched {len(found)} account(s):")
    for f in found:
        print(f"  {f['email']:55} {f['created_at']}  projects={f['projects']} files={f['files']} reports={f['reports']} reviews={f['reviews']}")
    if not a.delete:
        print("\nDry run only. Re-run with --delete --expect %d to delete exactly these accounts." % len(found))
        return 0
    if a.expect != len(found):
        print(f"\nRefusing to delete: --expect {a.expect} does not match the {len(found)} account(s) found.", file=sys.stderr)
        return 2
    n = await delete_accounts(patterns)
    print(f"\nDeleted {n} account(s) and everything they owned.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(run(sys.argv[1:]))
    asyncio.run(reset_engine())
    raise SystemExit(code)
