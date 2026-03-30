import { join } from "node:path";

import type {
  LoopState,
  PrdDocument,
  SeedDocument,
  SpecDocument,
  UserStory
} from "../core/types.js";
import { createId, nowIso, toTitleFromAcceptanceCriterion } from "../core/utils.js";
import {
  initializeRunArtifacts,
  loadSeedFromPath,
  loadSpecFromPath,
  readText,
  readJson,
  resolveRunPaths
} from "../infra/filesystem.js";
import { SeedService } from "../seed/service.js";

export class PrdService {
  constructor(private readonly seedService: SeedService) {}

  async createRunFromSource(
    cwd: string,
    sourcePath: string
  ): Promise<{ runId: string; prd: PrdDocument; loopState: LoopState }> {
    const sourceContent = sourcePath.endsWith(".md")
      ? await loadSpecFromPath(sourcePath)
      : await loadSeedFromPath(sourcePath);
    const { spec, seed } = this.seedService.loadSourceFromContent(sourcePath, sourceContent);

    const stories = await this.buildStories(cwd, seed);
    const runId = createId("run");
    const prd: PrdDocument = {
      sourceSeedId: seed.metadata.seed_id,
      sourceSpecPath: sourcePath,
      sourceSeedPath: sourcePath,
      status: "pending",
      stories
    };

    const loopState: LoopState = {
      runId,
      status: "pending",
      currentStoryId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      repeatedFailures: {}
    };

    await initializeRunArtifacts(cwd, runId, prd, loopState);
    return { runId, prd, loopState };
  }

  async resumeRun(cwd: string, runId: string): Promise<{
    prd: PrdDocument;
    loopState: LoopState;
    progress: string;
    verification: import("../core/types.js").VerificationEntry[];
  }> {
    const runPaths = resolveRunPaths(cwd, runId);
    return {
      prd: await readJson<PrdDocument>(runPaths.prdPath),
      loopState: await readJson<LoopState>(runPaths.loopStatePath),
      progress: await readText(runPaths.progressPath),
      verification: await readJson(runPaths.verificationPath)
    };
  }

  private async buildStories(cwd: string, seed: SeedDocument): Promise<UserStory[]> {
    const verificationCommands = await discoverVerificationCommands(cwd);
    return seed.acceptance_criteria.map((criterion, index) => ({
      id: `story_${String(index + 1).padStart(3, "0")}`,
      title: toTitleFromAcceptanceCriterion(criterion),
      acceptanceCriteria: [criterion],
      verificationCommands,
      passes: false,
      attempts: 0,
      lastReviewerVerdict: "pending"
    }));
  }
}

async function discoverVerificationCommands(cwd: string): Promise<string[]> {
  try {
    const packageJson = await readText(join(cwd, "package.json"));
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const commands: string[] = [];
    if (scripts["test:run"]) {
      commands.push("npm run test:run");
    } else if (scripts.test) {
      commands.push("npm test");
    }
    if (scripts.build) {
      commands.push("npm run build");
    }
    return commands;
  } catch {
    return [];
  }
}
