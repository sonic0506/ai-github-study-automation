# Hindsight 주의할 점과 FAQ

> 운영하면서 신경 써야 할 비용·보안·데이터 격리·성능·버전 문제와, 처음 쓸 때 자주 헷갈리는 질문을 다룹니다.

## 사용할 때 주의할 점

**비용**
- `retain`마다 사실 추출 LLM 호출이 일어나고, 통합·Mental Model·Knowledge Page 갱신도 LLM을 씁니다. 공식 문서는 추출에 큰 모델이 필요 없다고 보고 작은 고속 모델(예: Groq의 gpt-oss-20b)을 권합니다. `HINDSIGHT_API_RETAIN_LLM_*`, `HINDSIGHT_API_REFLECT_LLM_*`, `HINDSIGHT_API_CONSOLIDATION_LLM_*`로 연산마다 다른 모델을 지정할 수 있습니다.
- Mental Model과 Knowledge Page는 갱신 한 번이 합성 한 번입니다. `refreshAfterConsolidation`은 가장 최신이지만 가장 비쌉니다. 대시보드용이면 cron 갱신으로도 충분한 경우가 많습니다.
- retain 한 건당 정확한 LLM 호출 수와 토큰 비용은 공식 문서에 고정값으로 나와 있지 않습니다. 내용 길이, 추출 모드, 청크 크기에 따라 달라지므로 Prometheus 메트릭의 LLM 호출·토큰 수로 직접 측정합니다.

