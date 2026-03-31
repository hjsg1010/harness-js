import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { HarnessSnapshot, InterviewState, SeedDocument } from "../src/core/types.js";
import { PrdService } from "../src/prd/service.js";
import { SeedService } from "../src/seed/service.js";
import { saveInterviewState } from "../src/infra/filesystem.js";
import { renderSeedYaml } from "../src/infra/serializers.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

function buildHarnessSnapshot(): HarnessSnapshot {
  return {
    slug: "research-harness",
    harnessGoal: "Shape research and reporting work for this repository.",
    workUnits: ["markdown-report", "cli-contracts", "citation-cross-check"],
    teamTopology: ["orchestrator", "researcher", "synthesizer"],
    verificationStrategy: ["cross-check citations", "verify markdown output", "guard path consistency"],
    verificationEmphasis: ["CLI contracts", "path consistency", "evidence completeness"],
    agentNames: ["orchestrator", "researcher", "synthesizer"],
    skillNames: ["research-orchestrator", "research-web", "research-synthesis"],
    sourceSeedId: "harness_seed_fixed",
    sourceBlueprintId: "blueprint_fixed",
    activatedAt: "2026-03-31T00:00:00.000Z"
  };
}

describe("SeedService and PrdService", () => {
  it("injects the active harness into the seed blueprint prompt", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const interview: InterviewState = {
      interviewId: "interview_fixed",
      lane: "feature",
      status: "completed",
      initialIdea: "Build a research CLI",
      projectType: "brownfield",
      threshold: 0.2,
      currentAmbiguity: 0.15,
      dimensions: ["goal", "constraints", "criteria", "context"],
      weights: { goal: 0.35, constraints: 0.25, criteria: 0.25, context: 0.15 },
      brownfieldContext: {
        projectType: "brownfield",
        scannedAt: "2026-03-31T00:00:00.000Z",
        summary: "TypeScript CLI repository with npm scripts.",
        signals: ["package.json", "src/cli.ts"],
        files: ["README.md", "src/cli.ts"]
      },
      activeHarness: buildHarnessSnapshot(),
      rounds: [
        {
          roundNumber: 1,
          targeting: "criteria",
          rationale: "Clarify the output artifact.",
          question: "What should the CLI write?",
          answer: "A markdown research report with cited evidence.",
          askedAt: "2026-03-31T00:00:00.000Z",
          answeredAt: "2026-03-31T00:01:00.000Z",
          ambiguity: 0.15,
          breakdown: {
            goal: { score: 0.9, justification: "Clear", gap: "Clear" },
            constraints: { score: 0.9, justification: "Clear", gap: "Clear" },
            criteria: { score: 0.9, justification: "Clear", gap: "Clear" },
            context: { score: 0.9, justification: "Clear", gap: "Clear" }
          },
          weakestDimension: "criteria",
          weakestDimensionRationale: "Only formatting details remained."
        }
      ],
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:01:00.000Z"
    };
    await saveInterviewState(cwd, interview);

    const runner = new FakeCodexRunner();
    runner.pushExecJson({
      title: "Research CLI",
      goal: "Build a CLI that writes a markdown research report.",
      constraints: ["Use local files only"],
      nonGoals: ["No web UI"],
      acceptanceCriteria: ["The CLI writes a markdown report file with citations."],
      transcriptSummary: ["The user wants a markdown report."],
      technicalContext: ["TypeScript CLI repo"],
      ontology: [{ name: "Report", type: "artifact", fields: ["path"], relationships: [] }]
    });

    const service = new SeedService(runner);
    await service.generateFromInterview(cwd, interview.interviewId);

    expect(runner.execJsonPrompts[0]).toContain("Active Harness");
    expect(runner.execJsonPrompts[0]).toContain("research-harness");
    expect(runner.execJsonPrompts[0]).toContain("markdown-report");
    expect(runner.execJsonPrompts[0]).toContain("verification bias");
  });

  it("uses the active harness to enrich PRD stories and verification commands", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          scripts: {
            test: "vitest run",
            build: "tsc -p tsconfig.json",
            typecheck: "tsc -p tsconfig.json --noEmit",
            lint: "eslint ."
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const seed: SeedDocument = {
      goal: "Build a CLI that writes a markdown research report.",
      task_type: "code",
      constraints: ["Use local files only"],
      acceptance_criteria: [
        "The CLI writes a markdown report file with cited evidence.",
        "The CLI keeps output paths stable across reruns."
      ],
      ontology_schema: {
        name: "Research CLI",
        description: "Research CLI output ontology",
        fields: [
          {
            name: "Report",
            type: "artifact",
            description: "Markdown report artifact",
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
    const seedPath = join(cwd, "seed.yaml");
    await writeFile(seedPath, renderSeedYaml(seed), "utf8");

    const service = new PrdService(new SeedService(new FakeCodexRunner()));
    const result = await service.createRunFromSource(cwd, seedPath, {
      activeHarness: buildHarnessSnapshot()
    });

    expect(result.prd.stories[0]?.boundaryHints).toContain("markdown-report");
    expect(result.prd.stories[0]?.verificationFocus).toContain("CLI contracts");
    expect(result.prd.stories[0]?.verificationFocus).toContain("path consistency");
    expect(result.prd.stories[0]?.workUnit).toBe("markdown-report");
    expect(result.prd.stories[0]?.expectedArtifacts).toContain("report.md");
    expect(result.prd.stories[0]?.handoffContract?.[0]).toContain("_workspace");
    expect(result.prd.stories[0]?.verificationCommands).toContain("npm run typecheck");
    expect(result.prd.stories[0]?.verificationCommands).toContain("npm run build");
    expect(result.prd.stories[1]?.boundaryHints).toContain("cli-contracts");

    const persisted = JSON.parse(
      await readFile(join(cwd, ".harness", "runs", result.runId, "prd.json"), "utf8")
    ) as {
      stories: Array<{
        boundaryHints?: string[];
        verificationFocus?: string[];
        expectedArtifacts?: string[];
        handoffContract?: string[];
        workUnit?: string | null;
      }>;
    };
    expect(persisted.stories[0]?.boundaryHints).toContain("markdown-report");
    expect(persisted.stories[0]?.verificationFocus).toContain("CLI contracts");
    expect(persisted.stories[0]?.expectedArtifacts).toContain("report.md");
    expect(persisted.stories[0]?.workUnit).toBe("markdown-report");
  });

  it("splits mixed acceptance criteria into repo-aware stories when work units imply separate deliverables", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          scripts: {
            test: "vitest run",
            build: "tsc -p tsconfig.json",
            typecheck: "tsc -p tsconfig.json --noEmit"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const seed: SeedDocument = {
      goal: "Build a CLI that writes a markdown report and keeps the path stable.",
      task_type: "code",
      constraints: ["Use local files only"],
      acceptance_criteria: [
        "The CLI writes a markdown report file and keeps the output path stable across reruns."
      ],
      ontology_schema: {
        name: "Research CLI",
        description: "Research CLI output ontology",
        fields: [
          {
            name: "Report",
            type: "artifact",
            description: "Markdown report artifact",
            required: true
          }
        ]
      },
      metadata: {
        seed_id: "seed_split",
        interview_id: "interview_split",
        ambiguity_score: 0.12,
        forced: false,
        created_at: "2026-03-31T00:00:00.000Z"
      }
    };
    const seedPath = join(cwd, "seed.yaml");
    await writeFile(seedPath, renderSeedYaml(seed), "utf8");

    const service = new PrdService(new SeedService(new FakeCodexRunner()));
    const result = await service.createRunFromSource(cwd, seedPath, {
      activeHarness: {
        ...buildHarnessSnapshot(),
        workUnits: ["markdown-report", "path-stability", "cli-contracts"],
        verificationStrategy: ["verify markdown output", "guard path consistency"],
        verificationEmphasis: ["path consistency", "artifact completeness"]
      }
    });

    expect(result.prd.stories).toHaveLength(2);
    expect(result.prd.stories[0]?.workUnit).toBe("markdown-report");
    expect(result.prd.stories[1]?.workUnit).toBe("path-stability");
    expect(result.prd.stories[0]?.expectedArtifacts?.length).toBeGreaterThan(0);
    expect(result.prd.stories[1]?.handoffContract?.[0]).toContain("_workspace");
  });
});
