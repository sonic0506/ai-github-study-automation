---
repository: trycua/cua
url: https://github.com/trycua/cua
stars: 24475
studiedAt: 2026-09-20
status: draft
---

# trycua/cua

Cua는 AI 에이전트에게 실제로 조작할 컴퓨터를 주는 오픈소스 프로젝트입니다.
데스크톱 자동화 드라이버, 격리된 클라우드 데스크톱, Apple Silicon용 로컬 macOS VM, 폼 입력 전용 소형 모델, 컴퓨터 사용 에이전트 벤치마크를 한 저장소에서 제공합니다.

## 01. 어떤 문제를 푸는가

에이전트가 코드와 API만으로 끝내지 못하는 작업은 결국 사람이 쓰는 화면을 직접 조작해야 합니다.
Cua는 에이전트와 모델은 사용자가 가져오고, 자신은 컴퓨터와 자동화 도구만 제공하는 역할로 선을 긋습니다.

- 해결 대상 : 에이전트가 네이티브 앱과 브라우저를 조작할 수 있는 실행 환경과 도구가 없는 문제[^s1]
- Computer-Use 2.0 : 에이전트가 코드 작성·실행, 구조화된 도구·API 호출, 사람이 쓰는 GUI 조작 사이를 한 작업 안에서 오가는 방식[^s6]
- 기본 루프 : 컴퓨터 상태를 관찰하고, 행동을 고르고, 결과를 확인하는 과정을 목표에 닿을 때까지 반복함[^s6]
- 모델과 에이전트 구분 : 모델은 관찰을 해석해 행동을 제안하고, 에이전트는 컴퓨터·도구·메모리·권한·피드백 루프를 갖춘 런타임 전체를 뜻함[^s6]
- Cua의 위치 : 기존 기기에는 Cua Driver, 격리 환경에는 Cua Sandbox를 두어 UI 자동화 표면을 제공함[^s6]
- 라이선스는 MIT, 기본 브랜치는 main, 공식 사이트는 cua.ai. GitHub 집계 주 언어는 HTML임[^s2]
- 2025-01-31 생성, Star 24,475개, Fork 1,683개, 열린 이슈 1,032건 (2026-09-20 조회 기준, PR 포함 값)[^s2]

## 02. 핵심 구조

저장소는 제품 다섯 개를 묶은 모노레포입니다.
README가 안내하는 진입점도 제품별로 나뉘어 있습니다.

- Cua Fleets : run.cua.ai에서 제공하는 격리 클라우드 데스크톱. Fleet이 샌드박스 용량을 유지하고, 코드가 풀에서 데스크톱을 하나 받아 Sandbox SDK로 명령 실행·스크린샷·앱 조작을 함[^s1]
- Cua Driver : macOS, Windows, Linux의 네이티브 앱과 브라우저를 검사·조작하는 도구. CLI, MCP, 타입이 있는 SDK로 연결함[^s1]
- CUA-S1 : 컴퓨터 사용 결정을 위한 소형 특화 모델군. 첫 연구 프로필은 폼 입력에 집중함[^s1]
- Lume : Apple의 Virtualization.Framework로 Apple Silicon에서 로컬 macOS·Linux VM을 만들고 관리함[^s1]
- Cua Bench : 컴퓨터 사용 작업을 만들고 에이전트를 평가하며 학습용 trajectory를 내보냄[^s1]

Cua Driver 내부는 Rust 런타임 위에 언어별 바인딩을 얹은 구조입니다.

- 에이전트 경계 : MCP 대응 에이전트는 `cua-driver mcp` 에 직접 붙고, 셸 기반 자동화는 `cua-driver call` 을 씀[^s3]
- 애플리케이션 SDK : Python은 `cua_driver`, TypeScript는 `@trycua/cua-driver` 를 import함. 둘 다 UniFFI로 생성한 바인딩으로 같은 in-process 네이티브 런타임을 호출함[^s3]
- 언어 패키지는 클라이언트 애플리케이션용이며 에이전트용이 아님. MCP는 `cua-driver` 실행 파일이 담당함[^s3]
- 디렉터리 : `rust/` (데몬·UniFFI SDK·플랫폼 crate), `python/`, `typescript/`, `contract/` (생성된 SDK 계약), `tests/fixtures/` (GUI 하네스 앱)[^s3]
- 안정 네이티브 경계 : `rust/include/cua_driver_abi.h` 헤더를 Rust `#[repr(C)]` export에서 생성하고 CI가 `--check` 로 드리프트를 막음[^s3]
- 배포 : Python wheel과 npm 패키지를 같은 `cua-driver-rs-v*` 릴리스 아티팩트에서 조립하고 Rust 릴리스 버전과 정확히 맞춤[^s3]

