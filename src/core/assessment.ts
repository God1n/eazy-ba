import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { listArtifacts } from "./store.js";
import { listDecisions } from "./decisions.js";
import { detectGaps } from "./gaps.js";
import { surfaceQuestions, gapQuestions, domainQuestions } from "./questions.js";

export interface Assessment { round: "surface" | "domain" | "gap"; questions: Question[]; gaps: Gap[]; stable: boolean }

export function computeAssessment(docsRoot: string, mode: "discovery" | "stabilize"): Assessment {
  const artifacts = listArtifacts(docsRoot).filter(a => a.frontmatter.type !== "decision");
  const decisions = listDecisions(docsRoot);
  const gaps = detectGaps(artifacts);
  let round: Question["round"];
  let questions: Question[];
  if (mode === "discovery" && decisions.length === 0) {
    round = "surface";
    questions = surfaceQuestions();
  } else {
    const domain = domainQuestions(artifacts, decisions);
    const gapq = gapQuestions(gaps);
    questions = [...domain, ...gapq];
    round = domain.length > 0 ? "domain" : "gap";
  }
  return { round, questions, gaps, stable: questions.length === 0 && gaps.length === 0 };
}
