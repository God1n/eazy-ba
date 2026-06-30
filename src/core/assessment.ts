import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { listArtifacts } from "./store.js";
import { listDecisions } from "./decisions.js";
import { listOpenItems } from "./openItems.js";
import { detectGaps } from "./gaps.js";
import {
  surfaceQuestions, gapQuestions, domainQuestions, changeQuestions,
  coverageQuestions, observationQuestions,
} from "./questions.js";
import type { Mode, Round } from "./taxonomy.js";
import type { ArtifactType } from "./types.js";
import { DESCRIPTIVE_TYPES } from "./types.js";

// Artifact types that are NOT normative as-is documents and must be excluded from
// every artifact-list consumer (detectGaps, domainQuestions, change-reval). They
// gate stability via their own question paths (open-items) or carry no normative
// authority at all (tech-surface/glossary are descriptive as-is docs).
const NON_ARTIFACT_CONSUMER_TYPES = new Set<ArtifactType>([
  "decision", "open-item", ...DESCRIPTIVE_TYPES,
]);

export interface Assessment { round: Round; questions: Question[]; gaps: Gap[]; stable: boolean }

export function computeAssessment(docsRoot: string, mode: Mode): Assessment {
  // Two opposite memberships of one list:
  //  - `artifacts` (normative real docs) feed detectGaps, domainQuestions, change-reval.
  //  - open-items feed coverage/observation questions, and gate stability via those.
  // Decisions, open-items, tech-surface, and glossary are excluded from `artifacts`.
  const allArtifacts = listArtifacts(docsRoot);
  const artifacts = allArtifacts.filter(
    a => !NON_ARTIFACT_CONSUMER_TYPES.has(a.frontmatter.type),
  );
  const allDecisions = listDecisions(docsRoot);
  const decisions = allDecisions.filter(d => d.status !== "obsolete");
  const openItems = listOpenItems(docsRoot);
  const gaps = detectGaps(artifacts);

  // PURE READ: open-items are read, never seeded/written here. ba_status shares
  // this path and must not create artifacts as a side effect of a status read.
  // Floor seeding happens in the ba_assess write path (a later unit), not here.
  const coverage = coverageQuestions(openItems);
  const observations = observationQuestions(openItems);
  const openItemQuestions = [...coverage, ...observations];

  let round: Assessment["round"];
  let questions: Question[];

  if (mode === "discovery" && decisions.length === 0) {
    // Early discovery/ground: the surface round and open-item (floor/coverage/
    // observation) questions coexist. Including open-item questions here is what
    // closes the vacuous-stability trap — without it, an open coverage-topic or
    // observation on disk would never surface and `stable` would be vacuously true.
    round = "surface";
    questions = [...surfaceQuestions(), ...openItemQuestions];
  } else {
    // Change re-validation: artifacts whose derived_from cites a superseded
    // (obsolete) decision and which do not yet have a change-round decision
    // (topic === artifact id) resolving them.
    const obsoleteIds = new Set(allDecisions.filter(d => d.status === "obsolete").map(d => d.id));
    const changeAnswered = new Set(
      allDecisions.filter(d => d.asked_round === "change" && d.status !== "obsolete").map(d => d.topic as string),
    );
    const affectedUnresolved = artifacts
      .filter(a => {
        const df = (a.frontmatter.derived_from as string[] | undefined) ?? [];
        return df.some(id => obsoleteIds.has(id)) && !changeAnswered.has(a.frontmatter.id);
      })
      .map(a => a.frontmatter.id);
    const changeReval = changeQuestions(affectedUnresolved);
    const domain = domainQuestions(artifacts, decisions);
    const gapq = gapQuestions(gaps);
    questions = [...changeReval, ...domain, ...gapq, ...openItemQuestions];
    round =
      changeReval.length > 0 ? "change"
      : domain.length > 0 ? "domain"
      : observations.length > 0 ? "confirm"
      : coverage.length > 0 ? "research"
      : "gap";
  }

  return { round, questions, gaps, stable: questions.length === 0 && gaps.length === 0 };
}
