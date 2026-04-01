#!/usr/bin/env node
import { resolve } from "node:path";

import type {
  ArchitectRoundInput,
  FeatureRoundInput,
  HarnessBlueprint,
  SeedBlueprint,
  StoryResultInput
} from "./core/types.js";
import { ArchitectService } from "./architect/service.js";
import { HarnessBlueprintService } from "./architect/blueprint-service.js";
import { HarnessScaffoldService } from "./architect/scaffold-service.js";
import { resolveHarnessPaths, readJson } from "./infra/filesystem.js";
import { InterviewService } from "./interview/service.js";
import { PrdService } from "./prd/service.js";
import { RalphService } from "./ralph/service.js";
import { SeedService } from "./seed/service.js";

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command !== "internal") {
    throw new Error(
      "Hybrid Harness is now Claude-native. Use Claude slash commands or `harness internal --help` for helper commands."
    );
  }

  await runInternal(argv, process.cwd());
}

async function runInternal(argv: string[], cwd: string): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printInternalUsage();
    return;
  }

  const interviewService = new InterviewService();
  const architectService = new ArchitectService();
  const seedService = new SeedService();
  const harnessBlueprintService = new HarnessBlueprintService();
  const harnessScaffoldService = new HarnessScaffoldService();
  const prdService = new PrdService(seedService);
  const ralphService = new RalphService();

  switch (subcommand) {
    case "feature-init":
      await runFeatureInit(rest, cwd, interviewService);
      return;
    case "feature-apply-round":
      await runFeatureApplyRound(rest, cwd, interviewService);
      return;
    case "architect-init":
      await runArchitectInit(rest, cwd, architectService);
      return;
    case "architect-apply-round":
      await runArchitectApplyRound(rest, cwd, architectService);
      return;
    case "seed-render":
      await runSeedRender(rest, cwd, seedService);
      return;
    case "blueprint-render":
      await runBlueprintRender(rest, cwd, harnessBlueprintService);
      return;
    case "scaffold":
      await runScaffold(rest, cwd, harnessScaffoldService);
      return;
    case "run-init":
      await runRunInit(rest, cwd, prdService);
      return;
    case "run-apply-story":
      await runRunApplyStory(rest, cwd, prdService, ralphService);
      return;
    default:
      throw new Error(`Unknown internal command: ${subcommand}`);
  }
}

async function runFeatureInit(
  argv: string[],
  cwd: string,
  interviewService: InterviewService
): Promise<void> {
  const resume = readFlagValue(argv, "--resume");
  const idea = readFlagValue(argv, "--idea") ?? positionalArgs(argv, new Set(["--resume", "--idea"])).join(" ").trim();
  if (!resume && !idea) {
    throw new Error("feature-init requires --idea or --resume");
  }

  const state = resume ? await interviewService.resume(resume, cwd) : await interviewService.create(idea, cwd);
  printJsonIfRequested(argv, {
    lane: "feature",
    interviewId: state.interviewId,
    state,
    questionPrompt: interviewService.createQuestionPrompt(state),
    questionSchema: interviewService.createQuestionSchema(state),
    statePath: resolveHarnessPaths(cwd).interviewsDir,
    resumeCommand: `harness internal feature-init --resume ${state.interviewId} --json`
  });
}

async function runFeatureApplyRound(
  argv: string[],
  cwd: string,
  interviewService: InterviewService
): Promise<void> {
  const interviewId = readRequiredFlag(argv, "--interview-id");
  const roundFile = readRequiredFlag(argv, "--round-file");
  const state = await interviewService.resume(interviewId, cwd);
  const input = await readJson<FeatureRoundInput>(resolve(cwd, roundFile));
  const updated = await interviewService.applyRound(state, input, cwd);
  printJsonIfRequested(argv, {
    lane: "feature",
    interviewId,
    state: updated,
    questionPrompt:
      updated.status === "completed" ? null : interviewService.createQuestionPrompt(updated),
    questionSchema:
      updated.status === "completed" ? null : interviewService.createQuestionSchema(updated),
    nextCommand:
      updated.status === "completed"
        ? `harness internal seed-render --interview-id ${updated.interviewId} --draft-file <draft.json>`
        : `harness internal feature-apply-round --interview-id ${updated.interviewId} --round-file <round.json> --json`
  });
}

async function runArchitectInit(
  argv: string[],
  cwd: string,
  architectService: ArchitectService
): Promise<void> {
  const resume = readFlagValue(argv, "--resume");
  const goal = readFlagValue(argv, "--goal") ?? positionalArgs(argv, new Set(["--resume", "--goal"])).join(" ").trim();
  if (!resume && !goal) {
    throw new Error("architect-init requires --goal or --resume");
  }

  const state = resume ? await architectService.resume(resume, cwd) : await architectService.create(goal, cwd);
  printJsonIfRequested(argv, {
    lane: "architect",
    interviewId: state.interviewId,
    state,
    questionPrompt: await architectService.createQuestionPrompt(cwd, state),
    questionSchema: architectService.createQuestionSchema(),
    statePath: resolveHarnessPaths(cwd).harnessInterviewsDir,
    resumeCommand: `harness internal architect-init --resume ${state.interviewId} --json`
  });
}

