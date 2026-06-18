import { z } from "zod";
import { resolveConfig } from "../config.js";
import { baCreateArtifact } from "./baCreateArtifact.js";
import { baUpdateArtifact } from "./baUpdateArtifact.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { listDecisions, markApplied } from "../core/decisions.js";
import { readSession, writeSession } from "../core/session.js";

export const baApplySchema = z.object({
  projectRoot: z.string(),
  artifacts: z.array(z.object({
    op: z.enum(["create", "update"]),
    type: z.enum(["persona", "fr", "nfr", "use-case", "story"]).optional(),
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

  const ledger = new Set(listDecisions(docsRoot).map(d => d.id));
  const applied: Array<{ id: string; op: string }> = [];
  const consumedDecisions = new Set<string>();

  for (const spec of input.artifacts) {
    for (const dec of spec.derived_from) {
      if (!ledger.has(dec)) throw new Error(`Unknown or unrecorded decision: ${dec}. Record the answer before applying.`);
    }

    let artifactId: string;
    if (spec.op === "create") {
      if (!spec.type || !spec.title) throw new Error("create requires type and title");
      const created = baCreateArtifact({
        projectRoot: input.projectRoot, type: spec.type, title: spec.title,
        priority: spec.priority, body: spec.body,
        implements: spec.implements, satisfies: spec.satisfies, refines: spec.refines,
      });
      artifactId = created.id;
    } else {
      if (!spec.id) throw new Error("update requires id");
      const updated = baUpdateArtifact({
        projectRoot: input.projectRoot, id: spec.id, title: spec.title,
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
    updated: new Date().toISOString().slice(0, 10),
  }, docsRoot);

  return { applied };
}
