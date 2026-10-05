# Cua 활용 예시 ① 내 컴퓨터의 앱을 에이전트에게 맡기기

> Claude Code에 Cua Driver를 붙여 API 없는 데스크톱 앱에 데이터를 입력하고 검증하는 과정과, 같은 작업을 사람 없이 돌릴 때 권한을 좁혀 실행하는 방법을 다룹니다.

## 예제 1. 경비 내역을 데스크톱 정산 앱에 입력하기

### 요구사항

> `~/expenses/2026-09.csv`에 있는 경비 내역을 사내 정산 앱 "Expense Desk"의 입력 폼에 한 건씩 등록한다. 각 건은 날짜·거래처·금액·계정과목 네 칸이다. 저장 후 목록 화면에 그 건이 실제로 나타났는지 확인하고, 확인되지 않은 건은 건너뛰지 말고 보고한다. 담당자는 그동안 같은 Mac에서 다른 일을 한다.

### 구현

[설치와 첫 사용](02-getting-started.md)에서 Claude Code에 Cua Driver를 등록하고 Skill을 설치했다고 가정합니다. 작업 지시는 "무엇을"과 "어떻게 확인할지"를 함께 적습니다.

```text
Cua Driver로 Expense Desk 앱을 조작해줘.

1. ~/expenses/2026-09.csv 를 읽어 각 행을 입력한다.
2. 행마다: 새 항목 폼을 열고 날짜, 거래처, 금액, 계정과목을 입력한 뒤 저장한다.
3. 저장 후 목록 창의 새 스냅샷에서 해당 거래처와 금액이 보이는지 verify_state로 확인한다.
4. 확인이 unsatisfied 또는 unknown이면 같은 행을 다시 입력하지 말고, 그 행 번호와 이유를 기록한 뒤 다음 행으로 넘어간다.
5. 백그라운드로만 조작하고, 포그라운드가 필요하면 멈추고 나에게 물어본다.
6. 작업 전체를 ~/cua-runs/2026-09 에 녹화한다.
```

에이전트는 Skill의 절차에 따라 다음과 같은 도구 호출을 이어 갑니다. 아래는 그중 한 건을 CLI 형태로 옮긴 것입니다(실제 ID와 토큰은 매번 응답에서 받은 값을 씁니다).

```bash
# 녹화 시작 (요청했을 때만)
cua-driver start_recording '{"output_dir":"~/cua-runs/2026-09","record_video":false}'

# 대상 앱과 창 확정: 첫 번째 항목을 무작정 고르지 않고 제목으로 고른다
cua-driver list_apps '{}'
cua-driver list_windows '{"pid":5120}'

# 입력 폼 관찰: 필요한 요소만 query로 추린다
cua-driver get_window_state '{"pid":5120,"window_id":88,"query":"금액","session":"exp-0901"}'

# 같은 스냅샷의 토큰으로 입력 (백그라운드가 기본값)
cua-driver type_text '{"target":{"kind":"window","pid":5120,"window_id":88},"element_token":"s00000031:7","text":"52000","session":"exp-0901"}'

# 저장 버튼 클릭
cua-driver click '{"target":{"kind":"window","pid":5120,"window_id":88},"element_token":"s00000031:12","session":"exp-0901"}'

# 목록 창에서 결과 확인
cua-driver verify_state '{"pid":5120,"window_id":87,"expect":[{"element":{"selector":{"label_contains":"52,000"},"exists":true}}],"session":"exp-0901"}'
```

### 실행 흐름

```text
사용자: 작업 지시
 ↓
에이전트: CSV 읽기 (파일 도구, GUI 아님)
 ↓
Cua Driver: list_apps / list_windows로 Expense Desk의 정확한 pid, window_id 확정
 ↓
반복 (행마다)
  get_window_state → element_token 선택
  → type_text / click (background)
  → 응답의 effect 확인 (confirmed / unverifiable / refused)
  → verify_state로 목록 창에 반영됐는지 확인
  → satisfied면 다음 행, 아니면 기록 후 다음 행
 ↓
stop_recording → 결과 요약 보고
```

### 코드 설명

1. **CSV는 GUI로 열지 않습니다.** 파일 읽기는 에이전트의 파일 도구로 처리합니다. Cua 문서도 GUI 밖에서 끝낼 수 있는 일은 API·파일·CLI로 하라고 권합니다. GUI는 꼭 필요한 입력 단계에만 씁니다.
2. **대상을 매 행동마다 정확히 지정합니다.** `target`에 `pid`와 `window_id`를 함께 넣습니다. 세션(`session`)은 수명 관리용 이름표일 뿐, 어느 창을 조작할지 정해 주지 않습니다.
3. **토큰은 방금 본 스냅샷의 것만 씁니다.** 저장 후 폼이 다시 그려지면 이전 토큰은 무효가 되므로 다음 행에서는 다시 관찰합니다.
4. **`effect`와 작업 성공은 다릅니다.** `type_text`가 `confirmed`를 돌려줘도 그것은 "값이 입력창에 들어갔다"까지입니다. "저장되어 목록에 나타났다"는 `verify_state`로 따로 확인합니다.
5. **다시 입력하지 않는 규칙이 중요합니다.** 결과가 불확실한 상태에서 같은 행을 재입력하면 중복 경비가 생깁니다. Cua Skill 규칙도 "부분 실행·취소·결과 불명 행동을 자동으로 재생하지 말라"고 정합니다.

