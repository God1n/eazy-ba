import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";

test("interrogative loop converges to stable after all domain questions are answered", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-conv-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });

  // Record one surface answer to advance past the surface round.
  const surface = baAssess({ projectRoot: root });
  expect(surface.round).toBe("surface");
  const rec = baRecordAnswers({
    projectRoot: root,
    items: [{ question: surface.questions[0].text, answer: "An internal tool", asked_round: "surface", topic: surface.questions[0].topic }],
  });

  // Apply a batch: fr first (becomes FR-001), then a story that implements it.
  baApply({
    projectRoot: root,
    artifacts: [
      { op: "create", type: "fr", title: "Login", body: "FR body", derived_from: rec.recorded },
      { op: "create", type: "story", title: "Sign in", body: "Given a When b Then c", implements: ["FR-001"], derived_from: rec.recorded },
    ],
  });

  // First baAssess: should not be stable — domain questions are pending.
  const first = baAssess({ projectRoot: root });
  expect(first.stable).toBe(false);
  expect(first.round).toBe("domain");
  expect(first.questions.length).toBeGreaterThan(0);

  const qs = first.questions;

  // Record every domain question verbatim, passing topic and asked_round back.
  baRecordAnswers({
    projectRoot: root,
    items: qs.map(q => ({ question: q.text, answer: "ok", asked_round: q.round as "domain", topic: q.topic })),
  });

  // Second baAssess: all domain dimensions answered — should be stable.
  const second = baAssess({ projectRoot: root });
  expect(second.questions.length).toBeLessThan(qs.length);
  expect(second.stable).toBe(true);
});
