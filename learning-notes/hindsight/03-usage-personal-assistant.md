# Hindsight 활용 예시 ① 사용자를 기억하는 상담 챗봇

> 쇼핑몰 상담 챗봇에 사용자별 장기 기억을 붙이는 과정과, 이미 운영 중인 LLM 호출 코드에 래퍼만 씌워 기억을 붙이는 방법을 다룹니다.

## 예제 1. 사용자별 기억을 가진 상담 챗봇

### 요구사항

> 상담 챗봇이 같은 고객의 이전 문의, 구독 상태, 사용 기기를 기억해서 "지난번 그 건"을 다시 설명하게 만들지 않는다. 고객 사이에 기억이 절대 섞이면 안 된다. 챗봇은 환불 금액을 직접 약속하면 안 된다. 사용자 응답 속도는 기억 기능 때문에 눈에 띄게 느려지면 안 된다.

### 구현

**1. bank 준비: 고객마다 하나, 처음 한 번만**

```ts
// src/memory/bank.ts
import { HindsightClient } from '@vectorize-io/hindsight-client';

export const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL!,
  apiKey: process.env.HINDSIGHT_API_KEY, // 서버에서 API 키 인증을 켰을 때
});

export const bankIdOf = (customerId: string) => `support::${customerId}`;

const prepared = new Set<string>();

export async function ensureCustomerBank(customerId: string) {
  const bankId = bankIdOf(customerId);
  if (prepared.has(bankId)) return bankId;

  // 같은 ID로 다시 호출하면 설정만 갱신된다 (create or update)
  await hindsight.createBank(bankId, {
    retainMission:
      '구독·결제·배송·환불·사용 기기·불편 사항과 그 날짜를 기억한다. 인사말과 감사 표현은 무시한다.',
    reflectMission:
      '나는 쇼핑몰 상담 에이전트다. 고객의 이전 문의와 현재 상태를 근거로 짧고 정확하게 답한다.',
  });

  // reflect가 반드시 지킬 규칙
  await hindsight.createDirective(bankId, '환불 금액 약속 금지', '환불 금액이나 보상액을 확정해서 말하지 않는다. 담당 부서 확인이 필요하다고 안내한다.');

  prepared.add(bankId);
  return bankId;
}
```

실제 서비스에서는 `prepared` 대신 "bank 준비 완료" 여부를 고객 테이블에 저장합니다. 여기서는 흐름을 보이기 위해 메모리 집합을 썼습니다.

**2. 대화 한 턴 처리: 떠올리기 → 답하기 → 기억하기**

```ts
// src/chat/handle-message.ts
import OpenAI from 'openai';
import { hindsight, ensureCustomerBank } from '../memory/bank';

const openai = new OpenAI();

type Turn = { customerId: string; sessionId: string; customerName: string; message: string };

export async function handleMessage({ customerId, sessionId, customerName, message }: Turn) {
  const bankId = await ensureCustomerBank(customerId);

  // 1) 떠올리기: 빠른 응답이 우선이므로 얕은 검색 + 작은 토큰 예산
  const memories = await hindsight
    .recall(bankId, message, {
      budget: 'low',
      maxTokens: 1500,
      types: ['observation', 'world', 'experience'],
      preferObservations: true, // Observation으로 통합된 원본 fact는 중복으로 내보내지 않음
    })
    .catch(() => null); // 기억 서버 장애가 상담 자체를 막지 않게 한다

  const memoryBlock = memories?.results.map((m) => `- ${m.text}`).join('\n') ?? '(기억 없음)';

  // 2) 답하기: 기억은 "참고 자료"로만 넣는다
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      {
        role: 'system',
        content: [
          '너는 쇼핑몰 상담원이다. 환불 금액은 확정해서 말하지 않는다.',
          '아래는 이 고객에 대해 이전 대화에서 알게 된 내용이다. 현재 대화와 충돌하면 현재 대화를 따른다.',
          memoryBlock,
        ].join('\n\n'),
      },
      { role: 'user', content: message },
    ],
  });
  const reply = completion.choices[0].message.content ?? '';

  // 3) 기억하기: 응답을 막지 않도록 비동기로, 세션 문서에 이어 붙인다
  const now = new Date().toISOString();
  void hindsight
    .retain(bankId, `${customerName} (${now}): ${message}\n상담봇 (${now}): ${reply}`, {
      context: `고객 ${customerName}과 상담봇의 대화. "상담봇"의 1인칭 발화만 에이전트 자신의 경험이다`,
      timestamp: now,
      documentId: `session::${sessionId}`,
      updateMode: 'append', // 같은 세션 문서에 새 턴만 추가
      async: true,
    })
    .catch((err) => console.error('retain failed', err));

  return reply;
}
```

