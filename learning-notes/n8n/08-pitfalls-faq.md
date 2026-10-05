# n8n 주의할 점과 FAQ

> 운영하면서 신경 써야 할 성능·보안·동시성·라이선스·버전 변화 문제와, 처음 쓸 때 자주 헷갈리는 질문을 다룹니다.

## 사용할 때 주의할 점

**성능과 메모리**
- 한 실행의 모든 아이템과 노드별 결과는 메모리를 거쳐 실행 기록으로 저장됩니다. 수십만 행을 한 번에 읽어 오면 메모리 부족이 납니다. Loop Over Items로 묶음 단위로 나누거나, 큰 처리는 하위 워크플로로 쪼개서 각 실행이 작은 데이터만 다루게 합니다.
- 실행 기록은 DB를 계속 키웁니다. `EXECUTIONS_DATA_MAX_AGE`, `EXECUTIONS_DATA_PRUNE_MAX_COUNT`로 보존 기간과 개수를 줄이고, 성공한 실행이 많은 워크플로는 성공 데이터 저장을 끄는 것(`EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` 또는 워크플로 설정)을 검토합니다.
- SQLite로 오래 운영하면 WAL 파일이 크게 자라 실행이 느려졌다는 보고가 있습니다. 상시 운영은 Postgres로 옮깁니다.

