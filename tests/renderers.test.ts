import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PrdDocument, SeedDocument, SpecDocument } from "../src/core/types.js";
import { renderSeedYaml, renderSpecMarkdown } from "../src/infra/serializers.js";

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

describe("golden renderers", () => {
  it("renders spec markdown deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "spec.md"), "utf8");
    expect(renderSpecMarkdown(buildSpecFixture())).toBe(expected);
  });

  it("renders seed yaml deterministically", async () => {
    const expected = await readFile(join(fixtureDir, "seed.yaml"), "utf8");
    expect(renderSeedYaml(buildSeedFixture())).toBe(expected);
  });

  it("matches PRD golden shape", async () => {
    const prd: PrdDocument = {
      sourceSeedId: "seed_fixed",
      sourceSpecPath: "/tmp/spec.md",
      sourceSeedPath: "/tmp/seed.yaml",
      status: "pending",
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
