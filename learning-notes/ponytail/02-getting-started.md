# Ponytail 설치와 첫 사용

> 에이전트별 설치 방법, 기본 강도 설정, 가장 간단한 첫 실행, 설치와 제거에서 자주 겪는 문제를 다룹니다.

## 설치

Claude Code·Codex 플러그인과 Cursor Hook은 Node.js로 작성된 작은 라이프사이클 Hook을 실행하므로 `node`가 **비대화형 셸의 PATH**에 있어야 합니다. nvm이나 Nix처럼 대화형 셸 설정에서만 PATH를 잡는 경우 특히 확인이 필요합니다. Node가 없어도 Skill 자체는 동작하지만, Hook이 호출될 때마다 `node: command not found` 오류가 보이고 자동 활성화가 빠집니다.

**Claude Code**

두 명령을 **각각 별도의 프롬프트로** 보내야 설치됩니다.

```text
/plugin marketplace add DietrichGebert/ponytail
```

```text
/plugin install ponytail@ponytail
```

Claude Code Desktop 앱의 Code 탭에서도 같은 명령을 입력하거나, 입력창 옆 **+** → **Plugins** → **Add plugin**으로 설치할 수 있습니다. CodeBuddy와 ZCode도 Claude 형식 플러그인을 그대로 읽으므로 같은 방법으로 설치합니다.

**Codex**

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

설치 후 `codex`를 실행해 `/hooks`에서 두 Hook을 검토하고 신뢰(trust)한 다음 새 스레드를 시작해야 합니다. Codex에서는 명령이 Skill로 노출되므로 `$ponytail-review`처럼 호출합니다.

**GitHub Copilot CLI**

```bash
copilot plugin marketplace add DietrichGebert/ponytail
copilot plugin install ponytail@ponytail
```

Copilot CLI는 플러그인 이름으로 명령을 묶기 때문에 `/ponytail:ponytail ultra`, `/ponytail:ponytail-review`처럼 씁니다.

**OpenCode**

```json
// opencode.json (OpenCode 2)
{ "plugins": ["@dietrichgebert/ponytail"] }
```

OpenCode 1은 예전 키 이름을 씁니다: `{ "plugin": ["@dietrichgebert/ponytail"] }`. OpenCode 2 지원은 v4.10.1에서 추가되었습니다.

**Cursor**

```bash
git clone https://github.com/DietrichGebert/ponytail
node ponytail/scripts/cursor-hooks.js install            # ~/.cursor/hooks.json 에 병합
node ponytail/scripts/cursor-hooks.js install --project  # 프로젝트 .cursor/hooks.json 에 병합
```

설치된 Hook은 clone한 위치의 스크립트를 실행하므로, 폴더를 옮기면 다시 `install`해야 합니다.

**그 밖의 에이전트**

```bash
gemini extensions install https://github.com/DietrichGebert/ponytail   # Gemini CLI
pi install git:github.com/DietrichGebert/ponytail                       # pi
hermes plugins install DietrichGebert/ponytail --enable                 # Hermes Agent
grok plugin install DietrichGebert/ponytail --trust                     # Grok Build (설치 후 활성화 필요)
```

규칙 파일만 읽는 에이전트는 저장소의 해당 파일을 프로젝트에 복사합니다.

| 에이전트 | 복사할 파일 |
|---|---|
| Windsurf | `.windsurf/rules/ponytail.md` |
| Cline | `.clinerules/ponytail.md` |
| Kiro | `.kiro/steering/ponytail.md` |
| GitHub Copilot Chat(에디터 확장) | `.github/copilot-instructions.md` |
| Zed, Amp, Jules, VS Code Codex 확장 등 | `AGENTS.md` |

## 기본 설정

설정 파일은 필수가 아닙니다. 아무것도 하지 않으면 `full` 강도로 시작합니다. 새 세션의 기본 강도를 바꾸고 싶을 때만 아래 중 하나를 씁니다.

```bash
# 1) 환경 변수 (가장 우선)
export PONYTAIL_DEFAULT_MODE=lite   # off | lite | full | ultra
```

```json
// 2) ~/.config/ponytail/config.json  (Windows: %APPDATA%\ponytail\config.json)
{ "defaultMode": "lite" }
```

```text
# 3) 대화 중 명령으로 기본값 저장 (위 config.json에 기록됨)
/ponytail default lite
```

서브에이전트 주입 범위를 좁히려면 `PONYTAIL_SUBAGENT_MATCHER`를 씁니다. 서브에이전트의 `agent_type`에 대해 대소문자를 구분하지 않는 정규식으로 검사하며, 설정하지 않으면 모든 서브에이전트에 주입합니다.