**3. 상담원 화면용 요약: 질문을 미리 정해 두고 읽기만 한다**

```ts
// src/memory/customer-brief.ts
import { hindsight, ensureCustomerBank } from './bank';

const BRIEF_ID = 'customer-brief';

export async function createCustomerBrief(customerId: string) {
  const bankId = await ensureCustomerBank(customerId);
  await hindsight.createMentalModel(
    bankId,
    '고객 브리핑',
    '이 고객의 구독 상태, 사용 기기, 미해결 문의, 응대 시 주의할 점은 무엇인가?',
    { id: BRIEF_ID, trigger: { refreshAfterConsolidation: true } },
  );
}

export async function readCustomerBrief(customerId: string) {
  // LLM 호출 없이 저장된 최신 버전만 읽는다
  const model = await hindsight.getMentalModel(`support::${customerId}`, BRIEF_ID);
  return model.content;
}
```

### 실행 흐름

```text
고객: "지난봄에 문의했던 결제 문제 해결됐나요?"
 ↓
handleMessage: support::c-1024 bank 준비 확인
 ↓
recall(budget low, 1500 tokens): "지난봄" → 3~5월 범위, 결제·iOS 앱 관련 Observation과 fact 반환
 ↓
OpenAI 호출: 기억을 system 메시지에 넣고 답변 생성
 ↓
고객에게 답변 반환  ← 여기까지가 사용자 응답 경로
 ↓ (비동기)
retain(append): 이번 턴을 session::s-88 문서에 추가 → 사실 추출
 ↓ (백그라운드)
consolidation: "결제 문제는 웹 결제로 우회했고 9월에 해결 여부를 다시 물었다"로 Observation 갱신
 ↓
Mental Model "고객 브리핑" 갱신 → 상담원 화면은 다음 조회 때 최신 브리핑을 읽음
```

### 코드 설명

1. **bank를 고객 단위로 나눕니다.** `support::{customerId}`처럼 고객마다 bank를 두면 다른 고객의 기억이 검색될 가능성이 구조적으로 사라집니다. 하나의 bank에 태그로 고객을 나누는 방식은 `tagsMatch` 설정을 한 번만 실수해도 섞일 수 있습니다.
2. **recall은 응답 경로에, retain은 응답 경로 밖에 둡니다.** recall은 LLM을 부르지 않아 짧지만, retain은 사실 추출 LLM을 부릅니다. `async: true`로 큐에 넣고 결과를 기다리지 않습니다.
3. **`updateMode: 'append'`와 세션 단위 `documentId`를 함께 씁니다.** 기본값 `replace`로 같은 `documentId`를 보내면 이전 내용과 그 기억이 지워지고 새 내용으로 바뀝니다. append는 기존 문서 뒤에 붙이고, 바뀌지 않은 부분은 다시 추출하지 않습니다.
4. **화자를 `context`에 적습니다.** 고객의 "저 연간 구독으로 바꿨어요"가 에이전트 자신의 경험으로 저장되지 않게 하기 위해서입니다.
5. **기억은 참고 자료로만 넣습니다.** 기억은 이전 대화에서 추출된 것이므로 틀리거나 오래됐을 수 있습니다. 시스템 프롬프트에 "현재 대화와 충돌하면 현재 대화를 따른다"를 넣은 이유입니다.
6. **규칙은 Directive로 둡니다.** "환불 금액을 약속하지 않는다"는 bank의 reflect가 반드시 지키는 규칙으로 등록했습니다. 다만 Directive는 Hindsight의 `reflect`에만 적용되므로, 직접 OpenAI를 부르는 2단계에서는 시스템 프롬프트에도 같은 규칙을 넣었습니다.
7. **상담원 화면은 Mental Model을 읽습니다.** 화면을 열 때마다 reflect를 돌리면 매번 LLM 비용과 수 초의 지연이 생깁니다. 질문을 미리 정해 두면 Hindsight가 통합 직후 답을 갱신하고, 화면은 DB 조회 한 번으로 최신 브리핑을 보여 줍니다.

