# 원본 요청

사용자는 `Ouroboros`의 interview 기능과 `ralph` 스타일의 개발-검증 loop를 결합한 하이브리드 harness v1을 이 저장소에 구현해 달라고 요청했다. 구현 범위는 실행 가능한 TypeScript CLI, immutable spec/seed 산출물, PRD/story 기반 loop, Codex/Claude 하이브리드 skill asset, 테스트 및 작업 문서까지 포함한다.

## 상황 개요

현재 저장소는 실행 코드가 없는 레퍼런스 중심 구조다. `references/ouroboros`에는 specification-first interview/seed 개념이 있고, `references/oh-my-claudecode`에는 `ralph`, `deep-interview`, `ralplan` 등 반복 실행 패턴이 존재한다. 실제 루트에는 `.agents/skills/harness`만 있고, 런타임 코드나 패키지 설정은 없다.

Node.js / npm은 현재 환경에 설치되어 있지 않으며, `codex` CLI만 사용 가능하다. 따라서 구현은 TypeScript CLI를 기준으로 하되, 로컬 빌드/테스트는 Node toolchain 준비 여부에 따라 제약될 수 있다.

## 현재 구현 분석

### 레포 구조

- 루트에는 `.agents`, `.claude`, `references`만 존재한다.
- Git 저장소는 초기화되어 있지 않다.
- 하네스 메타 스킬은 `.agents/skills/harness/SKILL.md`와 reference 문서들로 존재한다.

### 참고 구현에서 가져올 요소

- `Ouroboros`
  - interactive interview state
  - ambiguity score gate (`0.20`)
  - immutable seed/spec 산출물
  - brownfield context 선탐색
- `oh-my-claudecode / ralph`
  - PRD/story 중심 loop
  - story 단위 verification
  - reviewer/critic gate
  - resume 가능한 상태 파일

### 현재 공백

- CLI entrypoint 없음
- state 저장소 없음
- spec/seed/PRD serializer 없음
- `codex exec` / `codex review` wrapper 없음
- Claude/Codex wrapper skill asset 없음
- 테스트 프레임워크와 fixture 없음

## 요구사항 매핑

### 1. CLI 인터페이스

- `harness interview` -> interview state 생성/갱신
- `harness seed` -> immutable spec/seed 생성
- `harness ralph` -> spec/seed를 PRD로 변환 후 loop 수행
- `harness run` -> idea/path에 따라 전체 파이프라인 또는 direct ralph 실행

### 2. 상태 저장

- `.harness/interviews/<id>.json`
- `.harness/specs/<slug>.md`
- `.harness/seeds/<seed-id>.yaml`
- `.harness/runs/<run-id>/prd.json`
- `.harness/runs/<run-id>/loop-state.json`
- `.harness/runs/<run-id>/progress.md`
- `.harness/runs/<run-id>/verification.json`
- `.harness/runs/<run-id>/_workspace/`

### 3. 인터뷰 / Seed

- weakest dimension 기준 단일 질문 생성
- greenfield / brownfield 가중치 분리
- ambiguity <= 0.20 에서 seed-ready
- spec.md + seed.yaml 동시 생성
- ontology는 transcript 기반 간단 추출

### 4. PRD / Ralph loop

- AC 1개당 story 1개 기본
- mutable state는 run 디렉토리에만 기록
- implementer -> incremental QA -> story verification -> final critic 순서 고정
- 반복 rejection 3회 시 blocked 처리
- follow-up story 추가 가능

### 5. 하이브리드 asset

- `.claude/agents/` 에 interviewer / implementer / qa-inspector / critic
- `.claude/skills/` 에 harness-interview / harness-ralph / harness-orchestrator
- `.agents/skills/` 에 Codex wrapper skill

### 6. 문서 및 테스트

- 작업 plan/result 문서
- CHANGELOG / README
- unit + golden + integration(fake runner) 테스트

## 상세 구현 계획

### Step 1. 프로젝트 스캐폴드와 문서 구조 생성

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, `tests/`, `docs/`, `tasks/` 생성
- task 문서와 todo checklist 초기화
- verify: 파일 구조가 생성되고, 인터페이스가 README와 task plan에 반영됨

