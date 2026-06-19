import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baImpact } from "../../src/tools/baImpact.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { getDecision } from "../../src/core/decisions.js";

test("change flow: impact → supersede → update → old decision obsolete", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");

  // Discover: record a decision, apply a story derived from it.
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth" }] }); // DEC-001
  const created = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Sign in", body: "Given a When b Then c", derived_from: ["DEC-001"] },
  ] });
  const usId = created.applied[0].id;

  // Answer all domain questions for the story so discovery-mode is stable.
  const domAssess = baAssess({ projectRoot: root });
  baRecordAnswers({
    projectRoot: root,
    items: domAssess.questions.map(q => ({ question: q.text, answer: "ok", asked_round: q.round as "domain" | "gap" | "surface" | "change", topic: q.topic })),
  });

  // baApply create always starts as draft; promote to approved via update so the
  // change below reopens committed work (severity medium).
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, status: "approved", derived_from: ["DEC-001"] },
  ] });

  // Change: assess impact of changing DEC-001.
  baSessionStart({ projectRoot: root, mode: "change" });
  const impact = baImpact({ projectRoot: root, targets: ["DEC-001"] });
  expect(impact.blastRadius.artifacts).toContain(usId);
  expect(impact.severity).toBe("medium"); // approved story reopened

  // Record the supersede with topic "auth" (scope-level), NOT the artifact id.
  // This marks DEC-001 obsolete but does NOT resolve the per-artifact re-validation.
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: "Change auth to OAuth?", answer: "Yes, OAuth only", asked_round: "change", topic: "auth", supersedes: ["DEC-001"] },
  ] });
  const changeDec = rec.recorded[0];

  // Old decision is obsolete and linked.
  expect(getDecision("DEC-001", docsRoot)!.status).toBe("obsolete");
  expect(getDecision("DEC-001", docsRoot)!.superseded_by).toBe(changeDec);

  // After superseding with a scope-topic decision, the story still has derived_from pointing
  // to the obsolete DEC-001 and no per-artifact change decision resolves it yet.
  // baAssess should report stable === false with a change-round question whose topic is the story id.
  const assessAfterSupersede = baAssess({ projectRoot: root });
  expect(assessAfterSupersede.stable).toBe(false);
  const changeQ = assessAfterSupersede.questions.find(q => q.round === "change" && q.topic === usId);
  expect(changeQ).toBeDefined();

  // Record a per-artifact change answer (topic = story id) to resolve the re-validation.
  const artRec = baRecordAnswers({ projectRoot: root, items: [
    { question: changeQ!.text, answer: "Story must be updated to use OAuth flow", asked_round: "change", topic: usId },
  ] });
  const artChangeDec = artRec.recorded[0];

  // Apply update to the story, citing the per-artifact change decision.
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, body: "Given a user When they use OAuth Then they sign in", status: "draft", derived_from: [artChangeDec] },
  ] });

  // Now artChangeDec has asked_round === "change" and topic === usId.
  // changeAnswered will include usId, so the story is no longer an unresolved affected artifact.
  // No domain questions are outstanding (answered above). baAssess should converge: stable === true.
  const assessFinal = baAssess({ projectRoot: root });
  expect(assessFinal.stable).toBe(true);

  // Verify story file references the per-artifact change decision.
  const files = readdirSync(join(docsRoot, "05-stories"));
  const content = readFileSync(join(docsRoot, "05-stories", files.find(f => f.includes(usId))!), "utf8");
  expect(content).toContain(artChangeDec);
});
