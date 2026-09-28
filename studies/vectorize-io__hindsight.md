---
repository: vectorize-io/hindsight
url: https://github.com/vectorize-io/hindsight
stars: 40102
studiedAt: 2026-09-29
status: draft
---

# vectorize-io/hindsight

Hindsight는 Vectorize가 만든 오픈소스 에이전트 메모리 시스템입니다.
대화 기록을 다시 꺼내 주는 데서 그치지 않고, 쌓인 기억을 믿음(observation)과 정리된 답(mental model)으로 다듬어 에이전트가 시간이 지나며 배우도록 하는 것을 목표로 합니다.

## 01. 어떤 문제를 푸는가

기존 에이전트 메모리는 대부분 대화 기록을 벡터 검색으로 다시 찾는 방식입니다.
Hindsight는 이 방식이 여러 세션에 걸친 질문, 시간 표현이 들어간 질문, 바뀐 사실을 반영해야 하는 질문에서 약하다고 보고 구조화된 메모리를 제안합니다.

- 해결 대상 : 에이전트가 기억만 하고 배우지는 못하는 문제. README는 RAG와 knowledge graph 방식의 한계를 없애는 것을 목표로 밝힘[^s1]
- RAG와의 구분 : RAG는 정적 문서에 대한 의미 유사도 검색이고, Hindsight는 시간 추론·엔티티 이해·믿음 형성을 갖춘 구조화된 메모리라고 설명함[^s12]
- RAG로 충분한 경우 : 정적 코퍼스에 대한 문서 Q&A, 시간 요소가 없는 검색. Hindsight가 맞는 경우 : 지속 메모리, 엔티티 추적, 일관된 성향, "last month" 같은 시간 표현 질의[^s12]
- 논문 : "Hindsight is 20/20: Building Agent Memory that Retains, Recalls, and Reflects" (arXiv 2512.12818, 2025-12-14 제출). 메모리를 외부 검색 계층이 아닌 추론의 1급 기반으로 다룸[^s17]
- 논문 수치 : LongMemEval 91.4%, LoCoMo 89.61% (확장된 backbone 기준). 20B 모델에서 full-context 기준선 39%를 83.6%로 올렸다고 보고함[^s17]
- README는 Virginia Tech Sanghani Center와 The Washington Post가 벤치마크 결과를 독립적으로 재현했고, 다른 시스템 점수는 벤더 자체 보고라고 밝힘[^s1]
- 라이선스는 MIT[^s1]

## 02. 핵심 구조

서버(`hindsight-api`)가 PostgreSQL에 메모리를 저장하고, 클라이언트 SDK·MCP·통합 플러그인이 이 서버에 붙는 구조입니다.
메모리는 bank 단위로 격리되고, 들어온 정보는 네 종류의 메모리로 나뉘어 저장됩니다.

- Memory bank : 사용자·에이전트·프로젝트 하나에 대응하는 격리된 메모리 저장소. bank 간 누출이 없도록 격리함[^s1]
- World facts : 세상에 대한 사실 ("The stove gets hot")[^s1]
- Experiences : 에이전트 자신의 경험[^s1]
- Observations : 여러 기억에서 통합한, 근거가 달린 믿음[^s1]
- Mental models : observation과 사실에서 합성한, 에이전트가 이해한 세계. 질문을 한 번 정의하면 Hindsight가 답을 쓰고 백그라운드에서 다시 씀[^s1]
- 저장 표현 : 엔티티, 관계, 시계열에 sparse/dense 벡터 표현을 함께 둠[^s1]
- 저장소 : PostgreSQL + pgvector, 또는 Oracle AI Database 23ai[^s1]
- 설정 계층 : 전역 환경 변수 → 테넌트별 → bank별[^s1]
- 디렉터리 : `hindsight-api`, `hindsight-clients`, `hindsight-cli`, `hindsight-control-plane`, `hindsight-docs`, `hindsight-embed`, `hindsight-extensions`, `helm/`, `docker/`, `cookbook/`, `monitoring/`, `skills/` 등[^s2]

세 가지 연산이 메모리를 다룹니다.

