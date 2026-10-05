# Hindsight 설치와 첫 사용

> 서버를 띄우는 방법을 고르는 기준, 기본 설정, 가장 간단한 retain·recall·reflect 실행, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

Hindsight는 **서버**와 **클라이언트**를 따로 설치합니다. 서버는 기억을 저장·처리하고, 클라이언트는 애플리케이션에서 서버를 부르는 SDK입니다. 어느 경우든 사실 추출과 reflect에 쓸 **LLM API 키**가 필요합니다.

### 서버: 상황별로 하나를 고릅니다

| 방법 | 언제 | 저장소 |
|---|---|---|
| Docker 단일 컨테이너 | 로컬 개발, 빠른 체험 | 내장 PostgreSQL(pg0) |
| Docker Compose | 외부 PostgreSQL과 함께 띄울 때 | 별도 PostgreSQL 컨테이너 |
| `pip install hindsight-api` | 컨테이너 없이 직접 실행 | 내장 pg0 또는 외부 DB |
| `pip install hindsight-all` | Python 프로세스 안에 서버를 내장 | 내장 pg0 |
| Helm | Kubernetes 운영 | 차트 내장 또는 외부 PostgreSQL |
| Hindsight Cloud | 서버를 운영하고 싶지 않을 때 | 관리형 |

**방법 1. Docker (공식 권장 시작 경로)**

```bash
export OPENAI_API_KEY=sk-xxx

docker run -it --pull always --name hindsight --restart unless-stopped --shm-size=1g \
  -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

- API: `http://localhost:8888`
- 웹 UI(Control Plane): `http://localhost:9999`

`latest`는 임베딩·재순위화 모델을 이미지 안에서 돌리는 전체 이미지(AMD64 기준 약 9GB)입니다. 임베딩과 재순위화를 OpenAI, Cohere, TEI 같은 외부 서비스에 맡길 수 있다면 약 500MB인 `latest-slim`을 씁니다.

**방법 2. 외부 PostgreSQL과 함께 (Docker Compose)**

```bash
git clone https://github.com/vectorize-io/hindsight.git
cd hindsight/docker/docker-compose/external-pg
export HINDSIGHT_API_LLM_API_KEY=sk-xxx
export HINDSIGHT_DB_PASSWORD=choose-a-password
docker compose up -d
```

이 Compose 파일은 `pgvector/pgvector` 이미지로 PostgreSQL을 띄우고 Hindsight 컨테이너가 `HINDSIGHT_API_DATABASE_URL`로 그 DB를 쓰게 연결합니다. 같은 폴더 옆에는 vchord, pg_search, TEI(외부 임베딩), 로컬 LLM, CUDA 등 조합별 예제가 함께 있습니다. README의 짧은 안내에는 `docker/docker-compose`에서 바로 실행하라고 되어 있지만, 2026년 10월 기준 저장소에서는 이처럼 용도별 하위 폴더로 나뉘어 있습니다.

**방법 3. pip로 직접 실행 (Python 3.11 이상)**

```bash
pip install hindsight-api
export HINDSIGHT_API_LLM_API_KEY=sk-xxx
hindsight-api
```

**방법 4. Python 프로세스 안에 내장**

```bash
pip install hindsight-all -U
```

```python
import os
from hindsight import HindsightServer, HindsightClient

# with 블록이 살아 있는 동안만 내장 서버가 동작한다
with HindsightServer(
    llm_provider="openai",
    llm_model="gpt-5-mini",
    llm_api_key=os.environ["OPENAI_API_KEY"],
) as server:
    client = HindsightClient(base_url=server.url)
    client.retain(bank_id="demo", content="민지는 연간 구독 중이다")
    print(client.recall(bank_id="demo", query="민지의 구독 상태는?"))
```

노트북 실험이나 테스트에 편하지만, 프로세스가 끝나면 서버도 내려가므로 서비스용으로는 방법 1~3이나 Helm을 씁니다.

### 클라이언트

```bash
npm install @vectorize-io/hindsight-client      # Node.js / TypeScript (Deno는 npm: 지정자로 바로 import)
pnpm add @vectorize-io/hindsight-client
pip install hindsight-client -U                 # Python
go get github.com/vectorize-io/hindsight/hindsight-clients/go
curl -fsSL https://hindsight.vectorize.io/get-cli | bash   # CLI
```

## 기본 설정

서버 설정은 모두 `HINDSIGHT_API_*` 환경 변수입니다. 처음에는 LLM 관련 값만 정하면 됩니다.

```bash
# LLM 제공자와 키 (제공자만 정하면 그 제공자의 권장 기본 모델이 쓰인다)
export HINDSIGHT_API_LLM_PROVIDER=openai          # anthropic, gemini, groq, ollama, litellm ...
export HINDSIGHT_API_LLM_API_KEY=sk-xxx
# export HINDSIGHT_API_LLM_MODEL=gpt-5-mini       # 기본 모델을 바꾸고 싶을 때

# 사실 추출만 다른 제공자로 (연산별 LLM 분리)
# export HINDSIGHT_API_RETAIN_LLM_PROVIDER=groq

# 운영 DB (지정하지 않으면 내장 pg0 사용)
# export HINDSIGHT_API_DATABASE_URL=postgresql://user:pass@db:5432/hindsight

# API 키 인증 (기본은 꺼져 있음)
# export HINDSIGHT_API_TENANT_EXTENSION=hindsight_api.extensions.builtin.tenant:ApiKeyTenantExtension
# export HINDSIGHT_API_TENANT_API_KEY=change-me
```

