import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";

// Resolve the knowledge dir relative to this compiled module (src/ in dev, dist/ in prod).
const here = dirname(fileURLToPath(import.meta.url));        // .../core
const knowledgeDir = join(here, "..", "knowledge");

export interface SurfaceQuestion { topic: string; text: string }
export interface ChecklistEntry { type: string; dimensions: string[] }

export function loadSurfaceQuestions(): SurfaceQuestion[] {
  return parse(readFileSync(join(knowledgeDir, "question-banks", "surface.yml"), "utf8")) as SurfaceQuestion[];
}

export function loadDomainChecklist(): ChecklistEntry[] {
  return parse(readFileSync(join(knowledgeDir, "checklists", "domain.yml"), "utf8")) as ChecklistEntry[];
}