- retain : LLM으로 핵심 사실, 시간 정보, 엔티티, 관계를 추출하고 정규화해 canonical 엔티티·시계열·검색 인덱스로 만듦[^s1]
- recall : 네 가지 검색 전략(TEMPR)을 병렬로 실행함. semantic(벡터 유사도), keyword(BM25), graph(엔티티·시간·인과 링크), temporal(시간 범위)[^s5]
- recall 병합 : Reciprocal Rank Fusion(k=60)으로 합친 뒤 cross-encoder로 재순위화하고 token 한도에 맞춰 자름. 재순위화 전 후보는 기본 300개(`HINDSIGHT_API_RERANKER_MAX_CANDIDATES`)[^s5]
- recall 점수 보정 : recency(α=0.2, 365일 선형 감쇠), temporal proximity(α=0.2), proof count(α=0.1, 로그 스케일)를 곱해 반영함[^s5]
- reflect : `search_mental_models`, `search_observations`, `recall`, `expand`, `done` 도구로 최대 10회 반복하는 에이전트 루프. mental model → observation → raw fact 순으로 찾음[^s6]
- consolidation : `retain()` 이 끝나면 백그라운드에서 관련 사실을 observation으로 통합함. `HINDSIGHT_API_ENABLE_AUTO_CONSOLIDATION=false` 로 끌 수 있음[^s7]

## 03. 주요 기능

- LLM provider : `HINDSIGHT_API_LLM_PROVIDER` 로 25개 이상의 provider를 고름. 로컬(`ollama`, `lmstudio`, `llamacpp`), OpenAI 호환 엔드포인트, 게이트웨이(`litellm`)를 지원함[^s1]
- 구독 기반 provider : `openai-codex`, `claude-code`, `cursor`, `github-copilot` 은 API 키 없이 동작한다고 함[^s1]
- recall budget : `low` 100, `mid` 300(기본), `high` 1000 후보. `HINDSIGHT_API_RECALL_BUDGET_FUNCTION=adaptive` 로 `max_tokens` 비례 방식도 씀[^s5]
- recall 필터 : `max_tokens`(기본 4096), `types`(world, experience, observation), `tags_match`(exact, any, all), `include_chunks`[^s5]
- keyword backend : `native`, `vchord`, `pg_textsearch`, `pgroonga`, `pg_search` 중 선택함[^s5]
- disposition : bank마다 skepticism, literalism, empathy를 1~5로 두고 `reflect_mission` 으로 정체성을 줌. directive는 reflect가 반드시 지켜야 하는 규칙임[^s6]
- reflect 출력 : 응답, `based_on`, `trace`, `structured_output`(`response_schema` 기준), `usage`[^s6]
- observation : 근거 인용과 proof count를 유지하고, 새 증거가 오면 덮어쓰지 않고 다듬음. 중복 기준 `HINDSIGHT_API_CONSOLIDATION_DEDUP_THRESHOLD` 기본 0.97[^s7]
- mental model 갱신 : consolidation 후 또는 cron 일정으로 갱신하며, 새로 들어온 부분만 읽는 delta 방식으로 기존 내용을 보존함. 버전 이력과 근거를 남김[^s8]
- Knowledge pages : mental model을 wiki처럼 폴더로 정리한 문서. markdown 파일로 디스크에 내보낼 수 있음[^s1]
- MCP : 서버마다 bank별 엔드포인트 `http://localhost:8888/mcp/{bank_id}/` 가 기본으로 켜져 있음. 단일 bank 27개, multi-bank 30개 도구[^s9]
- Memory Defense : bank별 `memory_defense` 설정으로 켜는 옵트인 기능. 45개 정규식 패턴으로 비밀값·PII를 검사해 `[REDACTED:type]` 으로 가리거나 항목을 막음[^s10]
- 다국어 : 입력 언어를 감지해 원문 언어와 엔티티 표기를 그대로 보존함[^s1]
- 운영 : Prometheus 메트릭, 마이그레이션·bank 복구용 Admin CLI, retain·consolidation·refresh 이벤트 webhook[^s1]

## 04. 시작하기