LLM은 25개 이상의 제공자를 지원합니다. Ollama, LM Studio 같은 로컬 모델, OpenAI 호환 엔드포인트, LiteLLM 게이트웨이를 쓸 수 있고, `claude-code`, `openai-codex`, `cursor`, `github-copilot`처럼 이미 쓰고 있는 구독을 API 키 없이 연결하는 제공자도 있습니다.

## 가장 간단한 예제

서버를 띄운 상태에서 TypeScript로 세 연산을 한 번씩 실행해 봅니다.

```ts
// quickstart.mts  (실행: npx tsx quickstart.mts)
import { HindsightClient } from '@vectorize-io/hindsight-client';

const client = new HindsightClient({ baseUrl: 'http://localhost:8888' });
const bank = 'quickstart-minji';

// 1) 기억하기: async: false 이므로 사실 추출이 끝날 때까지 기다린다
await client.retain(bank, '민지는 2026년 3월에 iOS 앱 결제 실패를 문의했고, 6월부터는 웹으로만 접속한다.', {
  context: '상담 기록 요약',
  timestamp: '2026-06-20T09:00:00Z',
  async: false,
});

// 2) 떠올리기: 관련 기억을 토큰 예산 안에서 가져온다
const recalled = await client.recall(bank, '민지는 요즘 어떤 기기로 접속하나요?', { maxTokens: 1024 });
for (const r of recalled.results) {
  console.log(`[${r.type}] ${r.text}`);
}

// 3) 생각해서 답하기: 기억을 근거로 답을 만든다
const answer = await client.reflect(bank, '민지에게 결제 관련 안내를 할 때 주의할 점은?');
console.log(answer.text);
```

1. **무엇을 생성하는가**: 처음 `retain`할 때 `quickstart-minji` bank가 자동으로 만들어지고, 문장 하나에서 "3월에 iOS 앱 결제 실패 문의", "6월부터 웹으로만 접속" 같은 fact가 날짜와 함께 생성됩니다.
2. **어떤 값을 전달하는가**: `context`는 추출 LLM에게 이 텍스트가 무엇인지 알려 주고, `timestamp`는 "6월부터" 같은 표현을 실제 날짜로 고정하는 기준이 됩니다.
3. **Hindsight가 무엇을 처리하는가**: `recall`은 질문을 임베딩하고 의미·키워드·그래프·시간 검색을 동시에 실행해 순위를 합친 뒤 1,024토큰 안에 들어가는 만큼 돌려줍니다. `reflect`는 에이전트 루프로 필요한 기억을 찾아 답을 씁니다.
4. **어떤 결과를 반환하는가**: `recall`은 `results` 배열(각 항목에 `text`, `type`, 엔티티, 날짜, `documentId` 등)을, `reflect`는 `text`와 선택적으로 근거 목록을 돌려줍니다.

백그라운드 통합이 끝나면 `types: ['observation']`으로 recall했을 때 Observation도 함께 보입니다. 웹 UI(`http://localhost:9999`)에서 bank를 열면 추출된 fact, 엔티티 그래프, Observation, 진행 중인 작업을 눈으로 확인할 수 있어서 처음 동작을 이해하는 데 도움이 됩니다.

---

## 설치할 때 주의할 점

- **내장 pg0는 개발용입니다.** 운영에서는 PostgreSQL 14 이상과 벡터 확장(pgvector, pgvectorscale, vchord, AlloyDB의 scann 중 하나)을 따로 둡니다. Supabase, Neon, RDS, Cloud SQL 같은 관리형 PostgreSQL도 됩니다.
- **Docker 데이터는 named volume으로 둡니다.** 컨테이너는 UID 1000으로 실행되므로, 호스트 디렉터리를 bind mount하려면 그 디렉터리를 `chown -R 1000:1000`으로 맞춰야 합니다. `--user`로 다른 UID를 지정하면 시작 단계에서 오류가 납니다.
- **운영에서는 `HINDSIGHT_API_WORKER_ID`를 고정합니다.** 기본값이 컨테이너 호스트명이라 재시작할 때마다 바뀌고, 처리 중이던 작업이 옛 ID 아래에 남아 아무도 가져가지 않습니다.
- **Intel Mac에서는 `-slim` 패키지를 씁니다.** `pip install hindsight-all`은 Intel Mac용 wheel이 없어 몇 달 전 릴리스로 조용히 내려갑니다. `hindsight-all-slim` / `hindsight-api-slim`과 외부 임베딩·재순위화(또는 `hindsight-api-slim[local-onnx]`)를 조합합니다.
- **Docker 이미지에는 llama.cpp가 없습니다.** 로컬 추론을 하려면 Ollama, LM Studio, vLLM 등을 옆에 띄우고 `HINDSIGHT_API_LLM_BASE_URL`로 연결합니다.
- **LLM의 출력 토큰 한도를 확인합니다.** 공식 문서는 사실 추출의 안정성을 위해 출력 토큰을 충분히(약 65,000 이상) 지원하는 모델을 요구하고, 그보다 작은 모델은 `HINDSIGHT_API_RETAIN_MAX_COMPLETION_TOKENS`를 낮추는 방법을 안내합니다(이 값은 `HINDSIGHT_API_RETAIN_CHUNK_SIZE`보다 커야 합니다).
- **인증은 기본으로 꺼져 있습니다.** REST API와 MCP 엔드포인트가 모두 열려 있으므로, 로컬 밖에 노출하기 전에 API 키 인증을 켭니다. 자세한 내용은 [서버 운영과 실전 프로젝트](05-usage-production.md)에서 다룹니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 사용자를 기억하는 상담 챗봇 →](03-usage-personal-assistant.md)
