---
repository: farion1231/cc-switch
url: https://github.com/farion1231/cc-switch
stars: 138071
studiedAt: 2026-09-29
status: draft
---

# farion1231/cc-switch

CC Switch는 Claude Code, Codex, Gemini CLI 같은 AI 코딩 도구의 API 공급자 설정을 한 데스크톱 앱에서 바꾸는 관리 도구입니다.
공급자 전환 외에 MCP, Skills, 프롬프트, 세션 기록, 사용량 추적을 도구별로 모아 관리하고, 로컬 라우팅으로 API 형식 변환과 장애 조치를 처리합니다.

## 01. 어떤 문제를 푸는가

AI 코딩 도구는 저마다 설정 형식이 달라서 공급자를 바꾸려면 JSON, TOML, YAML, `.env` 파일을 손으로 고쳐야 합니다.
MCP, Skills, 프롬프트도 도구마다 따로 유지해야 합니다. CC Switch는 이 작업을 프리셋 선택과 키 입력, 클릭 한 번으로 줄이는 것을 목표로 합니다.

- 해결 대상 : 도구별로 흩어진 설정 파일을 직접 편집해야 공급자를 바꿀 수 있는 문제[^s1]
- 관리 대상 도구 : Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build, OpenCode, OpenClaw, Hermes, Pi, MiniMax Code 10개[^s1]
- 프리셋 : AWS Bedrock, NVIDIA NIM, 커뮤니티 릴레이를 포함한 90개 이상의 공급자 프리셋[^s1]
- 최소 개입 원칙 : 앱을 지워도 각 도구가 정상 동작하도록 설계함. 그래서 전환 모드 도구에서는 현재 활성 공급자를 삭제할 수 없음[^s1]
- 공식 사이트는 ccswitch.io 하나뿐이라고 README가 명시함[^s1]
- 라이선스 MIT, 기술 스택은 Tauri 2 · Rust · React 18 · TypeScript · SQLite[^s1]
- 공식 사이트는 CC Switch를 오픈소스 무료 데스크톱 앱으로 소개하고 공급자 설정, 로컬 라우팅, MCP, Skills, 세션, 사용량 관리를 기능으로 듦[^s6]

## 02. 핵심 구조

프론트엔드는 React + TypeScript, 백엔드는 Tauri 2 + Rust이며 둘은 Tauri IPC(`invoke`)로 연결됩니다.
백엔드는 Commands → Services → DAO → SQLite 계층으로 나뉘고, Services에서 실제 설정 파일 쓰기와 로컬 라우팅으로 갈라집니다.

```text
Frontend (React + TypeScript)
  Components ── Hooks ── TanStack Query ── src/lib/api
                              │ Tauri IPC (invoke)
Backend (Tauri 2 + Rust)
  Commands ─► Services ─┬─► DAO ─► SQLite (~/.cc-switch/cc-switch.db)
                        ├─► Live config writers (atomic write)
                        │     ~/.claude, ~/.codex, ~/.gemini, ...
                        └─► Local routing (proxy/): forwarding, format
                              conversion, failover, usage accounting
```

- SSOT(single source of truth) : 공급자, MCP, 프롬프트, Skills, 프로젝트, 사용량을 모두 `~/.cc-switch/cc-switch.db` (SQLite)에 저장함[^s2]
- 기기별 설정 : 디렉터리 재정의, 백업 정책 등은 `~/.cc-switch/settings.json` 에 두고 클라우드 동기화하지 않음[^s2]
- 두 가지 쓰기 모드[^s1][^s2]
    - Switch : 한 번에 하나의 공급자만 활성화. Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build
    - Coexist : 여러 공급자를 도구 자체 설정에 함께 기록하고 도구 안에서 고름. OpenCode, OpenClaw, Hermes, Pi, MiniMax Code
