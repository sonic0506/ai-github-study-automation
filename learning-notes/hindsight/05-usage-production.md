# Hindsight 활용 예시 ③ 서버 운영과 실전 프로젝트

> Hindsight를 서비스 백엔드 옆의 독립 메모리 서버로 운영하는 방법과, 학습 플랫폼의 AI 튜터에 실제로 도입하는 과정을 다룹니다.

## 서버 환경에서의 활용

Hindsight는 애플리케이션 프로세스 안에 들어가는 라이브러리가 아니라 **별도로 배포하는 상태 저장 서비스**입니다. 애플리케이션 서버는 SDK로 HTTP 호출만 하고, 모든 상태는 Hindsight 뒤의 PostgreSQL에 있습니다.

### 활용 사례

- **사용자별 장기 기억 서비스**: 웹·앱 백엔드가 사용자 ID를 bank ID로 써서 retain·recall을 호출합니다. 여러 백엔드 서비스가 같은 기억 서버를 공유할 수 있습니다.
- **멀티 테넌트 격리**: 내장 `ApiKeyTenantExtension`은 공유 API 키 하나로 전체 API를 보호합니다. 고객사별로 DB 스키마를 나눠야 하면 사용자·키를 환경 변수로 선언하는 StaticKeys 확장이나 Supabase JWT 확장(별도 이미지)을 쓰고, 그 외에는 `TenantExtension`을 직접 구현합니다.
- **백그라운드 작업 분리**: 기본적으로 API 서버가 통합·갱신 작업도 처리합니다. 쓰기량이 많아지면 `HINDSIGHT_API_WORKER_ENABLED=false`로 API에서 떼어 내고 `hindsight-worker`를 여러 개 띄웁니다. 워커는 PostgreSQL을 작업 큐로 씁니다.
- **운영 관측**: Prometheus 메트릭(LLM 호출 수, 토큰, 지연), 상태 확인 엔드포인트, retain·통합·갱신 완료를 알리는 Webhook, 막힌 작업을 정리하는 Admin CLI를 제공합니다.
- **데이터 이동**: bank 단위 export/import(transfer), 한 번의 호출로 bank 복제, 무중단 ID 변경을 위한 bank alias가 0.10 계열에 추가되었습니다.

### 애플리케이션 구조

```text
사용자 (브라우저 · 앱)
 ↓
애플리케이션 서버 (Next.js Route Handler, NestJS, FastAPI ...)
 ├─ 대화 LLM 호출 (OpenAI · Anthropic · 사내 게이트웨이)
 └─ Hindsight SDK 호출 ──────────┐
                                  ↓
                     Hindsight API (stateless, 수평 확장 가능)
                     Hindsight Worker (통합 · Mental Model 갱신)
                                  ↓
                     PostgreSQL + pgvector (기억 · 작업 큐)
                                  ↓
                     Webhook → 애플리케이션 서버 (완료 알림 · 감시)
```

### 실제 코드

**API 키 인증을 켠 단일 서버 구성**

```bash
# 운영 환경 변수 예시
export HINDSIGHT_API_DATABASE_URL=postgresql://hindsight:***@db.internal:5432/hindsight
export HINDSIGHT_API_LLM_PROVIDER=openai
export HINDSIGHT_API_LLM_BASE_URL=https://llm-gateway.internal.example.com/v1   # OpenAI 호환 게이트웨이
export HINDSIGHT_API_LLM_API_KEY="$GATEWAY_TOKEN"
export HINDSIGHT_API_TENANT_EXTENSION=hindsight_api.extensions.builtin.tenant:ApiKeyTenantExtension
export HINDSIGHT_API_TENANT_API_KEY="$HINDSIGHT_SHARED_KEY"
export HINDSIGHT_API_WORKER_ID=hindsight-prod-1    # 재시작해도 같은 워커로 인식되게 고정
hindsight-api
```

**처리량이 늘었을 때: 워커 분리**

```bash
HINDSIGHT_API_WORKER_ENABLED=false hindsight-api
hindsight-worker --worker-id worker-1
hindsight-worker --worker-id worker-2

# 워커를 줄이기 전에는 잡고 있던 작업을 먼저 반납
hindsight-admin decommission-worker worker-2
```

**계층별로 Hindsight가 어디에 들어가는가**

