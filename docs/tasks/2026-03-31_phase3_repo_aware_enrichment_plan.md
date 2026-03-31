# Phase 3 Repo-Aware Enrichment Plan

## 1. Original request
- 기존 Dual-Interview Hybrid Harness V2 위에 Phase 3를 구현한다.
- 구현 범위는 active harness의 downstream 영향 강화, generated harness 템플릿 보강, per-slug manifest 구조, critic reopen 안정화, smoke/doc 마감이다.

## 2. Situation overview
- 현재 저장소에는 Dual-Interview Hybrid Harness V2가 로컬 변경으로 이미 구현되어 있다.
- feature lane과 harness lane은 동작하지만, active harness가 실제 delivery 산출물에 미치는 영향은 아직 제한적이다.
- generated harness manifest는 전역 단일 파일 기준이라 여러 slug를 장기적으로 다루기에는 약하다.
- final critic의 `rejectionCategory`가 비어 있거나 부정확할 때 reopen 흐름이 모델 응답 품질에 과하게 의존한다.

## 3. Current implementation analysis
- `src/seed/service.ts`
  - feature interview를 immutable `spec`/`seed`로 변환하지만 active harness를 prompt나 artifact shaping에 반영하지 않는다.
- `src/prd/service.ts`
  - source seed/spec에서 PRD를 만들고 active harness를 저장만 한다.
  - story decomposition, verification command discovery, boundary guidance는 generic 동작이다.
- `src/architect/scaffold-service.ts`
  - repo-specific harness를 생성하지만 generated agent/skill 내용이 얇고, 운영 규약과 handoff 정보가 부족하다.
- `src/infra/filesystem.ts`
  - generated manifest 경로가 `.harness/generated-harness/manifest.json` 하나로 고정되어 있다.
- `src/ralph/service.ts`
  - `reopen_required`와 synthetic reopen state는 구현되어 있으나 `rejectionCategory` fallback classifier와 `reopenHistory` 누적은 없다.
- `src/orchestrator/service.ts`
  - scripted auto reopen을 수행하지만 reopen 흔적을 run artifact 자체에 남기지는 않는다.

## 4. Requirements mapping
- active harness downstream 영향 강화
  - `src/seed/service.ts`
  - `src/prd/service.ts`
  - `src/ralph/service.ts`
- richer scaffold template
  - `src/architect/scaffold-service.ts`
- per-slug manifest + legacy fallback
  - `src/infra/filesystem.ts`
  - `src/architect/scaffold-service.ts`
- critic fallback classification + reopen history
  - `src/ralph/service.ts`
  - `src/orchestrator/service.ts`
  - `src/core/types.ts`
- smoke/doc/package updates
  - `package.json`
  - `README.md`
  - `docs/CHANGELOG.md`
  - `docs/tasks/2026-03-31_phase3_repo_aware_enrichment_result.md`

## 5. Detailed implementation plan

### Step 1 -> verify
- `tasks/todo.md`와 본 plan 문서를 먼저 작성한다.
- verify:
  - 문서가 생성되어 있고, 구현 범위와 가정이 명확히 적혀 있는지 확인한다.

### Step 2 -> verify
- active harness downstream 영향에 대한 failing test를 추가한다.
- 대상:
  - `tests/seed-and-prd.test.ts`
  - 필요 시 `tests/renderers.test.ts`
- verify:
  - active harness가 `SeedService` prompt에 나타나는지
  - active harness가 `PrdService` story metadata와 verification bias를 바꾸는지 테스트가 먼저 실패하는지 확인한다.

### Step 3 -> verify
- generated harness template와 per-slug manifest에 대한 failing test를 추가한다.
- 대상:
  - `tests/harness-generator.test.ts`
  - 새 `tests/generated-harness-manifest.test.ts`
- verify:
  - richer generated content 요구가 반영된 assertion이 실패하는지
  - slug별 manifest write와 legacy manifest read fallback 테스트가 실패하는지 확인한다.

### Step 4 -> verify
- critic fallback classification과 `reopenHistory` 누적에 대한 failing test를 추가한다.
- 대상:
  - `tests/ralph-service.test.ts`
  - `tests/orchestrator-service.test.ts`
- verify:
  - `rejectionCategory`가 누락된 critic 응답에서 fallback이 동작해야 하는 테스트가 실패하는지
  - reopen history 누적이 loop state에 기록되어야 하는 테스트가 실패하는지 확인한다.

