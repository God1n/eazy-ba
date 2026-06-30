import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { listArtifacts } from "./store.js";
import { listDecisions } from "./decisions.js";
import { detectGaps } from "./gaps.js";
import { surfaceQuestions, gapQuestions, domainQuestions, changeQuestions } from "./questions.js";
import type { Mode, Round } from "./taxonomy.js";

export interface Assessment { round: Round; questions: Question[]; gaps: Gap[]; stable: boolean }

export function computeAssessment(docsRoot: string, mode: Mode): Assessment {
  const artifacts = listArtifacts(docsRoot).filter(a => a.frontmatter.type !== "decision");
  const allDecisions = listDecisions(docsRoot);
  const decisions = allDecisions.filter(d => d.status !== "obsolete");
  const gaps = detectGaps(artifacts);

  let round: Assessment["round"];
  let questions: Question[];

  if (mode === "discovery" && decisions.length === 0) {
    round = "surface";
    questions = surfaceQuestions();
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
    questions = [...changeReval, ...domain, ...gapq];
    round = changeReval.length > 0 ? "change" : domain.length > 0 ? "domain" : "gap";
  }

  return { round, questions, gaps, stable: questions.length === 0 && gaps.length === 0 };
}