async function runArchitectApplyRound(
  argv: string[],
  cwd: string,
  architectService: ArchitectService
): Promise<void> {
  const interviewId = readRequiredFlag(argv, "--interview-id");
  const roundFile = readRequiredFlag(argv, "--round-file");
  const state = await architectService.resume(interviewId, cwd);
  const input = await readJson<ArchitectRoundInput>(resolve(cwd, roundFile));
  const updated = await architectService.applyRound(state, input, cwd);
  printJsonIfRequested(argv, {
    lane: "architect",
    interviewId,
    state: updated,
    questionPrompt:
      updated.status === "completed" ? null : await architectService.createQuestionPrompt(cwd, updated),
    questionSchema: updated.status === "completed" ? null : architectService.createQuestionSchema(),
    nextCommand:
      updated.status === "completed"
        ? `harness internal blueprint-render --interview-id ${updated.interviewId} --draft-file <draft.json>`
        : `harness internal architect-apply-round --interview-id ${updated.interviewId} --round-file <round.json> --json`
  });
}

async function runSeedRender(argv: string[], cwd: string, seedService: SeedService): Promise<void> {
  const interviewId = readRequiredFlag(argv, "--interview-id");
  const draftFile = readRequiredFlag(argv, "--draft-file");
  const force = argv.includes("--force");
  const draft = await readJson<SeedBlueprint>(resolve(cwd, draftFile));
  const result = await seedService.generateFromDraft(cwd, interviewId, draft, { force });
  printJsonIfRequested(argv, {
    interviewId,
    specPath: result.specPath,
    seedPath: result.seedPath,
    spec: result.spec,
    seed: result.seed
  });
}

async function runBlueprintRender(
  argv: string[],
  cwd: string,
  blueprintService: HarnessBlueprintService
): Promise<void> {
  const interviewId = readRequiredFlag(argv, "--interview-id");
  const draftFile = readRequiredFlag(argv, "--draft-file");
  const force = argv.includes("--force");
  const draft = await readJson<HarnessBlueprint>(resolve(cwd, draftFile));
  const result = await blueprintService.generateFromDraft(cwd, interviewId, draft, { force });
  printJsonIfRequested(argv, {
    interviewId,
    blueprintPath: result.blueprintPath,
    seedPath: result.seedPath,
    blueprint: result.blueprint,
    seed: result.seed
  });
}

async function runScaffold(
  argv: string[],
  cwd: string,
  scaffoldService: HarnessScaffoldService
): Promise<void> {
  const source = readRequiredFlag(argv, "--source");
  const result = await scaffoldService.generateFromSource(cwd, resolve(cwd, source));
  printJsonIfRequested(argv, result);
}

async function runRunInit(argv: string[], cwd: string, prdService: PrdService): Promise<void> {
  const source = readRequiredFlag(argv, "--source");
  const result = await prdService.createRunFromSource(cwd, resolve(cwd, source));
  const nextStory = result.prd.stories.find((story) => !story.passes) ?? null;
  printJsonIfRequested(argv, {
    runId: result.runId,
    prd: result.prd,
    loopState: result.loopState,
    nextStory,
    nextCommand:
      nextStory
        ? `harness internal run-apply-story --run-id ${result.runId} --story-result-file <story-result.json> --json`
        : null
  });
}

async function runRunApplyStory(
  argv: string[],
  cwd: string,
  prdService: PrdService,
  ralphService: RalphService
): Promise<void> {
  const runId = readRequiredFlag(argv, "--run-id");
  const storyResultFile = readRequiredFlag(argv, "--story-result-file");
  const artifacts = await prdService.resumeRun(cwd, runId);
  const input = await readJson<StoryResultInput>(resolve(cwd, storyResultFile));
  const result = await ralphService.applyStoryResult(cwd, runId, artifacts, input);
  const nextStory = result.prd.stories.find((story) => !story.passes) ?? null;
  printJsonIfRequested(argv, {
    runId,
    prd: result.prd,
    loopState: result.loopState,
    verification: result.verification,
    nextStory,
    nextCommand:
      result.loopState.status === "completed"
        ? null
        : result.loopState.status === "reopen_required"
          ? result.loopState.suggestedNextCommand
          : nextStory
            ? `harness internal run-apply-story --run-id ${runId} --story-result-file <story-result.json> --json`
            : null
  });
}

function printUsage(): void {
  console.log(`Hybrid Harness is now Claude-native.

Use Claude slash commands from the marketplace plugin:
- /harness
- /harness-interview
- /harness-architect
- /harness-seed
- /harness-blueprint
- /harness-scaffold
- /harness-ralph
- /harness-run

For deterministic helper commands only:
  harness internal --help
`);
}

function printInternalUsage(): void {
  console.log(`Internal helper commands:

  harness internal feature-init --idea "<idea>" --json
  harness internal feature-init --resume <interview-id> --json
  harness internal feature-apply-round --interview-id <id> --round-file <round.json> --json
  harness internal architect-init --goal "<goal>" --json
  harness internal architect-init --resume <interview-id> --json
  harness internal architect-apply-round --interview-id <id> --round-file <round.json> --json
  harness internal seed-render --interview-id <id> --draft-file <draft.json> [--force] --json
  harness internal blueprint-render --interview-id <id> --draft-file <draft.json> [--force] --json
  harness internal scaffold --source <blueprint-or-seed-path> --json
  harness internal run-init --source <spec-or-seed-path> --json
  harness internal run-apply-story --run-id <id> --story-result-file <story-result.json> --json
`);
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function readRequiredFlag(argv: string[], flag: string): string {
  const value = readFlagValue(argv, flag);
  if (!value) {
    throw new Error(`Missing required flag: ${flag}`);
  }
  return value;
}

function positionalArgs(argv: string[], flags: Set<string>): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (flags.has(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) {
      continue;
    }
    result.push(value);
  }
  return result;
}

function printJsonIfRequested(argv: string[], payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
