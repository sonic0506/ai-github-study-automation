# Cua 활용 예시 ② 애플리케이션 코드에서 샌드박스 다루기

> 에이전트가 아니라 내가 작성하는 코드가 Cua를 쓰는 경우를 다룹니다. Driver SDK로 데스크톱 앱을 조작·검증하는 방법, 샌드박스를 만들어 화면을 조작하고 사람에게 보여 주는 방법, 샌드박스 안에서 코딩 에이전트를 돌리는 방법을 차례로 봅니다.

Cua에는 "Client/Server" 구분보다 **"에이전트가 쓰는가, 내 코드가 쓰는가"** 구분이 더 잘 맞습니다. [활용 예시 ①](03-usage-desktop-agent.md)이 에이전트가 MCP로 쓰는 경우였다면, 이 문서는 애플리케이션 코드가 SDK로 쓰는 경우입니다.

## 활용할 수 있는 기능

| 기능 | 패키지 | 용도 |
|---|---|---|
| Driver SDK (in-process) | Python `cua-driver`, npm `@trycua/cua-driver` | 내 프로세스 안에서 Driver 런타임을 올려 앱을 타입 있는 API로 조작 |
| 샌드박스 생명주기 | Python `cua-sandbox`, npm `@trycua/cua` | 컨테이너·VM 샌드박스 생성, 서비스 포트, 공개 URL, 삭제 |
| 샌드박스 데스크톱 제어 | 같은 패키지 (cua-spacesd 필요) | 스크린샷, 마우스, 키보드, 셸, 파일, 터미널 |
| 브라우저 뷰어 | `sb.viewer_url()`, `cua sb view` | 샌드박스 화면을 사람에게 HTML5 스트림으로 보여 주기 |
| 에이전트용 MCP | `cua mcp --sandbox NAME` | 코딩 에이전트에게 샌드박스 하나를 도구로 넘기기 |
| 샌드박스 안 코딩 에이전트 | `sb.agents()` (cua SDK) | Claude Code·Codex 등을 샌드박스 안에서 실행하고 이벤트 수신 |

---

## 실제 예제 1. Driver SDK로 데스크톱 앱 동작 검증하기

사내 데스크톱 앱 "Window Demo"의 Counter 창에서 Increment 버튼을 누르면 Count 값이 바뀌는지 확인하는 테스트입니다. 실제 마우스를 움직이지 않으므로 개발자가 작업 중인 Mac에서도 돌릴 수 있습니다.

```python
# check_counter.py  (pip install cua-driver)
import asyncio

from cua_driver import (
    ActionTarget, ClickButton, ClickInput, ClickPosition, CuaDriver,
    GetWindowStateInput, InputDeliveryMode, ListAppsInput, ListWindowsInput,
)


def unique(items, what):
    # 후보가 정확히 하나가 아니면 멈춘다: "첫 번째 것"을 고르는 습관이 오조작의 원인
    if len(items) != 1:
        raise RuntimeError(f"Expected one {what}, found {len(items)}")
    return items[0]


async def main() -> None:
    driver = CuaDriver.create()  # 데몬 없이 이 프로세스 안에 런타임을 올린다
    try:
        apps = await driver.list_apps(ListAppsInput())
        app = unique([a for a in apps.apps if a.name == "Window Demo" and a.running], "app")
        windows = await driver.list_windows(ListWindowsInput(pid=app.pid, on_screen_only=True))
        window = unique([w for w in windows.windows if w.title == "Counter"], "window")

        capture = GetWindowStateInput(
            pid=app.pid, window_id=window.window_id, session=None, query=None,
            include_accessibility_tree=True, include_screenshot=True,
            screenshot_out_file=None, max_elements=None, max_depth=None, max_dimension=None,
        )

        async def snapshot():
            state = await driver.get_window_state(capture)
            if state.degraded or state.truncated:
                raise RuntimeError("Snapshot is degraded or truncated")
            return state

        before = await snapshot()
        button = unique([e for e in before.elements or [] if e.label == "Increment"], "button")
        count = unique([e for e in before.elements or [] if e.label == "Count"], "counter")

        await driver.click(ClickInput(
            target=ActionTarget.WINDOW(pid=app.pid, window_id=window.window_id),
            position=ClickPosition.ELEMENT(element_token=button.element_token),
            delivery_mode=InputDeliveryMode.BACKGROUND,  # 실패해도 포그라운드로 자동 재시도하지 않는다
            session=None, button=ClickButton.LEFT, count=1,
        ))

        after = await snapshot()  # 클릭이 반환됐다는 것은 증거가 아니다. 두 번째 스냅샷이 증거다
        updated = unique([e for e in after.elements or [] if e.label == "Count"], "counter")
        if updated.value == count.value:
            raise RuntimeError("Click returned, but the counter did not change")
        print("Verified:", count.value, "->", updated.value)
    finally:
        await driver.shutdown()


asyncio.run(main())
```

