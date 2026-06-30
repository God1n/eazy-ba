import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession } from "../core/session.js";
import { createOrUpsertOpenItem, getOpenItem } from "../core/openItems.js";
import { CLOSED_FACT_KINDS, FactKindEnum } from "../core/taxonomy.js";
import type { FactKind } from "../core/taxonomy.js";
import { anchorsAllVerify } from "../core/ground.js";

// ba_ground (Flow 2 R1/R2/R3/R4/R10) — the ONLY tool that touches code. The host
// agent reads the project (the server cannot parse code) and supplies observations;
// the server re-verifies what it can and records each as an `observation` open-item.
//
// Auto-accept is intentionally narrow. An observation auto-accepts ONLY IF its
// fact_kind is in CLOSED_FACT_KINDS (entity-exists | dependency-present) AND every
// anchor re-verifies (resolves on disk + inside the user-declared session scope).
// Anchor-resolves proves existence, not arbitrary claim truth — so route-exists /
// middleware-present / config-key-exists (and anything mislabeled, or out of scope,
// or unresolvable) fail SAFE to inferred+open and become confirm-round questions.
//
// item_state choice: an auto-accepted CLOSED fact is recorded `confirmed`, not
// `open`. It is still backable by the ba_apply gate (CLOSED facts are backable
// regardless of item_state), but as a NON-open item it does not surface as an open
// confirm-question and does not gate stability forever. Inferred observations stay
// `open` so they gate stability (Unit 3) until the user confirms or corrects them.

const ObservationInput = z.object({
  // The agent's label. "inferred" is accepted explicitly; anything else must be a
  // known FactKind. Mislabeled or unverifiable observations are downgraded below.
  fact_kind: z.union([FactKindEnum, z.literal("inferred")]),
  claim: z.string().min(1),
  // File or file#symbol references. Required for identity and re-verification.
  anchors: z.array(z.string().min(1)).default([]),
});

export const baGroundSchema = z.object({
  projectRoot: z.string(),
  observations: z.array(ObservationInput).min(1),
});

export interface GroundedObservation {
  id: string;
  claim: string;
  anchors: string[];
  fact_kind: FactKind | "inferred";
  item_state: string;
  provenance?: string;
  autoAccepted: boolean;
}

export interface BaGroundResult {
  recorded: GroundedObservation[];
  autoAccepted: number;
  inferred: number;
  scope: string[];
}

const CLOSED = new Set<string>(CLOSED_FACT_KINDS);

export function baGround(input: z.infer<typeof baGroundSchema>): BaGroundResult {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");
  if (session.mode !== "ground") {
    throw new Error(`ba_ground requires a 'ground' session; current mode is '${session.mode}'.`);
  }
  // Scope is the user-declared boundary from ba_session_start. Absent scope means
  // nothing is in scope, so every observation fails safe to inferred.
  const scope = session.read_scope ?? [];

  const recorded: GroundedObservation[] = [];

  for (const obs of input.observations) {
    const claim = obs.claim.trim();
    const anchors = obs.anchors.map(a => a.trim()).filter(Boolean);

    // Auto-accept gate: CLOSED fact_kind AND every anchor re-verifies (resolves +
    // in scope). The label alone is never trusted — re-verification is required.
    const labelAutoAcceptable = CLOSED.has(obs.fact_kind);
    const verified = labelAutoAcceptable && anchorsAllVerify(anchors, input.projectRoot, scope);

    // Idempotent upsert by (anchors+claim). createOrUpsertOpenItem returns the
    // existing id and writes nothing on a re-run, so a previously confirmed or
    // rejected observation is never silently re-classified by a later call. We
    // therefore read the STORED item back and report from it — authoritative.
    const id = verified
      ? createOrUpsertOpenItem(
          {
            kind: "observation",
            title: claim,
            claim,
            anchors,
            fact_kind: obs.fact_kind,
            provenance: "code-verified",
            item_state: "confirmed",
          },
          docsRoot,
        )
      : createOrUpsertOpenItem(
          {
            // Fail-safe: not in the closed set, or an anchor didn't resolve / was
            // out of scope. Recorded as inferred+open regardless of the agent's
            // label; provenance is left for the confirmation round to fill.
            kind: "observation",
            title: claim,
            claim,
            anchors,
            fact_kind: "inferred",
            item_state: "open",
          },
          docsRoot,
        );

    const stored = getOpenItem(id, docsRoot);
    const factKind = (stored?.fact_kind as FactKind | "inferred" | undefined) ?? "inferred";
    const itemState = (stored?.item_state as string | undefined) ?? "open";
    const provenance = stored?.provenance as string | undefined;
    recorded.push({
      id,
      claim,
      anchors,
      fact_kind: factKind,
      item_state: itemState,
      ...(provenance ? { provenance } : {}),
      // "Auto-accepted" reflects the stored truth: a CLOSED, code-verified,
      // non-open item. A re-run of an out-of-scope obs that was already inferred
      // stays inferred (autoAccepted:false), matching the store.
      autoAccepted: CLOSED.has(factKind) && itemState === "confirmed",
    });
  }

  const autoAccepted = recorded.filter(r => r.autoAccepted).length;
  return {
    recorded,
    autoAccepted,
    inferred: recorded.length - autoAccepted,
    scope,
  };
}
