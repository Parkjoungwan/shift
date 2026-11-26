# 퍼즐 깊이·난이도 설계 이론 — 맵 크기·조작 실력이 아닌 "생각의 깊이"로 어렵게 만들기

> 범위: 퍼즐 플랫포머 / 능력 게이트 방. 장르 숙련자가 "한눈에 꿰뚫어 보는" 방을 진단하고, 연역·숨은 상태·오도·가치 있는 시행착오를 더하는 기법.
> 대상 게임 맥락: 40×20 단일 화면 방, 60초 교대, 도구 5종(출입카드 / 고점프 보조 / 숨은 발판·UV 문양을 드러내는 조명 / 마지막 8초를 유령으로 재생하는 에코 레코더 / 청·적 블록 전환 위상기), 다음 작업자가 월드 상태를 이어받음, 관제석은 도면을 봄.
> 표기: "Cited Findings"는 출처가 있는 사실만, "Inferences"는 우리 게임 적용을 포함한 추론. 2차 요약·검색 스니펫에서만 확인된 내용은 그렇다고 표시함.
> 조사 한계: GMTK 영상, Hazelden·Teikari·Grant·Traynor 강연은 녹취를 직접 읽지 못했다(영상·이미지 슬라이드). 해당 내용은 2차 요약에 의존하며 각 항목에 표시함.

---

## Q1. 원리: "통찰(aha)" vs "실행", 그리고 명명된 설계 원칙들

### Takeaway
좋은 퍼즐의 깊이는 크기나 조작이 아니라 **"캐치(catch)" — 뻔해 보이는 해법이 실패하는 논리적 모순 — 와 그것을 푸는 "드러남(revelation)"** 에서 나온다. 설계자들(Blow, ten Bosch, Traynor, Teikari)은 공통적으로 "규칙 시스템이 이미 품고 있는 의외의 진실을 찾아 가장 깨끗하게 보여줘라"고 말하며, 인지심리학의 통찰 연구(표상 변화 이론)는 이 aha가 **암묵적 가정(제약)의 해제와 지각 덩어리(chunk)의 분해**로 일어난다고 설명한다.

### Cited Findings

