# Hindsight 활용 예시 ② 코딩 에이전트와 MCP

> 개발자 한 명의 로컬 환경에서 Claude Code·Codex 같은 코딩 에이전트에 저장소 단위 장기 기억을 붙이는 방법과, MCP로 직접 연결하는 방법을 다룹니다.

Hindsight는 브라우저나 모바일 앱에서 직접 호출하는 클라이언트 라이브러리가 아닙니다. 사용자의 기기에서 Hindsight를 쓰는 대표적인 경우는 **개발자 PC의 코딩 에이전트**이므로, 이 문서에서는 이것을 클라이언트 관점으로 봅니다.

## 활용할 수 있는 기능

- **코딩 에이전트 통합 패키지** `@vectorize-io/hindsight-coding-agents`: 명령 한 줄로 Claude Code, Codex CLI, Cursor CLI, GitHub Copilot CLI, opencode, Kimi Code, Devin CLI 등 20개 가까운 에이전트에 Hook·MCP·Skill을 설치합니다.
- **저장소 단위 bank**: 기본 bank 이름이 `coding-agent::{gitProject}`라서, 같은 저장소에서 일하는 모든 에이전트가 하나의 기억을 공유합니다.
- **자동 수집**: git 커밋 이력과 에이전트 세션 대화가 백그라운드에서 bank로 들어갑니다. 별도 수집 명령이 없습니다.
- **첫 프롬프트 주입**: 세션의 첫 프롬프트에 맞춰 reflect 요약, 관련 Knowledge Page, 또는 recall 결과 중 하나를 넣어 줍니다(`autoInject`).
- **기본 Knowledge Page 5종**: Component map, Core concepts, Conventions and patterns, Key decisions and rationale, Initiatives and enhancements. 기본적으로 매시간, 바뀐 것이 있을 때만 갱신합니다.
- **내장 MCP 엔드포인트**: 패키지 없이도 어떤 MCP 클라이언트든 `http://localhost:8888/mcp/{bank_id}/`에 붙여 retain·recall·reflect·Mental Model·Knowledge Page 도구를 쓸 수 있습니다.
- **파일로 보는 지식**: `hindsight fs mount`로 bank의 Knowledge Page를 로컬 Markdown 파일로 내려받아 에디터나 `rg`로 읽습니다.

## 실제 예제

### 1. 코딩 에이전트에 설치하기

```bash
# 기억을 어디에 둘지 고르며 설치 (터미널에서 실행하면 직접 물어본다)
npx @vectorize-io/hindsight-coding-agents install claude-code --server daemon

# 이미 띄운 자체 서버를 쓰는 경우
npx @vectorize-io/hindsight-coding-agents install claude-code codex \
  --server self-hosted --api-url http://localhost:8888

# 설치한 것만 정확히 제거
npx @vectorize-io/hindsight-coding-agents uninstall all
```

기억을 둘 곳은 세 가지입니다.

| 모드 | 동작 | 필요한 것 |
|---|---|---|
| `cloud` (기본) | Hindsight Cloud에 저장 | API 토큰 |
| `self-hosted` | 직접 운영하는 서버에 저장 | 서버 URL |
| `daemon` | 내 PC에서 `hindsight-embed`를 `127.0.0.1:9077`로 실행 | `uv`, 사실 추출용 LLM 키(없으면 Claude Code CLI 사용), macOS는 최신 Rust 툴체인 |

Claude Code에 설치하면 `~/.claude/settings.json`에 Hook 3개(세션 시작, 프롬프트 제출, 응답 종료)가 등록되고, `claude mcp add`로 사용자 범위 MCP 서버와 동반 Skill이 추가됩니다. 설정 파일은 `~/.hindsight/coding-agent.json` 하나입니다.

### 2. 회사 코드는 기억시키지 않기

기본값은 "모든 저장소에서 기억 켜짐"입니다. 고객사 코드처럼 외부로 나가면 안 되는 저장소가 섞여 있다면 허용 목록 방식으로 바꿉니다.

```jsonc
// ~/.hindsight/coding-agent.json
{
  "serverMode": "self-hosted",
  "apiUrl": "http://localhost:8888",

  // 허용한 경로 아래 저장소에서만 기억을 쓴다. 나머지는 bank도 만들지 않는다
  "optInOnly": true,
  "optInPaths": ["~/work/my-product", "~/oss"],

  // 세션 첫 프롬프트에는 LLM 없이 관련 Knowledge Page만 넣는다
  "autoInject": "pages",

  // 커밋 메시지만 수집 (full 이면 커밋별 diff까지 수집)
  "gitIngest": "message",

  "banks": {
    // 이 저장소는 페이지 질문을 도메인에 맞게 바꾼다
    "coding-agent::my-product": {
      "pages": {
        "Key decisions and rationale": {
          "source_query": "결제·정산 관련 기술 결정과 그 이유는 무엇이며, 새 코드에 어떤 제약을 거는가?"
        }
      }
    }
  }
}
```

