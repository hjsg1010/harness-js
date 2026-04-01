# Harness Mode Guide

이 문서는 Claude Code에서 `Hybrid Harness`를 사용할 때 언제 `Plan mode`로 생각을 정리하고, 언제 실제 slash command를 실행할지 정리한 운영 메모다.

## 짧은 결론

- 설계/전략 정리: `Plan mode`
- 실제 harness lane 실행: `Act/Default mode`

공식 runtime이 Claude Code plugin이기 때문에, 아래 command를 실제로 실행해 `.harness/` 상태나 generated asset을 만들고 싶다면 보통 `Act/Default mode`가 맞다.

- `/harness-interview`
- `/harness-architect`
- `/harness-seed`
- `/harness-blueprint`
- `/harness-scaffold`
- `/harness-ralph`
- `/harness-run`

## `Plan mode`가 좋은 상황

- feature idea를 어떻게 interview할지 먼저 다듬고 싶을 때
- architect lane으로 가야 할지 feature lane으로 가야 할지 애매할 때
- repo에 harness를 어떻게 얹을지 시나리오만 먼저 정리하고 싶을 때
- acceptance criteria, phase brief, verification 기준을 먼저 언어화하고 싶을 때

## `Act/Default mode`가 좋은 상황

- 실제 interview state를 만들고 싶을 때
- immutable spec/seed 또는 blueprint/harness seed를 생성하고 싶을 때
- scaffold로 repo-specific Claude assets를 실제로 만들고 싶을 때
- Ralph loop 상태와 reopen guidance를 실제로 남기고 싶을 때

## 실전 추천

### 연구형 repo

- 먼저 `Plan mode`로 phase brief와 metric 해석 기준을 정리
- 그다음 `Act/Default mode`에서 `/harness-architect` 또는 `/harness-interview` 실행

### 일반 기능 개발 repo

- 작은 task면 바로 `/harness-interview`
- 큰 구조 설계가 필요하면 `Plan mode`에서 lane 선택과 prompt wording 정리 후 실행

## Helper runtime

`harness internal ...` helper는 공식 사용자 진입점이 아니라 plugin 내부 runtime이다. 직접 디버깅하지 않는 한 Claude slash command를 우선 사용한다.
