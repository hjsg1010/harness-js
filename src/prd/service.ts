import { join } from "node:path";

import type {
  HarnessSnapshot,
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
  resolveRunPaths,
  tryLoadActiveHarness
} from "../infra/filesystem.js";
import { SeedService } from "../seed/service.js";

export class PrdService {
  constructor(private readonly seedService: SeedService) {}

  async createRunFromSource(
    cwd: string,
    sourcePath: string,
    options: { activeHarness?: HarnessSnapshot | null } = {}
  ): Promise<{ runId: string; prd: PrdDocument; loopState: LoopState }> {
    const sourceContent = sourcePath.endsWith(".md")
      ? await loadSpecFromPath(sourcePath)
      : await loadSeedFromPath(sourcePath);
    const { spec, seed } = this.seedService.loadSourceFromContent(sourcePath, sourceContent);
    const activeHarness = options.activeHarness ?? (await tryLoadActiveHarness(cwd));

    const stories = await this.buildStories(cwd, seed, activeHarness);
    const runId = createId("run");
    const prd: PrdDocument = {
      sourceSeedId: seed.metadata.seed_id,
      sourceSpecPath: sourcePath,
      sourceSeedPath: sourcePath,
      goal: seed.goal,
      status: "pending",
      activeHarness,
      stories
    };

    const loopState: LoopState = {
      runId,
      status: "pending",
      currentStoryId: null,
      reopenTarget: null,
      reopenStateId: null,
      suggestedNextCommand: null,
      reopenReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      repeatedFailures: {},
      reopenHistory: []
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

  private async buildStories(
    cwd: string,
    seed: SeedDocument,
    activeHarness: HarnessSnapshot | null | undefined
  ): Promise<UserStory[]> {
    const verificationCommands = await discoverVerificationCommands(cwd, activeHarness);
    return seed.acceptance_criteria.map((criterion, index) => {
      const verificationFocus = deriveVerificationFocus(criterion, activeHarness);
      const boundaryHints = deriveBoundaryHints(criterion, activeHarness, verificationFocus);
      return {
        id: `story_${String(index + 1).padStart(3, "0")}`,
        title: toTitleFromAcceptanceCriterion(criterion),
        acceptanceCriteria: [criterion],
        verificationCommands,
        boundaryHints,
        verificationFocus,
        passes: false,
        attempts: 0,
        lastReviewerVerdict: "pending"
      };
    });
  }
}

async function discoverVerificationCommands(
  cwd: string,
  activeHarness: HarnessSnapshot | null | undefined
): Promise<string[]> {
  try {
    const packageJson = await readText(join(cwd, "package.json"));
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const commands: string[] = [];
    const verificationBias = [
      ...(activeHarness?.verificationStrategy ?? []),
      ...(activeHarness?.verificationEmphasis ?? [])
    ]
      .join(" ")
      .toLowerCase();

    if (
      scripts.typecheck &&
      /(contract|type|path|interface|schema|consisten)/.test(verificationBias)
    ) {
      commands.push("npm run typecheck");
    }

    if (scripts["test:run"]) {
      commands.push("npm run test:run");
    } else if (scripts.test) {
      commands.push("npm test");
    }

    if (scripts.build) {
      commands.push("npm run build");
    }
    if (scripts.lint && /(consisten|style|contract)/.test(verificationBias)) {
      commands.push("npm run lint");
    }
    return [...new Set(commands)];
  } catch {
    return [];
  }
}

function deriveVerificationFocus(
  criterion: string,
  activeHarness: HarnessSnapshot | null | undefined
): string[] {
  if (!activeHarness) {
    return [];
  }

  const criterionTokens = tokenize(criterion);
  const candidates = [
    ...activeHarness.verificationEmphasis,
    ...activeHarness.verificationStrategy
  ];
  const matched = candidates.filter((item) => scoreTextMatch(criterionTokens, item) > 0);
  if (matched.length > 0) {
    return uniqueStrings([
      ...activeHarness.verificationEmphasis.slice(0, 2),
      ...matched
    ]);
  }

  return uniqueStrings([
    ...activeHarness.verificationEmphasis.slice(0, 2),
    ...activeHarness.verificationStrategy.slice(0, 1)
  ]);
}

function deriveBoundaryHints(
  criterion: string,
  activeHarness: HarnessSnapshot | null | undefined,
  verificationFocus: string[]
): string[] {
  if (!activeHarness) {
    return [];
  }

  const criterionTokens = tokenize(criterion);
  const directMatches = activeHarness.workUnits
    .map((workUnit) => ({
      workUnit,
      score: scoreTextMatch(criterionTokens, workUnit)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.workUnit);
  if (directMatches.length > 0) {
    return uniqueStrings(directMatches.slice(0, 2));
  }

  const verificationTokens = tokenize(verificationFocus.join(" "));
  const focusMatches = activeHarness.workUnits
    .map((workUnit) => ({
      workUnit,
      score: scoreTextMatch(verificationTokens, workUnit)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.workUnit);
  if (focusMatches.length > 0) {
    return uniqueStrings(focusMatches.slice(0, 2));
  }

  return activeHarness.workUnits.slice(0, 2);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreTextMatch(baseTokens: string[], candidate: string): number {
  const candidateTokens = tokenize(candidate);
  return candidateTokens.filter((token) => baseTokens.includes(token)).length;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
