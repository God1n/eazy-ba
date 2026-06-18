import { expect, test } from "vitest";
import { ID_PREFIX, FILE_BACKED_TYPES } from "../../src/core/types.js";

test("id prefixes are defined for file-backed types", () => {
  expect(ID_PREFIX.story).toBe("US");
  expect(ID_PREFIX.fr).toBe("FR");
  expect(ID_PREFIX.persona).toBe("PER");
  expect(FILE_BACKED_TYPES).toContain("story");
  expect(FILE_BACKED_TYPES).not.toContain("vision");
});
