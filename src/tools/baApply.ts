import { z } from "zod";
import { resolveConfig } from "../config.js";
import { baCreateArtifact } from "./baCreateArtifact.js";
import { baUpdateArtifact } from "./baUpdateArtifact.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { listDecisions, markApplied } from "../core/decisions.js";
import { listOpenItems } from "../core/openItems.js";
import { today } from "../core/ids.js";
import { readSession, writeSession } from "../core/session.js";
import { CLOSED_FACT_KINDS_SET } from "../core/taxonomy.js";
import { NORMATIVE_TYPES } from "../core/types.js";
import type { Frontmatter, ArtifactType } from "../core/types.js";
import type { Provenance, FactKind } from "../core/taxonomy.js";

export const baApplySchema = z.object({
  projectRoot: z.string(),
  artifacts: z.array(z.object({
    op: z.enum(["create", "update"]),
    type: z.enum(["persona", "fr", "nfr", "use-case", "story", "glossary", "tech-surface"]).optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    priority: z.enum(["must", "should", "could", "wont"]).optional(),
    status: z.enum(["draft", "reviewed", "approved", "implemented", "obsolete"]).optional(),
    body: z.string().optional(),
    implements: z.array(z.string()).optional(),
    satisfies: z.array(z.string()).optional(),
    refines: z.array(z.string()).optional(),
    derived_from: z.array(z.string()).min(1),
  })).min(1),
});

// The artifact type a spec resolves to, for the normative gate. For create it is
// the declared type; for update it is read from the existing artifact on disk.
function applyTypeOf(
  spec: { op: "create" | "update"; type?: string; id?: string },
  docsRoot: string,
): ArtifactType | undefined {
  if (spec.op === "create") return spec.type as ArtifactType | undefined;
  const existing = listArtifacts(docsRoot).find(a => a.frontmatter.id === spec.id);
  return existing?.frontmatter.type;
}

function stampDerivedFrom(artifactId: string, derivedFrom: string[], docsRoot: string): void {
  const a = listArtifacts(docsRoot).find(x => x.frontmatter.id === artifactId);
  if (!a) throw new Error(`Artifact not found after write: ${artifactId}`);
  const fm = { ...a.frontmatter };
  const merged = new Set([...((fm.derived_from as string[] | undefined) ?? []), ...derivedFrom]);
  fm.derived_from = [...merged];
  writeArtifact({ frontmatter: fm, body: a.body }, docsRoot);
}

