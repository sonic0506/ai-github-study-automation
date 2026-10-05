# n8n 활용 예시 ① 웹훅 기반 업무 자동화

> 결제 실패 이벤트를 받아 기록·분기·알림까지 처리하는 워크플로를 만들고, 우리 서비스(Client) 쪽에서 n8n을 안전하게 호출하는 방법과 실패를 다루는 방법까지 다룹니다.

## 예제 1. 결제 실패 후속 처리 워크플로

### 요구사항

> PG사가 결제 실패 웹훅을 보내면 다음을 처리한다.
> 1. 실패 이력을 DB에 남긴다. 같은 이벤트가 두 번 와도 한 번만 기록한다.
> 2. 실패 금액이 10만 원 이상이면 CS 채널(Slack)에 바로 알린다.
> 3. 최근 30일 안에 세 번 이상 실패한 고객은 이탈 방지 메일 목록에 추가한다.
> 4. 어느 단계든 실패하면 운영 채널에 실행 링크와 함께 알린다.

### 구현

워크플로 구조는 다음과 같습니다.

```text
[Webhook: POST /webhook/payment-failed, Header Auth, Respond Immediately]
   ↓
[Edit Fields: 필요한 필드만 정리]
   ↓
[Postgres: 실패 이력 저장 (중복이면 무시) + 30일 실패 횟수 조회]
   ↓
[If: 새로 기록된 이벤트인가?] ── false → (중복 이벤트, 종료)
   ↓ true
   ├─→ [If: amount >= 100000] ── true → [Slack: #cs-alerts 알림]
   └─→ [If: failCount >= 3]   ── true → [HTTP Request: 메일 서비스 목록 추가]

Workflow Settings → Error workflow: "운영 알림" 워크플로
```

**1. Webhook 노드**

| 설정 | 값 | 이유 |
|---|---|---|
| HTTP Method | `POST` | PG 웹훅 형식 |
| Path | `payment-failed` | 고정 경로로 두어야 PG 설정을 바꾸지 않아도 됨 |
| Authentication | Header Auth (`X-Webhook-Token`) | 아무나 호출하지 못하게 공유 비밀값 확인 |
| Respond | Immediately | PG는 빠른 2xx 응답을 기대함. 후속 처리는 응답 뒤에 진행 |

**2. Edit Fields(Set) 노드**: 웹훅 아이템은 `headers`, `query`, `body`를 모두 담고 있으므로, 뒤쪽 노드가 쓰기 쉽게 필요한 값만 꺼냅니다.

```text
eventId    = {{ $json.body.eventId }}
customerId = {{ $json.body.customerId }}
amount     = {{ $json.body.amount }}
reason     = {{ $json.body.reason }}
```

**3. Postgres 노드(Execute Query)**: 중복 방지와 횟수 조회를 쿼리 하나로 처리합니다. 값은 문자열로 이어 붙이지 않고 **Query Parameters**(`$1`, `$2`...)로 넘깁니다.

```sql
WITH inserted AS (
  INSERT INTO payment_failures (event_id, customer_id, amount, reason)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (event_id) DO NOTHING   -- 같은 이벤트 재전송은 무시
  RETURNING customer_id
)
SELECT
  (SELECT count(*) FROM inserted) = 1 AS is_new,
  (SELECT count(*) FROM payment_failures
     WHERE customer_id = $2 AND created_at > now() - interval '30 days') AS fail_count;
```

Query Parameters에는 `{{ $json.eventId }}, {{ $json.customerId }}, {{ $json.amount }}, {{ $json.reason }}`를 순서대로 넣습니다.

**4. If 노드와 알림 노드**

