export type ArtifactType =
  | "vision" | "glossary" | "persona" | "fr" | "nfr"
  | "use-case" | "story" | "risk" | "assumption" | "decision"
  | "open-item" | "tech-surface";

export type Status = "draft" | "reviewed" | "approved" | "implemented" | "obsolete";
export type Priority = "must" | "should" | "could" | "wont";

export interface Frontmatter {
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  priority?: Priority;
  implements?: string[];
  satisfies?: string[];
  refines?: string[];
  derived_from?: string[];
  tags?: string[];
  version: number;
  updated: string;
  [k: string]: unknown;
}

export interface Artifact {
  frontmatter: Frontmatter;
  body: string;
  filePath: string;
}

export const ID_PREFIX: Record<ArtifactType, string> = {
  vision: "VIS", glossary: "GLO", persona: "PER", fr: "FR", nfr: "NFR",
  "use-case": "UC", story: "US", risk: "RSK", assumption: "ASM", decision: "DEC",
  "open-item": "OPI", "tech-surface": "TSF",
};

export const FILE_BACKED_TYPES: ArtifactType[] =
  ["persona", "fr", "nfr", "use-case", "story", "decision", "glossary", "tech-surface", "open-item"];

// Descriptive types document what exists (as-is); they carry no normative authority.
export const DESCRIPTIVE_TYPES: ArtifactType[] = ["glossary", "tech-surface"];

// Types excluded from as-is traceability reasoning: open-items (they gate stability
// via their own question paths) plus the descriptive as-is docs. detectGaps excludes
// exactly these; computeAssessment excludes these AND "decision" (the ledger). Both
// exclusion sets derive from this one so they never drift apart.
export const NON_TRACEABLE_TYPES: ArtifactType[] = ["open-item", ...DESCRIPTIVE_TYPES];

// Normative types assert what is required; the ba_apply gate demands deliberate
// (user-decided/corrected) backing for these.
export const NORMATIVE_TYPES: ArtifactType[] = ["persona", "fr", "nfr", "use-case", "story"];
