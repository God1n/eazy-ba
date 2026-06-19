import type { Artifact, Frontmatter } from "./types.js";

export interface Impact {
  blastRadius: { artifacts: string[]; decisions: string[] };
  conflicts: { reopened: string[]; contradicted: string[] };
  severity: "low" | "medium" | "high";
}

const EDGE_KINDS = ["implements", "satisfies", "refines"] as const;

export function buildImpact(targets: string[], artifacts: Artifact[], decisions: Frontmatter[]): Impact {
  const artifactById = new Map(artifacts.map(a => [a.frontmatter.id, a]));
  const decisionById = new Map(decisions.map(d => [d.id, d]));

  // Seed affected artifacts.
  const affected = new Set<string>();
  for (const t of targets) {
    if (artifactById.has(t)) affected.add(t);
    if (decisionById.has(t)) {
      for (const a of artifacts) {
        const df = (a.frontmatter.derived_from as string[] | undefined) ?? [];
        if (df.includes(t)) affected.add(a.frontmatter.id);
      }
    }
  }

  // Transitive closure over dependents (x depends on an affected id via its edges).
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of artifacts) {
      if (affected.has(a.frontmatter.id)) continue;
      const points = EDGE_KINDS.flatMap(k => (a.frontmatter[k] as string[] | undefined) ?? []);
      if (points.some(p => affected.has(p))) { affected.add(a.frontmatter.id); grew = true; }
    }
  }

  const blastArtifacts = [...affected];
  const blastDecisions = new Set<string>();
  for (const t of targets) if (decisionById.has(t)) blastDecisions.add(t);
  for (const a of artifacts) {
    if (!affected.has(a.frontmatter.id)) continue;
    for (const id of ((a.frontmatter.derived_from as string[] | undefined) ?? [])) {
      const d = decisionById.get(id);
      if (d && d.status !== "obsolete") blastDecisions.add(id);
    }
  }

  const reopened = blastArtifacts.filter(id => {
    const s = artifactById.get(id)!.frontmatter.status;
    return s === "approved" || s === "implemented";
  });
  const contradicted = targets.filter(t => decisionById.has(t));

  const anyImplemented = reopened.some(id => artifactById.get(id)!.frontmatter.status === "implemented");
  const anyApproved = reopened.some(id => artifactById.get(id)!.frontmatter.status === "approved");
  const total = blastArtifacts.length + blastDecisions.size;
  const severity: Impact["severity"] = anyImplemented ? "high" : (anyApproved || total >= 5) ? "medium" : "low";

  return {
    blastRadius: { artifacts: blastArtifacts, decisions: [...blastDecisions] },
    conflicts: { reopened, contradicted },
    severity,
  };
}
