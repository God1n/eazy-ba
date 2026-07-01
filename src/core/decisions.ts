import type { Frontmatter } from "./types.js";
import type { Round, Provenance } from "./taxonomy.js";
import { nextId, today } from "./ids.js";
import { writeArtifact, listArtifacts } from "./store.js";
import { transitionOpenItem } from "./openItems.js";

export interface DecisionInput {
  question: string;
  answer: string;
  asked_round: Round;
  topic: string;
  ref?: string;
  supersedes?: string[];
  updated?: string;
  /**
   * Backing provenance. Defaults to "user-decided" so every normally-recorded
   * answer is a deliberate decision (existing flows unchanged). Unit 10 passes
   * "corrected" / "confirmed-as-inferred" for the confirmation round.
   */
  provenance?: Provenance;
}

export function recordDecision(input: DecisionInput, docsRoot: string): string {
  const id = nextId("decision", docsRoot);
  const fm: Frontmatter = {
    id,
    type: "decision",
    title: input.question,
    status: "approved",
    version: 1,
    updated: input.updated ?? today(),
    question: input.question,
    answer: input.answer,
    asked_round: input.asked_round,
    topic: input.topic,
    provenance: input.provenance ?? "user-decided",
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    applied: false,
    informs: [],
  };
  writeArtifact({ frontmatter: fm, body: "" }, docsRoot);
  return id;
}

export function listDecisions(docsRoot: string): Frontmatter[] {
  return listArtifacts(docsRoot)
    .filter(a => a.frontmatter.type === "decision")
    .map(a => a.frontmatter);
}

export function getDecision(id: string, docsRoot: string): Frontmatter | undefined {
  return listDecisions(docsRoot).find(d => d.id === id);
}

// Mark a backing applied. The backing may be a recorded decision OR an open-item
// (kind:observation) — observation-backed artifacts must not hit a decisions-only
// throw. Decision behaviour is identical to before (merge informs + applied:true).
// Marking an open-item transitions its item_state to "applied" so it STOPS gating
// stability on the next computeAssessment (a CLOSED fact backing a descriptive
// artifact must not stay `open` forever).
export function markApplied(id: string, artifactIds: string[], docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(a => a.frontmatter.id === id);
  if (!artifact) throw new Error(`Backing not found: ${id}`);

  if (artifact.frontmatter.type === "open-item") {
    transitionOpenItem(id, "applied", docsRoot);
    return;
  }

  if (artifact.frontmatter.type !== "decision") {
    throw new Error(`Cannot mark ${id} applied: not a decision or open-item.`);
  }
  const fm = { ...artifact.frontmatter };
  const merged = new Set([...((fm.informs as string[] | undefined) ?? []), ...artifactIds]);
  fm.informs = [...merged];
  fm.applied = true;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}

export function supersede(oldId: string, newId: string, docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(a => a.frontmatter.id === oldId && a.frontmatter.type === "decision");
  if (!artifact) throw new Error(`Decision not found: ${oldId}`);
  // Append-only: never overwrite an existing supersede link (that would lose the
  // original audit trail). Idempotent if it already points at the same newId.
  if (artifact.frontmatter.status === "obsolete" && artifact.frontmatter.superseded_by !== newId) {
    throw new Error(`Decision ${oldId} is already superseded by ${artifact.frontmatter.superseded_by}; supersede its successor instead.`);
  }
  const fm = { ...artifact.frontmatter };
  fm.status = "obsolete";
  fm.superseded_by = newId;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}