**코드 설명**

1. `CuaDriver.create()`는 Driver 런타임을 현재 프로세스에 직접 올립니다. 별도 데몬이나 MCP 서버가 필요 없습니다(macOS에서는 이 프로세스를 띄운 앱의 권한을 따릅니다).
2. `unique()`로 앱·창·요소가 정확히 하나인지 확인합니다. 같은 이름의 창이 두 개일 때 아무거나 고르면 엉뚱한 창을 조작합니다.
3. `degraded`나 `truncated` 스냅샷은 신뢰하지 않습니다. 트리가 잘렸다면 찾는 요소가 "없는" 것이 아니라 "안 보인" 것일 수 있습니다.
4. 클릭 뒤 다시 관찰해서 값이 바뀌었는지 비교합니다. 이것이 Cua가 권하는 관찰 → 행동 → 검증 루프의 최소 형태입니다.

TypeScript에서도 `@trycua/cua-driver`의 `CuaDriver.create()`, `ListAppsInput.new({...})`, `ActionTarget.Window`, `InputDeliveryMode.Background`로 같은 흐름을 씁니다.

---

## 실제 예제 2. 일회용 데스크톱 샌드박스를 만들어 조작하고 보여 주기

에이전트에게 내 컴퓨터를 맡기기 불안할 때는 샌드박스를 줍니다. 아래 코드는 Linux 데스크톱 샌드박스를 띄워 터미널을 열고 입력한 뒤, 사람이 지켜볼 수 있는 뷰어 링크를 출력합니다.

```python
# desktop_sandbox.py  (pip install cua-sandbox)
import asyncio
from pathlib import Path

from cua_sandbox import Image, Sandbox

# 샌드박스 안에서 터미널 창을 열고 포커스를 준다 (키 입력은 포커스된 창으로 간다)
FOCUS_TERMINAL = (
    "export DISPLAY=:1; setsid -f xfce4-terminal -T demo >/dev/null 2>&1; "
    "xdotool search --sync --onlyvisible --name demo windowactivate --sync"
)


async def main():
    async with Sandbox.ephemeral(Image.linux()) as sb:          # 기본은 로컬(gVisor 컨테이너)
        print("viewer:", await sb.viewer_url())                  # 브라우저로 화면을 볼 수 있는 링크

        width, height = await sb.get_dimensions()
        await sb.mouse.click(width // 2, height // 2)

        assert (await sb.shell.run(FOCUS_TERMINAL)).success
        await sb.keyboard.type("echo hello from cua")
        await sb.keyboard.keypress(["ctrl", "a"])               # 단축키는 키 이름 목록으로 보낸다

        Path("desk.png").write_bytes(await sb.screenshot())     # 결과 화면 저장


asyncio.run(main())
```

**코드 설명**

1. `Image.linux()`는 cua-spacesd가 들어 있는 공식 Ubuntu 24.04 데스크톱 이미지입니다. 그래서 `shell`, `mouse`, `keyboard`, `screenshot`을 쓸 수 있습니다. cua-spacesd가 없는 이미지라면 이 인터페이스들은 `SpacesdNotAvailable`을 냅니다.
2. 같은 코드에 `on="cloud"`만 넘기면 클라우드 샌드박스가 됩니다. 클라우드는 amd64 이미지만 지원하고 macOS는 아직 없습니다.
3. `viewer_url()`의 링크는 뷰어 호출만 허가하는 티켓을 담고 있고 기본 1시간 후 만료됩니다. 사람에게 "에이전트가 지금 이 화면에서 일하고 있다"를 보여 줄 때 씁니다.

샌드박스 안의 창·접근성 트리까지 다루려면 `cua-sandbox[driver]` extra를 설치하고 `async with sb.driver.connect() as driver:`로 샌드박스 안 Cua Driver의 타입 있는 API를 씁니다. 이 extra는 특정 `cua-driver` 버전을 고정하므로 쓸 수 있는 메서드를 그 버전 기준으로 확인해야 합니다.

