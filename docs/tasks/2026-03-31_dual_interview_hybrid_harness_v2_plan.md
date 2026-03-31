# Original request

`harness-js`를 Dual-Interview Hybrid Harness V2로 확장한다. 기존 feature lane(`interview -> seed -> ralph/run`)은 유지하면서 adaptive interview와 critic-driven reopen을 강화하고, 별도의 harness lane(`architect -> blueprint -> scaffold`)을 추가해 repo-specific harness를 인터뷰 후 생성하도록 만든다. 생성된 harness는 active harness로 저장되어 이후 feature lane의 prompt와 verification 정책에 영향을 줘야 한다.

# Situation overview

현재 구현은 feature lane 하나만 존재한다. `interview`, `seed`, `ralph`, `run`은 동작하지만, adaptive interview 공통 코어는 없고 architect lane도 없다. repo-specific harness generator, active harness, critic rejection category, reopen loop도 아직 없다. 테스트는 feature lane과 Ralph loop의 기본 동작만 검증한다.

# Current implementation analysis

- `src/interview/service.ts`
  - feature interview 전용 구현이다.
  - brownfield scan, question prompt, scoring prompt, ambiguity 계산을 한 클래스에 가지고 있다.
- `src/seed/service.ts`
  - feature interview만 입력으로 받아 immutable spec/seed를 생성한다.
- `src/prd/service.ts`
  - seed/spec를 읽고 acceptance criteria를 story로 매핑한다.
  - active harness 개념이 없다.
- `src/ralph/service.ts`
  - implementer -> QA -> reviewer -> final critic loop는 있다.
  - final critic reject 시 follow-up story 추가만 가능하고, requirement/harness reopen은 없다.
- `src/infra/filesystem.ts`
  - `.harness/interviews`, `.harness/specs`, `.harness/seeds`, `.harness/runs`만 지원한다.
- `tests/*`
  - feature interview, seed/spec, PRD mapping, Ralph blocked/follow-up, 기본 e2e만 있다.

# Requirements mapping

- adaptive interview core 공통화
  - 위치: `src/interview/*`, `src/core/types.ts`, `src/core/constants.ts`
- architect / blueprint / scaffold command 추가
  - 위치: `src/cli.ts`, 새 architect/harness 서비스
- repo profile / active harness / generated manifest 저장
  - 위치: `src/infra/filesystem.ts`, 새 serializer/type
- feature lane prompt shaping과 Ralph critic reopen
  - 위치: `src/interview/service.ts`, `src/seed/service.ts`, `src/prd/service.ts`, `src/ralph/service.ts`
- Claude/Codex wrapper skill 확장
  - 위치: `.claude/skills/*`, `.agents/skills/*`
- 문서와 changelog 동기화
  - 위치: `README.md`, `docs/CHANGELOG.md`, result 문서

# Detailed implementation plan

## Step 1 -> verify

adaptive interview 공통 타입과 코어를 추가한다.

- feature lane와 architect lane가 공유하는 상태 구조, 질문/스코어 schema, ambiguity 계산 훅을 분리한다.
- feature lane는 기존 semantics를 유지한다.
- architect lane는 별도 dimension과 weight를 사용한다.

Verify:
- unit test로 feature/architect lane의 dimension과 threshold 계산이 분리되는지 확인

## Step 2 -> verify

repo profile과 architect interview 서비스를 추가한다.

- deterministic repo profile 추출기를 만든다.
- architect lane state 저장 경로와 resume를 지원한다.
- `harness architect` CLI를 추가한다.

Verify:
- repo profile extraction test
- architect interview persistence/resume test

## Step 3 -> verify

immutable harness blueprint/seed와 scaffold generator를 추가한다.

- `harness blueprint`로 Markdown blueprint와 YAML harness seed를 생성한다.
- `harness scaffold`로 agent/skill/checklist/reference를 생성한다.
- manifest hash와 conflict detection을 구현한다.
- success 시 active harness를 갱신한다.

Verify:
- blueprint Markdown golden
- harness seed YAML golden
- scaffold manifest/conflict test

## Step 4 -> verify

active harness를 feature lane과 Ralph loop에 연결한다.

- new feature interview / seed / PRD / run에 active harness snapshot을 저장한다.
- prompt wording, verification bias, reviewer/critic framing에 snapshot을 반영한다.
- resume는 저장된 snapshot을 계속 사용한다.

Verify:
- prompt history 기반 unit/integration test
- active harness snapshot persistence test

## Step 5 -> verify

critic rejection category와 reopen loop를 추가한다.

- final critic verdict에 `rejectionCategory`를 추가한다.
- `implementation_gap`은 기존 follow-up으로 처리한다.
- `requirement_ambiguity`, `harness_design_gap`은 synthetic reopen state를 만들고 `reopen_required`로 종료한다.
- `run`은 auto reopen orchestration을 수행한다.

Verify:
- direct `ralph` synthetic reopen state test
- `run` auto feature reopen test
- `run` auto architect reopen test

## Step 6 -> verify

문서와 wrapper skill을 갱신한다.

- README에 dual lane, active harness, reopen behavior를 반영한다.
- built-in Claude/Codex wrapper skill에 `architect` lane을 추가한다.
- changelog/result 문서를 정리한다.

Verify:
- README/skill diff 검토
- `npm run build`, `npm test`

# Test strategy

- TDD 순서:
  1. adaptive interview separation
  2. architect interview persistence
  3. blueprint/seed golden
  4. scaffold manifest/conflict
  5. active harness prompt shaping
  6. critic rejection category와 reopen loop
- 실행:
  - `npm test`
  - `npm run build`
- 필요 시 특정 테스트 파일부터 부분 실행 후 전체 회귀 실행

# Layer boundary changes

- adaptive interview core는 domain/application 성격으로 유지한다.
- repo profile, manifest, active harness persistence는 filesystem adapter가 담당한다.
- scaffold renderer는 deterministic generator로 두고, architect decision 자체는 interview/blueprint 단계에서 끝낸다.

# Expected results

- 사용자는 feature lane와 harness lane를 별도 명령으로 사용할 수 있다.
- repo-specific harness를 먼저 인터뷰로 설계하고 scaffold로 생성할 수 있다.
- 생성된 harness는 이후 feature loop의 기본 컨텍스트로 작동한다.
- final critic는 implementation/requirement/harness 문제를 분리해 reopen 경로를 제시한다.

# Ambiguities / assumptions / tradeoffs / risks

- 해석 1: architect lane를 feature `interview`에 합치는 방법
  - 채택하지 않음. 명령 의미가 흐려지고 사용자 혼란이 커진다.
- 해석 2: scaffold 단계에서 다시 LLM으로 agent/skill 구조를 결정하는 방법
  - 채택하지 않음. blueprint의 immutable 성격이 약해진다.
- active harness 적용 범위는 새 인터뷰/새 런에 한정한다.
  - resume에 소급 적용하면 재현성이 깨진다.
- generated file overwrite는 manifest/hash가 동일한 경우만 허용한다.
  - 사용자 수정본 보호를 우선한다.
- 현재 repo는 TypeScript CLI가 중심이므로 검증 명령은 `npm run build`, `npm test`를 우선한다.
