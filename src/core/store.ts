import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import matter from "gray-matter";
import type { Artifact, ArtifactType, Frontmatter } from "./types.js";
import { FILE_BACKED_TYPES } from "./types.js";

const FOLDER: Record<ArtifactType, string> = {
  vision: "01-vision", glossary: "01-vision", persona: "02-stakeholders/personas",
  fr: "03-requirements/functional", nfr: "03-requirements/non-functional",
  "use-case": "04-use-cases", story: "05-stories",
  risk: "06-analysis", assumption: "06-analysis",
  decision: "08-decisions",
  "open-item": "09-open-items", "tech-surface": "10-tech-surface",
};

export function folderFor(type: ArtifactType, docsRoot: string): string {
  return join(docsRoot, FOLDER[type]);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function filePathFor(fm: Frontmatter, docsRoot: string): string {
  const slug = slugify(fm.title);
  const filename = slug ? `${fm.id}-${slug}.md` : `${fm.id}.md`;
  return join(folderFor(fm.type, docsRoot), filename);
}

export function writeArtifact(art: Omit<Artifact, "filePath">, docsRoot: string): string {
  const path = filePathFor(art.frontmatter, docsRoot);
  mkdirSync(dirname(path), { recursive: true });
  // gray-matter passes the full frontmatter object through, preserving unknown keys.
  const content = matter.stringify(art.body ?? "", art.frontmatter as Record<string, unknown>);
  writeFileSync(path, content, "utf8");
  return path;
}

export function readArtifact(filePath: string): Artifact {
  const parsed = matter(readFileSync(filePath, "utf8"));
  return { frontmatter: parsed.data as Frontmatter, body: parsed.content, filePath };
}

export function listArtifacts(docsRoot: string): Artifact[] {
  const out: Artifact[] = [];
  for (const type of FILE_BACKED_TYPES) {
    const dir = folderFor(type, docsRoot);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!name.endsWith(".md") || !statSync(p).isFile()) continue;
      const art = readArtifact(p);
      if (art.frontmatter && art.frontmatter.id) out.push(art);
    }
  }
  out.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
  return out;
}
