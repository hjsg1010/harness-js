import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import { BROWNFIELD_IGNORE_DIRS } from "../core/constants.js";
import type { RepoProfile } from "../core/types.js";
import { createId, nowIso } from "../core/utils.js";

const STACK_BY_FILE: Array<[RegExp, string]> = [
  [/package\.json$/, "typescript"],
  [/tsconfig\.json$/, "typescript"],
  [/\.tsx?$/, "typescript"],
  [/\.jsx?$/, "javascript"],
  [/pyproject\.toml$/, "python"],
  [/\.py$/, "python"],
  [/go\.mod$/, "go"],
  [/\.go$/, "go"],
  [/Cargo\.toml$/, "rust"],
  [/\.rs$/, "rust"],
  [/pom\.xml$/, "java"],
  [/build\.gradle$/, "java"]
];

export async function scanRepoProfile(cwd: string): Promise<RepoProfile> {
  const files = await collectCandidateFiles(cwd, cwd, []);
  const topLevelEntries = await readdir(cwd, { withFileTypes: true });
  const topLevelDirectories = topLevelEntries
    .filter((entry) => entry.isDirectory() && !BROWNFIELD_IGNORE_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  const packageJson = await readPackageJson(cwd);
  const scripts = packageJson?.scripts ?? {};
  const packageManager = detectPackageManager(files, packageJson);
  const stack = detectStack(files, packageJson);
  const likelyBoundaries = detectLikelyBoundaries(topLevelDirectories, scripts);
  const conventions = detectConventions(packageJson, scripts, files);
  const riskSurfaces = detectRiskSurfaces(files, scripts);
  const relevantFiles = files
    .filter((file) => isRelevantFile(file))
    .slice(0, 16);

  const summary = [
    `Stack: ${stack.join(", ") || "unknown"}`,
    `Package manager: ${packageManager}`,
    `Top-level dirs: ${topLevelDirectories.join(", ") || "none"}`,
    `Key scripts: ${Object.keys(scripts).join(", ") || "none"}`
  ].join(" | ");

  return {
    profileId: createId("repo_profile"),
    scannedAt: nowIso(),
    summary,
    stack,
    packageManager,
    scripts,
    topLevelDirectories,
    likelyBoundaries,
    conventions,
    riskSurfaces,
    relevantFiles
  };
}

async function collectCandidateFiles(
  root: string,
  current: string,
  files: string[]
): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    const relPath = relative(root, fullPath);
    const topLevel = relPath.split("/")[0];
    if (BROWNFIELD_IGNORE_DIRS.has(entry.name) || BROWNFIELD_IGNORE_DIRS.has(topLevel)) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectCandidateFiles(root, fullPath, files);
      continue;
    }
    files.push(relPath);
  }
  return files.sort();
}

async function readPackageJson(cwd: string): Promise<{
  packageManager?: string;
  type?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
} | null> {
  try {
    return JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
      packageManager?: string;
      type?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function detectPackageManager(files: string[], packageJson: { packageManager?: string } | null): string {
  if (packageJson?.packageManager) {
    return packageJson.packageManager.split("@")[0] ?? packageJson.packageManager;
  }
  if (files.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (files.includes("yarn.lock")) {
    return "yarn";
  }
  if (files.includes("bun.lockb")) {
    return "bun";
  }
  if (files.includes("package-lock.json") || files.includes("package.json")) {
    return "npm";
  }
  return "unknown";
}

function detectStack(
  files: string[],
  packageJson: {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  } | null
): string[] {
  const detected = new Set<string>();
  for (const file of files) {
    for (const [pattern, name] of STACK_BY_FILE) {
      if (pattern.test(file)) {
        detected.add(name);
      }
    }
  }

  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };
  if ("vitest" in dependencies) {
    detected.add("vitest");
  }
  if ("typescript" in dependencies) {
    detected.add("typescript");
  }

  return [...detected].sort();
}

function detectLikelyBoundaries(directories: string[], scripts: Record<string, string>): string[] {
  const boundaries = new Set<string>();
  for (const directory of directories) {
    if (["src", "tests", "docs", ".claude", ".agents"].includes(directory)) {
      boundaries.add(directory);
    }
  }
  if (scripts.build) {
    boundaries.add("build");
  }
  if (scripts.test) {
    boundaries.add("test");
  }
  return [...boundaries];
}

function detectConventions(
  packageJson: { type?: string } | null,
  scripts: Record<string, string>,
  files: string[]
): string[] {
  const conventions: string[] = [];
  if (packageJson?.type === "module") {
    conventions.push("ES modules");
  }
  if (scripts.build) {
    conventions.push("Build script present");
  }
  if (scripts.test) {
    conventions.push("Test script present");
  }
  if (files.some((file) => file.startsWith("docs/"))) {
    conventions.push("Documentation under docs/");
  }
  if (
    files.some(
      (file) =>
        file.startsWith("commands/") ||
        file.startsWith("agents/") ||
        file.startsWith("skills/") ||
        file.startsWith(".claude-plugin/")
    )
  ) {
    conventions.push("Claude plugin assets tracked in repo");
  }
  return conventions;
}

function detectRiskSurfaces(files: string[], scripts: Record<string, string>): string[] {
  const risks: string[] = [];
  if (scripts.build) {
    risks.push("Build output can drift from source changes");
  }
  if (scripts.test) {
    risks.push("Verification depends on local test scripts");
  }
  if (
    files.some(
      (file) =>
        file.startsWith("commands/") ||
        file.startsWith("agents/") ||
        file.startsWith("skills/") ||
        file.startsWith(".claude-plugin/")
    )
  ) {
    risks.push("Claude plugin assets can diverge from repo intent");
  }
  if (files.some((file) => basename(file) === "README.md")) {
    risks.push("README usage examples can drift from CLI behavior");
  }
  return risks;
}

function isRelevantFile(file: string): boolean {
  const name = basename(file);
  return (
    ["README.md", "package.json", "tsconfig.json"].includes(name) ||
    file.startsWith("src/") ||
    file.startsWith("tests/") ||
    file.startsWith("docs/") ||
    [".ts", ".tsx", ".js", ".md", ".json", ".yaml", ".yml"].includes(extname(file))
  );
}
