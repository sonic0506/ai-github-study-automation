---
repository: yetone/magpie
url: https://github.com/yetone/magpie
stars: 3,759
studiedAt: 2026-10-01
status: draft
---

# yetone/magpie

magpie는 PC에 설치된 AI 코딩 에이전트와 각 에이전트의 모델 설정을 한 화면에 모아 바꾸게 하는 Go 도구입니다.
로컬 gateway가 OpenAI·Anthropic·Gemini API 사이를 변환해 주므로, Codex를 DeepSeek에, Claude Code를 Kimi에 붙이는 식으로 쓸 수 있습니다.

## 01. 어떤 문제를 푸는가

에이전트마다 설정 파일 위치와 형식이 달라서 모델을 바꾸려면 `settings.json`, `config.toml`, `config.yaml` 을 각각 고쳐야 합니다.
에이전트가 쓰는 API와 공급자가 제공하는 API가 다르면 그대로 연결할 수도 없습니다.
magpie는 설정 파일에서 해당 키만 고치고, 모든 에이전트가 로컬 gateway 하나를 바라보게 해서 두 문제를 함께 다룹니다.

- 저장소 설명은 "Every agent's model. One place. Codex on DeepSeek, Claude Code on Kimi, from the menu bar."[^s11]
- MIT 라이선스, 주 언어는 Go[^s1][^s11]
- 저장소 생성일은 2026-09-23. 2026-10-01 API 조회 시 Star 3805, 열린 issue 49건[^s11]
- topics : claude-code, codex, deepseek, gemini-cli, llm, macos[^s11]
- 배포 파일은 별도 저장소 yetone/magpie-releases에 올라가며, 2026-10-01 기준 Release 538개가 있음 (저장소 생성일 2026-09-23)[^s9]
- macOS 빌드는 서명·공증되어 있고, Windows와 Linux 빌드는 아직 서명되지 않음[^s1]
- 설치된 앱은 백그라운드에서 새 버전을 받아 재시작하거나 종료할 때 설치함. `magpie update`로도 갱신함[^s1]
- gateway 주소는 `MAGPIE_ADDR`로 바꿀 수 있고, `magpie serve`는 gateway만 실행함[^s1]
- Docker 이미지는 distroless 위의 터미널 전용 바이너리를 nonroot로 실행하고, 설정은 `/config` 볼륨에 둠[^s1]
- 하루 한 번 무작위 설치 id, 버전, OS·아키텍처를 PostHog로 보냄. `DO_NOT_TRACK=1` 또는 `MAGPIE_NO_STATS=1`로 끌 수 있고 소스 빌드는 보내지 않음[^s1]

## 02. 핵심 구조

- UI 세 가지 : 메뉴 막대 패널(창으로도 열림), 터미널 버전 `magpie tui`, 일반 CLI가 같은 화면·기능을 제공함[^s1]
- 데스크톱 앱 : Wails로 시스템 webview를 써서 별도 런타임을 번들하지 않음. 데스크톱 포함 15 MB 미만, 터미널 전용 빌드 7 MB. macOS, Linux, Windows 지원[^s1]
- 설정 편집기 : 바꾼 키 하나만 수정하고 주석·순서·들여쓰기를 보존함. 쓰기는 atomic으로 처리함[^s1]
- 로컬 gateway : `127.0.0.1:3425`에서 OpenAI chat completions, OpenAI Responses, Anthropic Messages, Gemini API를 받아 모델을 제공하는 공급자로 전달함. 공급자가 같은 API를 쓰면 그대로 통과시키고, 다르면 스트리밍·tool call·reasoning까지 변환함[^s1]
- 모델 카탈로그 : 키가 있으면 공급자에게 모델 목록을 직접 묻고, models.dev 카탈로그로 이름·reasoning effort·목록 없는 공급자를 보완함. 모델 이름은 `provider/model` 형식[^s1]
- Claude 구독 브리지 : Claude 구독 요청은 로컬 `claude` 바이너리를 직접 구동해 처리하고, 호출한 에이전트의 도구는 MCP로 연결함. Claude Code 설치·로그인이 필요함[^s1]
- 내부 패키지 : `internal/` 아래 agent, gateway, provider, catalog, claudebridge, plugin, profile, tui, gui, usage, davsync, backup 등 패키지로 나뉨[^s10]
- 의존성 : Go 1.26.3, TUI는 charmbracelet의 bubbletea·bubbles·lipgloss 사용[^s7]

## 03. 주요 기능

