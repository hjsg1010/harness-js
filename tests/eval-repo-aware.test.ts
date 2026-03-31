import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { HarnessSnapshot } from "../src/core/types.js";
import { PrdService } from "../src/prd/service.js";
import { SeedService } from "../src/seed/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

function buildRepoAwareHarness(): HarnessSnapshot {
  return {
    slug: "research-harness",
    harnessGoal: "Shape research and report delivery for this repository.",
    workUnits: ["markdown-report", "path-stability", "cli-contracts"],
    teamTopology: ["orchestrator", "researcher", "synthesizer"],
    verificationStrategy: ["verify markdown output", "guard path consistency", "preserve CLI contracts"],
    verificationEmphasis: ["path consistency", "artifact completeness", "CLI contracts"],
    agentNames: ["orchestrator", "researcher", "synthesizer"],
    skillNames: ["research-orchestrator", "research-synthesis"],
    sourceSeedId: "harness_seed_fixed",
    sourceBlueprintId: "blueprint_fixed",
    activatedAt: "2026-03-31T00:00:00.000Z"
  };
}

describe("repo-aware eval", () => {
  it("produces richer planning than the generic flow for the same seed", async () => {
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

    const fixtureSeed = await readFile(
      join(process.cwd(), "tests", "eval-fixtures", "research-report-seed.yaml"),
      "utf8"
    );
    const seedPath = join(cwd, "seed.yaml");
    await writeFile(seedPath, fixtureSeed, "utf8");

    const service = new PrdService(new SeedService(new FakeCodexRunner()));
    const generic = await service.createRunFromSource(cwd, seedPath, {
      activeHarness: null
    });
    const repoAware = await service.createRunFromSource(cwd, seedPath, {
      activeHarness: buildRepoAwareHarness()
    });

    expect(repoAware.prd.stories.length).toBeGreaterThan(generic.prd.stories.length);
    expect(repoAware.prd.stories.some((story) => (story.expectedArtifacts?.length ?? 0) > 0)).toBe(true);
    expect(repoAware.prd.stories.some((story) => story.workUnit === "path-stability")).toBe(true);
    expect(repoAware.prd.stories.some((story) => story.verificationCommands.includes("npm run typecheck"))).toBe(true);
    expect(generic.prd.stories.some((story) => story.verificationCommands.includes("npm run typecheck"))).toBe(false);
  });
});
