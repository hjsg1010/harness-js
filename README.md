# Hybrid Harness

`Ouroboros` 스타일의 adaptive interview와 `ralph` 스타일의 verification loop를 결합하고, 여기에 repo-specific harness generator lane까지 더한 TypeScript CLI입니다.

## Table of Contents

- [Quick Start](#quick-start)
- [어디서 시작하면 되나?](#어디서-시작하면-되나)
- [The Loop](#the-loop)
- [Commands](#commands)
- [결과물과 상태 파일](#결과물과-상태-파일)
- [Claude / Codex에서 쓰는 방법](#claude--codex에서-쓰는-방법)
- [Verification](#verification)
- [현재 한계와 Prerequisites](#현재-한계와-prerequisites)
- [Why This Exists](#why-this-exists)

## Quick Start

### 1. Prerequisites

- `Node.js 20+`
- `npm`
- 실제 Ralph loop를 돌릴 때는 로컬 `codex exec` / `codex review` 사용 가능 환경

### 2. Install

```bash
npm install
npm run build
```

전역 커맨드로 쓰고 싶다면:

```bash
npm link
```

전역 링크를 만들지 않는다면 아래 예시의 `harness`를 `node dist/cli.js`로 바꿔 실행하면 됩니다.

### 3. Claude Code marketplace로 설치

```text
/plugin marketplace add hjsg1010/harness-js
/plugin install hybrid-harness@harness-js
```

- GitHub marketplace 형식으로 배포되어 있어 `owner/repo`만으로 추가할 수 있습니다.
- 저장소가 private이면 설치하는 쪽에서 `gh auth login` 또는 `GITHUB_TOKEN` / `GH_TOKEN`이 필요합니다.
- plugin 설치 후 첫 skill 호출 시 bootstrap runner가 `npm install`, `npm run build`를 수행할 수 있습니다.

### 4. Start

feature idea에서 시작:

```bash
harness run "Build a release checklist assistant"
```

repo-specific harness를 먼저 설계하고 싶다면:

```bash
harness architect "리서치 하네스를 구성해줘"
```

이미 `spec.md` 또는 `seed.yaml`이 있다면:

```bash
harness ralph .harness/seeds/example-seed.yaml
```

## 어디서 시작하면 되나?

### 1. 무엇을 만들지 아직 모호하다면

`interview`로 시작합니다.

```bash
harness interview "I want to build a notification workflow"
```

- 한 번에 한 질문만 묻습니다.
- 각 라운드마다 ambiguity를 다시 계산합니다.
- brownfield면 repo context를 먼저 스캔합니다.
- active harness가 있으면 그 terminology와 verification emphasis를 질문 prompt에 반영합니다.

### 2. interview 결과를 immutable artifact로 고정하고 싶다면

`seed`를 사용합니다.

```bash
harness seed <interview-id>
```

- immutable `spec.md`와 `seed.yaml`를 생성합니다.
- threshold를 넘겨도 강제로 artifact를 만들고 싶다면 `--force`를 사용합니다.

### 3. 기존 spec/seed로 구현-검증 loop만 돌리고 싶다면

`ralph`를 사용합니다.

```bash
harness ralph path/to/spec.md
harness ralph path/to/seed.yaml
```

- seed/spec를 PRD로 변환합니다.
- story마다 implement -> incremental QA -> reviewer를 수행합니다.
- final critic가 requirement/harness 문제를 지적하면 run은 `reopen_required`로 종료하고 다음 명령을 제안합니다.

### 4. interview부터 verification까지 한 번에 실행하고 싶다면

`run`을 사용합니다.

```bash
harness run "Build a release checklist assistant"
```

- 자유 텍스트면 `interview -> seed -> ralph`를 시작합니다.
- 파일 경로면 interview를 건너뛰고 해당 source로 바로 Ralph를 시작합니다.
- final critic가 `requirement_ambiguity` 또는 `harness_design_gap`를 반환하면 가능한 범위에서 lane reopen을 자동 수행합니다.

### 5. 이 repo에 맞는 harness부터 만들고 싶다면

`architect -> blueprint -> scaffold`를 사용합니다.

```bash
harness architect "리서치 하네스를 구성해줘"
harness blueprint <architect-id>
harness scaffold .harness/harness-seeds/<seed-id>.yaml
```

- `architect`는 repo profile을 먼저 만들고 adaptive interview를 수행합니다.
- `blueprint`는 immutable harness blueprint와 harness seed를 생성합니다.
- `scaffold`는 repo-specific Claude/Codex asset을 생성하고 기본 active harness로 등록합니다.
- active harness가 생기면 이후 새 `interview`, `seed`, `PRD`, `ralph` prompt가 그 terminology와 verification bias를 읽습니다.

## The Loop

Hybrid Harness는 지금 두 개의 lane를 갖습니다.

```text
Harness lane:
repo-goal
  -> architect
  -> blueprint / harness seed
  -> scaffold
  -> active harness

Feature lane:
idea
  -> interview
  -> spec / seed
  -> PRD bridge
  -> Ralph loop
       implementer
       -> incremental QA
       -> story verification
       -> final critic
       -> reopen feature or harness lane when needed
```

핵심 차이는 다음과 같습니다.

| Lane | 역할 |
| --- | --- |
| `interview` | feature requirement를 adaptive interview로 구체화 |
| `architect` | repo-specific harness 자체를 adaptive interview로 설계 |
| `seed` | feature intent를 immutable artifact로 고정 |
| `blueprint` | harness design을 immutable blueprint/seed로 고정 |
| `scaffold` | repo-specific agents/skills/checklist/reference 생성 |
| `ralph` | story-by-story 구현과 reviewer/critic gate 수행 |
| `run` | feature lane orchestration과 automatic reopen 수행 |

active harness가 있을 때는 feature lane도 generic prompt로만 움직이지 않습니다. 새 feature interview는 repo-specific terminology를 읽고, 새 seed/PRD/run은 work unit, verification emphasis, boundary hint를 반영합니다.

## Commands

| Command | 용도 | 주요 출력 |
| --- | --- | --- |
| `harness interview "<idea>"` | feature interview 시작 | `.harness/interviews/<id>.json` |
| `harness interview --resume <interview-id>` | feature interview 이어받기 | 기존 interview state 갱신 |
| `harness seed <interview-id>` | immutable `spec.md` + `seed.yaml` 생성 | `.harness/specs/*`, `.harness/seeds/*` |
| `harness architect "<repo-goal>"` | harness architect interview 시작 | `.harness/harness-interviews/<id>.json` |
| `harness architect --resume <architect-id>` | harness architect interview 이어받기 | 기존 architect state 갱신 |
| `harness blueprint <architect-id>` | immutable harness blueprint + seed 생성 | `.harness/harness-blueprints/*`, `.harness/harness-seeds/*` |
| `harness scaffold <blueprint-or-seed-path>` | repo-specific harness 생성 및 active harness 등록 | generated assets + manifest |
| `harness ralph <spec-or-seed-path>` | PRD 생성 후 verification loop 실행 | `.harness/runs/<run-id>/*` |
| `harness ralph --resume <run-id>` | 중단된 run 이어받기 | 기존 run state 갱신 |
| `harness run "<idea-or-path>"` | end-to-end feature orchestration | feature artifacts + run artifacts |

## 결과물과 상태 파일

```text
.harness/
  interviews/<id>.json
  specs/<slug>.md
  seeds/<seed-id>.yaml
  repo-profiles/<id>.json
  harness-interviews/<id>.json
  harness-blueprints/<slug>.md
  harness-seeds/<seed-id>.yaml
  generated-harness/
    <slug>/
      manifest.json
      validation-checklist.md
      references/
  active-harness.json
  runs/<run-id>/
    prd.json
    loop-state.json
    progress.md
    verification.json
    _workspace/
```

핵심 의미는 다음과 같습니다.

- `interviews/*.json`: feature interview transcript와 ambiguity 상태
- `harness-interviews/*.json`: architect interview transcript와 repo profile reference
- `repo-profiles/*.json`: deterministic repo scan 결과
- `specs/*.md`, `seeds/*.yaml`: feature immutable artifact
- `harness-blueprints/*.md`, `harness-seeds/*.yaml`: harness immutable artifact
- `generated-harness/<slug>/manifest.json`: generated file hash와 conflict tracking
- `active-harness.json`: 새 feature lane에 적용될 기본 harness snapshot
- `runs/*/loop-state.json`: run status, repeated failure, reopen target, reopen history

## Claude / Codex에서 쓰는 방법

### Codex

- `.agents/skills/harness-interview/SKILL.md`
- `.agents/skills/harness-architect/SKILL.md`
- `.agents/skills/harness-ralph/SKILL.md`
- `.agents/skills/harness-orchestrator/SKILL.md`

wrapper skill은 모두 로컬 CLI를 호출하는 얇은 entrypoint입니다. `architect` lane로 repo-specific harness를 만들고, 그 다음 `interview`/`run`이 active harness를 읽게 할 수 있습니다.

### Claude

- `.claude/skills/harness-interview/skill.md`
- `.claude/skills/harness-architect/skill.md`
- `.claude/skills/harness-ralph/skill.md`
- `.claude/skills/harness-orchestrator/skill.md`

Claude marketplace 설치 후에도 같은 명령 surface를 사용합니다. 생성된 repo-specific harness asset은 `.claude/agents/`, `.claude/skills/`, `.agents/skills/`에 slug prefix로 추가됩니다.

## Verification

기본 검증 명령:

```bash
npm run build
npm test
npm run smoke:cli
```

CLI 표면 확인:

```bash
node dist/cli.js --help
```

현재 테스트는 다음을 검증합니다.

- feature interview regression
- architect interview persistence
- harness blueprint/seed generation
- seed/PRD active harness enrichment
- scaffold manifest conflict protection
- per-slug manifest persistence
- active harness prompt shaping
- final critic 기반 reopen loop

## 현재 한계와 Prerequisites

- real provider execution은 여전히 로컬 `codex exec` / `codex review` 환경을 전제로 합니다.
- generated harness는 새 인터뷰/새 런에만 적용되고, 기존 resume에는 소급 적용되지 않습니다.
- `run`만 automatic reopen orchestration을 수행합니다. direct `ralph`는 synthetic reopen state와 다음 명령만 남깁니다.
- automatic reopen은 lane별 1회, 총 2회까지만 수행합니다.
- scaffold는 user-edited generated file을 덮어쓰지 않습니다. 충돌이 나면 기존 active harness를 유지하고 종료합니다.
- active harness enrichment는 deterministic bias를 우선합니다. story decomposition 자체를 완전 자유 생성으로 바꾸지는 않습니다.

## Why This Exists

기존 AI coding workflow는 대개 바로 구현으로 들어간 뒤 review에서 뒤늦게 문제를 찾습니다. Hybrid Harness는 그 반대로 움직입니다.

- 먼저 feature requirement를 interview로 줄입니다.
- 필요하면 repo-specific harness 자체도 architect interview로 먼저 설계합니다.
- 설계 결과를 immutable seed/blueprint로 고정합니다.
- 그 다음 Ralph loop와 final critic로 구현/검증을 밀어붙입니다.

즉, “무엇을 만들지”, “이 repo에서 어떤 팀과 검증 방식으로 만들지”, “정말 제대로 만들었는지”를 같은 harness 안에서 다루기 위한 도구입니다.
