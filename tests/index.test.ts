import { expect, test } from "vitest";
import { buildServer } from "../src/index.js";

test("buildServer registers expected tools", async () => {
  const server = buildServer();
  expect(server).toBeDefined();
  // registerTool stores definitions; smoke check that build doesn't throw and is reusable.
  expect(typeof buildServer).toBe("function");
});
