import type { Frontmatter } from "./types.js";
import { nextId } from "./ids.js";
import { writeArtifact, listArtifacts } from "./store.js";

export interface DecisionInput {
  question: string;
  answer: string;
  asked_round: "surface" | "domain" | "gap";
  topic: string;
  ref?: string;
  updated?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    ...(input.ref ? { ref: input.ref } : {}),
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

export function markApplied(id: string, artifactIds: string[], docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(a => a.frontmatter.id === id && a.frontmatter.type === "decision");
  if (!artifact) throw new Error(`Decision not found: ${id}`);
  const fm = { ...artifact.frontmatter };
  const merged = new Set([...((fm.informs as string[] | undefined) ?? []), ...artifactIds]);
  fm.informs = [...merged];
  fm.applied = true;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}
