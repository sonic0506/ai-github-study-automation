---
repository: DietrichGebert/ponytail
url: https://github.com/DietrichGebert/ponytail
stars: 147324
studiedAt: 2026-09-29
status: draft
---

# DietrichGebert/ponytail

Ponytail은 AI 코딩 에이전트가 필요한 만큼만 코드를 쓰도록 만드는 Skill·플러그인 배포판입니다.
"가장 게으른 시니어 개발자"를 규칙 집합으로 옮겨 Claude Code, Codex, Cursor, OpenCode 등 20여 개 에이전트에 붙일 수 있게 합니다.

## 01. 어떤 문제를 푸는가

코딩 에이전트는 날짜 선택기 하나를 요청받아도 라이브러리를 설치하고 래퍼 컴포넌트와 스타일시트를 만드는 식으로 과하게 짓는 경향이 있습니다.
Ponytail은 코드를 쓰기 전에 "정말 필요한가"부터 묻는 판단 순서를 에이전트에 주입해 이 과잉 구현을 줄이려는 프로젝트입니다.

- 해결 대상 : 에이전트가 요청 범위보다 많은 코드·의존성·추상화를 만드는 문제[^s1]
- 대표 예 : 날짜 선택기 요청에 flatpickr 대신 `<input type="date">` 한 줄로 끝냄[^s1]
- 핵심 원칙 : "fewest tokens"가 목표가 아니라, 작업에 필요한 것만 쓰되 검증·오류 처리·보안·접근성은 줄이지 않음[^s1]
- 성격 : 코드를 import 해서 쓰는 라이브러리가 아니라, 에이전트의 시스템 컨텍스트에 규칙을 넣는 Skill·훅·규칙 파일 묶음[^s5]
- About : "Makes your AI agent think like the laziest senior dev in the room. The best code is the code you never wrote." 사이트는 ponytail.dev[^s2]
- 라이선스는 MIT. 저장소 페이지 기준 Star 146,100, Fork 7,800, 열린 이슈 108건, 열린 PR 201건, 커밋 224개 (2026-09-29 조회)[^s2]
- 토픽 : agent-skills, ai-agents, claude-code-plugin, cursor-rules, prompt-engineering, yagni 등[^s2]

## 02. 핵심 구조

저장소는 동작의 본체인 `skills/` 와, 그 동작을 각 에이전트에 싣는 얇은 어댑터들로 나뉩니다.
문서는 "어댑터는 얇게 유지한다"를 규칙으로 두고, Skill이나 훅을 지원하는 호스트는 기존 `skills/`·`hooks/` 를 가리키게 합니다.[^s5]

- `skills/` : 핵심 동작. `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` 여섯 개[^s5]
- `AGENTS.md` : Skill을 지원하지 않는 에이전트용 압축 규칙 파일. 항상 켜져 있는 지시문 역할[^s5]
- `hooks/` : Claude Code·Codex용 Node.js 라이프사이클 훅. `SessionStart` 에서 모드 활성화, `SubagentStart` 에서 서브에이전트 주입, `UserPromptSubmit` 에서 모드 추적[^s7]
- 호스트별 어댑터 : `.claude-plugin/`, `.codex-plugin/`, `.opencode/plugins/ponytail.mjs`, `pi-extension/`, `plugin.yaml`+`__init__.py`(Hermes), `gemini-extension.json`, `.cursor/rules/`, `.windsurf/rules/`, `.clinerules/`, `.kiro/steering/`, `.qoder/rules/` 등[^s5]
- `ponytail-mcp/` : 같은 규칙을 MCP prompt `ponytail` 과 읽기 전용 tool `ponytail_instructions` 로 내보내는 stdio 서버. 매 턴 주입을 대신하지는 않음[^s8]
- `benchmarks/` : promptfoo 기반 단발 벤치마크와 Claude Code 헤드리스 세션 기반 agentic 벤치마크[^s1][^s6]
- npm 패키지 `@dietrichgebert/ponytail` 의 main은 OpenCode 플러그인(`.opencode/plugins/ponytail.mjs`)이고, pi 확장·Skill도 같은 패키지로 배포함[^s11]

