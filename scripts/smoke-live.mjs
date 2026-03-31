#!/usr/bin/env node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

if (process.env.HARNESS_LIVE_SMOKE !== "1") {
  console.log("Skipping live smoke. Set HARNESS_LIVE_SMOKE=1 to run against a real codex environment.");
  process.exit(0);
}

await ensureCommand("codex");

const tempRoot = await mkdtemp(join(tmpdir(), "hybrid-harness-live-smoke-"));
const keepArtifacts = process.env.HARNESS_LIVE_SMOKE_KEEP === "1";

try {
  await writeFile(
    join(tempRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "hybrid-harness-live-smoke",
        private: true,
        type: "module",
        scripts: {
          test: "node -e \"process.exit(0)\"",
          build: "node -e \"process.exit(0)\"",
          typecheck: "node -e \"process.exit(0)\""
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await writeFile(
    join(tempRoot, "seed.yaml"),
    `goal: Build a CLI smoke report.
task_type: code
constraints:
  - Use local files only
acceptance_criteria:
  - The CLI writes a markdown smoke report to smoke-report.md and keeps the output path stable across reruns.
ontology_schema:
  name: Smoke Report
  description: Smoke report ontology
  fields:
    - name: Report
      type: artifact
      description: Markdown smoke report artifact
      required: true
metadata:
  seed_id: live_smoke_seed
  interview_id: live_smoke_interview
  ambiguity_score: 0.0
  forced: false
  created_at: 2026-03-31T00:00:00.000Z
`,
    "utf8"
  );

  await runCommand("node", [join(repoRoot, "dist/cli.js"), "ralph", join(tempRoot, "seed.yaml")], tempRoot);

  const runsDir = join(tempRoot, ".harness", "runs");
  const runIds = await readdir(runsDir);
  if (runIds.length === 0) {
    throw new Error("Live smoke did not create any run artifacts.");
  }

  const latestRun = runIds.sort().at(-1);
  const loopStatePath = join(runsDir, latestRun, "loop-state.json");
  const loopState = JSON.parse(await readFile(loopStatePath, "utf8"));
  console.log(`Live smoke completed with status: ${loopState.status}`);
} finally {
  if (!keepArtifacts) {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`Keeping live smoke artifacts at: ${tempRoot}`);
  }
}

function ensureCommand(command) {
  return runCommand("bash", ["-lc", `command -v ${command} >/dev/null 2>&1`], repoRoot, false);
}

function runCommand(command, args, cwd, pipeOutput = true) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: pipeOutput ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "ignore"]
    });

    let stdout = "";
    let stderr = "";
    if (pipeOutput) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        if (stdout.trim().length > 0) {
          process.stdout.write(stdout);
        }
        if (stderr.trim().length > 0) {
          process.stderr.write(stderr);
        }
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          [`Command failed: ${command} ${args.join(" ")}`, stdout.trim(), stderr.trim()]
            .filter((part) => part.length > 0)
            .join("\n")
        )
      );
    });
  });
}
