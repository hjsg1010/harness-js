import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { GeneratedHarnessManifest } from "../src/core/types.js";
import {
  loadGeneratedHarnessManifest,
  resolveGeneratedHarnessPaths,
  saveGeneratedHarnessManifest,
  tryLoadGeneratedHarnessManifest
} from "../src/infra/filesystem.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("generated harness manifest storage", () => {
  it("writes manifests under the harness slug directory", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const manifest: GeneratedHarnessManifest = {
      blueprintId: "blueprint_fixed",
      seedId: "seed_fixed",
      slug: "research-harness",
      generatedAt: "2026-03-31T00:00:00.000Z",
      files: [{ path: ".claude/agents/research-harness-orchestrator.md", sha1: "abc123" }],
      conflicts: []
    };

    const path = await saveGeneratedHarnessManifest(cwd, manifest);
    expect(path).toBe(resolveGeneratedHarnessPaths(cwd, "research-harness").manifestPath);

    const loaded = await loadGeneratedHarnessManifest(cwd, "research-harness");
    expect(loaded.slug).toBe("research-harness");
  });

  it("falls back to the legacy top-level manifest when the slug-specific file is absent", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const legacyDir = join(cwd, ".harness", "generated-harness");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      join(legacyDir, "manifest.json"),
      `${JSON.stringify(
        {
          blueprintId: "blueprint_fixed",
          seedId: "seed_fixed",
          slug: "research-harness",
          generatedAt: "2026-03-31T00:00:00.000Z",
          files: [],
          conflicts: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const loaded = await tryLoadGeneratedHarnessManifest(cwd, "research-harness");
    expect(loaded?.slug).toBe("research-harness");
  });
});
