import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import {
  createOrUpsertOpenItem,
  listOpenItems,
  getOpenItem,
  transitionOpenItem,
} from "../../src/core/openItems.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  return join(root, "docs/ba");
}

test("creates a coverage-topic and an observation; listOpenItems returns both with correct kind", () => {
  const docsRoot = setup();
  const ctId = createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Scope coverage", topic: "floor:scope" },
    docsRoot,
  );
  const obsId = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Express app entry exists",
      provenance: "code-verified",
      fact_kind: "entity-exists",
      anchors: ["src/app.ts#L1-L20"],
      claim: "The Express app is bootstrapped in src/app.ts",
    },
    docsRoot,
  );
  expect(ctId).toBe("OPI-001");
  expect(obsId).toBe("OPI-002");

  const items = listOpenItems(docsRoot);
  expect(items).toHaveLength(2);
  const byId = new Map(items.map(i => [i.id, i]));
  expect(byId.get(ctId)!.kind).toBe("coverage-topic");
  expect(byId.get(obsId)!.kind).toBe("observation");
  // every open-item is created in the "open" state by default.
  expect(byId.get(ctId)!.item_state).toBe("open");
  expect(byId.get(obsId)!.item_state).toBe("open");
});

test("re-upsert the same (anchors+claim) observation returns the same id (no duplicate)", () => {
  const docsRoot = setup();
  const first = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Route GET /users",
      provenance: "confirmed-as-inferred",
      fact_kind: "route-exists",
      anchors: ["src/routes/users.ts#L4"],
      claim: "GET /users returns a list of users",
    },
    docsRoot,
  );
  const second = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "different title, same identity",
      provenance: "confirmed-as-inferred",
      fact_kind: "route-exists",
      anchors: ["src/routes/users.ts#L4"],
      claim: "GET /users returns a list of users",
    },
    docsRoot,
  );
  expect(second).toBe(first);
  expect(listOpenItems(docsRoot)).toHaveLength(1);
});

test("re-declare the same coverage-topic returns the same id (no duplicate)", () => {
  const docsRoot = setup();
  const first = createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Users coverage", topic: "floor:users" },
    docsRoot,
  );
  const second = createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Users coverage redux", topic: "floor:users" },
    docsRoot,
  );
  expect(second).toBe(first);
  expect(listOpenItems(docsRoot)).toHaveLength(1);
});

test("retiring an item excludes it from the open set", () => {
  const docsRoot = setup();
  const id = createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Error states", topic: "floor:errors" },
    docsRoot,
  );
  transitionOpenItem(id, "retired", docsRoot);
  const open = listOpenItems(docsRoot).filter(i => i.item_state === "open");
  expect(open.map(i => i.id)).not.toContain(id);
  expect(getOpenItem(id, docsRoot)!.item_state).toBe("retired");
});

test("a rejected observation re-upserted by a later run stays rejected (not resurrected)", () => {
  const docsRoot = setup();
  const input = {
    kind: "observation" as const,
    title: "Inferred middleware",
    provenance: "confirmed-as-inferred" as const,
    fact_kind: "middleware-present" as const,
    anchors: ["src/mw/auth.ts#L10"],
    claim: "auth middleware guards /admin",
  };
  const id = createOrUpsertOpenItem(input, docsRoot);
  transitionOpenItem(id, "rejected", docsRoot);

  // a later ground run re-emits the identical observation.
  const again = createOrUpsertOpenItem(input, docsRoot);
  expect(again).toBe(id);
  expect(getOpenItem(id, docsRoot)!.item_state).toBe("rejected");
  expect(listOpenItems(docsRoot)).toHaveLength(1);
});

test("transition from a terminal state (rejected -> open) is refused", () => {
  const docsRoot = setup();
  const id = createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Data model", topic: "floor:data" },
    docsRoot,
  );
  transitionOpenItem(id, "rejected", docsRoot);
  expect(() => transitionOpenItem(id, "open", docsRoot)).toThrow();
  expect(getOpenItem(id, docsRoot)!.item_state).toBe("rejected");
});

test("an open-item round-trips to disk and recomputes identically", () => {
  const docsRoot = setup();
  const id = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "lodash dependency",
      provenance: "code-verified",
      fact_kind: "dependency-present",
      anchors: ["package.json#dependencies.lodash"],
      claim: "lodash is a declared dependency",
    },
    docsRoot,
  );
  const item = getOpenItem(id, docsRoot)!;
  expect(item.kind).toBe("observation");
  expect(item.provenance).toBe("code-verified");
  expect(item.fact_kind).toBe("dependency-present");
  expect(item.anchors).toEqual(["package.json#dependencies.lodash"]);
  expect(item.claim).toBe("lodash is a declared dependency");
  expect(item.item_state).toBe("open");
  expect(item.type).toBe("open-item");
  expect(item.item_key).toBeTruthy();

  // re-reading from disk yields identical fields (no recompute drift).
  const reread = listOpenItems(docsRoot).find(i => i.id === id)!;
  expect(reread).toEqual(item);
});