## 03. 주요 기능

- 백그라운드 전달 : 앱과 플랫폼이 지원하는 범위에서 포인터를 움직이거나 포커스를 뺏지 않고 에이전트가 작업함[^s1]
- 권한 모드 : `standard` (프롬프트 없는 기본값), `bounded` (검토된 매니페스트의 도구·리소스만 허용), `unrestricted` (`--dangerously-bypass-approvals` 필요)[^s3]
- 권한 모드는 런타임을 소유한 프로세스가 시작 시점에 고정함. 바꾸려면 데몬을 재시작해야 함[^s3]
- 로그인된 Chromium 프로필 연결은 `cua-driver mcp --grant existing-profile` 처럼 명시적으로만 허용함[^s3]
- Claude Code 연동 : `claude mcp add --transport stdio cua-driver -- cua-driver mcp`. `--claude-code-computer-use-compat` 를 붙이면 `screenshot` 이 `pid` 와 `window_id` 를 요구하고 해당 창만 캡처함[^s3]
- 다른 에이전트 : Codex, Cursor, Antigravity, OpenClaw, Qwen Code, Factory Droid는 `cua-driver mcp-config --client <이름>` 으로 설정을 생성함[^s5]
- Computer History (macOS 프리뷰) : nightly 빌드에서 옵트인으로 켜는 암호화 작업 이력. 메타데이터 허용 목록만 저장하고 스크린샷·입력 텍스트·클립보드·창 제목·URL은 저장하지 않음[^s3]
- CUA-S1-FORMS : 구조화된 인터페이스 요소와 문서 값에서 결정을 점수화함. 토큰 단위 생성이 아니며, 행동 순서는 애플리케이션 코드가 정함. 가중치는 Hugging Face에 별도 게시됨[^s1]
- Cua Bench : VM, Docker, 모델 API 키 없이 시뮬레이션 작업을 만들고 평가기가 reward `1.0` 을 내는지 확인하는 것부터 시작함[^s1]
- Sandbox : `agent_type="osworld"` 로 Fleet에서 OSWorld 디스크를 쓰는 기능이 sandbox-v0.8.0에 추가됨[^s11]

## 04. 시작하기

Cua Driver는 macOS 14 (Sonoma) 이상에서 Apple Silicon과 Intel을 지원하고, 설치 스크립트는 관리자 권한을 요구하지 않습니다.[^s7]
macOS에서는 `CuaDriver.app` 을 `/Applications` 에 두고 `~/.local/bin/cua-driver` 심볼릭 링크를 만듭니다.[^s7]

```bash
# macOS / Linux 설치
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
```

```powershell
# Windows 설치
irm https://cua.ai/driver/install.ps1 | iex
```

macOS는 데몬을 먼저 띄운 뒤 접근성과 화면 기록 권한을 부여합니다.

```bash
# 데몬 시작 (CuaDriver.app 이 권한의 주체가 됨)
open -n -g -a CuaDriver --args serve
# 시스템 설정에서 Accessibility, Screen Recording 을 켜는 안내
cua-driver permissions grant
```

```bash
# 설치 확인
cua-driver --version
cua-driver doctor
cua-driver status
cua-driver permissions status   # macOS 전용
cua-driver call list_apps
```

Claude Code에 붙이는 명령은 다음과 같습니다.[^s3]

```bash
claude mcp add --transport stdio cua-driver -- cua-driver mcp
```

설치와 명령은 공식 문서 기준입니다.[^s7]

