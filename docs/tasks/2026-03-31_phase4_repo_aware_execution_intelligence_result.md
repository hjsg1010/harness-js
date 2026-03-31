# Phase 4 Repo-Aware Execution Intelligence Result

## 1. 무엇을 변경했는가
- repo-aware story planner를 확장해 work unit assignment, mixed acceptance criterion split, `expectedArtifacts`, `handoffContract`, verification ordering을 추가했다.
- generated harness references에 `artifact-contracts.md`, `handoff-protocol.md`, `verification-policy.md`를 생성하도록 확장했다.
- `RalphService`가 reopen 시 `suggestedQuestionFocus`, `suggestedRepairFocus`를 저장하도록 변경했다.
- `eval`과 `smoke:live` entrypoint를 추가하고, CLI가 reopen guidance를 출력하도록 개선했다.

## 2. 왜 변경했는가
- Phase 3까지는 active harness가 prompt/metadata에는 반영되었지만, story planning과 verification policy에서 generic flow와의 차이가 충분히 크지 않았다.
- generated harness가 repo-aware execution contract의 source of truth 역할을 하게 만들 필요가 있었다.
- final critic가 reopen을 요구했을 때 다음 질문/다음 수리 포인트를 더 직접적으로 안내할 필요가 있었다.

## 3. 영향 범위
- story planning / verification
  - `src/prd/service.ts`
  - `src/core/types.ts`
- scaffold output
  - `src/architect/scaffold-service.ts`
- reopen guidance / CLI UX
  - `src/ralph/service.ts`
  - `src/cli.ts`
- package / scripts
  - `package.json`
  - `scripts/smoke-live.mjs`
- docs / tests
  - `README.md`
  - `docs/CHANGELOG.md`
  - `tests/seed-and-prd.test.ts`
  - `tests/harness-generator.test.ts`
  - `tests/ralph-service.test.ts`
  - `tests/eval-repo-aware.test.ts`
  - `tests/eval-fixtures/research-report-seed.yaml`

## 4. 세부 변경 내용
- `PrdService`
  - acceptance criterion를 narrow heuristic으로 split할 수 있게 했다.
  - 각 story에 `workUnit`, `expectedArtifacts`, `handoffContract`를 넣는다.
  - verification command는 story corpus와 repo-aware signal에 따라 `typecheck -> test -> build -> lint` 순으로 좁게 선택된다.
- `HarnessScaffoldService`
  - generated references에 artifact contract / handoff protocol / verification policy 문서를 추가한다.
  - orchestrator skill은 이 reference contract 파일들을 명시적으로 읽도록 안내한다.
- `RalphService`
  - reopen이 필요할 때 `suggestedQuestionFocus`, `suggestedRepairFocus`를 `loop-state.json`에 저장한다.
  - requirement ambiguity는 question-oriented guidance로, harness gap은 repair-oriented guidance로 남긴다.
- `CLI`
  - `ralph`와 `run`이 `reopen_required` 종료 시 next command뿐 아니라 question/repair focus도 출력한다.
- `package.json`
  - `npm run eval`
  - `npm run smoke:live`
- `scripts/smoke-live.mjs`
  - 기본은 skip, `HARNESS_LIVE_SMOKE=1`일 때만 실제 live smoke를 수행하도록 만들었다.

## 5. 검증 수행
- 실행 명령
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run eval`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:cli`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:live`
- 결과
  - `npm run build` 성공
  - `npm test` 성공
    - `10` files
    - `24` tests passed
  - `npm run eval` 성공
    - `1` file
    - `1` test passed
  - `npm run smoke:cli` 성공
  - `npm run smoke:live` 성공
    - 현재 환경에서는 opt-in guard에 따라 skip 메시지를 출력하고 종료

## 6. 알려진 한계 / 후속 고려사항
- story split은 deterministic heuristic만 사용한다. 보다 깊은 semantic planner는 아직 넣지 않았다.
- `smoke:live`는 기본 skip이며, 실제 provider round-trip 검증은 opt-in 환경에서만 수행된다.
- generated contract files는 reference source of truth 역할을 시작했지만, downstream runtime이 이를 직접 parse해서 enforcement 하지는 않는다.

## 7. Lessons
- 이번 task에서는 새로운 user correction이 없어 추가 lesson을 남기지 않았다.
