import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  HarnessBlueprintDocument,
  HarnessSeedDocument,
  PrdDocument,
  SeedDocument,
  SpecDocument
} from "../src/core/types.js";
import {
  renderHarnessBlueprintMarkdown,
  renderHarnessSeedYaml,
  renderSeedYaml,
  renderSpecMarkdown
} from "../src/infra/serializers.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures", "golden");

function buildSpecFixture(): SpecDocument {
  return {
    title: "Demo Harness Spec",
    goal: "Build a small CLI that interviews the user and writes a seed file.",
    constraints: ["Node.js 20+", "Use local files only"],
    nonGoals: ["No TUI"],
    acceptanceCriteria: [
      "The CLI can create an interview session",
      "The CLI can write a seed YAML file"
    ],
    transcriptSummary: [
      "User wants a local CLI",
      "The workflow must keep immutable artifacts"
    ],
    technicalContext: ["No existing codebase context"],
    ontology: [
      {
        name: "Interview",
        type: "core domain",
        fields: ["id", "rounds"],
        relationships: ["Interview produces Seed"]
      },
      {
        name: "Seed",
        type: "core domain",
        fields: ["goal", "acceptanceCriteria"],
        relationships: ["Seed feeds PRD"]
      }
    ],
    metadata: {
      specId: "spec_fixed",
      seedId: "seed_fixed",
      interviewId: "interview_fixed",
      ambiguityScore: 0.15,
      forced: false,
      projectType: "greenfield",
      createdAt: "2026-03-31T00:00:00.000Z"
    }
  };
}

function buildSeedFixture(): SeedDocument {
  return {
    goal: "Build a small CLI that interviews the user and writes a seed file.",
    task_type: "code",
    constraints: ["Node.js 20+", "Use local files only"],
    acceptance_criteria: [
      "The CLI can create an interview session",
      "The CLI can write a seed YAML file"
    ],
    ontology_schema: {
      name: "Demo Harness Spec",
      description: "Demo Harness Spec output ontology",
      fields: [
        {
          name: "Interview",
          type: "core domain",
          description: "Fields: id, rounds",
          required: true
        },
        {
          name: "Seed",
          type: "core domain",
          description: "Fields: goal, acceptanceCriteria",
          required: true
        }
      ]
    },
    metadata: {
      seed_id: "seed_fixed",
      interview_id: "interview_fixed",
      ambiguity_score: 0.15,
      forced: false,
      created_at: "2026-03-31T00:00:00.000Z"
    }
  };
}

function buildHarnessBlueprintFixture(): HarnessBlueprintDocument {
  return {
    title: "Research Harness",
    harnessGoal: "Build a repo-specific harness for multi-angle research and synthesis.",
    repoProfileSummary: ["TypeScript CLI", "npm build and test scripts"],
    workUnits: ["web-search", "paper-review", "community-review", "synthesis"],
    teamTopology: ["orchestrator", "web-researcher", "paper-analyst", "community-analyst", "synthesizer"],
    verificationStrategy: [
      "cross-check citations",
      "compare findings across sources",
      "require final synthesis checklist"
    ],
    userOperatingStyle: ["single command entrypoint", "preserve intermediate artifacts"],
    agentRoster: [
      {
        name: "orchestrator",
        role: "Coordinate the research team",
        responsibilities: ["dispatch work", "merge outputs"]
      },
      {
        name: "web-researcher",
        role: "Gather web evidence",
        responsibilities: ["search web", "collect links"]
      },
      {
        name: "paper-analyst",
        role: "Review academic sources",
        responsibilities: ["find papers", "summarize evidence"]
      },
      {
        name: "community-analyst",
        role: "Review community responses",
        responsibilities: ["inspect forums", "summarize sentiment"]
      },
      {
        name: "synthesizer",
        role: "Write final synthesis",
        responsibilities: ["compare evidence", "draft report"]
      }
    ],
    skillRoster: [
      { name: "research-orchestrator", purpose: "Coordinate team workflow" },
      { name: "research-web", purpose: "Search and summarize web sources" },
      { name: "research-papers", purpose: "Review papers and academic evidence" },
      { name: "research-community", purpose: "Review community feedback" },
      { name: "research-synthesis", purpose: "Write synthesis report" }
    ],
    orchestrationProtocol: [
      "orchestrator dispatches all specialists",
      "specialists write into _workspace",
      "synthesizer merges findings into final report"
    ],
    constraints: ["Keep outputs local", "Do not overwrite user-edited generated files"],
    generationTargets: ["claude-agents", "claude-skills", "codex-skills"],
    metadata: {
      blueprintId: "blueprint_fixed",
      seedId: "harness_seed_fixed",
      architectInterviewId: "architect_fixed",
      repoProfileId: "profile_fixed",
      ambiguityScore: 0.14,
      forced: false,
      createdAt: "2026-03-31T00:00:00.000Z"
    }
  };
}

