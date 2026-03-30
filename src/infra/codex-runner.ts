import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { CodexExecOptions, CodexRunner } from "../core/types.js";
import { extractJsonObject } from "../core/utils.js";
import { cleanupTempDir, pathExists } from "./filesystem.js";

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ProcessCodexRunner implements CodexRunner {
  constructor(
    private readonly binary = "codex",
    private readonly defaultModel = "gpt-5.4"
  ) {}

  async execText(prompt: string, options: CodexExecOptions): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), "hybrid-harness-"));
    try {
      const outputFile = join(tempDir, "output.txt");
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--cd",
        options.cwd,
        "--sandbox",
        options.sandbox ?? "read-only",
        "-m",
        options.model ?? this.defaultModel,
        "--output-last-message",
        outputFile,
        "-"
      ];
      const result = await this.runProcess(args, prompt);
      if (result.exitCode !== 0) {
        throw new Error(`codex exec failed: ${result.stderr || result.stdout}`);
      }
      return readFile(outputFile, "utf8");
    } finally {
      await cleanupTempDir(tempDir);
    }
  }

  async execJson<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: CodexExecOptions
  ): Promise<T> {
    const tempDir = await mkdtemp(join(tmpdir(), "hybrid-harness-"));
    try {
      const schemaFile = join(tempDir, "schema.json");
      const outputFile = join(tempDir, "output.json");
      await writeFile(schemaFile, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

      const args = [
        "exec",
        "--skip-git-repo-check",
        "--cd",
        options.cwd,
        "--sandbox",
        options.sandbox ?? "read-only",
        "-m",
        options.model ?? this.defaultModel,
        "--output-schema",
        schemaFile,
        "--output-last-message",
        outputFile,
        "-"
      ];
      const result = await this.runProcess(args, prompt);
      if (result.exitCode !== 0) {
        throw new Error(`codex exec failed: ${result.stderr || result.stdout}`);
      }
      return JSON.parse(await readFile(outputFile, "utf8")) as T;
    } finally {
      await cleanupTempDir(tempDir);
    }
  }

  async reviewJson<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: { cwd: string; model?: string }
  ): Promise<T> {
    if (await this.isGitRepo(options.cwd)) {
      const args = [
        "review",
        "--uncommitted",
        "-c",
        `model="${options.model ?? this.defaultModel}"`,
        "-"
      ];
      const result = await this.runProcess(args, prompt, options.cwd);
      if (result.exitCode === 0) {
        const jsonText = extractJsonObject(result.stdout);
        if (jsonText) {
          return JSON.parse(jsonText) as T;
        }
      }
    }

    return this.execJson<T>(
      `${prompt}\n\nReturn only JSON that matches the provided schema.`,
      schema,
      {
        cwd: options.cwd,
        model: options.model,
        sandbox: "read-only"
      }
    );
  }

  private async isGitRepo(cwd: string): Promise<boolean> {
    return pathExists(join(cwd, ".git"));
  }

  private runProcess(args: string[], prompt: string, cwd?: string): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
