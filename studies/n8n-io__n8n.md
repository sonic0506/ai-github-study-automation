---
repository: n8n-io/n8n
url: https://github.com/n8n-io/n8n
stars: 205,090
studiedAt: 2026-10-01
status: draft
---

# n8n-io/n8n

n8n은 시각적 캔버스와 코드를 섞어 워크플로와 AI 에이전트를 만들고 배포하는 fair-code 자동화 플랫폼입니다.
셀프호스팅과 Cloud 두 방식으로 쓸 수 있고, README에는 1500개 이상의 통합을 제공한다고 적혀 있습니다.

## 01. 어떤 문제를 푸는가

LLM을 실제 업무에 붙이려면 모델 호출 외에도 사내 시스템 연동, 도구 호출, 사람 승인, 실행 기록이 함께 필요합니다.
n8n은 기존 워크플로 자동화 위에 LangChain 기반 AI 노드와 MCP 클라이언트·서버를 얹어 이 부분을 한 곳에서 다룹니다.

- README 제목은 "The Platform for AI Agents and Workflow Automation". 1500+ integrations와 9,000+ workflow templates를 내세움[^s1]
- GitHub API 조회값(2026-10-01) : Star 206,388, Fork 60,958, open_issues_count 1,113 (PR 포함), 생성일 2019-06-22, 주 언어 TypeScript, 기본 브랜치 master[^s2]
- 저장소 topic에 ai, mcp, mcp-client, mcp-server, self-hosted, workflow-automation 등이 들어 있음[^s2]
- 라이선스는 Sustainable Use License와 n8n Enterprise License (fair-code). 파일명에 `.ee.` 가 들어간 소스는 Enterprise License 적용[^s1][^s17]
- Sustainable Use License는 자체 내부 업무, 비상업·개인 용도로만 사용·수정을 허용하고 배포는 비상업 목적의 무료 배포로 제한함. 2022년 3월 17일까지는 Apache 2.0 with Commons Clause였음[^s17]
- 루트 package.json 기준 Node.js `>=24.0.0`, pnpm `>=12.4.2` 를 요구하고 버전은 2.42.0[^s3]
- 셀프호스팅 에디션은 Community(무료), Registered Community(무료, 이메일 등록), Business(유료), Enterprise(유료)[^s16]
- n8n은 대부분 주마다 새 minor 버전을 내고, `stable` 은 운영용, `beta` 는 가장 최근 릴리스라 불안정할 수 있다고 함[^s14]

## 02. 핵심 구조

- 클러스터 노드 (root node + sub-node) : LangChain 개념 대부분을 root node 하나에 sub-node를 붙이는 구조로 표현함. Chain·Agent·Vector store는 root node, 언어 모델·Memory·Tool·Retriever·Embeddings·Document loader·Output parser·Text splitter는 sub-node[^s5]
- LangChain JS 구현 : AI 노드는 LangChain의 JavaScript 프레임워크를 구현한 것. 전용 노드가 없는 기능은 LangChain Code 노드에서 LangChain JavaScript 코드를 직접 작성함[^s5]
- AI Agent 노드 : chat model과 tool sub-node를 연결하면 에이전트가 어떤 도구를 호출할지 결정함. tool sub-node를 최소 1개 연결해야 함[^s6]
- Tools Agent : LangChain tool calling 인터페이스를 구현함. output parser를 모델에 formatting tool로 넘겨 출력 형식을 맞춤[^s7]
- Chat Trigger : 채팅 메시지로 워크플로를 시작하는 노드. memory sub-node를 붙이면 여러 질의를 이어 가는 대화가 됨[^s5][^s7]
- MCP Client / MCP Client Tool 노드 : 외부 MCP 서버의 도구를 사용함. MCP Client는 워크플로의 일반 단계로, MCP Client Tool은 AI Agent의 도구로 씀[^s9]
- MCP Server Trigger 노드 : 워크플로 하나를 MCP 서버로 만들어 그 안의 tool 노드만 노출함. 일반 trigger와 달리 다음 노드로 출력을 넘기지 않고 tool 노드만 연결·실행함[^s10]
- Instance-level MCP 서버 : 인스턴스 단위 MCP 서버로 연결 하나와 중앙 인증을 쓰고, 노출할 워크플로를 골라 MCP 클라이언트가 검색·실행·생성·수정하게 함[^s11][^s12]
- Agents (Agent Builder) : 워크플로와 나란히 두는 에이전트 산출물. Model, Instructions, Tools, Web search, Skills, Channels, Schedules, Sub-agents, Knowledge base, Memory로 구성하고 draft·published 버전을 따로 둠[^s13]
- 모노레포 구성 : packages 아래 cli, core, workflow, nodes-base, frontend 등이 있고 packages/@n8n 아래 nodes-langchain, agents, instance-ai, mcp-browser, task-runner-python, workflow-sdk 등이 있음[^s2]

