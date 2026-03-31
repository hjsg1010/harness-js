---
name: harness-interview
description: "Hybrid harness interview lane. Use when the user has a vague implementation idea and wants Ouroboros-style clarification before code execution."
---

# Harness Interview

이 스킬은 ambiguity-gated interview를 시작하거나 이어간다.

## 실행

다음 명령으로 interview를 시작한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" interview "<idea>"
```

이어받기는 다음 명령을 사용한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" interview --resume <interview-id>
```

## 출력

- `.harness/interviews/<id>.json`

## 사용 시점

- 요구사항이 모호할 때
- brownfield 변경이지만 수정 경계가 불분명할 때
- seed/spec를 먼저 고정하고 싶을 때

## 참고

- active harness가 있으면 interview prompt가 그 harness의 terminology와 verification emphasis를 반영한다.
- marketplace로 설치한 경우 runner가 first run에 `npm install`, `npm run build`를 자동으로 수행할 수 있다.
