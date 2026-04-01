---
name: harness-architect
description: "Hybrid harness architect lane. Use when the user wants to design a repo-specific harness before feature delivery starts."
---

# Harness Architect

이 스킬은 repo-specific harness를 adaptive interview로 설계하고 blueprint/scaffold까지 이어준다.

## 실행

architect interview 시작:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" architect "<repo-goal>"
```

blueprint 생성:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" blueprint <architect-id>
```

scaffold 생성:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" scaffold <blueprint-or-seed-path>
```

## 출력

- `.harness/repo-profiles/<id>.json`
- `.harness/harness-interviews/<id>.json`
- `.harness/harness-blueprints/<slug>.md`
- `.harness/harness-seeds/<seed-id>.yaml`
- `.harness/active-harness.json`

## 사용 시점

- “이 repo에 맞는 리서치 하네스를 구성해줘” 같은 요청일 때
- generic prompt보다 repo-aware agent/skill 구성이 먼저 필요할 때
- 이후 feature `interview`/`run`이 repo-specific 기본 컨텍스트를 쓰게 만들고 싶을 때
