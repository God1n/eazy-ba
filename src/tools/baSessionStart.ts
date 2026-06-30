import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession, writeSession } from "../core/session.js";
import type { SessionState } from "../core/session.js";
import { ModeEnum } from "../core/taxonomy.js";

export const baSessionStartSchema = z.object({
  projectRoot: z.string(),
  mode: ModeEnum,
});

export function baSessionStart(input: z.infer<typeof baSessionStartSchema>):
  { mode: string; round: string; resumed: boolean; next: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const existing = readSession(docsRoot);
  const today = new Date().toISOString().slice(0, 10);

  let state: SessionState;
  let resumed: boolean;
  if (existing) {
    state = { ...existing, mode: input.mode, updated: today };
    resumed = true;
  } else {
    state = {
      mode: input.mode,
      round: input.mode === "discovery" ? "surface" : input.mode === "change" ? "change" : "gap",
      open_questions: [],
      pending_apply: [],
      updated: today,
    };
    resumed = false;
  }
  writeSession(state, docsRoot);
  return { mode: state.mode, round: state.round, resumed, next: "Call ba_assess to get the questions to ask the user." };
}