## 03. 주요 기능

- 모델 선택 : OpenAI, Anthropic, Google, 오픈소스 모델을 연결하고 구조를 바꾸지 않고 공급자를 교체할 수 있다고 함. 한 워크플로에서 여러 모델을 조합할 수 있음[^s1][^s4]
- Tools Agent 지원 chat model : OpenAI, Groq, Mistral Cloud, Anthropic, Azure AI Foundry Chat Model[^s7]
- 도구로 쓰는 노드 : Call n8n Workflow, Code, HTTP Request, Vector Store, Wikipedia, SerpApi 등과 Slack, Gmail, GitHub, Notion, Postgres 같은 앱 노드를 Tools Agent의 도구로 붙임[^s7]
- Tools Agent 옵션 : System Message, Max Iterations (기본값 10), Return Intermediate Steps, Tracing Metadata, Automatically Passthrough Binary Images, Enable Streaming (기본 활성)[^s7]
- 출력 형식 강제 : Require Specific Output Format을 켜면 Auto-fixing, Item List, Structured Output Parser 중 하나를 연결함[^s7]
- 도구 파라미터 자동 채우기 : `$fromAI()` 로 앱 노드 도구의 파라미터를 AI가 채우게 함[^s7]
- Human review : 민감한 도구 호출 전에 Chat, Slack, Telegram 등으로 승인 요청을 보내고 승인되면 실행, 거부되면 취소함[^s7]
- MCP Client 인증 : Bearer, generic header, multiple headers, OAuth2 지원. 도구 목록은 외부 MCP 서버에서 자동으로 가져오고 입력은 Manual 또는 JSON 모드[^s9]
- MCP Server Trigger 전송 방식 : SSE와 streamable HTTP를 지원하고 stdio는 지원하지 않음. 인증은 None, Bearer, Header. test URL과 production URL이 따로 있음[^s10]
- Claude Desktop 연결 : MCP Server Trigger에 붙을 때 `mcp-remote` gateway로 SSE 메시지를 stdio 서버로 중계함. 시작하기의 JSON이 Claude Desktop 설정 예시이며 `<MCP_URL>`, `<MCP_BEARER_TOKEN>` 을 노드 값으로 바꿔 씀[^s10]
- Instance-level MCP : Claude Code, Codex, Gemini CLI, Claude.ai, ChatGPT, Mistral Vibe, Cursor, VS Code, Windsurf용 연결 안내 제공. 인증은 OAuth(권장) 또는 API key. 워크플로 생성·수정은 n8n 2.13.0부터[^s12]
- Agents : 에이전트가 도구 호출, 지식 베이스 검색, 다른 에이전트 위임, 후속 질문 중 다음 행동을 고르는 reasoning loop를 돌림. 대화는 session으로 저장되고 episodic memory는 OpenAI credential이 필요함[^s13]
- LangSmith tracing : 셀프호스팅 모든 에디션에서 `LANGCHAIN_ENDPOINT`, `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY` 등 환경 변수로 실행을 추적함. n8n Cloud에서는 지원하지 않음[^s5]
- 코드 혼용 : 시각적 빌드와 JavaScript, Python, npm 패키지를 함께 쓸 수 있음[^s1]

## 04. 시작하기

