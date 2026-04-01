import YAML from "yaml";

import type {
  HarnessBlueprintDocument,
  HarnessSeedDocument,
  SeedDocument,
  SpecDocument
} from "../core/types.js";

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

export function renderHarnessBlueprintMarkdown(blueprint: HarnessBlueprintDocument): string {
  return `# ${blueprint.title}

## Metadata
- Blueprint ID: ${blueprint.metadata.blueprintId}
- Seed ID: ${blueprint.metadata.seedId}
- Architect Interview ID: ${blueprint.metadata.architectInterviewId}
- Repo Profile ID: ${blueprint.metadata.repoProfileId}
- Ambiguity Score: ${blueprint.metadata.ambiguityScore.toFixed(2)}
- Forced: ${blueprint.metadata.forced ? "yes" : "no"}
- Created At: ${blueprint.metadata.createdAt}

## Harness Goal
${blueprint.harnessGoal}

## Repo Profile Summary
${renderList(blueprint.repoProfileSummary)}
## Work Units
${renderList(blueprint.workUnits)}
## Team Topology
${renderList(blueprint.teamTopology)}
## Verification Strategy
${renderList(blueprint.verificationStrategy)}
## User Operating Style
${renderList(blueprint.userOperatingStyle)}
## Agent Roster
${renderAgentRoster(blueprint)}
## Skill Roster
${renderSkillRoster(blueprint)}
## Orchestration Protocol
${renderList(blueprint.orchestrationProtocol)}
## Constraints
${renderList(blueprint.constraints)}
## Generation Targets
${renderList(blueprint.generationTargets).trimEnd()}
`;
}

export function parseHarnessBlueprintMarkdown(content: string): HarnessBlueprintDocument {
  const sections = splitMarkdownSections(content);
  const metadata = parseMetadataSection(sections.Metadata ?? "");
  return {
    title: extractTitle(content),
    harnessGoal: (sections["Harness Goal"] ?? "").trim(),
    repoProfileSummary: parseBulletSection(sections["Repo Profile Summary"] ?? ""),
    workUnits: parseBulletSection(sections["Work Units"] ?? ""),
    teamTopology: parseBulletSection(sections["Team Topology"] ?? ""),
    verificationStrategy: parseBulletSection(sections["Verification Strategy"] ?? ""),
    userOperatingStyle: parseBulletSection(sections["User Operating Style"] ?? ""),
    agentRoster: parseAgentRosterSection(sections["Agent Roster"] ?? ""),
    skillRoster: parseSkillRosterSection(sections["Skill Roster"] ?? ""),
    orchestrationProtocol: parseBulletSection(sections["Orchestration Protocol"] ?? ""),
    constraints: parseBulletSection(sections.Constraints ?? ""),
    generationTargets: parseBulletSection(sections["Generation Targets"] ?? ""),
    metadata: {
      blueprintId: metadata["Blueprint ID"] ?? "",
      seedId: metadata["Seed ID"] ?? "",
      architectInterviewId: metadata["Architect Interview ID"] ?? "",
      repoProfileId: metadata["Repo Profile ID"] ?? "",
      ambiguityScore: Number(metadata["Ambiguity Score"] ?? "1"),
      forced: (metadata.Forced ?? "no").toLowerCase() === "yes",
      createdAt: metadata["Created At"] ?? ""
    }
  };
}

export function renderHarnessSeedYaml(seed: HarnessSeedDocument): string {
  return `${YAML.stringify(seed)}`;
}

export function parseHarnessSeedYaml(content: string): HarnessSeedDocument {
  return YAML.parse(content) as HarnessSeedDocument;
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

function renderAgentRoster(blueprint: HarnessBlueprintDocument): string {
  if (blueprint.agentRoster.length === 0) {
    return "- None\n";
  }
  return `${blueprint.agentRoster
    .map(
      (agent) =>
        `- ${agent.name}: ${agent.role}${agent.responsibilities.length > 0 ? ` | ${agent.responsibilities.join(", ")}` : ""}`
    )
    .join("\n")}\n`;
}

function renderSkillRoster(blueprint: HarnessBlueprintDocument): string {
  if (blueprint.skillRoster.length === 0) {
    return "- None\n";
  }
  return `${blueprint.skillRoster
    .map((skill) => `- ${skill.name}: ${skill.purpose}`)
    .join("\n")}\n`;
}

function parseAgentRosterSection(content: string) {
  return parseBulletSection(content)
    .map((line) => {
      const [nameAndRole, responsibilitiesRaw] = line.split("|").map((part) => part.trim());
      const [name, role] = nameAndRole.split(":").map((part) => part.trim());
      return {
        name: name ?? "",
        role: role ?? "",
        responsibilities: responsibilitiesRaw
          ? responsibilitiesRaw.split(",").map((entry) => entry.trim()).filter(Boolean)
          : []
      };
    })
    .filter((agent) => agent.name);
}

function parseSkillRosterSection(content: string) {
  return parseBulletSection(content)
    .map((line) => {
      const [name, purpose] = line.split(":").map((part) => part.trim());
      return {
        name: name ?? "",
        purpose: purpose ?? ""
      };
    })
    .filter((skill) => skill.name);
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