function buildHarnessSeedFixture(): HarnessSeedDocument {
  return {
    harness_goal: "Build a repo-specific harness for multi-angle research and synthesis.",
    repo_profile: {
      stack: ["typescript"],
      package_manager: "npm",
      scripts: { build: "npm run build", test: "npm test" },
      top_level_directories: ["src", "tests", "docs"],
      likely_boundaries: ["src", "tests", "docs"],
      conventions: ["local artifacts"],
      risk_surfaces: ["generated assets"],
      relevant_files: ["README.md", "src/cli.ts"]
    },
    work_units: ["web-search", "paper-review", "community-review", "synthesis"],
    agents: buildHarnessBlueprintFixture().agentRoster,
    skills: buildHarnessBlueprintFixture().skillRoster,
    verification: {
      strategy: [
        "cross-check citations",
        "compare findings across sources",
        "require final synthesis checklist"
      ],
      emphasis: [
        "single command entrypoint",
        "preserve intermediate artifacts",
        "cross-check citations",
        "compare findings across sources"
      ]
    },
    generation_targets: {
      slug: "research-harness",
      claude_agents: true,
      claude_skills: true,
      codex_skills: true
    },
    metadata: {
      seed_id: "harness_seed_fixed",
      blueprint_id: "blueprint_fixed",
      interview_id: "architect_fixed",
      ambiguity_score: 0.14,
      forced: false,
      created_at: "2026-03-31T00:00:00.000Z"
    }
  };
}

describe("golden renderers", () => {
  it("renders spec markdown deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "spec.md"), "utf8");
    expect(renderSpecMarkdown(buildSpecFixture())).toBe(expected);
  });

  it("renders seed yaml deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "seed.yaml"), "utf8");
    expect(renderSeedYaml(buildSeedFixture())).toBe(expected);
  });

  it("renders harness blueprint markdown deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "harness-blueprint.md"), "utf8");
    expect(renderHarnessBlueprintMarkdown(buildHarnessBlueprintFixture())).toBe(expected);
  });

  it("renders harness seed yaml deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "harness-seed.yaml"), "utf8");
    expect(renderHarnessSeedYaml(buildHarnessSeedFixture())).toBe(expected);
  });

  it("matches PRD golden shape", async () => {
    const prd: PrdDocument = {
      sourceSeedId: "seed_fixed",
      sourceSpecPath: "/tmp/spec.md",
      sourceSeedPath: "/tmp/seed.yaml",
      goal: "Build a small CLI that interviews the user and writes a seed file.",
      status: "pending",
      activeHarness: null,
      stories: [
        {
          id: "story_001",
          title: "The CLI can create an interview session",
          acceptanceCriteria: ["The CLI can create an interview session"],
          verificationCommands: [],
          passes: false,
          attempts: 0,
          lastReviewerVerdict: "pending"
        },
        {
          id: "story_002",
          title: "The CLI can write a seed YAML file",
          acceptanceCriteria: ["The CLI can write a seed YAML file"],
          verificationCommands: [],
          passes: false,
          attempts: 0,
          lastReviewerVerdict: "pending"
        }
      ]
    };

    const expected = await readFile(join(fixtureDir, "prd.json"), "utf8");
    expect(`${JSON.stringify(prd, null, 2)}\n`).toBe(expected);
  });
});
