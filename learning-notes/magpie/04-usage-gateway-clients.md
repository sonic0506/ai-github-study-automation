# magpie 활용 예시 ② 내 코드에서 게이트웨이 쓰기

> 에이전트가 아니라 직접 만든 스크립트와 도구가 magpie 게이트웨이를 쓰는 방법, 응답한 모델과 라우팅 경로를 확인하는 방법, 할당량이 바닥났을 때 기다렸다가 이어 가는 방법을 다룹니다.

magpie는 브라우저나 앱에 번들되는 클라이언트 라이브러리가 아니므로, 여기서는 "개발자 PC에서 게이트웨이를 호출하는 쪽"을 클라이언트 관점으로 봅니다. 에이전트가 아닌 사내 스크립트, CLI 도구, 로컬 실험 코드도 base URL만 바꾸면 에이전트와 같은 카탈로그와 라우팅을 그대로 씁니다.

## 활용할 수 있는 기능

- **OpenAI 호환 엔드포인트**: `http://127.0.0.1:3425/v1`. OpenAI SDK와 대부분의 OpenAI 호환 도구가 그대로 붙습니다.
- **Anthropic 호환 엔드포인트**: `http://127.0.0.1:3425`. Anthropic SDK의 `baseURL`만 바꿉니다.
- **Gemini 호환 엔드포인트**: `GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:3425`.
- **응답 헤더**: 모든 응답에 `X-Magpie-Provider`(응답한 공급자 id)와 `X-Magpie-Model`(응답한 멤버의 `provider/model`)이 붙습니다. 본문의 `model`은 공급자가 쓴 이름 그대로 둡니다.
- **계정 고정**: `X-Magpie-Account: <이메일 또는 로그인>` 헤더로 여러 계정이 있는 구독에서 특정 계정만 쓰게 합니다.
- **라우팅 추적**: `X-Magpie-Session: <id>` 헤더를 보내고 `GET /v1/magpie/route?session=<id>`를 조회하면, 첫 토큰이 오기 전에도 어느 멤버로 갔는지 볼 수 있습니다.
- **할당량 대기**: `magpie quota wait <provider|account>`가 할당량이 돌아올 때까지 기다렸다가 종료 코드 0으로 끝납니다.

## 실제 예제

### 1. OpenAI SDK로 변경 요약 스크립트 만들기

Git diff를 요약해서 커밋 메시지 초안을 만드는 작은 스크립트입니다. 모델 이름만 바꾸면 DeepSeek, Kimi, ChatGPT 구독, Routing group 중 무엇이든 쓸 수 있습니다.

```ts
// scripts/commit-draft.ts
import { execSync } from 'node:child_process';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.MAGPIE_URL ?? 'http://127.0.0.1:3425/v1',
  apiKey: 'magpie', // 로컬 게이트웨이는 어떤 값이든 받는다
  defaultHeaders: { 'X-Magpie-Session': `commit-draft-${process.pid}` },
});

const model = process.env.DRAFT_MODEL ?? 'deepseek/deepseek-chat';
const diff = execSync('git diff --staged', { encoding: 'utf8' }).slice(0, 60_000);

if (!diff.trim()) {
  console.error('staged 변경이 없습니다.');
  process.exit(1);
}

const { data, response } = await client.chat.completions
  .create({
    model,
    messages: [
      { role: 'system', content: 'Conventional Commits 형식의 커밋 메시지 한 개만 출력한다.' },
      { role: 'user', content: diff },
    ],
  })
  .withResponse();

console.log(data.choices[0]?.message.content);
// 그룹을 썼다면 실제로 어떤 멤버가 응답했는지 헤더로 알 수 있다
console.error(`answered by ${response.headers.get('x-magpie-model')}`);
```

```bash
DRAFT_MODEL=group/cheap-chat npx tsx scripts/commit-draft.ts
```

**코드 설명**

1. **키는 아무 값이나 됩니다.** 로컬 루프백으로 들어오는 요청은 키를 검사하지 않으므로 `magpie`를 관례로 씁니다. 실제 공급자 키는 스크립트에 없습니다.
2. **모델은 환경 변수로 뺍니다.** `deepseek/deepseek-chat`에서 `group/cheap-chat`으로 바꿔도 코드는 그대로입니다. 공급자가 Chat Completions를 제공하지 않으면 게이트웨이가 변환합니다.
3. **`withResponse()`로 헤더를 읽습니다.** 본문의 `model`은 공급자의 이름(`deepseek-chat`)이라 어느 공급자·멤버가 답했는지 알 수 없지만, `X-Magpie-Model` 헤더에는 `deepseek/deepseek-chat`처럼 magpie의 이름이 들어 있습니다.

### 2. Anthropic SDK로 같은 카탈로그 쓰기

Anthropic SDK로 작성된 기존 코드도 `baseURL`만 바꾸면 됩니다. 모델은 Anthropic이 아니어도 됩니다.

