# Hybrid Harness

`Ouroboros` 스타일의 adaptive interview와 repo-specific harness 설계를 **Claude Code plugin** 안에서 운영하기 위한 Claude-native harness입니다.

## Table of Contents

- [Quick Start](#quick-start)
- [공식 사용 방식](#공식-사용-방식)
- [Lanes](#lanes)
- [Slash Commands](#slash-commands)
- [Internal Helper Runtime](#internal-helper-runtime)
- [결과물과 상태 파일](#결과물과-상태-파일)
- [Verification](#verification)
- [현재 한계와 Prerequisites](#현재-한계와-prerequisites)
- [Why This Exists](#why-this-exists)

## Quick Start

### 1. Prerequisites

- `Claude Code`
- `Node.js 20+`
- `npm`

### 2. Install for local development

```bash
npm install
npm run build
```

### 3. Install in Claude Code marketplace

```text
/plugin marketplace add hjsg1010/harness-js
/plugin install hybrid-harness@harness-js
```

plugin 설치 후 공식 entrypoint는 slash command입니다.

### 4. Start in Claude Code

feature interview:

```text
/harness-interview Build a release checklist assistant
```

repo-specific harness design:

```text
/harness-architect 리서치 하네스를 구성해줘
```

existing spec/seed execution:

```text
/harness-ralph .harness/seeds/example-seed.yaml
```

## 공식 사용 방식

이 저장소의 1차 공식 runtime은 **Claude Code plugin**입니다.

- top-level `commands/`가 slash command surface를 제공
- top-level `skills/`가 lane별 workflow를 정의
- top-level `agents/`가 Claude-native specialist role을 정의
- TypeScript CLI는 **deterministic helper core**로만 사용됩니다

즉, reasoning과 orchestration은 Claude가 맡고, TypeScript는 state persistence / artifact rendering / run state transition / scaffold generation만 담당합니다.

## Lanes

### Feature lane

```text
idea
  -> interview
  -> spec / seed
  -> run-init
  -> story-by-story Ralph loop
  -> completed | blocked | reopen_required
```

### Harness lane

```text
repo-goal
  -> architect
  -> blueprint / harness seed
  -> scaffold
  -> active harness
```

## Slash Commands

이 plugin은 bare `/interview`, `/seed`, `/ralph`, `/run` 대신 namespaced command만 제공합니다.

- `/harness`
- `/harness-interview`
- `/harness-architect`
- `/harness-seed`
- `/harness-blueprint`
- `/harness-scaffold`
- `/harness-ralph`
- `/harness-run`

`Ouroboros` 같은 다른 plugin과 command 충돌을 피하기 위한 선택입니다.

## Internal Helper Runtime

helper CLI는 plugin 내부에서만 공식 사용합니다.

```bash
harness internal feature-init --idea "<idea>" --json
harness internal feature-apply-round --interview-id <id> --round-file <round.json> --json
harness internal architect-init --goal "<goal>" --json
harness internal architect-apply-round --interview-id <id> --round-file <round.json> --json
harness internal seed-render --interview-id <id> --draft-file <draft.json> --json
harness internal blueprint-render --interview-id <id> --draft-file <draft.json> --json
harness internal scaffold --source <blueprint-or-seed-path> --json
harness internal run-init --source <spec-or-seed-path> --json
harness internal run-apply-story --run-id <id> --story-result-file <story-result.json> --json
```

이 helper는 다음 역할만 합니다.

- interview / architect state 저장
- immutable spec / seed / blueprint 렌더링
- generated harness scaffold 및 manifest 관리
- Ralph loop 상태 전이와 reopen state 기록

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
        artifact-contracts.md
        handoff-protocol.md
        verification-policy.md
  active-harness.json
  runs/<run-id>/
    prd.json
    loop-state.json
    progress.md
    verification.json
    _workspace/
```

generated harness는 top-level Claude plugin assets로 생성됩니다.

- `agents/<slug>-<role>.md`
- `skills/<slug>-<skill>/skill.md`

## Verification

기본 검증 명령:

```bash
npm run build
npm test
npm run eval
npm run smoke:cli
```

CLI helper 표면 확인:

```bash
node dist/cli.js --help
node dist/cli.js internal --help
```

## 현재 한계와 Prerequisites

- 현재 1차 공식 runtime은 **Claude Code plugin**입니다.
- standalone CLI는 end-to-end agent runtime이 아니라 internal helper runtime입니다.
- generated harness는 새 인터뷰/새 런에만 적용되고 기존 resume에는 소급 적용되지 않습니다.
- `run-apply-story`는 Claude가 만든 reviewer/final critic 결과를 받아 state를 적용합니다.
- `docs/tasks/*`는 historical record로 보존하며, 현재-facing 문서만 현재 구조를 설명합니다.

## Why This Exists

기존 AI coding flow는 구현이 먼저고 요구사항 정리와 verification은 뒤로 밀리는 경우가 많습니다. Hybrid Harness는 순서를 바꿉니다.

- 먼저 ambiguity를 interview로 줄입니다.
- 필요하면 repo-specific harness 자체를 architect lane에서 먼저 설계합니다.
- 그 결과를 immutable artifact로 고정합니다.
- 마지막으로 Claude가 story-by-story execution과 critic gate를 운영하고, helper runtime이 상태를 남깁니다.

즉, “무엇을 만들지”, “이 repo에 어떤 harness를 깔지”, “어디서 reopen해야 하는지”를 Claude Code 안에서 같은 체계로 다루기 위한 도구입니다.
