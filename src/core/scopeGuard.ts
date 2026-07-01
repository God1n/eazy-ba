import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, basename } from "node:path";

// =============================================================================
// scopeGuard — the server-enforced read boundary for the ground flow (Flow 2
// R1/R11). This is the CORE-LAYER chokepoint: ground.ts routes every anchor
// check through here, so no future caller can bypass the guards by talking to
// the core directly.
//
// ----------------------------------------------------------------------------
// THREAT MODEL — and, honestly, the limit of what this can enforce.
// ----------------------------------------------------------------------------
// The HOST AGENT performs the actual file reads; the server never opens source.
// By the time the server sees an anchor, the file is ALREADY in the agent's
// context. So these guards are PERSISTENCE / BOUNDARY controls — they decide
// what may be anchored, auto-accepted, and written to the doc store — NOT read
// controls. They do not and cannot "prevent exfiltration" of a secret the agent
// has already read. The pre-read boundary lives elsewhere: (a) the host agent's
// tool permissions / the MCP process's file-system permissions, and (b) persona
// instructions telling the agent not to read deny-listed paths (see
// src/instructions.ts). State this honestly; do not over-claim.
//
// Exploits this module DOES mitigate:
//   (1) Prompt-injected scope expansion — a poisoned source file tells the agent
//       to ground a broad scope and pack secrets into observation bodies.
//       → Mitigated by the USER-SUPPLIED scope (set at ba_session_start, never a
//         per-call agent arg) + this deny-list + a best-effort body regex. The
//         residual is unavoidable: the agent's context already saw the file.
//   (2) `../` traversal and symlink escape — an anchor whose logical path sits
//       inside scope but whose REAL target is outside it.
//       → Mitigated by realpath canonicalization: we resolve the anchor's real
//         on-disk path and require the REALPATH (not the logical path) to stay
//         inside the realpath of a declared scope entry.
//   (3) Secret value pasted into an observation body.
//       → Mitigated BEST-EFFORT by scanForSecrets() — defense-in-depth, NOT a
//         guarantee (high false-negative rate). The load-bearing guarantee is
//         the path deny-list + realpath scope, not the body regex.
// =============================================================================

// An anchor is a structural reference: a file path optionally suffixed with a
// `#symbol` or `#Lstart-Lend`. Only the file part is checkable on disk; the
// symbol part is the agent's claim and is never server-verified. Anchors are
// path references — never content snapshots — so a later secret rotation leaves
// only a path in git, never a value.
export function anchorFilePart(anchor: string): string {
  const hash = anchor.indexOf("#");
  return hash === -1 ? anchor : anchor.slice(0, hash);
}

// ---------------------------------------------------------------------------
// Deny-list — the PRIMARY defense. Paths matching these patterns are never
// anchored (an anchor on a denied path is treated as not-verifiable, so the
// observation fails safe to inferred and is excluded from auto-accept). The
// patterns are matched against the anchor's file part AND its basename, so a
// match anywhere in the tree is caught (e.g. `config/app.env`, `certs/x.key`).
//
// User-extensible: a session/config may ADD project-specific secret paths via
// ScopeGuardOptions.extraDeny (glob-ish: `*`, `**`, `?`).
// ---------------------------------------------------------------------------
const DEFAULT_DENY: readonly string[] = [
  "**/.*", // dotfiles (any depth) — .env, .npmrc, .ssh/*, etc.
  ".*", // a leading-dot path at the root
  "**/*.env",
  "*.env",
  "**/*.pem",
  "*.pem",
  "**/*.key",
  "*.key",
  "**/*secret*",
  "*secret*",
  "**/*credential*",
  "*credential*",
  "**/.git/**",
  ".git/**",
  "**/.github/workflows/**",
  ".github/workflows/**",
  "**/Makefile",
  "Makefile",
  "**/docker-compose*.yml",
  "docker-compose*.yml",
  "**/docker-compose*.yaml",
  "docker-compose*.yaml",
  "**/*.tfstate",
  "*.tfstate",
  // Fix 5: terraform variable files routinely carry secrets/credentials.
  "**/*.tfvars",
  "*.tfvars",
  "**/*.tfvars.json",
  // common private-key filenames that carry no telltale extension
  "**/id_rsa",
  "id_rsa",
  "**/id_dsa",
  "id_dsa",
  "**/id_ecdsa",
  "id_ecdsa",
  "**/id_ed25519",
  "id_ed25519",
];

// Translate a simple glob (`*`, `**`, `?`) to a RegExp anchored at both ends.
// `**` matches across `/`; `*` matches within a single segment; `?` one char.
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // `**` — cross-segment
        i++;
      } else {
        re += "[^/]*"; // `*` — within a segment
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  // Fix 4: case-insensitive so SERVER.KEY / cert.PEM / .ENV are denied like their
  // lowercase forms. File-system paths are effectively case-insensitive on macOS/
  // Windows anyway, and a secret file's case is not a security boundary.
  return new RegExp(`^${re}$`, "i");
}

