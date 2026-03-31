# What changed

`harness-js`를 Dual-Interview Hybrid Harness V2로 확장했다.

- 기존 feature lane에 active harness snapshot과 critic-driven reopen을 추가했다.
- 새 harness lane `architect -> blueprint -> scaffold`를 추가했다.
- repo-specific harness를 deterministic scaffold로 생성하고 active harness로 등록하게 만들었다.
- CLI, serializer, filesystem, wrapper skill, README를 새 public surface에 맞게 갱신했다.

# Why it changed

기존 구현은 feature requirement를 interview로 줄인 뒤 Ralph loop로 이어지는 v1 구조였다. 이번 변경의 목적은 다음 두 가지를 실제로 구현하는 것이다.

- repo 자체에 맞는 harness를 먼저 설계하고 생성할 수 있게 하는 것
- final critic가 implementation 문제와 requirement/harness 설계 문제를 구분하고 적절한 lane으로 다시 연결하게 하는 것

즉, generic process harness를 넘어서 repo-aware harness가 이후 feature delivery quality를 shape하도록 만들기 위한 변경이다.

# Impact scope

- CLI 명령 추가
  - `architect`
  - `blueprint`
  - `scaffold`
- `.harness/` 상태 구조 확장
  - `repo-profiles`
  - `harness-interviews`
  - `harness-blueprints`
  - `harness-seeds`
  - `generated-harness`
  - `active-harness.json`
- final critic rejection category와 `reopen_required` 상태 추가
- Claude/Codex wrapper skill 확장
- README 및 changelog 갱신

# Verification performed

실행 명령과 결과:

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build
```

- 성공

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test
```

- 성공
- `8` test files, `17` tests passed
- architect interview persistence, blueprint/seed golden, scaffold conflict protection, active harness prompt shaping, critic-driven reopen flow를 포함

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" node dist/cli.js --help
```

- 성공
- `architect`, `blueprint`, `scaffold`를 포함한 새 CLI surface가 출력됨

# Known limitations

- live provider round-trip 자체는 fake runner test로 대체 검증했다.
- `run`만 automatic reopen orchestration을 수행하고, direct `ralph`는 synthetic reopen state와 다음 명령만 남긴다.
- generated harness는 새 인터뷰/새 런에만 적용되고 기존 resume에는 소급 적용되지 않는다.
- scaffold conflict가 발생하면 기존 active harness를 유지하고 종료한다.

# Lessons

- 사용자와 구현 범위를 다시 맞춘 뒤에는 README 같은 문서 작업과 실제 기능 구현 작업을 명확히 분리해서 다뤄야 한다.
- 이후에는 “계획 문서에 있는 미래 기능”과 “현재 구현 상태를 설명하는 문서”를 같은 턴에서 섞지 않도록 result와 README 반영 시점을 더 분명히 구분한다.
