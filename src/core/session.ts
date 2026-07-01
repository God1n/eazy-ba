import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { Mode, Round } from "./taxonomy.js";

export interface Question {
  ref: string;
  text: string;
  topic: string;
  round: Round;
}

export interface SessionState {
  mode: Mode;
  round: Round;
  open_questions: Question[];
  pending_apply: string[];
  updated: string;
  // Ground mode only (Flow 2 R1/R11): the user-supplied read scope — the paths/
  // globs the user points ba_ground at, relative to projectRoot. Persisted at
  // ba_session_start (a user turn), never widened by a per-call agent argument,
  // so a prompt-injected agent cannot unilaterally broaden what it may anchor.
  // ba_ground reads this; it is the auto-accept containment boundary.
  read_scope?: string[];
  // Ground mode only (Unit 9): project-specific deny patterns ADDED to the
  // built-in scopeGuard deny-list (e.g. `config/credentials.yml`). Supplied by
  // the user at ba_session_start, so a prompt-injected agent cannot remove a
  // project's secret path from the deny-list. Never anchored / never auto-accepted.
  read_deny?: string[];
}

export function sessionPath(docsRoot: string): string {
  return join(docsRoot, ".ba-session.yml");
}

export function readSession(docsRoot: string): SessionState | null {
  const p = sessionPath(docsRoot);
  if (!existsSync(p)) return null;
  return parse(readFileSync(p, "utf8")) as SessionState;
}

export function writeSession(state: SessionState, docsRoot: string): void {
  writeFileSync(sessionPath(docsRoot), stringify(state), "utf8");
}

export function clearAnsweredQuestions(state: SessionState, answeredTexts: string[]): SessionState {
  const answered = new Set(answeredTexts);
  return { ...state, open_questions: state.open_questions.filter(q => !answered.has(q.text)) };
}