- 원자적 쓰기 : 모든 live 설정을 "임시 파일 + rename"으로 기록해 파일 손상을 막음[^s2]
- 동시성 : 데이터베이스 연결을 Mutex로 보호함[^s2]
- 로컬 라우팅 : live 설정 쓰기와 별도 경로. Claude Code, Codex, Gemini CLI, Grok Build의 요청을 로컬에서 받아 전달·형식 변환·장애 조치·과금 집계를 함[^s2]
- 주요 서비스 : `ProviderService` (공급자 CRUD·전환), `McpService`, `SkillService` / `PromptService`, `ProfileService` (프로젝트 스냅샷), `ProxyService` (로컬 라우팅), `session_manager` 모듈[^s2]
- 디렉터리 : `src/` (프론트엔드, `config/` 에 도구별 프리셋), `src-tauri/src/` (`commands/`, `services/`, `database/`, `proxy/`)[^s2]

## 03. 주요 기능

- 핵심 필드만 교체 : 전환 시 엔드포인트, 키, 모델명, API 프로토콜 등만 바꾸고 플러그인, hooks, 권한, MCP, 직접 넣은 환경 변수, 주석, 서식은 그대로 둠[^s1]
- 첫 기록 백업 : 각 설정 파일을 처음 다시 쓰기 전에 원본을 `~/.cc-switch/backups/live-first-write/` 에 보관함[^s1]
- 프로젝트 : Claude Code·Codex의 공급자, MCP, Skills, 프롬프트 파일을 묶어 저장하고 한 번에 전체 구성을 바꿈. Claude Desktop은 공급자만 저장함[^s1]
- API 형식 변환 : Anthropic Messages, OpenAI Chat Completions, OpenAI Responses, Gemini Native 사이를 변환함. Claude Code에서 GPT를, Codex에서 Claude를 쓰는 구성이 가능함[^s1]
- 자동 장애 조치 : 도구별 failover 큐를 두고 요청 실패 시 다음 공급자로 넘어감. circuit breaker와 공급자 상태 모니터링을 함께 씀[^s1]
- Rectifier : 일부 업스트림이 처리하지 못하는 요청(Thinking 서명, 이미지 미지원 등)을 자동으로 고침[^s1]
- OAuth 인증 센터 (Beta) : GitHub Copilot, ChatGPT, xAI(Grok) 계정 여러 개에 로그인해 구독을 공급자로 씀. Codex의 OpenAI Official을 제외하면 로컬 라우팅이 필요함[^s1]
- MCP 패널 : MCP 서버를 한곳에서 관리하고 서버마다 동기화할 도구를 고름. 기존 설정 가져오기와 Deep Link 가져오기를 지원함[^s1]
- 프롬프트 : 도구별 Markdown 라이브러리. 활성화하면 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 에 기록하고, 기존 파일 내용은 먼저 라이브러리에 저장함[^s1]
- Skills : skills.sh 검색, GitHub 저장소·ZIP 설치, 일괄 업데이트. symlink 또는 복사로 도구에 배포함[^s1]
- 사용량 대시보드 : 로컬 라우팅 없이도 각 도구의 세션 로그를 스캔해 요청, 토큰, 캐시 적중률, 비용을 공급자·모델별로 집계함[^s1]
- 할당량·잔액 : Claude, ChatGPT, Gemini, SuperGrok 구독 할당량과 Coding Plan 5시간/주간/월간 한도, DeepSeek·OpenRouter 등 잔액을 카드와 트레이에 표시함[^s1]
- 세션 관리자 : 도구별 대화 기록을 검색하고 재개 명령을 복사함. OpenClaw와 Hermes 세션 재개는 아직 지원하지 않음[^s1]
- 클라우드 동기화 : WebDAV 또는 S3 호환 스토리지로 기기 간 동기화함[^s1]
- Deep Link : `ccswitch://v1/import?resource={type}&app={app}&name={name}&...` 형식으로 공급자, MCP, 프롬프트, Skill을 가져옴. `resource` 는 `provider` / `mcp` / `prompt` / `skill`[^s4]
- 사용량 스크립트 보호 : Deep Link의 `usageEnabled` 기본값은 false. 가져오기 확인 창에 스크립트 전문을 보여 주고, 명시적 `true` 가 없으면 비활성 상태로 가져옴[^s4]

