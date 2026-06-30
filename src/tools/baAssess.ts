import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession, writeSession } from "../core/session.js";
import { computeAssessment, type Assessment } from "../core/assessment.js";
import { listDecisions } from "../core/decisions.js";
import { createOrUpsertOpenItem } from "../core/openItems.js";
import { floorOpenItemInputs } from "../core/questions.js";

// Seed the artifact-independent floor (Flow 1 R5a) when a *discovery* session
// enters the deep round — i.e. surface answers have been recorded (decisions
// exist). This lives in the ba_assess WRITE path, never in computeAssessment
// (which ba_status shares and must keep read-only).
//
// Trigger precision (R6 back-compat): only `mode === "discovery"` with ≥1 recorded
// decision seeds. Stabilize/change sessions are never floor-seeded, so an existing
// stable project is never destabilized. createOrUpsertOpenItem is idempotent on the
// `floor:<dim>` identity key, so re-entry never duplicates and never re-opens an
// already-answered/retired floor topic (terminal states are not resurrected).
function seedFloorIfDeepRound(docsRoot: string, mode: string): void {
  if (mode !== "discovery") return;
  if (listDecisions(docsRoot).length === 0) return; // still in the surface round
  for (const input of floorOpenItemInputs()) {
    createOrUpsertOpenItem(input, docsRoot);
  }
}

export const baAssessSchema = z.object({ projectRoot: z.string() });

export function baAssess(input: z.infer<typeof baAssessSchema>): Assessment {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");
  seedFloorIfDeepRound(docsRoot, session.mode);
  const a = computeAssessment(docsRoot, session.mode);
  writeSession({ ...session, round: a.round, open_questions: a.questions, updated: new Date().toISOString().slice(0, 10) }, docsRoot);
  return a;
}
