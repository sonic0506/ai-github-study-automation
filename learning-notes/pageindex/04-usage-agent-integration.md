# PageIndex 활용 예시 ② 에이전트에 문서 도구로 붙이기

> 이미 만들어 둔 에이전트(OpenAI Agents SDK, Anthropic SDK, Claude Agent SDK, 그 밖의 프레임워크)에 PageIndex를 "긴 문서 읽기 도구"로 연결하는 방법을 다룹니다.

PageIndex는 브라우저에서 실행되는 클라이언트 라이브러리가 아니므로, 여기서는 **PageIndex를 호출하는 쪽, 즉 에이전트**를 클라이언트 관점으로 봅니다. `chat()`은 PageIndex가 에이전트를 대신 만들어 주는 방식이고, 이 문서의 방식은 **내 에이전트가 대화와 다른 도구를 쥐고 있고 PageIndex는 도구만 빌려주는** 방식입니다.

## 활용할 수 있는 기능

| 메서드 | 대상 | 돌려주는 것 |
|---|---|---|
| `agent_tools()` | LangChain, PydanticAI 등 아무 프레임워크 | JSON 문자열을 반환하는 일반 Python 함수 목록 |
| `as_openai_tools()` / `openai_agent_config()` | OpenAI Agents SDK | `Agent(tools=...)`용 도구 / `Agent(**...)` 인자 한 벌 |
| `as_anthropic_tools()` / `anthropic_runner_config()` | Anthropic SDK tool runner | 도구 정의 / runner 인자 한 벌 |
| `as_claude_mcp()` / `claude_agent_config()` | Claude Agent SDK | MCP 서버 설정 / `ClaudeAgentOptions(**...)` 인자 한 벌 |
| `agent_instructions()` | 공통 | 도구 사용 규칙이 담긴 시스템 프롬프트 |
| `document_context(doc_id)` | 공통 | 대상 문서를 지정하는 첫 사용자 메시지 |
| `citation_prompt()` | 공통 | 인용 규칙 프롬프트 |

알아 둘 동작 차이도 있습니다.

- **로컬 클라이언트**는 내장 도구 4개(`browse_documents`, `get_document`, `get_document_structure`, `get_page_content`)를 같은 프로세스 안에서 실행합니다. `as_claude_mcp()`는 프로세스 내부 SDK MCP 서버를 돌려줍니다.
- **Cloud 클라이언트**는 PageIndex Cloud MCP 서버의 도구 목록을 그대로 가져와 MCP로 호출합니다. 기본은 읽기 전용 엔드포인트이고, 업로드·삭제는 `include_management=True`일 때만 열립니다.
- 두 모드의 도구 이름과 응답 형식이 같으므로 **에이전트 프롬프트를 바꾸지 않고 로컬에서 Cloud로 옮길 수 있습니다.**
- `*_config()` 묶음을 쓰면 실행은 내 환경에서 일어나므로 모델 인증도 내 환경(`OPENAI_API_KEY` 등)을 따릅니다. 클라이언트에 지정한 `chat_backend`는 함께 넘어가지 않습니다.

## 실제 예제

### OpenAI Agents SDK: 사내 업무 에이전트에 규정집 도구 추가

```python
# hr_agent.py
from agents import Agent, Runner, function_tool
from pageindex import PageIndexClient


@function_tool
def get_remaining_leave(employee_id: str) -> int:
    """직원의 남은 연차 일수를 조회한다."""
    return 7  # 실제로는 HR 시스템 API 호출


def main() -> None:
    client = PageIndexClient(index={"storage_path": "/srv/pageindex"}, chat="gpt-5.6-sol")
    policy_id = client.get_document_id("hr-policy-2026.pdf")

    config = client.openai_agent_config()          # name, instructions, tools, model 한 벌
    config["tools"] = config["tools"] + [get_remaining_leave]
    agent = Agent(**config)

    result = Runner.run_sync(agent, [
        {"role": "user", "content": client.document_context(policy_id)},  # 대상 문서 지정
        {"role": "user", "content": "사번 A1024인데, 남은 연차로 5일 연속 휴가를 쓸 수 있나요? 규정상 사전 신청 기한도 알려주세요."},
    ])
    print(result.final_output)


if __name__ == "__main__":
    main()
```

에이전트는 한 대화 안에서 HR API 도구로 "남은 연차 7일"을 확인하고, PageIndex 도구로 규정집의 "휴가 신청" 절을 찾아 "연속 5일 이상은 2주 전 신청" 같은 조항을 읽은 뒤 두 정보를 합쳐 답합니다.

### Anthropic SDK tool runner