---

## 실제 예제 3. 코딩 에이전트에게 샌드박스 하나를 도구로 넘기기

에이전트가 브라우저나 GUI 앱을 시험해 봐야 하는데 내 컴퓨터는 건드리지 않게 하고 싶을 때입니다.

```bash
# 1) 이름 있는 샌드박스를 만든다 (지울 때까지 유지)
cua sb create linux --name desk

# 2) 그 샌드박스를 stdio MCP 서버로 Claude Code에 등록
claude mcp add --transport stdio cua-desk -- cua mcp --sandbox desk

# 3) 사람은 브라우저 뷰어로 지켜본다
cua sb view desk

# 4) 작업이 끝나면 정리
cua sb rm -f desk
```

에이전트는 `desk` 샌드박스 안에서만 스크린샷·클릭·입력을 하게 됩니다. 실수로 파일을 지워도 샌드박스를 지우고 새로 만들면 됩니다.

---

## 실제 예제 4. 샌드박스 안에서 코딩 에이전트를 실행하기

반대로 에이전트 자체를 샌드박스 안에서 돌릴 수도 있습니다. cua SDK는 Claude Code, Codex, Gemini CLI 같은 하네스를 고정된 버전·체크섬으로 설치하고 Agent Client Protocol로 구동합니다.

```python
# agent_in_sandbox.py  (pip install cua)
import asyncio
import cua


async def main():
    c = cua.embedded()
    sb = await c.sandboxes().create(cua.SandboxCreateOptions(
        on="local",
        image="ghcr.io/trycua/linux:24.04",
        name="agent-box",
        memory_mb=4096,
        wait_for=[cua.ReadinessProbe(service="env")],  # cua-spacesd가 준비될 때까지 대기
    ))
    agents = await sb.agents()
    run = await agents.run(
        "claude-code",
        "Write primes.py that prints the first 10 primes, then run it.",
        cua.AgentRunOptions(env_from_host=["ANTHROPIC_API_KEY"]),  # 호스트의 키 이름만 지정해 전달
    )
    print("run id:", run.run_id())  # 실행 상태는 샌드박스 안에 남아 다른 클라이언트가 다시 붙을 수 있다


asyncio.run(main())
```

`run.events(cursor, max)`로 이벤트를 페이지 단위로 받고, `run.send(...)`로 후속 지시, `run.interrupt()`로 진행 중인 턴을 취소합니다. 실행은 샌드박스 안에 살아 있으므로 내 스크립트가 끝나도 계속됩니다. 다 쓴 샌드박스는 `cua sb rm`이나 SDK의 삭제 호출로 지워야 합니다.

---

## 실제 서비스에서는

> 사용자가 웹 앱에서 "우리 회사 그룹웨어에서 지난주 회의록을 찾아 요약해 줘"라고 요청하면, 백엔드 작업 큐가 요청마다 클라우드 샌드박스(`Image.linux()`, `on="cloud"`)를 하나 만듭니다. 에이전트 워커는 `cua mcp`나 SDK로 그 샌드박스만 조작하고, 프런트엔드는 보기 전용 뷰어 링크(SDK의 `viewer_url` 옵션 `view_only`, CLI의 `cua sb view --view-only`)를 iframe에 띄워 사용자가 에이전트의 진행 화면을 실시간으로 봅니다. 작업이 끝나면 워커가 결과 파일을 `sb.files`로 꺼내 저장하고 샌드박스를 삭제합니다. 워커가 비정상 종료해도 클라우드 샌드박스는 `claim_ttl`(기본 15분)이 지나면 회수됩니다.

이 구조에서 Cua의 가치는 두 가지입니다. **에이전트의 실행 환경이 사용자별로 격리된다**는 점과, **같은 코드를 개발자 노트북(로컬)과 운영(클라우드)에서 `on` 값만 바꿔 쓴다**는 점입니다. 다만 클라우드 사용 시간은 과금되므로, 샌드박스 정리를 `async with`나 `finally`로 반드시 보장해야 합니다.

---

[← 활용 예시 ① 내 컴퓨터의 앱을 에이전트에게 맡기기](03-usage-desktop-agent.md) · [목차](README.md) · [활용 예시 ③ CI·평가·실전 프로젝트 →](05-usage-ci-and-evaluation.md)
