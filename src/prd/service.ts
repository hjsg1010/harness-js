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

interface ProjectScripts {
  testCommand: string | null;
  hasBuild: boolean;
  hasTypecheck: boolean;
  hasLint: boolean;
}

interface StoryPlan {
  criterion: string;
  workUnit: string | null;
  boundaryHints: string[];
  verificationFocus: string[];
  expectedArtifacts: string[];
}

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
      suggestedQuestionFocus: null,
      suggestedRepairFocus: null,
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
    const scripts = await discoverProjectScripts(cwd);
    const plans = seed.acceptance_criteria.flatMap((criterion) =>
      planCriterionStories(criterion, activeHarness)
    );
    return plans.map((plan, index) => {
      const storyId = `story_${String(index + 1).padStart(3, "0")}`;
      return {
        id: storyId,
        title: toTitleFromAcceptanceCriterion(plan.criterion),
        acceptanceCriteria: [plan.criterion],
        verificationCommands: buildVerificationCommands(plan, scripts),
        workUnit: plan.workUnit,
        boundaryHints: plan.boundaryHints,
        verificationFocus: plan.verificationFocus,
        expectedArtifacts: plan.expectedArtifacts,
        handoffContract: buildHandoffContract(storyId, plan),
        passes: false,
        attempts: 0,
        lastReviewerVerdict: "pending"
      };
    });
  }
}

async function discoverProjectScripts(cwd: string): Promise<ProjectScripts> {
  try {
    const packageJson = await readText(join(cwd, "package.json"));
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    return {
      testCommand: scripts["test:run"] ? "npm run test:run" : scripts.test ? "npm test" : null,
      hasBuild: Boolean(scripts.build),
      hasTypecheck: Boolean(scripts.typecheck),
      hasLint: Boolean(scripts.lint)
    };
  } catch {
    return {
      testCommand: null,
      hasBuild: false,
      hasTypecheck: false,
      hasLint: false
    };
  }
}

function planCriterionStories(
  criterion: string,
  activeHarness: HarnessSnapshot | null | undefined
): StoryPlan[] {
  const segments = splitCriterion(criterion, activeHarness);
  return segments.map((segment) => {
    const verificationFocus = deriveVerificationFocus(segment, activeHarness);
    const boundaryHints = deriveBoundaryHints(segment, activeHarness, verificationFocus);
    const workUnit = deriveWorkUnit(segment, activeHarness, boundaryHints);
    return {
      criterion: segment,
      workUnit,
      boundaryHints,
      verificationFocus,
      expectedArtifacts: deriveExpectedArtifacts(segment, workUnit)
    };
  });
}

function splitCriterion(
  criterion: string,
  activeHarness: HarnessSnapshot | null | undefined
): string[] {
  if (!activeHarness) {
    return [criterion];
  }

  const segments = criterion
    .split(/\s+\band\b\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return [criterion];
  }

  const hasReportSegment = segments.some((segment) => /(markdown|report|artifact|file)/i.test(segment));
  const hasPathSegment = segments.some((segment) => /(path|stable|rerun|location|contract)/i.test(segment));
  if (!hasReportSegment || !hasPathSegment) {
    return [criterion];
  }

  return segments;
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

function deriveWorkUnit(
  criterion: string,
  activeHarness: HarnessSnapshot | null | undefined,
  boundaryHints: string[]
): string | null {
  if (!activeHarness) {
    return null;
  }

  const criterionTokens = tokenize(criterion);
  const matches = activeHarness.workUnits
    .map((workUnit) => ({
      workUnit,
      score: scoreTextMatch(criterionTokens, workUnit)
    }))
    .sort((left, right) => right.score - left.score);

  if ((matches[0]?.score ?? 0) > 0) {
    return matches[0]?.workUnit ?? null;
  }

  if (/(markdown|report|artifact|file)/i.test(criterion)) {
    return findWorkUnit(activeHarness.workUnits, ["report", "markdown", "artifact", "output"]);
  }

  if (/(path|stable|rerun|location)/i.test(criterion)) {
    return findWorkUnit(activeHarness.workUnits, ["path", "stable", "contract", "cli"]);
  }

  return boundaryHints[0] ?? activeHarness.workUnits[0] ?? null;
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

function deriveExpectedArtifacts(criterion: string, workUnit: string | null): string[] {
  const pathMatch = criterion.match(/\b[\w./-]+\.(md|json|ya?ml|txt)\b/i);
  const expected: string[] = [];

  if (pathMatch?.[0]) {
    expected.push(pathMatch[0]);
  } else if (/(markdown|report)/i.test(criterion) || workUnit?.includes("report")) {
    expected.push("report.md");
  }

  if (/(path|stable|rerun|location)/i.test(criterion) || workUnit?.includes("path")) {
    expected.push("stable output path");
  }

  return uniqueStrings(expected);
}

function buildHandoffContract(storyId: string, plan: StoryPlan): string[] {
  return uniqueStrings([
    `Write a handoff note to _workspace/${storyId}_handoff.md with changed files and verification evidence.`,
    plan.expectedArtifacts.length > 0
      ? `Reference expected artifacts: ${plan.expectedArtifacts.join(", ")}.`
      : `Reference the owned work unit: ${plan.workUnit ?? "generic"} and its validation evidence.`
  ]);
}

function buildVerificationCommands(plan: StoryPlan, scripts: ProjectScripts): string[] {
  const corpus = [
    plan.criterion,
    plan.workUnit ?? "",
    ...plan.boundaryHints,
    ...plan.verificationFocus,
    ...plan.expectedArtifacts
  ]
    .join(" ")
    .toLowerCase();
  const commands: string[] = [];
  const hasRepoAwareSignal =
    Boolean(plan.workUnit) || plan.boundaryHints.length > 0 || plan.verificationFocus.length > 0;

  if (
    hasRepoAwareSignal &&
    scripts.hasTypecheck &&
    /(path|contract|cli|schema|type|interface|stable)/.test(corpus)
  ) {
    commands.push("npm run typecheck");
  }

  if (
    scripts.testCommand &&
    /(report|artifact|output|verification|markdown|file|stable|path)/.test(corpus)
  ) {
    commands.push(scripts.testCommand);
  }

  if (scripts.hasBuild && /(report|artifact|output|cli|path|stable|markdown)/.test(corpus)) {
    commands.push("npm run build");
  }

  if (scripts.hasLint && /(consisten|style|contract)/.test(corpus)) {
    commands.push("npm run lint");
  }

  if (commands.length === 0) {
    if (scripts.testCommand) {
      commands.push(scripts.testCommand);
    }
    if (scripts.hasBuild) {
      commands.push("npm run build");
    }
  }

  return uniqueStrings(commands);
}

function findWorkUnit(workUnits: string[], keywords: string[]): string | null {
  return (
    workUnits.find((workUnit) =>
      keywords.some((keyword) => workUnit.toLowerCase().includes(keyword))
    ) ?? null
  );
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
