import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { BROWNFIELD_IGNORE_DIRS } from "../core/constants.js";
import type { BrownfieldContext, ProjectType } from "../core/types.js";
import { nowIso } from "../core/utils.js";

const SIGNAL_FILES = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle"
];

export async function scanBrownfieldContext(cwd: string): Promise<BrownfieldContext> {
  const files = await collectCandidateFiles(cwd, cwd, []);
  const signalMatches = files.filter((file) => SIGNAL_FILES.some((signal) => file.endsWith(signal)));
  const sourceMatches = files.filter((file) => /\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(file));
  const projectType: ProjectType =
    signalMatches.length > 0 || sourceMatches.length > 0 ? "brownfield" : "greenfield";

  const signals = [
    ...signalMatches.slice(0, 4).map((file) => `manifest:${file}`),
    ...sourceMatches.slice(0, 8).map((file) => `source:${file}`)
  ];

  const summary =
    projectType === "brownfield"
      ? `Detected existing codebase signals: ${signals.join(", ")}`
      : "No existing source or manifest signals detected.";

  return {
    projectType,
    scannedAt: nowIso(),
    summary,
    signals,
    files: files.slice(0, 20)
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
  return files;
}
