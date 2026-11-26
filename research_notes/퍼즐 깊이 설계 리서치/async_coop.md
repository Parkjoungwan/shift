# 비동기·비대칭·커뮤니티 규모 협동 퍼즐 설계 (Async / Asymmetric / Community-scale Co-op)

> 대상 프로젝트 맥락: 한 건물 공유, 한 번에 한 명 작업자(60초, 도구 5종 중 1), 다른 사람은 지연된 CCTV 리플레이 관전, 교대마다 손그림 쪽지 1장, "관제실" 플레이어는 도면을 보고 고정 어휘 표지판을 배치·쪽지에 도장, 모든 교대 리플레이 보관·빨리감기 가능.
> 조사 한계: 도구 호출 예산 내에서 1차 출처(Game Developer, Wikipedia, Kotaku, Engadget 등) 위주로 확인했다. 확인하지 못한 항목은 각 절의 Gaps에 적었고, 출처 없는 배경지식은 Inferences에 "(미검증 배경지식)"으로 표시했다.

---

## Q1. 소울 시리즈 메시지·혈흔, 데스 스트랜딩 비동기 구조물: 유용 vs 소음, 의도된 불신(거짓·트롤링), 제한 어휘

### Takeaway
제한 어휘 메시지는 욕설·스팸을 막는 동시에 "조합의 놀이"(밈, 은어, 거짓말)를 만들어 낸다. 거짓 메시지가 존재한다는 사실 자체가 독자에게 "검증" 행위를 강요해 메시지 읽기를 퍼즐로 만든다. 데스 스트랜딩은 반대로 "보상 없는 긍정(좋아요)"과 "얼굴 없는 흔적"으로 연대감을 설계했다. 미야자키의 기원 일화(눈길에서 차를 밀어주고 사라진 낯선 사람들)는 "만나지 않는 타인의 도움"이 핵심 정서임을 보여 준다.

