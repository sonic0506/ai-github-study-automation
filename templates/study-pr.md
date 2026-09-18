## Study Draft: {{repository}}

- Repository: {{url}}
- Stars: {{stars}}{{#deltaLabel}} ({{deltaLabel}}){{/deltaLabel}}
- 선정 점수: {{priority}}
- 조사 일시: {{researchedAt}}
- 분류: {{category}}

### 선정 사유

{{#reasons}}
- {{.}}
{{/reasons}}

### 조사 근거

- 출처 {{sourceCount}}건: {{sourceTypes}}
- 사실 {{factCount}}건
{{#hasOpenQuestions}}

확인하지 못한 내용:
{{#openQuestions}}
- {{.}}
{{/openQuestions}}
{{/hasOpenQuestions}}

### 리뷰 체크리스트

- [ ] 사실·숫자·버전이 출처와 일치한다
- [ ] 코드 예시가 문서에 있는 형태 그대로다
- [ ] 문체가 style-guide.md와 맞다 (anti-patterns 0건)
- [ ] 머지 후 frontmatter의 `status`를 `published`로 변경