**보안**
- **암호화 키**(`N8N_ENCRYPTION_KEY`)를 잃으면 모든 Credential을 쓸 수 없고, 키와 DB 덤프가 함께 유출되면 모든 비밀값이 노출됩니다. 키와 백업은 다른 곳에 보관합니다.
- **Task Runner는 external mode로** 운영합니다. Task Runner가 없거나 internal mode면, 워크플로를 편집할 수 있는 사람이 Code 노드로 DB, 암호화 키, Credential, 환경 변수에 접근할 수 있다고 공식 문서가 경고합니다.
- **편집 권한 = 실행 권한**입니다. 워크플로를 편집할 수 있는 사용자는 그 인스턴스의 Credential을 사용하는 코드를 실행할 수 있습니다. 편집자 권한은 신뢰할 수 있는 사람에게만 주고, 프로젝트별로 Credential 공유 범위를 나눕니다.
- 2.0부터 Code 노드의 환경 변수 접근, Execute Command·Local File Trigger 노드가 **기본으로 막혀** 있습니다. 다시 여는 설정(`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `NODES_EXCLUDE`)은 위험을 이해한 뒤에만 바꿉니다.
- 웹훅에는 Header·Basic·JWT 인증이나 IP 허용 목록을 겁니다. 경로가 무작위 문자열이라는 것은 보안 장치가 아닙니다.
- Enterprise가 아닌 플랜의 **API 키는 범위를 좁힐 수 없어** 계정의 모든 권한을 가집니다. 운영 스크립트에만 두고 만료 기간을 설정합니다.
- 인스턴스 MCP 서버는 연결된 모든 클라이언트가 노출된 워크플로 전체를 봅니다. 쓰기·삭제를 하는 워크플로는 노출 목록에서 뺍니다.

**동시성과 확장**
- Queue mode에서는 웹훅 요청을 main(또는 webhook 프로세스)이 받고 실행은 워커가 하므로, 응답 지연이 조금 늘어납니다. Respond to Webhook으로 돌려주는 응답은 Redis를 거치므로 기본 64MiB 상한이 있습니다.
- Queue mode는 Postgres와 Redis가 필요하고 SQLite를 지원하지 않습니다. 모든 main·worker는 **같은 n8n 버전, 같은 암호화 키**여야 합니다.
- 워커 동시성을 너무 낮게 잡고 워커 수만 늘리면 DB 연결 풀이 고갈될 수 있습니다. 공식 권장은 동시성 5 이상입니다.
- MCP Server Trigger를 Queue mode에서 여러 webhook 프로세스 뒤에 두면 SSE·스트리밍 연결이 끊길 수 있습니다. `/mcp*` 요청은 전용 프로세스 하나로 보내고, 리버스 프록시에서는 버퍼링을 끕니다.
- Simple Memory는 프로세스 안에 대화를 보관하므로 재시작이나 여러 워커 환경에 맞지 않습니다. 운영 에이전트는 Postgres·Redis 기반 메모리를 씁니다.

**비용**
- 셀프호스팅에서 n8n 자체는 실행 횟수로 과금되지 않지만, LLM 노드와 n8n Assistant는 토큰 비용이 듭니다. 에이전트의 Max Iterations, 긴 System Message, 큰 도구 응답은 호출 한 번의 토큰을 크게 늘립니다.
- 설치 스크립트 구성처럼 샌드박스 서비스까지 띄우면 최소 RAM 4GB, vCPU 2개가 필요합니다. AI Assistant 기능이 필요 없으면 n8n과 Task Runner만 띄우는 구성이 훨씬 가볍습니다.

**라이선스**
- Sustainable Use License는 **사내 업무용, 비상업·개인 용도**의 사용과 수정을 허용하고, 배포는 비상업 목적의 무료 배포로 제한합니다. n8n을 호스팅해 고객에게 판매하거나, 우리 제품 안에 n8n을 고객용 자동화 기능으로 넣으려면 별도 라이선스를 확인해야 합니다.
- 파일명에 `.ee.`가 들어간 소스는 n8n Enterprise License가 적용되며, 유효한 엔터프라이즈 라이선스 없이 쓸 수 없습니다.
- 2022년 3월 17일 이전 버전은 Apache 2.0 with Commons Clause였습니다. 오래된 글의 라이선스 설명은 현재와 다를 수 있습니다.

**Breaking Change와 Deprecated 사용 방식**
- **2.0에서 바뀐 것**: Active 토글 대신 저장(초안)과 Publish 분리, Start 노드 제거(Manual Trigger·Execute Workflow Trigger로 대체), Task Runner 기본 활성화와 `n8nio/runners` 이미지 분리, Pyodide 기반 Python 제거(Task Runner 기반 네이티브 Python으로 대체), MySQL·MariaDB 지원 제거, `n8n --tunnel` 제거, Code 노드의 `$evaluateExpression` 사용 불가, 대기 후 재개된 하위 워크플로가 입력이 아니라 최종 출력을 부모에게 반환.
- **Deprecated**: `N8N_RUNNERS_ENABLED`(2.0부터 불필요), Task Runner internal mode, AI Agent 노드의 agent type 설정(v1 노드는 3.0에서 제거 예정), Function·Function Item 노드(Code 노드로 대체).
- **3.0에서 예정된 변화**: npm으로 실행하는 배포 방식 대신 Docker 기반 배포 필수, Function·Item Lists·Cron·Interval·레거시 OpenAI 노드 등 다수의 레거시 노드 제거, `$getPairedItem` 표현식 헬퍼 제거, Execute Sub-workflow의 Local File·URL 소스 제거. 업그레이드 전에 n8n이 제공하는 Migration Report를 확인합니다.
- 주마다 새 minor 버전이 나옵니다. 운영 이미지는 정확한 버전으로 고정하고, 스테이징 인스턴스에서 먼저 올려 본 뒤 운영에 반영합니다.

---

## 자주 헷갈리는 부분

### Q. n8n은 npm 라이브러리인가요? 내 앱 코드에서 import하나요?

아닙니다. n8n은 **별도로 띄우는 서버 애플리케이션**입니다. 앱은 웹훅 URL이나 REST API(`X-N8N-API-KEY`)로 n8n과 통신합니다. npm에 `n8n` 패키지가 있지만 이것은 서버를 실행하는 CLI이며, 3.0부터는 이 방식도 Docker로 바뀔 예정입니다. 코드로 n8n을 확장하고 싶다면 import가 아니라 **커스텀 노드**를 만들어 n8n에 설치합니다.

### Q. 오픈소스인가요?

소스는 모두 공개되어 있고 셀프호스팅도 자유롭지만, OSI 기준 오픈소스 라이선스는 아닙니다. n8n은 스스로를 **fair-code**라고 부릅니다. 사내 자동화에 쓰는 데는 문제가 없지만, n8n 자체를 상품으로 판매하는 용도에는 제한이 있습니다.

### Q. 노드가 왜 여러 번 실행되나요? Slack 메시지가 50개나 왔어요.

대부분의 노드는 **입력 아이템마다 한 번씩** 동작하기 때문입니다. 앞 노드가 50개의 아이템을 내보냈다면 Slack 노드는 50번 메시지를 보냅니다. 하나로 합쳐 보내려면 Aggregate 노드나 Code 노드로 아이템을 하나로 모으거나, 노드 설정의 Execute Once를 켭니다. 이 동작 원리는 [실행 엔진 깊이 보기](07-execution-engine.md#노드가-지켜야-하는-계약)에서 다룹니다.

### Q. 테스트할 때는 되는데 실제 이벤트로는 실행이 안 돼요.

두 가지를 확인합니다. 첫째, 외부 서비스에 **테스트 URL(`/webhook-test/...`)을 등록하지 않았는지** 봅니다. 테스트 URL은 에디터에서 "Listen for test event" 중일 때만 응답합니다. 둘째, 워크플로를 **Publish했는지** 봅니다. 2.x에서는 편집 내용이 자동 저장되지만, 운영 트리거는 Publish한 버전만 실행합니다.

### Q. 예전 글에 나오는 "Active" 토글이 안 보여요.

2.0에서 저장과 운영 반영이 분리되면서 **Publish**로 바뀌었습니다. 편집은 초안으로 자동 저장되고, Publish해야 운영 URL과 스케줄이 그 버전으로 동작합니다. 이후 편집한 내용은 다시 Publish하기 전까지 운영에 반영되지 않으므로, 운영 중인 워크플로를 안심하고 고칠 수 있습니다.

### Q. Code 노드에서 환경 변수나 파일, HTTP 요청을 쓸 수 없나요?

2.0부터 Code 노드의 환경 변수 접근은 기본으로 막혀 있고, 사용자 코드는 Task Runner에서 격리되어 실행됩니다. 공식 문서는 파일 읽기·쓰기는 Read/Write Files from Disk 노드, HTTP 호출은 HTTP Request 노드를 쓰라고 안내합니다. 비밀값은 환경 변수가 아니라 Credential에 넣고 해당 노드에서 사용합니다. 셀프호스팅에서는 허용 목록에 넣은 npm·Python 모듈만 Code 노드에서 import할 수 있습니다.

### Q. AI Agent 노드와 Agents는 무엇이 다른가요?

**AI Agent 노드**는 워크플로 안의 한 단계입니다. 트리거와 다른 노드 사이에 끼워 넣고, 정해진 흐름의 일부로 실행됩니다. **Agents**는 워크플로와 나란히 존재하는 독립된 에이전트로, 채팅·Slack 같은 채널이나 스케줄로 직접 호출되고 워크플로를 도구로 부릅니다. 흐름이 정해진 일은 워크플로 + AI Agent 노드로, 요청이 열려 있어 에이전트가 스스로 순서를 정해야 하는 일은 Agents로 생각하면 됩니다. Agents는 2026년 10월 기준 Preview입니다.

### Q. Cloud와 셀프호스팅 중 무엇으로 시작해야 하나요?

서버 운영 경험이 없거나 빨리 써 보는 것이 목적이면 Cloud가 맞습니다. 고객 데이터를 외부에 둘 수 없거나, 실행량이 많거나, 커스텀 노드와 외부 npm 모듈이 필요하면 셀프호스팅이 맞습니다. 셀프호스팅을 고른다면 첫날부터 Postgres, 암호화 키 백업, 버전 고정, external mode Task Runner를 갖추는 것이 나중에 옮기는 것보다 쉽습니다.

---

[← 실행 엔진 깊이 보기](07-execution-engine.md) · [목차](README.md)
