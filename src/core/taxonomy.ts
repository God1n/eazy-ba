import { z } from "zod";

// Single source of truth for the mode/round/kind/provenance/fact-kind unions.
// Replaces the literals previously duplicated across session.ts, assessment.ts,
// decisions.ts, questions.ts, baSessionStart.ts, baRecordAnswers.ts, baStatus.ts.

export const MODES = ["discovery", "stabilize", "change", "ground"] as const;
export type Mode = (typeof MODES)[number];
export const ModeEnum = z.enum(MODES);

export const ROUNDS = ["surface", "domain", "gap", "change", "research", "confirm"] as const;
export type Round = (typeof ROUNDS)[number];
export const RoundEnum = z.enum(ROUNDS);

export const ITEM_KINDS = ["coverage-topic", "observation"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ItemKindEnum = z.enum(ITEM_KINDS);

// The open-item lifecycle. `open` gates stability; the terminal states do not.
// Mirrors the brainstorm's item_state union; kept separate from Status (which
// stays draft…obsolete for real docs).
export const ITEM_STATES = [
  "open", "answered", "confirmed", "corrected", "rejected", "retired", "applied",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

// Terminal states cannot be re-opened. A rejected/retired item re-emitted by a
// later run stays put (not resurrected), and an applied open-item has done its job.
export const TERMINAL_STATES: readonly ItemState[] = ["rejected", "retired", "applied"] as const;

export const PROVENANCES = ["user-decided", "code-verified", "corrected", "confirmed-as-inferred"] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const ProvenanceEnum = z.enum(PROVENANCES);

export const FACT_KINDS = [
  "entity-exists", "route-exists", "dependency-present", "middleware-present", "config-key-exists",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export const FactKindEnum = z.enum(FACT_KINDS);

// The floor's coverage-topics live in the reserved `floor:*` namespace, disjoint
// from the agent/user plan topics. One predicate for each side of that split so
// the `startsWith("floor:")` check is never re-spelled at a call site.
export function isFloorTopic(topic: unknown): topic is string {
  return typeof topic === "string" && topic.startsWith("floor:");
}

// A coverage-topic is part of the agent/user plan iff it is NOT a floor:* topic.
export function isPlanTopic(topic: unknown): topic is string {
  return typeof topic === "string" && !topic.startsWith("floor:");
}

// Auto-acceptable subset only: claim truth == anchor existence, server-checkable.
// route-exists / middleware-present / config-key-exists are inferred-by-construction
// (the server can't parse code) and deliberately excluded — they require confirmation.
export const CLOSED_FACT_KINDS: readonly FactKind[] = ["entity-exists", "dependency-present"] as const;

// Membership set for CLOSED_FACT_KINDS. Shared by every consumer that only needs
// a `.has(...)` check (baApply / baGround / questions) so they no longer cast the
// readonly tuple to string[] or build their own local Sets.
export const CLOSED_FACT_KINDS_SET: ReadonlySet<string> = new Set(CLOSED_FACT_KINDS);