| 위치 | Hindsight 사용 방식 | 이유 |
|---|---|---|
| Controller / Route Handler | 사용자 ID → bank ID 변환, 권한 확인 | bank ID를 요청 값에서 그대로 받으면 남의 기억을 조회할 수 있으므로 인증된 세션에서만 만든다 |
| Service (비즈니스 로직) | recall로 맥락 조회, 응답 후 retain(비동기) | 기억은 대화 생성의 입력이자 부산물이므로 대화 흐름을 담당하는 계층에 둔다 |
| Repository / 외부 API Adapter | `HindsightClient` 생성과 재시도·타임아웃 정책 | 기억 서버 장애가 핵심 기능을 멈추지 않도록 실패를 여기서 흡수한다 |
| 배치 · 이벤트 소비자 | 과거 데이터 대량 retain, Webhook 처리 | 쓰기는 LLM 비용과 지연이 크므로 사용자 요청 경로 밖에서 처리한다 |

---

## 실전 프로젝트 적용: 온라인 코딩 강의의 AI 튜터

### 요구사항

온라인 코딩 강의 플랫폼에 "나를 기억하는 AI 튜터"를 붙입니다.

- 스택: Next.js(App Router) + Vercel AI SDK, 자체 호스팅 Hindsight, PostgreSQL(pgvector)
- 튜터는 학습자의 이전 질문, 막혔던 개념, 선호하는 설명 방식을 기억한다
- 튜터는 과제 정답 코드를 그대로 주지 않는다
- 강사는 대시보드에서 학습자별 요약을 바로 볼 수 있어야 한다(열 때마다 LLM을 부르면 안 됨)
- 학습자 데이터는 회사 인프라 안에 둔다. LLM은 사내 게이트웨이를 거친다
- 기억이 제대로 쌓이지 않는 경우(추출 결과 0건)를 감지한다

### 전체 구조

```mermaid
flowchart LR
    L[학습자 브라우저] -->|질문| R[Next.js<br/>/api/tutor]
    I[강사 브라우저] -->|대시보드| P[Next.js<br/>강사 페이지]

    R -->|recall 도구| HS[Hindsight API]
    R -->|retain 비동기| HS
    R -->|대화 생성| GW[사내 LLM 게이트웨이]
    P -->|Mental Model 조회| HS

    HS --> DB[(PostgreSQL<br/>pgvector)]
    HS -->|사실 추출 · 통합| GW
    HS -->|retain.completed Webhook| WH[Next.js<br/>/api/hindsight-webhook]
    WH -->|추출 0건 알림| AL[Slack 알림]
```

### 폴더 구조

```text
code-tutor/
├── infra/
│   └── docker-compose.yml            # PostgreSQL + Hindsight API
├── scripts/
│   └── setup-learner-bank.ts         # 학습자 bank 설정 · 규칙 · Mental Model 생성
├── apps/web/
│   ├── lib/hindsight.ts              # 클라이언트와 bank ID 규칙
│   ├── app/api/tutor/route.ts        # 튜터 대화
│   ├── app/api/hindsight-webhook/route.ts  # 완료 이벤트 수신
│   └── app/instructor/[learnerId]/page.tsx # 강사용 학습자 요약
└── package.json
```

### 구현

**1. 인프라: PostgreSQL + Hindsight API**

공식 `external-pg` Compose 예제를 바탕으로 인증과 게이트웨이 설정을 더했습니다.

```yaml
# infra/docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg18
    environment:
      POSTGRES_USER: hindsight
      POSTGRES_PASSWORD: ${HINDSIGHT_DB_PASSWORD:?set HINDSIGHT_DB_PASSWORD}
      POSTGRES_DB: hindsight
    volumes:
      - pg_data:/var/lib/postgresql/18/docker

  hindsight:
    image: ghcr.io/vectorize-io/hindsight-api:${HINDSIGHT_VERSION:?pin a reviewed version}
    ports:
      - "127.0.0.1:8888:8888"   # 외부에 직접 노출하지 않는다
    environment:
      HINDSIGHT_API_DATABASE_URL: postgresql://hindsight:${HINDSIGHT_DB_PASSWORD}@db:5432/hindsight
      HINDSIGHT_API_LLM_PROVIDER: openai
      HINDSIGHT_API_LLM_BASE_URL: ${LLM_GATEWAY_URL}
      HINDSIGHT_API_LLM_API_KEY: ${LLM_GATEWAY_TOKEN}
      HINDSIGHT_API_TENANT_EXTENSION: hindsight_api.extensions.builtin.tenant:ApiKeyTenantExtension
      HINDSIGHT_API_TENANT_API_KEY: ${HINDSIGHT_API_KEY}
      HINDSIGHT_API_WORKER_ID: tutor-hindsight-1
    depends_on:
      - db

volumes:
  pg_data:
```

