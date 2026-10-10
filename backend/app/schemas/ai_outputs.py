"""Schemas the model must satisfy. Anything that fails validation is never used."""
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]


class Evidence(BaseModel):
    file: str = ""
    quote: str = ""  # exact text from the supplied code; used to verify line numbers server-side
    note: str = ""
    line_start: int | None = None
    line_end: int | None = None
    line_verified: bool = False  # set by the server, never trusted from the model


class AlternativeFix(BaseModel):
    title: str
    description: str = ""
    corrected_code: str | None = None


class Section(BaseModel):
    heading: str
    body: str


class DebugReport(BaseModel):
    summary: str
    root_cause: str = ""
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "low"
    confidence_reasoning: str = ""
    suggested_fix: str = ""
    corrected_code: str | None = None
    fix_explanation: str = ""
    regressions: list[str] = Field(default_factory=list)
    verification_steps: list[str] = Field(default_factory=list)
    alternative_fixes: list[AlternativeFix] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)


class ReviewFindingOut(BaseModel):
    severity: Severity
    category: str
    file_path: str = ""
    title: str = ""
    description: str
    evidence_quote: str = ""
    remediation: str = ""


class ReviewOutput(BaseModel):
    summary: str
    findings: list[ReviewFindingOut] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class TestOutput(BaseModel):
    framework: str
    test_path: str
    code: str
    description: str = ""
    behaviors: list[str] = Field(default_factory=list)
    branches_covered: list[str] = Field(default_factory=list)
    fixtures_mocks: list[str] = Field(default_factory=list)
    setup_instructions: str = ""
