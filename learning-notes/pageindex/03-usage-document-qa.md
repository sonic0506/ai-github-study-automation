# PageIndex 활용 예시 ① 근거 페이지가 달린 문서 질의응답

> 두 해 연차보고서를 비교하는 질의응답을 만들면서, 인용으로 근거 페이지를 붙이고 에이전트가 실제로 읽은 페이지를 기록하는 방법을 다룹니다.

## 예제 1. 연차보고서 두 개를 비교하는 Q&A

### 요구사항

> 애널리스트가 한 회사의 2022년·2023년 연차보고서(각 200~300페이지)를 올리고 "영업이익률이 어떻게 변했고 원인은 무엇인가?"를 묻는다. 답변의 모든 수치에는 문서 이름과 페이지 번호가 붙어야 하고, 이어지는 후속 질문("그중 원자재 영향은 얼마나 되나?")도 이전 대화를 이어서 답해야 한다.

### 구현

```python
# analyst_qa.py
from pageindex import PageIndexClient

QUESTION = "2022년 대비 2023년 영업이익률은 어떻게 변했고, 보고서가 밝힌 원인은 무엇인가요?"
FOLLOW_UP = "그중 원자재 가격 영향은 금액으로 얼마나 되나요?"


def main() -> None:
    client = PageIndexClient(
        index={"model": "gpt-5.6-luna", "storage_path": "/srv/pageindex"},
        chat="gpt-5.6-sol",  # 탐색 품질이 정확도를 좌우하므로 좋은 모델
    )

    # 1. 인덱싱은 문서당 한 번. 이미 있으면 재사용한다
    existing = {d["name"]: d["id"] for d in client.list_documents(limit=1000)["documents"]}
    doc_ids = []
    for path in ["reports/acme-2022.pdf", "reports/acme-2023.pdf"]:
        name = path.rsplit("/", 1)[-1]
        doc_ids.append(existing.get(name) or client.submit_document(path)["doc_id"])

    # 2. 첫 질문: 두 문서를 함께 대상으로, 인용 포함
    messages = [{"role": "user", "content": QUESTION}]
    answer = client.chat(messages, doc_id=doc_ids, citations=True)

    resolved = client.resolve_citations(answer, doc_id=doc_ids)
    print(resolved["answer"])
    for c in resolved["citations"]:
        print(f'  [{c["index"]}] {c["document"]} p.{c["page"]}')

    # 3. 후속 질문: 보이는 대화를 직접 이어 붙인다 (doc_id는 같은 값 유지)
    messages += [
        {"role": "assistant", "content": answer},
        {"role": "user", "content": FOLLOW_UP},
    ]
    print(client.chat(messages, doc_id=doc_ids, citations=True))


if __name__ == "__main__":
    main()
```

출력은 대략 다음과 같은 모양입니다.

```text
2023년 영업이익률은 12.3%로 2022년 9.8%에서 2.5%p 올랐습니다 [[1]](#pageindex-citation-01) [[2]](#pageindex-citation-02).
보고서는 원인으로 판가 인상과 고마진 서비스 부문 비중 확대를 들고, 원자재 가격 부담은 일부 상쇄 요인으로 설명합니다 [[3]](#pageindex-citation-03).
  [1] acme-2023.pdf p.42
  [2] acme-2022.pdf p.39
  [3] acme-2023.pdf p.47
```

### 실행 흐름

```text
애널리스트 질문
 ↓
chat(doc_id=[2022, 2023], citations=True)
 ↓
에이전트: get_document_structure(acme-2023.pdf) → "재무 정보 > 손익 요약 (41~44쪽)" 선택
 ↓
에이전트: get_page_content(acme-2023.pdf, "41-44") → 12.3% 확인
 ↓
에이전트: 2022 문서도 같은 방식으로 구조 → 페이지 읽기 → 9.8% 확인
 ↓
에이전트: 원인 설명이 있는 "경영진 분석(46~48쪽)"을 추가로 읽음
 ↓
인용 태그가 붙은 답변 → resolve_citations()로 번호 링크와 목록으로 변환
```

### 코드 설명

1. **인덱싱 결과를 재사용합니다.** `submit_document()`는 호출할 때마다 인덱싱 비용이 듭니다. 같은 이름으로 다시 올리면 새 문서(`acme-2023_1.pdf`)가 생기므로, `list_documents()`로 먼저 확인합니다. 실제 서비스에서는 `doc_id`를 DB에 저장합니다([활용 예시 ③](05-usage-service-ops.md) 참고).
2. **`doc_id`에 목록을 넘깁니다.** 두 문서를 한 대화의 대상으로 지정하면, 에이전트가 문서마다 구조를 보고 필요한 부분을 따로 읽습니다. 로컬 문서에서는 이 범위가 도구 계층에서도 강제되어, 라이브러리의 다른 문서를 읽지 못합니다.
3. **`citations=True` + `resolve_citations()`**: 모델이 넣은 `<cite doc=... page=.../>` 태그를 번호 링크로 바꿔, 화면에서 각 번호를 "문서 이름 + 페이지"로 연결할 수 있게 합니다. 로컬 문서는 페이지 단위까지입니다.
4. **대화 상태는 호출자가 관리합니다.** `chat()`은 서버 쪽 세션을 두지 않습니다. 사용자에게 보인 대화를 `role/content` 목록으로 쌓아 다시 넘기고, 대화 중 `doc_id`는 바꾸지 않습니다.

