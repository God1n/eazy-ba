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
