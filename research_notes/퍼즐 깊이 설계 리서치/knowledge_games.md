# 지식 게임(Metroidbrainia) 설계 기법 — SHIFT용 차용 노트

> 대상: Tunic, Fez, Outer Wilds, Return of the Obra Dinn, The Witness, Chants of Sennaar, Blue Prince, Lorelei and the Laser Eyes, Lingo, Heaven's Vault, Toki Tori 2
> 맥락: 60초 교대 1인 1도구, 앞 교대 리플레이 시청, 손그림 메모, "관제실" 플레이어는 도식도+고정 어휘 표지판.
> 조사일 2026-11-16. 웹 도구 약 19회 호출. 일부 1차 자료(GDC Vault 영상, Wireframe/Thinky Games 기사)는 로그인이나 403에 막혀 2차 요약에 의존함. 출처가 없는 기억 기반 서술은 각 절의 **Gaps**에 "미검증"으로 분리함.

---

## Q0. 정의: "지식이 곧 진행"이란 무엇인가 (공통 배경)

### Takeaway
Metroidbrainia는 열쇠나 능력 대신 **플레이어의 머릿속 지식**이 문(gate)을 여는 비선형 탐험 게임이다. 그래서 "처음부터 할 수 있었는데 몰랐을 뿐"이라는 구조가 핵심이다. 용어 자체에는 이견이 있다(Information Games, database thriller, knowledge game 등).