```bash
# 설치 스크립트로 바로 실행 (Docker 필요)
curl -fsSL https://get.n8n.io | sh

# 또는 Docker로 직접 실행
docker volume create n8n_data
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
# 에디터 주소 : http://localhost:5678
```

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "<MCP_URL>",
        "--header",
        "Authorization: Bearer ${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "<MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

설치와 예제는 공식 문서 기준입니다.[^s1][^s10]

## 05. 최근 변화

- n8n@2.41.4 (2026-09-30)[^s18][^s14]
    - Latest 표시 릴리스. 문서 기준 현재 stable은 2.41.4
    - 실행의 trace context가 불완전해도 API가 실행을 반환하도록 수정
    - event-loop 지연 중 도착한 DB ping 응답을 성공으로 처리, queue job 결과는 자신이 enqueue한 실행만 저장
    - 신규 Cloud 가입자용 n8n Assistant onboarding thread 추가
- n8n@2.42.1 (2026-09-30)[^s20][^s14]
    - Pre-release. 문서 기준 현재 beta는 2.42.1
    - Public API spec에서 타입 없는 값에 유효한 schema를 내도록 수정
    - canvas-only 모드에서 canvas에 n8n 로고 표시
- n8n@2.42.0 (2026-09-29)[^s19]
    - Pre-release. `core: Enable Agents by default` 포함
    - durable agent message queue 기반 추가, Preview와 integration을 agent queue에 연결, shared Agent context access 추가
    - AI Agent Node: pre-v3 부모 에이전트 아래에서 AI Agent Tool이 자기 도구를 쓰도록 수정
    - MCP Client Node: client를 닫기 전에 session을 종료하도록 수정, MCP connect-client 목록에 Mistral Vibe 추가
    - Anthropic Node: Message operation에 prompt caching 추가, Azure OpenAI Chat Model Node를 Azure AI Foundry Chat Model로 이름 변경
- n8n@1.123.83 (2026-09-30)[^s21]
    - 1.x 계열 유지보수 릴리스. 리뷰 지적에 따라 cjs-module-lexer를 2.2.0으로 고정

## 06. 커뮤니티에서 반복되는 주제

