---
repository: VectifyAI/PageIndex
url: https://github.com/VectifyAI/PageIndex
stars: 37,313
studiedAt: 2026-10-01
status: draft
---

# VectifyAI/PageIndex

PageIndex는 벡터 DB와 chunking 없이 문서마다 계층형 트리 인덱스를 만들고, LLM이 그 트리를 추론으로 탐색해 답을 찾는 reasoning-based RAG용 Python SDK입니다.
로컬 모드와 PageIndex Cloud를 같은 클라이언트(`PageIndexClient`)로 쓸 수 있습니다.

## 01. 어떤 문제를 푸는가

벡터 기반 RAG는 의미 유사도로 검색하는데, README는 유사도와 관련성(relevance)이 다르다고 봅니다.
긴 전문 문서에서는 관련 있지만 비슷하지 않은 부분을 놓치고, 비슷하지만 관련 없는 부분을 가져온다는 설명입니다.
PageIndex는 벡터 인덱스 대신 트리 인덱스를 만들고, LLM이 사람처럼 필요한 섹션을 찾아 읽게 합니다.

- PageIndex는 AlphaGo에서 영감을 받아 벡터 인덱스를 계층형 트리 인덱스로 대체했다고 README에 적혀 있음[^s1]
- README는 금융 보고서, 법률 문서, 규제 공시, 기술 매뉴얼, 의학 문헌, 교재 같은 긴 전문 문서에 적합하다고 함[^s1]
- MIT 라이선스이며 Python >=3.10을 요구함. 분류자는 Development Status :: 3 - Alpha[^s3]
- 저장소 기준 Star 38151, Fork 3309, open_issues_count 108, 생성일 2025-04-01 (2026-10-01 GitHub API 조회)[^s2]
- 로컬 인덱싱 비용은 gpt-5.6-luna 기준 페이지당 약 $0.001로, 1,000페이지 교재가 1달러를 조금 넘는다고 함[^s1][^s7]
- 9~1,098페이지 벤치마크 문서의 인덱싱 시간은 약 13초~4.5분이었다고 함[^s1][^s7]
- PageIndex-OSS-Benchmark는 34개 PDF(1,945페이지)에 대한 62개 lookup 질문으로 quickstart 설정(로컬, flash, OCR 없음)을 측정함[^s1]
- PDF 전체를 매번 넣는 방식은 52페이지에서 2.1배, 420페이지에서 16.6배 비싸고 805페이지에서는 context window를 넘는다고 함 (gpt-5.6-sol, prompt caching 제외)[^s1]
- FinanceBench에서 98.7% 정확도를 기록했다고 함[^s1]
- 모델 권장 : index 모델은 기본 모델로 충분하고, chat 모델은 감당할 수 있는 가장 좋은 모델을 쓰라고 함[^s1]
- PageIndex Flash 블로그는 2026-08-26에 게시됨[^s7]

## 02. 핵심 구조

- 두 단계 검색 : Index 단계에서 문서마다 트리 구조 인덱스를 만들고, Retrieve 단계에서 LLM 추론으로 트리를 에이전트 방식으로 탐색함[^s1]
- PageIndexClient : 문서 제출(`submit_document`), 트리·페이지 조회, chat, 에이전트 도구를 한 클라이언트로 제공함. 인자 없는 `PageIndexClient()` 는 환경 변수와 관계없이 로컬로 동작함[^s1][^s8]
- index / chat 두 lane : index 모델은 트리를 요약·다듬는 데, chat 모델은 트리를 탐색해 답을 찾는 데 씀. `index="cloud"` 로 바꾸면 인덱싱과 저장만 Cloud로 옮겨짐[^s1]
- PageIndex Flash : PDF 자체 레이아웃 통계로 트리 구조를 만들고 LLM은 노드 요약만 작성함. 로컬 모드 기본 인덱싱 방식[^s1][^s7][^s8]
- standard 모드 : `mode="standard"` 로 기존 LLM 파이프라인을 그대로 씀[^s8]
- 트리 최적화 : 기본으로 켜짐. `optimize="merge"` 는 LLM 없는 결정적 병합, `"full"` (기본값)은 LLM expand를 더해 노드 묶음을 동시에 처리함[^s8]
- toc_source : 모든 결과에 트리 출처(detected, bookmarks, hybrid, pages, unreadable)를 표시함. 계층을 찾지 못하면 페이지당 노드 하나(pages)로 대체함[^s8]
- 패키지 구성 : client.py, local_api.py, cloud_api.py, local_store.py, mcp_bridge.py, agent_tools.py, flash/, page_index_classic.py, page_index_md.py, tree_optimize.py 등으로 나뉨[^s2]
- 주요 의존성 : openai, openai-agents(chat 엔진), litellm, mcp, PyPDF2, pypdfium2, Pillow. extras는 anthropic, claude(claude-agent-sdk), openai(빈 extra)[^s3][^s8]

