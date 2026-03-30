import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { InterviewState } from "../src/core/types.js";
import { saveInterviewState } from "../src/infra/filesystem.js";
import { parseSeedYaml, parseSpecMarkdown } from "../src/infra/serializers.js";
import { PrdService } from "../src/prd/service.js";
import { SeedService } from "../src/seed/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("SeedService and PrdService", () => {
  it("generates immutable spec and seed artifacts", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const interview: InterviewState = {
      interviewId: "interview_fixed",
      status: "completed",
      initialIdea: "Build a hybrid harness",
      projectType: "greenfield",
      threshold: 0.2,
      currentAmbiguity: 0.15,
      rounds: [
        {
          roundNumber: 1,
          targeting: "goal",
          rationale: "Goal first.",
          question: "What should happen first?",
          answer: "The CLI should interview first.",
          askedAt: "2026-03-31T00:00:00.000Z",
          answeredAt: "2026-03-31T00:00:00.000Z",
          ambiguity: 0.15,
          breakdown: {
            goal: { score: 0.95, justification: "Clear", gap: "Clear" },
            constraints: { score: 0.9, justification: "Clear", gap: "Clear" },
            criteria: { score: 0.9, justification: "Clear", gap: "Clear" }
          },
          weakestDimension: "criteria",
          weakestDimensionRationale: "Only verification details remain."
        }
      ],
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z"
    };
    await saveInterviewState(cwd, interview);

    const runner = new FakeCodexRunner();
    runner.pushExecJson({
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
      ]
    });

    const seedService = new SeedService(runner);
    const result = await seedService.generateFromInterview(cwd, interview.interviewId);

    const parsedSpec = parseSpecMarkdown(await import("../src/infra/filesystem.js").then((mod) => mod.readText(result.specPath)));
    const parsedSeed = parseSeedYaml(await import("../src/infra/filesystem.js").then((mod) => mod.readText(result.seedPath)));

    expect(parsedSpec.goal).toBe(result.spec.goal);
    expect(parsedSeed.goal).toBe(result.seed.goal);
    expect(parsedSeed.metadata.forced).toBe(false);
  });

  it("maps seed acceptance criteria into PRD stories", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    await writeFile(
      join(cwd, "seed.yaml"),
      `goal: Build a small CLI
task_type: code
constraints:
  - Node.js 20+
acceptance_criteria:
  - Create an interview session
  - Write a seed file
ontology_schema:
  name: Demo
  description: Demo ontology
  fields:
    - name: Interview
      type: entity
      description: Interview entity
      required: true
metadata:
  seed_id: seed_fixed
  interview_id: interview_fixed
  ambiguity_score: 0.15
  forced: false
  created_at: 2026-03-31T00:00:00.000Z
`,
      "utf8"
    );

    const prdService = new PrdService(new SeedService(new FakeCodexRunner()));
    const { prd } = await prdService.createRunFromSource(cwd, join(cwd, "seed.yaml"));

    expect(prd.stories).toHaveLength(2);
    expect(prd.stories[0]?.title).toContain("Create an interview session");
    expect(prd.stories[1]?.title).toContain("Write a seed file");
  });
});