도구별 지원 범위는 다음과 같습니다.[^s1]

| 도구 | 공급자 | 로컬 라우팅 | 트레이 전환 | MCP | Skills | 프롬프트 |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| Claude Code | Switch | ✓ | ✓ | ✓ | ✓ | CLAUDE.md |
| Claude Desktop | Switch | Model Mapping만 | – | – | – | – |
| Codex | Switch | ✓ | ✓ | ✓ | ✓ | AGENTS.md |
| Gemini CLI | Switch | ✓ | ✓ | ✓ | ✓ | GEMINI.md |
| Grok Build | Switch | ✓ | ✓ | ✓ | ✓ | AGENTS.md |
| OpenCode | Coexist | – | – | ✓ | ✓ | AGENTS.md |
| OpenClaw | Coexist | – | – | – | – | Workspace editor |
| Hermes | Coexist | – | – | ✓ | ✓ | Memory |
| Pi | Coexist | – | – | – | ✓ | AGENTS.md, SYSTEM.md 등 |
| MiniMax Code | Coexist | – | – | ✓ | ✓ | AGENTS.md |

## 04. 시작하기

설치 파일은 Releases에서 받거나 패키지 관리자로 설치합니다.
요구 사양은 Windows 10 이상, macOS 12 (Monterey) 이상, Linux는 x86_64 또는 ARM64에 glibc 2.35+와 WebKitGTK 4.1입니다.[^s1]

```bash
# macOS : Homebrew 설치 (권장)
brew install --cask cc-switch
# macOS : 업데이트
brew upgrade --cask cc-switch
```

```bash
# Arch Linux : paru 설치 (권장)
paru -S cc-switch-bin
```

Windows는 `.msi` 설치 파일 또는 Portable `.zip` 을, Linux는 `.deb` / `.rpm` / `.AppImage` 를 Releases에서 받습니다. macOS 빌드는 Universal이며 Apple 서명·공증을 거쳤다고 합니다.[^s1]

기본 사용 순서는 다음과 같습니다.[^s1]

- 공급자 추가 : 툴바의 + 버튼 → 프리셋 선택 또는 사용자 설정
- 전환 : 공급자 선택 후 "Enable" (Coexist 도구는 "Add"), 또는 트레이에서 공급자 이름 클릭
- 반영 : Claude Code는 재시작 불필요. Codex, Gemini CLI, Grok Build는 터미널이나 CLI 재시작. Claude Desktop은 앱 재시작
- 첫 실행 시 기존 Claude Code, Codex, Gemini CLI, Grok Build 설정을 `default` 공급자로 자동 가져옴

Claude Code에서 OpenAI 형식 공급자를 쓰려면 로컬 라우팅을 켭니다.
"Settings → Routing → Local Routing"에서 "Routing Master Switch"를 켜고, "Routing Enabled" 아래 Claude Code를 켜면 됩니다.[^s1][^s3]

```text
# 로컬 라우팅을 켠 뒤 Claude Code 설정(~/.claude/settings.json)에 들어가는 값
ANTHROPIC_BASE_URL = http://127.0.0.1:15721   # 기본 로컬 라우팅 주소
인증 항목 = PROXY_MANAGED                       # 실제 키 대신 자리표시자
```

(실제 공급자 주소, 키, 모델은 CC Switch에만 저장됩니다. 처음 takeover를 켠 뒤에는 새 터미널 세션을 열어야 반영됩니다.)[^s1][^s3]

팀에서 공급자를 공유할 때는 Deep Link를 씁니다.[^s4]

```text
# 공급자 가져오기 링크 (공식 문서 예시)
ccswitch://v1/import?resource=provider&app=claude&name=My%20Provider&endpoint=https%3A%2F%2Fapi.example.com&apiKey=sk-xxx
```

