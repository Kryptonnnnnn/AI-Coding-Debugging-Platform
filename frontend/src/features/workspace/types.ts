import type { FileFull, FileMeta } from "@/types/api";

export type AssistantTab = "chat" | "debug" | "review" | "tests";
export type BottomTab = "analysis" | "history" | "output";

export interface WorkspaceCtx {
  projectId: string;
  files: FileMeta[];
  file: FileFull | null;
  /** Current (possibly unsaved) editor text. */
  draft: string;
  selection: string;
  /** Persists unsaved edits so server-side analysis sees what the user sees. */
  saveNow: () => Promise<FileFull | null>;
  refresh: () => Promise<void>;
  openFile: (id: string) => void;
  openPatch: (id: string) => void;
  reloadActive: () => Promise<void>;
  showAssistant: (tab: AssistantTab) => void;
  showBottom: (tab: BottomTab) => void;
}