### 왜 이렇게 사용하는가?

이 작업의 위험은 "입력이 빗나가는 것"보다 **"잘못 입력됐는데 성공했다고 믿는 것"**입니다. 좌표 클릭 자동화는 이 둘을 구분할 수단이 없습니다. Cua를 쓰면 요소를 의미로 지정하고, 행동마다 결과 신호를 받고, 검증 도구로 앱의 실제 상태를 확인하는 세 겹의 장치가 생깁니다. 백그라운드 전달 덕분에 담당자는 그동안 같은 Mac에서 계속 일할 수 있고, 녹화된 trajectory로 나중에 문제 건을 재확인할 수 있습니다.

---

## 예제 2. 같은 작업을 사람 없이 돌리기

### 요구사항

> 매달 1일 새벽에 같은 입력 작업을 자동으로 실행한다. 사람이 지켜보지 않으므로 에이전트가 정산 앱 이외의 앱을 건드리거나, 입력 폴더 밖의 파일을 읽을 수 없어야 한다.

### 구현

에이전트는 Claude Agent SDK로 띄우고, Cua Driver는 `bounded` 모드로 실행합니다. Windows·Linux에서는 MCP 서버 설정의 `env`로 권한 모드를 넘깁니다. macOS에서는 MCP 프로세스가 `CuaDriver.app` 데몬을 거치므로, 데몬을 같은 모드로 띄워 두어야 합니다.

```yaml
# /etc/cua/expense-agent.yaml
version: 3
expires_after: 2h
idle_timeout: 15m

allow:
  tools:
    - start_session
    - end_session
    - list_apps
    - list_windows
    - launch_app
    - get_window_state
    - click
    - type_text
    - verify_state

resources:
  apps:
    - executable: /opt/expense-desk/expense-desk
      launch: true
      windows: all
      terminate: driver_launched
  files:
    read:
      - dir: /data/expenses
        recursive: true
```

```python
# run_monthly.py  (pip install claude-agent-sdk)
import anyio
from claude_agent_sdk import ClaudeAgentOptions, query

CUA_TOOLS = [
    "list_apps", "list_windows", "launch_app", "get_window_state",
    "click", "type_text", "verify_state", "start_session", "end_session",
]

options = ClaudeAgentOptions(
    mcp_servers={
        "cua-driver": {
            "type": "stdio",
            "command": "/home/ops/.local/bin/cua-driver",  # command -v cua-driver 로 확인한 절대 경로
            "args": ["mcp"],
            "env": {
                "CUA_DRIVER_PERMISSION_MODE": "bounded",
                "CUA_DRIVER_CAPABILITY_MANIFEST_FILE": "/etc/cua/expense-agent.yaml",
                "CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED": "1",
            },
        }
    },
    # 에이전트가 쓸 수 있는 도구를 Cua 도구와 파일 읽기로 제한한다
    allowed_tools=[f"mcp__cua-driver__{name}" for name in CUA_TOOLS] + ["Read"],
)

PROMPT = """/data/expenses/2026-09.csv 의 각 행을 Expense Desk에 입력하라.
행마다 저장 후 verify_state로 목록 반영을 확인하고, 확인되지 않은 행은 재입력하지 말고 보고하라.
포그라운드 전달이 필요하면 그 행을 건너뛰고 보고하라."""

async def main():
    async for message in query(prompt=PROMPT, options=options):
        print(message)

anyio.run(main)
```

### 왜 이렇게 사용하는가?

사람이 보고 있을 때는 이상한 행동을 바로 멈출 수 있지만, 무인 실행에서는 그럴 수 없습니다. 그래서 통제 지점을 두 곳에 둡니다.

- **에이전트 쪽(`allowed_tools`)**: 모델이 셸이나 쓰기 도구를 호출하지 못하게 합니다.
- **Driver 쪽(`bounded` 매니페스트)**: 설령 에이전트 설정이 바뀌어도, Driver 자체가 매니페스트에 없는 앱·도구·파일을 거부합니다. 매니페스트는 기본 거부(deny-by-default)이고 만료 시간도 있습니다.

프롬프트로 "다른 앱은 건드리지 마"라고 쓰는 것은 부탁이지만, 매니페스트는 실행 계층의 강제입니다. 두 장치를 함께 두는 것이 무인 에이전트의 기본 형태입니다.

---

## 함께 알아 두면 좋은 기능

- **Claude Code 호환 모드**: Claude Code의 이미지 기반 컴퓨터 사용 흐름이 Driver의 창 스크린샷을 쓰게 하려면 `cua-driver mcp --claude-code-computer-use-compat`으로 등록합니다. 이때 `screenshot` 도구는 `pid`와 `window_id`를 요구하고 그 창만 캡처합니다.
- **로그인된 브라우저 프로필**: 기본은 격리된 브라우저입니다. 이미 로그인된 Chrome·Edge 프로필에 붙이려면 `cua-driver mcp --grant existing-profile`처럼 명시적으로 허가해야 합니다.
- **녹화와 렌더링**: `start_recording`/`stop_recording`으로 남긴 기록은 `cua-driver recording render <dir> <out.mp4>`로 클릭 지점을 확대하는 데모 영상으로 바꿀 수 있습니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 애플리케이션 코드에서 샌드박스 다루기 →](04-usage-sandbox-sdk.md)
