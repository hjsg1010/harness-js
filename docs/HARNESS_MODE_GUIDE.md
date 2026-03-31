# Harness Mode Guide

이 문서는 `harness interview`, `harness architect`, `harness run` 같은 스킬/플러그인/CLI를 사용할 때 `Plan mode`로 볼지, `Act/Default mode`로 실행할지 정리한 운영 메모다.

핵심 기준은 단순하다.

- 실제 `.harness/` 상태 파일이나 generated harness를 만들고 싶다면 `Act/Default mode`
- 아직 생각을 정리하거나 prompt/전략만 다듬고 싶다면 `Plan mode`

## 짧은 결론

대부분의 실제 harness 사용은 `Act/Default mode`를 권장한다.

이유는 아래 명령들이 모두 실제 artifact를 만들기 때문이다.

- `harness interview`
- `harness seed`
- `harness architect`
- `harness blueprint`
- `harness scaffold`
- `harness ralph`
- `harness run`

이 명령들은 단순 대화가 아니라 아래를 수행한다.

- `.harness/interviews/*.json` 저장
- `.harness/seeds/*.yaml` 생성
- `.harness/harness-seeds/*.yaml` 생성
- `.claude/agents`, `.claude/skills`, `.agents/skills` 생성
- `.harness/runs/*` 실행 상태 기록

즉 "실제로 하네스를 돌린다"는 뜻이면 보통 `Act/Default mode`가 맞다.

## 언제 `Plan mode`가 좋은가

`Plan mode`는 아래 상황에서 유용하다.

- 어떤 lane을 먼저 써야 할지 아직 헷갈릴 때
- architect prompt를 먼저 다듬고 싶을 때
- feature interview에 넣을 문제 정의를 먼저 정리하고 싶을 때
- repo를 읽고 "이 repo에서 harness를 어떻게 쓰면 좋을까?"를 설계하고 싶을 때
- 실제 `.harness/` 파일 생성 없이 시나리오만 짜고 싶을 때

즉 `Plan mode`는 "하네스를 실행하기 전의 설계/정리 모드"라고 보면 된다.

## 언제 `Act/Default mode`가 좋은가

`Act/Default mode`는 아래 상황에서 권장한다.

- 실제 `harness interview`를 시작하고 싶을 때
- interview 결과를 `seed`로 만들고 싶을 때
- repo-specific harness를 실제로 scaffold하고 싶을 때
- `ralph` loop를 돌려 story-by-story 실행과 검증을 남기고 싶을 때
- `run`으로 automatic reopen까지 포함한 end-to-end flow를 돌리고 싶을 때

즉 `Act/Default mode`는 "실제 artifact와 state를 남기는 실행 모드"다.

## `harness interview`는 어느 쪽이 맞나

둘 다 가능하지만, 목적이 다르다.

### Plan mode에서의 `harness interview`

이렇게 쓰면 좋다.

- "이 문제를 어떻게 interview prompt로 던지는 게 좋을까?"
- "search-side 문제인지 judge-side 문제인지 먼저 정리해줘"
- "실행 전에 acceptance criteria를 같이 다듬자"

이 경우에는 실제 CLI 상태를 만들기보다, interview 방식의 사고를 빌려 문제를 정리하는 쪽에 가깝다.

### Act/Default mode에서의 `harness interview`

이렇게 쓰는 것이 일반적이다.

- 실제로 질문-응답 라운드를 진행
- `.harness/interviews/<id>.json` 저장
- 이후 `seed -> ralph` 또는 `run`으로 이어짐

즉 "실제 하네스 lane을 시작한다"는 의미의 `harness interview`는 `Act/Default mode`가 기본이다.

## 빠른 판단표

| 내가 원하는 것 | 권장 모드 |
| --- | --- |
| 이 repo에 하네스를 어떻게 얹을지 설계만 하고 싶다 | `Plan mode` |
| architect prompt를 더 잘 쓰고 싶다 | `Plan mode` |
| feature request를 먼저 정리하고 싶다 | `Plan mode` 또는 가벼운 `Act` |
| 실제 interview state를 만들고 seed까지 가고 싶다 | `Act/Default mode` |
| repo-specific harness를 실제 scaffold하고 싶다 | `Act/Default mode` |
| `run`으로 구현-검증 loop를 실제로 돌리고 싶다 | `Act/Default mode` |

## 추천 운영 방식

가장 실용적인 패턴은 아래 둘 중 하나다.

### 패턴 1. Plan -> Act

이 패턴은 중요하거나 애매한 작업에 좋다.

1. `Plan mode`에서 문제 정의, lane 선택, prompt wording 정리
2. `Act/Default mode`로 전환
3. 실제 `harness interview` 또는 `harness architect` 실행
4. `seed`, `scaffold`, `ralph`, `run`으로 진행

### 패턴 2. 바로 Act

이 패턴은 이미 의도가 충분히 분명할 때 좋다.

1. `Act/Default mode`에서 바로 `harness interview`
2. `seed`
3. `ralph` 또는 `run`

## 실전 권장

### SolPE 같은 연구형 repo

- 먼저 `Plan mode`에서 어떤 시나리오가 맞는지 정리하는 것이 유리하다
- 그 다음 `Act/Default mode`에서 `architect` 또는 `interview`를 실제 실행하는 것이 좋다

이유:

- phase brief, baseline, metric 해석 기준을 먼저 고정하는 편이 안전하다

### 일반 기능 개발 repo

- 작은 기능이나 버그면 바로 `Act/Default mode`로 `interview -> seed -> ralph`
- 큰 변경이나 팀 규칙 정리가 필요하면 `Plan -> Act` 순서

## 한 줄 추천

- "생각을 정리하는 중"이면 `Plan mode`
- "실제로 하네스를 돌리는 중"이면 `Act/Default mode`

특히 `harness interview` 같은 스킬/플러그인을 실제 lane 실행으로 쓸 때는 보통 `Act/Default mode`가 맞다.
