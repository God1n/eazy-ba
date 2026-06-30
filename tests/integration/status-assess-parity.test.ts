import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baStatus } from "../../src/tools/baStatus.js";
import { createOrUpsertOpenItem } from "../../src/core/openItems.js";

test("ba_assess and ba_status report identical stability for the same disk state (with open-items)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-parity-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "ground" });
  const docsRoot = join(root, "docs/ba");

  // Open observation gates stability.
  createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Inferred route",
      provenance: "confirmed-as-inferred",
      fact_kind: "inferred",
      anchors: ["src/routes/users.ts#L4"],
      claim: "GET /users returns users",
    },
    docsRoot,
  );

  const assess = baAssess({ projectRoot: root });
  const status = baStatus({ projectRoot: root });
  expect(assess.stable).toBe(false);
  expect(status.stable).toBe(assess.stable);
  expect(status.openQuestions).toBe(assess.questions.length);
});
