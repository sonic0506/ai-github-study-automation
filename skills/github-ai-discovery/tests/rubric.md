# github-ai-discovery 평가 Rubric

생성형 단계(검색·옮겨 적기)는 문자열 Snapshot 대신 아래 기준으로 평가한다.
각 항목 Pass/Fail, **필수(★)** 항목이 하나라도 Fail이면 전체 Fail.

- [ ] ★ 출력이 `repository.schema.json#/$defs/discoveryOutput` 스키마를 통과한다.
- [ ] ★ 모든 `stars`가 `minimum_stars` 이상이다.
- [ ] ★ `repository` 중복이 없다 (대소문자 무시).
- [ ] ★ 모든 Repository가 실제 검색 결과에 존재한다 (환각 없음 — 임의 3개 URL 확인).
- [ ] ★ archived / fork Repository가 설정에 따라 제외되었다.
- [ ] 설정의 모든 `topics`에 대해 검색을 시도했다.
- [ ] `stars` 값이 검색 결과 원문과 일치한다 (임의 3개 확인, 반올림/추정 없음).
- [ ] 출력에 Ranking, 점수, Markdown, 설명 문장이 포함되지 않았다.
- [ ] `normalize.mjs` 스크립트를 거쳐 출력했다 (직접 필터링하지 않음).