Docker 이미지 하나로 API(8888)와 UI(9999)를 함께 띄우는 방법이 README 권장 경로입니다.[^s1]
기본값은 내장 PostgreSQL인 pg0이며 개발용입니다. 운영에서는 pgvector 등 벡터 확장이 있는 PostgreSQL 14 이상을 따로 두어야 합니다.[^s4]

```bash
# LLM 키 지정 (기본 provider는 OpenAI)
export OPENAI_API_KEY=sk-xxx

# API(8888) + UI(9999) 서버 실행, 데이터는 named volume 에 저장
docker run -it --pull always --name hindsight --restart unless-stopped -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

```bash
# 서버 없이 pip 로 실행 (내장 DB 는 ~/.hindsight/data/ 에 생성)
pip install hindsight-api
export HINDSIGHT_API_LLM_API_KEY=sk-xxx
hindsight-api
```

클라이언트는 Python, Node.js, Go, CLI로 제공됩니다.[^s1]

```bash
pip install hindsight-client -U                # Python
npm install @vectorize-io/hindsight-client     # Node.js / TypeScript
```

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://localhost:8888")

# retain : bank 에 정보 저장
client.retain(bank_id="my-bank", content="Alice works at Google as a software engineer")

# recall : 네 가지 전략으로 기억 검색
client.recall(bank_id="my-bank", query="What does Alice do?")

# reflect : 기억을 바탕으로 추론해 답변 생성
client.reflect(bank_id="my-bank", query="Tell me about Alice")
```

서버를 따로 두지 않으려면 `hindsight-all` 로 Python 프로세스 안에서 서버를 띄웁니다.[^s1]

```python
import os
from hindsight import HindsightServer, HindsightClient

# with 블록 안에서만 내장 서버가 살아 있음
with HindsightServer(
    llm_provider="openai",
    llm_model="gpt-5-mini",
    llm_api_key=os.environ["OPENAI_API_KEY"]
) as server:
    client = HindsightClient(base_url=server.url)
    client.retain(bank_id="my-bank", content="Alice works at Google")
    results = client.recall(bank_id="my-bank", query="Where does Alice work?")
```

(Intel Mac에서는 `hindsight-all-slim` 또는 `hindsight-api-slim` 을 설치해야 합니다. 전체 패키지는 Intel Mac용 wheel이 없어 몇 달 전 릴리스로 조용히 내려간다고 합니다.)[^s4]

- 이미지 변형 : `latest` (전체, 약 9GB), `latest-slim` (약 500MB, 외부 provider 필요)[^s4]
- 메모리 권장치 : 전체 이미지 최소 1.5GB·권장 2GB, slim 최소 512MB·권장 1GB[^s4]
- Python 요구 버전 : `>=3.11`[^s3]

## 05. 최근 변화

2026년 7월부터 1~3주 간격으로 릴리스가 나왔고, 최신은 v0.10.1입니다.[^s3]
v0.10.0에서 bank profile·background 엔드포인트가 제거되는 breaking change가 있었습니다.[^s14]

- v0.10.1 (PyPI 업로드 2026-09-21)[^s3][^s13]
    - export/import를 묶은 bank transfer API 추가
    - OpenClaw용 에이전트별 bank 매핑(`agentBankMap`)
    - 별도 LLM 설정을 쓰는 mental model 자동 갱신 설정
    - Hermes Agent 메모리 플러그인을 저장소에 통합
    - 삭제·재수집 중 deadlock, Anthropic provider의 긴 출력 잘림, temporal window 기준 시각(UTC) 수정
- v0.10.0 (2026-09-14)[^s14]
    - Meta Model API를 1급 provider로 추가, retain에서 이미지·파일을 1급 콘텐츠로 인라인
    - multi-text 라벨 타입, bank별 텍스트 검색 끄기(vector-only recall), Business Executive bank template
    - tokenizer를 tiktoken에서 quicktok/toktok-rs로 교체, recall 경로 CPU 최적화 3건
    - Breaking : "Retire the bank profile and background endpoints"