### 왜 이렇게 사용하는가?

같은 질문을 벡터 RAG로 처리하면 "영업이익률"이 들어간 문단이 2022·2023 문서 모두에서, 그리고 "5개년 요약표" 같은 엉뚱한 섹션에서도 높은 점수로 섞여 나옵니다. 어느 해 수치인지 모델이 혼동하기 쉽습니다. PageIndex에서는 에이전트가 **문서별로 목차를 따라가 해당 연도의 손익 섹션을 직접 고르기** 때문에 이런 혼동이 줄고, 인용이 그 선택을 사용자에게 보여줍니다. 숫자가 틀렸을 때도 "어느 페이지를 읽고 그렇게 답했는지"를 바로 확인할 수 있습니다.

---

## 예제 2. 에이전트가 읽은 페이지를 감사 로그로 남기기

### 요구사항

> 컴플라이언스팀은 답변마다 "모델이 실제로 열어 본 페이지"를 기록해 두길 원한다. 인용은 모델이 답에 적은 것이고, 감사 로그는 모델이 실제로 읽은 것이어야 한다.

### 구현

```python
# audit_trail.py
import json

from pageindex import PageIndexClient


def ask_with_trace(client: PageIndexClient, question: str, doc_id: str) -> dict:
    stream = client.chat(question, doc_id=doc_id, stream=True)

    answer_parts: list[str] = []
    pages_read: list[dict] = []
    for event in stream.events:  # 텍스트 대신 타입이 있는 이벤트로 소비
        if event["type"] == "answer":
            answer_parts.append(event["delta"])
        elif event["type"] == "tool_call" and event["name"] == "get_page_content":
            args = json.loads(event["arguments"]) if isinstance(event["arguments"], str) else event["arguments"]
            pages_read.append({"doc": args.get("doc_name"), "pages": args.get("pages")})

    return {"answer": "".join(answer_parts), "pages_read": pages_read}


def main() -> None:
    client = PageIndexClient(index={"storage_path": "/srv/pageindex"})
    doc_id = client.get_document_id("internal-policy-2026.pdf")  # 표시 이름으로 ID 조회
    result = ask_with_trace(client, "해외 출장 시 1일 숙박비 한도는?", doc_id)
    print(result["answer"])
    print(result["pages_read"])  # 예: [{'doc': 'internal-policy-2026.pdf', 'pages': '57-58'}]


if __name__ == "__main__":
    main()
```

### 실행 흐름

```text
chat(stream=True) → ChatStream
 ↓
.events 소비: thinking → tool_call(get_document_structure) → tool_result
 ↓
tool_call(get_page_content, pages="57-58") → 감사 로그에 기록
 ↓
answer 이벤트의 delta를 모아 최종 답변 구성
```

### 코드 설명

1. **스트림은 한 가지 방식으로만 소비합니다.** `ChatStream`은 그대로 순회하면 텍스트 조각을, `.events`로 순회하면 `thinking`·`answer`·`tool_call`·`tool_result` 이벤트를 줍니다. 한 번의 실행은 한 가지 보기만 제공하므로 둘 다 필요하면 이벤트에서 텍스트를 직접 모읍니다.
2. **`tool_call`의 인자에서 페이지를 뽑습니다.** `get_page_content`의 `pages` 인자가 곧 모델이 실제로 연 페이지 범위입니다.
3. **`get_document_id(name)`**: 표시 이름으로 문서 ID를 찾습니다. 사람이 파일 이름으로 문서를 지정하는 화면과 잘 맞습니다.

### 왜 이렇게 사용하는가?

인용은 "모델이 근거라고 주장한 것"이고, 도구 호출 기록은 "모델이 실제로 읽은 것"입니다. 둘을 함께 저장해 두면 인용된 페이지를 실제로 읽지 않은 답변(환각 가능성)을 기계적으로 찾아낼 수 있습니다. 벡터 RAG에서는 검색된 청크를 저장할 수는 있어도 "왜 그 청크였는지"가 점수뿐이지만, PageIndex에서는 **구조를 보고 → 이 범위를 열었다**는 탐색 경로 자체가 사람이 읽을 수 있는 감사 기록이 됩니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 에이전트에 문서 도구로 붙이기 →](04-usage-agent-integration.md)
