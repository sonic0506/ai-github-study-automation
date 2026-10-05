# Hermes Agent 설치와 첫 사용

> 설치 방법을 고르는 기준, 공급자·모델 설정, 설정 파일 구조, 가장 간단한 첫 실행, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

설치 방법은 "어디서, 어떤 화면으로 쓸 것인가"로 고릅니다.

| 상황 | 설치 방법 | 업데이트 방법 |
|---|---|---|
| macOS(Apple Silicon)·Windows에서 앱으로 쓰고 싶다 | 공식 사이트의 Hermes Desktop 설치 파일 | 앱의 업데이트 기능 |
| 터미널만 쓰거나 Linux·WSL2 서버에 둔다 | 소스 설치 스크립트 (아래) | `hermes update` |
| 서버에 상주 게이트웨이로 띄운다 | Docker 이미지 `nousresearch/hermes-agent` | 이미지 pull 후 컨테이너 재생성 |
| Android 휴대폰(aarch64) | Termux용 서명된 APT 저장소 | `pkg upgrade hermes-agent` |

**Linux / macOS / WSL2 (터미널 전용 설치)**

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc   # zsh라면 source ~/.zshrc
```

**Windows (네이티브, PowerShell)**

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

설치 스크립트는 소스를 `~/.hermes/hermes-agent/`에 내려받고, 고정된 버전의 `uv`를 받은 뒤, Hermes 자체 패키지 관리자(PM)에게 Python 3.14, Node.js, ripgrep, FFmpeg, 브라우저 자동화 도구 설치를 맡깁니다. 시스템에 이미 있는 Python·Node 버전을 그대로 쓰지 않는다는 점이 특징입니다. 브라우저 도구가 필요 없으면 `--skip-browser`로 뺄 수 있고, 이 선택은 이후 업데이트에서도 유지됩니다.

| 설치 방식 | 코드 위치 | 사용자 데이터 |
|---|---|---|
| POSIX 소스 스크립트 | `~/.hermes/hermes-agent/` | `~/.hermes/` |
| Windows 소스 스크립트 | `%LOCALAPPDATA%\hermes\hermes-agent\` | `%LOCALAPPDATA%\hermes\` |
| Docker | `/opt/hermes/` | 마운트한 `/opt/data/` |

`HERMES_HOME` 환경 변수로 사용자 데이터 위치를 바꿀 수 있습니다.

---

## 기본 설정

### 1. 공급자와 모델 고르기

가장 중요한 설정 단계입니다.

```bash
hermes setup          # 전체 마법사 (처음이라면 이것부터)
hermes model          # 공급자·모델만 고르기
```

`hermes setup`은 세 가지 모드를 제공합니다.

- **Quick Setup (Nous Portal)**: OAuth 로그인 한 번으로 모델과 웹 검색·이미지 생성·TTS·클라우드 브라우저(Tool Gateway)를 함께 설정합니다. 구독 비용이 듭니다.
- **Full Setup**: 공급자·도구·옵션을 하나씩 직접 고르고, 키도 직접 넣습니다.
- **Blank Slate**: 모델, 파일 도구, 터미널 도구만 켜고 나머지(웹, 메모리, Skill, 크론, MCP 등)를 모두 끈 상태에서 시작합니다. 무엇이 켜져 있는지 완전히 통제하고 싶을 때 씁니다.

로컬 모델을 쓴다면 `hermes model`에서 Custom endpoint를 고르고 OpenAI 호환 주소를 넣습니다.

```yaml
# ~/.hermes/config.yaml
model:
  default: qwen3.5:27b
  provider: custom
  base_url: http://localhost:11434/v1