### 3. 패키지 없이 MCP로 직접 연결하기

통합 패키지가 하는 자동 수집·주입이 필요 없고, 에이전트가 필요할 때 기억 도구를 직접 부르게 하고 싶다면 MCP만 연결합니다.

```bash
# 인증을 켜지 않은 로컬 서버: URL에 bank를 넣는다
claude mcp add --transport http hindsight http://localhost:8888/mcp/my-product/

# 인증을 켠 서버: 공통 엔드포인트 + 헤더로 bank 지정
claude mcp add --transport http hindsight http://localhost:8888/mcp \
  --header "Authorization: Bearer $HINDSIGHT_API_KEY" \
  --header "X-Bank-Id: my-product"
```

bank별 엔드포인트(`/mcp/{bank_id}/`)는 도구 호출에 bank ID를 넣을 필요가 없고, 공통 엔드포인트(`/mcp/`)는 `list_banks`, `create_bank` 같은 bank 관리 도구까지 노출하는 대신 호출마다 bank를 지정합니다. bank 설정의 `mcp_enabled_tools`로 노출할 도구를 줄일 수도 있습니다.

### 4. Knowledge Page를 파일로 보기

```bash
# bank의 Knowledge Page 트리를 실제 디렉터리와 Markdown 파일로 내려받고 계속 동기화한다
hindsight fs mount --bank coding-agent::my-product
# 이후에는 내려받은 폴더에서 일반 파일처럼 검색한다
rg "retry"
```

페이지는 YAML frontmatter가 붙은 일반 Markdown 파일이고, 백그라운드 갱신 루프가 최신 상태로 유지합니다. 에이전트가 파일 도구만으로 프로젝트 지식을 읽을 수 있다는 점이 핵심입니다.

## 실제 서비스에서는

> 결제 서비스를 개발하는 개발자가 월요일 아침 Claude Code를 열고 "환불 금액 반올림 버그 고쳐줘"라고 입력합니다. 세션 시작 Hook이 `coding-agent::payments-api` bank를 확인하고, 첫 프롬프트에 맞춰 "Key decisions and rationale" 페이지에서 "환불 금액은 원 단위 내림, 2025년 11월 정산팀 요청으로 변경"이라는 내용을 찾아 넣어 줍니다. 에이전트는 코드만 보고는 알 수 없는 이 결정을 근거로 수정 방향을 잡습니다. 세션이 끝나면 대화가 bank에 들어가고, 오후에 같은 저장소에서 Codex를 쓰는 동료도 같은 기억을 이어받습니다.

공식 문서가 이 패키지의 전제로 드는 것도 같은 지점입니다. 수정의 대부분은 코드에서 추론할 수 있지만, 마지막 한 걸음은 반올림 규칙, 재시도 허용 목록 같은 **코드에 없는 프로젝트 결정**에 달려 있는 경우가 많고, 그런 결정은 git 이력과 과거 대화에 남아 있습니다.

로컬에서 쓸 때 알아 둘 비용과 위험도 있습니다.

- **기본 저장 위치가 Cloud입니다.** 설치할 때 묻지만, 스크립트로 설치하면서 `--server`를 빠뜨리면 코드 관련 대화가 외부 서비스로 갈 수 있습니다. 회사 정책을 먼저 확인합니다.
- **처음 보는 저장소에서는 구조 조사(codebase survey)가 자동으로 돕니다.** Claude Code에서는 `claude -p`로 실행되며 기본 비용 상한이 2달러(`surveyBudgetUsd`)입니다. 필요 없으면 `codebaseSurvey: false`로 끕니다.
- **페이지 하나 갱신은 LLM 합성 한 번입니다.** 페이지 수와 갱신 주기가 곧 비용이므로, 필요 없는 기본 페이지는 `pages`에서 `false`로 끄는 것이 좋습니다.

---

[← 활용 예시 ① 사용자를 기억하는 상담 챗봇](03-usage-personal-assistant.md) · [목차](README.md) · [활용 예시 ③ 서버 운영과 실전 프로젝트 →](05-usage-production.md)
