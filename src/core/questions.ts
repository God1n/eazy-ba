import type { Artifact } from "./types.js";
import type { Frontmatter } from "./types.js";
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

export function domainQuestions(artifacts: Artifact[], decisions: Frontmatter[] = []): Question[] {
  const checklist = loadDomainChecklist();
  const byType = new Map(checklist.map(c => [c.type, c.dimensions]));
  const answered = new Set(decisions.map(d => d.topic as string).filter(Boolean));
  const out: Question[] = [];
  let i = 1;
  for (const a of artifacts) {
    const dims = byType.get(a.frontmatter.type);
    if (!dims) continue;
    dims.forEach((text, idx) => {
      const key = `${a.frontmatter.id}#${idx}`;
      if (answered.has(key)) return;
      out.push({ ref: `Q-d${i++}`, text: `[${a.frontmatter.id}] ${text}`, topic: key, round: "domain" });
    });
  }
  return out;
}

export function changeQuestions(affectedArtifactIds: string[]): Question[] {
  return affectedArtifactIds.map((id, i) => ({
    ref: `Q-c${i + 1}`,
    text: `How does the change affect ${id}? State exactly what must change and what stays the same.`,
    topic: id,
    round: "change",
  }));
}
