import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("package version is exported", () => {
  expect(VERSION).toBe("0.1.1");
});