**성능**
- 쓰기는 느리고 읽기는 빠르게 설계되었습니다. 사용자 응답 경로에서는 `retain`을 `async: true`로 보내고, `recall`만 동기로 기다립니다.
- recall 지연의 주된 병목은 CPU에서 도는 cross-encoder입니다. GPU, 외부 재순위화 서비스, 낮은 `budget`으로 줄입니다. 자세한 내용은 [Recall 파이프라인 깊이 보기](07-recall-pipeline.md#4단계-cross-encoder-재순위화)에 있습니다.
- 전체 이미지는 내장 임베딩·재순위화 모델 때문에 메모리를 최소 1.5GB, 권장 2GB 씁니다. slim 이미지는 512MB~1GB지만 외부 임베딩·재순위화 제공자가 필요합니다.

**보안**
- REST API와 MCP 엔드포인트 모두 **기본으로 인증이 꺼져 있습니다.** 로컬 밖에 노출한다면 `ApiKeyTenantExtension` 등으로 인증을 켜고, 네트워크에서도 내부망으로 제한합니다.
- bank ID를 요청 본문이나 쿼리 문자열에서 그대로 받으면 다른 사용자의 기억을 조회하는 통로가 됩니다. bank ID는 항상 인증된 세션에서 서버가 만듭니다.
- 비밀값·개인정보 마스킹(Memory Defense)은 bank별 **옵트인**입니다. 켜면 45개 정규식 패턴으로 API 키, DB 연결 문자열, 일부 PII를 `[REDACTED:type]`로 바꾸거나 항목을 차단합니다. 다만 켠 이후의 retain에만 적용되고 기존 기억은 다시 검사하지 않으며, PII 패턴은 미국 형식이 기본입니다. 주민등록번호 같은 한국 형식은 저장 전에 애플리케이션에서 직접 걸러야 합니다.
- Webhook은 비밀값을 등록하고 `X-Hindsight-Signature-V2`(타임스탬프 포함)로 검증합니다. 같은 이벤트가 두 번 올 수 있으므로(at-least-once) `operation_id`로 중복을 거릅니다.
- 코딩 에이전트 패키지는 기본 저장 위치가 Hindsight Cloud입니다. 회사 코드를 다룬다면 `self-hosted`나 `daemon` 모드와 `optInOnly`를 검토합니다.

**데이터 품질**
- `documentId` 없이 같은 내용을 다시 retain하면 매번 새 문서가 되어 기억이 중복됩니다. 반대로 같은 `documentId`를 기본값(`replace`)으로 다시 보내면 **이전 내용과 그 기억이 지워집니다.** 대화처럼 늘어나는 문서는 `updateMode: 'append'`를 씁니다.
- `retainMission`을 좁게 잡으면 아무 사실도 추출되지 않는 문서가 생기고, 그 문서는 recall·reflect로 찾을 수 없습니다. `retain.completed` Webhook의 `memory_unit_count: 0`이나 `outcome="no_facts"` 메트릭으로 감시하고, 미션을 넓힌 뒤 reprocess 엔드포인트로 다시 추출합니다.
- 엔티티 정규화는 이름 유사도 기반 판단이라, 기록이 많은 bank에서는 이름이 비슷한 다른 사람이 기존 엔티티에 합쳐질 수 있습니다. 중요한 엔티티는 retain의 `entities`로 명시하거나 엔티티 매칭을 더 엄격하게 설정합니다.
- 세션 ID처럼 매번 바뀌는 태그를 붙이면 Observation이 세션마다 따로 생깁니다. `observationScopes: 'shared'`로 통합 범위를 분리합니다.

**운영**
- 내장 pg0는 개발용입니다. 운영은 PostgreSQL 14 이상 + 벡터 확장을 따로 둡니다.
- `HINDSIGHT_API_WORKER_ID`를 고정하지 않으면 재시작 후 처리 중이던 작업이 남겨집니다. 워커를 줄이기 전에는 `hindsight-admin decommission-worker`로 작업을 반납합니다.
- Observation 근사 중복 정리는 PostgreSQL에서만 동작하고 Oracle에서는 건너뜁니다. README는 Oracle AI Database를 기능 동등으로 소개하지만, 이처럼 문서 곳곳에 저장소별 차이가 있으므로 Oracle을 쓸 계획이라면 해당 항목을 따로 확인합니다.

**Breaking Change와 Deprecated 사용 방식 (2026년 10월 기준)**
- v0.10.0에서 bank profile·background 엔드포인트가 제거되었습니다. `getBankProfile()`은 서버에서 410을 돌려주므로 `getBankConfig()`로 바꿉니다.
- `createBank`의 `name`, `mission`, `background`, `disposition` 옵션은 Deprecated입니다. `reflectMission`을 쓰고, 성향은 `updateBankConfig({ dispositionSkepticism, dispositionLiteralism, dispositionEmpathy })`로 지정합니다. 공식 예제 중에도 옛 옵션을 쓰는 코드가 남아 있으니 그대로 복사하지 않습니다.
- Supabase 테넌트 확장은 내장 모듈에서 별도 확장 이미지(`hindsight_ext_supabase_tenant`)로 옮겨졌습니다. 옛 경로를 쓰는 설치는 시작 시 `ModuleNotFoundError`가 납니다.
- 코딩 에이전트 설정의 `autoReflect`는 Deprecated이고 `autoInject`로 대체되었습니다.
- 릴리스가 1~3주 간격으로 나오므로, Docker 태그와 패키지 버전은 `latest` 대신 검토한 버전으로 고정하고 업그레이드할 때 릴리스 노트를 확인합니다.

**라이선스**
MIT 라이선스입니다. 자체 호스팅과 수정에 제약이 적습니다. Hindsight Cloud는 별도 유료 서비스(사용량 기반 과금, 시작 시 무료 크레딧)이며 세부 요금은 공식 가격 페이지에서 확인해야 합니다.

---

## 자주 헷갈리는 부분

### Q. Hindsight는 벡터 DB인가요?

아닙니다. 벡터 검색은 네 갈래 검색 중 하나일 뿐이고, 저장소는 PostgreSQL(+ pgvector 등)입니다. Hindsight는 그 위에서 **사실 추출, 엔티티 그래프, 시간 해석, 통합, 추론**을 담당하는 메모리 서버입니다. 벡터 DB를 대체한다기보다 "벡터 DB로 메모리를 직접 만들던 코드"를 대체합니다.

### Q. recall과 reflect 중 무엇을 써야 하나요?

내 애플리케이션이 이미 답을 만드는 LLM을 갖고 있다면 `recall`로 기억을 가져와 프롬프트에 넣는 것이 기본입니다. LLM 호출이 없어서 빠르고 저렴합니다. "이 고객에게 무엇을 제안할까"처럼 **판단까지** Hindsight에 맡기고 싶을 때, 또는 bank의 mission·directive·성향을 일관되게 적용하고 싶을 때 `reflect`를 씁니다. 같은 질문을 반복해서 묻는다면 둘 다 아니고 Mental Model을 만들어 읽습니다.

### Q. Observation과 Mental Model은 무엇이 다른가요?

Observation은 통합 과정이 **자동으로** 만드는 한 줄짜리 믿음이고, 사실 묶음마다 하나씩 생깁니다. Mental Model은 개발자가 **질문을 정해서** 만드는 문서이고, 그 질문에 대한 답을 Observation과 사실을 재료로 써 둡니다. reflect는 Mental Model → Observation → 원본 fact 순서로 내려가며 찾습니다.

### Q. 사용자를 bank로 나눌까요, 태그로 나눌까요?

섞이면 안 되는 단위는 bank로 나눕니다. 태그 필터의 기본 `tagsMatch: 'any'`는 **태그가 없는 기억도 함께 돌려주기 때문에**, 실수로 태그 없이 저장된 기억이 다른 사용자 결과에 섞일 수 있습니다. 태그는 한 사용자 안에서 "강의별", "프로젝트별"처럼 검색 범위를 좁히는 용도로 쓰고, 태그로 격리해야 한다면 `any_strict`·`all_strict`·`exact`를 씁니다.

### Q. 기억이 틀리면 어떻게 고치나요?

원본 fact는 보존되므로, 잘못된 문서나 기억을 지우면 거기서 나온 Observation도 함께 삭제되고 남은 근거로 다시 통합됩니다. 사실이 바뀐 경우라면 지우지 말고 새 사실을 retain하는 것이 맞습니다. Observation은 "예전에는 A였지만 지금은 B"처럼 변화를 기록하도록 설계되어 있습니다. Mental Model은 버전 이력이 남으므로 무엇이 언제 바뀌었는지 확인할 수 있습니다.

### Q. retain한 직후에 recall하면 바로 나오나요?

동기 retain(`async: false`)이 끝났다면 추출된 fact는 바로 검색됩니다. 하지만 Observation 통합과 Mental Model 갱신은 그 뒤 백그라운드에서 일어나므로 몇 초에서 그 이상 늦게 반영됩니다. 비동기 retain은 작업이 큐에서 처리된 뒤에 보이며, operations API로 진행 상황을 확인할 수 있습니다.

### Q. 로컬 모델만으로 쓸 수 있나요?

됩니다. LLM은 Ollama, LM Studio, vLLM 같은 OpenAI 호환 서버를, 임베딩과 재순위화는 전체 이미지에 내장된 로컬 모델을 쓰면 외부 API 없이 동작합니다. 다만 사실 추출에는 출력 토큰 한도가 충분한 모델이 필요하고, 작은 모델에서는 추출 품질이 기억 품질을 직접 좌우합니다. Docker 이미지에는 llama.cpp가 없으므로 추론 서버는 별도 컨테이너로 띄웁니다.

### Q. 벤치마크 점수를 그대로 믿어도 되나요?

논문과 README의 LongMemEval·LoCoMo 수치는 대화형 장기 기억 과제에 대한 결과입니다. README는 자사 결과가 외부에서 재현되었고 다른 시스템 점수는 벤더 자체 보고라고 밝히지만, 그 과제가 내 서비스의 데이터와 질문 유형을 대표한다는 보장은 없습니다. 실제 대화 로그 일부로 "기억이 필요한 질문"을 만들어 직접 비교해 보는 것이 가장 확실합니다.

---

[← Recall 파이프라인 깊이 보기](07-recall-pipeline.md) · [목차](README.md)