### Step 2. 공통 타입과 저장소 계층 구현

- interview/seed/prd/run state 타입 정의
- JSON/Markdown/YAML serializer 구현
- `.harness/` 경로 helper와 atomic write 유틸 구현
- verify: 상태 write/read unit test 통과

### Step 3. ambiguity scoring과 interview lane 구현

- brownfield 탐색 요약
- dimension score 계산
- weakest dimension 선택
- 질문 생성 및 resume state 처리
- verify: ambiguity scoring, resume, brownfield detection 테스트 통과

### Step 4. immutable spec/seed 생성 구현

- interview state -> spec markdown
- interview state -> seed yaml
- `--force` metadata 처리
- ontology extraction 간소 구현
- verify: golden test로 spec/seed 렌더링 비교

### Step 5. seed -> PRD bridge 구현

- AC 기준 story 생성
- verificationCommands 기본 규칙 생성
- run 디렉토리 초기화
- verify: PRD JSON golden test와 story mapping test 통과

### Step 6. Codex runner abstraction과 Ralph loop 구현

- `codex exec` / `codex review` 명령 빌더
- fake runner / process runner 분리
- story attempts, verdict 기록, blocked 판단, follow-up story 생성
- incremental QA and final critic 단계 연결
- verify: integration test로 loop state transition, rejection-resume, blocked-after-3 검증

### Step 7. 하이브리드 skill/agent asset 작성

- Claude agent 정의 파일 작성
- Claude skill 3종 작성
- Codex wrapper skill 3종 작성
- verify: skill description/frontmatter 구조와 호출 경로 점검

### Step 8. 문서 정리와 최종 검증

- README, CHANGELOG, result 문서 작성
- 임시 task checklist 결과 반영
- `tasks/todo.md` 제거
- verify: 가능한 범위의 테스트/스모크 실행 결과를 result 문서에 기록

## 테스트 전략

### 먼저 작성할 테스트

1. ambiguity scoring + threshold gate
2. interview state persistence/resume
3. spec/seed generation + force metadata
4. seed-to-PRD mapping
5. PRD loop transitions
6. repeated rejection -> blocked

### 실행 대상

- unit: state store / scoring / renderer / mapper
- golden: spec.md / seed.yaml / prd.json
- integration: fake Codex runner 기반 end-to-end

### 수동 확인

- greenfield vague idea
- brownfield modification idea
- direct seed file -> ralph 실행

## Layer boundary changes

- CLI layer는 application service만 호출한다.
- application service는 `CodexRunner` port에 의존한다.
- file system persistence는 infra adapter로 분리한다.
- renderers는 pure function으로 유지한다.

## 예상 결과

- 실행 가능한 TypeScript CLI 스캐폴드가 생성된다.
- 사용자는 interview -> seed -> ralph 흐름을 로컬 상태 파일 기반으로 실행할 수 있다.
- Codex runner를 fake로 대체하여 테스트 가능한 구조를 갖는다.
- Claude/Codex 양쪽에서 같은 conceptual harness를 호출할 수 있는 asset이 준비된다.

## 모호성 / 가정 / 트레이드오프 / 리스크

### 대안 해석

1. `Ouroboros` full workflow engine까지 복제
   - 선택하지 않음. v1 범위를 interview + seed + ralph loop로 제한한다.
2. interview가 직접 PRD 생성
   - 선택하지 않음. immutable seed/spec 레이어를 유지한다.

### 가정

- TypeScript CLI를 주 런타임으로 둔다.
- Node 20+는 구현 후 사용자가 설치하거나, 가능하면 작업 중 부트스트랩한다.
- verification command discovery는 Node/TypeScript 프로젝트 우선으로 시작한다.
- `codex exec` / `codex review` 호출은 CLI subprocess 래핑으로 충분하다.

### 리스크

- Node 미설치 상태라 실제 빌드/테스트가 제한될 수 있다.
- `codex review` 출력 포맷이 고정 스키마가 아니므로 parsing은 보수적으로 구현해야 한다.
- prompt-only skill asset은 실제 런타임과 drift가 생길 수 있어, wrapper가 CLI 호출 규약을 명확히 가져야 한다.
