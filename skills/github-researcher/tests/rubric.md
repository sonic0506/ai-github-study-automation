# github-researcher 평가 Rubric

## 1단계: 적합성 판정
fixture: `tests/fixtures/*-input.json`의 `expected`와 비교한다.

- [ ] ★ `studyability`가 스키마를 통과한다 (category와 studyable 조합 일치).
- [ ] ★ fixture의 `expected.studyable` / `expected.category`와 일치한다.
- [ ] ★ Study 대상이 아니면 조사하지 않고 판정만 반환했다.
- [ ] `reason`이 README에서 확인 가능한 사실 한 문장이다.
- [ ] 애매한 저장소를 억지로 제외하지 않았다.

## 2단계: Research Note

- [ ] ★ `node scripts/validate.mjs note.json`이 `ok: true`를 반환한다.
- [ ] ★ 모든 `sources[].url`이 실제로 존재하고 해당 내용을 담고 있다 (임의 3개 확인).
- [ ] ★ 숫자·버전·날짜가 출처 원문과 일치한다.
- [ ] ★ Research Note에 없는 추측이 사실처럼 적히지 않았다 (확인 못 한 것은 `openQuestions`).
- [ ] README 외 최소 1종 이상의 출처를 사용했다 (`warnings`에 `only README` 없음).
- [ ] `gettingStarted`의 설치 명령·예제가 문서에 있는 형태 그대로다.
- [ ] `limitations`가 공식 문서나 Issue에 근거한다.
- [ ] 의견, 감탄, 비유, 사용자 문체가 없다.
