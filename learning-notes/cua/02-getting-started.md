# Cua 설치와 첫 사용

> 무엇을 설치할지 고르는 기준, Cua Driver와 Cua SDK의 설치·권한 설정, 에이전트 연결, 가장 간단한 첫 실행, 설치할 때 자주 겪는 문제를 다룹니다.

## 무엇을 설치할지 먼저 고르기

Cua는 제품이 여러 개라서 "전부 설치"보다 목적에 맞는 하나부터 시작하는 것이 좋습니다.

| 하고 싶은 일 | 설치할 것 |
|---|---|
| 내 컴퓨터의 앱을 에이전트가 조작 | Cua Driver (`cua-driver`) |
| 내 코드에서 데스크톱 앱 조작·검증 | Cua Driver + Python `cua-driver` 또는 npm `@trycua/cua-driver` |
| 격리된 샌드박스에서 에이전트 실행 | `cua` CLI + Python `cua-sandbox` (또는 `@trycua/cua`) |
| 에이전트용 데스크톱을 앱으로 관리 | Cua Spaces (macOS 26 이상) |
| 에이전트 평가 | `cua-bench` (+ 로컬 샌드박스 실행용 `cua` CLI) |

이 문서는 가장 많이 쓰는 **Cua Driver**와 **샌드박스 SDK**를 다룹니다.

---

## 설치 1. Cua Driver

필요 조건은 macOS 14 이상, Windows 10/11, 또는 X11·XWayland와 AT-SPI 2가 있는 x86_64 Linux 데스크톱입니다. 관리자 권한은 필요 없습니다.

**macOS**

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"

# 앱 번들로 데몬을 시작해야 macOS가 권한 주체를 CuaDriver로 인식한다
open -n -g -a CuaDriver --args serve

# 손쉬운 사용(Accessibility)과 화면 및 시스템 오디오 녹음 권한 요청
cua-driver permissions grant
```

설치 스크립트는 `CuaDriver.app`을 `/Applications`에 두고 `~/.local/bin/cua-driver` 링크를 만듭니다. 시스템 설정에서 두 권한 모두 CuaDriver를 켜야 합니다. 화면 기록 권한이 없으면 관찰 결과에 스크린샷 없이 트리만 들어옵니다.

**Windows (PowerShell)**

```powershell
irm https://cua.ai/driver/install.ps1 | iex
cua-driver autostart kick
```

SSH 세션이 아니라 실제 데스크톱 세션에서 실행해야 합니다. 데몬이 사용자 세션 안에 있어야 데스크톱에 접근할 수 있습니다.

**Linux**

```bash
sudo apt install libxi6 at-spi2-core   # 최소 이미지에서만 필요
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
cua-driver serve                        # 데스크톱 세션 안의 터미널에서 실행하고 열어 둔다
```

데몬이 조작할 앱과 같은 디스플레이·접근성 버스를 써야 하므로, SSH가 아니라 데스크톱 세션의 터미널에서 띄웁니다. GNOME에서는 함께 설치되는 WinRects Shell 헬퍼를 설치하고 한 번 로그아웃해야 합니다.

### 설치 확인

```bash
cua-driver --version
cua-driver status
cua-driver doctor
cua-driver permissions status   # macOS 전용
cua-driver call list_apps       # 지금 열려 있는 GUI 앱이 보여야 정상
```

`list_apps`가 빈 목록이면 데몬이 데스크톱을 보지 못하는 상태입니다. `doctor` 결과부터 확인합니다.

---

## 설치 2. 에이전트에 연결

**Claude Code**

```bash
claude mcp add --transport stdio cua-driver -- cua-driver mcp
cua-driver skills install    # 에이전트가 Driver를 언제·어떻게 쓰는지 알려 주는 Skill 설치
```

**Codex, Cursor 등**

```bash
cua-driver mcp-config --client codex    # 해당 클라이언트용 등록 명령·설정을 출력
cua-driver mcp-config --client cursor   # ~/.cursor/mcp.json 에 붙여 넣을 내용
cua-driver skills install
cua-driver skills status
```

표준 MCP 설정 형식을 받는 클라이언트라면 다음 내용으로 충분합니다.

```json
{
  "mcpServers": {
    "cua-driver": { "command": "cua-driver", "args": ["mcp"] }
  }
}
```

등록한 뒤에는 에이전트 클라이언트를 다시 시작해야 도구 목록이 갱신됩니다.

---

## 설치 3. 샌드박스용 `cua` CLI와 SDK

```bash
# cua CLI 설치. --only 로 체크리스트 없이 필요한 것만 고를 수 있다
curl -fsSL https://cua.ai/install.sh | sh