지원 방식은 크게 두 단계로 나뉩니다.

- 플러그인 단계 : 매 턴 규칙 주입, `/ponytail` 레벨 전환, 명령어 제공. Claude Code, Codex, OpenCode, pi, Hermes, Gemini CLI, Cursor 훅, Qoder 훅 등[^s5]
- 지시문 단계 : `AGENTS.md` 나 규칙 파일만 읽음. Windsurf, Cline, Copilot Chat, Antigravity, Zed, Amp, Jules, Junie 등. 레벨 전환과 명령어가 없음[^s5][^s1]

## 03. 주요 기능

규칙의 중심은 7단 사다리입니다.
에이전트는 문제를 이해한 뒤, 코드를 쓰기 전에 아래 단계 중 처음으로 성립하는 곳에서 멈춥니다.[^s3]

1. 이게 존재해야 하는가 (YAGNI)
2. 이미 코드베이스에 있는가 → 재사용
3. 표준 라이브러리가 하는가
4. 네이티브 플랫폼 기능이 있는가 (`<input type="date">`, JS 대신 CSS, 앱 코드 대신 DB 제약)
5. 이미 설치된 의존성이 해결하는가
6. 한 줄로 되는가
7. 그제서야 동작하는 최소 코드

- 이해 우선 : 사다리는 문제 이해를 대신하지 않음. 변경이 닿는 코드를 읽고 실제 흐름을 따라간 뒤에 단계를 고름[^s3]
- 버그 수정 : 증상이 아니라 근본 원인을 고침. 수정할 함수의 호출부를 모두 grep하고 공유 함수에 가드를 한 번 넣음[^s3]
- 줄이지 않는 것 : 신뢰 경계의 입력 검증, 데이터 손실을 막는 오류 처리, 보안, 접근성, 실제 하드웨어 보정값, 명시적으로 요청된 것[^s3][^s4]
- 최소 검증 : 분기·루프·파서·금전·보안 경로가 있는 로직은 `assert` 기반 self-check나 작은 테스트 파일 하나를 남김[^s3]
- `ponytail:` 주석 : 한계가 알려진 의도적 단순화(전역 락, O(n²) 스캔 등)에 한계와 업그레이드 경로를 적는 규약[^s3]
- 출력 형식 : 코드 먼저, 그 뒤 생략한 것과 추가할 시점을 3줄 이내로. `[code] → skipped: [X], add when [Y].`[^s3]

강도는 세 단계이고, 명령어로 조정합니다.

- lite : 요청대로 만들되 더 게으른 대안을 한 줄로 제시[^s3]
- full : 사다리를 강제함. 기본값[^s3]
- ultra : 삭제 우선, 한 줄짜리를 내놓으면서 나머지 요구 사항에 이의를 제기함[^s3]
- 기본 레벨은 `PONYTAIL_DEFAULT_MODE` 환경 변수나 `~/.config/ponytail/config.json` 의 `defaultMode` 로 정함[^s1]
- `PONYTAIL_SUBAGENT_MATCHER` : 서브에이전트 `agent_type` 에 대한 정규식으로 주입 대상을 좁힘. 비우면 전부 주입[^s1]

명령어는 Skill을 지원하는 호스트에서만 쓸 수 있습니다.[^s1]

- `/ponytail [lite|full|ultra|off]` : 강도 설정. 인자 없으면 현재 레벨 표시[^s1]
- `/ponytail-review` : 현재 diff의 과잉 설계를 찾아 삭제 목록을 줌. `delete:`, `stdlib:`, `native:`, `yagni:`, `shrink:` 태그로 한 줄씩 적고 `net: -<N> lines possible.` 로 끝냄. 정확성·보안·성능은 범위 밖[^s9]
- `/ponytail-audit` : diff가 아니라 저장소 전체를 감사[^s1]
- `/ponytail-debt` : `ponytail:` 주석을 grep해 부채 장부로 모음. 업그레이드 트리거가 없는 항목에 `no-trigger` 태그를 붙임. 읽기만 하고 파일은 바꾸지 않음[^s10]
- `/ponytail-gain` : 벤치마크 기반 효과 점수판 표시[^s1]

