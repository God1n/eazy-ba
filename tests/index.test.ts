import { expect, test } from "vitest";
import { buildServer, wrap } from "../src/index.js";

test("buildServer smoke test — builds without throwing", () => {
  const server = buildServer();
  expect(server).toBeDefined();
  expect(typeof buildServer).toBe("function");
});

test("wrap — sync handler returning object resolves to MCP content shape", async () => {
  const handler = (_args: unknown) => ({ hello: "world", count: 42 });
  const wrapped = wrap(handler);
  const result = await wrapped({});
  expect(result).toEqual({
    content: [{ type: "text", text: JSON.stringify({ hello: "world", count: 42 }, null, 2) }],
  });
  const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
  expect(parsed).toEqual({ hello: "world", count: 42 });
});

test("wrap — sync handler that throws resolves to isError shape (not a rejection)", async () => {
  const handler = (_args: unknown): unknown => {
    throw new Error("something went wrong");
  };
  const wrapped = wrap(handler);
  const result = await wrapped({});
  expect(result).toEqual({
    isError: true,
    content: [{ type: "text", text: "something went wrong" }],
  });
});

test("wrap — async handler that rejects resolves to isError shape (proves Fix 1)", async () => {
  const handler = async (_args: unknown): Promise<unknown> => {
    throw new Error("async failure");
  };
  const wrapped = wrap(handler);
  const result = await wrapped({});
  expect(result).toEqual({
    isError: true,
    content: [{ type: "text", text: "async failure" }],
  });
});