### 왜 이렇게 사용하는가?

상담 챗봇에서 기억 기능의 실패는 두 가지입니다. 하나는 **다른 고객의 정보가 섞이는 것**, 다른 하나는 **기억 처리 때문에 답이 느려지는 것**입니다. 이 구성은 첫 번째를 bank 분리로, 두 번째를 "읽기는 동기·짧게, 쓰기는 비동기"로 막습니다. 그 사이의 어려운 일, 즉 "지난봄"의 날짜 해석, 옛 상태와 새 상태의 정리, 중복 제거는 Hindsight가 맡습니다.

reflect 대신 recall을 응답 경로에 쓴 것도 의도적인 선택입니다. 답을 만드는 LLM이 이미 있으므로, Hindsight에서 또 한 번 LLM 루프를 돌리면 비용과 지연이 두 배가 됩니다. reflect는 "이 고객에게 다음에 무엇을 제안할까"처럼 판단 자체를 맡길 때 씁니다.

## 예제 2. 기존 LLM 호출에 래퍼만 씌우기

### 요구사항

> 이미 OpenAI SDK로 운영 중인 Python 챗봇이 있다. 대화 로직은 건드리지 않고 기억 기능만 먼저 붙여 효과를 확인하고 싶다.

### 구현

```bash
pip install hindsight-litellm
```

```python
# app/llm.py
from openai import OpenAI
from hindsight_litellm import wrap_openai

def client_for(user_id: str):
    # 기본 연결 대상은 Hindsight Cloud이므로 자체 서버는 주소를 꼭 지정한다
    return wrap_openai(
        OpenAI(),
        bank_id=f"support::{user_id}",
        hindsight_api_url="http://localhost:8888",
    )

def answer(user_id: str, message: str) -> str:
    client = client_for(user_id)
    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": message}],
    )
    return response.choices[0].message.content
```

래퍼는 `chat.completions.create` 호출 직전에 관련 기억을 recall해서 프롬프트에 넣고, 호출이 끝나면 대화를 retain합니다. Anthropic SDK는 `wrap_anthropic()`을 쓰고, LiteLLM 아래에서 동작하므로 100개 이상의 모델에 같은 방식이 적용됩니다. 검색 깊이, 가져올 기억 타입, recall 대신 reflect 사용 여부는 `hindsight_*` 키워드 인자로 호출마다 바꿀 수 있습니다.

### 왜 이렇게 사용하는가?

래퍼는 **"기억이 있으면 우리 서비스가 실제로 나아지는가"를 가장 싸게 확인하는 방법**입니다. 다만 무엇을 언제 저장하고 검색할지 제어할 수 없으므로, 효과를 확인한 뒤에는 예제 1처럼 SDK를 직접 호출하는 구조로 옮기는 것이 좋습니다. 공식 문서도 저장·검색 시점을 명시적으로 제어해야 하면 SDK나 REST API를 직접 쓰라고 안내합니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 코딩 에이전트와 MCP →](04-usage-coding-agents.md)