(Linux는 데스크톱 세션 안의 터미널에서 `cua-driver serve` 를 실행하고 그 터미널을 열어 두어야 합니다. 데몬이 조작 대상 앱과 같은 디스플레이·접근성 버스를 써야 하기 때문입니다.)

Lume과 Cua Bench는 별도 설치 경로를 씁니다.

```bash
# Lume 설치 (Apple Silicon)
/bin/bash -c "$(curl -fsSL https://cua.ai/lume/install.sh)"
```

```bash
# Cua Bench 설치 (Python 3.12 또는 3.13, uv 필요)
uv tool install 'cua-bench[browser]'
uv tool run --from 'cua-bench[browser]' playwright install chromium
```

## 05. 최근 변화

제품별로 릴리스가 따로 나옵니다. GitHub의 Pre-release 표시는 모노레포의 Latest 포인터가 제품 사이를 오가지 않도록 붙인 것이며, 일반 SemVer의 Cua Driver는 안정 릴리스라고 문서가 밝힙니다.[^s8]

- cua-driver-rs-v0.28.2 (2026-09-15)[^s8]
    - Hyprland의 시맨틱 AX 스크롤 보존, 백그라운드 텍스트를 Hyprland 입력으로 라우팅
    - 데스크톱 스냅샷 identity와 payload 소유권 통일
    - macOS 데스크톱 캡처가 PATH에 의존하지 않도록 수정
- cua-driver-rs-v0.28.1 (2026-09-12)[^s9]
    - 새 Codex·Claude 설치에 Skill 링크, X11 키보드 전달과 타이밍 보존
    - 커서 오버레이를 포그라운드 검증에서 제외
- cua-driver-rs-v0.28.0 (2026-09-11)[^s10]
    - 최신 stdio MCP와 Skill 리소스 지원 추가
- sandbox-v0.8.0 (2026-09-15)[^s11]
    - `agent_type="osworld"` 로 Fleet에서 OSWorld 디스크 사용, Image 파일 크기를 JSON 안전 값으로 유지
- nightly 채널 : `main` 의 특정 커밋에서 매일 빌드함. 옵트인이며 안정 릴리스보다 불안정할 수 있고, 안정 업데이트 탐색을 대체하지 않음[^s15]

## 06. 커뮤니티에서 반복되는 주제

열린 이슈가 1,000건을 넘고, 최근 이슈는 플랫폼별 입력 전달과 권한 상태 보고에 몰려 있습니다.

- MCP ping 거부 : stdio 서버가 JSON-RPC `ping` 에 `-32601` 을 돌려주어, ping으로 헬스체크하는 클라이언트가 약 55초마다 서버를 재시작한다는 보고. 2시간 동안 호스트당 131~132회 끊김이 관찰됨. 클라이언트에서 ping 검사를 끄는 우회가 제시됨[^s13]
- Wayland·GNOME : GNOME Shell 50.1에서 창 캡처 헬퍼 실행 시 mutter가 SIGSEGV로 죽는 보고[^s12]
- 권한 상태 오보고 : 데몬이 떠 있는데 `permissions status` 가 `daemon_running=false` 를 출력한다는 이슈[^s12]
- 브라우저 대화상자 : JS dialog를 여는 요소를 `browser_click` 으로 활성화하지 못하고 `browser_dialog` 도 탭에 닿지 못한다는 이슈[^s12]
- Windows : 로그온 시 자동 시작 작업이 콘솔 창을 띄우는 문제가 #1645 수정 뒤에도 남아 있다는 보고[^s12]
- CUA-S1 : 학습 데이터셋이 184k 행에서 약 26GB RAM을 쓰고, 게시된 `.pt` 체크포인트를 `cua_s1.load_checkpoint` 가 거부하며, 55개 개념 카탈로그 밖에서는 정확도가 97.5%에서 29.3%로 떨어진다는 이슈[^s12]
- 설치 보안 : Unix 설치 스크립트에 fail-closed 체크섬 검증을 요구하는 RFC[^s12]

## 07. 실제 개발에서 어떻게 쓰는가

공식 문서 외에 2026-04-29에 쓰이고 2026-07-30에 갱신된 외부 리뷰가 있습니다.
Driver가 Rust로 다시 쓰이기 시작한 시점의 글이라 지금 버전과는 차이가 있습니다.