- 첫 번째 If: `{{ $json.is_new }}`가 `true`인지 확인합니다.
- 금액 If: `{{ $('Edit Fields').item.json.amount }}`가 `100000` 이상인지 확인합니다. Postgres 노드의 출력에는 금액이 없으므로, 앞쪽 노드에서 같은 계보의 아이템을 찾아옵니다.
- Slack 노드: 메시지에 `{{ $('Edit Fields').item.json.customerId }}`, 금액, 사유를 넣습니다. 노드 설정에서 **Retry On Fail**(3회, 1초 간격)을 켭니다.
- 횟수 If와 HTTP Request 노드: `{{ $json.fail_count }}`가 3 이상이면 메일 서비스 API를 호출합니다. 인증은 Credential로 지정합니다.

**5. Error Workflow**: 별도 워크플로를 **Error Trigger** 노드로 시작하게 만들고, 원래 워크플로의 Workflow Settings에서 Error workflow로 지정합니다. Error Trigger가 받는 데이터는 다음과 같은 형태입니다.

```json
{
  "execution": {
    "id": "231",
    "url": "https://n8n.example.com/execution/231",
    "error": { "message": "Slack API: channel_not_found" },
    "lastNodeExecuted": "Slack"
  },
  "workflow": { "id": "1", "name": "결제 실패 후속 처리" }
}
```

Slack 노드로 `{{ $json.workflow.name }}에서 실패: {{ $json.execution.error.message }} {{ $json.execution.url }}`를 보내면, 운영자는 링크를 눌러 실패한 실행의 노드별 데이터를 바로 열어 볼 수 있습니다.

### 실행 흐름

```text
PG 서버: POST /webhook/payment-failed (X-Webhook-Token 포함)
 ↓
Webhook 노드: 토큰 확인 → 즉시 200 응답 → 아이템 1개 생성
 ↓
Edit Fields: eventId, customerId, amount, reason만 남김
 ↓
Postgres: INSERT ... ON CONFLICT → is_new, fail_count 반환
 ↓
If(is_new): 중복 이벤트면 여기서 종료
 ↓
If(amount) → Slack 알림 (실패 시 3회 재시도)
If(fail_count) → 메일 서비스 API 호출
 ↓
실행 기록 저장. 어느 노드든 최종 실패하면 Error Workflow 실행 → 운영 채널 알림
```

### 코드 설명

1. **즉시 응답 후 처리합니다.** PG는 응답이 늦으면 같은 이벤트를 다시 보냅니다. Respond를 Immediately로 두면 HTTP 응답과 후속 처리가 분리됩니다.
2. **중복 방지를 DB 제약으로 합니다.** 웹훅은 "최소 한 번" 전달되는 경우가 많습니다. `event_id`에 UNIQUE 제약을 두고 `ON CONFLICT DO NOTHING`을 쓰면, n8n 쪽에서 상태를 따로 기억하지 않아도 중복 처리가 막힙니다.
3. **쿼리 파라미터를 씁니다.** 표현식을 SQL 문자열에 직접 이어 붙이면 `reason`에 따옴표가 들어오는 순간 SQL Injection이 됩니다.
4. **`$('Edit Fields').item`으로 앞 단계 값을 가져옵니다.** Postgres 노드가 출력을 새로 만들었기 때문에, 금액 같은 원래 값은 pairedItem 계보를 따라 앞 노드에서 찾아야 합니다.
5. **재시도는 노드별로, 최종 실패는 Error Workflow로 다룹니다.** Slack의 일시 오류는 재시도로 흡수하고, 그래도 실패하면 사람에게 알려 재실행 여부를 판단하게 합니다.

### 왜 이렇게 사용하는가?

같은 기능을 백엔드에 직접 만들면 재시도, 실패 기록, 재실행 화면을 따로 만들어야 합니다. n8n에서는 **노드 설정 몇 개와 Error Workflow 하나**로 그 부분을 얻고, 개발자는 중복 방지 쿼리처럼 정말 중요한 곳에만 집중할 수 있습니다. 기준 금액이나 알림 채널이 바뀌어도 코드 배포 없이 노드 값을 고치고 다시 Publish하면 됩니다.

---

## 예제 2. 우리 서비스(Client)에서 n8n 호출하기

