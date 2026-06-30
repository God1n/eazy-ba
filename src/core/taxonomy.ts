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

export const PROVENANCES = ["user-decided", "code-verified", "corrected", "confirmed-as-inferred"] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const ProvenanceEnum = z.enum(PROVENANCES);

export const FACT_KINDS = [
  "entity-exists", "route-exists", "dependency-present", "middleware-present", "config-key-exists",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export const FactKindEnum = z.enum(FACT_KINDS);

// Auto-acceptable subset only: claim truth == anchor existence, server-checkable.
// route-exists / middleware-present / config-key-exists are inferred-by-construction
// (the server can't parse code) and deliberately excluded — they require confirmation.
export const CLOSED_FACT_KINDS: readonly FactKind[] = ["entity-exists", "dependency-present"] as const;
