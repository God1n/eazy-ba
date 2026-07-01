import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baGround } from "../../src/tools/baGround.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baFinalize } from "../../src/tools/baFinalize.js";
import { baStatus } from "../../src/tools/baStatus.js";
import { listArtifacts } from "../../src/core/store.js";
import { listDecisions } from "../../src/core/decisions.js";
import { listOpenItems } from "../../src/core/openItems.js";
import { NORMATIVE_TYPES } from "../../src/core/types.js";
import { CLOSED_FACT_KINDS } from "../../src/core/taxonomy.js";

// Full Flow 2: ground an existing codebase → auto-accept a fact, confirm an
// inference → materialize a descriptive as-is doc (backed by the fact) and an fr
// (backed by the confirmation) → finalize → stable. The closing assertion is the
// spine's safety property: NO normative artifact rests on code-verified- or
// confirmed-as-inferred-only backing.
test("full Flow 2 grounds, confirms, materializes as-is + fr, finalizes, and converges stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-flow2-"));
  mkdirSync(join(root, "src"), { recursive: true });
  // entity-exists fact: a resolving, in-scope anchor → auto-accepted.
  writeFileSync(join(root, "src", "user.ts"), "export class User {}\n");
  // route-exists is inferred-by-construction → must be confirmed.
  writeFileSync(join(root, "src", "routes.ts"), "// GET /users\n");
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "ground", readScope: ["src/**"] });
  const docsRoot = join(root, "docs/ba");

  // Fresh ground session → ba_assess returns a ground directive.
  const ground0 = baAssess({ projectRoot: root });
  expect(ground0.groundDirective).toBeTruthy();

  // Agent reads the code and grounds: one auto-accept fact + one inferred route.
  const grounded = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "User entity exists", anchors: ["src/user.ts#User"] },
      { fact_kind: "route-exists", claim: "GET /users route exists", anchors: ["src/routes.ts"] },
    ],
  });
  expect(grounded.autoAccepted).toBe(1);
  expect(grounded.inferred).toBe(1);
  const factObs = grounded.recorded.find(r => r.fact_kind === "entity-exists")!;
  const routeObs = grounded.recorded.find(r => r.fact_kind === "inferred")!;
  expect(factObs.item_state).toBe("confirmed");
  expect(factObs.provenance).toBe("code-verified");
  expect(routeObs.item_state).toBe("open");

  // The inferred route surfaces as a confirm-round question; not yet stable.
  const afterGround = baAssess({ projectRoot: root });
  expect(afterGround.questions.some(q => q.round === "confirm" && q.topic === routeObs.id)).toBe(true);
  expect(afterGround.stable).toBe(false);

  // The user deliberately confirms the inferred route → user-decided decision.
  const confirmed = baRecordAnswers({
    projectRoot: root,
    items: [
      {
        question: "Confirm or correct this inferred observation: GET /users route exists",
        answer: "GET /users route exists",
        asked_round: "confirm",
        topic: routeObs.id,
      },
    ],
  });
  const routeDecision = confirmed.recorded[0];
  expect(listDecisions(docsRoot).find(d => d.id === routeDecision)!.provenance).toBe("user-decided");

  // Materialize: a DESCRIPTIVE glossary backed by the auto-accepted fact (code-verified
  // is allowed for descriptive), and an NORMATIVE fr backed by the user-decided confirmation.
  const applied = baApply({
    projectRoot: root,
    artifacts: [
      { op: "create", type: "glossary", title: "User", body: "A registered account holder.", derived_from: [factObs.id] },
      { op: "create", type: "fr", title: "List users", body: "The system exposes GET /users.", derived_from: [routeDecision] },
    ],
  });
  expect(applied.applied).toHaveLength(2);
  const glossary = applied.applied.find(a => a.id.startsWith("GLO"));
  const fr = applied.applied.find(a => a.id.startsWith("FR"));
  expect(glossary).toBeTruthy();
  expect(fr).toBeTruthy();

  // The fr — like any normative requirement — now drives the normal loop: domain
  // questions + an fr-without-story gap. Add the implementing story (its
  // user-decided confirmation backing also backs the story), then drive the
  // interrogative loop to a fixed point so the full Flow 2 loop CONVERGES.
  expect(baAssess({ projectRoot: root }).stable).toBe(false);
  baApply({
    projectRoot: root,
    artifacts: [
      {
        op: "create",
        type: "story",
        title: "List users via API",
        body: "Given an admin When they call GET /users Then a user list returns",
        implements: [fr!.id],
        derived_from: [routeDecision],
      },
    ],
  });

  // Answer every domain question round by round until the loop stabilizes.
  for (let i = 0; i < 10; i++) {
    const a = baAssess({ projectRoot: root });
    if (a.stable) break;
    const domainQs = a.questions.filter(q => q.round === "domain");
    expect(domainQs.length, "loop must make progress via domain questions").toBeGreaterThan(0);
    baRecordAnswers({
      projectRoot: root,
      items: domainQs.map(q => ({
        question: q.text,
        answer: "Specified by the user.",
        asked_round: "domain" as const,
        topic: q.topic,
      })),
    });
  }

  // Finalize: drafts promote to reviewed.
  const promoted = baFinalize({ projectRoot: root });
  expect(promoted.promoted.length).toBeGreaterThanOrEqual(3);

  // Converged: ba_status reports stable (no open confirm-questions, no gaps).
  const status = baStatus({ projectRoot: root });
  expect(status.stable).toBe(true);

  // ── Safety property: no normative artifact rests on code-verified- or
  // confirmed-as-inferred-only backing. Every normative artifact has ≥1
  // user-decided/corrected backing.
  const decById = new Map(listDecisions(docsRoot).map(d => [d.id as string, d]));
  const obsById = new Map(listOpenItems(docsRoot).map(o => [o.id as string, o]));
  const closed = new Set<string>(CLOSED_FACT_KINDS);
  function backingProvenance(id: string): string | undefined {
    const d = decById.get(id);
    if (d) return (d.provenance as string | undefined) ?? "user-decided";
    const o = obsById.get(id);
    if (!o) return undefined;
    const fk = o.fact_kind as string | undefined;
    if (fk && closed.has(fk)) return "code-verified";
    return o.provenance as string | undefined;
  }
  const normativeArtifacts = listArtifacts(docsRoot).filter(a =>
    NORMATIVE_TYPES.includes(a.frontmatter.type),
  );
  expect(normativeArtifacts.length).toBeGreaterThan(0);
  for (const a of normativeArtifacts) {
    const df = (a.frontmatter.derived_from as string[] | undefined) ?? [];
    const hasDeliberate = df.some(id => {
      const p = backingProvenance(id);
      return p === "user-decided" || p === "corrected";
    });
    expect(hasDeliberate, `${a.frontmatter.id} must rest on a deliberate backing`).toBe(true);
  }
});
