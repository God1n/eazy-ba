import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { readSession } from "../../src/core/session.js";
import { listDecisions } from "../../src/core/decisions.js";

test("records answers as decisions, queues them for apply, and clears open questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const assessed = baAssess({ projectRoot: root });
  const q = assessed.questions[0];

  const res = baRecordAnswers({ projectRoot: root, items: [
    { question: q.text, answer: "MVP only — internal tool", asked_round: "surface", topic: q.topic },
  ] });
  expect(res.recorded).toEqual(["DEC-001"]);

  const docsRoot = join(root, "docs/ba");
  expect(listDecisions(docsRoot)).toHaveLength(1);
  const session = readSession(docsRoot)!;
  expect(session.pending_apply).toContain("DEC-001");
  expect(session.open_questions.some(oq => oq.text === q.text)).toBe(false);
});
