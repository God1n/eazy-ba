import type { Artifact } from "./types.js";
import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { loadSurfaceQuestions, loadDomainChecklist } from "./knowledge.js";

export function surfaceQuestions(): Question[] {
  return loadSurfaceQuestions().map((q, i) => ({
    ref: `Q-s${i + 1}`, text: q.text, topic: q.topic, round: "surface",
  }));
}

export function gapQuestions(gaps: Gap[]): Question[] {
  return gaps.map((g, i) => ({
    ref: `Q-g${i + 1}`,
    text: `${g.message} What should it be? (gap: ${g.kind})`,
    topic: g.subject,
    round: "gap",
  }));
}

export function domainQuestions(artifacts: Artifact[]): Question[] {
  const checklist = loadDomainChecklist();
  const byType = new Map(checklist.map(c => [c.type, c.dimensions]));
  const out: Question[] = [];
  let i = 1;
  for (const a of artifacts) {
    const dims = byType.get(a.frontmatter.type);
    if (!dims) continue;
    for (const text of dims) {
      out.push({ ref: `Q-d${i++}`, text: `[${a.frontmatter.id}] ${text}`, topic: a.frontmatter.id, round: "domain" });
    }
  }
  return out;
}
