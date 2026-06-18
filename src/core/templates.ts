import type { ArtifactType } from "./types.js";

export function bodyTemplate(type: ArtifactType): string {
  switch (type) {
    case "story":
      return [
        "## Story",
        "As a <persona>, I want <capability> so that <benefit>.",
        "",
        "## Acceptance Criteria",
        "- Given <context> When <action> Then <outcome>",
        "",
      ].join("\n");
    case "persona":
      return "## Persona\n\n**Role:**\n\n**Goals:**\n\n**Pain points:**\n";
    case "fr":
      return "## Functional Requirement\n\n**Description:**\n\n**Rationale:**\n";
    case "nfr":
      return "## Non-Functional Requirement\n\n**Category:**\n\n**Measure:**\n";
    case "use-case":
      return "## Use Case\n\n**Actor:**\n\n**Main flow:**\n\n**Alternate flows:**\n";
    default:
      return "";
  }
}