## 04. 시작하기

Claude Code·Codex 플러그인과 Cursor 훅은 Node.js 훅을 실행하므로 `node` 가 비대화형 셸의 PATH에 있어야 합니다.
없어도 Skill은 동작하지만 항상 켜짐 활성화가 조용히 빠집니다.[^s1]

Claude Code에서는 두 명령을 각각 별도 프롬프트로 보내야 설치됩니다.[^s1]

```text
/plugin marketplace add DietrichGebert/ponytail
```

```text
/plugin install ponytail@ponytail
```

```bash
# Codex : 설치 후 codex 의 /hooks 에서 두 훅을 검토·신뢰하고 새 스레드 시작
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

```bash
# Cursor : 체크아웃한 위치의 node 를 실행하므로 옮기면 다시 install
git clone https://github.com/DietrichGebert/ponytail
node ponytail/scripts/cursor-hooks.js install   # --project 를 붙이면 프로젝트 단위
```

```json
// OpenCode : opencode.json 에 추가
{ "plugin": ["@dietrichgebert/ponytail"] }
```

```bash
# 강도 전환 (Skill 지원 호스트에서 대화 중 입력)
/ponytail ultra
# 현재 diff 과잉 설계 검토
/ponytail-review
```

그 밖의 에이전트는 규칙 파일만 복사하면 됩니다.[^s1]

- Windsurf `.windsurf/rules/`, Cline `.clinerules/`, Kiro `.kiro/steering/`, Copilot Chat `.github/copilot-instructions.md`
- Zed, Amp, Jules, VS Code Codex 확장 등은 저장소의 `AGENTS.md` 를 그대로 읽음

제거할 때는 호스트 제거 명령보다 `node scripts/uninstall.js` 를 먼저 실행해야 합니다.
이 스크립트가 모드 플래그, 설정 파일, statusLine 항목 같은 플러그인 밖 상태를 지우는데, 플러그인을 먼저 지우면 스크립트도 함께 사라지기 때문입니다.[^s1]

## 05. 최근 변화

v4.8.3부터 v4.10.0까지 약 석 달 동안 지원 호스트가 늘고 설치·제거 경로의 버그가 정리되었습니다.
npm 게시 시각으로 날짜를 확인했습니다.[^s15]

- v4.10.0 (2026-09-14)[^s12][^s15]
    - `hooks.json` 기반 Cursor 네이티브 지원, 기존 Cursor 훅 파일에 병합하는 설치 스크립트
    - Claude.ai 마켓플레이스 검증을 위해 `hooks.json` 에서 `commandWindows` 제거
    - `CLAUDE_PLUGIN_ROOT` 폴백으로 VS Code Copilot 감지 수정
    - Grok Build 네이티브 Skill 어댑터 추가
- v4.9.0 "53 commits of doing less" (2026-08-07)[^s13][^s15]
    - 재시작 후에도 모드를 유지하는 `/ponytail default <mode>` 추가, 인자 없는 `/ponytail` 은 레벨을 초기화하지 않고 표시
    - Qoder 지원, `PONYTAIL_SUBAGENT_MATCHER` 로 서브에이전트 범위 지정, pi 상태 표시줄 제어
    - Windows stdin EOF 교착으로 인한 세션 멈춤 수정, `config.json` UTF-8 BOM 처리, 제거 시 결합된 statusline 보존 등 약 30건 수정
- v4.8.4 "lazy in Hermes now" (2026-06-29)[^s14][^s15]
    - Hermes Agent 네이티브 플러그인, Devin CLI 플러그인 배포
    - 키워드 프롬프트가 아니라 모든 코딩 작업에서 Skill이 트리거되도록 변경
    - 벤치마크 LOC 계산 전 블록 주석 제거
- v4.8.3 "lazy in subagents too" (2026-06-24) : `SubagentStart` 훅으로 서브에이전트에 규칙 주입, 한국어 README 추가[^s14][^s15]

## 06. 커뮤니티에서 반복되는 주제

최근 열린 이슈·PR은 규칙 자체보다 호스트별 어댑터 호환성에 몰려 있습니다.
2026-09-21~28 사이에 올라온 22건 중 다수가 OpenCode v2 이전과 pi 확장 수정입니다.[^s16]

- OpenCode v2 비호환 : `@dietrichgebert/ponytail@4.10.0` 이 OpenCode v2.0.18에서 `Plugin must export a default definition with an id and an effect or setup function.` 오류로 로드되지 않는다는 보고(#941). v1 훅 이름이 v2에 없고, 설정 키도 `plugin` 이 아니라 `plugins` 라고 함[^s17]
- 해결 방향 : v1 export 옆에 v2 정의를 함께 내보내는 방식이 제안됨. 관련 PR #933, #940, #943이 열려 있음[^s17][^s16]
- pi 확장 : 인자를 버리는 Skill 별칭, 중복 별칭, 비활성 Skill의 유령 명령, pi 0.86 이상에서 시스템 프롬프트로 규칙 저장 등 PR이 이어짐 (#921, #922, #934, #942)[^s16]
- 토큰 낭비 : Hermes에서 매 턴 대신 세션당 한 번만 규칙을 주입하자는 PR(#936)[^s16]
- 범위 이탈 : 요청 밖 코드를 재포맷하지 않도록 diff 범위를 제한하는 PR(#945)[^s16]
- 리뷰 품질 : `ponytail-review` 에 삭제 근거(검색 증거)와 유지 이유를 요구하는 Evidence 섹션 추가 PR(#920)[^s16]
- 패키지 크기 : npm 패키지에서 assets·테스트를 빼 997KB에서 49KB로 줄이는 PR(#939)[^s16]
- 설치 실패 : `hermes plugins install` 이 "unsupported or missing Agent Plugins schema" 로 실패한다는 보고(#925)[^s16]
- 새 호스트 요청 : Muse Code CLI 공식 지원 요청(#937)[^s16]
- 스팸성 이슈 : 튜토리얼 과제, 라이선스 본문 붙여넣기, 한 단어 테스트 글 등 저장소와 무관한 이슈가 섞여 있음 (#923, #929, #938)[^s16]

## 07. 실제 개발에서 어떻게 쓰는가

저장소가 공개한 agentic 벤치마크가 사용 효과를 가장 구체적으로 보여 줍니다.
이슈 #126에서 단발 벤치마크의 기준선이 대화형 모델이라 결과가 부풀려졌다는 지적을 받고 다시 설계한 실험이라고 합니다.[^s6]

- 설정 : Claude Code `2.1.177` 헤드리스(`claude -p`), Haiku 4.5, `full-stack-fastapi-template` @ `cd83fc1`, 작업·arm 조합마다 n=4. LOC는 `git diff` 추가 줄 수[^s6]
- 비교 arm : 기준선(Skill 없음), ponytail, caveman(짧게 말하기 Skill), "Follow YAGNI principles, and prefer one-liner solutions." 프롬프트[^s6]
- 기능 12건 평균(기준선 대비) : ponytail LOC -54%, tokens -22%, cost -20%, time -27%. caveman은 LOC -20%지만 tokens +7%. 한 줄 프롬프트는 LOC -33%[^s6][^s1]
- 효과가 큰 곳 : 네이티브 입력으로 대체되는 작업. 날짜 선택기 404→23줄, 색상 선택기 287→23줄, 파일 드롭존 251→95줄[^s6]
- 효과가 없는 곳 : 이미 최소인 백엔드 CRUD. 제목 검색은 모든 arm이 44줄 안팎[^s6]
- 안전성 : 경로 탐색·SQL 인젝션·위조 토큰 등 적대적 입력으로 실행 검사. ponytail 20/20, 한 줄 프롬프트 19/20. `safe-path` 에서 ponytail이 더 쓴 약 3줄이 경로 탐색 검사였다고 함[^s6]
- 벤치마크 오염 사례 : 플러그인 `SessionStart` 훅이 기준선에도 발동해 차이가 4%로 보였던 문제를 `--setting-sources project,local` 과 arm별 `--plugin-dir` 로 격리해 고쳤다고 함[^s6]

다른 도구와의 조합도 README에 안내되어 있습니다.

- caveman과 함께 쓰기를 권함. caveman은 에이전트가 말하는 양을, ponytail은 만드는 양을 줄임[^s1]
- 추론 토큰을 쓰는 간결한 모델은 사다리 단계를 따지느라 비용이 오히려 늘 수 있고, GPT-5.5에서 그렇다고 함[^s1]
- 서브에이전트에도 규칙이 주입되므로, 읽기 전용 탐색 에이전트에는 `PONYTAIL_SUBAGENT_MATCHER` 로 빼는 구성이 가능함[^s1]

## 08. 한계와 주의점

- 벤치마크는 Haiku 4.5 한 모델, n=4 기준. 더 큰 모델에서 격차가 좁아지거나 넓어질 수 있다고 문서가 밝힘[^s6]
- 안전성 결과는 하한선임. 6개 작업의 결정적 검사로 알려진 가드 누락 여부만 보며 보안을 증명하지 않음[^s6]
- 이전 단발 벤치마크의 "80-94% less code"는 평균이 아니라 작업별 상한으로 정정됨[^s1]
- 192개 LOC 셀 중 4개는 Windows 프로세스 타임아웃으로 강제 종료되어 비용·시간이 집계되지 않음[^s6]
- 지시문 단계 호스트(Cursor 규칙 파일, Windsurf, Cline, Copilot, Kiro, Antigravity)는 명령어와 레벨 전환이 없음[^s1]
- Cursor 훅은 서브에이전트에 규칙을 주입하지 못하고, 클라우드 에이전트에서는 `sessionStart` 가 발동하지 않음. 규칙 파일(`.cursor/rules/ponytail.mdc`)이 있으면 훅은 알림만 주입함[^s1][^s5]
- Grok Build는 `SessionStart` 출력이 지시문을 주입하지 못해 라이프사이클 훅을 쓰지 않음[^s1]
- Gemini 어댑터는 루트 `hooks/hooks.json` 을 두지 않음. Gemini가 그 경로를 자동 로드하는데 훅 이벤트 이름이 Claude·Codex 기준이기 때문임[^s1]
- MCP 서버는 사용자가 호출하는 prompt·tool이라 매 턴 자동 주입을 대신하지 못함[^s8]
- 제거 명령만으로는 `~/.claude/.ponytail-active`, `~/.config/ponytail/config.json`, statusLine 항목 등이 남음[^s1]
- Hermes 공유 게이트웨이에서는 런타임 모드가 프로세스 단위이므로 `/ponytail` 을 신뢰 사용자로 제한하라고 안내함[^s1]

## 09. 더 알아볼 것

- `/ponytail-audit` 와 `/ponytail-gain` 의 출력 형식과 동작 세부는 해당 SKILL.md를 읽지 않아 확인하지 못했습니다.
- OpenCode v2 대응 PR(#933, #940, #943) 중 어떤 방식이 병합될지, 다음 릴리스 일정은 확인하지 못했습니다.
- Sonnet·Opus 등 더 큰 모델에서의 agentic 벤치마크 결과는 공개된 것을 찾지 못했습니다.
- README의 "Independent benchmarks" 섹션(v4.9.0에서 추가)의 내용과 외부 검증 결과는 확인하지 못했습니다.
- ponytail.dev의 대기자 명단 배너가 가리키는 새 제품의 내용은 확인하지 못했습니다.
- 리포트 기준(2026-09-22)은 Star 143,713개, 24시간 증가 +690이었고, 09-28 기준은 146,895개, +432입니다. 조사 시점(2026-09-29) API 값은 147,324개로 09-22 대비 3,611개, 09-28 대비 429개 많습니다.

## 참고 자료

- [Ponytail README (기본 브랜치)](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/README.md) (readme)
- [DietrichGebert/ponytail 저장소 페이지](https://github.com/DietrichGebert/ponytail) (website)
- [skills/ponytail/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail/SKILL.md) (code)
- [AGENTS.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/AGENTS.md) (code)
- [docs/agent-portability.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/docs/agent-portability.md) (docs)
- [Agentic benchmark (2026-06-18)](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/benchmarks/results/2026-06-18-agentic.md) (docs)
- [hooks/claude-codex-hooks.json](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/hooks/claude-codex-hooks.json) (code)
- [ponytail-mcp/README.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/ponytail-mcp/README.md) (code)
- [skills/ponytail-review/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail-review/SKILL.md) (code)
- [skills/ponytail-debt/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail-debt/SKILL.md) (code)
- [package.json](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/package.json) (code)
- [Release v4.10.0](https://github.com/DietrichGebert/ponytail/releases/tag/v4.10.0) (release)
- [Release v4.9.0](https://github.com/DietrichGebert/ponytail/releases/tag/v4.9.0) (release)
- [Releases 목록](https://github.com/DietrichGebert/ponytail/releases) (release)
- [npm registry: @dietrichgebert/ponytail](https://registry.npmjs.org/@dietrichgebert/ponytail) (code)
- [열린 Issues (GitHub API)](https://api.github.com/repos/DietrichGebert/ponytail/issues?state=open&per_page=30) (issues)
- [Issue #941: Plugin fails on OpenCode v2](https://github.com/DietrichGebert/ponytail/issues/941) (issues)

[^s1]: [Ponytail README (기본 브랜치)](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/README.md)
[^s2]: [DietrichGebert/ponytail 저장소 페이지](https://github.com/DietrichGebert/ponytail)
[^s3]: [skills/ponytail/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail/SKILL.md)
[^s4]: [AGENTS.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/AGENTS.md)
[^s5]: [docs/agent-portability.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/docs/agent-portability.md)
[^s6]: [Agentic benchmark (2026-06-18)](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/benchmarks/results/2026-06-18-agentic.md)
[^s7]: [hooks/claude-codex-hooks.json](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/hooks/claude-codex-hooks.json)
[^s8]: [ponytail-mcp/README.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/ponytail-mcp/README.md)
[^s9]: [skills/ponytail-review/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail-review/SKILL.md)
[^s10]: [skills/ponytail-debt/SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/skills/ponytail-debt/SKILL.md)
[^s11]: [package.json](https://raw.githubusercontent.com/DietrichGebert/ponytail/HEAD/package.json)
[^s12]: [Release v4.10.0](https://github.com/DietrichGebert/ponytail/releases/tag/v4.10.0)
[^s13]: [Release v4.9.0](https://github.com/DietrichGebert/ponytail/releases/tag/v4.9.0)
[^s14]: [Releases 목록](https://github.com/DietrichGebert/ponytail/releases)
[^s15]: [npm registry: @dietrichgebert/ponytail](https://registry.npmjs.org/@dietrichgebert/ponytail)
[^s16]: [열린 Issues (GitHub API)](https://api.github.com/repos/DietrichGebert/ponytail/issues?state=open&per_page=30)
[^s17]: [Issue #941: Plugin fails on OpenCode v2](https://github.com/DietrichGebert/ponytail/issues/941)