## 03. 주요 기능

- 로컬 모드 : 서버, 벡터 DB, PageIndex API 키 없이 자기 LLM 키만으로 인덱싱·검색·chat을 로컬에서 수행함. 저장은 로컬 디렉터리[^s1][^s8]
- Cloud 모드 : `PAGEINDEX_API_KEY` 만 추가하면 파싱, OCR, 이미지 이해, 트리 생성, 저장을 Cloud가 맡음. chat은 사용 중인 모델 제공자를 그대로 씀[^s1][^s5]
- Chat 인터페이스 : `chat()`, `chat(stream=True)`, `chat(protocol="responses" | "messages")` 로 OpenAI Responses·Anthropic Messages API를 직접 구동하고, `chat_completions()` 는 OpenAI 호환 형식을 유지함[^s8]
- 에이전트 연동 : `as_openai_tools()`, `as_anthropic_tools()`, `as_claude_mcp()` 와 `agent_instructions()` 로 OpenAI Agents SDK, Anthropic SDK tool runner, Claude Agent SDK에 붙임[^s6][^s8]
- as_claude_mcp() 동작 : Cloud에서는 원격 PageIndex MCP 설정을, 로컬에서는 in-process SDK MCP 서버를 반환함[^s6]
- 모델 연결 : index_model / chat_model, index_backend / chat_backend로 LiteLLM 경유 제공자, 키 없는 OpenAI 호환 서버, Azure/Bedrock/Vertex를 지정함[^s8]
- 인용(citations) : `chat(citations=True)` 가 쓴 인용 태그를 `get_citations()` 로 페이지 좌표까지 풀고, `resolve_citations()` 는 번호 링크가 달린 표시용 답변을 반환함. 로컬은 페이지 단위, Cloud는 블록 단위[^s1][^s9]
- Markdown 입력 : `run_pageindex.py` 는 `--pdf_path` 외에 `--md_path` 도 받고, Markdown 전용 tree thinning 옵션을 둠[^s4]
- Cloud 전용 기능 : OCR·이미지 이해, Metadata, Folders, MCP server, get_block(), get_page_image() 등은 Cloud에서만 지원함[^s1][^s9]
- Cookbook : pageindex-citation, pageindex-flash-demo, pageindex-multimodal, pageindex-query-pricing-demo, pageindex-vision-rag 노트북을 제공함[^s15]

## 04. 시작하기

```bash
pip install -U pageindex
# Anthropic SDK / Claude Agent SDK 연동 시 extras 설치
pip install -U "pageindex[anthropic]"
pip install -U "pageindex[claude]"
```

```python
import os
from pageindex import PageIndexClient

os.environ["OPENAI_API_KEY"] = "your-openai-key"

client = PageIndexClient(
    index="gpt-5.6-luna",  # 트리 인덱스를 만드는 모델 (기본 모델로 충분)
    chat="gpt-5.6-sol",    # 트리를 탐색하는 모델 (가능한 좋은 모델)
)
# PDF를 제출하고 문서 ID를 받음
doc_id = client.submit_document("report.pdf")["doc_id"]

# 문서에 질문하기
answer = client.chat("What was the 2023 operating margin?", doc_id=doc_id)
print(answer)

# Cloud로 옮길 때는 PAGEINDEX_API_KEY를 설정하고 index만 바꿈
# client = PageIndexClient(index="cloud", chat="gpt-5.6-sol")
# doc_id = client.submit_document("report.pdf", wait=True)["doc_id"]
```

