# Phase 3 Repo-Aware Enrichment Result

## 1. 무엇을 변경했는가
- active harness가 새 feature `seed`와 `PRD` 생성에 실제 영향을 주도록 `SeedService`, `PrdService`, `RalphService`를 확장했다.
- generated harness manifest를 slug별 경로로 이동하고, legacy top-level manifest read fallback을 추가했다.
- generated scaffold template를 richer하게 바꿔 generated agent/skill/orchestrator 문서에 운영 규약, handoff, validation 정보를 포함시켰다.
- final critic의 `rejectionCategory`가 누락되어도 reopen lane을 안정적으로 고를 수 있도록 fallback classifier와 `reopenHistory` 누적을 추가했다.
- `smoke:cli` 스크립트와 README/CHANGELOG를 현재 구현 범위에 맞게 갱신했다.

## 2. 왜 변경했는가
- V2 상태에서는 active harness가 주로 feature interview / Ralph prompt에만 영향을 주었고, 실제 feature delivery 산출물에는 영향이 약했다.
- repo-specific harness generator는 존재했지만 generated output이 비교적 얇아 `references/harness` 스타일의 repo-aware 운영 감각이 부족했다.
- manifest가 전역 단일 파일이어서 여러 generated harness slug를 공존시키기 어려웠다.
- final critic가 category를 명시하지 않는 경우 reopen target이 모델 응답 품질에 과하게 의존했다.

## 3. 영향 범위
- application/service layer
  - `src/seed/service.ts`
  - `src/prd/service.ts`
  - `src/ralph/service.ts`
  - `src/orchestrator/service.ts`
- infrastructure / storage
  - `src/infra/filesystem.ts`
  - `src/core/types.ts`
- scaffold generation
  - `src/architect/scaffold-service.ts`
- docs / packaging
  - `package.json`
  - `README.md`
  - `docs/CHANGELOG.md`
- tests
  - `tests/seed-and-prd.test.ts`
  - `tests/generated-harness-manifest.test.ts`
  - `tests/harness-generator.test.ts`
  - `tests/ralph-service.test.ts`
  - `tests/orchestrator-service.test.ts`

## 4. 세부 변경 내용
- `SeedService`
  - feature interview에서 active harness snapshot이 있으면 blueprint generation prompt에 `Active Harness` block과 verification bias 지시를 포함하도록 변경했다.
- `PrdService`
  - story별 `boundaryHints`, `verificationFocus`를 계산한다.
  - active harness의 verification bias가 있으면 `typecheck`, `lint` 같은 command 선택에 반영한다.
  - run 초기 `loopState`에 `reopenHistory`를 포함한다.
- `HarnessScaffoldService`
  - slug별 manifest만 읽고 쓰도록 변경했다.
  - generated agent file에 `Inputs`, `Outputs`, `Collaboration`, `Failure handling` 섹션을 추가했다.
  - generated orchestrator/skill file에 `_workspace` handoff와 validation checklist 연결 정보를 추가했다.
- `filesystem`
  - canonical manifest 경로를 `.harness/generated-harness/<slug>/manifest.json`으로 변경했다.
  - slug manifest가 없을 때만 legacy `.harness/generated-harness/manifest.json`을 read fallback으로 사용한다.
- `RalphService`
  - final critic verdict를 normalize하는 fallback classifier를 추가했다.
  - `requirement_ambiguity`, `harness_design_gap` 판단 시 `loop-state.json`에 `reopenHistory`를 누적한다.
  - implementer / QA / reviewer prompt에 `boundaryHints`, `verificationFocus`를 포함한다.
- `OrchestratorService`
  - auto reopen이 발생한 뒤 새 run을 만들 때 reopen history snapshot을 carry forward 하도록 변경했다.

## 5. 검증 수행
- 실행 명령
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test`
  - `PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:cli`
- 결과
  - `npm run build` 성공
  - `npm test` 성공
    - `9` files
    - `22` tests passed
  - `npm run smoke:cli` 성공
    - CLI usage 출력 확인

## 6. 알려진 한계 / 후속 고려사항
- active harness enrichment는 deterministic bias 중심이다. story decomposition 자체를 LLM 기반으로 재설계하지는 않았다.
- legacy manifest는 read fallback만 유지한다. 자동 migration write는 아직 넣지 않았다.
- real `codex exec` / `codex review` live provider smoke는 여전히 opt-in 후속 범위다.

## 7. Lessons
- 이번 task에서는 새로운 user correction이 없어 추가 lesson을 남기지 않았다.