```

### 2. 설정 파일 구조 이해하기

Hermes는 비밀값과 일반 설정을 파일로 분리합니다.

```text
~/.hermes/
├── .env                # API 키, 봇 토큰 같은 비밀값
├── config.yaml         # 모델, 도구, 메모리, 승인 정책 같은 일반 설정
├── SOUL.md             # 에이전트 정체성·말투 (선택)
├── memories/           # MEMORY.md, USER.md
├── skills/             # 설치·생성된 Skill
├── cron/               # 예약 작업 정의와 실행 결과
├── state.db            # 세션 기록 (SQLite + FTS5)
└── profiles/           # 추가 프로필
```

값을 넣을 때는 `hermes config set`을 쓰면 키 이름을 보고 알맞은 파일에 저장해 줍니다.

```bash
hermes config set model anthropic/claude-opus-4.7
hermes config set terminal.backend docker
hermes config set OPENROUTER_API_KEY sk-or-...   # 비밀값은 .env 로 들어감
hermes config get terminal.backend
```

---

## 가장 간단한 예제

저장소 디렉터리에서 Hermes를 실행합니다.

```bash
cd ~/code/my-api
hermes --tui      # 새 TUI (권장). 기존 CLI는 그냥 hermes
```

```text
이 저장소를 5줄로 요약하고, 메인 진입점이 어디인지 알려 줘.
```

1. **무엇을 생성하는가**: 세션이 하나 만들어지고, 시작 배너에 선택한 모델·사용 가능한 도구·Skill 수가 표시됩니다. 현재 디렉터리에 `AGENTS.md`나 `CLAUDE.md`가 있으면 시스템 프롬프트에 함께 들어갑니다.
2. **어떤 값을 전달하는가**: 입력한 문장과 현재 작업 디렉터리, 그리고 조립된 시스템 프롬프트(정체성, 규칙 파일, Skill 목록, 메모리 스냅샷)가 모델에게 전달됩니다.
3. **Hermes가 무엇을 처리하는가**: 모델이 `search_files`, `read_file`, `terminal` 같은 도구를 호출하면 Hermes가 실행해 결과를 돌려주고, 이 과정을 답이 나올 때까지 반복합니다. 도구 실행 과정은 화면에 실시간으로 표시되고, 진행 중에 새 메시지를 보내면 방향을 바꿀 수 있습니다.
4. **어떤 결과를 반환하는가**: 최종 요약이 출력되고 대화는 `~/.hermes/state.db`에 저장됩니다. `hermes -c`로 마지막 세션을 이어 갈 수 있습니다.

첫 대화가 잘 되면 세션 이어 가기를 확인합니다.

```bash
hermes -c                 # 가장 최근 세션 이어 가기
hermes sessions list      # 저장된 세션 목록
```

자주 쓰는 슬래시 명령은 다음과 같습니다. 터미널과 메신저에서 대부분 똑같이 동작합니다.

| 명령 | 하는 일 |
|---|---|
| `/new` | 새 세션 시작 (메모리 스냅샷을 다시 읽는 시점) |
| `/model [provider:model]` | 세션 도중 모델 변경 |
| `/compress`, `/usage` | 컨텍스트 압축, 토큰 사용량 확인 |
| `/skills`, `/<skill-name>` | Skill 목록 보기, 특정 Skill로 작업 시작 |
| `/plan [요청]` | 실행하지 않고 구현 계획만 `.hermes/plans/`에 작성 |
| `/retry`, `/undo` | 마지막 턴 다시 시도, 되돌리기 |

공식 퀵스타트의 원칙도 기억해 둘 만합니다. **평범한 대화가 한 번 제대로 되기 전에는 게이트웨이, 크론, Skill, 라우팅 같은 기능을 더 얹지 말라**는 것입니다.

---

## 설치할 때 주의할 점

- **최소 컨텍스트 64K**: 컨텍스트 창이 64,000 토큰보다 작은 모델은 시작 단계에서 거부됩니다. Ollama라면 `num_ctx`를 64K 이상으로 올리고, Hermes에도 같은 값을 알려 줘야 합니다(Ollama가 보고하는 값은 최대치일 뿐 실제 설정값이 아닙니다).
- **`hermes: command not found`**: 셸을 다시 읽거나(`source ~/.bashrc`) `~/.local/bin`이 `PATH`에 있는지 확인합니다.
- **Python 버전**: 현재 공식 설치는 Python 3.14에서 돌아갑니다. `pyproject.toml`의 `>=3.11` 범위는 오래된 설치가 업데이트 단계를 통과하기 위한 것이지, 3.11~3.13 지원을 약속하는 것이 아닙니다.
- **PyPI 패키지로 설치하지 않습니다**: PyPI에 같은 이름의 `hermes-agent` 패키지가 있지만 2026년 10월 기준 0.19.0에 머물러 있어, 현재 버전(0.21.x)과 차이가 큽니다. 공식 문서가 안내하는 설치 경로를 씁니다.
- **Windows 백신 오탐**: `%LOCALAPPDATA%\hermes\bin\uv.exe`를 악성으로 격리하는 경우가 있습니다. Astral의 `uv` 바이너리이므로, 공식 README의 방법으로 진위를 확인한 뒤 파일 해시가 아니라 **폴더**를 예외 처리합니다(업데이트마다 해시가 바뀝니다).
- **macOS Intel 미지원**: 데스크톱 설치 파일은 Apple Silicon 전용입니다.
- **Nix는 최선 노력 지원**: 예전 문서에는 Nix가 정식 경로로 나오지만, 지금은 명시적 지원 대상이 아닙니다.
- **설정이 꼬였을 때**: `hermes doctor`가 무엇이 빠졌는지 알려 줍니다. 업데이트 후 설정 항목이 맞지 않으면 `hermes config check` → `hermes config migrate` 순서로 확인합니다. 데이터 폴더(`~/.hermes`)를 지우는 것은 복구 방법이 아닙니다.
- **설치 스크립트를 파이프로 바로 실행하는 방식**이 기본 경로입니다. 사내 정책상 검토가 필요하면 스크립트를 먼저 내려받아 읽은 뒤 실행하거나, 버전 태그가 붙은 Docker 이미지를 씁니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 터미널 코딩 에이전트 →](03-usage-coding-workflow.md)