설치와 예제는 공식 문서 기준입니다.[^s1][^s3][^s5]

## 05. 최근 변화

- v0.2.20 (2026-09-28)[^s8]
    - Flash 인덱싱 속도 개선 : 노드 요약을 가장 깊은 노드부터 트리 확장과 동시에 실행함. 222페이지 보고서 98 s→73 s, 758페이지 책 174 s→137 s
    - 요약마다 summary_max_words(기본 150) 상한을 둬 요약 단계를 1/3~1/2 더 줄임
    - summary_max_words, summary_concurrency, use_embedded_toc, optimize를 클라이언트와 index= 슬롯에서 설정 가능. CLI에 --summary-max-words, --summary-concurrency 추가
    - Anthropic lane이 설정한 chat_model을 그대로 씀. bedrock/, vertex_ai/, azure_ai/ 접두사로 경로를 정하고 [anthropic] extra는 anthropic>=0.122.0 요구
    - list_documents의 limit 상한 10,000 (기존 100), 로컬 클라이언트도 folder_id="root" 허용
- v0.2.19 (2026-09-21)[^s9]
    - BREAKING : 0.2.17의 resolve_citations가 get_citations로 이름이 바뀜 (인자·결과 동일)
    - resolve_citations는 인용 태그를 번호 Markdown 링크로 바꾼 {"answer", "citations"}를 반환함
    - highlight_region 추가, Pillow >= 9.0 필수 의존성화
    - get_page_image, get_document_image (Cloud 전용), 경로↔ID 변환 함수, list_documents(recursive=True) 추가