```ts
// scripts/review-file.ts
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: 'http://127.0.0.1:3425', // /v1 없이 루트
  apiKey: 'magpie',
});

const file = process.argv[2];
const stream = client.messages.stream({
  model: 'moonshot/kimi-k2.5',
  max_tokens: 2048,
  messages: [{ role: 'user', content: `다음 파일의 버그 가능성을 짧게 지적해줘.\n\n${readFileSync(file, 'utf8')}` }],
});

stream.on('text', (t) => process.stdout.write(t));
await stream.finalMessage();
```

Anthropic 형식의 요청이 Kimi 공급자로 가고, 공급자가 Anthropic 형식을 제공하지 않으면 스트리밍 이벤트까지 변환되어 돌아옵니다. SDK는 차이를 알지 못합니다.

### 3. 라우팅 경로를 상태 표시줄에 보여 주기

Routing group을 쓰면 요청이 어느 멤버로 갔는지, 실패해서 다음 멤버로 넘어갔는지가 궁금해집니다. 같은 세션 id로 요청을 보내고 라우트를 조회하면 됩니다.

```ts
// scripts/watch-route.ts
type Try = { model: string; done: boolean; status?: number; fail?: string };
type SessionRoute = { asked: string; group?: string; model?: string; tries: Try[]; done: boolean; served?: string };

const base = 'http://127.0.0.1:3425';
const session = process.argv[2];
let after = 0;

while (true) {
  // wait: 라우트가 after 이후로 바뀔 때까지 최대 30초 기다렸다가 응답
  const res = await fetch(`${base}/v1/magpie/route?session=${encodeURIComponent(session)}&after=${after}&wait=30`);
  const { seq, route } = (await res.json()) as { seq: number; route: SessionRoute | null };
  after = seq;
  if (!route) continue;

  const fails = route.tries.filter((t) => t.fail).map((t) => `${t.model}(${t.fail})`);
  console.log(`${route.asked} → ${route.model ?? '결정 중'}${fails.length ? ` · 실패: ${fails.join(', ')}` : ''}`);
  if (route.done) console.log(`완료: ${route.served ?? route.model}`);
}
```

**코드 설명**

1. **롱 폴링입니다.** `after=<seq>&wait=<초>`(최대 60초)를 주면 라우트가 바뀔 때까지 응답을 붙잡고 있으므로, 짧은 주기로 계속 요청할 필요가 없습니다.
2. **라우팅이 결정되면 공급자에게 묻기 전에 나타납니다.** 응답이 느릴 때 "지금 어느 모델을 기다리는 중인지"를 바로 보여 줄 수 있습니다.
3. **실패 이유가 함께 옵니다.** `tries`의 각 항목에 `fail`(rate, quota, credit 등)이 있어서, 왜 다음 멤버로 넘어갔는지 알 수 있습니다.

### 4. 할당량이 바닥나면 기다렸다가 이어 가기

밤새 돌리는 일괄 작업이 구독 할당량에 걸려 멈추는 경우, 셸에서 다음처럼 감쌀 수 있습니다.

```bash
until codex exec "모든 패키지의 deprecated API 사용처를 찾아 고쳐줘"; do
  magpie quota wait codex --timeout 6h || break
done
```

`magpie quota wait`은 공급자의 할당량 정보를 직접 읽어서, 가장 빠른 리셋 시각 직후에 다시 확인합니다. 할당량이 돌아오면 0, 시간 초과면 1, 모르는 이름이면 2로 끝나므로 위처럼 반복문의 조건으로 쓸 수 있습니다. 게이트웨이가 실행 중이 아니어도 동작합니다.

## 실제 서비스에서는

> 개발자가 사내 문서 검색 CLI를 만들고 있다고 가정합니다. CLI는 OpenAI SDK로 `group/docs-qa`를 호출하고, 이 그룹에는 회사 DeepSeek 키와 OpenRouter 키가 `routing=order`로 묶여 있습니다. DeepSeek이 장애로 503을 돌려주면 게이트웨이가 응답을 한 바이트도 보내기 전에 OpenRouter로 넘기므로, CLI는 실패를 보지 않습니다. CLI는 응답 헤더의 `X-Magpie-Model`을 로그에 남겨 어떤 경로로 답했는지 기록하고, 월말에는 `magpie usage --csv 30d`로 공급자 키별 비용을 확인합니다.

이 방식의 장점은 **LLM 호출 코드에 공급자 선택 로직이 들어가지 않는다는 것**입니다. 공급자를 바꾸거나 Fallback을 추가하는 일은 magpie 쪽 설정이고, 코드는 모델 이름 하나만 압니다. 단, 이 구성은 개발자 PC에서 실행되는 도구에 적합합니다. 여러 사람이 쓰는 서비스라면 [팀 공유 게이트웨이와 운영](05-usage-shared-gateway.md)처럼 gateway key와 사용 한도를 갖춘 구성으로 옮겨야 합니다.

---

[← 활용 예시 ① 에이전트별 모델 전환과 비용 관리](03-usage-model-switching.md) · [목차](README.md) · [활용 예시 ③ 팀 공유 게이트웨이와 운영 →](05-usage-shared-gateway.md)
