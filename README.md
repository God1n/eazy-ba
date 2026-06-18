# eazy-ba

A **personal Business Analyst** as an [MCP](https://modelcontextprotocol.io) server.

`eazy-ba` fills the BA role for solo engineers and small teams: it captures
requirements, keeps them organized as plain markdown, and tracks the
relationships between personas, requirements, use cases, and user stories so the
documentation stays coherent as a project evolves.

Markdown files are the **single source of truth** — everything lives under
`docs/ba/`, is human-readable, git-diffable, and hand-editable. Relationships are
stored in YAML frontmatter, so traceability is always derived, never
hand-maintained.

> **Status:** Phase 1 (foundation + core CRUD). The requirement-gathering and
> documentation backbone is complete. Gap analysis, follow-up questioning,
> linting, impact analysis, and elicitation are on the roadmap (see below).

## Install

Add it to Claude Code with one command — no global install needed:

```bash
claude mcp add eazy-ba -- npx -y eazy-ba
```

That's it. `npx` fetches and runs the latest version on demand.

<details>
<summary>Other MCP clients (manual config)</summary>

Register it as a stdio MCP server:

```json
{
  "mcpServers": {
    "eazy-ba": {
      "command": "npx",
      "args": ["-y", "eazy-ba"]
    }
  }
}
```
</details>

## The docs structure

Running `ba_init` scaffolds:

```
docs/ba/
├── _index.md                  # status dashboard
├── _config.yml                # docs root + id conventions
├── 01-vision/                 # vision.md, glossary.md
├── 02-stakeholders/personas/  # PER-001-*.md
├── 03-requirements/
│   ├── functional/            # FR-001-*.md
│   └── non-functional/        # NFR-001-*.md
├── 04-use-cases/              # UC-001-*.md
├── 05-stories/                # US-001-*.md (story + Gherkin acceptance criteria)
├── 06-analysis/               # traceability, gap-report, risks, assumptions
└── 07-changelog/              # requirement change history
```

Stable IDs (`FR-001`, `US-001`, `PER-001`, …) are the backbone; cross-links live
in frontmatter (`implements`, `satisfies`, `refines`).

## Tools (Phase 1)

| Tool | Purpose |
|------|---------|
| `ba_init` | Scaffold the `docs/ba/` tree in a project. |
| `ba_create_artifact` | Create a persona / FR / NFR / use-case / story (auto-allocates a stable ID; stories get a Gherkin acceptance-criteria stub). |
| `ba_update_artifact` | Edit an artifact; bumps its version and appends to the changelog. Renames are handled safely. |
| `ba_link` | Link artifacts via `implements` / `satisfies` / `refines`. |
| `ba_get` | Fetch one artifact by ID. |
| `ba_list` | List/filter artifacts by type, status, priority, or tag. |

Each artifact carries MoSCoW priority (`must` / `should` / `could` / `wont`) and a
status (`draft` → `reviewed` → `approved` → `implemented` / `obsolete`).

## Configuration

`docs/ba/_config.yml`:

```yaml
docsRoot: docs/ba   # relative to the project root, or an absolute path
idStart: 1          # first numeric ID
```

## Roadmap

- **Phase 2 — Analysis:** deterministic structural gap detection + shipped BA
  checklists, requirement quality linting, traceability matrix generation,
  change impact analysis.
- **Phase 3 — Smoothers:** intake from brain dumps, adaptive elicitation
  interviews, codebase grounding, and Mermaid visualizations.

## Development

```bash
npm install
npm test        # vitest, TDD throughout
npm run build   # tsc -> dist/
```

## License

[MIT](LICENSE)