```bash
# general-purpose 에이전트에만 주입하고, 읽기 전용 탐색 에이전트에는 주입하지 않기
export PONYTAIL_SUBAGENT_MATCHER='^general'
```

## 가장 간단한 예제

Claude Code에서 플러그인을 설치하고 새 세션을 연 뒤, 평소처럼 요청합니다.

```text
회원가입 폼에 생년월일 입력 칸을 추가해 줘. 만 14세 미만은 가입할 수 없어.
```

1. **무엇을 생성하는가**: 에이전트는 기존 폼 컴포넌트를 먼저 읽고, 날짜 선택기 라이브러리 대신 `<input type="date">`와 `max` 속성을 쓴 몇 줄짜리 변경을 만듭니다.
2. **어떤 값을 전달하는가**: 사용자가 입력한 요청과 현재 저장소 코드가 입력입니다. 규칙은 세션 시작 때 이미 컨텍스트에 들어와 있으므로 따로 지시할 필요가 없습니다.
3. **Ponytail이 무엇을 처리하는가**: 규칙상 "만 14세 미만 금지"는 신뢰 경계의 검증이므로 줄이는 대상이 아닙니다. 브라우저 속성은 사용자가 우회할 수 있으므로, 서버에 이미 검증 계층이 있다면 그곳에도 같은 조건이 들어가야 합니다. 사다리는 코드를 줄이지만 검증은 줄이지 않습니다. 다만 이것은 모델이 따르는 지시이지 강제가 아니므로, 결과물에서 서버 검증이 빠졌는지는 직접 확인해야 합니다.
4. **어떤 결과를 반환하는가**: 코드 변경이 먼저 나오고, 끝에 "생략: 커스텀 달력 UI, 추가 시점: 디자인 요구가 생길 때" 같은 한두 줄이 붙습니다.

강도를 바꾸거나 상태를 확인하는 명령은 다음과 같습니다.

```text
/ponytail            # 꺼져 있으면 기본 강도로 켜고, 켜져 있으면 현재 강도만 표시
/ponytail ultra      # 이번 세션 강도 변경
/ponytail off        # 끄기 ("stop ponytail" 또는 "normal mode"도 같은 효과)
/ponytail-help       # 명령 요약
```

플러그인이 처음 실행될 때 Claude Code에서는 "상태 표시줄(statusline)에 `[PONYTAIL]` 배지를 설정할까요?"라는 제안이 한 번 나올 수 있습니다. 수락하면 `~/.claude/settings.json`에 `statusLine` 항목이 추가됩니다.

---

## 설치할 때 주의할 점

- **Claude Code 설치 명령은 두 번에 나눠 보냅니다.** 한 프롬프트에 두 줄을 넣으면 설치가 완료되지 않습니다.
- **Codex는 Hook 신뢰 단계를 빼먹기 쉽습니다.** `/hooks`에서 신뢰하지 않으면 규칙이 자동 주입되지 않습니다. 또 v4.10.2~v4.10.3에서는 루트 `plugin.json`의 한 줄 때문에 Codex, VS Code, Qwen이 Ponytail을 Hook 없는 Skill 전용 플러그인으로 읽어 규칙이 모델에 전달되지 않았습니다. 이 구간을 설치했다면 v4.11.0 이상으로 업데이트해야 합니다.
- **Cursor는 규칙 파일과 Hook 중 하나만 씁니다.** 작업 공간에 `.cursor/rules/ponytail.mdc`가 있으면 Hook은 규칙을 주입하지 않고 안내만 하며, 강도 전환도 되지 않습니다. Hook으로 강도를 관리하려면 규칙 파일을 지웁니다.
- **OpenCode 설정 키는 버전마다 다릅니다.** OpenCode 2는 `plugins`, OpenCode 1은 `plugin`입니다. OpenCode 2에서 체크아웃 경로를 쓸 때는 파일이 아니라 디렉터리(`./.opencode/plugins`)를 지정해야 합니다.
- **제거는 순서가 중요합니다.** 호스트의 제거 명령은 플러그인 파일만 지우고 모드 파일(`~/.claude/.ponytail-active`), `~/.config/ponytail/config.json`, statusLine 항목은 남깁니다. 이를 지우는 `node scripts/uninstall.js`도 플러그인 파일이므로, **호스트 제거 명령보다 먼저** 실행하거나 별도로 clone한 저장소에서 실행해야 합니다.

```bash
# 정리 스크립트 먼저 (별도 clone에서 실행해도 됨)
node ponytail/scripts/uninstall.js
```

```text
# 그 다음 Claude Code에서 플러그인 제거
/plugin remove ponytail
```

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 프론트엔드 기능 개발 →](03-usage-frontend.md)
