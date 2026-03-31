# What changed

Claude Code에서 GitHub marketplace로 설치할 수 있도록 `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json`을 추가했다. plugin source는 저장소 루트 `./`를 사용하도록 구성했고, 기존 `.claude/skills`와 `.claude/agents`를 plugin manifest에 직접 연결했다.

또한 `scripts/harness-plugin-runner.sh`를 추가해 plugin 설치 후 first run에 `npm install`, `npm run build`를 자동으로 수행할 수 있게 했다. 이에 맞춰 `.claude/skills/harness-interview`, `.claude/skills/harness-ralph`, `.claude/skills/harness-orchestrator`는 runner를 통해 CLI를 호출하도록 수정했다.

README는 Claude marketplace 설치 경로, private GitHub 저장소 인증 전제, 그리고 `interview -> seed -> ralph`와 `run`의 관계를 분명히 설명하도록 업데이트했다.

# Why it changed

기존 저장소는 로컬 checkout에서만 CLI와 skill 자산을 사용하는 전제를 두고 있었기 때문에, Claude Code plugin marketplace로 설치했을 때 plugin cache 내부에서 harness를 바로 실행할 수 있는 경로가 없었다. 이번 변경은 manifest shape만 맞추는 것이 아니라, 설치 후 실제 실행 가능한 bootstrap 경로까지 제공하기 위한 것이다.

또한 사용자가 질문한 실행 순서 혼동을 줄이기 위해, `run`이 `interview + seed + ralph`를 묶은 shortcut이고 `seed` 다음의 정석 단계는 `ralph`라는 점을 README에 명시했다.

# Impact scope

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `scripts/harness-plugin-runner.sh`
- `.claude/skills/harness-interview/skill.md`
- `.claude/skills/harness-ralph/skill.md`
- `.claude/skills/harness-orchestrator/skill.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/tasks/*`

# Verification performed

다음 명령으로 검증했다.

```bash
bash -n scripts/harness-plugin-runner.sh
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/plugin.json','utf8')); JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('plugin manifests ok')"
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm run build
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" npm test
PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH" bash scripts/harness-plugin-runner.sh --help
```

결과:

- runner shell syntax 검증 통과
- plugin manifest JSON parse 통과
- `npm run build` 통과
- `npm test` 통과: 5 files, 10 tests
- runner 경유 CLI help 출력 통과

# Follow-ups / known limitations

- live Claude Code 환경에서 `/plugin marketplace add`와 `/plugin install` 자체를 이 세션에서 직접 실행하지는 못했다.
- 현재 저장소가 private이면 설치하는 사용자 쪽에서 GitHub credential helper 또는 `GITHUB_TOKEN` / `GH_TOKEN`이 필요하다.
- first run bootstrap은 dependency 설치와 build를 수행하므로, 초기 실행 시간이 길 수 있다.

# Checklist summary

- Plan written: done
- Plan verified before implementation: done
- Add Claude marketplace manifests: done
- Add plugin bootstrap runner: done
- Update Claude skills for plugin-safe execution: done
- Update README with marketplace install and flow clarification: done
- Run verification commands: done
- Update changelog: done
- Result documented: done

# Lessons

- plugin marketplace 지원은 manifest 추가만으로 끝나지 않는다. 설치된 plugin cache 안에서 실제 runtime bootstrap path가 있는지까지 함께 설계해야 한다.