- 에이전트 모델 전환 : Claude Code, Codex, Gemini CLI, OpenCode, Pi, Goose, Cursor CLI, Copilot CLI, Crush, Kimi Code, Droid, Cline 등 표에 오른 에이전트의 model·effort·small 같은 필드를 바꿈. 설치되었거나 설정된 에이전트만 표시함[^s1]
- 공급자 프리셋 : Anthropic, OpenAI, Gemini, DeepSeek, Kimi, GLM, Qwen, Mistral, Groq, OpenRouter, Ollama, LM Studio 등 프리셋은 키만 넣으면 됨. 사용자 정의 공급자는 이름과 base URL만 필요함. 셸 환경 변수의 키는 읽지 않음[^s1]
- 구독 공유 : Claude Code, Codex(ChatGPT), Copilot, Devin, Qoder에 로그인해 두면 그 로그인이 공급자로 나타나 다른 에이전트도 gateway를 통해 해당 모델을 씀. 키를 복사하지 않고 에이전트의 자격 증명을 매번 읽음[^s1]
- Routing group : 여러 모델을 `group/<id>` 하나로 묶음. `routing=`은 `smart`(기본값), `order`, `rotate`, `usage`, `stays=`는 `auto`(기본값), `session`, `turn`, `off`[^s1]
- Profile : 모든 에이전트 설정을 이름으로 저장(`magpie save work`)하고 한 번에 되돌림(`magpie use work`)[^s1]
- Plugin : OpenCode 공급자 plugin(npm 패키지의 `auth` hook)을 Bun 위에서 실행해 magpie가 직접 로그인하지 않는 구독을 공급자로 씀. Bun은 plugin이 처음 필요할 때 내려받음[^s1]
- 비용 계산 : 호출을 effective price로 계산함. 순서는 모델별 가격 → `<provider id>/*` 가격 → 공급자 카탈로그 → models.dev. 단위는 USD per million tokens이고 input, output, cache read, cache write 네 값을 받음[^s1]
- Context window·출력 한도 지정 : `magpie model context`, `magpie model output`으로 지정함. window의 95%에 이르면 routing group 안에서 더 큰 window의 멤버로 요청을 옮김[^s1]
- Import link : `magpie://import?...` 또는 `https://usemagpie.ai/import#...` 링크로 공급자를 추가함. 항상 확인 후 저장하고, fragment 방식이라 키가 usemagpie.ai 서버를 거치지 않는다고 함[^s1][^s2]
- 원격 magpie 공유 : Settings → Share on local network로 한 magpie를 여러 컴퓨터가 공급자(`remote-magpie`)로 씀. 공급자·routing group·사용량은 공유 쪽 것을 씀[^s1]
- 백업·동기화 : `magpie backup`은 AES-256-GCM(PBKDF2-SHA256)으로 암호화함. WebDAV 또는 S3 호환 저장소에 3분마다 동기화하고 conditional write로 충돌을 병합함[^s1]

## 04. 시작하기

```bash
curl -fsSL https://usemagpie.ai/install.sh | sh
# 또는 소스에서 설치
go install github.com/yetone/magpie@latest
```

```bash
magpie                                  # 앱 실행: 창 + 메뉴 막대 아이콘
magpie tui                              # 같은 화면을 터미널에서
magpie ls                               # 에이전트별 현재 설정 목록

magpie provider add deepseek sk-…       # 프리셋 공급자는 키만 있으면 됨
magpie provider add ollama              # 로컬 서버는 키가 필요 없음
magpie provider test deepseek           # API마다 작은 요청 하나로 지연 시간 확인
magpie models                           # 에이전트가 보는 카탈로그

magpie claude deepseek/deepseek-chat    # Claude Code를 DeepSeek 모델로
magpie codex deepseek/deepseek-chat     # Codex도 gateway를 거쳐 같은 모델로
magpie codex effort high                # 모델 외 필드 변경

magpie save work                        # 현재 설정을 profile로 저장
magpie use work                         # profile로 되돌리기

# 다른 도구에서 gateway 직접 쓰기 (키 값은 아무거나 됨)
export OPENAI_BASE_URL=http://127.0.0.1:3425/v1
export OPENAI_API_KEY=magpie
```

설치와 예제는 공식 문서 기준입니다.[^s1]

## 05. 최근 변화

- v0.1.550 (2026-09-30)[^s3]
    - 공급자 스트리밍 응답이 중간에 끊겼을 때 완료로 처리하던 문제 수정. 오류를 알리고 재시도함
    - API 키로 Kiro를 되돌릴 때 멈추던 문제 수정
    - 강제 종료된 magpie가 남긴 lock 파일이 15분간 이동을 막던 문제 수정
    - 터미널에서 바꾼 plugin 변경을 실행 중인 앱이 반영하지 않던 문제 수정
- v0.1.549 (2026-09-30)[^s4]
    - dsh 연동이 DeepSeek 공급자를 덮어쓰지 않고 Magpie를 별도 공급자로 추가하도록 수정
    - plugin과 내장 공급자 간 계정 이동 시 만료된 로그인이 만료 상태로 남도록 수정
- v0.1.548 (2026-09-30)[^s5]
    - Antigravity 사용량을 모델마다가 아니라 모델 계열(Gemini, Claude, GPT-OSS)별 quota meter 하나로 표시
    - 개별 모델 meter를 잠시 보여 주는 "Every model" 옵션 추가

## 06. 커뮤니티에서 반복되는 주제