```python
# claude_runner.py
import anthropic
from pageindex import PageIndexClient


def main() -> None:
    client = PageIndexClient(index={"storage_path": "/srv/pageindex"})
    doc_id = client.get_document_id("supply-contract.pdf")

    runner = anthropic.Anthropic().beta.messages.tool_runner(
        **client.anthropic_runner_config(model="claude-opus-5"),
        messages=[{
            "role": "user",
            "content": client.document_context(doc_id) + "\n\n공급 지연 시 지체상금 산정 방식은?",
        }],
    )
    final = runner.until_done()
    print(final.content[0].text)


if __name__ == "__main__":
    main()
```

`anthropic_runner_config()`는 `model`, `max_tokens`(기본 8192), `system`(PageIndex 지시문), `tools`, 그리고 무한 반복을 막는 `max_iterations`(10턴) 상한을 한 번에 채웁니다. 모델 이름의 접두사로 경로가 정해져, `bedrock/...`, `vertex_ai/...`, `azure_ai/...`는 각 클라우드로, 그 밖에는 Anthropic API로 직접 갑니다. `pageindex[anthropic]` extra(anthropic 0.122.0 이상)가 필요합니다.

### Claude Agent SDK

```python
# claude_agent.py
import asyncio

from claude_agent_sdk import ClaudeAgentOptions, query
from pageindex import PageIndexClient


async def main() -> None:
    client = PageIndexClient(index={"storage_path": "/srv/pageindex"})
    doc_id = client.get_document_id("equipment-manual.pdf")
    options = ClaudeAgentOptions(**client.claude_agent_config(model="claude-opus-5"))

    prompt = client.document_context(doc_id) + "\n\nE-217 경보가 뜨면 현장에서 먼저 확인할 항목은?"
    async for message in query(prompt=prompt, options=options):
        print(message)


if __name__ == "__main__":
    asyncio.run(main())
```

`claude_agent_config()`는 시스템 프롬프트, `mcp_servers={"pageindex": ...}`, 그리고 그 서버 도구의 사전 승인(`allowed_tools`)을 함께 채웁니다. 직접 `model=`이나 `env=`를 넘기려면 반환된 딕셔너리에서 해당 키를 먼저 빼야 합니다.

### 그 밖의 프레임워크

```python
tools = client.agent_tools()  # 일반 함수: 인자는 JSON 직렬화 가능한 값, 반환은 JSON 문자열
```

함수마다 이름과 docstring(도구 설명, 인자 설명)이 채워져 있으므로 LangChain의 `StructuredTool.from_function` 같은 래퍼에 그대로 넘길 수 있습니다. 도구는 실패해도 예외를 던지지 않고 `{"error": ..., "next_steps": ...}` JSON을 반환해, 모델이 오류 메시지를 읽고 다음 행동을 고를 수 있게 합니다.

## 실제 서비스에서는

> 고객지원 상담원이 쓰는 내부 어시스턴트가 있다고 하겠습니다. 상담원이 "이 고객 장비가 E-217 경보를 냈는데 보증으로 처리되나요?"라고 묻습니다. 에이전트는 CRM 도구로 고객의 장비 모델과 구매일을 조회하고, PageIndex 도구로 그 모델의 서비스 매뉴얼(600페이지)에서 E-217 절을, 보증 약관 PDF에서 "소모품 제외" 조항을 찾아 읽습니다. 답변에는 매뉴얼 312쪽과 약관 9쪽 인용이 붙고, 상담원 화면은 인용 번호를 눌러 해당 PDF 페이지를 엽니다.

이 구조에서 PageIndex는 **에이전트가 가진 여러 도구 중 "긴 문서 담당"**입니다. 대화 관리, 다른 시스템 조회, 최종 답변 형식은 기존 에이전트가 그대로 맡고, PageIndex는 문서 탐색만 책임집니다.

선택 기준은 단순합니다.

- 문서 질의응답만 필요하다 → `chat()` (에이전트를 PageIndex가 만들어 줌)
- 이미 에이전트가 있고 다른 도구와 섞어야 한다 → `*_config()` 또는 `as_*_tools()`
- 프레임워크가 목록에 없다 → `agent_tools()`

참고로 Claude Desktop이나 Cursor 같은 외부 MCP 클라이언트에 바로 연결할 수 있는 MCP 서버는 Cloud 쪽에서 제공됩니다. 로컬 라이브러리를 독립 실행형 MCP 서버로 띄우는 기능은 2026년 10월 기준 기능 요청 단계입니다. 로컬 문서를 외부 MCP 클라이언트에 노출하려면 `agent_tools()`를 감싼 MCP 서버를 직접 만들어야 합니다.

---

[← 활용 예시 ① 근거 페이지가 달린 문서 질의응답](03-usage-document-qa.md) · [목차](README.md) · [활용 예시 ③ 서비스 운영과 실전 프로젝트 →](05-usage-service-ops.md)
