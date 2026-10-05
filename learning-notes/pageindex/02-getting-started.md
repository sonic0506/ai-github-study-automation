# PageIndex 설치와 첫 사용

> 설치 방법, 모델과 저장 위치 같은 기본 설정, 가장 간단한 첫 실행, 그리고 설치·설정할 때 자주 겪는 문제를 다룹니다.

## 설치

필요 조건은 Python 3.10 이상과, 사용할 LLM 제공자의 API 키(기본값은 OpenAI)입니다. 로컬 모드에는 PageIndex API 키, 서버, 벡터 DB가 필요 없습니다.

```bash
pip install -U pageindex
```

```bash
uv add pageindex
```

```bash
poetry add pageindex
```

에이전트 프레임워크와 연결할 때는 extra를 함께 설치합니다.

```bash
pip install -U "pageindex[anthropic]"   # Anthropic SDK tool runner, chat(protocol="messages")
pip install -U "pageindex[claude]"      # Claude Agent SDK
```

기본 설치에 `openai`, `openai-agents`(chat 엔진), `litellm`(모델 라우팅), `mcp`, `pypdfium2`·`PyPDF2`(PDF 처리), `Pillow`가 함께 들어옵니다. 의존성이 가볍지 않으므로 기존 프로젝트에 넣을 때는 가상 환경을 분리하는 편이 안전합니다.

## 기본 설정

**모델 키**

```bash
export OPENAI_API_KEY="sk-..."          # 기본 모델(OpenAI)을 쓸 때
export ANTHROPIC_API_KEY="sk-ant-..."   # anthropic/ 모델을 쓸 때
```

**모델과 저장 위치**

```python
from pageindex import PageIndexClient

client = PageIndexClient(
    index={"model": "gpt-5.6-luna", "storage_path": "./data/pageindex"},  # 인덱싱 모델 + 저장 위치
    chat="anthropic/claude-opus-5",                                       # 답변 모델
)
```

- 모델 이름은 LiteLLM 규칙을 따릅니다. 접두사 없는 이름은 OpenAI 모델, 다른 제공자는 `anthropic/...`, `bedrock/...`, `vertex_ai/...`처럼 `제공자/모델` 형식입니다.
- 아무것도 지정하지 않으면 SDK 기본값(2026년 10월 기준 index `gpt-5.6-luna`, chat `gpt-5.6-sol`)을 씁니다.
- `storage_path`의 기본값은 현재 작업 디렉터리의 `./.pageindex`입니다. 스크립트를 어디서 실행하느냐에 따라 저장 위치가 달라지므로, 서비스에서는 절대 경로로 고정합니다.

**사내 게이트웨이나 OpenAI 호환 서버(vLLM, Ollama 등)**

```python
client = PageIndexClient(
    index={
        "model": "gpt-5.6-luna",
        "backend": {"api_key": "gateway-key", "base_url": "https://llm-gateway.internal/v1"},
    },
    chat={
        "model": "gpt-5.6-sol",
        "backend": {"api_key": "gateway-key", "base_url": "https://llm-gateway.internal/v1"},
    },
)
```

index와 chat은 서로 다른 레인이므로 연결 정보도 각각 지정합니다. 인덱싱은 사내 저렴한 모델로, 답변은 외부 고성능 모델로 나누는 구성도 가능합니다.

## 가장 간단한 예제

```python
# quickstart.py
from pageindex import PageIndexClient


def main() -> None:
    client = PageIndexClient()  # 로컬 모드, SDK 기본 모델

    doc = client.submit_document("annual-report.pdf")
    doc_id = doc["doc_id"]

    # 트리 확인: 텍스트 없이 제목·페이지 범위·요약만
    for node in client.get_document_structure(doc_id):
        print(node["node_id"], node["title"], node["start_index"], node["end_index"])

    answer = client.chat("2023년 영업이익률과 전년 대비 변화 원인은?", doc_id=doc_id)
    print(answer)


if __name__ == "__main__":  # Flash가 하위 프로세스를 띄우므로 반드시 필요
    main()
```

```bash
python quickstart.py
```