- Claude 구독 브리지에서 `StructuredOutput`으로 끝나는 sub-agent가 `claude -p` 프로세스를 30분간 남겨, workflow fan-out 시 백 개 넘게 쌓이고 10–20 GB 메모리를 쓴다는 보고 (#345, 열림)[^s8]
- Claude Code의 effort(reasoning 강도) 설정이 모델별로 반영되지 않는다는 버그가 여러 건 올라왔다가 닫힘 (#351, #353, #354)[^s6]
- API 변환 경로에서 metadata가 빠지는 문제 보고 (#359 WebSearch 403, 닫힘 / #374 Codex `client_metadata` 누락, 열림)[^s6]
- 새 에이전트·모델 지원 요청이 계속 들어옴 (MiniMax Code #362 닫힘, Proma #346 열림, Grok imagine #367 닫힘)[^s6]
- DeepSeek Messages 스트림이 `message_stop` 전에 끝나는 문제 (#370, 열림), Copilot Student 계정에서 모델 400 오류 (#371, 열림)[^s6]
- 이슈 대부분이 중국어로 작성되어 있음 (2026-10-01 기준 최근 20건 목록)[^s6]

## 07. 한계와 주의점

- 에이전트는 시작할 때 설정을 읽으므로 실행 중인 세션은 새 세션을 열기 전까지 기존 모델을 유지함. Codex는 전환 후 재시작이 필요함[^s1]
- gateway는 공유 전에는 어떤 키든 받으므로 Docker에서 포트를 모든 인터페이스에 열면 방화벽을 넘어 노출될 수 있음. README는 loopback에만 publish하라고 안내함[^s1]
- Claude 구독 사용은 로컬 Claude Code 설치·로그인이 필요함. Antigravity 계정은 외부 사용 시 Google이 정지할 수 있어 잃어도 되는 계정을 쓰라고 README가 경고함[^s1]
- Gemini CLI 로그인은 개인 계정에 더 이상 제공되지 않고 Gemini Code Assist Standard·Enterprise만 되며 Google Cloud 프로젝트 지정이 필요함[^s1]
- 비용은 읽을 때 다시 계산하는 추정치이고, 사용 기록에 키·계정이 남지 않아 계정별로 요금이 다른 공급자는 정확히 계산할 수 없음[^s1]
- Import link에 키를 넣는 것은 그 사용자만 보는 페이지에서만 하라고 문서가 경고함[^s2]

## 08. 더 알아볼 것

- Release가 2026-09-23 이후 538개로 매우 잦음. 안정 버전이나 버전 정책이 따로 있는지는 확인하지 못함
- gateway의 API 변환 범위(어떤 파라미터가 빠지는지)를 정리한 공식 문서가 README 외에 있는지 확인하지 못함
- Claude 구독을 다른 에이전트에서 쓰는 방식이 Anthropic 이용 약관상 허용되는지는 공개 자료에서 확인하지 못함
- 변환 경로의 지연 시간·처리량 수치는 공개 자료에서 찾지 못함

## 참고 자료

- [README](https://github.com/yetone/magpie#readme) (readme)
- [Import links](https://usemagpie.ai/docs/import) (docs)
- [magpie v0.1.550](https://github.com/yetone/magpie-releases/releases/tag/v0.1.550) (release)
- [magpie v0.1.549](https://github.com/yetone/magpie-releases/releases/tag/v0.1.549) (release)
- [magpie v0.1.548](https://github.com/yetone/magpie-releases/releases/tag/v0.1.548) (release)
- [Issues](https://github.com/yetone/magpie/issues) (issues)
- [go.mod](https://github.com/yetone/magpie/blob/main/go.mod) (code)
- [Issue #345 Claude 订阅桥接 claude -p 进程堆积](https://github.com/yetone/magpie/issues/345) (issues)
- [yetone/magpie-releases Releases](https://github.com/yetone/magpie-releases/releases) (release)
- [internal/](https://github.com/yetone/magpie/tree/main/internal) (code)
- [Repository](https://github.com/yetone/magpie) (code)

[^s1]: [README](https://github.com/yetone/magpie#readme)
[^s2]: [Import links](https://usemagpie.ai/docs/import)
[^s3]: [magpie v0.1.550](https://github.com/yetone/magpie-releases/releases/tag/v0.1.550)
[^s4]: [magpie v0.1.549](https://github.com/yetone/magpie-releases/releases/tag/v0.1.549)
[^s5]: [magpie v0.1.548](https://github.com/yetone/magpie-releases/releases/tag/v0.1.548)
[^s6]: [Issues](https://github.com/yetone/magpie/issues)
[^s7]: [go.mod](https://github.com/yetone/magpie/blob/main/go.mod)
[^s8]: [Issue #345 Claude 订阅桥接 claude -p 进程堆积](https://github.com/yetone/magpie/issues/345)
[^s9]: [yetone/magpie-releases Releases](https://github.com/yetone/magpie-releases/releases)
[^s10]: [internal/](https://github.com/yetone/magpie/tree/main/internal)
[^s11]: [Repository](https://github.com/yetone/magpie)