- AI Agent V3 도구 호출 문제 : 도구 이름을 잃고 다음 호출을 버림(#38503), Max Iterations 오류 시 retryOnFail이 도구 호출 맥락을 지우고 무한 반복 가능(#37779), ToolsAgent V3 실패(#39670)[^s22]
- 모델 공급자별 오류 : Cohere Chat Model에서 도구 호출 후 "tool call 'id' must be provided"(#39510), Anthropic 사용 시 systemMessage가 약 50KB로 크면 도구가 조용히 빠짐(#37840)[^s22]
- 도구 응답 : toolWorkflow·toolCode를 붙인 Agent에서 도구는 실행됐는데 observation이 간헐적으로 비어 있음(#38870)[^s22]
- MCP 서버 쪽 : MCP Server Trigger가 하위 `isError` 를 클라이언트에 전달하지 않음(#39613), MCP OAuth 동의 시 SQLITE_CONSTRAINT 오류(#38975)[^s22]
- MCP 클라이언트 쪽 : MCP Client Tool이 도구 `title` 대신 기계 이름을 씀(#38232), ChatGPT custom app과 `execute_workflow` schema 불일치(#38512)[^s22]
- n8n Assistant(instance-ai) : 다섯 단어 질문에 입력 토큰 약 137k, 0.42달러가 들었다는 보고(#38130), OpenAI 호환 gateway·Gemini·Kimi 연동 오류(#39227, #39339, #39222)[^s22]
- 셀프호스팅 운영 : SQLite WAL 파일이 18GB 이상 커져 실행이 느려짐(#39327), queue mode에서 webhook binary data가 정리되지 않음(#39928)[^s22]

## 07. 한계와 주의점

- AI Agent 노드의 agent type 설정은 1.82.0부터 deprecated. 모든 AI Agent가 Tools Agent로 동작하고, agent type이 있는 v1 노드는 n8n 3.0에서 제거될 예정[^s6]
- Memory sub-node는 AI Agent root node에만 붙음. LangChain과 달리 chain 노드는 memory를 지원하지 않아 이전 대화를 참조하려면 agent를 써야 함[^s5]
- Chat Trigger와 함께 쓰는 Tools Agent의 memory는 session 사이에 유지되지 않음[^s7]
- Streaming은 Chat Trigger나 Response Mode가 Streaming인 Webhook처럼 streaming 응답을 지원하는 trigger가 있어야 동작함[^s7]
- 자주 나는 오류 : Prompt가 null이면 "400 Invalid value for 'content'", chat model이 없으면 "A Chat Model sub-node must be connected", 오래된 Simple Memory(구 Window Buffer Memory) 버전 오류[^s8]
- MCP Server Trigger는 queue mode에서 webhook replica가 여러 개면 `/mcp*` 요청을 전용 replica 하나로 보내야 함. 아니면 SSE·streamable HTTP 연결이 자주 끊김[^s10]
- nginx 같은 reverse proxy 뒤에서는 MCP endpoint에 `proxy_buffering off`, `gzip off`, `chunked_transfer_encoding off`, 빈 `Connection` 헤더 설정이 필요함[^s10]
- claude.ai custom connector는 Authentication이 None이어도 n8n 로그인을 요구함[^s10]
- Instance-level MCP는 클라이언트별로 범위를 나누지 못함. 연결한 모든 클라이언트가 MCP에 노출된 워크플로를 모두 봄. 노출 가능한 워크플로는 webhook, form, schedule, chat trigger가 있는 published 워크플로뿐임[^s12]
- Agents는 Preview 상태. 셀프호스팅은 2.32.3부터 Enterprise를 뺀 플랜에서 쓰며, `N8N_ENABLED_MODULES` 에 `agents` 를 추가해야 함. queue mode는 아직 지원하지 않음. 지식 베이스는 Daytona sandbox, 채널 연결은 공개 `WEBHOOK_URL` 이 필요함[^s13]
- 셀프호스팅은 서버·컨테이너 설정, 리소스·확장, 보안 지식이 필요하고 문서는 전문가에게 권함. 실수하면 데이터 손실, 보안 문제, 장애로 이어질 수 있다고 함[^s14]
- 기본 DB는 SQLite. 사용자나 워크플로가 많고 상시 실행하는 운영 환경은 Postgres를 권장함. Postgres를 써도 암호화 키 등이 있는 `/home/node/.n8n` 볼륨은 유지하는 것이 좋다고 함[^s14][^s15]
- Docker Compose로 n8n Assistant sandbox까지 띄우려면 RAM 4GB, vCPU 2개 이상이 필요함. `sandbox-runner-1` 은 privileged Docker-in-Docker라 host root와 같게 취급하고 인터넷에 노출하지 말아야 함[^s15]
- `N8N_RUNNERS_ENABLED` 는 2.0부터 deprecated. 1.x에서는 task runner를 켜려면 `true` 로 설정해야 함[^s14]
- Install with Docker 문서는 outdated 표시가 붙어 있고 Docker Compose 설치를 권장 방식으로 안내함[^s14]

## 08. 더 알아볼 것

- 2.42.0(Pre-release)의 `Enable Agents by default` 와 문서의 `N8N_ENABLED_MODULES` 에 `agents` 를 추가하라는 안내가 어떻게 맞물리는지 확인하지 못했습니다.
- README의 `docker.n8n.io/n8nio/n8n` 이미지와 Docker 문서의 `n8nio/n8n` 이미지가 같은 이미지인지 확인하지 못했습니다.
- Instance-level MCP 서버가 제공하는 전체 도구 목록(MCP server tools reference)은 읽지 않았습니다.
- Evaluations(Test and improve AI workflows)와 Guardrails 노드는 이번 조사 범위에서 빠졌습니다.
- 리포트 기준(2026-09-18) Star는 205,090개이고 24시간 증가량은 기록되지 않았습니다. 조사 시점(2026-10-01) API 값은 206,388개입니다.
- GitHub 검색 기준 열린 이슈는 360건입니다. API의 open_issues_count 1,113은 PR을 포함한 값으로 보입니다.

## 참고 자료

- [n8n README (master)](https://github.com/n8n-io/n8n/blob/master/README.md) (readme)
- [n8n-io/n8n 저장소 (GitHub API 조회)](https://github.com/n8n-io/n8n) (code)
- [package.json (master)](https://github.com/n8n-io/n8n/blob/master/package.json) (code)
- [Integrate AI](https://docs.n8n.io/build/integrate-ai) (docs)
- [LangChain in n8n](https://docs.n8n.io/build/integrate-ai/langchain-in-n8n) (docs)
- [AI Agent node](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent) (docs)
- [Tools Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent) (docs)
- [AI Agent node common issues](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/common-issues) (docs)
- [MCP Client node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient) (docs)
- [MCP Server Trigger node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger) (docs)
- [Use n8n MCP server](https://docs.n8n.io/build/ways-of-building-workflows/connect-to-n8n-mcp-server) (docs)
- [Connect to n8n MCP server](https://docs.n8n.io/connect/connect-to-n8n-mcp-server) (docs)
- [Build and manage agents](https://docs.n8n.io/build/build-and-manage-agents) (docs)
- [Install with Docker](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker) (docs)
- [Install using Docker Compose](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose) (docs)
- [Choose how to use n8n](https://docs.n8n.io/choose-how-to-use-n8n) (docs)
- [Community license](https://docs.n8n.io/n8n-community-license/community-license) (docs)
- [n8n@2.41.4](https://github.com/n8n-io/n8n/releases/tag/n8n%402.41.4) (release)
- [n8n@2.42.0](https://github.com/n8n-io/n8n/releases/tag/n8n%402.42.0) (release)
- [n8n@2.42.1](https://github.com/n8n-io/n8n/releases/tag/n8n%402.42.1) (release)
- [n8n@1.123.83](https://github.com/n8n-io/n8n/releases/tag/n8n%401.123.83) (release)
- [열린 Issues 목록](https://github.com/n8n-io/n8n/issues) (issues)

[^s1]: [n8n README (master)](https://github.com/n8n-io/n8n/blob/master/README.md)
[^s2]: [n8n-io/n8n 저장소 (GitHub API 조회)](https://github.com/n8n-io/n8n)
[^s3]: [package.json (master)](https://github.com/n8n-io/n8n/blob/master/package.json)
[^s4]: [Integrate AI](https://docs.n8n.io/build/integrate-ai)
[^s5]: [LangChain in n8n](https://docs.n8n.io/build/integrate-ai/langchain-in-n8n)
[^s6]: [AI Agent node](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent)
[^s7]: [Tools Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent)
[^s8]: [AI Agent node common issues](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/common-issues)
[^s9]: [MCP Client node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient)
[^s10]: [MCP Server Trigger node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger)
[^s11]: [Use n8n MCP server](https://docs.n8n.io/build/ways-of-building-workflows/connect-to-n8n-mcp-server)
[^s12]: [Connect to n8n MCP server](https://docs.n8n.io/connect/connect-to-n8n-mcp-server)
[^s13]: [Build and manage agents](https://docs.n8n.io/build/build-and-manage-agents)
[^s14]: [Install with Docker](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker)
[^s15]: [Install using Docker Compose](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose)
[^s16]: [Choose how to use n8n](https://docs.n8n.io/choose-how-to-use-n8n)
[^s17]: [Community license](https://docs.n8n.io/n8n-community-license/community-license)
[^s18]: [n8n@2.41.4](https://github.com/n8n-io/n8n/releases/tag/n8n%402.41.4)
[^s19]: [n8n@2.42.0](https://github.com/n8n-io/n8n/releases/tag/n8n%402.42.0)
[^s20]: [n8n@2.42.1](https://github.com/n8n-io/n8n/releases/tag/n8n%402.42.1)
[^s21]: [n8n@1.123.83](https://github.com/n8n-io/n8n/releases/tag/n8n%401.123.83)
[^s22]: [열린 Issues 목록](https://github.com/n8n-io/n8n/issues)