### Cited Findings
- 미야자키는 소울 시리즈 멀티플레이 기원으로, 눈 덮인 오르막에서 차가 멈췄을 때 낯선 사람들이 나타나 밀어 올려주고 말없이 사라진 경험을 들었다(세부는 판본마다 다름: 뒤차가 계속 밀어 줘 모두 언덕을 넘었다는 버전도 있음). — [GamesRadar](https://gamesradar.com/elden-ring-and-dark-souls-summoning-system-was-inspired-by-miyazakis-car-breaking-down); [Gigazine 인터뷰(영문)](https://gigazine.net/gsc_news/en/20120228-darksouls-miyazaki-interview)
- 다크소울2 프로듀서: 멀티플레이는 "외롭고 간접적이지만 위로가 되는" 성격을 유지. — [PC Gamer](https://pcgamer.com/dark-souls-2-producer-says-multiplayer-to-remain-lonely-indirect-but-also-comforting)
- 엘든 링 메시지는 미리 만들어진 단어·구문으로만 작성 가능하며, 이는 지나친 장난·욕설을 막기 위한 것으로 보인다. — [Gaming Bible](https://www.gamingbible.com/news/player-messages-in-elden-ring-are-pure-chaos-20220317)
- 제한 어휘가 오히려 밈을 낳음: 다크소울2의 "Try Tongue But Hole"(엎드린 해골 옆) → 다크소울3 이후 "Try Finger But Hole"이 정형 농담으로 정착, 엘든 링에서 귀환. 개가 아닌 동물을 전부 "dog"라 부르는 전통, "Fort, night" 등. — [Know Your Meme](https://knowyourmeme.com/memes/try-finger-but-hole); [Inverse](https://inverse.com/gaming/elden-ring-memes-dog-try-finger-but-hole)
- 트롤링 패턴: 절벽 끝 "Try jumping off", 복도 끝에 가짜 환영벽 암시, "Liar ahead"(대개 참이지만 가끔 유익한 메시지를 무시하게 만들려는 트롤). 발매 직후부터 트롤링이 시작됨. — [GamesRadar](https://www.gamesradar.com/elden-ring-players-are-already-using-the-message-system-to-troll-each-other); [Know Your Meme: Soulslike Player Messages](https://knowyourmeme.com/memes/soulslike-player-messages)
- 메시지 공간은 유익·웃김·음란이 섞인 혼합물. — [Windows Central](https://www.windowscentral.com/elden-ring-messages-reveal-helpfulness-hilarity-horniness)
- 엘든 링 나이트레인(협동)에서는 메시지를 남길 수 없음 — 실시간 협동에서는 비동기 메시지 채널을 아예 뺀 사례. — [DTF](https://dtf.ru/fromsoftware/3358702)
- 데스 스트랜딩: 다른 플레이어의 얼굴은 보이지 않고 흔적만 보임. 코지마는 혼자 플레이하면서 "다른 사람을 느끼거나 생각하게" 하려 했다고 함. "좋아요"는 실질 가치·게임플레이 효과가 거의 없으며, 보상 없는 주고받기가 요점. 전화 이전의 원거리 통신에 비유. 이야기가 최악의 시나리오이므로 시스템은 "부정보다 긍정"으로 설계. — [Game Developer](https://www.gamedeveloper.com/game-platforms/kojima-details-the-subtly-social-gameplay-of-i-death-stranding-i-)
- 디렉터스 컷의 주요 목표 중 하나가 비동기 멀티플레이 개선이었다. — [Shacknews](https://shacknews.com/article/125784/a-big-goal-of-death-stranding-directors-cut-was-improving-the-asynchronous-multiplayer)
- 코지마는 데스 스트랜딩의 "긍정적" 공유 세계 접근을 가장 자랑스러워함; 오프라인 플레이는 "정말 권하지 않는다". — [GamesRadar](https://www.gamesradar.com/kojima-is-most-proud-of-death-strandings-positive-shared-world-multiplayer-approach); [GamingBolt](https://gamingbolt.com/death-stranding-hideo-kojima-really-wouldnt-recommend-playing-the-game-offline)

### Inferences
- **고정 어휘 표지판(관제실)에 그대로 적용 가능**: 템플릿 × 명사 조합 구조는 (a) 남용 방지, (b) 다국어 자동 번역, (c) 조합 밈 생성을 동시에 준다. 단, 어휘를 "건물·도구·위험" 명사로 의도적으로 좁히면 오해석 여지(예: "왼쪽" 기준이 누구의 왼쪽인가)가 그대로 난이도 원천이 된다(Q2 KTANE의 "두 번째 전선" 문제와 동일 원리).
- **불신을 설계 요소로**: 소울 메시지의 평가(추천) 수치가 신뢰 신호 역할을 한다는 것은 널리 알려져 있으나 이번 조사에서 1차 출처를 확보하지 못함(Gaps). 프로젝트에서는 관제실의 "도장(승인/반려)"이 이 평판 레이어에 해당한다 → 쪽지 자체는 누구나 거짓을 쓸 수 있되, 도장이 "검증된 정보"의 희소 자원이 되게 만들면 관제실 역할이 필수화된다.
- **진실 검증 수단을 함께 제공해야 거짓이 깊이가 된다**: 소울에서 거짓 메시지가 재미인 이유는 플레이어가 즉시 시험(벽 치기, 점프)으로 검증할 수 있기 때문. SHIFT에서는 리플레이 보관소가 검증 수단 → "쪽지 vs 리플레이 대조"가 퍼즐이 된다.
- **데스 스트랜딩식 무보상 긍정**: 쪽지에 "고마워요" 도장 같은 무가치 반응은 동기 부여·톤 유지에 유효. 단 정보 퍼즐의 필수성과는 별개 축.

### Gaps
- 소울 메시지 평가 시스템(추천→체력 회복 등)의 1차 출처, FromSoftware가 거짓 메시지를 의도했는지에 대한 공식 발언을 확보하지 못함.
- 데스 스트랜딩 표지판(Sign) 종류, 구조물 공유 상한·큐레이션 로직(다른 플레이어 구조물이 얼마나/어떤 기준으로 표시되는지)에 대한 1차 출처 미확보.

---

## Q2. 비대칭 정보 협동: KTANE, We Were Here, Spaceteam (Operation: Tango 등) — 두 부분 시야 결합 강제, 대역폭 제한

### Takeaway
핵심은 (1) 한쪽만 볼 수 있는 상태(폭탄/방)와 한쪽만 가진 규칙(매뉴얼/단서)의 분리, (2) 입력은 단순하게·결정은 어렵게, (3) "말로 설명하기 어려운" 시각 요소를 일부러 넣되 규칙 자체는 모호하지 않게. 대역폭 제한(음성뿐, 시간 압박, 혼란 이벤트)이 난이도의 원천이다.

### Cited Findings
- KTANE: 해체자만 폭탄을 볼 수 있고 전문가가 지침을 가짐. 양쪽이 "주고받을 흥미롭고 고유한 정보 조각"을 갖도록 정보를 나누는 것이 밸런스의 출발점. 개발팀은 "커뮤니케이션 기반 파티 게임인데 우연히 폭탄이 있을 뿐"임을 깨달음. — [Game Developer: Finding the fun in bomb defusal](https://gamedeveloper.com/design/finding-the-fun-in-bomb-defusal-with-i-keep-talking-and-nobody-explodes-i-)
- KTANE: 조작은 단순하게 해서 실패가 손재주가 아니라 팀 추론을 반영하게 함 — "결정이 어려운 부분". — 같은 출처
- KTANE: 규칙은 명확해야 함. 추측해야 하면 속았다고 느끼거나 불만족. "두 번째 전선"이 위에서인지 아래에서인지 모호했던 것이 테스트에서 드러남. 시리얼 번호를 읽을 때 대문자 O와 숫자 0이 혼동되어 시리얼에서 대문자 O를 제거. — 같은 출처
- KTANE: 숨은 페이싱 시스템이 성과를 추적해 잘하면 알람·소등 같은 이벤트로 "발을 걸되" 죽음의 나선은 피해서 "2초 남기고" 해체할 수 있게 함. 실패는 플레이어 자신의 탓으로 느껴져야 함. 플레이어 대화를 엿들어(eavesdropping) 플레이어가 직접 보고하지 않은 문제를 발견. — 같은 출처
- KTANE: 일부 모듈은 묘사가 필요한 특이 글리프, 비슷한 단어의 동음이의어를 사용해 소리 내어 설명하기 어렵게 설계. 2014 Global Game Jam에서 VR 헤드셋을 "눈가리개"로 보고 출발, 관객에게도 재미있게 하는 것이 목표. — [Wikipedia: KTANE](https://en.wikipedia.org/wiki/Keep_Talking_and_Nobody_Explodes)
- NYU Game Center 수상평: 크고 물리적인 매뉴얼로 관객과 플레이어를 위한 연극적 공간을 만듦. — [NYU Game Center](https://gamecenter.nyu.edu/?p=12457)
- We Were Here: 한 명만 볼 수 있는 퍼즐을 서로 말로 안내하는 협동 게임. 정보 격차가 긴장감을 만들지만 설계는 더 어렵다. 가장 어려운 과제는 두 역할 모두에 압박을 유지하는 것(한쪽이 한가한 순간이 생김). 플레이어가 어떻게 말로 표현할지 예측하는 것이 중심 문제. 코드 전에 실제 방 + 무전기로 물리 프로토타입 테스트. — [Game Developer: Road to the IGF – We Were Here](https://www.gamedeveloper.com/disciplines/road-to-the-igf-total-mayhem-games-i-we-were-here-i-)
- We Were Here 공동창업자 Lucia de Visser: 퍼즐을 친구에게 설명하기 "특히 어렵게" 의도; 서로의 화면을 볼 수 있다면 "설계의 본질이 사라진다". — [HyperX 인터뷰](https://blog.hyperx.com/article/12750/hyperx-indie-highlight-how-a-college-project-became-award-winning-puzzle-series-we-were-here); [GamesRadar](https://www.gamesradar.com/how-a-team-of-dutch-escape-artists-is-charting-its-future-by-tackling-the-mayhem-in-its-past)
- Spaceteam: 플레이어마다 엉터리 SF 이름의 고유 조작판, 지시는 자기 판을 포함한 2~4개 판 어디에든 해당할 수 있어 외쳐야만 진행. 소행성·웜홀(기기 흔들기), 점액·패널 탈락 같은 방해 이벤트. 실수 누적 시 초신성에 삼켜져 종료. 영감은 보드게임 Space Alert. — [Wikipedia: Spaceteam](https://en.wikipedia.org/wiki/Spaceteam)

### Inferences
- **SHIFT 매핑**: 작업자 = KTANE 해체자(현장만 봄, 60초 압박), 관제실 = 전문가(도면만 봄). 단, 실시간 음성이 없고 표지판(고정 어휘)·쪽지(손그림 1장)로만 소통하므로 대역폭이 KTANE보다 훨씬 좁다 → 퍼즐 1개에 필요한 정보량을 "표지판 2~3개 + 쪽지 1장"으로 전달 가능한 수준으로 맞춰야 함.
- **결합 강제 레시피**: 도면에만 있는 정보(예: 배관 연결, 어느 스위치가 어느 문과 연결되는지 = 규칙) × 현장에만 있는 정보(예: 현재 색·상태·물리 위치 = 상태)로 나눠 어느 한쪽만으로 해 공간이 줄지 않게 설계. KTANE의 "시리얼 번호 끝자리가 홀수면…"처럼 규칙이 현장 상태를 참조하게 하면 결합이 필수.
- **모호성은 "묘사"에만, 규칙엔 금지**: 손그림 쪽지는 자연스럽게 묘사 모호성을 만든다(재미). 그러나 관제실 표지판 어휘는 KTANE 교훈대로 기준(위/아래, 좌/우)을 고정해야 "속았다"는 감정을 피한다.
- **두 역할 모두 압박**: We Were Here 교훈 — 관제실이 한가해지지 않게 관제실에도 시간 제한/자원 제한(표지판 개수, 도장 개수)을 둘 것.
- **물리 프로토타입**: 쪽지+도면 종이로 오프라인 테스트 가능(We Were Here 방식).

### Gaps
- Operation: Tango, Unrailed! 관련 설계 발언은 이번 조사에서 확보하지 못함.
- KTANE 매뉴얼 버전 교체(다른 규칙 세트) 기능에 대한 1차 출처 미확보(Q6 참조).

---

## Q3. 커뮤니티·ARG 규모 퍼즐: 무엇이 오래 갔고 무엇이 꺼졌나, 설계자의 시딩·페이싱

### Takeaway
오래 간 것은 (a) "진짜 정보가 있다"는 개발자 확인 + 해법 미공개(Noita 눈 메시지), (b) 실시간 공유 자원·되돌릴 수 없는 상태(The Button의 타이머, r/place의 쿨다운), (c) 구조적으로 한 명이 혼자 못 푸는 퍼즐(Animal Well 벽화 50조각). 빨리 끝난 것은 무차별 대입이 가능한 탐색 공간(Fez 모놀리스 18시간)이나 조각 공유만 하면 되는 퍼즐(Animal Well 하루). 페이싱 레버는 쿨다운·1인 1회·계정 생성일 제한·모드 전환 투표 등.

### Cited Findings
- **Fez 검은 모놀리스**: 뉴게임+ 1인칭 시점에서 특정 방에 버튼 시퀀스를 입력하면 모놀리스 출현. 해법에 발견 가능한 내부 논리가 없었고, 커뮤니티 웹사이트가 조합 분배·기록을 맡아 18시간, 66,227회 시도로 무차별 대입 성공. 사후 "정사"에 가까운 이론은 정답을 알고 난 뒤 짜맞춘 것으로 보임. — [Kotaku](https://kotaku.com/a-look-back-at-fezs-unsolvable-black-monolith-puzzle-1794358854); [Engadget](https://www.engadget.com/2012-04-20-how-the-community-solved-fezs-hardest-puzzle.html)
- Fez 커뮤니티는 어떤 코드를 시도했는지 웹사이트에 보고하며 소거법으로 진행; 의도된 해법이 무엇인지 알 수 없다는 평. — [Engadget](https://www.engadget.com/2012/04/20/how-the-community-solved-fezs-hardest-puzzle/); Jesper Juul의 퍼즐 미학 논의 — [The Ludologist](https://www.jesperjuul.net/ludologist/?p=1496)
- **Noita 눈 메시지**: 동·서 평행세계에 9개 메시지(동 5, 서 4), 각 눈 글리프는 5방향 중 하나, 모드 비활성 시에만 등장. 커뮤니티 페이지에 따르면 개발자가 실제 정보를 담고 있다고 확인. Discord 채널과 r/Noita에서 작업, 이론 채택 기준은 "관찰된 모든 성질(예: 평평한 글자 분포)을 설명하는가". 장기 미해결. — [unsolved-puzzles: Noita eye puzzle](https://unsolved-puzzles.github.io/unsolved-puzzles/noita/eye-puzzle.html); [noita.wiki.gg Mysteries and Oddities](https://noita.wiki.gg/wiki/Mysteries_and_Oddities) (팬 위키 — 개발자 확인 주장은 2차)
- **Reddit The Button (2015)**: 60초 카운트다운, 누구든 누르면 전원에게 리셋. 2015-04-01 이전 생성 계정만, 계정당 1회. 누른 시점(초)에 따라 영구 색 플레어(보라 60–52 … 빨강 11–0, 회색 = 안 누름, 흰색 = 누를 수 없음). 색별 파벌("Emerald Council", "Violet Hand"), 회색 내 "Knights of The Button"이 더미 계정 풀로 0초 방지 → 계정 검증 실패 하나로 결국 0초 도달. 2015-04-01 ~ 06-05(약 2개월), 1,008,316 계정 참여. DB 오류로 타이머가 0이 된 적이 있어 음모론 촉발. — [Wikipedia: The Button](https://en.wikipedia.org/wiki/The_Button_(Reddit))
- The Button 플레어는 원래 설계에 없었고 팀이 넣을지 망설였다(제품 매니저 녹취). — [r/Upvoted 녹취 위키(미러)](https://redlib.ssps.io/r/Upvoted/wiki/transcripts-the-button-english) (미러 사이트, 신뢰도 중간)
- **r/place (2017)**: Josh Wardle(The Button 제작자, 후에 Wordle) 기획. 1000×1000 캔버스, 16색, 등록 사용자 1명이 픽셀 1개 후 대기(대개 5분으로 인용, 5–20분 가변이라는 출처도 있음). 약 72시간 후 종료, 100만+ 참여. 서브레딧·Discord에서 조직. — [Wikiwand: r/place](https://wikiwand.com/EN/R/place); [Know Your Meme 회고](https://knowyourmeme.com/editorials/meme-review/how-reddits-rplace-brought-the-internet-together-for-four-glorious-days-of-war-on-canvas) (쿨다운 수치 출처 간 불일치)
- **Twitch Plays Pokémon (2014)**: 처음엔 모든 채팅 명령이 바로 입력되는 Anarchy. 약 1주 후 Democracy 모드 추가(일정 간격으로 최다 득표 명령 실행; 간격 20초/30초로 출처 불일치). 대다수는 예측 불가한 Anarchy 선호, Democracy는 진행 불가 구간용 최후수단. 항의로 "start9" 스팸. 쓸모없는 Helix Fossil을 11일간 들고 다닌 것이 "Lord Helix" 신앙(Helixism)으로 발전 — 혼돈이 서사를 만듦. — [Game Informer](https://gameinformer.com/b/features/archive/2014/03/12/exploring-the-created-mythos-of-twitch-plays-pokemon.aspx); [Pacific Standard](https://psmag.com/environment/chaos-democracy-religion-world-twitch-plays-pokemon-75839); [Know Your Meme](https://knowyourmeme.com/memes/twitch-plays-pokemon)
- **Animal Well 토끼 벽화(간략)**: 50조각 퍼즐, 플레이어마다 1조각만 받으며 각 조각은 특정 다른 플레이어 집합과 연결되어 공유 필수. 발매 하루 만에 Discord에서 해결, 개발자 Billy Basso도 자기 조각 제출. 퍼즐은 "레이어" 구조(앞 레이어 해결 시 다음 개방). 비판: 게임 내에서 커뮤니티 퍼즐임이 잘 드러나지 않음. — [Push Square](https://pushsquare.com/news/2024/05/single-player-animal-well-has-a-secret-puzzle-that-requires-50-players-to-solve); [Dexerto](https://jamtest.dexerto.com/gaming/animal-well-players-complete-50-person-puzzle-just-one-day-after-launch-2715986); [r/metroidvania 스레드](https://lr.in.psf.lt/r/metroidvania/comments/1dulidt/a_late_game_puzzle_in_animal_well_sets_a)

### Inferences
- **지속 vs 소진 공식**: 수명 ≈ (탐색 공간 크기 ÷ 커뮤니티 병렬 처리량) + "논리적 해법 존재 확신". Fez는 공간이 작아 병렬 대입으로 18시간; Animal Well은 조각 수집만 하면 되어 하루; Noita는 공간이 거대 + 개발자 확인으로 수년 지속(단, 진척이 없으면 소수 매니아만 남음).
- **SHIFT 적용 — 페이싱 레버**: (1) 한 번에 1명·60초 = r/place 쿨다운과 동일한 "처리량 상한" 역할 → 커뮤니티가 아무리 커도 진행 속도는 설계자가 통제. (2) The Button식 "1인 1회·영구 기록"(교대 기록/쪽지)이 정체성·파벌을 만듦 → 작업자에게 교대 시점·도구 종류로 영구 배지를 주면 소속감. (3) TPP처럼 진행 모드 전환(관제실 권한 강화 vs 자유)을 커뮤니티가 투표하게 할 여지.
- **무차별 대입 방지**: 60초·1명 제약 자체가 Fez식 대입을 비싸게 만든다. 단 리플레이 보관소가 "누가 무엇을 시도했는지"를 자동 기록하므로 Fez 커뮤니티 웹사이트 역할을 게임이 대신함 → 소거법 협업이 자연 발생. 이를 의도적으로 퍼즐로 쓰려면 조합 공간을 "교대 수 × 2~3배" 정도로 맞추는 것이 합리적(추정).
- **커뮤니티 퍼즐임을 명시**: Animal Well 비판 교훈 — 건물 안에 "이 문은 여러 교대가 필요" 같은 명확한 표시가 있어야 함.

### Gaps
- Cicada 3301, Inscryption ARG, Last Call BBS, The Ultimate Cake Hunt에 대한 1차 출처는 예산 내에서 확보하지 못함.
- 시간 잠금(실시간 해금)·참여 인원 게이팅의 구체 사례(예: 서버 전체 누적 수치로 해금)에 대한 출처 미확보. (미검증 배경지식: Destiny 등의 커뮤니티 이벤트, Hollow Knight 관련 ARG 등이 있으나 인용 불가.)

---

## Q4. 릴레이/전언 메커닉과 지속 공유 세계: 정보 열화의 재미, 앞선 플레이어 행동이 이후를 바꾸는 설계

### Takeaway
릴레이 계열에서 "열화"는 실패가 아니라 재미의 원천이 될 수 있으나(전언 게임), 퍼즐 진행에는 열화를 견딜 수 있는 중복성(여러 채널, 리플레이 원본)이 필요하다. 지속 세계에서 앞사람의 흔적은 "도움(구조물·메시지)"과 "방해(트롤)"가 섞여 쌓이며, 이를 정리·평판화하는 계층이 필요하다.

### Cited Findings
- 데스 스트랜딩: 다른 플레이어 흔적(트레이스)이 열린 세계에 보이고, 그 영향이 탐험·이동을 바꿈; 좋아요로 긍정 반응. — [Game Developer](https://www.gamedeveloper.com/game-platforms/kojima-details-the-subtly-social-gameplay-of-i-death-stranding-i-); [GamesRadar](https://gamesradar.com/death-stranding-is-going-to-be-part-of-a-new-genre-of-gaming-called-strand-games-according-to-kojima)
- TPP: 수천 명 입력이 하나의 캐릭터를 조종하며 잘못된 행동(Helix Fossil 반복 확인)이 집단 신화가 됨 → 집단 열화가 서사를 생성. — [AV Club](https://www.avclub.com/praise-helix-the-strange-mythology-of-a-crowdsourced-p-1798266812)
- r/place: 다른 사람이 언제든 덮어쓸 수 있는 공유 캔버스 → 영역 방어·연합을 위해 외부 채팅(서브레딧·Discord) 조직이 필수. — [Know Your Meme 회고](https://knowyourmeme.com/editorials/meme-review/how-reddits-rplace-brought-the-internet-together-for-four-glorious-days-of-war-on-canvas)

### Inferences
- (미검증 배경지식) Gartic Phone/Telestrations는 그림↔문장 교대로 정보가 열화되는 과정을 마지막에 "전체 체인 재생"으로 보여 주는 것이 웃음 포인트. SHIFT의 "교대별 손그림 쪽지 체인"을 아카이브에서 연속 재생하면 같은 효과를 낼 수 있음 — "쪽지 계보 보기" 기능 제안.
- (미검증 배경지식) Mario Maker의 댓글(Miiverse 시절 코스 위 손글씨 댓글), Journey의 익명 동행, Sky의 촛불 메시지, Trackmania 고스트 등은 모두 "타인의 흔적을 같은 공간에 겹쳐 보이게" 하는 방식. 출처 미확보로 인용 불가.
- **SHIFT 적용**: 쪽지는 열화 채널(손그림, 1장), 리플레이는 무손실 채널, 관제실 표지판은 저대역 고신뢰 채널 — 세 채널의 신뢰도·대역폭이 서로 다르게 설계되면 각각이 필수 역할을 가짐. 쪽지만으로 풀리면 리플레이가 무의미, 리플레이만으로 풀리면 쪽지가 무의미하므로 퍼즐마다 "어느 채널만이 가진 정보"를 지정할 것.
- **앞선 교대가 건물을 바꿈**: 각 교대의 도구 사용이 다음 교대의 시작 상태를 바꾸는 구조(설치물 유지, 부순 벽 유지)는 Death Stranding 구조물 공유와 같은 축. 트롤(잘못 설치)을 감안해 관제실에 "철거/승인" 권한을 주면 r/place식 방어전이 생김.

### Gaps
- Gartic Phone, Telestrations, exquisite corpse, Mario Maker 댓글, Kingdom 왕관 계승, Journey, Sky, Chrono Cross, Trackmania 고스트에 대한 인용 가능한 설계 출처를 이번 예산 내에서 확보하지 못함.

---

## Q5. 리플레이를 "공부할 가치"가 있게 만드는 장치: 숨은 정보를 드러내는 고스트, 증거로서의 리플레이

### Takeaway
리플레이가 의미 있으려면 (1) 실시간 플레이 중에는 보이지 않던 정보가 리플레이에서만 보이거나, (2) 여러 시도를 겹쳐 보여 패턴이 드러나거나(Super Meat Boy 전체 사망 동시 재생), (3) 리플레이를 증거로 사용해 추론하고 그 추론을 검증하는 장치(Obra Dinn의 3개 묶음 확인)가 있어야 한다.

### Cited Findings
- Super Meat Boy: 레벨 클리어 후 승리 런만이 아니라 모든 시도를 동시에 재생 — 수많은 미트보이가 각자 실패 경로를 따라 톱날에 피를 튀기며 떨어짐. 개발자는 이 기능이 죽음을 일종의 보상으로 바꿨다고 봄; 어디서 막혔고 어떻게 극복했는지 시각적으로 보여 줌. 보스 레벨에는 리플레이 없음(포럼 보고). — [10 years of Super Meat Boy 회고](https://pawebpage.com/2330/archive/10-years-of-super-meat-boy-a-retrospective/); [God is a Geek 리뷰](https://godisageek.com/2010/10/super-meat-boy-review/); [Steam 포럼](https://steamcommunity.com/app/40800/discussions/0/343786745996446746)
- Return of the Obra Dinn: 운명(신원·사인) 추리는 3개 묶음으로만 정답 확인 → 하나씩 찍어 맞히기 불가. 60명 승무원 × 다양한 사인이라 무작위 추측은 거의 무의미. 증거가 충분하다고 게임이 판단할 때까지 얼굴이 흐리게 가려짐. 오답 직접 처벌은 없음 — 묶음 규칙은 처벌이 아니라 마찰. — [RPGFan](https://www.rpgfan.com/review/return-of-the-obra-dinn-2); [Archania 분석](https://archania.org/p/the-symbolic-world/symbolic-works/video-games/return-of-the-obra-dinn); [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn) (Lucas Pope 본인의 근거 발언은 미확보)

### Inferences
- **SHIFT 리플레이에 "현장에서 안 보이는 정보" 넣기**: 예) CCTV 시점에서만 보이는 바닥 그림자/배선, 작업자 화면엔 안 나오는 적외선 표시, 리플레이에서만 들리는 소리. → "이전 교대를 보면 비밀을 안다"가 성립.
- **겹쳐 보기(Super Meat Boy)**: 아카이브에서 여러 교대를 동시 재생하는 모드 → 많은 작업자가 같은 함정에서 죽는 위치가 히트맵처럼 보임 = 다크소울 혈흔의 집계판.
- **Obra Dinn 묶음 확인을 관제실 도장에 적용**: 관제실이 쪽지에 "검증" 도장을 찍을 때, 정답 확인을 단건이 아닌 묶음(예: 3장 동시)으로만 피드백하게 하면 추측 남발이 억제되고 리플레이 대조 추론이 필요해짐.
- **빨리감기 가능 = 시간 비용 감소**: 60초 × 수십 교대면 전량 시청이 부담 → 이벤트 마커(도구 사용, 사망, 쪽지 작성 시점)를 타임라인에 표시해야 "공부"가 현실적.
- (미검증 배경지식) Her Story/Telling Lies는 키워드 검색으로 클립을 찾게 해 "어떤 기록을 볼지 고르는 것" 자체가 퍼즐. SHIFT 아카이브에 "도구별/구역별 검색"을 주되 결과 수를 제한하면 같은 효과.

### Gaps
- Her Story, Telling Lies, Trackmania 고스트의 설계 출처 미확보. Lucas Pope의 3개 묶음 규칙에 대한 직접 발언 미확보.

---

## Q6. 함정: 한 명이 풀고 모두에게 스포일 (위키 문제), 스포일 저항 설계

### Takeaway
고정 정답 퍼즐은 커뮤니티가 크면 몇 시간~하루 만에 위키화된다(Fez 18시간, Animal Well 하루). 스포일 저항은 (a) 정답을 런/세션마다 바꾸되 논리는 유지(KTANE의 폭탄별 시리얼·구성에 따른 규칙 분기), (b) 정보 조각을 사람마다 다르게 배분(Animal Well 1인 1조각), (c) 처리량 상한(r/place 쿨다운, The Button 1인 1회)으로 확보할 수 있다. 다만 (b)는 "공유하면 끝"이라 공유 행위 자체가 퍼즐일 때만 의미가 있다.

### Cited Findings
- Fez 모놀리스: 커뮤니티 협업으로 18시간 만에 해결, 이후 정답이 공유되어 모두 동일 입력으로 획득. — [Kotaku](https://kotaku.com/a-look-back-at-fezs-unsolvable-black-monolith-puzzle-1794358854)
- Animal Well 벽화: 각 플레이어 조각이 달라 혼자 불가능하지만 커뮤니티가 하루 만에 완성 → 개인별 비밀은 공유 압력을 만들 뿐 수명을 보장하지는 않음. — [Dexerto](https://jamtest.dexerto.com/gaming/animal-well-players-complete-50-person-puzzle-just-one-day-after-launch-2715986)
- KTANE: 시리얼 번호 등 폭탄별 속성을 읽어 규칙을 적용 — 매 판 상태가 달라 "정답" 대신 "절차"를 배워야 함(시리얼 판독 문제로 대문자 O 제거). 숨은 페이싱 이벤트로 매 판 긴장 변동. — [Game Developer](https://gamedeveloper.com/design/finding-the-fun-in-bomb-defusal-with-i-keep-talking-and-nobody-explodes-i-)
- Obra Dinn 3개 묶음 확인: 개인 단위 추측 억제(스포일 저항은 아니지만 대입 억제). — [RPGFan](https://www.rpgfan.com/review/return-of-the-obra-dinn-2)
- The Button: 계정 생성일 제한 + 1인 1회로 대량 계정 조작 억제(그럼에도 더미 계정 풀이 등장). — [Wikipedia](https://en.wikipedia.org/wiki/The_Button_(Reddit))

### Inferences
- **SHIFT의 구조적 장점**: 건물이 하나이고 상태가 교대마다 누적되므로, "정답"이 아니라 "현재 건물 상태"가 퍼즐 → 외부 위키에 고정 해법을 적어도 다음 교대엔 상태가 달라 그대로 쓸 수 없음. 위키가 공략할 수 있는 건 "규칙(도면의 논리)"뿐이고, 그것은 관제실이 이미 가진 정보 → 위키가 관제실을 대체하지 않도록 도면의 "구체 배선/색 매핑"은 시즌(또는 층)마다 재섞기.
- **로그는 공개, 해법은 비공개**: 리플레이 아카이브는 모두에게 공개되는 "공식 위키" 역할을 하므로 외부 스포일보다 내부 학습을 유도. 단, 관제실 전용 도면 정보는 작업자 화면에 절대 나오지 않게(역할 비대칭 유지).
- **스포일 = 콘텐츠로 전환**: Fez처럼 "커뮤니티 해결 과정 자체"가 이벤트가 되도록, 커뮤니티 퍼즐 해결 시 건물에 영구 변화(새 층 개방, 벽화)를 남기면 늦게 온 사람도 결과를 "관람"할 이유가 생김.
- **역할 비대칭 깨짐 주의**: Discord 같은 외부 음성 채널이 생기면 표지판·쪽지 대역폭 제한이 무력화됨(KTANE/We Were Here는 원래 음성 허용이라 문제없음). 대응: 정보가 "시간 의존적"(이번 교대 상태)이어서 외부 채널로 전달해도 60초 안에 반영하기 어렵게 하거나, 외부 소통을 허용하되 게임 내 채널에만 있는 보상(도장 수, 기록 배지)을 둠.

### Gaps
- KTANE의 매뉴얼 버전/규칙 세트 교체 기능, 커뮤니티 모드(무작위 매뉴얼)에 대한 1차 출처 미확보.
- 런마다 정답을 바꾸는 퍼즐 게임(예: 로그라이크 퍼즐, Outer Wilds의 고정성 대비)에 대한 설계자 발언 인용 출처를 확보하지 못함.
- 비동기 멀티플레이에 관한 CHI/DiGRA 학술 논문은 예산 내에서 조사하지 못함.
