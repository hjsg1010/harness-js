# Hybrid Harness

`Ouroboros` 스타일의 specification-first interview로 요구사항을 고정하고, `ralph` 스타일의 story-by-story verification loop로 구현과 검증을 끝까지 밀어붙이는 TypeScript CLI입니다.

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

그 뒤에는 `harness ...`를 바로 실행할 수 있습니다.

전역 링크를 만들지 않는다면 아래 예시의 `harness`를 `node dist/cli.js`로 바꿔 실행하면 됩니다.

### 3. Claude Code marketplace로 설치

이 저장소는 Claude Code plugin marketplace 형식도 함께 제공합니다.

```text
/plugin marketplace add hjsg1010/harness-js
/plugin install hybrid-harness@harness-js
```

- 공식 문서 기준으로 GitHub는 권장 호스팅 방식이며, 사용자는 `owner/repo` 형태로 marketplace를 추가할 수 있습니다.
- 현재 저장소가 private이면 설치하는 쪽 환경에서 `gh auth login` 또는 `GITHUB_TOKEN` / `GH_TOKEN`이 필요합니다.
- plugin 설치 후 Claude skill이 처음 호출될 때 bootstrap runner가 `npm install`, `npm run build`를 수행해 CLI를 준비합니다.

### 4. Start

막연한 아이디어에서 시작:

```bash
harness interview "I want to build a task management CLI"
```

한 번에 끝까지 실행:

```bash
harness run "I want to build a task management CLI"
```

이미 `spec.md` 또는 `seed.yaml`이 있다면:

```bash
harness ralph .harness/seeds/example-seed.yaml
```

## 어디서 시작하면 되나?

### 1. 아이디어가 아직 모호하다면

`interview`로 시작합니다.

```bash
harness interview "I want to build a notification workflow"
```

- 한 번에 한 질문만 묻습니다.
- 각 라운드마다 ambiguity를 다시 계산합니다.
- 충분히 구체화되면 `seed` 단계로 넘어갈 수 있습니다.
- 중간에 멈추면 `harness interview --resume <interview-id>`로 이어갈 수 있습니다.

### 2. 요구사항은 정리했고 immutable artifact가 필요하다면

`seed`를 사용합니다.

```bash
harness seed <interview-id>
```

- interview 결과를 immutable `spec.md`와 `seed.yaml`로 고정합니다.
- ambiguity gate를 통과하지 못했더라도 강제로 산출물을 만들고 싶으면 `--force`를 사용합니다.

### 3. 이미 spec/seed가 있고 구현-검증 loop만 돌리고 싶다면

`ralph`를 사용합니다.

```bash
harness ralph path/to/spec.md
harness ralph path/to/seed.yaml
```

- seed/spec를 PRD로 변환합니다.
- story 하나씩 구현하고 바로 incremental QA를 수행합니다.
- reviewer/critic gate가 통과할 때까지 loop를 계속합니다.
- 중단된 실행은 `harness ralph --resume <run-id>`로 이어갈 수 있습니다.

### 4. interview부터 verification까지 한 번에 실행하고 싶다면

`run`을 사용합니다.

```bash
harness run "Build a release checklist assistant"
```

- 입력이 자유 텍스트면 `interview -> seed -> ralph`를 순서대로 실행합니다.
- 입력이 기존 파일 경로면 interview를 건너뛰고 바로 `ralph`로 들어갑니다.

### 어떤 순서로 쓰면 되나?

질문하신 흐름은 이렇게 이해하면 됩니다.

- 가장 기본적인 정석 흐름은 `interview -> seed -> ralph` 입니다.
- `interview`는 요구사항을 구체화하는 단계입니다.
- `seed`는 그 결과를 immutable `spec.md`와 `seed.yaml`로 고정하는 단계입니다.
- 그다음 실제 구현-검증 loop는 보통 `ralph`가 담당합니다.
- `run`은 `interview`와 `seed`와 `ralph`를 묶은 shortcut입니다.

즉, `seed` 다음에 또 `run`을 하는 개념은 아닙니다.

- 아이디어에서 시작하면 `run "<idea>"` 또는 `interview -> seed -> ralph`
- 이미 `spec.md`나 `seed.yaml`이 있으면 `ralph <path>`

## The Loop

Hybrid Harness는 다음 루프를 고정된 실행 경로로 사용합니다.

```text
idea
  -> interview
  -> immutable spec / seed
  -> PRD bridge
  -> Ralph loop
       implementer
       -> incremental QA
       -> story verification
       -> final critic
```

각 단계의 역할은 다음과 같습니다.

| Phase | 역할 |
| --- | --- |
| `interview` | Socratic questioning으로 숨은 가정과 요구사항 누락을 드러냅니다. |
| `seed` | 대화를 immutable `spec.md`와 `seed.yaml`로 crystallize 합니다. |
| `PRD bridge` | acceptance criteria를 story 단위의 실행 계획으로 바꿉니다. |
| `ralph` | story 단위 구현, incremental QA, reviewer/critic verification을 반복합니다. |

이 구조 덕분에 prompt를 계속 고쳐 쓰는 대신, 먼저 intent를 고정하고 그다음 검증 가능한 loop 안에서 구현을 진행할 수 있습니다.