**캐치 / 드러남 / 가정 깨기 (GMTK, Mark Brown)**
- GMTK "What Makes a Good Puzzle"의 구성 요소는 메커닉(규칙과 한계), 캐치, 드러남, 제시(presentation), 난이도 곡선이다. 좋은 퍼즐은 "캐치" — 논리적 모순 — 를 중심으로 만들어지며, 강한 퍼즐은 흔히 **뻔한 해법이 있어 보이지만 그게 실패**해서 플레이어가 그 가정을 버리고 멘탈 모델을 재구성하게 만든다. — [hamatti 노트(GMTK 2차 요약)](https://notes.hamatti.org/gaming/puzzle-game-design)
- 목표는 명확해야 한다; 도전은 "무엇이 목표인가"가 아니라 "어떻게 도달하나"를 알아내는 데 있어야 한다. 퍼즐에 필요한 만큼의 요소만 쓰라. — [hamatti 노트(GMTK 요약)](https://notes.hamatti.org/gaming/puzzle-game-design)
- 캐치는 플레이어를 바보처럼 느끼게 하고, 드러남은 천재처럼 느끼게 한다는 것이 Brown의 요지라고 Kotaku AU가 요약. (검색 스니펫으로만 확인, 원문 페이지는 404) — [Kotaku AU](https://www.kotaku.com.au/?p=863140)
- Lara Croft GO의 타일 메커닉: 처음엔 적을 처리하는 해법으로 보였다가 나중에 그 해법이 뒤집힌다(GMTK 예시). "Double take" 설계는 플레이어가 잘못된 가정 위에서 행동하도록 속인다("How These Puzzles Deceive You" 영상). — [hamatti 노트](https://notes.hamatti.org/gaming/puzzle-game-design)
- GMTK 영상 자료 목록에 Stephen's Sausage Roll(increpare, 2016)이 포함돼 있음. — [Amara GMTK 페이지](https://amara.org/v/C3BEg/)

**Blow & ten Bosch, "Designing to Reveal the Nature of the Universe" (IndieCade 2011)**
- 강연 요지: "이 진실들을 가장 깨끗한 방식으로 표현하는 시스템을 찾는 것을 중시하는 게임 디자인 미학"; 행동이 일어나면 무엇이 일어나는지, 패턴이 가능한 결과들에 걸쳐 어떻게 표현되는지 시스템 구조를 탐색해 "핵심 아이디어"를 찾는다. 전통적 **조합적(combinatoric) 설계 기법과 대비**됨. — [Marc ten Bosch 블로그](https://marctenbosch.com/news/page/13/)
- Blow: 규칙의 의외성(surprise)은 규칙 안에 머무를 때 "매우 가치 있다". "Surprise is sort of the same thing as the information content of a message"(놀라움 = 메시지의 정보량). 예: VVVVVV의 "Veni Vidi Vici". — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- Blow: Braid에서 시간 조작을 월드의 **모든 오브젝트에 대해 시험**했다(불완전한 시험은 불완전한 답을 낳으므로). Witness의 "선은 자기 자신을 가로지를 수 없다" 규칙은 사전에 정한 게 아니라 "탐색에서 나왔다". — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- **Braid World 4 열쇠 사례(규칙 예외의 일관된 확장)**: 왼쪽으로 달릴 때(시간 역행) 열쇠는 되감기에서 면제된다. Blow는 이를 일관되게 유지했고, 나중에 열쇠가 면제되지 *않는* 퍼즐을 배치했다. 그는 이것이 "말이 되지만" 플레이어가 알아내기 "매우 어려울 수 있다"고 말함. — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- Blow: "I will get rid of fun if it means I can get at something deeper or more complete." — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)

**Patrick Traynor (Patrick's Parabox), "System-Centric Puzzle Design" (GDC 2024)**
- 슬라이드(검색 스니펫 기준): 목표는 "showcase/communicate, not challenge/stump"(보여주고 전달하라, 막히게 하지 마라); 기법으로 퍼즐을 가능한 한 단순화. 영향원으로 Brett Taylor, Jonathan Blow 인용. — [GDC 슬라이드 PDF](https://media.gdcvault.com/gdc2024/Slides/GDC+slide+presentations/Traynor_Patrick_SystemCentricPuzzle.pdf) (슬라이드가 이미지라 본문 직접 확인 불가; 검색 스니펫 의존)
- 인터뷰 요약: 시스템의 자연스러운/유기적 행동을 우선하고 임의적 선택이나 인위적 단순화를 피함; Blow의 "Truth in Game Design" 강연 영향. — [Gamasutra/Game Developer 인터뷰(스니펫)](https://gamasutra.com/design/patrick-s-parabox-)

**Arvi Teikari (Baba Is You)**
- GDC 2020 "Reading the Rules of 'Baba Is You'"는 문장 기반 규칙 시스템의 구현과 반복을 다룸. — [GDC Vault](https://gdcvault.com/play/1026590/Reading-the-Rules-of-Baba)
- GMTK "How Baba Is You Makes Brain Busting Puzzles": Teikari는 해법(또는 메커닉)에서 **거꾸로** 퍼즐을 설계한다; 튜토리얼 없이 초반 퍼즐이 필요에 의해 가르친다. — [hamatti 노트(GMTK 요약)](https://notes.hamatti.org/gaming/puzzle-game-design)
- Teikari: 플레이어가 "trust their intuition about what should happen"하게 하려 했다; "some of the rules have to work in slightly different ways"(규칙 우선순위). — [MCV/Develop](https://mcvuk.com/when-we-made-baba-is-you/)
- Teikari: "Snakebird by Noumenon Games is probably the singular title that has most affected Baba Is You's design." (검색 스니펫 인용, 원문 fetch 실패) — [Red Bull 인터뷰](https://www.redbull.com/ng-en/baba-is-you-interview)

**Elyot Grant (Islands of Insight, Lunarch)**
- GDC 2021 "30 Puzzle Design Lessons From The World's Greatest Puzzle Communities". — [GDC Vault](https://gdcvault.com/play/1027306/30-Puzzle-Design-Lessons-From)
- 2차 요약: "유레카 순간은 퍼즐의 원자"이며, 퍼즐은 유레카를 숨긴 것이라는 정의를 Grant에게 귀속(검증 불가한 2차 출처라고 검색 결과에서도 경고). 2025 GDC 슬라이드는 "forward design" — 해결자가 경험할 순서대로 논리 단계를 배치하는 방법 — 을 설명(검색 스니펫). — [Grant GDC 2025 슬라이드](https://media.gdcvault.com/gdc2025/Slides/Grant_Elyot_Designing+10%2C000+Puzzles.pdf)
- **아포리아(막힘)는 유레카를 약속할 때만 가치가 있고, 그 약속엔 신뢰가 필요하다**: 규칙·상호작용·결과·목표가 불명확하면 신뢰가 깨진다; 지금 풀 수 있는지, 어떤 아이템이 관련 있는지, 버그인지 의심하게 되면 실패. Witness는 신뢰를 점진적으로 쌓아서 예외적으로 성공. (Grant "30 Lessons Extended Director's Cut" 기반 노트) — [diplograph 노트](https://diplograph.net/notes/games/puzzle-design/aporia-requires-trust)

**Zachtronics (Zach Barth) — 열린 해법**
- SpaceChem 포스트모템: 열린 해법 퍼즐이 "unquestionably the biggest thing we did right". 퍼즐을 해법 없이 설계할 수 있어 "chicken-and-egg problems"(퍼즐과 해법을 동시에 설계하는 문제)를 피함. 플레이어는 자기 해법에 "sense of ownership"을 느낌; 일부에겐 "intimidating". — [Game Developer 2012](https://gamedeveloper.com/design/the-secret-to-i-spacechem-i-s-success-open-ended-puzzles)
- GDC 2019 "Open-Ended Puzzle Design at Zachtronics"(Drew Messinger-Michaels 대담). — [GDC Vault](https://gdcvault.com/play/1025715/Open-Ended-Puzzle-Design-at)
- 반대 관점: Tom Francis(Gunpoint)는 열린 퍼즐이 "too easy", 꽉 조인 퍼즐은 제약감; **열린 레벨 안에 중첩된 퍼즐**이 가장 잘 됐다. — [Saturday Paper, Cook 2013](https://www.gamedeveloper.com/business/the-saturday-paper-goldilocks-and-the-three-puzzles)

**Brett Taylor (Linelight) — 노이즈와 "solution sentence"** (모두 hamatti 2차 요약)
- 노이즈 = 퍼즐 해결에 도움 안 되면서 플레이어의 작업 기억을 쓰는 모든 것; 레드 헤링은 플레이어의 첫 가정을 엉뚱한 방향으로 이끄는 노이즈. 노이즈 0에서 시작해 의도적으로 추가하라. 초보는 작업 기억 여유가 적다.
- "Solution sentence": 해법을 한 문장으로 쓰고 그것을 구현하는 가장 단순한 퍼즐을 찾아라.
- 사고로 풀려야지 시행착오로 풀리면 안 된다; 해법을 알고도 실행 못 하는 건 좌절; 필요한 기술 종류를 일관되게(민첩성이 필요 없던 게임에서 갑자기 요구하지 말 것). "Player perception is all that's real."
- — [hamatti 노트](https://notes.hamatti.org/gaming/puzzle-game-design)

**Tom Hermans, "How to make a good puzzle — an explorable explanation" (2018)**
- "A good puzzle shows all puzzle pieces", "a good puzzle wants to be solved", 최소 공간·최소 조각; 동시에 "Puzzles should be a little bit inaccessible"(신비감). 레드 헤링 = 관련 있어 보이지만 필요 없는 요소 → 잡동사니; 대안은 **처음엔 쓸모없어 보이다 예상 밖 방식으로 쓰이는 오브젝트**. "Once you know how to solve a Sudoku, you've solved them all." — [Game Developer](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)

**인지과학: 통찰의 메커니즘**
- Knoblich, Ohlsson, Haider, Rhenius(1999) 표상 변화 이론: 통찰은 (1) **제약 해제(constraint relaxation)** — 처음 고려하는 선택지를 제한하던 지식 요소의 비활성화, (2) **덩어리 분해(chunk decomposition)** — 지각 덩어리의 구성 요소 분리. 성냥개비 산수 문제로 4개 실험. 단단한(tight) 덩어리를 분해해야 하는 문제가 느슨한 것보다 덜 풀렸고, 범위가 좁은 제약일수록 해제되기 쉽다. 제약 해제는 의도적·자발적이지 않다. — [Knoblich et al. 1999 PDF](https://www.kognition.uni-koeln.de/literature/Knoblich_etal_1999.pdf); [CEU 서지](https://research.ceu.edu/en/publications/constraint-relaxation-and-chunk-decomposition-in-insight-problem-/)

### Inferences
- **"한눈에 읽히는 방" 진단 공식**: 숙련자가 화면을 보는 순간 떠올리는 "첫 해법"이 그대로 통하면 캐치가 없는 것이다. 각 방에 대해 "숙련자의 첫 가정은 무엇이고, 그것은 왜 실패하는가?"를 한 문장(Taylor의 solution sentence의 쌍, 즉 **false-solution sentence**)으로 쓸 수 없으면 그 방은 깊이가 없다.
- 표상 변화 이론의 실무 번역: 숙련자가 단단하게 묶어 보는 "덩어리"(예: "청 블록 줄 = 벽", "버튼 = 내가 밟는 것", "보이는 발판 = 전부")를 하나 골라 그 덩어리를 쪼개야 풀리게 만들면 숙련자일수록 막히는 방을 만들 수 있다. 우리 도구로는: 에코 유령이 "나 대신 버튼을 누르는 존재"라는 덩어리를 깨서 "유령이 무게추/적의 미끼/위상 전환 타이밍 기록기" 역할을 하게 하기; 위상기를 "길을 여는 것"이 아니라 "떨어지는 플레이어를 받치는 바닥을 만드는 것"으로 쓰게 하기.
- Blow의 "모든 오브젝트에 대해 규칙을 시험하라" → 도구 5종 × 월드 요소(문, 버튼, 청/적 블록, 숨은 발판, UV 문양, 이전 작업자의 흔적) 교차표를 만들어 아직 쓰지 않은 칸이 곧 "새 드러남" 후보. Braid 열쇠처럼 "면제 규칙이 나중에 면제되지 않는" 칸이 가장 강력하다(예: 에코 유령은 위상 블록을 통과하는가? 조명이 비친 숨은 발판은 유령도 밟을 수 있는가?).
- Traynor의 "showcase, not stump"와 우리 목표(숙련자도 막히게)는 긴장 관계. 해소책: **막힘은 시스템의 진실 때문이어야 하지 조작·숨은 임의 규칙 때문이면 안 된다**(Grant/diplograph의 신뢰 조건).

### Gaps
- GMTK "What Makes a Good Puzzle" 원문 녹취, Hazelden의 강연("one idea per puzzle", false solutions)과 Lavelle의 직접 발언은 1차 출처를 찾지 못함. Hazelden이 "한 퍼즐 한 아이디어"를 주장했다는 것은 널리 알려졌지만 이번 조사에선 검증하지 못했다.
- Grant의 30개 교훈 전체 목록, Traynor 슬라이드 본문(이미지 PDF), Teikari의 레벨 디자인 강연(Mixit 등) 본문 미확인.

---

## Q2. 전부 보이는 방에서 해답을 숨기는 법 — 숨은 상태, 도구별 정보, 실험으로 추론할 규칙, 교대 간 상태, 오도하는 어포던스, 실패로 발견하는 예외

### Takeaway
"모든 조각을 보여줘라"(Hermans)와 "숨겨라"는 모순이 아니다: **조각은 보여주되, 조각의 의미·상호작용·과거 상태는 추론 대상으로 남긴다.** 숨김이 공정하려면 (a) 규칙은 일관되고(Braid 열쇠), (b) 플레이어가 "이건 풀 수 있다"고 신뢰할 수 있어야 한다(아포리아-신뢰). 레드 헤링은 순수 잡동사니면 해롭고, "처음엔 무관해 보이다 다른 용도로 쓰이는 요소"일 때 가치가 있다.

### Cited Findings
- 숨기면 학습이 어려워진다 — "a good puzzle shows all puzzle pieces"; 1인칭보다 탑다운처럼 분석하기 쉬운 표현을 고르라. 그러나 동시에 퍼즐은 "조금은 접근하기 어려워야" 신비감이 생긴다. — [Hermans, Game Developer](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)
- 신뢰 붕괴 요인: 불명확한 규칙·상호작용·결과·목표, "지금 풀 수 있는 건가, 나중인가", "어떤 아이템이 관련 있나", "외부 지식이 필요한가", "버그인가". — [diplograph(Grant 기반)](https://diplograph.net/notes/games/puzzle-design/aporia-requires-trust)
- 레드 헤링: 비율 권고가 출처마다 충돌(단서 4개 중 1개 vs 1:3) — 검색 요약 수준, 신뢰 낮음. 레드 헤링이 풀이 경험을 지배하면서도 설계자에겐 보이지 않는다는 비판도 있음. — [WebSearch 결과 요약; 원 출처 미확정, Game Developer "How to make a good puzzle" 및 포럼들](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)
- Mario "트롤 레벨" 장르: 플레이어가 뻔한 길을 따라가다 함정에 빠지고, 다른 걸 시도하면 또 다른 함정 — 연쇄 반전. (Defender의 트롤 레벨 가이드 링크) — [hamatti 노트](https://notes.hamatti.org/gaming/puzzle-game-design)
- Braid: 열쇠의 되감기 면제라는 숨은 규칙을 일관되게 유지한 뒤, 면제가 적용되지 않는 상황을 퍼즐로 사용 → 공정하지만 매우 어려움. — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- Hazelden(Cosmic Express): 플레이테스터가 2레벨의 규칙을 알아차리는 데 5분 걸렸지만 규칙을 유지 — "nope, this is not unfair, you just have to pay attention to what's happening". **관찰로 추론해야 하는 규칙**을 의도적으로 남긴 사례. — [Electron Dance, "Dead in the Water", Goodwin 2018](https://www.electrondance.com/?p=13373)
- Witness: 해법이 환경 단서, 이전 퍼즐 해법, 오디오 기록에서 학습됨; 패널에서 그리던 선이 지형에도 있다는 걸 깨달을 때 발견되는 **숨은 환경 퍼즐** 부류가 있다(검색 스니펫, 정확한 원 출처 매칭 불확실). Blow: "The key to these puzzles is in the player's head." — [GamesRadar](https://www.gamesradar.com/witness-all-about-understanding-puzzles-says-blow-next-game-will-be-traditional); 환경 퍼즐 공간은 Fletcher Studio가 3년간 설계 — [Fletcher Studio](https://www.fletcher.studio/blog/2017/5/26/the-witness-designing-video-game-environments)
- Outer Wilds: 능력 대신 "collect knowledge about the world"만으로 진행; 절차적 위험 회피에서 "clue and knowledge based structure"로 전환. — [GamesRadar](https://www.gamesradar.com/the-making-of-outer-wilds); [Chris Lawn 인터뷰 2019](https://chris-lawn.squarespace.com/articles/2019/10/14/outer-wilds-has-always-been-a-rad-idea)
- 의도치 않은 지름길(unintended solution)은 퍼즐이 가르치려는 개념을 우회한다; 인간 설계자는 통과 불가 바위로 막지만, 생성기는 구성 요소 배치 자체로 지름길을 불가능하게 할 수 있다(Refraction, ASP). — [Saturday Paper, Cook 2013](https://www.gamedeveloper.com/business/the-saturday-paper-goldilocks-and-the-three-puzzles)
- Teikari: 테스트 결과 "almost every single level I made had at least one alternative way to solve the level"; 일부 대안 해법이 너무 좋아 그 해법 전용 새 레벨을 만듦. — [MCV/Develop](https://mcvuk.com/when-we-made-baba-is-you/)

### Inferences (우리 게임 적용 — 추론)
- **숨은 상태 유형과 도구 매핑**
  1. *도구 한정 정보*: 조명만이 숨은 발판·UV 문양을 보여준다 → 조명 담당이 아닌 교대자는 **이전 작업자/관제석의 기록**에 의존해야 함. UV 문양이 "다음 교대자가 쓸 위상 순서"나 "카드 문 번호"를 담으면 정보가 도구 간·교대 간으로 흐른다.
  2. *카운터/타이머 숨은 상태*: 버튼이 N번째 눌림에만 반응, 문이 마지막 활성화 후 T초 뒤 닫힘 등. Hazelden 사례처럼 "보면 알 수 있는" 신호(깜빡임 횟수, 소리)는 반드시 화면에 존재해야 공정(신뢰 조건).
  3. *실험으로 추론할 규칙*: 위상 전환 시 블록 안에 있던 오브젝트(유령, 플레이어)는 어떻게 되나? — 규칙을 텍스트로 알려주지 말고 저비용 실험 지점(안전한 테스트 구역)을 방 한쪽에 둔다.
  4. *교대 간 다단계 상태*: 앞 사람이 남긴 위상 상태·열린 문·녹음된 유령이 다음 사람의 시작 조건. "지금 보이는 상태는 누군가의 결정의 결과"라는 사실 자체가 숨은 정보(왜 이 상태인가?)를 만든다.
  5. *오도하는 어포던스*: 고점프 보조로 바로 닿을 것 같은 높은 출구 → 사실은 위상 블록 천장이 적색 상태일 때만 통로가 열림. 숙련자의 "높은 곳 = 고점프" 덩어리를 깨는 Lara Croft GO형 반전.
  6. *실패로 발견하는 예외*: Braid 열쇠식 — 규칙 A가 확립된 뒤 A가 적용되지 않는 일관된 하위 조건을 하나 만든다(예: 에코 유령은 버튼을 누르지만 카드 리더기는 못 연다 — 단, 이는 첫 방에서 실패로 보여줄 것).
- "모든 조각을 보여줘라" 원칙과의 타협: **조각(오브젝트)은 다 보이고, 상태·이력·도구별 레이어만 숨긴다.** 화면에 아예 없는 요소에 해법이 의존하면 신뢰가 깨진다.
- 레드 헤링은 잡동사니로 두지 말고 "두 번째 용도" 오브젝트로 설계(Hermans): 예컨대 쓸모없어 보이는 상자는 에코 유령이 밟고 설 받침대.
- 교대제 특유의 강점: **이전 작업자의 실패 흔적**(엉뚱하게 바뀐 위상, 잘못 열린 문)이 자연스러운 레드 헤링이자 단서가 된다. 단, 월드가 회복 불가 상태가 되지 않게 리셋/관제 개입 경로 필요.

### Gaps
- 오도형 어포던스·트롤 레벨의 공정성 한계에 대한 정량 연구는 찾지 못함.
- Animal Well, Fez, Tunic 등 숨은 레이어 게임의 설계자 1차 발언은 이번 조사에서 수집하지 못함(검증 필요).
- 레드 헤링 비율 권고는 출처 신뢰도가 낮고 서로 충돌.

---

## Q3. 실패를 정보로 만들기 — 가르치는 시행착오, 정보로서의 죽음, 싼 재시도 vs 비싼 실수, 처벌은 얼마나

### Takeaway
설계자들은 "사고로 풀려야지 시행착오로 풀리면 안 된다"(Taylor)고 하지만, 실무에서 명작들은 **언두/리셋을 공짜로 만들어 시행착오를 "실험"으로 바꾼다**(Snakebird, SSR). 핵심 구분은 *정보를 주는 실패*(각 실패가 규칙 하나를 드러냄)와 *정보 없는 실패*(실행 미스, 무작위). 처벌은 "탐색 비용"이 아니라 "실험 비용"에만 걸어야 한다.

### Cited Findings
- Taylor: 퍼즐은 시행착오가 아니라 사고로 풀려야 함; 해법을 알고도 실행 못 하는 건 좌절; 패턴 퍼즐을 무작위 실행과 섞지 말 것. — [hamatti 노트(Taylor 요약)](https://notes.hamatti.org/gaming/puzzle-game-design)
- Snakebird: 리뷰들은 시행착오나 운에 기대지 않는다고 평가하면서도, 개발사가 **언두 기능을 넣어 시행착오적 성격의 좌절을 줄였다**고 TIGSource가 언급(상반된 듯한 두 평가의 공존 = 언두가 시행착오를 실험으로 전환). 초반은 접근 쉬우나 후반은 "brutally hard"로 급상승. — [Wikipedia: Snakebird](https://en.wikipedia.org/wiki/Snakebird_(video_game)); [TIGSource](https://www.tigsource.com/?p=27012)
- Stephen's Sausage Roll: 리셋·되감기에 페널티 없음, 그러나 다음 구역으로 넘어가기 전 여유를 주지 않음(2차 리뷰성 출처); Guardian 리뷰는 Souls류보다 어렵다고 평함. 소시지를 격자 밖으로 밀면 떨어져 처음부터 다시 해야 함(HN 코멘트). — [Wikipedia: SSR](https://en.wikipedia.org/wiki/Stephen%27s_Sausage_Roll)
- Outer Wilds: 타임 루프 = 여러 번의 삶과 죽음에 걸친 지식 축적의 수단(죽음이 정보 수집 사이클). — [Game Developer](https://www.gamedeveloper.com/design/live-die-repeat-how-i-outer-wilds-i-piques-curiosity-in-an-ambivalent-solar-system)
- Cosmic Express: 매우 어려운 스테이지가 많지만 구조상 좌절스럽지 않음, 힌트 버튼 없음; 최종 Nova 7은 필수. — [Gamezebo 리뷰](https://www.gamezebo.com/the-best/cosmic-express-review-do-the-loco-martian/)
- Hermans: 가능성 공간이 크면 어렵지만 무작위 대입(brute force)도 막는다 — "double-edged sword". — [Game Developer](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)
- 표상 변화 이론: 제약 해제는 의도적이지 않다 → 막힘(impasse)과 실패 경험이 재표상을 촉발하는 조건. — [Knoblich et al. 1999](https://www.kognition.uni-koeln.de/literature/Knoblich_etal_1999.pdf)

### Inferences
- **60초 교대 = 비싼 재시도**: 우리 게임은 언두가 없고 시간이 유한하므로 "Snakebird식 공짜 실험"이 불가능. 따라서 (1) 방 안에 *저비용 실험 지점*(실패해도 상태가 돌아오는 구역)을 두고, (2) 실패 결과가 **월드 상태로 남아 다음 교대자에게 정보가 되도록** 설계하면 비싼 실패가 "공유 지식"으로 환원된다(Outer Wilds의 루프 간 지식 축적을 사람 간으로 옮긴 형태).
- 실패 유형 점검표: 각 실패 시 플레이어가 "무엇을 배웠는지" 한 문장으로 말할 수 있어야 함. 말할 수 없으면(실행 미스, 판정 애매) 그 실패는 제거 대상.
- 처벌 수준: 실행 실수(점프 1픽셀 차)는 즉시·무벌 재시도, 개념 실수(잘못된 위상 순서)는 상태가 남는 중간 처벌 — "생각에 대한 비용"만 청구.
- 에코 레코더는 그 자체로 "실패 재생기": 실패한 8초가 유령으로 남아 원인 분석 도구가 되도록 연출하면 실패가 정보가 됨.

### Gaps
- "얼마나 처벌해야 재밌나"에 대한 정량 데이터나 설계자 수치 기준은 찾지 못함.
- Celeste/Super Meat Boy의 즉시 리스폰 설계자 발언은 이번 조사에서 미수집(일반 지식으로는 알려져 있으나 검증 필요).

---

## Q4. 시간에 걸친 관찰(패턴·주기·타이밍 창) & 정보가 과거에만 있는 퍼즐

### Takeaway
"관찰로 알아내는 규칙"은 정당한 깊이의 원천이며(Hazelden: 공정하다, 주의를 기울이면 된다), 시간 차원은 정적인 화면을 깨는 가장 직접적인 수단이다. Braid(시간 조작)와 Outer Wilds(루프 간 지식)는 **정보가 과거에 있거나 시간에 걸쳐서만 드러나는** 구조의 대표 사례. 우리 게임의 교대 릴레이는 "과거 플레이어의 행동"이라는 희소한 정보원을 기본 내장하고 있다.

### Cited Findings
- Hazelden: 테스터가 5분 걸려 알아챈 규칙을 유지 — "you just have to pay attention to what's happening". — [Electron Dance, Goodwin 2018](https://www.electrondance.com/?p=13373)
- Braid: 시간 되감기 메커닉과 오브젝트별 예외(열쇠) — 규칙이 시간 축에서 어떻게 표현되는지를 탐색해 퍼즐을 찾음; ten Bosch는 Braid가 현실의 측면을 드러낸다고 언급. — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process); [ten Bosch 블로그](https://marctenbosch.com/news/page/13/)
- Outer Wilds: 22분 루프마다 리셋되지만 플레이어 지식만 남음; "knowledge about the world"만 수집. — [GamesRadar](https://www.gamesradar.com/the-making-of-outer-wilds); [Game Developer](https://www.gamedeveloper.com/design/live-die-repeat-how-i-outer-wilds-i-piques-curiosity-in-an-ambivalent-solar-system)
- Beachum: "teach them without forcing them to learn"이 핵심 과제(검색 스니펫, 2016 Mobius 인터뷰). — [Mobius Digital](https://www.mobiusdigitalgames.com/news/separating-the-signal-from-the-noise)
- Witness: 해법이 이전 퍼즐 해법·환경·오디오에서 학습됨 — 이전 경험이 현재 퍼즐의 정보원. — [GamesRadar](https://www.gamesradar.com/witness-all-about-understanding-puzzles-says-blow-next-game-will-be-traditional)

### Inferences (적용 아이디어)
- **주기 관찰형**: 위상 블록이 자동 주기로 전환되는 구역 + 주기가 단순하지 않음(예: 청3초-적2초-청1초 반복). 60초 중 첫 10초를 "관찰"에 써야 하는 방 → 실행이 아니라 관찰 투자 vs 시간 압박 딜레마.
- **과거에만 있는 정보**:
  - 이전 교대자의 에코 유령(마지막 8초)이 다음 교대 시작 시 재생된다면, 그 유령의 동선이 "이 방의 숨은 발판 위치"를 암시(조명 없이 걸었던 자리). 
  - UV 문양은 조명 교대자만 볼 수 있으므로, 관제석 메모/도면 표기가 유일한 전달 수단 → "정보가 과거 사람의 머릿속에만 있다".
  - "이 문은 언제 닫혔나?" 타이머 상태가 이전 교대에서 시작됐다면, 현재 교대자는 남은 시간을 단서(깜빡임 속도)로 추론해야 함.
- **에코 레코더 = 시간 퍼즐의 핵심**: 8초 녹화 창은 강한 제약. "8초 안에 버튼 A를 누르고 동시에 내가 B에 있어야 함" 같은 동기화 퍼즐은 관찰·계획 비중이 크고 조작 비중을 낮출 수 있음(유령 경로는 걷기만으로 구성).
- 관찰형 방의 공정성 조건: 패턴은 화면 안에서 완전히 관찰 가능해야 하며(신뢰), 한 주기 길이가 60초 교대의 1/4 이하가 되도록.

### Gaps
- "다른 플레이어의 과거 행동이 정보원"인 비동기 협동 퍼즐(예: Dark Souls 메시지/유령, Death Stranding)에 대한 설계자 발언은 수집하지 못함.
- 타이밍 창 길이와 체감 난이도의 정량 관계 데이터 없음.

---

## Q5. 난이도 곡선, "통찰의 경사", 소개 방 → 비틀기, 메커닉의 "두 번째 반쪽"

### Takeaway
설계자 공통 구조는 **소개(단독) → 강화 → 결합 → 반전(subversion)**. 메커닉의 "첫 반쪽"은 직관적 용도, "두 번째 반쪽"은 그 메커닉이 시스템 안에서 갖는 덜 뻔한 함의(Braid 열쇠, Lara Croft GO 타일)다. 숙련자 대상 난이도는 방 크기가 아니라 **필요한 재표상 횟수**(뒤집어야 할 가정의 수)로 올린다.

### Cited Findings
- 메커닉은 따로 소개 → 강화 → 결합; "No puzzle lives in isolation from the others"; 매 레벨은 새로운 무언가를 도입해야 함("Once you know how to solve a Sudoku, you've solved them all"). — [Hermans, Game Developer](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)
- 난이도는 이전 교훈 위에 점진적으로 상승(GMTK); 몰입은 불안(너무 어려움)과 지루함 사이 균형, 초보는 작업 기억 여유가 적으니 초반 노이즈를 줄여라(Taylor); 각 레벨이 왜 존재하는지 물어라 — 메커닉 교육 / 기술 강화 / 고유한 순간 / 페이싱. — [hamatti 노트](https://notes.hamatti.org/gaming/puzzle-game-design)
- Lara Croft GO: 처음엔 적 처리 해법이었던 타일이 나중엔 그 해법이 뒤집힘 — 소개 후 비틀기의 예. — [hamatti 노트(GMTK)](https://notes.hamatti.org/gaming/puzzle-game-design)
- Braid: 확립된 면제 규칙(열쇠)의 비적용 상황을 나중 퍼즐에 배치. — [Game Developer, Kumar 2011](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- Teikari: Baba는 튜토리얼 없이 초반 퍼즐이 필요로써 가르친다. — [hamatti 노트(GMTK)](https://notes.hamatti.org/gaming/puzzle-game-design)
- 반대 압력: 너무 느린 초반은 숙련자를 잃는다 — Blow가 Recursed에 대해 "it seemed really slow / simple"이라 트윗; Tricone Lab의 Josh Singer는 추상적 설계라 플레이어가 "almost nothing of use"를 가져오므로 도입을 느리게 했다고 반론. Goodwin: 설계자는 플레이어를 지루함보다 **좌절 쪽(skill < challenge)으로 미는 편향**이 있다. — [Electron Dance, Goodwin 2018](https://www.electrondance.com/?p=13373)
- Snakebird: 초반은 메커닉 소개로 접근 쉬우나 난이도 급상승; Electron Dance 비평가는 하드코어용 설계라 평가. — [Wikipedia: Snakebird](https://en.wikipedia.org/wiki/Snakebird_(video_game)); [Electron Dance](https://www.electrondance.com/?p=13654)
- Gunpoint(Tom Francis): 열린 레벨 안에 중첩된 꽉 조인 퍼즐이 균형점. — [Saturday Paper, Cook 2013](https://www.gamedeveloper.com/business/the-saturday-paper-goldilocks-and-the-three-puzzles)
- 표상 변화 이론: 범위가 넓은(일반적) 제약일수록, 단단한 덩어리일수록 해제가 어렵다 → 난이도 레버. — [Knoblich et al. 1999](https://www.kognition.uni-koeln.de/literature/Knoblich_etal_1999.pdf)

### Inferences
- **"통찰의 경사"를 레버로 분해**: (1) 뒤집어야 할 가정의 수, (2) 그 가정의 "단단함"(장르 관습일수록 단단 — 예: "버튼은 내가 밟는다"), (3) 결합해야 할 도구/규칙 수, (4) 노이즈(Taylor) 양, (5) 관찰 필요 시간. 방 크기·점프 정밀도는 레버에서 제외.
- **숙련자 맞춤 설계 순서**: 소개 방은 숙련자에겐 1~2초면 지나가도록 짧게(지루함 회피), 대신 *같은 방 안에* 두 번째 반쪽을 숨겨 둔 "선택적 심화 출구"(Cosmic Express식 자기 선택 난이도; Gunpoint식 중첩 퍼즐)를 둔다.
- 도구별 "두 번째 반쪽" 후보(추론):
  - 출입카드: 문을 여는 것 → 문을 *닫아* 유령/블록의 경로를 막는 것, 또는 카드 사용 기록이 다음 교대의 단서.
  - 고점프: 높이 오르기 → 위상 블록이 생길 때 끼이지 않도록 공중 체류 시간을 쓰는 것.
  - 조명: 숨은 발판 보이기 → 비추는 동안만 발판이 존재(관찰이 상태를 바꿈), UV 문양이 정보 전달 매체.
  - 에코: 버튼 대신 누르기 → 무게추·동시 입력·과거 정보 기록·위상 전환 타이밍의 "시계".
  - 위상기: 길 열기 → 낙하 중 바닥 생성, 다른 교대자의 길을 의도치 않게 막음(교대 간 상호작용).

### Gaps
- "second half of a mechanic"이라는 표현 자체의 1차 출처(특정 설계자 명명)는 찾지 못함 — 일반화된 개념으로만 사용.
- Hazelden의 "한 퍼즐 한 아이디어"·"최소주의" 1차 인용 미확보.

---

## Q6. 난이도 측정과 숙련자용 보정 — 플레이테스트 지표, 예상 풀이 시간

### Takeaway
설계자는 자기 퍼즐의 난이도에 **구조적으로 눈멀어 있다**(Teikari, Goodwin). 구조적 지표(최소 해 단계 수, 가능성 공간)는 출발점일 뿐이고, 실제 보정은 **처음 보는 외부 테스터의 풀이 시간·막힌 지점·대안 해법 발견**으로 해야 한다. 숙련자 보정은 "숙련자의 첫 시도가 실패하는가"를 별도로 측정해야 한다.

### Cited Findings
- 최소 해 단계 수는 난이도의 좋은 척도; 가능성 공간이 클수록 어려움; 그러나 실제 체감은 플레이테스트가 필요. — [Hermans, Game Developer](https://www.gamedeveloper.com/design/how-to-make-a-good-puzzle---an-explorable-explanation)
- Teikari: "it's very easy for that designer to become blind to a lot of the difficulty"; 접근 가능하게 하려 했지만 "I feel that I failed in a sense, as the game is still considered extremely difficult." 거의 모든 레벨에 대안 해법이 있어 많은 수정. — [MCV/Develop](https://mcvuk.com/when-we-made-baba-is-you/)
- Goodwin: 이미 플레이한 사람은 해답을 알기 때문에 설계자는 퍼즐을 잘 테스트하지 못한다. — [Electron Dance 2018](https://www.electrondance.com/?p=13373)
- Tyroller: 퍼즐은 설계자가 아닌 사람의 반복 플레이테스트가 필요. Taylor: "Was that right…?", "Oh, I solved it?" 같은 반응은 해법이 모호하다는 적신호. — [hamatti 노트](https://notes.hamatti.org/gaming/puzzle-game-design)
- Hazelden: 테스터 반응을 보고도 의도한 관찰 규칙은 유지; 초반에 그만두는 사람은 "probably wouldn't have enjoyed the rest of the game anyway". — [Electron Dance 2018](https://www.electrondance.com/?p=13373)
- Draknek & Friends: 거의 누구에게나 맞는 난이도를 목표로, 플레이어가 원하는 난이도 퍼즐로 자기 주도적으로 가게 함(팟캐스트 스니펫, 정확한 에피소드 미확정). — [Zencastr 팟캐스트](https://zencastr.com/z/B51_308L)
- 수동 레벨 설계는 메커닉을 신중히 생각하고, 철저히 플레이테스트하고, 여러 변형을 반복하는 과정; 원치 않는 해법을 제약으로 표현해 자동 배제하는 ASP 접근. — [Smith et al. 2013 (UW GRAIL)](https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf); [Saturday Paper](https://www.gamedeveloper.com/business/the-saturday-paper-goldilocks-and-the-three-puzzles)
- 표상 변화 이론의 계산 복잡도 분석: RCT 하에서 해 찾기는 다항 시간 불가(ICCM 2012) — 통찰 난이도가 탐색 공간 크기와 다른 축임을 시사. — [ICCM 2012 논문](https://iccm-conference.neocities.org/2012/proceedings/papers/0033/paper0033.pdf)

### Inferences (측정 프로토콜 제안)
- **방별 기록 지표**: 첫 진입~첫 의미 있는 행동까지의 시간(관찰 시간), 첫 시도 성공률(숙련자 그룹 분리), 실패 횟수와 *실패 유형*(개념 vs 실행), 막힘 지점(같은 위치 반복 사망/정지), 대안 해법 발견률, 풀이 후 "어떻게 풀었는지 한 문장 설명" 일치율.
- **"한눈에 읽힘" 테스트**: 숙련자에게 방 스크린샷만 5초 보여주고 해법을 말하게 한다. 맞히면 그 방은 캐치가 없다(통찰 퍼즐이 아니라 실행 과제).
- **숙련자 보정 목표치(추론)**: 숙련자 첫 시도 성공률이 높은 방은 "소개 방"으로 재분류, 심화 방은 숙련자도 첫 가정이 실패해야 함. 60초 제약상, 한 교대에서 완결 불가능한 방은 의도적으로 "릴레이 방"으로 표기하고 교대 간 정보 전달 성공률을 별도 지표로 측정.
- 설계자 맹목 보정: 원 설계자가 아닌 팀원이 각 방을 "처음 보는 사람" 상태에서 1회만 테스트(재사용 불가 테스터 자원으로 관리).
- 서버 로그 활용: 온라인 릴레이이므로 방별 체류 시간·사망 위치 히트맵·도구별 성공률을 자동 수집 가능.

### Gaps
- 공개된 퍼즐 게임의 방별 풀이 시간 분포·숙련자/초보 비교 데이터, 혹은 Zachtronics 히스토그램이 난이도 보정에 쓰였다는 1차 근거는 찾지 못함.
- "숙련자용 보정"에 대한 설계자의 체계적 방법론(예: Draknek의 테스터 운영 방식) 1차 자료 미확보.
- 미검증 예시(검증 필요, 이번 세션에서 출처 미확보): Braid "Fickle Companion"류 레벨, Witness의 환경 퍼즐 세부, Celeste의 즉시 리스폰 철학, Animal Well·Fez의 숨은 레이어, Hazelden의 "one idea per puzzle" 발언, Stephen Lavelle의 직접 설계 발언.
