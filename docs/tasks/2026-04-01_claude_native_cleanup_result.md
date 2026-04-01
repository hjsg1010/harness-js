# Claude Native Cleanup Result

## 1. What changed

이번 작업에서는 `harness-js`의 primary runtime을 `Codex` subprocess 기반 TypeScript CLI에서 `Claude Code` plugin 중심 구조로 정리했다.

핵심 변경은 다음과 같다.

- root `commands/`를 추가해 namespaced slash command surface를 마련했다.
- top-level `agents/`, `skills/`를 공식 plugin asset으로 유지하고, tracked duplicate `.claude/*`, `.agents/skills/harness-*`를 제거했다.
- `ProcessCodexRunner`, `CodexRunner`, `src/infra/codex-runner.ts`, `src/orchestrator/service.ts`를 제거했다.
- `src/cli.ts`를 `harness internal ...` deterministic helper runtime으로 재구성했다.
- `InterviewService`, `ArchitectService`, `SeedService`, `HarnessBlueprintService`, `RalphService`를 Claude가 만든 structured round/draft/result를 적용하는 deterministic service로 바꿨다.
- scaffold/generated asset은 Claude plugin asset만 공식 생성물로 남기도록 단순화했다.
- README와 usage guide를 Claude-native plugin 흐름 기준으로 다시 작성했다.

## 2. Why it changed

이전 구조는 초기에 세운 가정 때문에 standalone CLI와 `codex exec/review` subprocess를 중심으로 구현되어 있었다. 하지만 현재 사용 환경과 reference(`Ouroboros`, `oh-my-claudecode`)의 철학은 Claude-native plugin/commands/skills/agents 중심에 더 가깝다.

따라서 이번 변경의 의도는 다음 두 가지였다.

- 현재 방향과 어긋나는 `Codex-first` runtime과 stale 문서를 실제로 제거한다.
- Claude가 reasoning과 orchestration을 맡고, TypeScript는 persistence와 deterministic state transition만 맡는 구조로 경계를 다시 잡는다.

## 3. Impact scope

- plugin 설치 후 공식 진입점은 slash command다.
  - `/harness`
  - `/harness-interview`
  - `/harness-architect`
  - `/harness-seed`
  - `/harness-blueprint`
  - `/harness-scaffold`
  - `/harness-ralph`
  - `/harness-run`
- CLI는 end-to-end runtime이 아니라 internal helper runtime이다.
- generated harness는 `agents/`와 `skills/` 기준으로 생성된다.
- current-facing 문서에서 `Codex`, `codex exec/review`, `gpt-5.4` 전제는 제거했다.
- 과거 `docs/tasks/*`는 historical record로 유지했다.

## 4. Verification performed

실행한 검증과 결과는 아래와 같다.

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build
```

- 성공

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test
```

- 성공
- `9` files, `24` tests passed

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run eval
```

- 성공
- `1` file, `1` test passed

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run smoke:cli
```

- 성공
- Claude-native help surface 출력 확인

```bash
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" node dist/cli.js --help
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" node dist/cli.js internal --help
```

- 성공
- public help와 helper help가 기대한 surface를 출력함

```bash
rg -n "codex exec|codex review|gpt-5\.4|ProcessCodexRunner|CodexRunner" README.md docs src agents skills commands package.json .claude-plugin -g '!docs/tasks/**'
```

- current-facing 파일에서는 매치 없음

추가로 AGENTS 기준 pre-commit formatter/linter도 시도했다.

```bash
black .
isort .
ruff check .
```

- 현재 환경에 command가 없어 실행 불가
- `black`, `isort`, `ruff` 모두 `command not found`

## 5. Known limitations / follow-up

- 현재 공식 runtime은 Claude Code plugin이다. standalone CLI end-to-end 사용성은 의도적으로 내려놓았다.
- `run-apply-story`는 Claude가 만든 reviewer/final critic 결과를 받아 state를 적용하는 helper이므로, plugin skill의 multi-turn 운영 품질이 중요하다.
- agent-agnostic HTTP transport는 이번 범위에 넣지 않았다. Claude-native 정리가 끝난 뒤 별도 단계로 검토한다.

## 6. Lessons

- 실수 패턴: Claude plugin/commands/skills 중심 요청인데도 standalone CLI와 `Codex` subprocess를 먼저 core runtime으로 두었다.
- 예방 규칙: Claude Code plugin을 주요 레퍼런스로 삼는 요청에서는 host-agent-native runtime을 기본으로 두고, helper CLI는 deterministic support layer로만 설계한다.
- 최소 enforcement: task plan 문서에 runtime 경계 체크리스트를 넣고, 구현 전에 “agent-native runtime인지 helper runtime인지”를 명시적으로 잠근다.
