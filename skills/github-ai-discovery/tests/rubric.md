# github-ai-discovery 평가 Rubric

수집 결과는 실시간 데이터라 문자열 비교 대신 아래 기준으로 평가한다.
각 항목 Pass/Fail, **필수(★)** 항목이 하나라도 Fail이면 전체 Fail.

- [ ] ★ 출력이 `repository.schema.json#/$defs/discoveryOutput` 스키마를 통과한다.
- [ ] ★ `scripts/discover.mjs`(또는 API 불가 시 `normalize.mjs`)를 거쳐 출력했다 (직접 필터링하지 않음).
- [ ] ★ 검색으로 수집된 저장소의 `stars`가 모두 기준값 이상이다 (등록 저장소 추적분은 예외).
- [ ] ★ `repository` 중복이 없다 (대소문자 무시).
- [ ] ★ 모든 Repository가 실제로 존재한다 (환각 없음 — 임의 3개 URL 확인).
- [ ] ★ 토큰 값이 출력·로그·파일 어디에도 없다.
- [ ] archived / fork Repository가 설정에 따라 제외되었다.
- [ ] 설정의 모든 `topics`에 대해 topic 검색과 신규 검색을 시도했다 (stderr 진행 로그 확인).
- [ ] `stars` 값이 GitHub 원문과 일치한다 (임의 3개 확인, 반올림/추정 없음).
- [ ] 출력에 Ranking, 점수, Markdown, 설명 문장이 포함되지 않았다.
