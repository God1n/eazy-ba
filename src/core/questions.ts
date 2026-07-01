import type { Artifact } from "./types.js";
import type { Frontmatter } from "./types.js";
import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { CLOSED_FACT_KINDS_SET } from "./taxonomy.js";
import type { OpenItemInput } from "./openItems.js";
import { loadSurfaceQuestions, loadDomainChecklist } from "./knowledge.js";

// ---------------------------------------------------------------------------
// The floor (Flow 1 R5a/R5b/R6): a fixed, artifact-independent baseline of BA
// coverage *dimensions*, keyed `floor:<dimension>`. Seeded as open coverage-topic
// open-items when a discovery session enters the deep round (see ba_assess write
// path) so floor-only discovery converges and the floor survives an empty project.
//
// Sourced by re-anchoring the existing knowledge to DIMENSIONS (not artifacts):
//  - the surface bank's topics (problem/scope/users/success/constraints) carry over
//    as the broad framing dimensions;
//  - the domain checklist's per-artifact dimensions (failure/error paths, edge cases,
//    measurable NFR targets) are lifted to artifact-independent dimensions
//    (data, states, errors, nfr, integrations).
// Keys are namespaced `floor:*`, disjoint from domain `artifactId#idx` and change
// `artifactId` topics, so a previously-answered project never re-opens (R6).
// ---------------------------------------------------------------------------
export interface FloorTopic { topic: string; prompt: string }

export const FLOOR_TOPICS: readonly FloorTopic[] = [
  { topic: "floor:problem", prompt: "What core problem does this product solve, and for whom? State it in one or two concrete sentences." },
  { topic: "floor:scope", prompt: "What is explicitly in scope for the first version, and what is explicitly out of scope?" },
  { topic: "floor:users", prompt: "Who are the main user types or roles, and what is each one trying to accomplish?" },
  { topic: "floor:data", prompt: "What are the key entities and data the system holds, and what are their important fields and relationships?" },
  { topic: "floor:states", prompt: "What are the important states and transitions (lifecycles, status flows) the system must represent?" },
  { topic: "floor:errors", prompt: "What should happen on the main failure, error, and edge-case paths (empty, maximum, concurrent, offline)?" },
  { topic: "floor:nfr", prompt: "What measurable non-functional targets matter (performance, scale, availability, security) and under what conditions must they hold?" },
  { topic: "floor:constraints", prompt: "Are there hard constraints — deadlines, platforms, regulations, or systems it must integrate with?" },
  { topic: "floor:integrations", prompt: "What external systems, services, or APIs must this integrate with, and what does each exchange?" },
  { topic: "floor:success", prompt: "How will success be measured? What outcome or metric matters most?" },
] as const;

// Coverage-topic open-item inputs for the whole floor. Used by the ba_assess
// write path to seed (idempotently) on deep-round entry. The prompt is carried as
// the open-item title so it round-trips as a human-readable question.
export function floorOpenItemInputs(): OpenItemInput[] {
  return FLOOR_TOPICS.map(t => ({
    kind: "coverage-topic" as const,
    title: t.prompt,
    topic: t.topic,
  }));
}

export function surfaceQuestions(): Question[] {
  return loadSurfaceQuestions().map((q, i) => ({
    ref: `Q-s${i + 1}`, text: q.text, topic: q.topic, round: "surface",
    // Pass through server-seeded options where the bank defines them (only the
    // genuinely-fixed questions, e.g. constraints); the agent generates the rest.
    ...(q.options && q.options.length > 0 ? { options: q.options } : {}),
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
    // Floor and plan topics carry a human-readable prompt as their title; fall
    // back to the generic phrasing for topics created without one.
    const prompt = (oi.title as string | undefined)?.trim();
    const text = prompt && prompt.length > 0
      ? prompt
      : `Cover topic "${topic}": what does the user need here?`;
    out.push({ ref: `Q-r${i++}`, text, topic, round: "research" });
  }
  return out;
}

// Open inferred observations need user confirmation (round "confirm"). Only
// observations that are still `open` AND whose fact_kind is `inferred` (i.e. NOT
// in the auto-acceptable closed set) gate stability — a code-verified/closed-set
// fact is self-evident and an already-confirmed/rejected one is terminal.
export function observationQuestions(openItems: Frontmatter[]): Question[] {
  const closed = CLOSED_FACT_KINDS_SET;
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
