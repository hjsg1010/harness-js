import YAML from "yaml";

import type { SeedDocument, SpecDocument } from "../core/types.js";

function renderList(values: string[]): string {
  if (values.length === 0) {
    return "- None\n";
  }
  return `${values.map((value) => `- ${value}`).join("\n")}\n`;
}

export function renderSpecMarkdown(spec: SpecDocument): string {
  const ontologyRows =
    spec.ontology.length === 0
      ? "| None | None | None | None |\n"
      : spec.ontology
          .map(
            (entity) =>
              `| ${entity.name} | ${entity.type} | ${entity.fields.join(", ") || "-"} | ${
                entity.relationships.join(", ") || "-"
              } |`
          )
          .join("\n");

  return `# ${spec.title}

## Metadata
- Spec ID: ${spec.metadata.specId}
- Seed ID: ${spec.metadata.seedId}
- Interview ID: ${spec.metadata.interviewId}
- Project Type: ${spec.metadata.projectType}
- Ambiguity Score: ${spec.metadata.ambiguityScore.toFixed(2)}
- Forced: ${spec.metadata.forced ? "yes" : "no"}
- Created At: ${spec.metadata.createdAt}

## Goal
${spec.goal}

## Constraints
${renderList(spec.constraints)}
## Non-Goals
${renderList(spec.nonGoals)}
## Acceptance Criteria
${renderList(spec.acceptanceCriteria)}
## Transcript Summary
${renderList(spec.transcriptSummary)}
## Technical Context
${renderList(spec.technicalContext)}
## Ontology
| Entity | Type | Fields | Relationships |
| --- | --- | --- | --- |
${ontologyRows}
`;
}

export function parseSpecMarkdown(content: string): SpecDocument {
  const sections = splitMarkdownSections(content);
  const metadata = parseMetadataSection(sections.Metadata ?? "");
  const ontology = parseOntologySection(sections.Ontology ?? "");
  return {
    title: extractTitle(content),
    goal: (sections.Goal ?? "").trim(),
    constraints: parseBulletSection(sections.Constraints ?? ""),
    nonGoals: parseBulletSection(sections["Non-Goals"] ?? ""),
    acceptanceCriteria: parseBulletSection(sections["Acceptance Criteria"] ?? ""),
    transcriptSummary: parseBulletSection(sections["Transcript Summary"] ?? ""),
    technicalContext: parseBulletSection(sections["Technical Context"] ?? ""),
    ontology,
    metadata: {
      specId: metadata["Spec ID"] ?? "",
      seedId: metadata["Seed ID"] ?? "",
      interviewId: metadata["Interview ID"] ?? "",
      ambiguityScore: Number(metadata["Ambiguity Score"] ?? "1"),
      forced: (metadata.Forced ?? "no").toLowerCase() === "yes",
      projectType: (metadata["Project Type"] as "greenfield" | "brownfield") ?? "greenfield",
      createdAt: metadata["Created At"] ?? ""
    }
  };
}

export function renderSeedYaml(seed: SeedDocument): string {
  return `${YAML.stringify(seed)}`;
}

export function parseSeedYaml(content: string): SeedDocument {
  return YAML.parse(content) as SeedDocument;
}

function extractTitle(content: string): string {
  const line = content.split("\n").find((entry) => entry.startsWith("# "));
  return line?.slice(2).trim() ?? "Untitled Spec";
}

function splitMarkdownSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");
  let current = "__root__";
  sections[current] = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections[current] = "";
      continue;
    }
    sections[current] += `${line}\n`;
  }

  return sections;
}

function parseBulletSection(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line !== "None");
}

function parseMetadataSection(content: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      continue;
    }
    const [key, ...rest] = trimmed.slice(2).split(":");
    metadata[key.trim()] = rest.join(":").trim();
  }
  return metadata;
}

function parseOntologySection(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
    )
    .filter((cells) => cells.length === 4)
    .filter((cells) => cells[0] !== "None")
    .map(([name, type, fields, relationships]) => ({
      name,
      type,
      fields: fields === "-" ? [] : fields.split(",").map((entry) => entry.trim()),
      relationships:
        relationships === "-" ? [] : relationships.split(",").map((entry) => entry.trim())
    }));
}