**2. 클라이언트와 bank 규칙**

```ts
// apps/web/lib/hindsight.ts
import { HindsightClient } from '@vectorize-io/hindsight-client';

export const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL!,
  apiKey: process.env.HINDSIGHT_API_KEY!,
});

// bank ID는 반드시 인증된 세션의 사용자 ID로만 만든다
export const learnerBank = (learnerId: string) => `tutor::${learnerId}`;
export const PROFILE_MODEL_ID = 'learner-profile';
```

**3. 학습자 bank 준비 (가입 시 한 번)**

```ts
// scripts/setup-learner-bank.ts
import { hindsight, learnerBank, PROFILE_MODEL_ID } from '../apps/web/lib/hindsight';

export async function setupLearnerBank(learnerId: string) {
  const bankId = learnerBank(learnerId);

  await hindsight.createBank(bankId, {
    retainMission:
      '학습자가 막힌 개념, 반복한 실수, 이해한 개념, 선호하는 설명 방식(예시 위주, 그림 위주 등), 진행 중인 과제를 기억한다. 인사와 잡담은 무시한다.',
    observationsMission:
      '학습자의 지속적인 강점·약점·학습 습관을 기록한다. 하루짜리 상태는 기록하지 않는다.',
    reflectMission: '나는 코딩 튜터다. 학습자가 스스로 답에 도달하도록 돕는다.',
  });

  await hindsight.createDirective(
    bankId,
    '정답 코드 금지',
    '과제의 정답 코드를 그대로 제시하지 않는다. 힌트, 질문, 부분 예시로 안내한다.',
  );

  // 강사 대시보드용: 통합이 끝날 때마다 갱신되는 학습자 요약
  await hindsight.createMentalModel(
    bankId,
    '학습자 프로필',
    '이 학습자가 현재 어려워하는 개념, 반복하는 실수, 잘 통하는 설명 방식, 진행 중인 과제는 무엇인가?',
    { id: PROFILE_MODEL_ID, trigger: { refreshAfterConsolidation: true } },
  );
}
```

**4. 튜터 대화: 검색은 모델이, 저장은 서버가**

```ts
// apps/web/app/api/tutor/route.ts
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createHindsightTools } from '@vectorize-io/hindsight-ai-sdk';
import { hindsight, learnerBank } from '@/lib/hindsight';
import { requireLearner } from '@/lib/auth';

const gateway = createOpenAI({
  baseURL: process.env.LLM_GATEWAY_URL,
  apiKey: process.env.LLM_GATEWAY_TOKEN,
});

export async function POST(req: Request) {
  const learner = await requireLearner(req); // 세션에서 학습자 확인
  const { question, lessonId } = await req.json();
  const bankId = learnerBank(learner.id);

  // 요청마다 도구를 만들어 이 학습자의 bank에 고정한다
  const memoryTools = createHindsightTools({
    client: hindsight,
    bankId,
    recall: { budget: 'low', maxTokens: 1500, types: ['observation', 'world', 'experience'] },
  });

  const { text } = await generateText({
    model: gateway.chat('gpt-5-mini'), // 게이트웨이가 Chat Completions만 지원하는 경우가 많아 명시
    system: [
      '너는 코딩 튜터다. 과제 정답 코드를 그대로 주지 말고 힌트와 질문으로 안내한다.',
      '학습자의 과거 어려움이나 선호가 답에 도움이 되면 recall 도구로 먼저 확인한다.',
    ].join('\n'),
    prompt: question,
    tools: { recall: memoryTools.recall }, // 모델에게는 조회만 허용
    stopWhen: stepCountIs(4),
  });

  // 저장은 모델 판단에 맡기지 않고 매 턴 서버가 비동기로 남긴다
  const now = new Date().toISOString();
  void hindsight
    .retain(bankId, `학습자 (${now}): ${question}\n튜터 (${now}): ${text}`, {
      context: `강의 ${lessonId}에서 학습자와 튜터의 대화. "튜터"의 1인칭 발화만 에이전트 자신의 경험이다`,
      timestamp: now,
      documentId: `lesson::${lessonId}`,
      updateMode: 'append',
      tags: [`lesson:${lessonId}`],
      observationScopes: 'shared', // 강의 태그와 무관하게 학습자 단위로 믿음을 통합
      async: true,
    })
    .catch((err) => console.error('[hindsight] retain failed', err));

  return Response.json({ answer: text });
}
```

