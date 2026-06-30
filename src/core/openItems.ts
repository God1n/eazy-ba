import { createHash } from "node:crypto";
import type { Frontmatter } from "./types.js";
import type { ItemKind, Provenance, FactKind } from "./taxonomy.js";
import { nextId } from "./ids.js";
import { writeArtifact, listArtifacts } from "./store.js";

// The open-item lifecycle. `open` gates stability; the terminal states do not.
// Mirrors the brainstorm's item_state union; kept separate from Status (which
// stays draft…obsolete for real docs).
export const ITEM_STATES = [
  "open", "answered", "confirmed", "corrected", "rejected", "retired", "applied",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

// Terminal states cannot be re-opened. A rejected/retired item re-emitted by a
// later run stays put (not resurrected), and an applied open-item has done its job.
const TERMINAL_STATES: readonly ItemState[] = ["rejected", "retired", "applied"] as const;

export interface OpenItemInput {
  kind: ItemKind;
  title: string;
  /** coverage-topic identity key (e.g. `floor:scope` or a declared plan topic). */
  topic?: string;
  /** observation fields. */
  provenance?: Provenance;
  fact_kind?: FactKind | "inferred";
  anchors?: string[];
  claim?: string;
  item_state?: ItemState;
  updated?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Identity / idempotency key. Coverage-topic identity is its topic verbatim;
// observation identity is a stable hash of (anchors + claim) so a re-run with
// the same evidence upserts the existing item instead of duplicating it.
export function identityKey(input: Pick<OpenItemInput, "kind" | "topic" | "anchors" | "claim">): string {
  if (input.kind === "coverage-topic") {
    const topic = input.topic;
    if (!topic) throw new Error("coverage-topic open-item requires a `topic` identity key");
    return `topic:${topic}`;
  }
  // observation: hash normalized (anchors + claim). Anchors are sorted so order
  // is not part of identity; the same evidence always hashes the same.
  const anchors = [...(input.anchors ?? [])].map(a => a.trim()).sort();
  const claim = (input.claim ?? "").trim();
  if (anchors.length === 0 && claim === "") {
    throw new Error("observation open-item requires anchors and/or a claim for identity");
  }
  const payload = JSON.stringify({ anchors, claim });
  return `obs:${createHash("sha256").update(payload).digest("hex")}`;
}

export function listOpenItems(docsRoot: string): Frontmatter[] {
  return listArtifacts(docsRoot)
    .filter(a => a.frontmatter.type === "open-item")
    .map(a => a.frontmatter);
}

export function getOpenItem(id: string, docsRoot: string): Frontmatter | undefined {
  return listOpenItems(docsRoot).find(i => i.id === id);
}

// Idempotent create/upsert. Re-calling with the same identity key returns the
// existing id and writes nothing — terminal items in particular are never
// resurrected. Mirrors baRecordAnswers' ref-dedup on read.
export function createOrUpsertOpenItem(input: OpenItemInput, docsRoot: string): string {
  const key = identityKey(input);
  const existing = listOpenItems(docsRoot).find(i => i.item_key === key);
  if (existing) return existing.id as string;

  const id = nextId("open-item", docsRoot);
  const fm: Frontmatter = {
    id,
    type: "open-item",
    title: input.title,
    status: "draft",
    version: 1,
    updated: input.updated ?? today(),
    kind: input.kind,
    item_state: input.item_state ?? "open",
    item_key: key,
    ...(input.kind === "coverage-topic" ? { topic: input.topic } : {}),
    ...(input.kind === "observation"
      ? {
          // Omit provenance entirely when unset — an inferred+open observation has
          // no provenance until the confirmation round fills it, and YAML cannot
          // dump an `undefined` value.
          ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
          fact_kind: input.fact_kind,
          anchors: input.anchors ?? [],
          claim: input.claim ?? "",
        }
      : {}),
  };
  writeArtifact({ frontmatter: fm, body: "" }, docsRoot);
  return id;
}

// Change an open-item's item_state. Refuses to move out of a terminal state
// (e.g. rejected -> open) so a terminal decision is never silently undone.
export function transitionOpenItem(id: string, toState: ItemState, docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(
    a => a.frontmatter.id === id && a.frontmatter.type === "open-item",
  );
  if (!artifact) throw new Error(`Open-item not found: ${id}`);
  const from = artifact.frontmatter.item_state as ItemState;
  if (from === toState) return; // idempotent no-op
  if (TERMINAL_STATES.includes(from)) {
    throw new Error(`Open-item ${id} is in terminal state '${from}'; cannot transition to '${toState}'.`);
  }
  const fm = { ...artifact.frontmatter };
  fm.item_state = toState;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}