// Normalize an anchor's file part to a forward-slash, root-relative-ish string
// for matching (strips a leading `./`). The match is intentionally lenient: we
// test the full path AND the basename so a deny pattern catches the file
// wherever it sits.
function normalizeForMatch(filePart: string): string {
  return filePart.replace(/\\/g, "/").replace(/^\.\//, "");
}

export interface ScopeGuardOptions {
  /** Project-specific deny patterns ADDED to the built-in deny-list. */
  extraDeny?: readonly string[];
}

// True iff the anchor's path matches any deny pattern (built-in + user-added).
// A denied path is never anchored — the load-bearing path control.
export function isDenied(anchor: string, opts: ScopeGuardOptions = {}): boolean {
  const filePart = normalizeForMatch(anchorFilePart(anchor).trim());
  if (filePart === "") return false;
  const base = basename(filePart);
  const patterns = [...DEFAULT_DENY, ...(opts.extraDeny ?? [])];
  return patterns.some(p => {
    const re = globToRegExp(p);
    return re.test(filePart) || re.test(base);
  });
}

// ---------------------------------------------------------------------------
// Scope containment — realpath-backed. Resolve a scope entry to its leading
// literal segment (everything up to the first wildcard), make it absolute, then
// canonicalize with realpath so a symlinked scope root is compared on its real
// location. A non-existent scope prefix realpaths to its lexical resolve().
// ---------------------------------------------------------------------------
function realScopePrefix(entry: string, projectRoot: string): string {
  const wildcard = entry.search(/[*?[]/);
  const literal = wildcard === -1 ? entry : entry.slice(0, wildcard);
  const base = isAbsolute(literal) ? literal : join(projectRoot, literal);
  const lexical = resolve(base);
  return safeRealpath(lexical);
}

// realpathSync that degrades to the lexical path when the path does not exist
// (so a not-yet-created scope prefix still yields a stable comparison key).
function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

// True iff `target` is `prefix` itself or lives underneath it. Segment-aware via
// `relative` so `src` does not match `src-other`.
function isWithin(target: string, prefix: string): boolean {
  if (target === prefix) return true;
  const rel = relative(prefix, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export interface AnchorGuard {
  anchor: string;
  resolves: boolean; // file exists on disk
  inScope: boolean; // REALPATH is inside a declared scope entry's realpath
  denied: boolean; // matched the deny-list
  ok: boolean; // resolves AND inScope AND NOT denied
}

// Guard a single anchor against disk, the user-declared scope (realpath-backed),
// and the deny-list. `ok` is the auto-accept signal. A denied anchor is never
// ok regardless of scope; an anchor whose realpath escapes scope is never ok
// even if its logical path looked contained (defeats `../` and symlink escape).
export function guardAnchor(
  anchor: string,
  projectRoot: string,
  scope: readonly string[],
  opts: ScopeGuardOptions = {},
): AnchorGuard {
  const filePart = anchorFilePart(anchor).trim();
  const lexical = resolve(isAbsolute(filePart) ? filePart : join(projectRoot, filePart));

  const resolves = existsSync(lexical);
  const denied = isDenied(anchor, opts);

  // Canonicalize the anchor's REAL path. If it doesn't resolve there is nothing
  // to canonicalize, so it cannot be in scope (and cannot auto-accept anyway).
  const real = resolves ? safeRealpath(lexical) : lexical;
  const prefixes = scope.map(s => realScopePrefix(s, projectRoot));
  const inScope = resolves && prefixes.some(p => isWithin(real, p));

  return { anchor, resolves, inScope, denied, ok: resolves && inScope && !denied };
}

// ---------------------------------------------------------------------------
// Best-effort secret-scan (defense-in-depth — NOT a guarantee).
//
// Flags common secret shapes in an observation body so the value is not
// persisted to the doc store / committed. This has a HIGH FALSE-NEGATIVE RATE
// by design: it cannot recognize every secret format, and an obfuscated or
// novel secret will pass. It is a backstop, not the boundary. The load-bearing
// guarantee is the path deny-list + realpath scope above; the agent is also
// instructed (persona) never to put literal secret values in a body.
// ---------------------------------------------------------------------------
const SECRET_PATTERNS: readonly { name: string; re: RegExp }[] = [
  // PEM / private key blocks
  { name: "private-key-block", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----/ },
  { name: "key-block", re: /-----BEGIN [A-Z ]*KEY-----/ },
  // AWS access key id
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  // OpenAI-style sk- token
  { name: "sk-token", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  // GitHub-style tokens
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  // Slack token
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  // password / secret / token / api[_-]?key assignment with a non-trivial value
  {
    name: "credential-assignment",
    re: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["']?[^\s"']{6,}/i,
  },
  // connection string with embedded credentials (scheme://user:pass@host)
  { name: "connection-string", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/i },
  // long base64 blob (40+ chars) — catches raw key material. Fix 6: require at
  // least one NON-HEX base64 char (`+`, `/`, or a letter outside [a-fA-F]) so a
  // pure-hex string — notably a 40-char git SHA-1 or 64-char SHA-256 — does not
  // trip this. Real base64 key material almost always contains such a character.
  { name: "long-secret-blob", re: /\b(?=[A-Za-z0-9+/]*[g-zG-Z+/])[A-Za-z0-9+/]{40,}={0,2}\b/ },
];

export interface SecretHit {
  pattern: string;
  match: string;
}

// Return the secret patterns that fired on `text`. Empty array ⇒ nothing flagged
// (which does NOT prove the text is secret-free — see the caveat above).
export function scanForSecrets(text: string): SecretHit[] {
  if (!text) return [];
  const hits: SecretHit[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push({ pattern: name, match: m[0] });
  }
  return hits;
}
