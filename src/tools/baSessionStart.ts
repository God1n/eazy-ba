import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession, writeSession } from "../core/session.js";
import type { SessionState } from "../core/session.js";
import { ModeEnum } from "../core/taxonomy.js";

export const baSessionStartSchema = z.object({
  projectRoot: z.string(),
  mode: ModeEnum,
  // Ground mode only: the USER-supplied read scope (paths/globs, relative to
  // projectRoot) the user points the BA at. Persisted to the session so ba_ground
  // can only auto-accept anchors inside it. Supplied at session start (a user turn),
  // not freely per ba_ground call, so the agent can't widen it (Flow 2 R1/R11).
  readScope: z.array(z.string()).optional(),
  // Ground mode only (Unit 9): project-specific deny patterns ADDED to the
  // built-in scopeGuard deny-list. User-supplied at session start so the agent
  // cannot remove a project's secret path from the deny-list.
  readDeny: z.array(z.string()).optional(),
});

export function baSessionStart(input: z.infer<typeof baSessionStartSchema>):
  { mode: string; round: string; resumed: boolean; readScope?: string[]; next: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const existing = readSession(docsRoot);
  const today = new Date().toISOString().slice(0, 10);

  let state: SessionState;
  let resumed: boolean;
  if (existing) {
    state = { ...existing, mode: input.mode, updated: today };
    resumed = true;
    // A fresh readScope on resume replaces the prior one (the user re-points the
    // BA); omitting it on resume preserves the persisted scope.
    if (input.readScope !== undefined) state.read_scope = input.readScope;
    if (input.readDeny !== undefined) state.read_deny = input.readDeny;
  } else {
    state = {
      mode: input.mode,
      round: input.mode === "discovery" ? "surface" : input.mode === "change" ? "change" : "gap",
      open_questions: [],
      pending_apply: [],
      updated: today,
      ...(input.mode === "ground" && input.readScope !== undefined
        ? { read_scope: input.readScope }
        : {}),
      ...(input.mode === "ground" && input.readDeny !== undefined
        ? { read_deny: input.readDeny }
        : {}),
    };
    resumed = false;
  }
  writeSession(state, docsRoot);
  const next = state.mode === "ground"
    ? "Call ba_assess to get the ground directive, then ba_ground with the code observations you can read."
    : "Call ba_assess to get the questions to ask the user.";
  return {
    mode: state.mode,
    round: state.round,
    resumed,
    ...(state.read_scope !== undefined ? { readScope: state.read_scope } : {}),
    next,
  };
}
