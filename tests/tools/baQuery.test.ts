import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";
import { baUpdateArtifact } from "../../src/tools/baUpdateArtifact.js";
import { baGet, baList } from "../../src/tools/baQuery.js";

test("get returns artifact; list filters by type", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const us = baCreateArtifact({ projectRoot: root, type: "story", title: "Sign in", updated: "2026-06-18" } as any);
  baCreateArtifact({ projectRoot: root, type: "fr", title: "Login", updated: "2026-06-18" } as any);

  expect(baGet({ projectRoot: root, id: us.id }).frontmatter.title).toBe("Sign in");
  const stories = baList({ projectRoot: root, type: "story" });
  expect(stories).toHaveLength(1);
  expect(stories[0].id).toBe(us.id);
});

test("get throws on missing id", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baGet({ projectRoot: root, id: "US-001" })).toThrow();
});

test("list filters by priority", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const high = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "High Priority",
    priority: "must",
    updated: "2026-06-18",
  } as any);
  const low = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "Low Priority",
    priority: "could",
    updated: "2026-06-18",
  } as any);

  const mustItems = baList({ projectRoot: root, priority: "must" });
  expect(mustItems).toHaveLength(1);
  expect(mustItems[0].id).toBe(high.id);

  const couldItems = baList({ projectRoot: root, priority: "could" });
  expect(couldItems).toHaveLength(1);
  expect(couldItems[0].id).toBe(low.id);
});

test("list filters by tag", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const tagged = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "Tagged Item",
    tags: ["critical", "ui"],
    updated: "2026-06-18",
  } as any);
  const untagged = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "Untagged Item",
    updated: "2026-06-18",
  } as any);

  const criticalItems = baList({ projectRoot: root, tag: "critical" });
  expect(criticalItems).toHaveLength(1);
  expect(criticalItems[0].id).toBe(tagged.id);

  const uiItems = baList({ projectRoot: root, tag: "ui" });
  expect(uiItems).toHaveLength(1);
  expect(uiItems[0].id).toBe(tagged.id);
});

test("list applies combined filters (AND semantics)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "Story Draft Must",
    priority: "must",
    updated: "2026-06-18",
  } as any);
  const storyApprovedMust = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "Story Approved Must",
    priority: "must",
    updated: "2026-06-18",
  } as any);
  baCreateArtifact({
    projectRoot: root,
    type: "fr",
    title: "FR Approved Must",
    priority: "must",
    updated: "2026-06-18",
  } as any);

  // Update one story to approved status
  baUpdateArtifact({
    projectRoot: root,
    id: storyApprovedMust.id,
    status: "approved",
    updated: "2026-06-18",
  });

  // Filter: type=story AND status=approved AND priority=must
  const results = baList({
    projectRoot: root,
    type: "story",
    status: "approved",
    priority: "must",
  });
  expect(results).toHaveLength(1);
  expect(results[0].id).toBe(storyApprovedMust.id);
});

test("list summary omits priority key when undefined", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const noPriority = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "No Priority",
    updated: "2026-06-18",
  } as any);
  const withPriority = baCreateArtifact({
    projectRoot: root,
    type: "story",
    title: "With Priority",
    priority: "should",
    updated: "2026-06-18",
  } as any);

  const all = baList({ projectRoot: root });
  const noPriorityItem = all.find(item => item.id === noPriority.id);
  const withPriorityItem = all.find(item => item.id === withPriority.id);

  expect("priority" in noPriorityItem!).toBe(false);
  expect("priority" in withPriorityItem!).toBe(true);
  expect(withPriorityItem!.priority).toBe("should");
});