- v0.2.18 (2026-09-16)[^s10]
    - get_document_id(name)로 표시 이름에서 문서 ID를 한 번의 API 호출로 조회함
    - 로컬 인용·탐색 프롬프트를 chat MCP 서버와 맞춤. 임의로 만들던 "Sources" footer 제거
    - 인용 단위를 line-level에서 block-level로 변경 (PR #506), 표 비교 수정 (PR #505)

## 06. 커뮤니티에서 반복되는 주제

- Flash로 FinanceBench를 돌렸더니 coverage가 50%였고 일부 파일은 앞쪽 페이지가 빠졌다는 보고(#518). 메인테이너는 크고 복잡한 PDF는 Cloud를 권장한다고 답함[^s12]
- 첫 페이지가 파트당 평균 토큰보다 크면 page_list_to_group_text()가 빈 chunk를 만들어 모델에 넘김(#467)[^s13]
- 권한 플래그만 AES로 암호화된 PDF에서 Flash가 PyCryptodome 누락으로 실패함(#426)[^s14]
- 트리 품질 관련 : TOC 없는 문서에서 문장 전체가 노드 제목이 됨(#341), 같은 페이지의 형제 노드가 같은 텍스트를 받아 요약이 중복됨(#340)[^s11]
- 기능 요청 : 대형 문서 증분 인덱스 갱신(#316), .txt 파싱(#222), 로마 숫자 페이지 번호(#164), async·polling·webhook(#122), docker compose 백엔드 서비스(#137)[^s11]
- 보안 정책 문서 부재(#240)와 취약점 제보 문의(#80)가 열려 있음[^s11]

## 07. 한계와 주의점

- 로컬(오픈소스) 버전은 텍스트 기반 PDF만 다룸. 스캔 문서와 이미지 위주 문서는 Cloud가 필요함[^s1][^s7]
- OCR·이미지 이해, Metadata, Folders, MCP server, 블록 단위 인용은 Cloud 전용임[^s1][^s5]
- PageIndex File System(수백만 문서 규모의 파일 단위 트리 인덱스)은 Cloud 전용임[^s1]
- 크고 복잡한 PDF는 메인테이너가 Cloud를 권장함[^s12]
- 0.2.19에서 resolve_citations → get_citations 이름 변경이 있었음. 0.2.17~0.2.18 코드는 수정이 필요함[^s9]
- Development Status가 3 - Alpha로 표시되어 있음[^s3]
- VPC·온프레미스 전용 배포는 별도 문의가 필요함[^s1]

## 08. 더 알아볼 것

- main 브랜치 `pyproject.toml` 의 version은 0.2.10인데 최신 릴리스는 v0.2.20이라, PyPI 배포 버전과의 관계를 확인하지 못했습니다.
- Query cost and accuracy 벤치마크의 모델별 정확도 수치는 이미지로만 제공되어 확인하지 못했습니다.
- FinanceBench 98.7%가 오픈소스 로컬 모드인지, Mafin 2.5 등 다른 구성으로 측정된 값인지 확인하지 못했습니다.
- PageIndex Cloud 요금과 무료 사용량은 확인하지 못했습니다. (#160에 같은 질문이 열려 있습니다.)
- 로컬 모드에서 여러 문서를 함께 검색할 때의 동작과 규모 한계는 확인하지 못했습니다.
- 리포트 기준(2026-09-30) Star는 37,313개, 24시간 증가는 +1,010입니다. 조사 시점(2026-10-01) API 값은 38,151개입니다.

## 참고 자료

- [PageIndex README (main)](https://github.com/VectifyAI/PageIndex/blob/main/README.md) (readme)
- [VectifyAI/PageIndex 저장소 (API 메타데이터, pageindex/ 구성)](https://github.com/VectifyAI/PageIndex) (code)
- [pyproject.toml (main)](https://github.com/VectifyAI/PageIndex/blob/main/pyproject.toml) (code)
- [run_pageindex.py (main)](https://github.com/VectifyAI/PageIndex/blob/main/run_pageindex.py) (code)
- [Getting Started](https://docs.pageindex.ai/getting-started) (docs)
- [Agent Integration](https://docs.pageindex.ai/sdk/agents) (docs)
- [PageIndex Flash (blog)](https://pageindex.ai/blog/pageindex-flash) (blog)
- [v0.2.20](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.20) (release)
- [v0.2.19](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.19) (release)
- [v0.2.18](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.18) (release)
- [열린 Issues 목록](https://github.com/VectifyAI/PageIndex/issues) (issues)
- [#518 Flash on FinanceBench (coverage only 50%)](https://github.com/VectifyAI/PageIndex/issues/518) (issues)
- [#467 Oversized first page produces an empty chunk](https://github.com/VectifyAI/PageIndex/issues/467) (issues)
- [#426 PyCryptodome DependencyError on AES PDFs](https://github.com/VectifyAI/PageIndex/issues/426) (issues)
- [cookbook/](https://github.com/VectifyAI/PageIndex/tree/main/cookbook) (code)

[^s1]: [PageIndex README (main)](https://github.com/VectifyAI/PageIndex/blob/main/README.md)
[^s2]: [VectifyAI/PageIndex 저장소 (API 메타데이터, pageindex/ 구성)](https://github.com/VectifyAI/PageIndex)
[^s3]: [pyproject.toml (main)](https://github.com/VectifyAI/PageIndex/blob/main/pyproject.toml)
[^s4]: [run_pageindex.py (main)](https://github.com/VectifyAI/PageIndex/blob/main/run_pageindex.py)
[^s5]: [Getting Started](https://docs.pageindex.ai/getting-started)
[^s6]: [Agent Integration](https://docs.pageindex.ai/sdk/agents)
[^s7]: [PageIndex Flash (blog)](https://pageindex.ai/blog/pageindex-flash)
[^s8]: [v0.2.20](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.20)
[^s9]: [v0.2.19](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.19)
[^s10]: [v0.2.18](https://github.com/VectifyAI/PageIndex/releases/tag/v0.2.18)
[^s11]: [열린 Issues 목록](https://github.com/VectifyAI/PageIndex/issues)
[^s12]: [#518 Flash on FinanceBench (coverage only 50%)](https://github.com/VectifyAI/PageIndex/issues/518)
[^s13]: [#467 Oversized first page produces an empty chunk](https://github.com/VectifyAI/PageIndex/issues/467)
[^s14]: [#426 PyCryptodome DependencyError on AES PDFs](https://github.com/VectifyAI/PageIndex/issues/426)
[^s15]: [cookbook/](https://github.com/VectifyAI/PageIndex/tree/main/cookbook)
