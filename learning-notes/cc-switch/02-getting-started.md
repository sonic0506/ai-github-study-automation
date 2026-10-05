# CC Switch 설치와 첫 사용

> 운영체제별 설치 방법과 버전 선택 기준, 첫 실행 때 일어나는 일, 공급자 하나를 추가하고 전환하는 가장 간단한 흐름, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

### 지원 환경

| 운영체제 | 요구 사항 |
|---|---|
| Windows | Windows 10 이상 (x64, ARM64) |
| macOS | macOS 12 Monterey 이상. Universal 빌드(Apple Silicon, Intel), Apple 서명·공증 완료 |
| Linux | x86_64 또는 ARM64, glibc 2.35 이상, WebKitGTK 4.1 (Ubuntu 22.04+, Debian 12+, 최신 Fedora 등). RHEL·Rocky·Alma 8~9는 아직 미지원 |

### 버전 고르기: 3.20.4 안정판과 4.0.0 사전 릴리스

2026년 10월 5일 기준으로 GitHub의 "Latest" 릴리스와 Homebrew Cask는 **3.20.4**(2026-09-22)이고, **4.0.0**은 2026-10-04에 사전 릴리스(pre-release)로 올라와 있습니다. 4.0은 설정 파일 쓰기 방식을 다시 만든 대규모 변경이라 둘의 동작이 꽤 다릅니다.

| 항목 | 3.20.4 | 4.0.0 |
|---|---|---|
| 전환 방식 | 공급자 스냅샷으로 설정 파일을 다시 씀 + 공통 설정 조각 병합 | 핵심 필드만 교체, 나머지는 그대로 |
| 모드 | 직결, 라우팅 | 직결, 라우팅, 집계 |
| 화면 | 상단 툴바 중심 | 사이드바 중심으로 전면 개편 |
| DB 스키마 | v19 | v19 (마이그레이션 없음) |

