import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession, writeSession } from "../core/session.js";
import { computeAssessment, type Assessment } from "../core/assessment.js";

export const baAssessSchema = z.object({ projectRoot: z.string() });

export function baAssess(input: z.infer<typeof baAssessSchema>): Assessment {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");
  const a = computeAssessment(docsRoot, session.mode);
  writeSession({ ...session, round: a.round, open_questions: a.questions, updated: new Date().toISOString().slice(0, 10) }, docsRoot);
  return a;
}