export function baApply(input: z.infer<typeof baApplySchema>): { applied: Array<{ id: string; op: string }> } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  // Resolve each derived_from id against BOTH stores: the decision ledger and the
  // open-item store. The original ledger only held type:"decision" ids, so an
  // observation backing was invisible to the gate.
  const decisions = new Map(listDecisions(docsRoot).map(d => [d.id, d] as const));
  const openItems = new Map(listOpenItems(docsRoot).map(i => [i.id as string, i] as const));

  // An open-item observation is BACKABLE iff its claim is server-checkable
  // (fact_kind ∈ CLOSED_FACT_KINDS) OR it has been deliberately resolved
  // (item_state ∈ {confirmed, corrected}). An inferred+open observation is
  // rejected by the same throw as an unrecorded decision.
  function isBackableObservation(item: Frontmatter): boolean {
    if (item.kind !== "observation") return false;
    const factKind = item.fact_kind as FactKind | "inferred" | undefined;
    const inClosedSet = factKind !== undefined && CLOSED_FACT_KINDS_SET.has(factKind);
    const itemState = item.item_state as string | undefined;
    const resolved = itemState === "confirmed" || itemState === "corrected";
    return inClosedSet || resolved;
  }

  // The provenance of a backing, for the fact≠requirement check.
  //   - decision: its frontmatter `provenance` (defaults user-decided historically).
  //   - backing observation: a CLOSED fact is "code-verified"; a confirmed/corrected
  //     observation carries its own provenance frontmatter.
  function backingProvenance(dec: string): Provenance | undefined {
    const d = decisions.get(dec);
    if (d) return (d.provenance as Provenance | undefined) ?? "user-decided";
    const item = openItems.get(dec);
    if (item && isBackableObservation(item)) {
      const factKind = item.fact_kind as FactKind | "inferred" | undefined;
      if (factKind !== undefined && CLOSED_FACT_KINDS_SET.has(factKind)) {
        return "code-verified";
      }
      return item.provenance as Provenance | undefined;
    }
    return undefined;
  }

  function isBackable(dec: string): boolean {
    if (decisions.has(dec)) return true;
    const item = openItems.get(dec);
    return item !== undefined && isBackableObservation(item);
  }

  // pre-flight: validate EVERY spec's invariants and cited backings across the
  // whole batch before writing anything, so a bad spec never leaves partial writes.
  for (const spec of input.artifacts) {
    if (spec.op === "create") {
      if (!spec.type || !spec.title) throw new Error("create requires type and title");
      if (spec.status) throw new Error("ba_apply create cannot set status; create as draft then update it.");
    } else {
      if (!spec.id) throw new Error("update requires id");
      if (spec.implements || spec.satisfies || spec.refines) {
        throw new Error("ba_apply update does not support changing implements/satisfies/refines yet; create the link via a new artifact or edit the file directly.");
      }
    }
    for (const dec of spec.derived_from) {
      if (!isBackable(dec)) throw new Error(`Unknown or unrecorded decision: ${dec}. Record the answer before applying.`);
    }

    // fact ≠ requirement (content-blind, type-level): a normative artifact requires
    // at least one DELIBERATE backing (user-decided or corrected). code-verified
    // facts and confirmed-as-inferred passive assent do NOT satisfy this.
    const applyType = applyTypeOf(spec, docsRoot);
    // Fix 8: an update whose target id is not found resolves to `undefined` type,
    // which would otherwise SKIP the normative gate and only fail mid-batch in the
    // write loop (leaving partial writes). Reject it here, before any write.
    if (spec.op === "update" && applyType === undefined) {
      throw new Error(`update target not found: ${spec.id}. Cannot update an artifact that does not exist.`);
    }
    if (applyType && NORMATIVE_TYPES.includes(applyType)) {
      const hasDeliberate = spec.derived_from.some(dec => {
        const p = backingProvenance(dec);
        return p === "user-decided" || p === "corrected";
      });
      if (!hasDeliberate) {
        throw new Error(`Normative artifact requires a deliberate decision (fact≠requirement): at least one user-decided or corrected backing in derived_from.`);
      }
    }
  }

  const applied: Array<{ id: string; op: string }> = [];
  const consumedDecisions = new Set<string>();

  for (const spec of input.artifacts) {
    let artifactId: string;
    if (spec.op === "create") {
      const created = baCreateArtifact({
        projectRoot: input.projectRoot, type: spec.type!, title: spec.title!,
        priority: spec.priority, body: spec.body,
        implements: spec.implements, satisfies: spec.satisfies, refines: spec.refines,
      });
      artifactId = created.id;
    } else {
      const updated = baUpdateArtifact({
        projectRoot: input.projectRoot, id: spec.id!, title: spec.title,
        status: spec.status, priority: spec.priority, body: spec.body,
      });
      artifactId = updated.id;
    }

    stampDerivedFrom(artifactId, spec.derived_from, docsRoot);
    for (const dec of spec.derived_from) {
      markApplied(dec, [artifactId], docsRoot);
      consumedDecisions.add(dec);
    }
    applied.push({ id: artifactId, op: spec.op });
  }

  writeSession({
    ...session,
    pending_apply: session.pending_apply.filter(d => !consumedDecisions.has(d)),
    updated: today(),
  }, docsRoot);

  return { applied };
}
