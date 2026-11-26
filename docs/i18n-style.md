# Translation style guide — 「인수인계 실험」 (gameoff-shift)

## The game in one paragraph
A small online puzzle platformer for GitHub Game Off 2026 (theme SHIFT). Real players take 60-second shifts one after another in an underground research facility. Each picks an equipment card (access card, walking assist, light, echo recorder, phase shifter, control desk), does their part, and leaves a hand-drawn note for the next worker. Nobody can talk. A facility AI that calls itself **the Supervisor (감독관)** runs the "experiment" and logs everything: notes, refused handovers, timeouts, accidents. The twist: the Supervisor itself was the last staff member's successor and never understood the drawn note it was handed. The ending reveals the note meant "you can go home now." Credits list the run's real workers as **colleagues**, not subjects.

Look and feel: a 1980s–90s industrial/office bureaucracy. Paper forms, rubber stamps (승인 / 결재), CCTV, logbooks, safety signs, approval boxes, worker numbers. Pixel font, small screen, tight boxes.

## Voices
1. **Supervisor (narration, say(), narrate(), mood(), some hints).** Polite, dry, formal, precise. Respects people without understanding them. Short declarative sentences. Never jokes on purpose; the humour is deadpan and comes from the mismatch. Occasionally a quiet, melancholy line ("I have looked at that drawing for a long time too. I still do not understand it."). Keep that restraint — no exclamation marks unless the Korean has one, no slang, no emoji.
2. **Forms, labels, HUD, buttons.** Terse bureaucratic labels, like a facility form or a control-room panel. Noun phrases, not sentences. Shortest natural wording.
3. **Status words in the control console** (열림/닫힘, 대기, 당김, 눌림, 완료…): one or two words, like an indicator lamp.
4. **System/error messages** (rate limit, banned, connection): plain, polite, clear; still in the facility's register.

## Per language
- **English (en):** Dry corporate/safety-signage English. Supervisor: formal, no contractions ("You may clock out now."), not cute, not Portal-quoting. Labels: Title Case only for proper headings; buttons in sentence case ("Clock in", "Watch only"). Use "worker", "shift", "clock in / clock out", "handover", "note", "Supervisor", "control desk", "approval", "run" (회차), "stage" (공정), "lab" (실험실). Keep it SHORT — boxes are narrow; prefer the shorter synonym.
- **Japanese (ja):** 社内文書・業務連絡の文体. Supervisor: です・ます調, 丁寧で淡々, 漢語多め、感情は抑える. Labels/buttons: 体言止め・漢語 (出勤, 退勤, 引き継ぎ, 観戦のみ, 決裁, 承認, 作業員, 監督官, 管制, 入館カード, 歩行補助装置, 照明, 残像記録器, 位相移動器). 全角括弧・読点「、」句点「。」. Avoid katakana where an office kanji word exists. Keep short.
- **Simplified Chinese (zh):** 简体中文，工厂/机关公文语体。监督官：书面、礼貌、克制（"您现在可以下班了。"），不用网络用语，不用感叹。标签/按钮：简短名词短语（上班、下班、交接、仅观看、审批、批准、作业员、监督官、控制台、门禁卡、助行装置、照明、残影记录仪、相位转换器）。全角标点。尽量简短。

## Fixed terms (use consistently across every key)
| Korean | en | ja | zh |
|---|---|---|---|
| 인수인계 실험 (title) | The Handover Experiment | 引き継ぎ実験 | 交接实验 |
| 감독관 | Supervisor | 監督官 | 监督官 |
| 근무자 | worker | 作業員 | 作业员 |
| 근무 | shift | 勤務 | 班次 / 值班 |
| 출근 / 퇴근 | clock in / clock out | 出勤 / 退勤 | 上班 / 下班 |
| 인수 거부 | refuse handover | 引き継ぎ拒否 | 拒绝交接 |
| 쪽지 | note | メモ | 便条 |
| 관제 | control desk | 管制 | 控制台 |
| 관전 | watch | 観戦 | 观看 |
| 실험실 | lab | 実験室 | 实验室 |
| 공정 | stage | 工程 | 工序 |
| 회차 | run | 回目 | 第…轮 |
| 공정표 | run map | 工程表 | 工序表 |
| 기록 보관소 | archive | 記録保管庫 | 档案室 |
| 산재 | accident (work injury) | 労災 | 工伤 |
| 결재 / 승인 | approval / approved | 決裁 / 承認 | 审批 / 批准 |
| 출입 카드 | access card | 入館カード | 门禁卡 |
| 보행 보조 장치 | walking assist | 歩行補助装置 | 助行装置 |
| 조명 | light | 照明 | 照明 |
| 잔상 기록기 | echo recorder | 残像記録器 | 残影记录仪 |
| 위상 이동기 | phase shifter | 位相移動器 | 相位转换器 |
| 청 / 적 (phase) | blue / red | 青 / 赤 | 蓝 / 红 |
| 단말기 | terminal | 端末 | 终端 |
| 퇴근 레버 | exit lever | 退勤レバー | 下班拉杆 |
| 출입증 | ID badge | 入館証 | 工作证 |

## Mechanics of the dictionary
- Keys are the exact Korean strings. Values are your translation. Keep every `{name}` slot exactly (same names, may move). Keep `{}` (bare braces) in directive templates — it is the word slot. Keep `\n` line breaks if present, and leading/trailing spaces or punctuation that join pieces (` · `, `: `, `→`).
- Keyboard hints like "E:", "N 키", "(M)" — keep the key letter; translate "키" ("key" / "キー" / "键").
- Circled numbers ①②③, arrows, ⚡ stay.
- Some keys are fragments joined by code with " · " — translate each as a standalone label.
- 결재 (the console's approval-box title) is drawn vertically, one character per row, max 3 characters: en "OK", ja "決裁", zh "审批".
- Lab names are poetic short titles (입사 "Day One"-ish, 상자, 서명, 퇴근, 교대 순서, 안전 매트, 갈라진 기호, 잔상 안무, 위상 낙하). Translate as short evocative titles, 1–3 words.
- Korean has particles that hide grammatical number/gender; choose neutral phrasing. Never assign a gender to the player or the Supervisor (en: "they"/"you"; avoid he/she).
- When the Korean is ambiguous, read the location in `i18n/keys.json` (file:line) and the surrounding code before translating.
