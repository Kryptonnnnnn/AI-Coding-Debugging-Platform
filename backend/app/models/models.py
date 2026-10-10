import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def _ts() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=_now)


def _fk(table: str, nullable: bool = False, ondelete: str = "CASCADE"):
    return mapped_column(Uuid, ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable, index=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = _ts()


class UserSettings(Base):
    __tablename__ = "user_settings"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(20), default="")  # "" = server default
    model: Mapped[str] = mapped_column(String(100), default="")
    theme: Mapped[str] = mapped_column(String(10), default="system")
    data_retention_days: Mapped[int] = mapped_column(Integer, default=0)
    external_ai_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = _uuid_pk()
    owner_id: Mapped[uuid.UUID] = _fk("users")
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    files: Mapped[list["ProjectFile"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class ProjectFile(Base):
    __tablename__ = "project_files"
    __table_args__ = (UniqueConstraint("project_id", "path", name="uq_file_path"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    project_id: Mapped[uuid.UUID] = _fk("projects")
    path: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(30), default="text")
    content: Mapped[str] = mapped_column(Text, default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class FileVersion(Base):
    __tablename__ = "file_versions"
    __table_args__ = (Index("ix_versions_file_no", "file_id", "version_no"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    project_id: Mapped[uuid.UUID] = _fk("projects")
    file_id: Mapped[uuid.UUID] = _fk("project_files")
    version_no: Mapped[int] = mapped_column(Integer)
    path: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(String(30))  # create | edit | patch_apply | restore | upload
    patch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = _ts()


class CodeSession(Base):
    __tablename__ = "code_sessions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID | None] = _fk("projects", nullable=True)
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    ref_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # report/review/test id
    created_at: Mapped[datetime] = _ts()


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID | None] = _fk("projects", nullable=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = _uuid_pk()
    conversation_id: Mapped[uuid.UUID] = _fk("conversations")
    role: Mapped[str] = mapped_column(String(12))
    content: Mapped[str] = mapped_column(Text)
    context_files: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = _ts()


class DebuggingReport(Base):
    __tablename__ = "debugging_reports"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID | None] = _fk("projects", nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    task: Mapped[str] = mapped_column(String(30), default="debug")
    language: Mapped[str] = mapped_column(String(30))
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    tool_findings: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()


class CodeReview(Base):
    __tablename__ = "code_reviews"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID | None] = _fk("projects", nullable=True)
    depth: Mapped[str] = mapped_column(String(10))
    scope: Mapped[list] = mapped_column(JSON, default=list)  # file paths reviewed
    summary: Mapped[str] = mapped_column(Text, default="")
    limitations: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()
    findings: Mapped[list["CodeReviewFinding"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class CodeReviewFinding(Base):
    __tablename__ = "code_review_findings"
    id: Mapped[uuid.UUID] = _uuid_pk()
    review_id: Mapped[uuid.UUID] = _fk("code_reviews")
    severity: Mapped[str] = mapped_column(String(15))
    category: Mapped[str] = mapped_column(String(40))
    file_path: Mapped[str] = mapped_column(String(500), default="")
    line_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    line_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="")
    remediation: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10), default="ai")  # ai | tool
    tool_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    rule_id: Mapped[str] = mapped_column(String(60), default="")


class GeneratedTest(Base):
    __tablename__ = "generated_tests"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID | None] = _fk("projects", nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    framework: Mapped[str] = mapped_column(String(20))
    test_path: Mapped[str] = mapped_column(String(500))
    code: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    saved: Mapped[bool] = mapped_column(Boolean, default=False)
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()


class CodePatch(Base):
    __tablename__ = "code_patches"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID] = _fk("projects")
    file_id: Mapped[uuid.UUID] = _fk("project_files")
    report_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    explanation: Mapped[str] = mapped_column(Text, default="")
    base_sha256: Mapped[str] = mapped_column(String(64))
    original_content: Mapped[str] = mapped_column(Text)
    proposed_content: Mapped[str] = mapped_column(Text)
    diff: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="proposed")  # proposed|applied|rejected
    created_at: Mapped[datetime] = _ts()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExecutionJob(Base):
    __tablename__ = "execution_jobs"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    project_id: Mapped[uuid.UUID] = _fk("projects")
    file_path: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(10), default="run")  # run | test
    status: Mapped[str] = mapped_column(String(12), default="queued")  # queued|running|completed|failed
    created_at: Mapped[datetime] = _ts()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExecutionResult(Base):
    __tablename__ = "execution_results"
    id: Mapped[uuid.UUID] = _uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("execution_jobs.id", ondelete="CASCADE"), unique=True)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stdout: Mapped[str] = mapped_column(Text, default="")
    stderr: Mapped[str] = mapped_column(Text, default="")
    timed_out: Mapped[bool] = mapped_column(Boolean, default=False)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


class UsageEvent(Base):
    __tablename__ = "usage_events"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = _fk("users")
    kind: Mapped[str] = mapped_column(String(30))
    provider: Mapped[str] = mapped_column(String(20), default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    token_source: Mapped[str] = mapped_column(String(12), default="estimate")  # provider | estimate
    created_at: Mapped[datetime] = _ts()