**5. 강사 대시보드: LLM 없이 요약 읽기**

```tsx
// apps/web/app/instructor/[learnerId]/page.tsx
import { hindsight, learnerBank, PROFILE_MODEL_ID } from '@/lib/hindsight';
import { requireInstructor } from '@/lib/auth';

export default async function LearnerPage({ params }: { params: Promise<{ learnerId: string }> }) {
  await requireInstructor();
  const { learnerId } = await params;

  const profile = await hindsight.getMentalModel(learnerBank(learnerId), PROFILE_MODEL_ID);

  return (
    <article>
      <h1>학습자 요약</h1>
      <p>마지막 갱신: {profile.last_refreshed_at ?? '아직 생성 중'}</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{profile.content}</pre>
    </article>
  );
}
```

**6. Webhook: 기억이 쌓이지 않는 문서 감시**

```ts
// apps/web/app/api/hindsight-webhook/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

function verify(secret: string, rawBody: string, header: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2)));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false; // 재전송 공격 방지

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const received = String(parts.v1 ?? '');
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function POST(req: Request) {
  const rawBody = await req.text(); // 파싱 전 원문으로 서명을 검증해야 한다
  if (!verify(process.env.HINDSIGHT_WEBHOOK_SECRET!, rawBody, req.headers.get('x-hindsight-signature-v2'))) {
    return new Response('invalid signature', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event === 'retain.completed' && event.data?.memory_unit_count === 0) {
    // 추출 결과가 0건이면 recall·reflect로 찾을 수 없는 문서가 된다
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[hindsight] ${event.bank_id} / ${event.data.document_id}: 추출된 기억 0건` }),
    });
  }
  return new Response('ok'); // 같은 이벤트가 두 번 올 수 있으므로 처리는 멱등하게
}
```

### 실제 실행 흐름

"재귀 함수가 계속 이해가 안 돼요"라는 질문을 예로 듭니다.

1. **사용자 행동**: 학습자가 3강 화면에서 질문을 보냅니다. 요청은 `/api/tutor`로 갑니다.
2. **애플리케이션 처리**: Route Handler가 세션에서 학습자를 확인하고 `tutor::{learnerId}` bank에 고정된 recall 도구를 만듭니다. 학습자가 보낸 값으로 bank ID를 만들지 않으므로 다른 학습자의 기억에 접근할 길이 없습니다.
3. **기억 조회**: 모델이 recall 도구를 호출합니다. Hindsight는 "2주 전 1강에서 for 반복문의 종료 조건을 헷갈렸다", "그림으로 설명했을 때 이해가 빨랐다"는 Observation을 1,500토큰 안에서 돌려줍니다.
4. **답변 생성**: 모델은 그림 비유를 써서, 종료 조건이라는 같은 약점에 초점을 맞춘 힌트를 만듭니다. 시스템 프롬프트에 따라 정답 코드는 주지 않습니다.
5. **기억 저장**: 응답을 돌려준 뒤 서버가 이번 대화를 `lesson::3` 문서에 append합니다. 학습자는 이 처리를 기다리지 않습니다.
6. **백그라운드 정리**: 워커가 사실을 추출하고 "종료 조건 이해가 반복적인 약점"이라는 Observation을 강화합니다. 통합이 끝나면 "학습자 프로필" Mental Model이 갱신되고, 추출이 0건이면 Webhook을 통해 Slack 알림이 갑니다.
7. **강사 확인**: 다음 날 강사가 대시보드를 열면 페이지는 Mental Model을 DB에서 읽기만 해서 바로 "재귀·반복문의 종료 조건에 약함, 그림 설명이 효과적"이라는 최신 요약을 보여 줍니다.

이 구조에서 **모델에게는 조회(recall)만 맡기고 저장(retain)은 서버가 매 턴 실행**한 점이 중요합니다. 저장까지 도구로 주면 모델이 기억할 가치를 판단하므로, 같은 내용을 여러 번 저장하거나 중요한 내용을 빠뜨리는 일이 생깁니다. Vercel AI SDK 통합 문서도 "무엇을 기억하고 찾을지는 에이전트, 비용·태그·비동기 같은 인프라 결정은 애플리케이션"으로 역할을 나누는데, 이 프로젝트는 그 경계를 한 단계 더 보수적으로 잡은 것입니다.

---

[← 활용 예시 ② 코딩 에이전트와 MCP](04-usage-coding-agents.md) · [목차](README.md) · [장단점과 대안 비교 →](06-comparison.md)
