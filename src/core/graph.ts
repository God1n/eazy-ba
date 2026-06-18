import type { Artifact } from "./types.js";

export interface Edge { from: string; to: string; kind: "implements" | "satisfies" | "refines" }
export interface Graph { ids: Set<string>; edges: Edge[]; danglingTargets: string[] }

const KINDS: Edge["kind"][] = ["implements", "satisfies", "refines"];

export function buildGraph(artifacts: Artifact[]): Graph {
  const ids = new Set(artifacts.map(a => a.frontmatter.id));
  const edges: Edge[] = [];
  for (const a of artifacts) {
    for (const kind of KINDS) {
      const targets = (a.frontmatter[kind] as string[] | undefined) ?? [];
      for (const to of targets) edges.push({ from: a.frontmatter.id, to, kind });
    }
  }
  const dangling = [...new Set(edges.map(e => e.to).filter(to => !ids.has(to)))];
  return { ids, edges, danglingTargets: dangling };
}