1. **무엇을 생성하는가**: `submit_document()`가 PDF를 Flash로 인덱싱해 트리를 만들고 `./.pageindex/` 아래에 문서 폴더(`tree.json`, `pages.json`, `doc.json`)를 저장합니다. 반환값은 `{"doc_id": ..., "name": ...}`입니다. 같은 이름의 문서가 이미 있으면 `name_1`처럼 접미사가 붙고 경고가 출력됩니다.
2. **어떤 값을 전달하는가**: `chat()`에는 질문 문자열(또는 대화 메시지 목록)과 대상 `doc_id`를 넘깁니다. `doc_id`에 목록을 주면 여러 문서를 함께 대상으로 삼습니다.
3. **PageIndex가 무엇을 처리하는가**: chat 모델로 문서 QA 에이전트를 만들고, 에이전트가 트리 구조를 본 뒤 관련 페이지를 골라 읽습니다. 로컬 문서는 `doc_id` 범위 제한이 프롬프트뿐 아니라 도구 계층에서도 강제됩니다.
4. **어떤 결과를 반환하는가**: 답변 문자열을 반환합니다. `stream=True`면 텍스트 조각을 순서대로 내주는 스트림, `citations=True`면 인용 태그가 포함된 답변이 됩니다.

인덱싱은 문서당 한 번이므로, 실제 사용에서는 `doc_id`를 DB 등에 저장해 두고 다음부터는 `chat()`만 호출합니다. 저장된 문서는 `client.list_documents()`로 다시 찾을 수 있습니다.

**Cloud로 옮기기**

```python
import os
from pageindex import PageIndexClient

os.environ["PAGEINDEX_API_KEY"] = "pi-..."

client = PageIndexClient(index="cloud", chat="gpt-5.6-sol")
doc_id = client.submit_document("scanned-contract.pdf", wait=True)["doc_id"]  # Cloud는 비동기라 wait로 대기
print(client.chat("해지 통지 기간은?", doc_id=doc_id))
```

바뀌는 것은 `index="cloud"`와 `wait=True`뿐입니다. Cloud는 스캔본 OCR, 이미지 이해, 폴더, 메타데이터, 블록 단위 인용을 추가로 지원합니다.

---

## 설치·설정할 때 주의할 점

- **`if __name__ == "__main__":` 가드가 필요합니다.** Flash는 PDF 파싱을 여러 프로세스로 나눠 실행합니다. macOS·Windows의 spawn 방식에서는 하위 프로세스가 스크립트를 다시 import하므로, 가드가 없으면 `submit_document()`가 "spawned worker process" 오류로 중단됩니다. Jupyter 노트북에서는 문제가 되지 않습니다.
- **인자 없는 클라이언트는 항상 로컬입니다.** `.env`에 `PAGEINDEX_API_KEY`를 넣어도 `PageIndexClient()`는 Cloud로 가지 않습니다. Cloud를 의도했다면 `index="cloud"` 또는 `api_key=`를 코드에 적어야 합니다.
- **로컬 SDK는 PDF만 받습니다.** `.docx`, `.txt`는 먼저 PDF로 변환합니다. Markdown은 SDK 클라이언트가 아니라 CLI(`python run_pageindex.py --md_path doc.md`, 저장소 클론 필요)나 `md_to_tree()`로 트리만 만들 수 있습니다.
- **텍스트 레이어가 없는 PDF는 로컬에서 실패합니다.** 모든 페이지가 비어 있으면 "PDF has no content" 오류가 납니다. 스캔본은 Cloud를 쓰거나 OCR 도구로 텍스트 레이어를 먼저 입힙니다.
- **설정 키를 틀리면 생성 시점에 바로 실패합니다.** `index=`/`chat=` 딕셔너리의 오타, 로컬과 Cloud 설정 혼용, `mode="standard"`와 Flash 전용 옵션(`summary_max_words` 등) 혼용은 클라이언트 생성이나 제출 단계에서 허용되는 키 목록과 함께 오류가 납니다. 조용히 무시되지 않으므로 오류 메시지를 그대로 읽으면 됩니다.
- **모델 키가 잘못되면 인덱싱 전체가 실패합니다.** 요약이 빈 채로 저장되는 대신 실패하므로, 대량 인덱싱 전에 작은 PDF로 키와 모델 이름을 먼저 확인합니다.
- **레이트 리밋이 낮은 계정**: Flash는 요약 호출을 동시에 최대 64개(`summary_concurrency` 기본값)까지 보냅니다. 429 오류가 잦으면 `index={"summary_concurrency": 8}`처럼 낮춥니다.
- **버전 고정**: 릴리스가 잦고 Breaking Change가 있었으므로 `pageindex==0.2.21`처럼 고정하고, 올릴 때 릴리스 노트를 확인합니다. 저장소의 `pyproject.toml`에 적힌 버전은 자리표시자이고, 실제 버전은 릴리스 태그에서 정해집니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 근거 페이지가 달린 문서 질의응답 →](03-usage-document-qa.md)