이 노트는 저장소 main 브랜치의 문서와 4.0 동작을 기준으로 설명하고, 3.20.4와 다른 부분은 그때그때 표시합니다. 4.0을 쓰다가 3.20.4로 되돌릴 때는 정해진 순서가 있으므로 [주의할 점과 FAQ](08-pitfalls-faq.md#breaking-change와-버전-이동)를 먼저 확인합니다.

### macOS

```bash
# 권장: Homebrew Cask (안정판)
brew install --cask cc-switch

# 업데이트
brew upgrade --cask cc-switch
```

Releases 페이지에서 `CC-Switch-v{버전}-macOS.dmg`를 직접 받아도 됩니다. 4.0 사전 릴리스를 써 보려면 이 방법을 씁니다.

### Windows

Releases 페이지에서 `CC-Switch-v{버전}-Windows.msi`(설치형) 또는 `-Windows-Portable.zip`(무설치)을 받습니다. ARM 기기는 `-Windows-arm64.msi`를 받습니다.

### Linux

```bash
# Arch Linux: AUR (권장)
paru -S cc-switch-bin
```

그 밖의 배포판은 Releases 페이지의 `.deb`(Debian·Ubuntu), `.rpm`(Fedora 등), `.AppImage`(요구 사항을 만족하는 모든 배포판) 중 하나를 받습니다. Flatpak은 공식 릴리스에 없고, 저장소의 `flatpak/README.md`를 보고 직접 빌드해야 합니다.

### 소스에서 빌드 (기여하거나 내부 검토가 필요한 경우)

```bash
git clone https://github.com/farion1231/cc-switch.git
cd cc-switch
pnpm install
pnpm dev     # Vite 개발 서버 + Tauri 창, 핫 리로드
```

Node.js(20.19+ 또는 22.12+), pnpm 10, 저장소의 `rust-toolchain.toml`이 지정한 Rust가 필요합니다. 백엔드 테스트 일부는 `~/.cc-switch`, `~/.codex`를 실제로 읽고 쓰므로, 로컬에서 돌릴 때는 `CC_SWITCH_TEST_HOME`을 임시 디렉터리로 지정해야 내 설정을 건드리지 않습니다.

---

## 기본 설정

### 첫 실행 때 일어나는 일

처음 실행하면 CC Switch는 이미 있는 Claude Code, Codex, Gemini CLI, Grok Build 설정을 읽어 `default`라는 공급자로 가져오고, 각 도구와 Claude Desktop에 공식 공급자(Claude Official, OpenAI Official 등)를 하나씩 추가합니다. 그래서 설치 직후에도 기존 설정은 그대로 동작합니다.

4.0에서는 CC Switch가 어떤 설정 파일을 처음 쓸 때 원본을 `~/.cc-switch/backups/live-first-write/`에 한 번 복사해 둡니다. 혹시 모를 상황을 대비해, 설치 전에 직접 백업해 두는 것도 좋습니다.

```bash
# 설치 전 수동 백업 (있는 파일만 복사됨)
mkdir -p ~/ai-config-backup
cp -p ~/.claude/settings.json ~/.codex/config.toml ~/.codex/auth.json \
      ~/.gemini/.env ~/.gemini/settings.json ~/ai-config-backup/ 2>/dev/null
ls ~/ai-config-backup
```

### 자주 손대는 설정

- **사용하지 않는 도구 숨기기**: 설정에서 도구를 숨기면 사이드바와 트레이가 단순해집니다.
- **설정 디렉터리 재정의**: 도구 설정이 기본 위치에 없거나 WSL 안에 있다면, 설정의 디렉터리 재정의에서 도구별 경로를 지정합니다. 예: `\\wsl.localhost\Ubuntu\home\<user>\.claude`
- **자동 백업**: DB는 기본 24시간마다 백업되고 최근 10개를 보관합니다.
- **로컬 라우팅**: 기본은 꺼져 있습니다. 필요할 때만 켭니다. 켜는 방법은 [활용 예시 ②](04-usage-cross-model-routing.md)에서 다룹니다.

4.0에서 설정 화면은 일반, 앱 설정, 로컬 라우팅, 네트워크, 데이터, 정보로 다시 묶였습니다. 3.20.4의 메뉴 이름과 다를 수 있으니, 메뉴 경로보다 기능 이름으로 찾는 것이 빠릅니다.

---

## 가장 간단한 예제

Claude Code에 Anthropic 형식을 지원하는 서드파티 공급자를 하나 추가하고 전환해 보겠습니다.

1. Claude Code 페이지에서 공급자 추가(+)를 누르고, 프리셋 목록에서 공급자를 검색합니다. 없으면 사용자 설정(Custom)을 고릅니다.
2. API Key를 입력합니다. 사용자 설정이라면 주소(endpoint)와 모델도 입력합니다. API 형식은 기본값 `Anthropic Messages`를 그대로 둡니다.
3. 저장한 뒤 카드의 Enable을 누릅니다.
4. 터미널에서 Claude Code를 쓰던 중이라도 재시작할 필요가 없습니다. 다음 요청부터 새 공급자로 갑니다.

전환이 실제로 반영되었는지는 설정 파일을 직접 보면 확실합니다.

```bash
# 핵심 필드만 확인 (키는 앞 6자리만 표시)
node -e '
const os = require("os"), fs = require("fs");
const s = JSON.parse(fs.readFileSync(os.homedir() + "/.claude/settings.json", "utf8"));
const env = s.env ?? {};
const token = env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? "";
console.log("base_url:", env.ANTHROPIC_BASE_URL ?? "(공식 기본값)");
console.log("model   :", env.ANTHROPIC_MODEL ?? "(지정 안 함)");
console.log("token   :", token ? token.slice(0, 6) + "..." : "(없음, 공식 로그인 사용)");
console.log("hooks   :", s.hooks ? Object.keys(s.hooks).join(", ") : "(없음)");
'
```

1. **무엇을 생성하는가**: 공급자 레코드가 `cc-switch.db`에 하나 생기고, Enable을 누르면 `~/.claude/settings.json`의 `env`에 주소·인증 값·모델이 기록됩니다.
2. **어떤 값을 전달하는가**: 프리셋이 채운 주소와 모델, 사용자가 입력한 키입니다. 키는 live 파일에도 들어가므로(직결 모드), 파일 권한이 0600인지 함께 보면 좋습니다.
3. **CC Switch가 무엇을 처리하는가**: 기존 `hooks`, `permissions`, 플러그인 설정을 그대로 둔 채 핵심 필드만 바꿉니다. 위 스크립트의 `hooks` 줄이 전환 전후로 같다면 정상입니다.
4. **어떤 결과를 반환하는가**: Claude Code의 다음 요청이 새 주소로 나갑니다. 공식 공급자로 돌아가려면 Claude Official 카드를 Enable하고, 필요하면 Claude Code에서 `/login`을 합니다.

Codex, Gemini CLI, Grok Build는 프로세스가 시작할 때 설정을 읽으므로, 모델이 바뀌는 전환 뒤에는 터미널이나 CLI를 다시 시작해야 합니다. Claude Desktop은 앱을 완전히 종료했다가 다시 엽니다.

---

## 설치할 때 주의할 점

- **공식 경로에서만 받습니다.** 공식 사이트는 `ccswitch.io` 하나이고, 설치 파일은 GitHub Releases, Homebrew Cask, AUR `cc-switch-bin`에서 받습니다. 이름이 비슷한 사이트나 재배포본은 키를 다루는 앱인 만큼 특히 피해야 합니다.
- **연결 확인(Connectivity check) 통과가 정상 동작을 뜻하지 않습니다.** 주소에 닿는지만 보고 실제 모델 요청은 보내지 않으므로, 키나 모델명이 틀려도 통과합니다.
- **형식이 다른 공급자는 라우팅 없이 동작하지 않습니다.** OpenAI·Gemini 형식 공급자를 Claude Code에서 직결로 쓰면 보통 404나 405가 납니다. 카드에 "라우팅 필요" 표시가 붙은 공급자는 로컬 라우팅을 먼저 켭니다.
- **WSL은 자동으로 감지하지 않습니다.** 디렉터리 재정의로 경로를 지정해야 하고, 로컬 라우팅을 쓰려면 WSL2를 mirrored 네트워킹 모드로 바꿔야 합니다. 기본 NAT 모드에서는 WSL 안의 `127.0.0.1`이 Windows의 CC Switch에 닿지 않습니다.
- **Linux Wayland + NVIDIA**에서 AppImage 창이 클릭되지 않거나 크기 조절 때 검게 변하면 `CC_SWITCH_GDK_BACKEND=wayland`로 실행합니다.
- **셸 프로필의 공급자 환경 변수를 정리합니다.** `~/.zshrc` 등에 남은 `ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*` 변수는 CC Switch가 쓴 설정을 덮어쓸 수 있어서, 전환했는데 반영되지 않는 것처럼 보입니다. CC Switch는 이런 충돌을 감지하면 화면 상단에 경고 배너를 띄우고, 백업(`~/.cc-switch/backups/env-backup-<시각>.json`)을 만든 뒤 선택한 변수를 지우는 기능을 제공합니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 공급자 전환과 프로젝트 구성 →](03-usage-provider-switching.md)