# 로컬 런타임(Docker·Podman, gVisor, QEMU, Lume) 상태 확인과 준비
cua runtime doctor
cua runtime setup
```

```bash
# Python 3.11 이상 3.14 미만
pip install cua-sandbox
```

```bash
# TypeScript
npm install @trycua/cua
```

로컬 컨테이너 샌드박스에는 Docker, Podman, Colima 중 하나가 필요합니다. 클라우드 샌드박스를 쓰려면 `cua auth login`으로 로그인하거나 `CUA_CLIENT_ID`, `CUA_CLIENT_SECRET`을 설정합니다.

---

## 가장 간단한 예제

### 에이전트로 계산기 조작하기

Cua Driver 공식 시작 예제는 "계산기에서 6 × 7을 계산하고 42를 읽어 오기"입니다. 에이전트 세션을 새로 열고 다음과 같이 요청합니다.

```text
Using Cua Driver, open the installed calculator app, compute 6 × 7,
and read the displayed result back from a fresh snapshot.
```

1. **무엇을 생성하는가**: 에이전트가 Driver 세션을 하나 열고, 필요하면 `launch_app`으로 계산기를 백그라운드에서 실행합니다.
2. **어떤 값을 전달하는가**: `list_windows`로 고른 정확한 `pid`와 `window_id`, 그리고 `get_window_state`가 돌려준 버튼들의 `element_token`을 `click`에 넘깁니다.
3. **Cua가 무엇을 처리하는가**: 백그라운드 접근성 경로로 6, ×, 7, = 버튼을 누릅니다. 사용자의 포인터는 그대로이고, 화면에서 움직이는 커서는 에이전트용 오버레이입니다.
4. **어떤 결과를 반환하는가**: 에이전트가 새 스냅샷에서 결과 표시 요소의 값 `42`를 읽어 보고합니다. "클릭이 성공했다"가 아니라 "화면에 42가 보인다"가 완료 조건입니다.

### 코드로 샌드박스 하나 띄우기

```python
import asyncio
from cua_sandbox import Image, Sandbox, http

async def main():
    # 공식 Python 이미지에서 웹 서버를 띄우고, 준비되면 호출한다
    async with Sandbox.ephemeral(
        Image.from_registry("python:3.12-slim"),
        command=["python", "-m", "http.server", "8000"],
        services={"web": 8000},
        wait_for=http("web", "/"),
    ) as sb:
        print((await sb.service("web").request("GET", "/")).status_code)  # 200
        print(await sb.service("web").url())                              # 내 컴퓨터에서 쓸 수 있는 URL

asyncio.run(main())
```

같은 일을 CLI로 하면 다음과 같습니다.

```bash
cua sb create python:3.12-slim --name web --service web=8000 --wait http:web/ \
  -- python -m http.server 8000
cua sb url web web
cua sb rm web -f
```

`Sandbox.ephemeral`은 블록이 끝나면 샌드박스를 지우지만, CLI로 만든 샌드박스는 `cua sb rm`으로 지울 때까지 남습니다. 처음 쓰는 이미지는 내려받는 데 몇 분이 걸릴 수 있습니다.

---

## 설치할 때 주의할 점

- **macOS에서는 반드시 앱 번들로 데몬을 띄웁니다.** 권한은 실행 파일 경로가 아니라 앱 identity(`com.trycua.driver`)에 부여됩니다. 터미널에서 raw `cua-driver serve`를 직접 실행하는 구성은 지원되지 않고, 임의의 바이너리 경로에 권한을 주면 안 됩니다.
- **권한을 켰는데 false로 나오면** 예전 번들 ID(`com.trycua.cuadriver` 등)에 남은 권한일 수 있습니다. 모든 MCP 클라이언트를 끄고 `cua-driver stop` 후 `tccutil reset Accessibility com.trycua.driver`처럼 Cua Driver 항목만 초기화한 뒤 다시 부여합니다. 전체 초기화나 `TCC.db` 직접 수정은 하지 않습니다.
- **MCP 등록은 권한 모드를 정하지 않습니다.** macOS에서는 `CuaDriver.app` 데몬이, Windows·Linux에서는 클라이언트 설정의 `env`에 넣은 `CUA_DRIVER_PERMISSION_MODE`가 모드를 정합니다.
- **GitHub 릴리스의 "Pre-release" 표시는 불안정 버전이라는 뜻이 아닙니다.** 모노레포에서 제품별 "Latest"가 서로 뒤바뀌지 않도록 붙인 표시이고, `cua-driver-rs-v0.33.3` 같은 일반 SemVer는 안정 릴리스입니다. 반대로 `nightly-` 태그는 실제 불안정 채널입니다.
- **설치 스크립트를 파이프로 바로 실행하는 것이 부담스럽다면** 릴리스 자산의 버전 고정 설치 스크립트와 SHA256 체크섬을 확인한 뒤 실행합니다.
- **`cua-sandbox[driver]` extra는 특정 `cua-driver` 버전을 고정합니다.** 내 컴퓨터에 설치한 Driver와 버전이 다를 수 있으므로, 샌드박스 안 Driver를 타입 있는 SDK로 다룰 때는 설치된 버전의 API를 확인합니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 내 컴퓨터의 앱을 에이전트에게 맡기기 →](03-usage-desktop-agent.md)
