---
repository: NousResearch/hermes-agent
url: https://github.com/NousResearch/hermes-agent
stars: 246633
studiedAt: 2026-09-18
status: draft
---

# NousResearch/hermes-agent

Hermes Agent는 Nous Research가 만든 자기 개선형 AI 에이전트입니다.
터미널과 메신저에서 같은 에이전트를 쓰고, 대화에서 얻은 것을 Skill과 메모리로 남겨 다음 세션에 이어 쓰는 구조를 내세웁니다.

## 01. 어떤 문제를 푸는가

대부분의 코딩 에이전트는 노트북의 한 터미널 세션에 묶여 있고, 세션이 끝나면 알게 된 것도 같이 사라집니다.
Hermes는 에이전트를 상주 프로세스로 두고, 학습 루프와 메모리를 내장해서 그 두 가지를 함께 해결하려 합니다.

- 해결 대상 : 세션마다 맥락이 끊기고, 에이전트가 특정 기기에 묶이는 문제[^s1]
- 접근 : 학습 루프(Skill 자동 생성·개선, 메모리 적립, 과거 세션 검색)를 에이전트에 내장함[^s1]
- 실행 위치 : $5짜리 VPS, GPU 클러스터, 유휴 시 비용이 거의 들지 않는 서버리스 환경까지 지원함[^s1]
- 모델 종속 없음 : Nous Portal, OpenRouter, OpenAI, 자체 엔드포인트를 `hermes model` 로 바꿈[^s1]
- 라이선스는 MIT, 주 언어는 Python, 기본 브랜치는 main, 공식 사이트는 hermes-agent.nousresearch.com[^s2]
- 2025-07-22 생성, Star 246,633개, Fork 51,666개 (2026-09-18 조회 기준)[^s2]
- GitHub가 집계한 열린 이슈는 43,948건임. 이 수치는 열린 PR을 포함한 값임[^s2]

## 02. 핵심 구조

진입점이 두 개입니다. 터미널에서 `hermes` 로 TUI를 띄우거나, 게이트웨이 프로세스를 띄워 메신저에서 같은 에이전트와 대화합니다.

- CLI / TUI : 멀티라인 편집, 슬래시 명령 자동완성, 대화 기록, 작업 중 끼어들어 방향 바꾸기, 도구 출력 스트리밍[^s1]
- 게이트웨이 : Telegram, Discord, Slack, WhatsApp, Signal, Email, CLI를 프로세스 하나로 처리함. 음성 메모 전사와 플랫폼 간 대화 연속성을 제공함[^s1]
- 터미널 백엔드 7종 : local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox. Daytona와 Modal은 유휴 시 환경을 재우고 필요할 때 깨우는 방식임[^s1]
- 서브에이전트 : 병렬 작업 흐름을 분리해서 띄움. Python 스크립트가 RPC로 도구를 호출해 여러 단계를 컨텍스트 비용 없이 한 턴으로 접음[^s1]
- 설치 위치 : Linux·macOS·WSL2는 `~/.hermes`, 네이티브 Windows는 `%LOCALAPPDATA%\hermes`[^s1]

용어는 다음과 같이 정리됩니다.

- Skill : 경험에서 자동으로 만들어지고 사용 중에 스스로 다듬어지는 절차적 기억. agentskills.io 표준과 호환됨[^s1]
- Memory : 에이전트가 직접 관리하는 기억. 주기적으로 적립하라는 신호를 스스로 보냄[^s1]
- Session search : FTS5 전문 검색에 LLM 요약을 붙여 과거 대화를 다시 찾음[^s1]
- User modeling : Honcho 기반으로 사용자 모델을 세션에 걸쳐 쌓음[^s1]

## 03. 주요 기능