- 강점으로 꼽은 것 : `Sandbox.ephemeral()` 하나로 Linux·macOS·Windows·Android를 같은 Python API로 다룸, macOS Driver가 커서와 작업 공간을 뺏지 않음, trajectory 기록으로 실패한 실행을 디버깅함[^s14]
- 동작 방식 : 스크린샷을 비전 모델에 넣고 JSON 행동(click, type, done)을 받아 SDK로 전달하는 ReAct 루프가 기본으로 제공됨[^s14]
- 주의점 : macOS VM은 M 시리즈 Mac에서만 생성되고 이미지가 약 50GB를 차지함. 관리형 cua.ai는 유료임. OSWorld 벤치마크는 최신 모델도 30~50% 수준에 머무름[^s14]
- 코드베이스 변화가 빨라 버전 고정을 권함. 글 작성 시점의 Driver는 `cua-driver-rs` v0.12.6, Lume은 v0.4.0이었음[^s14]

에이전트 연결은 클라이언트별로 다음과 같이 정리됩니다.[^s5]

- Claude Code : stdio MCP 등록. v2.1.268부터 내장 Cua Driver 리소스를 읽을 수 있음
- Codex : `codex mcp add cua-driver -- /절대경로/cua-driver mcp`. 추가 후 재시작 필요
- Prime Agent : `cua-driver skills install` 로 Skill 팩을 `~/.prime/agent/skills/` 에 연결. 로컬 MCP 등록이 필요 없음
- OpenClaw : 게이트웨이가 띄운 MCP는 OpenClaw.app의 macOS 권한을 물려받지 못하므로 임베딩을 권함
- 서버 등록은 권한 모드를 정하지 않음. 런타임을 소유한 프로세스가 시작 시 환경 변수나 데몬 플래그로 정함

## 08. 한계와 주의점

- 백그라운드 전달 범위가 OS마다 다름. Windows는 Electron·Tauri·WPF·WinUI 3·WebView2를 포함하지만 상승된 무결성 경계와 일부 Chromium 제스처는 불가함. macOS는 일부 백그라운드 스크롤·드래그가 구조화된 거부를 돌려줌[^s4]
- Linux X11은 포그라운드 입력과 시맨틱 백그라운드 행동을 넓게 지원하되 조용한 성공이 생길 수 있고, Wayland는 애플리케이션이 노출하는 AT-SPI 행동만 가능하며 가려진 표면으로의 raw 입력은 표준 컴포지터에서 불가함[^s4]
- macOS는 접근성·화면 기록 권한을 앱 identity 기준으로 부여함. `CuaDriver.app` 밖에서 raw `cua-driver serve` 를 띄우는 것은 지원하지 않고, 임의 바이너리 경로에 권한을 주지 말라고 안내함[^s3]
- `cua-driver mcp --direct` 는 호스트의 TCC 귀속을 쓰며, 인증된 호스트 어댑터 없이는 AppKit 커서 오버레이를 제공하지 않음[^s3]
- Fleet 풀은 claim이 끝난 뒤에도 유료 용량을 유지할 수 있어 튜토리얼의 정리 절차를 따라야 함[^s1]
- 로컬 샌드박스와 Fleet은 Sandbox SDK를 공유하지만 자격 증명, 이미지, 연산, 런타임 요구 사항이 다름[^s1]
- CUA-S1의 GitHub 구성 요소는 초기 소스 전용 연구 릴리스임. 모델·데이터셋 카드마다 범위와 라이선스를 따로 확인해야 함[^s1]
- 서드파티 구성 요소 라이선스가 다름. Kasm은 MIT, OmniParser는 CC-BY-4.0, 선택 설치 `cua-agent[omni]` 의 ultralytics는 AGPL-3.0임[^s1]
- ClawHub로 배포되는 Skill 사본은 MIT-0이고 저장소는 MIT로 라이선스 경계가 나뉨[^s3]

## 09. 더 알아볼 것

