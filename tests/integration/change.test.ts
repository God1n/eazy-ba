import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baImpact } from "../../src/tools/baImpact.js";
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

  // Record the change as a superseding decision, then update the story.
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: "Change auth to OAuth?", answer: "Yes, OAuth only", asked_round: "change", topic: "auth", supersedes: ["DEC-001"] },
  ] });
  const changeDec = rec.recorded[0];
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, body: "Given a user When they use OAuth Then they sign in", status: "draft", derived_from: [changeDec] },
  ] });

  // Old decision is obsolete and linked; story now derives from the change decision.
  expect(getDecision("DEC-001", docsRoot)!.status).toBe("obsolete");
  expect(getDecision("DEC-001", docsRoot)!.superseded_by).toBe(changeDec);
  const files = readdirSync(join(docsRoot, "05-stories"));
  const content = readFileSync(join(docsRoot, "05-stories", files.find(f => f.includes(usId))!), "utf8");
  expect(content).toContain(changeDec);
});