### Cited Findings
- 정의: 비선형 탐험 게임으로, 지식이 다음 탐험을 열고 물리적 열쇠 대신 knowledge gate를 쓴다. 한 구역의 퍼즐을 풀면 전혀 다른 구역을 여는 지식을 얻는다. — [Thinky Games (검색 스니펫, 본문 403)](https://thinkygames.com/features/metroidbrainia-an-in-depth-exploration-of-knowledge-gated-games/)
- 다른 이름: "knowledge-gated games", "metroidvanias-of-knowledge", Tom Francis의 "Information Games". — [Nintendo Life](https://www.Nintendolife.Com/features/what-the-heck-is-a-metroidbrainia-introducing-the-newest-genre-on-the-block)
- Buckenham은 "metroidbrainia"라는 이름이 메트로배니아식 능력 게이트에 대한 기대를 끌어들인다고 비판하고, 더 좁은 범주로 "database thriller"(특정 서사를 이해하는 것만으로 진행)를 제안한다. — [V. Buckenham, "Database games"](https://blog.vbuckenham.com/database-games/)
- Toki Tori 2: 개발사는 메트로배니아라고 불렀지만, 진행에 필요한 새 능력을 한 번도 주지 않는다. 플레이어는 세계에 대해 아는 것만으로 진행한다. — [Worth Playing 2013](https://worthplaying.com/article/2013/7/3/news/89819-toki-tori-2-all-details-design-improvements); [Diehard GameFan](https://diehardgamefan.com/?p=154774)

### Inferences
- SHIFT에 대입하면 각 교대는 "도구 1개, 60초"로 능력이 고정되어 있다. 따라서 진행 축은 자연히 **지식 축**이 될 수 있다. "이 도구로 이 지점을 이 타이밍에 쓰면 된다"는 걸 아는 것 자체가 열쇠가 된다. 이것이 Toki Tori 2(동작 2개, 능력 추가 없음)와 같은 구조다.
- 릴레이에서 지식을 옮기는 매체는 리플레이, 손그림 메모, 관제실 표지판이다. Outer Wilds에서 "루프 사이에 남는 건 지식뿐"인 구조를 **"교대 사이에 남는 건 기록뿐"**으로 바꿔 옮길 수 있다.

### Gaps
- Thinky Games 심층 기사와 Mark Brown(GMTK)의 Metroidbrainia 영상 본문은 이번에 확보하지 못함(403, 영상).

---

## Q1. Tunic: 조각난 매뉴얼, 해독할 언어, 눈앞에 숨긴 비밀, 재맥락화

### Takeaway
Tunic은 "읽을 수 없는 매뉴얼"을 조각조각 줍게 만든다. 플레이어가 이미 지나온 화면이 매뉴얼 한 장으로 다르게 보이게 되는 게 핵심이다. 설명의 상세도는 메커닉의 중요도에 비례시키고, 비밀은 "원래 너를 위한 게 아닌 세계"처럼 느끼게 깐다.

### Cited Findings
- 발명된 글자(glyph)는 매뉴얼뿐 아니라 게임 세계와 UI에까지 퍼져 있다. 가장 유용한 도구(읽을 수 있는 설명)를 빼앗아 상상으로 빈칸을 채우게 하려는 의도다. — [Game Developer, Road to IGF 2023](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals)
- **상세도 스케일링**: 달리기 같은 사소한 메커닉은 작은 언급 한두 개, 필수 기법은 매뉴얼 한 페이지 전체(종종 영어 현지화 텍스트 포함)를 준다. 전체 화면 튜토리얼 팝업은 "deeply invasive"라고 했다. — [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals)
- 설계 목표는 "너를 위해 만들어진 게 아닌 시스템과 비밀로 가득한 세계"다. NES 매뉴얼에 실렸지만 게임에서는 끝내 못 본 몬스터와 보물 그림에서 영감을 얻었다. — [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals)
- 매뉴얼은 일러스트, 팁, 지도, 비밀을 담고 게임 안에서 점진적으로 수집된다. Shouldice는 실물 매뉴얼을 만든 뒤 일부러 훼손하고 스캔했다고 한다. — [80.lv](https://80.lv/articles/tunic-s-developer-on-creating-the-in-game-manual-full-of-mysteries) (검색 요약 경유)
- GDC 2023 강연 "TUNIC: This Was Here the Whole Time"은 비밀을 "loose ends(풀리지 않은 끈)"로 모델링하는 법을 제시한다. 미스터리를 푸는 것이 열린 미스터리를 많이 남겨두는 것보다 항상 더 만족스럽지는 않다는 주장도 한다. — [GDC Vault](https://gdcvault.com/play/1029384/-TUNIC-This-Was-Here); [GDC 세션 소개](https://gdconf.com/news/unlock-secrets-tunic-gdc-2023-design-session)
- 직교(orthographic) 카메라가 다수 비밀을 숨기는 열쇠다. 원근 왜곡이 없어 화면 뒤쪽의 길과 공간을 시점 트릭으로 가릴 수 있다. — [Unity 블로그](https://blog.unity.com/games/smoke-mirrors-and-scrolling-textures-behind-the-scenes-of-tunic)

### Inferences
- **상세도 스케일링 → SHIFT 메모와 표지판**: 관제실 고정 어휘 표지판은 "필수 정보만 명료하게", 손그림 메모는 "모호하지만 풍부하게"로 역할을 나눌 수 있다. Tunic의 "중요할수록 명확" 원칙과 같다.
- **"이게 처음부터 여기 있었어"**: 1교대부터 보이던 배경 요소(벽의 무늬, 기계 배치)가 3교대에서 얻은 지식으로 의미를 갖게 만들면 리플레이를 다시 볼 동기가 생긴다. 리플레이 자체가 "재맥락화 장치"가 된다.
- **loose ends 모델**: 각 교대에 "풀린 끈 1개 + 새로 보이는 끈 1개"를 배치하면 릴레이가 이어질 동기를 설계할 수 있다.

### Gaps
- **미검증(기억 기반)**: Tunic의 "Holy Cross" 비밀 입력은 방향키 입력 시퀀스가 매뉴얼 페이지와 지도의 장식선, 그리고 게임 내 오브젝트의 모양에 처음부터 그려져 있었다는 것이다. 후반에 이걸 깨달으면 이미 본 페이지 전체가 재해석된다. 마지막 메타 퍼즐(golden path)도 매뉴얼 페이지 여백의 선을 이어 읽는 구조로 알려져 있다. 이번 세션에서 1차 출처로 확인하지 못했다(Wireframe 기사 403).
- 언어 해독 방식(모음 원 + 자음 선의 표음 문자)도 같은 이유로 미검증.

---

## Q2. Fez: 암호 문자/숫자, QR, 모노리스, 커뮤니티 퍼즐 비판

### Takeaway
Fez는 "두 번째 층"(암호 알파벳, 숫자, 탱그램 등)으로 메타 퍼즐을 깔았다. 그런데 검은 모노리스는 발매 며칠 만에 **브루트포스**로 풀렸고 논리적 해답은 끝내 밝혀지지 않았다. "커뮤니티 규모의 퍼즐에서 공정성이 무엇인가"를 보여주는 반면교사다.

### Cited Findings
- 모노리스 퍼즐은 발매 며칠 만에 풀렸지만, 깨달음이나 게임 내 발견이 아니라 브루트포스였다. — [Engadget 2012](https://www.engadget.com/2012-04-20-how-the-community-solved-fezs-hardest-puzzle.html)
- 붉은 큐브를 얻은 뒤에도 숨은 논리를 누구도 해명하지 못해 사건이 미해결로 남았다. Kotaku는 "전통적 의미로는 풀 수 없는" 퍼즐이라고 평했다. — [Kotaku 회고](https://kotaku.com/a-look-back-at-fezs-unsolvable-black-monolith-puzzle-1794358854); [Kotaku](https://kotaku.com/years-later-players-havent-really-solved-fezs-biggest-1728773630)
- Jesper Juul은 이 사례로 "불가능한 Fez 퍼즐"과 퍼즐 미학을 논했다(풀이가 사후에 납득되어야 한다는 관점). — [Jesper Juul, The Ludologist](https://www.jesperjuul.net/ludologist/2012/04/21/the-impossible-fez-puzzle/)
- 팬 커뮤니티에서는 메타게임에서 공정한 퍼즐이 무엇인지 논쟁을 불렀다고 정리한다(2차, 팬 위키 신뢰도 낮음). — [shapes.inc 팬위키](https://shapes.inc/fandom/fez/controversies)

### Inferences
- **반면교사**: 해답이 "입력 공간이 작아 시도로 풀 수 있는" 형태면, 공유 메모가 있는 릴레이에서는 순식간에 브루트포스된다. 수십 명이 각자 한 번씩 시도하면 그 자체가 분산 브루트포스가 된다.
- 대응책은 두 가지다. ① 정답 검증을 **여러 조건 동시 충족**으로 묶는다(Obra Dinn식). ② 시도 자체에 비용(60초 한정)을 붙인다. SHIFT의 60초 교대는 이미 자연스러운 시도 비용이다.

### Gaps
- **미검증(기억 기반)**: Fez의 암호 알파벳은 벽에 새겨진 글자를 단순 치환 암호로 영어에 대응시키는 방식이고, 숫자 체계는 테트로미노 모양 기반이며, 그 밖에 QR 코드와 버튼 입력 시퀀스("Konami형" 입력이 벽화 등에 그려짐)가 쓰였다고 알려져 있다. 1차 출처로 확인하지 못했다.

---

## Q3. Outer Wilds: 시간 루프, 지식만이 진행, Ship Log, 정보의 시공간 분산

### Takeaway
Outer Wilds는 진행 요소가 사실상 "지식"뿐이다. 정보는 **Curiosity 1개당 서로 다른 장소에 놓인 Clue 3개**의 그물로 분산되고, Ship Log가 "무엇을 알고 무엇을 모르는지"를 지도화해 다음 탐색을 제안한다. 죽음은 거의 공짜이고 그 자체가 정보원이다.

### Cited Findings
- 호기심을 일으키는 네 패턴: 멀리 보이는 대상(가보지 않은 행성의 건물), 들은 적 있는 대상(가는 법을 모르는 Quantum Moon이 반복 언급됨), 패턴에서 벗어난 사례(화면 세 개 중 하나만 메시지, 둘은 빈 드라이브), 모순된 정보(탐사선 발사 실패라는 기술자 메모 옆에 발사 성공 화면). — [rigdern, Learning Design Insights from Outer Wilds](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- **Curiosity–Clue 그물**: Curiosity마다 주요 서사 질문의 답이 있고, 숨겨진 장소에 놓여 여러 지식을 요구한다. 각각 서로 다른 행성의 Clue 3개와 연결된다. 각 Clue는 Curiosity의 존재를 드러내고, 필요한 지식 한 조각을 가르치고, 다른 Clue를 암시한다. 실제로는 Clue → Clue → Curiosity처럼 얽히고, 막다른 Clue도 생겼다. — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- **신호 설계**: 정보가 있는 구역에는 들어갈 수 있는 건물 같은 흥미 요소를 두고, 무관한 구역은 평범하게(빈 풀밭) 둔다. 모든 텍스트 조각은 쓸 수 있는 정보를 담는다(순수 로어 없음). — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- **Ship Log**: 지식의 2D 지도다. 방문한 행성은 컬러, 단서로만 안 행성은 회색, 모르는 곳은 공백이다. Rumor 모드는 Curiosity/Clue와 연결선으로 구성되고, 방문한 항목은 사진, 소문만 들은 항목은 물음표로 표시된다. 용도는 기록, 다음 탐색 아이디어, 진행감 세 가지다. — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- 필수 과제는 박물관 큐레이터에게 발사 코드를 받는 것 하나뿐이다. 목표가 없어 불안해하는 플레이테스터를 위해 큐레이터가 "우주에 가면 무슨 계획이야?"라고 묻고 선택지 6개("모르겠어" 포함)를 준다. — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- 죽음은 비용이 거의 없고(스폰 지점 부활) 죽어야만 얻는 지식도 있다. — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- Kelsey Beachum의 GDC 2021 강연 "Sparking Curiosity-Driven Exploration Through Narrative in Outer Wilds"는 서사가 호기심 주도 탐험이라는 주 설계 목표를 어떻게 돕는지 다룬다. Nomai 문화의 "실패는 진보" 태도가 글에 배어 있다(2차 인용). — [GDC Vault](https://gdcvault.com/play/1027008/Independent-Games-Summit-Sparking-Curiosity); [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/)
- 루프 사이에 이월되는 것은 지식뿐이다. — [Outer Wilds 위키 미러/커뮤니티 요약](https://wiki.neonvagabond.xyz/content/wikipedia_en_all_maxi_2024-01/A/Outer_Wilds)
- Chants of Sennaar 개발자 Julien Moya는 유기적인 연역의 주요 참고작으로 Outer Wilds를 꼽았다. — [Chants of Sennaar 인터뷰 재게재본, 신뢰도 주의](https://berkeleyhistoricalsociety.org/chants-of-sennaar-creator/)

### Inferences
- **SHIFT에 1:3 Clue 규칙**: 퍼즐 하나(문, 기계)의 해법 지식을 **서로 다른 교대 3개(또는 장소 3곳, 도구 3종)**에 흩어 둔다. 어느 하나만 봐도 "뭔가 있다"는 건 알게 하고, 셋을 합치면 풀리게 한다. 리플레이와 메모가 Clue를 운반한다.
- **관제실 = Ship Log**: 관제실 도식도에 "확인됨(컬러) / 소문(회색, 물음표) / 미지(공백)" 3상태를 두면 관제실 플레이어가 지식 지도의 관리자가 된다. 고정 어휘 표지판은 Rumor 연결선에 해당한다.
- **모순 단서**: "앞 교대 메모는 문이 열렸다는데 리플레이는 닫혀 있다" 같은 모순은 강력한 호기심 장치다. 릴레이 구조라 자연 발생도 한다.
- **신호 설계**: 60초라는 짧은 시간에서는 "관련 있는 곳은 흥미롭게, 무관한 곳은 밋밋하게"라는 신호 원칙이 더 중요하다.

### Gaps
- **미검증(기억 기반)**: 22분 루프(태양 초신성), 행성들이 시간에 따라 바뀌는 사건(Ash Twin의 모래 기둥, Brittle Hollow 붕괴) 때문에 "같은 장소 다른 시간"에 다른 정보가 열린다는 점. 1차 출처를 확인하지 못했다.
- Alex Beachum의 설계 강연 원문은 확보하지 못함.

---

## Q4. Return of the Obra Dinn: 부분 증거 연역, "3개 맞으면 확정"

### Takeaway
Obra Dinn은 운명(이름, 사인, 가해자)을 **3개 묶음으로만 정답 확인**해 준다. 그래서 하나씩 찔러보는 추측이 무의미해지고, "90% 확신"이 될 때까지 연역하게 만든다. 동시에 묶음 확인이 나오면 내가 확실하지 않던 것까지 함께 확정되는 "역방향 정보"도 준다.

### Cited Findings
- Memento Mortem(회중시계)이 죽기 직전 순간을 재생한다. 회상 안에서 다른 방이나 갑판을 둘러보고 거기서 다른 시체에 다시 쓸 수 있다. 로그북은 각 사망 후 기본 정보를 자동으로 채우고, 선원 그림, 명부, 선박 도면을 담는다. — [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)
- 이름은 "작은 단서, 추론, 논리적 연역"으로 가능성을 좁혀 정한다. 사인은 카탈로그에서 고르고, 일부 사망은 해답이 복수로 인정된다. — [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)
- **검증 규칙**: 추측을 막기 위해 운명은 3개 묶음으로 검증된다. 마지막 6개는 2개 묶음이다(60명 중 58명까지). — [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)
- 하나를 맞혀도 묶음을 채우지 않으면 알려주지 않아 추측이 훨씬 덜 유용한 전략이 된다. — [Game Wisdom](https://game-wisdom.com/analysis/return-obra-dinn)
- 비판: 90% 이상 확신해야 하며 아니면 빙빙 돈다는 평, 설계에 발목 잡히는 느낌이라는 평이 있다. 3개 확인은 "설계상 타협"이며 표면적 시각 범주(복장 등)에만 의존하면 추측으로 흐를 수 있다는 분석도 있다. — [Game Wisdom](https://game-wisdom.com/analysis/return-obra-dinn); [mechanicsofmagic](https://mechanicsofmagic.com/?p=19084)
- 출처 간 불일치: HardcoreGaming101은 "3~4개마다"라고 썼으나 다수 출처는 3개다. — [HG101](https://www.hardcoregaming101.net/return-of-the-obra-dinn/)
- 개발: Pope는 스프레드시트로 인물과 운명을 연결해 사망 사슬을 논리적으로 따라갈 수 있게 했다. PAX 데모에서 사망을 시간순이 아니게 보여주자 혼란이 커서, 사건 10개로 챕터를 나누고 로그북을 타임라인으로 삼았다. — [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)
- Chants of Sennaar는 Obra Dinn의 검증 아이디어를 차용해, 저널의 그림 옆에 기호 묶음을 배치해 검증하게 했다. — [Digital Trends 리뷰](https://qa2.www.digitaltrends.com/gaming/chants-of-sennaar-review-pc)

### Inferences
- **SHIFT 묶음 검증**: 관제실이 "확정"을 받으려면 표지판 3개(예: 위치, 도구, 타이밍)가 모두 맞아야 불이 켜지는 구조. 하나만 맞으면 피드백이 없다. 분산 브루트포스(Fez 문제)에 대한 직접적 방어다.
- **챕터와 타임라인**: Pope가 시간순 혼란을 챕터와 로그북으로 해결한 방식은 리플레이 아카이브 UI에 그대로 적용할 수 있다. 교대 순서 타임라인과 사건 단위 그룹이다.
- 묶음 크기를 진행에 따라 줄이면(3 → 2) 막판 마무리가 덜 괴로워진다(Obra Dinn의 마지막 6개 = 2개 묶음).

### Gaps
- **미검증(기억 기반)**: 구체적 단서 예시(억양으로 국적 추정, 해먹/침대 위치로 이름 매칭, 신발, 문신, 집단 초상화 속 근접성)와 TIGSource 개발일지 원문. 이번에 확인하지 못했다.

---

## Q5. The Witness: 말없이 규칙 가르치기, 숨은 층, 규칙 조합

### Takeaway
The Witness는 **패널 연쇄 자체를 교과서**로 써서 규칙을 무언으로 가르치고, 구역마다 규칙 하나를 둔 뒤 후반에 규칙을 조합한다. 그 위에 "패널의 선이 풍경에도 있다"는 **숨은 층**(환경 퍼즐)을 얹었다. 목표는 "깨달음(epiphany)의 시뮬레이션"이다.

### Cited Findings
- 비언어 소통을 원했고, 규칙은 말로 설명되지 않으며 퍼즐이 스스로 규칙을 가르친다. — [Wikipedia (Jonathan Blow)](https://Www.Wikipedia.org/wiki/Number_None); Time은 "스스로 가르치는 법을 가르친다"고 평했다. — [Time 리뷰](https://time.com/4191490/the-witness-review)
- 명시적으로 설명하는 것은 X로 퍼즐을 시작하고 끝낸다는 것뿐이다. — [검색 결과 리뷰 인용(Time/PopMatters 계열)](https://popmatters.com/the-witness-a-game-of-wandering-and-wondering-2495400999.html)
- 섬의 구역마다 다른 규칙이 중심이다. 일부는 환경 기반이어서, 가을 숲에서는 나뭇가지 그림자를 따라가야 하고 점점 엉켜 읽기 어려워진다. — [Time 리뷰](https://time.com/4191490/the-witness-review)
- 패널에서 그리던 익숙한 길이 풍경에도 나타난다는 걸 알아차리면 숨겨진 환경 퍼즐 한 부류가 열린다. 환경 퍼즐은 엔딩에 필수가 아니다. — [Time 리뷰](https://time.com/4191490/the-witness-review); [PopMatters](https://popmatters.com/the-witness-a-game-of-wandering-and-wondering-2495400999.html)
- Blow: "깨달음의 경험을 시뮬레이션하는 것." 레시피는 좌절 → 재귀 → 환경 재스캔 → 해답이다. — [Gamereactor "Shared Epiphany"](https://www.gamereactor.eu/shared-epiphany-jonathan-blow-reflects-on-the-witness); [Time Techland 2011 프리뷰](https://techland.time.com/2011/08/11/playing-the-witness-hands-on-with-the-next-game-from-the-creator-of-braid/5)

### Inferences
- **패널 연쇄 = SHIFT 초반 교대**: 첫 몇 교대는 "규칙 1개만 보이는 최소 상황"으로 두고, 뒤 교대일수록 규칙을 조합한다. 리플레이를 보면 앞사람이 규칙을 발견하는 과정 자체가 교재가 된다.
- **숨은 층**: 스테이지 배경에 퍼즐 문법(예: 관제실 표지판 모양, 도구 궤적)이 숨어 있는 비필수 층을 두면 상급 플레이어의 장기 동기가 된다. 필수가 아니어야 한다는 점(Witness 환경 퍼즐 비필수)이 중요하다.
- 깨달음 레시피의 "환경 재스캔"은 SHIFT에서 **리플레이 재시청**에 해당한다.

### Gaps
- **미검증(기억 기반)**: 환경 퍼즐 수(약 135개), 오디오 로그와 영상 보상, 출발점 "Tutorial 문" 패널 설계, Blow의 "Truth in Game Design" 강연 원문. 확인하지 못했다.

---

## Q6. Chants of Sennaar: 문맥으로 단어 추정, 저널 검증

### Takeaway
플레이어는 기호 옆에 자유롭게 추측 뜻을 적고, 저널의 **그림 페이지에 기호 묶음을 맞게 배치하면 확정**된다(Obra Dinn식 묶음 검증의 언어판). 난이도는 "동시에 미해독 상태로 남아 있을 단어 수"로 조절한다.

### Cited Findings
- 저널에 기호 뜻 추측을 타이핑하면, 그 기호가 다시 등장할 때 번역으로 표시된다. — [God is a Geek 리뷰](https://godisageek.com/reviews/chants-of-sennaar-review/)
- Obra Dinn의 검증 개념을 빌려, 저널의 그림 옆에 기호 묶음을 놓아 검증한다. — [Digital Trends](https://qa2.www.digitaltrends.com/gaming/chants-of-sennaar-review-pc)
- 개발 중 핵심 루프에 고전했다. 한때 저널이 없었고, 검증은 늦게 추가되었다(재게재본, 신뢰도 주의). — [Berkeley Historical Society 재게재](https://berkeleyhistoricalsociety.org/chants-of-sennaar-creator/)
- 언어학자 도움 없이 만들었고, 언어는 문, 열쇠, 기계와 똑같은 "퍼즐 요소"다. — [exputer 인터뷰](https://exputer.com/interviews/chants-of-sennaar-no-plan-for-dlc/); [GoNintendo](https://www.gonintendo.com/contents/31644-chants-of-sennaar-devs-explain-how-the-game-s-fictional-languages-were-developed)
- 난이도는 저널에 동시에 미번역으로 남을 가능성이 높은 단어 수로 조절한다. — [검색 요약, 출처 Game Developer 계열](https://gamedeveloper.com/design/immersing-players-in-the-culture-of-a-people-with-language-puzzler-chants-of-sennaar)

### Inferences
- **SHIFT 고정 어휘 표지판 = Sennaar 기호**: 관제실 표지판 어휘의 의미를 처음엔 모호하게 두면(예: 기호만 있고 뜻은 없음), 사용자 커뮤니티가 리플레이 문맥으로 뜻을 추정하고 특정 상황에서 그 의미가 확정된다. 다만 협동 소통 수단이므로 핵심 어휘는 명확하게 두고 일부만 "해독 대상"으로 두는 혼합이 안전하다.
- **"동시 미해독 개수" 난이도 레버**: 한 교대가 마주하는 미지의 요소 수를 1~2개로 제한하는 지표로 쓸 수 있다.

### Gaps
- 저널 그림 1페이지에 몇 단어를 맞춰야 하는지(기억상 3~5개 묶음)는 1차 출처로 미확인.

---

## Q7. Blue Prince: 매일 리셋 저택, 다회차 메모, 장기 메타 퍼즐

### Takeaway
Blue Prince는 매일 리셋되는 무작위 방 드래프팅 위에, **여러 방과 여러 날에 걸친 단서**(편지, 그림, 체스 배치, 건축 디테일)를 깔았다. 플레이어가 게임 밖에 몇 페이지씩 메모하게 만든다. 강점은 무한한 발견감, 약점은 "답을 알아도 방이 안 나와서 못 푸는" 무작위 차단과 인게임 기록 수단의 부재다.

### Cited Findings
- 저택 배치는 미리 정해져 있지 않고 날마다 리셋된다. 열쇠, 보석, 스태미나는 하루 안에서 관리하고, 나쁜 빌드는 하루를 일찍 끝낸다. — [GMTK Substack](https://gmtk.substack.com/p/blue-prince-can-a-random-puzzle-game)
- 단서는 있는데 입력할 장소에 접근하지 못하는 일이 생긴다. 특정 방 여러 개를 함께 또는 인접 배치해야 하는 퍼즐은 "정보를 아는 것"을 넘어 "집을 배치하는 것"을 요구한다. 옹호자는 이를 Outer Wilds의 시간 맞추기처럼 "지식 증명"으로 본다. — [GMTK](https://gmtk.substack.com/p/blue-prince-can-a-random-puzzle-game)
- 무작위성은 막다른 길을 없애기도 한다(새 날 = 새로 볼 것). — [GMTK](https://gmtk.substack.com/p/blue-prince-can-a-random-puzzle-game)
- 문서, 그림, 사진이 많아 방에 다시 간다는 보장이 없으니 거의 모두 기록해야 한다. Mark Brown은 인게임 문서 보관함이나 카메라 같은 참조 시스템이 있었으면 했다. — [GMTK](https://gmtk.substack.com/p/blue-prince-can-a-random-puzzle-game)
- 비판: 무작위가 잔인할 수 있고, 이미 이론상 푼 퍼즐을 막는다. 덱에서 방을 뺄 수 없고, 보이는 날짜 카운트가 불필요한 압박을 준다. "내 시간을 존중하지 않는다"고 했다. 개선안으로 노트 저장, 드래프트 풀 조작, 날짜 숨김, 단일 목표를 여러 금고로 쪼개기를 제안했다. — [GMTK](https://gmtk.substack.com/p/blue-prince-can-a-random-puzzle-game)
- Ros: 처음엔 방과 퍼즐을 잇는 디자인 문서가 있었으나 2018년쯤 너무 복잡해져 쓸모가 줄었다. 튜토리얼을 앞에 몰지 않고 맵 전체에 흩어, 난이도 조율 능력 일부를 포기했다. — [Thinky Games 인터뷰 (검색 스니펫)](https://thinkygames.com/features/interview-how-myst-riven-and-tabletop-games-built-the-foundation-of-blue-prince/)
- 덜 고립된 퍼즐은 여러 방과 여러 회차에 걸치고, 단서는 편지, 그림, 체스 배치, 건축 디테일에 분산된다. 리뷰어는 게임 밖에 여러 페이지의 메모와 연결도를 그렸다. 퍼즐 힌트가 이미 푼 뒤에 나오기도 한다. — [검색 요약: wnhub](https://wnhub.io/news/other/item-47631); [Thinky Games 팁](https://thinkygames.com/features/blue-prince-tips-and-tricks-for-beginner-architects/)
- Ros는 44글자 퍼즐을 가장 성공적인 설계로 꼽았고, "cheeky하게 모호한" 퍼즐과 결함 있는 퍼즐을 구분했다(Parlor 게임의 두 버전이 모호한 해답을 갖는다). — [Game File](https://www.gamefile.news/p/best-worst-blue-prince-puzzles)
- 모든 것이 풀렸는지 끝내 인정하지 않을 것이고, 아직 미스터리가 남아 있다고 했다. — [PC Gamer](https://www.pcgamer.com/games/puzzle/i-will-probably-never-fully-acknowledge-whether-or-not-everything-has-been-solved-says-blue-prince-creator-there-are-certainly-mysteries-still-in-the-game)

### Inferences
- **SHIFT는 Blue Prince의 약점을 구조적으로 해결할 수 있다**: 손그림 메모와 리플레이가 바로 GMTK가 원한 "인게임 참조 시스템"이다. 메모를 게임이 보존하고 다음 교대가 열람하게 하면 다회차 단서 퍼즐이 가능해진다.
- **무작위 차단 회피**: 퍼즐 해법 지식이 있어도 "필요한 도구가 내 교대에 안 왔다"면 Blue Prince의 문제와 같다. 도구 배정에 최소 보장(예: 관제실이 다음 교대 도구를 요청하는 표지판)을 두면 완화된다.
- **단일 목표 → 여러 금고**: 장기 메타 목표를 작은 "금고" 여러 개로 쪼개 각 교대가 하나에 기여하게 한다.
- **"cheeky한 모호성" vs 결함**: 커뮤니티가 해석을 나눌 여지가 있는 모호성은 OK다. 결정적 정보 누락은 결함이다.

### Gaps
- Ros의 인터뷰 원문(Thinky Games 403), Mt. Holly의 구체 메타 퍼즐(Room 46 이후, 블루 프린트 등) 상세는 미확보.

---

## Q8. Lorelei and the Laser Eyes / Lingo / Heaven's Vault / Toki Tori 2

### Takeaway
- **Heaven's Vault**: 번역 추측을 **즉시 확인하지 않는다**(확인하면 단어 구조를 보지 않고 브루트포스하므로). 반복 사용으로 나중에 확정되거나 기각된다.
- **Lorelei**: 펜과 종이 필수, 힌트 시스템 없음, 많은 숫자 답이 **회차마다 무작위**라 정답 공유가 막힌다.
- **Lingo**: 블록의 색, 높이, 크기가 단어 퍼즐 규칙을 정하고, 튜토리얼 없이 플레이로 규칙을 알아낸다.
- **Toki Tori 2**: 동작 2개(휘파람, 밟기)뿐, 능력 추가 없이 세계 지식으로 진행한다.

### Cited Findings
- Heaven's Vault: 플레이어 번역을 확인해 주면 단어 구조를 보지 않고 브루트포스했을 것이고, "언어 전체가 퍼즐"이기 때문에 확인하지 않았다(inkle 공동창업자, 원문에 Joel Couture로 표기되어 있으나 Couture는 인터뷰어일 가능성이 있어 화자 확인 필요). — [Game Developer, Road to IGF](https://gamedeveloper.com/business/road-to-the-igf-inkle-s-i-heaven-s-vault-i-)
- Heaven's Vault: 일부 추측은 반복 사용이나 다른 캐릭터 문의로 확정되거나 기각되지만 대부분은 그렇지 않다. 비선형이라 추측이 나중에 교정되며 플레이어마다 언어 이해가 다르게 발전한다. 언제든 바꿀 수 있다. — [Slant](https://www.slantmagazine.com/games/heavens-vault-review/); [Cliqist](https://cliqist.com/2018/04/19/decoding-dialect-in-inkle-studios-heavens-vault/); [Game Informer](https://www.gameinformer.com/review/heavens-vault/unearthing-ancient-mysteries)
- Lorelei: 노트와 펜이 필요하다는 평이 반복된다. 힌트 시스템이 전혀 없는데, 많은 퍼즐이 무작위 생성 숫자를 쓰기 때문일 수 있다. 많은 답이 플레이마다 무작위다. — [Adventure Game Hotspot](https://adventuregamehotspot.com/review/7110/lorelei-and-the-laser-eyes); [GamesBeat](https://gamesbeat.com/lorelei-and-the-laser-eyes-review-a-notebook-puzzler-with-spooky-vibes/)
- Lingo(Brenton Wildes): 블록 규칙은 색, 높이, 크기가 결정하고 색이 가장 중요하다. 2배 크기 블록은 반쪽마다 다른 색을 가질 수 있다. 명시적 튜토리얼 없이 플레이로 규칙을 알아낸다. 단어 퍼즐과 불가능한 공간의 1인칭 탐험이다. — [gameplay.tips 가이드](https://gameplay.tips/guides/lingo-color-meanings-other-tips.html); [Steam](https://store.steampowered.com/app/1814170?l=english)
- Toki Tori 2: 휘파람과 밟기 두 동작, 마법 노래를 배워 환경 퍼즐에 사용한다. 막판 난이도 급등 때문에 옵션에 비행 기능이 추가되었다. — [Metacritic 상세](https://legacy.prod.metacritic.com/game/switch/toki-tori-2-+/details); [Cubed3](https://www.cubed3.com/games/reviews/nintendo-switch/toki-tori-2plus)

### Inferences
- **Lorelei식 회차 무작위 답**은 릴레이에 매우 유용하다. "숫자 답 자체"는 매 세션 무작위로 두고 "답을 얻는 방법"만 지식으로 남기면, 메모로 정답을 복붙하는 대신 **방법을 전달하는 메모**가 나온다. SHIFT 손그림 메모의 질이 올라간다.
- **Heaven's Vault식 지연 확인**: 관제실 표지판 해석을 즉시 판정하지 않고 사용 맥락에서 서서히 확정하는 방식이다. 협동 게임에서는 좌절 위험이 있으니 비핵심 층에만 쓴다.
- **Lingo식 시각 문법**: 색, 크기, 높이 = 규칙. 고정 어휘 표지판의 "색" 자체가 문법 범주(경고, 지시, 위치)를 표현하게 할 수 있다.
- **Toki Tori 2식 최소 동작 + 탈출구**: 도구 1개 60초 설계와 같다. 막판 난이도에 대비해 접근성 옵션(비행 같은 우회)을 미리 계획한다.

### Gaps
- Lorelei의 구체 퍼즐 유형(날짜, 4자리 코드, 회전 문자 등)은 리뷰에서 확인 불가. Simogo 인터뷰를 확보하지 못함.
- Lingo의 색별 의미(예: 흰색=같은 단어, 검정=반대말, 노랑=애너그램 등)는 기억 기반이라 미검증.
- Toki Tori 2의 무튜토리얼 설계 의도에 대한 개발자 원문은 미확보.

---

## Q9. 공통: 연역 검증, 브루트포스 방지, 공개 페이싱, 층(layer) 구조

### Takeaway
검증 방식은 크게 셋이다. ① **묶음 검증**(Obra Dinn, Chants of Sennaar), ② **세계가 곧 검증**(Outer Wilds, Witness, Tunic: 맞으면 문이 열리고 틀리면 아무 일 없음), ③ **의도적 비검증**(Heaven's Vault). 브루트포스 방지는 묶음 검증, 시도 비용, 회차 무작위 답(Lorelei), 입력 공간 확대로 한다. 층은 "필수 표층 + 비필수 심층(Witness 환경, Tunic 메타, Fez 모노리스, Blue Prince 미해결)"이 표준이다.

### Cited Findings
- 묶음 검증으로 추측 억제 — [Wikipedia: Obra Dinn](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn); Sennaar의 차용 — [Digital Trends](https://qa2.www.digitaltrends.com/gaming/chants-of-sennaar-review-pc)
- 비검증으로 브루트포스 방지 — [Game Developer: Heaven's Vault](https://gamedeveloper.com/business/road-to-the-igf-inkle-s-i-heaven-s-vault-i-)
- 브루트포스 실패 사례: Fez 모노리스 — [Engadget](https://www.engadget.com/2012-04-20-how-the-community-solved-fezs-hardest-puzzle.html); [Kotaku](https://kotaku.com/a-look-back-at-fezs-unsolvable-black-monolith-puzzle-1794358854)
- 회차 무작위 답 — [Adventure Game Hotspot](https://adventuregamehotspot.com/review/7110/lorelei-and-the-laser-eyes)
- 비필수 심층: Witness 환경 퍼즐 비필수 — [PopMatters](https://popmatters.com/the-witness-a-game-of-wandering-and-wondering-2495400999.html); Blue Prince 미해결 미스터리 — [PC Gamer](https://www.pcgamer.com/games/puzzle/i-will-probably-never-fully-acknowledge-whether-or-not-everything-has-been-solved-says-blue-prince-creator-there-are-certainly-mysteries-still-in-the-game); Tunic의 열린 미스터리 옹호 — [GDC 세션](https://gdconf.com/news/unlock-secrets-tunic-gdc-2023-design-session)
- 페이싱: Outer Wilds의 1 Curiosity : 3 Clue 그물과 신호 설계 — [rigdern](https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/); Tunic의 중요도별 설명 상세도 — [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals); Sennaar의 동시 미해독 단어 수 — [Game Developer 계열](https://gamedeveloper.com/design/immersing-players-in-the-culture-of-a-people-with-language-puzzler-chants-of-sennaar); Blue Prince의 흩어진 튜토리얼 — [Thinky Games 인터뷰](https://thinkygames.com/features/interview-how-myst-riven-and-tabletop-games-built-the-foundation-of-blue-prince/)
- 깨달음 레시피(좌절 → 재귀 → 재스캔 → 해답) — [Time Techland](https://techland.time.com/2011/08/11/playing-the-witness-hands-on-with-the-next-game-from-the-creator-of-braid/5)

### Inferences — SHIFT용 기법 차용표 (요약)

| 기법 | 원천 | SHIFT 적용안 |
|---|---|---|
| 1 Curiosity : 3 Clue (서로 다른 장소) | Outer Wilds | 퍼즐 하나의 해법 조각을 서로 다른 교대/도구/구역 3곳에 분산. 리플레이와 메모가 조각을 운반 |
| 지식 지도 3상태 (확인/소문/미지) | Outer Wilds Ship Log | 관제실 도식도에 컬러/회색 물음표/공백 표시. 표지판 = 소문 연결선 |
| 묶음 검증 (3개 맞아야 확정) | Obra Dinn, Sennaar | 관제실 표지판 3개(위치, 도구, 타이밍)가 모두 맞을 때만 "확정 램프". 분산 브루트포스 방어 |
| 묶음 크기 감소 (3 → 2) | Obra Dinn 막판 | 스테이지 후반 검증을 완화해 마무리 피로 감소 |
| 회차 무작위 답 | Lorelei | 숫자와 순서 답은 세션마다 무작위, "푸는 방법"만 고정 → 메모가 방법을 전달하게 됨 |
| 중요도별 설명 상세도 | Tunic 매뉴얼 | 필수 = 관제실 고정 어휘(명료), 선택 = 손그림 메모(모호, 풍부) |
| "처음부터 여기 있었다" 재맥락화 | Tunic | 1교대부터 보이던 배경 문양이 후반 지식으로 의미를 가짐. 리플레이 재시청이 보상 |
| 구역당 규칙 1개 → 후반 조합 | Witness | 초반 교대는 단일 규칙 관찰, 후반은 조합 |
| 비필수 숨은 층 | Witness 환경, Tunic 메타 | 도구 궤적과 배경에 숨은 메타 퍼즐(필수 아님). 장기 커뮤니티 동기 |
| 모순 단서 | Outer Wilds | 메모와 리플레이 불일치가 자연 발생 → 호기심 장치로 활용 (모순은 결함이 아니라 설계 대상) |
| 신호 설계 (관련=흥미, 무관=밋밋) | Outer Wilds | 60초 안에 "볼 곳"이 시각적으로 읽혀야 함 |
| 동시 미지 개수 제한 | Sennaar | 한 교대가 마주하는 새 미지 1~2개 |
| 지연/비검증 해석 | Heaven's Vault | 비핵심 표지판 의미의 커뮤니티 해석(핵심엔 쓰지 말 것) |
| 인게임 참조 시스템 | Blue Prince 비판의 역 | 손그림 메모와 리플레이 아카이브 = GMTK가 원한 기능. 잘 보존되고 검색되게 |
| 단일 목표 → 여러 금고 | GMTK의 Blue Prince 제안 | 장기 메타 목표를 교대 단위 기여로 쪼갬 |
| 열린 끝(loose ends) 유지 | Tunic GDC, Blue Prince | 전부 풀리지 않은 미스터리를 의도적으로 남김 |
| 반면교사: 작은 입력 공간 정답 | Fez 모노리스 | 버튼 시퀀스 같은 작은 공간 정답은 릴레이에서 순식간에 분산 브루트포스됨 |

- 릴레이 특유의 위험으로, 지식 게임의 "아하"는 **본인이 연결했을 때** 생긴다. 앞 교대 메모가 답을 직접 적어버리면 아하가 사라진다. 따라서 (a) 답을 무작위화하고(Lorelei), (b) 메모 매체를 손그림으로 제한하고(이미 SHIFT 설계), (c) 고정 어휘에 "정답 문자열"을 담을 수 없게 하는 것이 아하 보존 장치가 된다.
- 반대로 "앞사람 리플레이에서 실패 원인을 발견하는" 순간은 릴레이 고유의 아하다. 이는 Outer Wilds의 "죽음이 정보원" 원칙의 다인판이다.

### Gaps
- Mark Brown(GMTK)의 Metroidbrainia 영상, Tunic과 Outer Wilds GDC 강연 원문 녹취는 확보하지 못함. 위 표의 "SHIFT 적용안" 열은 모두 본 연구자의 추론이다.
- 비동기 다인 지식 게임(예: Dark Souls 메시지, 공유 메모 기반 퍼즐)에 대한 설계 연구는 이번 범위에서 조사하지 못함.
