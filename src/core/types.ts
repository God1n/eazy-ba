export type ArtifactType =
  | "vision" | "glossary" | "persona" | "fr" | "nfr"
  | "use-case" | "story" | "risk" | "assumption" | "decision";

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
};

export const FILE_BACKED_TYPES: ArtifactType[] =
  ["persona", "fr", "nfr", "use-case", "story", "decision"];