### Step 5 -> verify
- `SeedService`에 active harness-aware prompt shaping을 추가하고, 생성 blueprint의 technical context에 harness bias를 실을 수 있게 한다.
- verify:
  - 테스트에서 exec prompt에 active harness block과 work unit / verification emphasis가 포함되는지 확인한다.

### Step 6 -> verify
- `PrdService`를 active harness aware하게 확장한다.
- 구현 항목:
  - story metadata에 `boundaryHints`, `verificationFocus` 추가
  - verification commands discovery에 harness bias 반영
  - story title/acceptance criteria framing에 harness terminology 반영
- verify:
  - active harness가 있을 때와 없을 때 story output 차이가 테스트에서 검증되는지 확인한다.

### Step 7 -> verify
- `HarnessScaffoldService`의 generated file content를 richer template로 교체하고 manifest 저장을 slug별로 전환한다.
- verify:
  - generated agent/skill/orchestrator 문서에 responsibilities, inputs/outputs, collaboration, validation flow가 포함되는지 확인한다.
  - manifest 경로가 `.harness/generated-harness/<slug>/manifest.json`으로 저장되는지 확인한다.

### Step 8 -> verify
- `RalphService`에 fallback classifier와 `reopenHistory` 누적을 추가하고, `OrchestratorService`는 reopen 처리의 단일 orchestration 경로를 유지하도록 정리한다.
- verify:
  - `rejectionCategory`가 없을 때도 `requirement_ambiguity` / `harness_design_gap` / `implementation_gap`으로 분류되는지 확인한다.
  - `loop-state.json`에 reopen history가 남는지 확인한다.

### Step 9 -> verify
- `package.json`, `README.md`, `docs/CHANGELOG.md`를 Phase 3 기준으로 갱신한다.
- `smoke:cli` 스크립트를 추가한다.
- verify:
  - `npm run smoke:cli`가 성공하는지
  - README가 현재 구현 범위를 정확히 반영하는지 확인한다.

### Step 10 -> verify
- 전체 검증 후 result 문서를 작성하고 `tasks/todo.md`를 제거한다.
- verify:
  - `npm run build`
  - `npm test`
  - `npm run smoke:cli`
  - 결과를 result 문서에 기록했는지 확인한다.

## 6. Test strategy
- TDD 순서:
  1. active harness downstream integration
  2. per-slug manifest
  3. richer scaffold content
  4. critic fallback classification
  5. reopen history persistence
- 실행 명령:
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:cli`

## 7. Layer boundary changes
- `SeedService`와 `PrdService`는 active harness snapshot을 소비하는 application-level enrichment를 추가한다.
- `HarnessScaffoldService`는 renderer 역할을 유지하되 richer template output을 만든다.
- `filesystem`은 manifest 저장 규칙만 확장하고 active harness document contract는 유지한다.
- `RalphService`는 reviewer output을 그대로 신뢰하지 않고 fallback normalization layer를 추가한다.

## 8. Expected results
- generated harness가 이후 feature seed/PRD/ralph prompt를 더 강하게 shape한다.
- 여러 slug harness가 공존 가능한 manifest 구조가 생긴다.
- final critic의 category 누락에도 reopen 흐름이 더 안정적으로 동작한다.
- generated scaffold의 품질이 높아져 repo-specific harness builder 성격이 더 강해진다.

## 9. Ambiguities / assumptions / tradeoffs / risks
- 해석 A:
  - `PrdService` story decomposition 자체를 LLM 기반으로 크게 재설계할 수 있다.
- 해석 B:
  - 현재 deterministic mapping을 유지한 채 harness metadata만 보강할 수 있다.
- 선택:
  - 해석 B를 선택한다.
- 이유:
  - 이번 단계의 목표는 “repo-aware enrichment”이지, PRD engine 전면 교체가 아니다.

- 가정:
  - 현재 Node/TypeScript 실행 구조를 계속 기준으로 삼는다.
  - live provider smoke는 opt-in으로 남기고 기본 검증에는 넣지 않는다.

- 주요 리스크:
  - active harness bias가 과하면 generic feature flow를 지나치게 좁힐 수 있다.
  - manifest migration에서 기존 top-level manifest를 못 읽으면 재생성 충돌 보호가 깨질 수 있다.
  - fallback classifier가 과도하게 aggressive하면 잘못된 reopen target을 만들 수 있다.

- 대응:
  - story decomposition은 deterministic 유지
  - legacy manifest read fallback 유지
  - fallback classifier는 명확한 keyword/rule 기반으로 최소 구현
