import type { Artifact } from "./types.js";
import type { Frontmatter } from "./types.js";
import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { CLOSED_FACT_KINDS } from "./taxonomy.js";
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

// Open coverage-topics (floor:* and declared plan topics) become research-round
// questions. Floor topics are coverage-topics keyed `floor:<dim>`; declared plan
// topics use their own key. Both are emitted here as the same kind of question —
// the namespaced key keeps them disjoint from domain (`artifactId#idx`) and change
// (`artifactId`) topics so previously-answered decisions never collide.
export function coverageQuestions(openItems: Frontmatter[]): Question[] {
  const out: Question[] = [];
  let i = 1;
  for (const oi of openItems) {
    if (oi.kind !== "coverage-topic" || oi.item_state !== "open") continue;
    const topic = oi.topic as string;
    out.push({
      ref: `Q-r${i++}`,
      text: `Cover topic "${topic}": what does the user need here?`,
      topic,
      round: "research",
    });
  }
  return out;
}

// Open inferred observations need user confirmation (round "confirm"). Only
// observations that are still `open` AND whose fact_kind is `inferred` (i.e. NOT
// in the auto-acceptable closed set) gate stability — a code-verified/closed-set
// fact is self-evident and an already-confirmed/rejected one is terminal.
export function observationQuestions(openItems: Frontmatter[]): Question[] {
  const closed = new Set<string>(CLOSED_FACT_KINDS);
  const out: Question[] = [];
  let i = 1;
  for (const oi of openItems) {
    if (oi.kind !== "observation" || oi.item_state !== "open") continue;
    const factKind = oi.fact_kind as string | undefined;
    // Auto-acceptable facts are not confirmation-gated.
    if (factKind && closed.has(factKind)) continue;
    if (factKind && factKind !== "inferred") continue;
    const claim = (oi.claim as string | undefined) ?? oi.title;
    out.push({
      ref: `Q-cf${i++}`,
      text: `Confirm or correct this inferred observation: ${claim}`,
      topic: oi.id,
      round: "confirm",
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
