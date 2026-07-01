import type { Artifact } from "./types.js";
import { NON_TRACEABLE_TYPES } from "./types.js";
import { buildGraph } from "./graph.js";

export interface Gap { kind: string; subject: string; message: string }

const TRACED_TYPES = new Set(["persona", "fr", "nfr", "use-case", "story"]);

// Descriptive (tech-surface/glossary) and open-item artifacts are not normative
// as-is docs: they must not be flagged untraced or fed into fr-without-story
// reasoning. computeAssessment already filters them out of the artifact list;
// this guard keeps detectGaps correct even if called with an unfiltered list.
// Shared with computeAssessment via NON_TRACEABLE_TYPES so the two never drift.
const NON_GAP_TYPES = new Set<string>(NON_TRACEABLE_TYPES);

export function detectGaps(artifactsIn: Artifact[]): Gap[] {
  const gaps: Gap[] = [];
  const artifacts = artifactsIn.filter(a => !NON_GAP_TYPES.has(a.frontmatter.type));
  const stories = artifacts.filter(a => a.frontmatter.type === "story");

  for (const a of artifacts) {
    const fm = a.frontmatter;

    if (fm.type === "story" && !/\bGiven\b/.test(a.body)) {
      gaps.push({ kind: "story-without-acceptance-criteria", subject: fm.id,
        message: `Story ${fm.id} has no Given/When/Then acceptance criteria.` });
    }

    if (fm.type === "fr") {
      const hasStory = stories.some(s => ((s.frontmatter.implements as string[] | undefined) ?? []).includes(fm.id));
      if (!hasStory) {
        gaps.push({ kind: "fr-without-story", subject: fm.id,
          message: `Functional requirement ${fm.id} has no user story implementing it.` });
      }
    }

    if (TRACED_TYPES.has(fm.type) && !((fm.derived_from as string[] | undefined) ?? []).length) {
      gaps.push({ kind: "untraced-artifact", subject: fm.id,
        message: `Artifact ${fm.id} is not derived from any recorded decision.` });
    }
  }

  for (const id of buildGraph(artifacts).danglingTargets) {
    gaps.push({ kind: "dangling-link", subject: id,
      message: `Referenced id ${id} does not exist as an artifact.` });
  }

  return gaps;
}