소스에서 빌드할 때는 Node.js 20.19+ 또는 22.12+, pnpm 10, Rust 1.95가 필요합니다.[^s2]

```bash
# 의존성 설치
pnpm install
# 핫 리로드 개발 서버 (Vite 3000 포트 + Tauri 창)
pnpm dev
# 서명 키 없이 로컬 빌드
pnpm tauri build -c '{"bundle":{"createUpdaterArtifacts":false}}'
```

## 05. 최근 변화

릴리스가 1~2주 간격으로 나오고, 최근 세 번은 Codex와 로컬 라우팅의 호환성 수정이 중심입니다.
조사 시점 CHANGELOG의 최신 항목은 3.20.4입니다.[^s5]

- 3.20.4 (2026-09-22)[^s5]
    - MiniMax Code가 10번째 관리 도구로 추가됨 (#7383). `~/.minimax/config.yaml` 에 Coexist 방식으로 기록하고 MCP 양방향 동기화, Skills, `AGENTS.md`, 세션 브라우저를 지원함
    - Claude Desktop 3P 설정이 Linux(Flatpak 포함)에서 동작함 (#7331)
    - 요청 로그에 초당 출력 토큰 표시 (#3369)
    - Codex 0.154+ 의 `additional_tools` 항목이 엄격한 Chat 게이트웨이에서 400을 내던 문제 등 프록시 수정
    - DB 스키마 v18 → v19 마이그레이션. 46 commits, 156 files changed
- 3.20.3 (2026-09-11)[^s5]
    - 빈 `reasoning_content` 를 매 청크에 넣는 업스트림이 Claude Code에 빈 Thought 블록을 쏟아내던 문제 수정 (#7227)
    - 정상 종료 때마다 Claude의 재시도·타임아웃 설정이 Codex, Gemini, Grok Build 프록시 행에 복사되던 데이터 문제 수정 (#7210)
    - Claude 공급자 편집기에 "Disable Artifact Tool" 토글 추가. `env.CLAUDE_CODE_DISABLE_ARTIFACT="1"` 을 설정함
- 3.20.2 (2026-09-07)[^s5]
    - Codex 라우팅에서 xAI 네이티브 Responses API로 Grok 모델이 동작하도록 호환성 수정
    - 매 턴 프롬프트 prefix 캐시를 깨던 프록시 문제 수정 (#6941)
    - DB 스키마 변경 없음. 52 commits, 71 files changed

## 06. 커뮤니티에서 반복되는 주제

열린 이슈 목록은 이번 조사에서 직접 조회하지 못해, 검색으로 찾은 개별 이슈만 확인했습니다.
확인한 이슈는 모두 Codex 연동과 로컬 라우팅의 네트워크 동작에 몰려 있습니다.

- Codex 모델 매핑 : 매핑을 바꿔도 Codex가 이전 모델을 계속 보여 준다는 보고 (Open). 답변자(guomz)는 Codex 156 버전이 모델 목록을 능동적으로 갱신하지 않게 바뀐 탓이라고 설명함[^s7]
- 시스템 프록시 캐시 : macOS에서 시작 시점의 시스템 프록시(`127.0.0.1:7890` 등)를 캐시해, 프록시를 끈 뒤에도 502가 나고 재시작해야 복구된다는 보고 (Open). Windows에서도 같은 현상이 있다는 댓글이 있음. PR #7292의 "Follow system proxy" 토글과 PR #7030의 자동 재구성이 언급됨[^s8]
- Codex service tier : 3.16.5 Windows에서 `cc-switch-model-catalog.json` 의 `service_tiers` 를 빈 배열로 써서 `priority` 경고가 뜨고 `service_tier` 가 요청에서 빠진다는 보고. #5234의 중복으로 닫힘[^s9]
- 전환 후 Codex 설정 경고 : 3.20.4 Windows에서 공급자 전환 후 `mcp_servers.*.type is ignored` 경고가 뜬 사례. 오래된 MCP 설정 형식과 폐기된 `disable_response_storage` 가 원인으로 정리되고 닫힘[^s10]

## 07. 실제 개발에서 어떻게 쓰는가

저장소에 포함된 "Using GPT Models in Claude Code" 가이드는 Claude Code를 계속 Anthropic Messages로 요청하게 두고, 로컬 라우팅이 Responses로 바꿔 보내는 구성을 설명합니다.
가이드는 CC Switch 3.17.0 이상을 기준으로 합니다.[^s3]

- 방법 1 (API Key) : OpenAI Responses API 호환 게이트웨이를 공급자로 추가하고 Advanced Options의 API Format을 `OpenAI Responses API (Requires routing)` 로 바꿈[^s3]
- 방법 2 (ChatGPT 구독) : Claude Code 탭에서 `Codex` 프리셋을 고르고 `Sign in with ChatGPT` 로 device-code 로그인. 자격 증명은 `~/.cc-switch/codex_oauth_auth.json` 에 저장됨[^s3]
- 모델 매핑 : 최소한 `Default fallback model` 을 채워야 함. 비워 두면 매칭되지 않은 요청이 원래 Claude 모델명으로 업스트림에 가서 오류가 남[^s3]
- 인증 필드 : 기본값 `ANTHROPIC_AUTH_TOKEN` 을 유지함. `ANTHROPIC_API_KEY` 로 바꾸면 `x-api-key` 를 보내 대부분의 OpenAI 호환 게이트웨이에서 401/403이 남[^s3]
- 검증 : 새 세션에서 `/model` 메뉴를 보고, Settings → Routing의 `Current Provider` 와 `Total Requests` 를 확인함[^s3]
- 컨텍스트 : 라우팅된 공급자는 기본 200K 창으로 자동 압축됨. 업스트림 창이 더 커도 200K 초과분은 현재 쓰이지 않음[^s3]
- 비용 표시 : 토큰 수는 정확하지만 달러 금액은 공개 API 가격으로 환산한 추정치임[^s3]
- 서버·SSH 환경 : 데스크톱 앱만 제공하므로 커뮤니티가 만든 CC Switch CLI를 권함. `~/.cc-switch` 데이터 디렉터리를 공유하지만 지원 DB 버전이 늦을 수 있음[^s1]

## 08. 한계와 주의점

- GUI가 필요한 데스크톱 앱이며 공식 CLI·headless 버전이 없음[^s1]
- Linux는 RHEL / Rocky / Alma 8–9를 아직 지원하지 않음. Flatpak은 공식 릴리스에 없음[^s1]
- 공식 공급자(Claude Official 등)는 로컬 라우팅을 거칠 수 없음. 예외는 Codex의 OpenAI Official[^s1]
- 로컬 라우팅 없이 OpenAI·Gemini 형식 공급자를 쓰거나 형식을 잘못 고르면 보통 404 또는 405가 남[^s1]
- "Connectivity check"는 주소 도달만 확인하고 실제 모델 요청을 보내지 않아 키와 모델명은 검증하지 못함[^s1]
- 도구 안에서 `/model` 로 바꾼 모델은 다음 전환 때 공급자에 저장된 모델로 되돌아감[^s1]
- WSL을 자동 감지하지 않음. WSL2 기본 NAT 모드에서는 WSL 안의 `127.0.0.1` 이 Windows의 로컬 라우팅에 닿지 않으므로 mirrored 네트워킹이 필요함[^s1]
- Linux Wayland + NVIDIA에서 AppImage 클릭이 먹지 않거나 크기 조절 시 검은 화면이 될 수 있음. `CC_SWITCH_GDK_BACKEND=wayland` 로 우회함[^s1]
- 구독을 공식 클라이언트 밖에서 쓰는 것은 공급사 약관 위반일 수 있어 위험을 직접 판단하라고 README가 안내함[^s1]
- 백엔드 테스트 일부가 `~/.cc-switch`, `~/.codex` 를 읽고 쓰므로 로컬 실행 시 `CC_SWITCH_TEST_HOME` 을 임시 디렉터리로 지정해야 함[^s2]

## 09. 더 알아볼 것

- 열린 이슈 전체 목록과 규모는 GitHub API·이슈 목록 페이지 접근이 막혀 확인하지 못했습니다.
- GitHub Releases 페이지의 최신 릴리스 태그와 배포 파일 목록은 직접 확인하지 못했고, 최근 변화는 `CHANGELOG.md` 기준입니다.
- CONTRIBUTING은 Switch 모드 전환 시 현재 live 설정을 공급자에 되채운다고 쓰고, README FAQ는 핵심 필드만 공급자에 저장한다고 씁니다. 되채우는 범위가 정확히 어디까지인지는 코드로 확인하지 못했습니다.
- 자동 장애 조치의 circuit breaker 임계값과 복구 조건은 확인하지 못했습니다.
- 90개 이상 프리셋이 도구별로 어떻게 나뉘는지는 확인하지 못했습니다.
- 리포트 기준(2026-09-24) Star 135,590개, 24시간 증가 +1,396이었고, 2026-09-28 리포트 값은 137,479개(+317)입니다. 조사 시점(2026-09-29) API 값은 138,071개로 09-24 대비 2,481개, 09-28 대비 592개 많습니다.

## 참고 자료

- [CC Switch README (main)](https://github.com/farion1231/cc-switch/blob/main/README.md) (readme)
- [CONTRIBUTING.md](https://github.com/farion1231/cc-switch/blob/main/CONTRIBUTING.md) (code)
- [Using GPT Models in Claude Code with CC Switch](https://github.com/farion1231/cc-switch/blob/main/docs/guides/claude-codex-routing-guide-en.md) (docs)
- [User Manual 5.3 Deep Link Protocol](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/5-faq/5.3-deeplink.md) (docs)
- [CHANGELOG.md (3.20.2 ~ 3.20.4)](https://github.com/farion1231/cc-switch/blob/main/CHANGELOG.md) (release)
- [CC Switch 공식 사이트](https://ccswitch.io) (website)
- [Issue #7231: Codex模型映射bug](https://github.com/farion1231/cc-switch/issues/7231) (issues)
- [Issue #4642: local proxy caches macOS system proxy settings](https://github.com/farion1231/cc-switch/issues/4642) (issues)
- [Issue #5254: Service tier configuration not preserved](https://github.com/farion1231/cc-switch/issues/5254) (issues)
- [Issue #7660: 切换供应商后codex的智能体配置报错](https://github.com/farion1231/cc-switch/issues/7660) (issues)

[^s1]: [CC Switch README (main)](https://github.com/farion1231/cc-switch/blob/main/README.md)
[^s2]: [CONTRIBUTING.md](https://github.com/farion1231/cc-switch/blob/main/CONTRIBUTING.md)
[^s3]: [Using GPT Models in Claude Code with CC Switch](https://github.com/farion1231/cc-switch/blob/main/docs/guides/claude-codex-routing-guide-en.md)
[^s4]: [User Manual 5.3 Deep Link Protocol](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/5-faq/5.3-deeplink.md)
[^s5]: [CHANGELOG.md (3.20.2 ~ 3.20.4)](https://github.com/farion1231/cc-switch/blob/main/CHANGELOG.md)
[^s6]: [CC Switch 공식 사이트](https://ccswitch.io)
[^s7]: [Issue #7231: Codex模型映射bug](https://github.com/farion1231/cc-switch/issues/7231)
[^s8]: [Issue #4642: local proxy caches macOS system proxy settings](https://github.com/farion1231/cc-switch/issues/4642)
[^s9]: [Issue #5254: Service tier configuration not preserved](https://github.com/farion1231/cc-switch/issues/5254)
[^s10]: [Issue #7660: 切换供应商后codex的智能体配置报错](https://github.com/farion1231/cc-switch/issues/7660)