- 학습 루프 : 복잡한 작업 뒤 Skill을 자동으로 만들고, 쓰는 동안 그 Skill을 개선함[^s1]
- 크론 : 자연어로 등록하는 스케줄러. 일일 리포트, 야간 백업, 주간 점검을 무인으로 돌리고 결과를 원하는 플랫폼으로 보냄[^s1]
- MCP : 임의의 MCP 서버를 붙여 기능을 확장함[^s1]
- 도구 40여 종과 toolset 체계, Context Files로 프로젝트 맥락을 모든 대화에 얹음[^s3]
- 보안 : 명령 승인, DM 페어링, 컨테이너 격리를 문서에서 별도 항목으로 다룸[^s3]
- 연구용 : 배치 trajectory 생성과 압축을 지원함. 다음 세대 도구 호출 모델 학습을 상정함[^s1]
- Nous Portal : 모델 300여 종과 Tool Gateway(웹 검색 Firecrawl, 이미지 생성 FAL, TTS OpenAI, 클라우드 브라우저 Browser Use)를 구독 하나로 묶음. 도구별로 자기 키를 쓰는 것도 가능함[^s1]
- OpenClaw 이전 : SOUL.md, 메모리, Skill, 명령 허용 목록, 메신저 설정, 허용된 API 키를 가져옴[^s1]

## 04. 시작하기

설치 스크립트가 uv, Python 3.11, Node.js, ripgrep, ffmpeg를 함께 설치합니다.
Windows에서는 관리자 권한 없이 쓰는 휴대용 Git Bash(MinGit)까지 받아 시스템 Git과 분리합니다.

```bash
# Linux, macOS, WSL2, Termux
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc
hermes
```

