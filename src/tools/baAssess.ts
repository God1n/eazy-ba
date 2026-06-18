import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { listDecisions } from "../core/decisions.js";
import { detectGaps } from "../core/gaps.js";
import type { Gap } from "../core/gaps.js";
import { surfaceQuestions, gapQuestions, domainQuestions } from "../core/questions.js";
import { readSession, writeSession } from "../core/session.js";
import type { Question } from "../core/session.js";

export const baAssessSchema = z.object({ projectRoot: z.string() });

export function baAssess(input: z.infer<typeof baAssessSchema>):
  { round: string; questions: Question[]; gaps: Gap[]; stable: boolean } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const decisions = listDecisions(docsRoot);
  const gaps = detectGaps(artifacts);

  let round: Question["round"];
  let questions: Question[];

  if (session.mode === "discovery" && decisions.length === 0) {
    round = "surface";
    questions = surfaceQuestions();
  } else {
    const domain = domainQuestions(artifacts);
    const gapq = gapQuestions(gaps);
    questions = [...domain, ...gapq];
    round = domain.length > 0 ? "domain" : "gap";
  }

  const stable = questions.length === 0 && gaps.length === 0;
  writeSession({ ...session, round, open_questions: questions, updated: new Date().toISOString().slice(0, 10) }, docsRoot);
  return { round, questions, gaps, stable };
}
