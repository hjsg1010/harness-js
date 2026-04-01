# Claude Native Cleanup Plan

## 1. Original request

사용자는 `harness-js`에서 불필요한 코드와 불필요한 문서 내용을 제거하고 push해 달라고 요청했다. 이어서 방향을 분명히 하며, `Codex` subprocess 중심 구조가 아니라 `Claude Code` 기반의 agent-native 자산 중심으로 정리하고, `references/ouroboros`와 `references/oh-my-claudecode`의 구조를 참고하라고 지시했다.

## 2. Situation overview

현재 저장소는 top-level `agents/`, `skills/`, `.claude-plugin/`를 갖고 있어 Claude plugin 자산을 일부 갖춘 상태이지만, 실제 TypeScript CLI는 `ProcessCodexRunner`를 통해 `codex exec` / `codex review`를 직접 호출한다. 이 구조는 현재 사용자 환경과 맞지 않고, corporate 환경에서는 아예 실행되지 않는다.

또한 plugin 공식 자산으로 볼 수 있는 top-level `agents/`, `skills/`와 별개로 `.claude/agents`, `.claude/skills`, `.agents/skills/harness-*` 같은 tracked duplicate가 공존하고 있다. README와 usage guides도 아직 `Codex` runtime과 standalone CLI end-to-end 사용을 전제로 설명하고 있다.

## 3. Current implementation analysis

- `src/cli.ts`
  - public command가 `interview`, `architect`, `seed`, `blueprint`, `scaffold`, `ralph`, `run`으로 열려 있음
  - interactive `readline` 루프와 `ProcessCodexRunner` 생성이 결합되어 있음
- `src/infra/codex-runner.ts`
  - `codex` binary, `gpt-5.4` default model, `codex exec/review` subprocess 호출을 담당
- `src/interview/service.ts`, `src/architect/service.ts`, `src/seed/service.ts`, `src/architect/blueprint-service.ts`, `src/ralph/service.ts`
  - 모두 `CodexRunner`에 직접 의존하고 있음
- `src/architect/scaffold-service.ts`
  - generated harness에 `.agents/skills/*` Codex 자산까지 공식 생성물로 포함
- 문서
  - `README.md`, `docs/HARNESS_MODE_GUIDE.md`, `docs/SOLPE_HARNESS_USAGE_GUIDE.md`, `docs/IMPLEMENTATION_REPO_HARNESS_USAGE_GUIDE.md`에 stale `Codex` / CLI 중심 서술이 남아 있음

## 4. Requirements mapping

- Claude-native official runtime으로 전환
  - root `commands/` 추가
  - top-level `agents/`, `skills/` 유지
- TypeScript CLI는 deterministic helper core로 축소
  - `internal` subcommand만 공식 지원
- `CodexRunner` 및 subprocess 경로 제거
- scaffold/generated asset에서 Codex-specific target 제거
- tracked duplicate 자산 제거
  - `.claude/agents`, `.claude/skills`, `.agents/skills/harness-*`
- 현재-facing 문서 정리
  - `README.md`
  - `docs/HARNESS_MODE_GUIDE.md`
  - `docs/SOLPE_HARNESS_USAGE_GUIDE.md`
  - `docs/IMPLEMENTATION_REPO_HARNESS_USAGE_GUIDE.md`
- 과거 기록 문서 `docs/tasks/*`는 보존

## 5. Detailed implementation plan

### Step 1. Core types와 deterministic service 경계 재설계
- `CodexRunner`, `CodexExecOptions`, `codex_skills` 같은 타입 제거
- feature/architect round input, seed draft input, blueprint draft input, story result input 타입 추가
- verify:
  - TypeScript compile이 깨지지 않는지 확인
  - 관련 test를 먼저 deterministic API 기준으로 바꿔 failing state를 만든다

### Step 2. Interview / Architect / Seed / Blueprint 서비스 재구성
- `InterviewService`, `ArchitectService`를 state 생성 + round 적용 서비스로 바꾼다
- `SeedService`, `HarnessBlueprintService`를 draft render 서비스로 바꾼다
- verify:
  - interview/architect persistence test
  - seed/blueprint golden render test

### Step 3. Ralph loop를 external result 적용 모델로 축소
- `RalphService`는 `run-init` / `run-apply-story` helper를 지원하도록 story result 적용 서비스로 바꾼다
- final critic에 따른 `completed`, `blocked`, `reopen_required`, follow-up story 생성은 유지한다
- verify:
  - reopen/blocked/follow-up test

### Step 4. CLI를 internal helper surface로 재구성
- `src/cli.ts`에서 public interactive lane 제거
- `harness internal ...` helper command만 남긴다
- plugin runner는 helper 실행만 담당한다
- verify:
  - `node dist/cli.js --help`
  - helper command smoke

### Step 5. Claude-native asset 정리
- root `commands/` 추가
- top-level `skills/*`, `agents/*`를 internal helper workflow 기준으로 다시 작성
- tracked duplicate `.claude/*`, `.agents/skills/harness-*` 제거
- verify:
  - `commands/` 존재
  - skill/command가 `${CLAUDE_PLUGIN_ROOT}` 기준 경로를 쓰는지 grep 확인

### Step 6. README / docs / changelog 정리
- current-facing 문서에서 stale `Codex`, standalone CLI runtime 서술 제거
- Claude marketplace + slash command + helper runtime 구조로 다시 쓴다
- `docs/CHANGELOG.md`에 현재 code change 한 줄 추가
- verify:
  - grep으로 stale reference 제거 확인

## 6. Test strategy

- 먼저 deterministic service test를 만든다
  - feature interview round apply
  - architect interview round apply
  - seed/blueprint draft render
  - Ralph story result apply
- 이후 integration 성격 test를 helper CLI와 command asset 기준으로 맞춘다
- 최종 실행:
  - `npm test`
  - `npm run build`
  - `node dist/cli.js --help`
  - plugin manifest JSON parse

## 7. Layer boundary changes

- LLM reasoning 책임은 Claude Code command/skill/agent layer로 이동한다
- TypeScript core는 state transition, artifact rendering, scaffold/manifest persistence만 담당한다
- plugin runner는 bootstrap + internal helper invocation만 담당한다

## 8. Expected results

- `codex exec/review`에 의존하지 않는 Claude-native plugin 구조
- marketplace 설치 후 slash command를 노출할 수 있는 `commands/`
- deterministic helper CLI와 그에 맞는 테스트
- stale `Codex` / duplicate asset / outdated README 서술 제거

## 9. Ambiguities / assumptions / tradeoffs / risks

- 해석 대안 1: agent-agnostic HTTP transport를 바로 넣는 방법
  - 이번에는 채택하지 않는다
  - 이유: 사용자가 Claude-native 우선 방향을 명시했고 reference도 그 구조에 더 가깝다
- 해석 대안 2: 과거 `docs/tasks/*`를 같이 정리하는 방법
  - 이번에는 채택하지 않는다
  - 이유: historical record를 남기고 현재-facing 문서만 정리하는 편이 안전하다
- risk:
  - 기존 runner 기반 test가 많이 깨질 수 있다
  - plugin skill의 multi-turn UX는 Claude thread 문맥에 의존하므로, helper contract를 단순하고 명확하게 유지해야 한다