- v0.9.2 (PyPI 업로드 2026-08-25)[^s3][^s15]
    - DeepSeek Harness(dsh) 지원, knowledge base CRUD를 MCP 도구로 노출
    - mental model 자동 갱신 최소 간격, 갱신 내역을 operation에 기록
    - GitHub Copilot 구독 provider, recall에서 호출 측이 temporal window를 직접 지정
    - bank당 벡터 인덱스를 크기에 따라 만들도록 변경

## 06. 커뮤니티에서 반복되는 주제

최근 열린 항목은 대부분 메인테이너의 PR이고, 이슈는 mental model 운영과 coding agent 플러그인 설치에 몰려 있습니다.[^s16]

- mental model 갱신 정체 : delta 모드 갱신이 "Delta operations all skipped" 로 계속 실패해도 전체 재생성으로 넘어가지 않아 모델이 오래된 채 남는다는 이슈(#4875). 같은 날 전체 재생성으로 올리는 PR(#4888)이 열림[^s16]
- mental model 복구 : 이력은 남지만 이전 버전으로 되돌리는 API가 없다는 이슈(#4861)[^s16]
- mental model 갱신 budget : 갱신이 항상 LOW budget으로 reflect를 호출하고 설정할 수 없다는 이슈(#4856)[^s16]
- reflect 인용 : 답변이 `f1`, `o2` 같은 별칭을 인용해 실제 memory id로 풀리지 않는다는 이슈(#4876)와 수정 PR(#4878)[^s16]
- DeepSeek Harness 플러그인 : `@modelcontextprotocol/sdk` 해석 실패로 설치가 막힌다는 이슈(#4886), native 플러그인 도구가 gzip 응답을 풀지 못한다는 이슈(#4868)[^s16]
- 기타 PR : 클라이언트 연결이 끊기면 동기 retain을 취소(#4877), MCP recall의 `max_tokens` 의미를 설명하고 JSON을 압축(#4870), 인도네시아어 locale 추가(#4862)[^s16]

## 07. 실제 개발에서 어떻게 쓰는가

기존 에이전트에 붙이는 경로는 LLM Wrapper, 코딩 에이전트 플러그인, MCP, 프레임워크 통합 네 가지로 정리됩니다.
README는 60개 이상의 통합을 제공하며 대부분 코드 변경이 필요 없다고 밝힙니다.[^s1]

- LLM Wrapper : `hindsight-litellm` 의 `wrap_openai()`, `wrap_anthropic()` 으로 기존 클라이언트를 감싸면 호출 전에 recall, 호출 후에 retain을 자동으로 함. 기본값은 Hindsight Cloud이고 `hindsight_api_url` 로 자체 서버를 지정함[^s1]
- 프레임워크 통합 : LangGraph/LangChain, LlamaIndex, CrewAI, Pydantic AI, OpenAI Agents SDK, Google ADK, Vercel AI SDK, n8n, Dify 등[^s1]
- README는 n8n 같은 단순 워크플로에는 과할 수 있다고 적음[^s1]

코딩 에이전트용 패키지는 저장소마다 bank를 만들고 git 이력과 세션 대화를 백그라운드로 수집합니다.[^s11]

```bash
# 감지된 모든 에이전트에 설치
npx @vectorize-io/hindsight-coding-agents install all
# Claude Code 에만, 로컬 daemon 저장 방식으로 설치
npx @vectorize-io/hindsight-coding-agents install claude-code --server daemon
```

- bank 이름 : 기본 `coding-agent::{gitProject}`. 같은 저장소의 여러 에이전트가 공유함[^s11]
- 첫 프롬프트 주입 : `autoInject` 가 `"reflect"`(기본), `"pages"`, `"recall"`, `"none"` 중 하나[^s11]
- 기본 knowledge page 5종 : Component map, Core concepts, Conventions and patterns, Key decisions and rationale, Initiatives and enhancements. 기본 매시간 갱신(`pageTriggerCron`)[^s11]
- 설정 파일 : `~/.hindsight/coding-agent.json`. `gitIngest` 기본 `"message"`, `optInOnly` 로 명시 승인한 저장소만 수집 가능[^s11]
- 저장 방식 : Cloud(기본, API 토큰 필요), 자체 서버(`--api-url`), 로컬 daemon(`uv` 와 LLM 키 필요)[^s11]

MCP 클라이언트에서는 HTTP 엔드포인트를 직접 등록합니다.[^s9]

```bash
# 인증을 켠 서버에 Claude Code 연결 (X-Bank-Id 로 bank 지정)
claude mcp add --transport http hindsight http://localhost:8888/mcp \
  --header "Authorization: Bearer your-secret-key" \
  --header "X-Bank-Id: my-bank"
```

- 출시 당시 보도에서는 단일 Docker 컨테이너로 돌고 LLM API 래퍼로 바로 끼워 넣는 점을 배포 특징으로 소개함[^s18]
- 같은 보도가 인용한 LongMemEval 세부 항목 : multi-session 21.1% → 79.7%, temporal reasoning 31.6% → 79.7%, knowledge update 60.3% → 84.6%[^s18]

## 08. 한계와 주의점

- 모든 retain·reflect·consolidation이 LLM을 호출함. 사실 추출과 답변 생성에 LLM provider 키가 필요함[^s4]
- 내장 pg0는 개발용이며 운영에서는 외부 PostgreSQL을 써야 함[^s4]
- `HINDSIGHT_API_WORKER_ID` 를 고정하지 않으면 재시작 후 이미 잡은 작업이 고아가 됨[^s4]
- Docker 데이터는 named volume을 권장함. host bind mount는 UID 1000 소유여야 함[^s4]
- Windows에서 외부 PostgreSQL을 쓰려면 Visual Studio Build Tools로 pgvector를 직접 빌드해야 함[^s4]
- MCP 엔드포인트는 기본적으로 인증 없이 열려 있음. `ApiKeyTenantExtension` 을 설정해야 보호됨[^s9]
- reflect는 최대 10회 반복이며, 답에 스키마와 맞는 내용이 없으면 `structured_output` 추출이 조용히 실패할 수 있음[^s6]
- recall 재순위화 전 후보 상한(300)은 budget과 별개라 `high` budget에서도 깊은 탐색이 제한될 수 있음. cross-encoder가 없으면 합성 점수로 대체됨[^s5]
- Memory Defense는 설정 이후 retain에만 적용되고 기존 메모리는 다시 검사하지 않음. PII 패턴은 미국 형식 기준임[^s10]
- observation 중복 정리는 PostgreSQL에서만 동작하고 Oracle에서는 동작하지 않음[^s7]
- coding agent 플러그인 중 opencode, Cline 등은 대화 이력이 버전 없는 SQLite라 재수집을 건너뜀. Devin CLI는 Node 22.5 이상 필요[^s11]
- v0.10.0에서 bank profile·background 엔드포인트가 제거되어 이전 버전 코드를 옮길 때 확인이 필요함[^s14]

## 09. 더 알아볼 것

- GitHub 릴리스 페이지 요약에서 v0.10.1·v0.9.2 날짜가 2024년으로 표시되어, 날짜는 PyPI 업로드 시각으로 적었습니다. GitHub 태그 날짜와 일치하는지 확인이 필요합니다.
- 공개 벤치마크 사이트(benchmarks.hindsight.vectorize.io)의 현재 모델별 정확도·지연·비용 수치는 확인하지 못했습니다.
- retain 한 건당 LLM 호출 수와 token 비용, consolidation 비용은 문서에서 찾지 못했습니다.
- Hindsight Cloud의 요금과 무료 크레딧 규모는 확인하지 못했습니다.
- Oracle AI Database 사용 시 기능 차이는 observation 중복 정리 외에 더 있는지 확인하지 못했습니다.
- Star는 리포트 기준(2026-09-28) 37,177개, 24시간 증가 +5,097이며 09-22부터 09-28까지 7일 연속 Study 후보에 올랐습니다. 조사 시점(2026-09-29) API 값은 40,102개로 리포트 대비 2,925개 많습니다.

## 참고 자료

- [Hindsight README (main)](https://github.com/vectorize-io/hindsight/blob/main/README.md) (readme)
- [vectorize-io/hindsight 저장소 페이지](https://github.com/vectorize-io/hindsight) (code)
- [hindsight-api PyPI 메타데이터](https://pypi.org/pypi/hindsight-api/json) (website)
- [Installation](https://hindsight.vectorize.io/developer/installation) (docs)
- [Recall (retrieval)](https://hindsight.vectorize.io/developer/retrieval) (docs)
- [Reflect](https://hindsight.vectorize.io/developer/reflect) (docs)
- [Observations](https://hindsight.vectorize.io/developer/observations) (docs)
- [Mental models](https://hindsight.vectorize.io/developer/mental-models) (docs)
- [MCP server](https://hindsight.vectorize.io/developer/mcp-server) (docs)
- [Memory Defense](https://hindsight.vectorize.io/developer/memory-defense) (docs)
- [Coding agents integration](https://hindsight.vectorize.io/sdks/integrations/coding-agents) (docs)
- [RAG vs Hindsight](https://hindsight.vectorize.io/developer/rag-vs-hindsight) (docs)
- [Release v0.10.1](https://github.com/vectorize-io/hindsight/releases/tag/v0.10.1) (release)
- [Release v0.10.0](https://github.com/vectorize-io/hindsight/releases/tag/v0.10.0) (release)
- [Release v0.9.2](https://github.com/vectorize-io/hindsight/releases/tag/v0.9.2) (release)
- [열린 Issues (GitHub API)](https://api.github.com/repos/vectorize-io/hindsight/issues?state=open&per_page=30) (issues)
- [Hindsight is 20/20: Building Agent Memory that Retains, Recalls, and Reflects (arXiv)](https://arxiv.org/abs/2512.12818) (paper)
- [With 91% accuracy, open source Hindsight agentic memory provides 20/20 vision for AI agents stuck on failing RAG (VentureBeat)](https://venturebeat.com/data/with-91-accuracy-open-source-hindsight-agentic-memory-provides-20-20-vision) (blog)

[^s1]: [Hindsight README (main)](https://github.com/vectorize-io/hindsight/blob/main/README.md)
[^s2]: [vectorize-io/hindsight 저장소 페이지](https://github.com/vectorize-io/hindsight)
[^s3]: [hindsight-api PyPI 메타데이터](https://pypi.org/pypi/hindsight-api/json)
[^s4]: [Installation](https://hindsight.vectorize.io/developer/installation)
[^s5]: [Recall (retrieval)](https://hindsight.vectorize.io/developer/retrieval)
[^s6]: [Reflect](https://hindsight.vectorize.io/developer/reflect)
[^s7]: [Observations](https://hindsight.vectorize.io/developer/observations)
[^s8]: [Mental models](https://hindsight.vectorize.io/developer/mental-models)
[^s9]: [MCP server](https://hindsight.vectorize.io/developer/mcp-server)
[^s10]: [Memory Defense](https://hindsight.vectorize.io/developer/memory-defense)
[^s11]: [Coding agents integration](https://hindsight.vectorize.io/sdks/integrations/coding-agents)
[^s12]: [RAG vs Hindsight](https://hindsight.vectorize.io/developer/rag-vs-hindsight)
[^s13]: [Release v0.10.1](https://github.com/vectorize-io/hindsight/releases/tag/v0.10.1)
[^s14]: [Release v0.10.0](https://github.com/vectorize-io/hindsight/releases/tag/v0.10.0)
[^s15]: [Release v0.9.2](https://github.com/vectorize-io/hindsight/releases/tag/v0.9.2)
[^s16]: [열린 Issues (GitHub API)](https://api.github.com/repos/vectorize-io/hindsight/issues?state=open&per_page=30)
[^s17]: [Hindsight is 20/20: Building Agent Memory that Retains, Recalls, and Reflects (arXiv)](https://arxiv.org/abs/2512.12818)
[^s18]: [With 91% accuracy, open source Hindsight agentic memory provides 20/20 vision for AI agents stuck on failing RAG (VentureBeat)](https://venturebeat.com/data/with-91-accuracy-open-source-hindsight-agentic-memory-provides-20-20-vision)