```powershell
# Windows 네이티브
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

기본 명령은 다음과 같습니다.

```bash
hermes              # 대화형 CLI 시작
hermes model        # 공급자와 모델 선택
hermes tools        # 켤 도구 고르기
hermes gateway      # 메신저 게이트웨이 시작
hermes setup        # 전체 설정 마법사
hermes doctor       # 문제 진단
hermes update       # 최신 버전으로 갱신
```

설치와 예제는 공식 README 기준입니다.[^s1]

(백신이 `%LOCALAPPDATA%\hermes\bin\uv.exe` 를 격리하는 사례가 있고, README는 이를 오탐으로 보고 파일 해시가 아니라 폴더를 예외 처리하라고 안내합니다.)

## 05. 최근 변화

- v0.21.3 / 태그 v2026.9.14 (2026-09-14)[^s4]
    - v0.21.2 이후 약 338개 PR을 묶은 패치. Docker 이미지와 Cloud 배포가 이 태그를 따라감
    - 원격 대시보드 세션이 새로고침이 몰릴 때 만료되던 문제를 고침. 같은 갱신 토큰을 쓰는 동시 요청을 합침
    - 장시간 실행 시 `state.db` 쓰기 핸들이 중복으로 쌓이던 문제를 고침
- v0.21.2 / v2026.9.11 (2026-09-11)[^s5]
    - `state.db` 안정화 패치. PR 6개로 이슈 44건을 닫음
    - 두 번째 writer가 서로의 잠금을 취소하고 정상 DB를 손상으로 보고하던 원인을 제거함
    - v0.21.1 이후 나흘간 비머지 커밋 947개, 변경 파일 1,869개, 병합 PR 312개, 기여자 140명으로 집계함
- v0.21.1 / v2026.9.7 (2026-09-07)[^s6]
    - 코드베이스 모듈화, 파일 작업·시작 성능, 데스크톱 세션 제어, MCP 인가, 크론 전달, 위임 안정성 작업을 묶음
    - v0.21.0 이후 비머지 커밋 5,139개, 변경 파일 4,364개로 집계함
- v0.21.0 / v2026.8.31 (2026-08-31), Pantheon Release[^s7]
    - Bot Mode를 데스크톱 앱에 기본 포함. 에이전트 프로필마다 이름과 아바타를 주고 그룹 대화에 참여시킴
    - 크론 작업에 메모리와 연속성을 붙여 예약 실행 사이에 학습이 이어지게 함
    - 서브에이전트를 실행 도중에 조정하고, 에이전트가 데스크톱의 브라우저를 직접 조작할 수 있게 함
    - v0.20.0 이후 약 5,800 커밋, 병합 PR 약 2,475개, 이슈 약 2,100건 종료, 기여자 760명 이상으로 집계함

## 06. 커뮤니티에서 반복되는 주제

최근 열린 이슈는 세션 상태와 게이트웨이 쪽에 몰려 있습니다. 라벨도 `comp/gateway`, `area/sessions`, `comp/desktop` 가 자주 붙습니다.

- 세션 상태 : 압축과 절단이 서로를 부르는 무한 루프에 빠지는 사례, 오래된 세션 참조가 시작할 때마다 다시 전송되는 사례[^s8]
- 모델 전환 : 세션 도중 모델을 바꾸면 압축 임계값이 이전 모델 값으로 되돌아간다는 보고[^s8]
- 게이트웨이 : 백엔드 이벤트 루프가 멈춰 UI가 비고 세션이 사라진 것처럼 보이는 P1 이슈[^s8]
- 크론 : 업그레이드 뒤 크론 작업이 조용히 실패한다는 보고[^s8]
- 플랫폼 편차 : Termux의 `PROJECT_ROOT` NameError, 정션으로 옮긴 메모리·Skill 디렉터리에서 Windows 데스크톱이 준비 전 시간 초과되는 문제[^s8]
- 대규모 리팩터링 : 거대 파일 해체 작업이 진행 중이며 잔여 작업 규모를 두고 논의가 이어짐[^s9]

## 07. 한계와 주의점

- 열린 이슈·PR이 43,948건으로 집계됩니다. 변경 속도가 매우 빨라(패치 한 번에 PR 수백 개) 특정 버전에 고정해 쓸지 먼저 정하는 편이 낫습니다.[^s2][^s4]
- 패치 릴리스 노트가 릴리스 창의 모든 변경을 열거하지 않는다고 명시합니다. 상세 내역은 다음 마이너 버전 노트로 넘깁니다.[^s6]
- `state.db` 관련 결함이 0.21.0에서 유입되어 0.21.2에서 정리되었습니다. 세션 저장소는 아직 안정화가 진행 중인 영역입니다.[^s5]
- Termux는 전체 `.[all]` 대신 별도 extra를 씁니다. 음성 관련 의존성이 Android와 맞지 않기 때문입니다.[^s1]
- 기여 시 가상환경을 체크아웃 디렉터리 안에 만들지 말라고 경고합니다. 에이전트가 자기 체크아웃을 상대 경로로 건드리면 실행 중인 런타임이 지워질 수 있습니다.[^s1]
- 설치 스크립트를 파이프로 바로 실행하는 방식이 기본 경로입니다. 실행 전에 스크립트를 확인할지는 사용하는 쪽에서 판단해야 합니다.[^s1]
- 메신저 게이트웨이를 쓰면 대화 상대가 에이전트에 명령할 수 있으므로, 문서의 명령 승인과 DM 페어링 항목을 먼저 보는 편이 낫습니다.[^s3]

## 08. 프론트엔드 개발에서의 활용

Hermes는 프레임워크별 리뷰어를 두는 방식이 아니라, 브라우저·터미널·코드 실행 도구 위에 Skill을 얹는 방식입니다.
프론트엔드 관련 Skill은 기본 번들인 `skills/` 와 별도 선택 대상인 `optional-skills/` 로 나뉘어 있습니다.

### web-development Skill (optional-skills)

- page-agent : 웹 앱 안에 자연어 GUI 코파일럿을 심음. alibaba/page-agent 기반이고 스크린샷 없이 DOM을 텍스트로 읽어 조작함[^s11]
- scrollcraft : 스크롤을 타임라인으로 쓰는 랜딩 페이지를 만듦. 디바이스 계열을 네 가지 이상 섞고 스크롤 위치별 스크린샷으로 확인함[^s11]
- publish-site : 정적 산출물이나 `dist/`·`build/` 를 GitHub Pages·Cloudflare Pages·Netlify에 버전을 붙여 배포하고 롤백함[^s11]
- cloudflare-temporary-deploy : 계정 없이 `wrangler --temporary` 로 Worker를 띄움[^s11]
- har-derived-api-client : 브라우저로 한 번 돌면서 XHR을 HAR로 녹화하고, 거기서 사이트의 내부 JSON API를 뽑아 HTTP 클라이언트로 만듦[^s11]

### 디자인 Skill (skills/creative)

- popular-web-designs : Stripe, Linear, Vercel, Notion 등 54개 디자인 시스템을 색·타이포·컴포넌트·간격·그림자까지 CSS 값으로 담아 둠[^s12]
- claude-design : 브리프 정리 → 변형안 → 로컬 HTML 검증까지의 디자인 절차를 다룸. popular-web-designs가 어휘를, claude-design이 과정을 맡는 구성임[^s12]
- design-md : Google의 DESIGN.md 토큰 스펙을 작성·검증·내보냄. WCAG 대비 검사와 Tailwind·DTCG 내보내기를 포함함[^s12]
- p5js : 제너러티브 아트, 셰이더, 인터랙티브·3D 스케치[^s12]

### 개발 절차 Skill (skills/software-development)

- test-driven-development : RED-GREEN-REFACTOR를 강제함[^s10]
- systematic-debugging : 고치기 전에 원인을 먼저 좁히는 4단계 디버깅[^s10]
- node-inspect-debugger : `--inspect` 와 Chrome DevTools Protocol로 Node를 디버깅함[^s10]
- inspecting-hermes-desktop-dom : CDP로 살아 있는 DOM과 CSS를 읽음[^s10]
- requesting-code-review : 커밋 전에 보안 검사와 품질 게이트를 돌리고 자동 수정함[^s10]
- simplify-code : 최근 변경을 4개 에이전트가 병렬로 정리함[^s10]
- spike : 본 구현 전에 버리는 실험으로 아이디어만 확인함[^s10]

도구 쪽은 `browser_navigate`, `browser_snapshot`, `browser_vision` 으로 브라우저를 다루고 `terminal`, `execute_code`, `patch` 로 코드를 고칩니다.[^s3]

### 활용 예시

- 브랜드 톤에 맞춘 랜딩 페이지 : popular-web-designs에서 참조 시스템을 골라 토큰을 가져오고, claude-design 절차로 변형안을 만든 뒤 publish-site로 올려 링크를 받음
- 스크롤 인터랙션 페이지 : scrollcraft로 섹션마다 다른 장치를 배치하고, 스크롤 위치별 스크린샷으로 깨지는 구간을 확인함
- 디자인 토큰 고정 : design-md로 DESIGN.md를 만들어 WCAG 대비를 검사하고 Tailwind 설정으로 내보내 여러 프로젝트에서 같은 토큰을 씀
- 프로토타입 공유 : cloudflare-temporary-deploy로 계정 없이 임시 URL을 만들어 리뷰만 받고 버림
- 기존 화면에 자연어 조작 붙이기 : page-agent를 임베드해 관리자 화면에서 다섯 단계 클릭을 한 문장으로 대체함
- 공개 API가 없는 화면의 데이터 : har-derived-api-client로 HAR를 녹화하고 내부 엔드포인트를 뽑아, 매번 브라우저를 도는 대신 HTTP로 호출함
- 하이드레이션·런타임 버그 : systematic-debugging으로 원인을 좁히고 node-inspect-debugger로 서버 쪽을, CDP로 실제 DOM을 확인함
- 커밋 전 점검 : requesting-code-review로 보안·품질 게이트를 돌리고 simplify-code로 직전 변경을 정리함
- 야간 UI 점검 : 크론에 브라우저 도구로 주요 화면을 도는 작업을 등록하고 결과를 Telegram으로 받음[^s1]
- 병렬 작업 : `delegate_task` 로 서브에이전트를 띄워 컴포넌트별 작업을 나누고, RPC 스크립트로 반복 단계를 한 턴으로 접음[^s1]
- 격리된 빌드 환경 : Vercel Sandbox나 Daytona 백엔드에서 빌드를 돌리고 유휴 시 환경을 재움[^s1]
- 이동 중 배포 지시 : 게이트웨이를 띄워 Telegram에서 스테이징 배포를 시키고 결과를 같은 대화로 받음[^s1]

### 프론트엔드에서 챙길 점

- web-development Skill은 `optional-skills/` 에 있어 기본 설치에 포함되지 않습니다. 쓰기 전에 켜야 합니다.[^s11]
- page-agent는 DOM 텍스트만 봅니다. 시각적 판단이 필요하면 다른 방법을 쓰라고 Skill 문서가 직접 밝히고 있습니다.[^s11]
- publish-site는 정적 산출물 전용이고 서버 런타임은 다루지 않습니다. 빌드가 필요하면 먼저 빌드한 뒤 출력 디렉터리를 올려야 합니다.[^s11]
- har-derived-api-client는 인증 우회나 봇 차단 회피가 아닙니다. 로그인 세션이 필요하면 헤더와 쿠키를 그대로 이어 쓰는 방식입니다.[^s11]
- 커뮤니티 쪽에는 Vue 3 기반 대시보드(Hermes Studio), 단일 파일 웹 UI(hermes-ui), 화면 요소를 클릭해 주석을 다는 TackMark 같은 프론트엔드 결과물도 모여 있습니다.[^s13]

## 09. 더 알아볼 것

- Skill 자동 생성이 어떤 조건에서 트리거되고 품질을 어떻게 판정하는지는 확인하지 못했습니다.
- 메모리가 무엇을 적립 대상으로 고르는지, 사용자 모델(Honcho)이 어디까지 보관되는지는 확인하지 못했습니다.
- Nous Portal 구독과 자체 키 사용 사이의 기능 차이는 확인하지 못했습니다.
- Daytona·Modal 서버리스 백엔드의 실제 비용과 재개 지연은 확인하지 못했습니다.
- 테스트 규모와 CI 구성은 이번 조사에서 확인하지 못했습니다.
- `optional-skills/` 의 web-development Skill을 켜는 구체적인 명령은 확인하지 못했습니다.
- Skills Hub(agentskills.io)에 올라온 프론트엔드 Skill의 범위와 검증 방식은 확인하지 못했습니다.
- Star 246,633개의 24시간 증가량은 수집하지 않았습니다.

## 참고 자료

- [Hermes Agent README (main)](https://github.com/NousResearch/hermes-agent/blob/main/README.md) (readme)
- [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/NousResearch/hermes-agent) (code)
- [공식 문서](https://hermes-agent.nousresearch.com/docs/) (docs)
- [Release v0.21.3 (v2026.9.14)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.14) (release)
- [Release v0.21.2 (v2026.9.11)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.11) (release)
- [Release v0.21.1 (v2026.9.7)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.7) (release)
- [Release v0.21.0 (v2026.8.31)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31) (release)
- [열린 Issues (최근 생성순)](https://github.com/NousResearch/hermes-agent/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc) (issues)
- [열린 Issues (댓글 많은 순)](https://github.com/NousResearch/hermes-agent/issues?q=is%3Aissue+is%3Aopen+sort%3Acomments-desc) (issues)
- [skills/ 디렉터리 (기본 번들 Skill)](https://github.com/NousResearch/hermes-agent/tree/main/skills) (code)
- [optional-skills/web-development](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development) (code)
- [skills/creative (디자인 Skill)](https://github.com/NousResearch/hermes-agent/tree/main/skills/creative) (code)
- [awesome-hermes-agent (커뮤니티 목록)](https://github.com/0xNyk/awesome-hermes-agent) (website)

[^s1]: [Hermes Agent README (main)](https://github.com/NousResearch/hermes-agent/blob/main/README.md)
[^s2]: [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/NousResearch/hermes-agent)
[^s3]: [공식 문서](https://hermes-agent.nousresearch.com/docs/)
[^s4]: [Release v0.21.3 (v2026.9.14)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.14)
[^s5]: [Release v0.21.2 (v2026.9.11)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.11)
[^s6]: [Release v0.21.1 (v2026.9.7)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.7)
[^s7]: [Release v0.21.0 (v2026.8.31)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31)
[^s8]: [열린 Issues (최근 생성순)](https://github.com/NousResearch/hermes-agent/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc)
[^s9]: [열린 Issues (댓글 많은 순)](https://github.com/NousResearch/hermes-agent/issues?q=is%3Aissue+is%3Aopen+sort%3Acomments-desc)
[^s10]: [skills/ 디렉터리 (기본 번들 Skill)](https://github.com/NousResearch/hermes-agent/tree/main/skills)
[^s11]: [optional-skills/web-development](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development)
[^s12]: [skills/creative (디자인 Skill)](https://github.com/NousResearch/hermes-agent/tree/main/skills/creative)
[^s13]: [awesome-hermes-agent (커뮤니티 목록)](https://github.com/0xNyk/awesome-hermes-agent)
