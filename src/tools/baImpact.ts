import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { listDecisions } from "../core/decisions.js";
import { buildImpact, type Impact } from "../core/impact.js";
import { changeQuestions } from "../core/questions.js";
import type { Question } from "../core/session.js";

export const baImpactSchema = z.object({
  projectRoot: z.string(),
  targets: z.array(z.string()).min(1),
});

export function baImpact(input: z.infer<typeof baImpactSchema>): Impact & { consequences: string; questions: Question[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const decisions = listDecisions(docsRoot);

  const known = new Set<string>([...artifacts.map(a => a.frontmatter.id), ...decisions.map(d => d.id)]);
  for (const t of input.targets) {
    if (!known.has(t)) throw new Error(`Unknown target: ${t}. It is neither an artifact nor a decision.`);
  }

  const impact = buildImpact(input.targets, artifacts, decisions);
  const questions = changeQuestions(impact.blastRadius.artifacts);
  const consequences =
    `This change affects ${impact.blastRadius.artifacts.length} artifact(s) and ` +
    `${impact.blastRadius.decisions.length} decision(s). ` +
    `Reopens committed work: ${impact.conflicts.reopened.join(", ") || "none"}. ` +
    `Severity: ${impact.severity}. Confirm before applying.`;

  return { ...impact, consequences, questions };
}