- Cua Fleets의 요금 체계와 풀 유지 비용은 이번 조사에서 확인하지 못했습니다.
- Sandbox SDK의 현재 API 형태와 `sandbox-v0.8.0` 기준 지원 환경 목록은 확인하지 못했습니다.
- Cua Driver가 MCP로 노출하는 도구 목록 전체와 `bounded` 매니페스트 작성 형식은 확인하지 못했습니다.
- Linux 빌드가 프리뷰로 표시되는데 어떤 배포판·컴포지터가 검증 대상인지는 확인하지 못했습니다.
- CUA-S1-FORMS를 Cua Driver와 함께 쓸 때의 실제 호출 순서는 확인하지 못했습니다.
- Lume의 최신 릴리스 버전과 지원 macOS 게스트 범위는 확인하지 못했습니다.
- Star 24,475개의 24시간 증가량은 리포트 기준 +885이며, 조사 시점 API 값과 리포트 값(24,331)이 다릅니다.

## 참고 자료

- [Cua README (main)](https://github.com/trycua/cua/blob/main/README.md) (readme)
- [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/trycua/cua) (code)
- [libs/cua-driver/README.md](https://github.com/trycua/cua/blob/main/libs/cua-driver/README.md) (code)
- [Cua Driver platform support](https://cua.ai/docs/reference/cua-driver/platform-support) (docs)
- [Connect your agent](https://cua.ai/docs/how-to-guides/driver/connect-your-agent) (docs)
- [What is Computer-Use 2.0](https://cua.ai/docs/concepts/what-is-computer-use) (docs)
- [Install Cua Driver](https://cua.ai/docs/how-to-guides/driver/install) (docs)
- [Release cua-driver-rs-v0.28.2](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.2) (release)
- [Release cua-driver-rs-v0.28.1](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.1) (release)
- [Release cua-driver-rs-v0.28.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.0) (release)
- [Release sandbox-v0.8.0](https://github.com/trycua/cua/releases/tag/sandbox-v0.8.0) (release)
- [열린 Issues (최근 생성순)](https://github.com/trycua/cua/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc) (issues)
- [Issue #4001: MCP stdio server rejects JSON-RPC ping](https://github.com/trycua/cua/issues/4001) (issues)
- [trycua/cua Review: Open-Source Computer-Use Agents (andrew.ooo)](https://andrew.ooo/posts/trycua-cua-open-source-computer-use-agents/) (blog)
- [Release nightly-cua-driver-rs-v0.28.3-nightly.20260919](https://github.com/trycua/cua/releases/tag/nightly-cua-driver-rs-v0.28.3-nightly.20260919.35421378483) (release)

[^s1]: [Cua README (main)](https://github.com/trycua/cua/blob/main/README.md)
[^s2]: [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/trycua/cua)
[^s3]: [libs/cua-driver/README.md](https://github.com/trycua/cua/blob/main/libs/cua-driver/README.md)
[^s4]: [Cua Driver platform support](https://cua.ai/docs/reference/cua-driver/platform-support)
[^s5]: [Connect your agent](https://cua.ai/docs/how-to-guides/driver/connect-your-agent)
[^s6]: [What is Computer-Use 2.0](https://cua.ai/docs/concepts/what-is-computer-use)
[^s7]: [Install Cua Driver](https://cua.ai/docs/how-to-guides/driver/install)
[^s8]: [Release cua-driver-rs-v0.28.2](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.2)
[^s9]: [Release cua-driver-rs-v0.28.1](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.1)
[^s10]: [Release cua-driver-rs-v0.28.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.0)
[^s11]: [Release sandbox-v0.8.0](https://github.com/trycua/cua/releases/tag/sandbox-v0.8.0)
[^s12]: [열린 Issues (최근 생성순)](https://github.com/trycua/cua/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc)
[^s13]: [Issue #4001: MCP stdio server rejects JSON-RPC ping](https://github.com/trycua/cua/issues/4001)
[^s14]: [trycua/cua Review: Open-Source Computer-Use Agents (andrew.ooo)](https://andrew.ooo/posts/trycua-cua-open-source-computer-use-agents/)
[^s15]: [Release nightly-cua-driver-rs-v0.28.3-nightly.20260919](https://github.com/trycua/cua/releases/tag/nightly-cua-driver-rs-v0.28.3-nightly.20260919.35421378483)
