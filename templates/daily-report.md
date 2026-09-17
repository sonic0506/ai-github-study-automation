# AI GitHub Daily — {{date}}

> 수집 {{repositoryCount}}개 · 신규 {{newCount}}개 · 오늘의 Study {{selectedCount}}개

## 🔥 24h Growth TOP 10

| # | Repository | ⭐ Stars | Δ 24h | 한 줄 요약 |
|---:|---|---:|---:|---|
{{#growth24hTop10}}
| {{rank}} | [{{repository}}]({{url}}) | {{stars}} | +{{delta24h}} | {{comment}} |
{{/growth24hTop10}}

## ⭐ Total Stars TOP 10

| # | Repository | ⭐ Stars | Δ 24h |
|---:|---|---:|---:|
{{#totalStarsTop10}}
| {{rank}} | [{{repository}}]({{url}}) | {{stars}} | {{delta24hOrNew}} |
{{/totalStarsTop10}}

## 🆕 Newly Discovered

{{#newlyDiscovered}}
- [{{repository}}]({{url}}) — ⭐ {{stars}} · {{description}}
{{/newlyDiscovered}}

## 📚 오늘의 Study

{{#selected}}
- **{{repository}}** (priority {{priority}}) — {{reasons}}
{{/selected}}

<details><summary>Study Queue 전체</summary>

| Repository | Priority | Status |
|---|---:|---|
{{#candidates}}
| {{repository}} | {{priority}} | {{status}} |
{{/candidates}}

</details>
