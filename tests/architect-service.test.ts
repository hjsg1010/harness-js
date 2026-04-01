import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadArchitectInterviewState, loadRepoProfile } from "../src/infra/filesystem.js";
import { ArchitectService } from "../src/architect/service.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("ArchitectService", () => {
  it("builds a repo profile, persists architect interview rounds, and completes below threshold", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          packageManager: "npm@10.8.0",
          scripts: {
            build: "tsc -p tsconfig.json",
            test: "vitest run"
          }
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(join(cwd, "README.md"), "# Fixture\n", "utf8");
    await writeFile(join(cwd, "src-entry.ts"), "export const ready = true;\n", "utf8");

    const service = new ArchitectService();
    const state = await service.create("리서치 하네스를 구성해줘", cwd);
    const updated = await service.applyRound(
      state,
      {
        targeting: "work_units",
        rationale: "The work units still need clearer boundaries.",
        question: "이 하네스가 처리할 작업 단위를 세 가지로 나누면 무엇인가요?",
        answer: "웹 검색, 논문 조사, 커뮤니티 반응 분석을 분리하고 마지막에 synthesis를 만들고 싶어요.",
        breakdown: {
          domain_scope: { score: 0.9, justification: "Domain is clear.", gap: "Clear" },
          work_units: { score: 0.95, justification: "Work units are explicit.", gap: "Clear" },
          team_topology: { score: 0.9, justification: "Team shape is clear.", gap: "Clear" },
          verification_strategy: { score: 0.85, justification: "Verification is concrete.", gap: "Clear" },
          user_operating_style: { score: 0.9, justification: "Operating style is explicit.", gap: "Clear" }
        },
        weakestDimension: "verification_strategy",
        weakestDimensionRationale: "Only small verification detail remains."
      },
      cwd
    );

    expect(updated.status).toBe("completed");
    expect(updated.repoProfileId).toBeTruthy();
    expect(updated.currentAmbiguity).toBeLessThanOrEqual(0.2);
    expect(await service.createQuestionPrompt(cwd, updated)).toContain("Repo Profile");

    const profile = await loadRepoProfile(cwd, updated.repoProfileId);
    expect(profile.stack).toContain("typescript");
    expect(profile.scripts.build).toBe("tsc -p tsconfig.json");

    const persisted = await loadArchitectInterviewState(cwd, updated.interviewId);
    expect(persisted.rounds[0]?.question).toBe("이 하네스가 처리할 작업 단위를 세 가지로 나누면 무엇인가요?");
  });
});