n8n은 브라우저나 앱에 넣는 라이브러리가 아니므로, 여기서 Client는 **n8n을 호출하는 우리 서비스**를 뜻합니다. 가장 흔한 형태는 백엔드가 도메인 이벤트를 n8n 웹훅으로 넘기는 것입니다.

### 활용할 수 있는 기능

- **Webhook 노드**: Basic·Header·JWT 인증, IP 허용 목록, 최대 16MB 페이로드(셀프호스팅에서 조정 가능)
- **Respond to Webhook 노드**: 워크플로 중간에서 원하는 상태 코드와 본문으로 응답
- **Chat Trigger의 공개 채팅**: 웹 페이지에 붙이는 채팅 위젯으로 AI 워크플로 호출
- **Public REST API**: `X-N8N-API-KEY` 헤더로 워크플로·실행 기록 조회와 관리

### 실제 예제

```ts
// src/integrations/n8n.ts : 백엔드에서 n8n 웹훅으로 이벤트 전달
type PaymentFailedEvent = {
  eventId: string; // PG 이벤트 ID. n8n 쪽 중복 방지 키로 쓰인다
  customerId: string;
  amount: number;
  reason: string;
};

export async function notifyPaymentFailed(event: PaymentFailedEvent): Promise<void> {
  const res = await fetch(`${process.env.N8N_BASE_URL}/webhook/payment-failed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Token': process.env.N8N_WEBHOOK_TOKEN!, // Webhook 노드의 Header Auth 값
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000), // n8n이 느려도 우리 API는 5초 이상 기다리지 않는다
  });

  if (!res.ok) {
    // 호출자는 이 오류를 잡아 아웃박스 테이블에 남기고 나중에 다시 보낸다
    throw new Error(`n8n webhook failed: ${res.status}`);
  }
}
```

```ts
// scripts/check-failed-executions.ts : 운영 점검용, 최근 실패 실행 조회
const res = await fetch(
  `${process.env.N8N_BASE_URL}/api/v1/executions?status=error&workflowId=${process.env.WORKFLOW_ID}&limit=20`,
  { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY!, accept: 'application/json' } },
);
const { data } = (await res.json()) as { data: { id: string; startedAt: string }[] };
for (const exec of data) console.log(exec.id, exec.startedAt);
```

1. **타임아웃을 둡니다.** n8n은 별도 서비스이므로 장애나 지연이 우리 API로 번지지 않게 짧은 타임아웃을 겁니다.
2. **실패하면 버리지 않습니다.** n8n이 잠시 내려가 있을 때를 대비해, 보내지 못한 이벤트를 아웃박스 테이블이나 메시지 큐에 남겨 두고 다시 보냅니다. 다시 보내도 `eventId`로 중복이 막히므로 안전합니다.
3. **웹훅 토큰과 API 키는 용도가 다릅니다.** 웹훅 토큰은 특정 워크플로 하나를 호출하는 비밀값이고, API 키는 인스턴스 전체를 다룰 수 있는 권한입니다. Enterprise가 아니면 API 키에 범위(scope)를 줄 수 없으므로, API 키는 운영 스크립트에만 둡니다.

### 실제 서비스에서는

> 사용자의 정기 결제가 실패하면 PG가 우리 결제 서버로 웹훅을 보냅니다. 결제 서버는 구독 상태를 `past_due`로 바꾸는 핵심 로직만 트랜잭션 안에서 처리하고, 같은 트랜잭션에서 아웃박스 테이블에 이벤트를 적습니다. 아웃박스 워커가 그 이벤트를 n8n 웹훅으로 보내면, n8n이 실패 이력 기록, CS 알림, 이탈 방지 메일 같은 후속 처리를 맡습니다. 결제 로직은 코드와 테스트로 지키고, 자주 바뀌는 후속 처리는 운영자가 n8n에서 고치는 **역할 분담**입니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② AI 에이전트와 MCP →](04-usage-ai-agents.md)
