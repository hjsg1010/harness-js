# Phase 4 Repo-Aware Execution Intelligence Plan

## 1. Original request
- Phase 4 계획대로 구현을 진행하고 `main`에 push한다.
- 범위는 repo-aware story planner 강화, generated harness contract files 추가, verification policy/ordering 개선, reopen guidance 확장, live smoke/eval 엔트리 추가다.

## 2. Situation overview
- 현재 `main`에는 Dual-Interview V2와 Phase 3 repo-aware enrichment까지 반영되어 있다.
- active harness는 `seed`, `PRD`, `Ralph prompt`에 영향을 준다.
- 하지만 story planning은 아직 단순하며, generated harness는 사람 친화적인 설명이 중심이고 machine-usable contract는 약하다.
- live provider smoke와 eval comparison surface도 아직 없다.

## 3. Current implementation analysis
- `src/prd/service.ts`
  - active harness 기반 `boundaryHints`, `verificationFocus`는 계산하지만 story split, work unit assignment, artifact expectation은 없다.
  - verification command selection도 `package.json` scripts와 간단한 bias 매칭 정도다.
- `src/architect/scaffold-service.ts`
  - generated orchestrator/agent/skill은 richer text를 만들지만 contract references 파일은 `overview.md`와 `validation-checklist.md` 정도만 있다.
- `src/ralph/service.ts`
  - critic fallback classification은 있지만 drift-aware reopen guidance나 repair focus는 없다.
- `package.json`
  - `smoke:cli`는 있지만 `smoke:live`, `eval`은 없다.
- tests
  - active harness enrichment와 per-slug manifest는 검증하지만 generic vs repo-aware 비교 eval, contract files, work-unit split은 아직 검증하지 않는다.

## 4. Requirements mapping
- repo-aware story planner
  - `src/prd/service.ts`
  - `src/core/types.ts`
- generated harness contract files
  - `src/architect/scaffold-service.ts`
  - `tests/harness-generator.test.ts`
- reopen guidance / drift-aware fields
  - `src/ralph/service.ts`
  - `src/core/types.ts`
  - `tests/ralph-service.test.ts`
  - `tests/orchestrator-service.test.ts`
- verification/eval/smoke entrypoints
  - `package.json`
  - `scripts/smoke-live.mjs`
  - `tests/eval-repo-aware.test.ts`
  - fixture files under `tests/eval-fixtures/`
- docs
  - `README.md`
  - `docs/CHANGELOG.md`
  - `docs/tasks/2026-03-31_phase4_repo_aware_execution_intelligence_result.md`

## 5. Detailed implementation plan

### Step 1 -> verify
- plan 문서와 `tasks/todo.md`를 먼저 작성한다.
- verify:
  - Phase 4 범위와 제외 범위가 문서에 명시되어 있는지 확인한다.

### Step 2 -> verify
- story planner 강화에 대한 failing test를 추가한다.
- 대상:
  - `tests/seed-and-prd.test.ts`
  - 새 `tests/eval-repo-aware.test.ts`
- verify:
  - active harness가 work unit 기준으로 story split을 유도하는 테스트가 먼저 실패하는지
  - `expectedArtifacts`, `handoffContract`, `workUnit` 생성 assertion이 실패하는지 확인한다.

### Step 3 -> verify
- generated harness contract files에 대한 failing test를 추가한다.
- 대상:
  - `tests/harness-generator.test.ts`
- verify:
  - `.harness/generated-harness/<slug>/references/artifact-contracts.md`
  - `.harness/generated-harness/<slug>/references/handoff-protocol.md`
  - `.harness/generated-harness/<slug>/references/verification-policy.md`
  - 위 파일들이 생성되어야 하는 assertion이 실패하는지 확인한다.

### Step 4 -> verify
- reopen guidance 강화에 대한 failing test를 추가한다.
- 대상:
  - `tests/ralph-service.test.ts`
  - `tests/orchestrator-service.test.ts`
- verify:
  - `loopState`에 `suggestedQuestionFocus` 또는 `suggestedRepairFocus`가 기록되는지에 대한 테스트가 실패하는지 확인한다.

