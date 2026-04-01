---
name: harness-ralph
description: "Apply Ralph-style story execution and review inside Claude Code."
---

# Harness Ralph

이 스킬은 이미 spec/seed가 있을 때 story-by-story execution state를 관리한다.

## Start

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal run-init --source "{{ARGUMENTS}}" --json
```

## For each story

1. helper output의 `nextStory`를 읽는다.
2. 해당 story만 구현한다.
3. verification command를 실행하고 evidence를 모은다.
4. reviewer verdict를 만든다.
5. 마지막 story라면 final critic verdict도 만든다.
6. story result JSON을 작성하고 helper에 반영한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal run-apply-story --run-id <run-id> --story-result-file <story-result.json> --json
```

## Guardrails

- immutable spec/seed는 수정하지 않는다.
- 한 번에 story 하나만 처리한다.
- evidence 없는 approve는 허용하지 않는다.
- `reopen_required`가 나오면 직접 밀어붙이지 말고 suggested command를 따른다.
