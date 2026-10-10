import uuid
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---- auth
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class UserOut(ORM):
    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- projects / files
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    archived: bool | None = None
    settings: dict | None = None


class ProjectOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    archived: bool
    settings: dict
    created_at: datetime
    updated_at: datetime
    file_count: int = 0


class FileCreate(BaseModel):
    path: str
    content: str = ""
    language: str | None = None


class FileUpdate(BaseModel):
    content: str | None = None
    path: str | None = None  # rename
    language: str | None = None


class FileMeta(ORM):
    id: uuid.UUID
    path: str
    language: str
    size_bytes: int
    sha256: str
    updated_at: datetime


class FileOut(FileMeta):
    content: str
    secret_warnings: list[dict] = []


class VersionOut(ORM):
    id: uuid.UUID
    file_id: uuid.UUID
    version_no: int
    path: str
    sha256: str
    reason: str
    patch_id: uuid.UUID | None
    created_at: datetime


class VersionFull(VersionOut):
    content: str


class UploadResult(BaseModel):
    created: list[str]
    updated: list[str]
    skipped: list[dict]


# ---- analysis & ai
class DetectIn(BaseModel):
    path: str = ""
    content: str = ""


class AnalyzeIn(BaseModel):
    file_id: uuid.UUID | None = None
    path: str = "snippet"
    content: str | None = None
    language: str | None = None
    security: bool = True


DebugTask = Literal["debug", "explain_error", "root_cause", "suggest_fix", "alternatives", "explain_code",
                    "edge_cases", "readability", "optimize", "refactor", "repro"]


class DebugIn(BaseModel):
    project_id: uuid.UUID
    file_id: uuid.UUID | None = None
    task: DebugTask = "debug"
    code: str | None = Field(default=None, max_length=200_000)
    language: str | None = None
    error_message: str = Field(default="", max_length=8000)
    stack_trace: str = Field(default="", max_length=20000)
    expected: str = Field(default="", max_length=4000)
    actual: str = Field(default="", max_length=4000)
    repro_steps: str = Field(default="", max_length=4000)
    extra_file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    provider: str | None = None
    model: str | None = None


class ReviewIn(BaseModel):
    project_id: uuid.UUID
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)  # empty = whole project manifest
    depth: Literal["quick", "standard", "deep"] = "standard"
    provider: str | None = None
    model: str | None = None


class TestGenIn(BaseModel):
    project_id: uuid.UUID
    file_id: uuid.UUID
    framework: str | None = None
    provider: str | None = None
    model: str | None = None


class SaveTestIn(BaseModel):
    path: str | None = None
    overwrite: bool = False


class PatchCreate(BaseModel):
    file_id: uuid.UUID
    title: str = Field(default="Proposed change", max_length=200)
    explanation: str = Field(default="", max_length=8000)
    proposed_content: str | None = None
    unified_diff: str | None = Field(default=None, max_length=400_000)
    report_id: uuid.UUID | None = None


class PatchOut(ORM):
    id: uuid.UUID
    project_id: uuid.UUID
    file_id: uuid.UUID
    report_id: uuid.UUID | None
    title: str
    explanation: str
    base_sha256: str
    diff: str
    status: str
    created_at: datetime
    resolved_at: datetime | None
    added: int = 0
    removed: int = 0


class PatchFull(PatchOut):
    original_content: str
    proposed_content: str


class ContextPreviewIn(BaseModel):
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    provider: str | None = None


# ---- chat
class ConversationCreate(BaseModel):
    project_id: uuid.UUID | None = None
    title: str = Field(default="New conversation", max_length=200)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConversationOut(ORM):
    id: uuid.UUID
    project_id: uuid.UUID | None
    title: str
    created_at: datetime
    updated_at: datetime


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    selection: str | None = Field(default=None, max_length=20000)
    provider: str | None = None
    model: str | None = None


class MessageOut(ORM):
    id: uuid.UUID
    role: str
    content: str
    context_files: list
    created_at: datetime


# ---- settings
class SettingsOut(ORM):
    provider: str
    model: str
    theme: str
    data_retention_days: int
    external_ai_acknowledged: bool
    preferences: dict


class SettingsUpdate(BaseModel):
    provider: str | None = None
    model: str | None = Field(default=None, max_length=100)
    theme: Literal["light", "dark", "system"] | None = None
    data_retention_days: int | None = Field(default=None, ge=0, le=3650)
    external_ai_acknowledged: bool | None = None
    preferences: dict | None = None


class ExecuteIn(BaseModel):
    file_id: uuid.UUID
    kind: Literal["run", "test"] = "run"