## Commands

| Command | 용도 | 주요 출력 |
| --- | --- | --- |
| `harness interview "<idea>"` | ambiguity-gated interview 시작 | `.harness/interviews/<id>.json` |
| `harness interview --resume <interview-id>` | interview 이어받기 | 기존 interview state 갱신 |
| `harness seed <interview-id>` | immutable `spec.md` + `seed.yaml` 생성 | `.harness/specs/*`, `.harness/seeds/*` |
| `harness seed <interview-id> --force` | gate를 무시하고 seed 생성 | forced metadata 포함 seed |
| `harness ralph <spec-or-seed-path>` | PRD 생성 후 verification loop 실행 | `.harness/runs/<run-id>/*` |
| `harness ralph --resume <run-id>` | 중단된 run 이어받기 | 기존 run state 갱신 |
| `harness run "<idea-or-path>"` | 자유 텍스트면 end-to-end, 파일이면 direct ralph | 위 산출물 전체 |

`npm link`를 하지 않았다면 위 명령의 `harness`를 `node dist/cli.js`로 바꿔 동일하게 실행할 수 있습니다.

## 결과물과 상태 파일

실행 상태는 프로젝트 로컬의 `.harness/` 아래에 저장됩니다.

```text
.harness/
  interviews/<id>.json
  specs/<slug>.md
  seeds/<seed-id>.yaml
  runs/<run-id>/
    prd.json
    loop-state.json
    progress.md
    verification.json
    _workspace/
```

각 파일의 의미는 다음과 같습니다.

- `interviews/*.json`: interview transcript, ambiguity 상태, resume 정보
- `specs/*.md`: 사람이 읽는 immutable specification
- `seeds/*.yaml`: downstream execution용 immutable seed artifact
- `runs/*/prd.json`: story-by-story 실행 계획
- `runs/*/loop-state.json`: 현재 run 상태, attempts, block 여부
- `runs/*/progress.md`: story 진행 이력 요약
- `runs/*/verification.json`: QA / reviewer / critic evidence
- `runs/*/_workspace/`: loop 중간 산출물

## Claude / Codex에서 쓰는 방법

### Codex

Codex용 wrapper skill이 포함되어 있습니다.

- `.agents/skills/harness-interview/SKILL.md`
- `.agents/skills/harness-ralph/SKILL.md`
- `.agents/skills/harness-orchestrator/SKILL.md`

이 스킬들은 내부적으로 로컬 CLI를 호출하는 얇은 wrapper입니다. Codex 세션에서 vague idea 정리, 기존 seed 재실행, end-to-end orchestration을 같은 런타임으로 연결할 수 있습니다.

### Claude

Claude용 agent/skill 자산도 함께 포함되어 있습니다.

- `.claude/agents/interviewer.md`
- `.claude/agents/implementer.md`
- `.claude/agents/qa-inspector.md`
- `.claude/agents/critic.md`
- `.claude/skills/harness-interview/skill.md`
- `.claude/skills/harness-ralph/skill.md`
- `.claude/skills/harness-orchestrator/skill.md`

Claude에서는 interview specialist, implementer, QA, critic 역할을 분리한 뒤 같은 `.harness/` 상태를 기준으로 협업하도록 사용할 수 있습니다.

GitHub marketplace로 설치했다면 다음 경로로 추가할 수 있습니다.

```text
/plugin marketplace add hjsg1010/harness-js
/plugin install hybrid-harness@harness-js
```

plugin은 저장소 루트의 `.claude-plugin/marketplace.json`과 `.claude-plugin/plugin.json`을 사용합니다.

## Verification

기본 검증 명령은 다음과 같습니다.

```bash
npm run build
npm test
```

CLI 표면 확인:

```bash
node dist/cli.js --help
```

테스트는 fake runner 기반으로 interview, seed rendering, PRD bridge, Ralph state transition, end-to-end flow를 검증합니다.

## 현재 한계와 Prerequisites

- 실제 Ralph loop는 로컬 `codex exec` / `codex review` 사용 가능 환경을 전제로 합니다.
- Claude marketplace 설치 후 첫 실행은 dependency install과 build 때문에 더 오래 걸릴 수 있습니다.
- brownfield repo scan은 현재 작업 중인 workspace를 기준으로 수행합니다.
- `seed`는 ambiguity threshold `0.20`을 기준으로 생성 가능 여부를 판단합니다.
- reviewer/critic 반복 실패가 같은 signature로 3회 누적되면 run을 `blocked` 상태로 남기고 중단합니다.
- 현재 테스트는 fake runner를 사용하므로, live provider round-trip 자체를 대신하지는 않습니다.

## Why This Exists

기존 AI coding workflow는 대개 prompt가 모호한 상태에서 바로 구현으로 들어가고, 문제는 나중에 review 단계에서 드러납니다. Hybrid Harness는 그 반대로 움직입니다.

- 먼저 interview로 ambiguity를 줄입니다.
- 그 결과를 immutable spec/seed로 고정합니다.
- 그다음 Ralph loop 안에서 구현과 검증을 분리하지 않고 계속 연결합니다.

즉, "무엇을 만들지"와 "정말 제대로 만들었는지"를 같은 harness 안에서 다루기 위한 도구입니다.