### Step 5 -> verify
- `PrdService` story planner를 deterministic heuristic 기반으로 확장한다.
- 구현 항목:
  - work unit assignment
  - acceptance criterion 내 artifact/path/report split
  - `expectedArtifacts`, `handoffContract` 생성
  - command ordering policy (`typecheck -> test -> build -> lint` 등)
- verify:
  - repo-aware story planning 관련 테스트가 통과하는지
  - PRD persisted JSON에도 새 metadata가 저장되는지 확인한다.

### Step 6 -> verify
- `HarnessScaffoldService`에서 contract reference files를 생성한다.
- verify:
  - generated references 파일이 실제로 생성되고, work unit / artifact / verification policy 내용을 포함하는지 확인한다.

### Step 7 -> verify
- `RalphService`에 drift-aware reopen guidance 필드를 추가한다.
- 구현 항목:
  - `suggestedQuestionFocus`
  - `suggestedRepairFocus`
  - critic finding과 seed/active harness mismatch에 따른 guidance 생성
- verify:
  - requirement ambiguity일 때 question focus
  - harness gap 또는 implementation gap일 때 repair focus
  - 관련 테스트가 통과하는지 확인한다.

### Step 8 -> verify
- `smoke:live`와 `eval` surface를 추가한다.
- 구현 항목:
  - `scripts/smoke-live.mjs`
  - `package.json` script 등록
  - `tests/eval-fixtures/`와 eval test
- verify:
  - `npm run eval`
  - `npm run smoke:live`는 opt-in skip 또는 실행 경로가 문서화된 대로 동작하는지 확인한다.

### Step 9 -> verify
- README, CHANGELOG, result 문서를 갱신하고 임시 `tasks/todo.md`를 제거한다.
- verify:
  - docs가 Phase 4 surface를 정확히 설명하는지 확인한다.

## 6. Test strategy
- 우선순위:
  1. story planner split / metadata
  2. generated contract files
  3. reopen guidance
  4. eval surface
  5. smoke surface
- 실행 명령:
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run eval`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:cli`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:live`

## 7. Layer boundary changes
- `PrdService`가 story planner intelligence를 더 많이 담당하게 되지만, LLM plan engine이 아니라 deterministic planner로 유지한다.
- `HarnessScaffoldService`는 explanation generator가 아니라 execution contract publisher 역할을 조금 더 갖게 된다.
- `RalphService`는 critic normalization 외에 reopen guidance synthesis를 맡는다.
- live smoke는 app/service layer를 재사용하는 standalone script로 두고 runtime dependency는 추가하지 않는다.

## 8. Expected results
- generated harness가 story planning과 verification ordering까지 실제로 shape한다.
- generated references가 downstream execution contract의 source 역할을 한다.
- generic flow와 repo-aware flow 차이를 eval test로 설명할 수 있다.
- live smoke를 opt-in으로 실행해 실제 provider wiring을 확인할 수 있다.

## 9. Ambiguities / assumptions / tradeoffs / risks
- 해석 A:
  - story split을 자유 생성형 planner로 크게 확장할 수 있다.
- 해석 B:
  - acceptance criterion와 work unit 기반 heuristic split만 추가할 수 있다.
- 선택:
  - 해석 B를 선택한다.
- 이유:
  - reproducibility와 테스트 용이성을 유지해야 하기 때문이다.

- 가정:
  - `smoke:live`는 환경 의존성이 크므로 opt-in skip이 허용된다.
  - eval는 완전한 benchmark가 아니라 regression-oriented comparison으로 시작한다.

- 리스크:
  - split heuristic가 과하면 story가 과도하게 세분화될 수 있다.
  - generated contract files가 설명 중복만 늘리고 실제 사용되지 않을 수 있다.
  - live smoke가 환경에 따라 noisy할 수 있다.

- 대응:
  - split은 narrow heuristic만 사용
  - contract files는 work unit / artifacts / verification command policy 중심으로 최소 구성
  - live smoke는 environment guard + explicit skip message를 둔다
