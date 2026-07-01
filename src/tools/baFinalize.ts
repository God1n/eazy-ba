import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { baUpdateArtifact } from "./baUpdateArtifact.js";
import type { ArtifactType } from "../core/types.js";

export const baFinalizeSchema = z.object({ projectRoot: z.string() });

// The real BA documents finalize promotes: the file-backed types that ba_apply
// materializes (persona/fr/nfr/use-case/story/glossary/tech-surface). Decisions
// and open-items are the decision trail / coverage ledger, not deliverables, so
// they are deliberately excluded — finalize only stamps the user-facing docs.
const FINALIZABLE_TYPES = new Set<ArtifactType>([
  "persona", "fr", "nfr", "use-case", "story", "glossary", "tech-surface",
]);

// ba_finalize (Flow 1 R9/R10): the clean "here are your docs" step. Batch-promotes
// every `draft` real BA doc to `reviewed` (an existing Status value — fewest
// mechanisms; no new status is invented). It mirrors baUpdateArtifact's single-
// artifact promotion over the whole draft set.
//
// Idempotent + repeatable (R10): only `draft` docs are promoted, so a second call
// with nothing in draft is a no-op (promotes nothing, does not throw). After the
// Phase B change loop re-opens/creates new drafts, the next call promotes those.
//
// Gate-neutral: finalize changes only `status` (draft→reviewed). It never touches
// derived_from/backing, so the anti-assumption gate (ba_apply) is unaffected.
export function baFinalize(input: z.infer<typeof baFinalizeSchema>):
  { promoted: Array<{ id: string; status: "reviewed" }> } {
  const { docsRoot } = resolveConfig(input.projectRoot);

  // Snapshot the draft set up front. baUpdateArtifact rewrites files (and may move
  // the slug-keyed path on a title change), so resolve ids before mutating.
  const drafts = listArtifacts(docsRoot)
    .filter(a => FINALIZABLE_TYPES.has(a.frontmatter.type) && a.frontmatter.status === "draft")
    .map(a => a.frontmatter.id);

  const promoted: Array<{ id: string; status: "reviewed" }> = [];
  for (const id of drafts) {
    baUpdateArtifact({ projectRoot: input.projectRoot, id, status: "reviewed" });
    promoted.push({ id, status: "reviewed" });
  }
  return { promoted };
}
