import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { HARNESS_DIRNAME, SNAPSHOT_IGNORE_DIRS } from "../core/constants.js";
import type {
  InterviewState,
  LoopState,
  PrdDocument,
  SeedDocument,
  SpecDocument,
  VerificationEntry
} from "../core/types.js";
import { nowIso } from "../core/utils.js";

export interface HarnessPaths {
  root: string;
  harnessRoot: string;
  interviewsDir: string;
  specsDir: string;
  seedsDir: string;
  runsDir: string;
}

export interface RunPaths {
  root: string;
  prdPath: string;
  loopStatePath: string;
  progressPath: string;
  verificationPath: string;
  workspaceDir: string;
}

export function resolveHarnessPaths(cwd: string): HarnessPaths {
  const harnessRoot = join(cwd, HARNESS_DIRNAME);
  return {
    root: cwd,
    harnessRoot,
    interviewsDir: join(harnessRoot, "interviews"),
    specsDir: join(harnessRoot, "specs"),
    seedsDir: join(harnessRoot, "seeds"),
    runsDir: join(harnessRoot, "runs")
  };
}

export function resolveRunPaths(cwd: string, runId: string): RunPaths {
  const harness = resolveHarnessPaths(cwd);
  const root = join(harness.runsDir, runId);
  return {
    root,
    prdPath: join(root, "prd.json"),
    loopStatePath: join(root, "loop-state.json"),
    progressPath: join(root, "progress.md"),
    verificationPath: join(root, "verification.json"),
    workspaceDir: join(root, "_workspace")
  };
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeText(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, value, "utf8");
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function initializeHarnessDirs(cwd: string): Promise<HarnessPaths> {
  const paths = resolveHarnessPaths(cwd);
  await Promise.all([
    ensureDir(paths.harnessRoot),
    ensureDir(paths.interviewsDir),
    ensureDir(paths.specsDir),
    ensureDir(paths.seedsDir),
    ensureDir(paths.runsDir)
  ]);
  return paths;
}

export async function saveInterviewState(cwd: string, state: InterviewState): Promise<string> {
  const paths = await initializeHarnessDirs(cwd);
  const target = join(paths.interviewsDir, `${state.interviewId}.json`);
  await writeJson(target, state);
  return target;
}

export async function loadInterviewState(cwd: string, interviewId: string): Promise<InterviewState> {
  const paths = resolveHarnessPaths(cwd);
  return readJson<InterviewState>(join(paths.interviewsDir, `${interviewId}.json`));
}

export async function saveSpecDocument(cwd: string, filename: string, content: string): Promise<string> {
  const paths = await initializeHarnessDirs(cwd);
  const target = join(paths.specsDir, filename);
  await writeText(target, content);
  return target;
}

export async function saveSeedDocument(cwd: string, filename: string, content: string): Promise<string> {
  const paths = await initializeHarnessDirs(cwd);
  const target = join(paths.seedsDir, filename);
  await writeText(target, content);
  return target;
}

export async function initializeRunArtifacts(
  cwd: string,
  runId: string,
  prd: PrdDocument,
  loopState: LoopState
): Promise<RunPaths> {
  const runPaths = resolveRunPaths(cwd, runId);
  await Promise.all([ensureDir(runPaths.root), ensureDir(runPaths.workspaceDir)]);
  await Promise.all([
    writeJson(runPaths.prdPath, prd),
    writeJson(runPaths.loopStatePath, loopState),
    writeText(runPaths.progressPath, `# Ralph Progress\n\nCreated: ${nowIso()}\n`),
    writeJson(runPaths.verificationPath, [])
  ]);
  return runPaths;
}

export async function loadRunArtifacts(cwd: string, runId: string): Promise<{
  prd: PrdDocument;
  loopState: LoopState;
  progress: string;
  verification: VerificationEntry[];
}> {
  const runPaths = resolveRunPaths(cwd, runId);
  return {
    prd: await readJson<PrdDocument>(runPaths.prdPath),
    loopState: await readJson<LoopState>(runPaths.loopStatePath),
    progress: await readText(runPaths.progressPath),
    verification: await readJson<VerificationEntry[]>(runPaths.verificationPath)
  };
}

export async function persistRunArtifacts(
  cwd: string,
  runId: string,
  artifacts: {
    prd: PrdDocument;
    loopState: LoopState;
    progress: string;
    verification: VerificationEntry[];
  }
): Promise<void> {
  const runPaths = resolveRunPaths(cwd, runId);
  await Promise.all([
    writeJson(runPaths.prdPath, artifacts.prd),
    writeJson(runPaths.loopStatePath, artifacts.loopState),
    writeText(runPaths.progressPath, artifacts.progress),
    writeJson(runPaths.verificationPath, artifacts.verification)
  ]);
}

export async function loadSeedFromPath(path: string): Promise<string> {
  return readText(path);
}

export async function loadSpecFromPath(path: string): Promise<string> {
  return readText(path);
}

export async function cleanupTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function snapshotProject(cwd: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  await walkProject(cwd, cwd, snapshot);
  return snapshot;
}

async function walkProject(
  root: string,
  current: string,
  snapshot: Record<string, string>
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    const relPath = relative(root, fullPath);
    const topLevel = relPath.split("/")[0];
    if (SNAPSHOT_IGNORE_DIRS.has(entry.name) || SNAPSHOT_IGNORE_DIRS.has(topLevel)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkProject(root, fullPath, snapshot);
      continue;
    }

    const content = await readFile(fullPath);
    snapshot[relPath] = createHash("sha1").update(content).digest("hex");
  }
}

export function diffSnapshots(
  before: Record<string, string>,
  after: Record<string, string>
): string[] {
  const changed = new Set<string>();
  for (const [path, hash] of Object.entries(after)) {
    if (!before[path] || before[path] !== hash) {
      changed.add(path);
    }
  }
  for (const path of Object.keys(before)) {
    if (!after[path]) {
      changed.add(path);
    }
  }
  return [...changed].sort();
}
