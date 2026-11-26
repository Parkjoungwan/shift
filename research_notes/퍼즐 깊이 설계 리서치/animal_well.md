# Animal Well (Billy Basso / Shared Memory, 퍼블리셔 Bigmode, 2024-05-09) — 비밀·퍼즐 레이어링 설계

> 조사일 2026-11-16. 많은 1차 인터뷰 페이지(Thinky Games, Nintendo Life, Time Extension, GamesRadar)가 자동 수집을 403으로 막아서, 그 인용은 검색 결과 스니펫으로만 확인했습니다. 해당 항목에는 "(스니펫)"이라고 표시했습니다. GDC 2025 강연 "Developing at 5MB per Year"는 GDC Vault 회원 전용이라 본문을 확인하지 못했습니다.
> 기본 사실: 2024-05-09 Switch/PS5/PC 출시, Xbox는 2024-10-17. 2024년 8월 기준 약 65만 장(Basso 추정). D.I.C.E. Outstanding Achievement in Game Direction 수상 — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)

## Q1. 세 개의 레이어(일반 클리어 → 비밀 → 커뮤니티/ARG)와 Basso가 설명한 설계 방식

### Takeaway
Animal Well은 "여러 게임을 겹쳐 놓은" 구조입니다. L1은 메트로배니아(불꽃 4개 → 보스 → 1차 엔딩), L2는 알 64개(+65번째 알 → 2차 엔딩), L3은 비밀 토끼 16마리(일부는 게임 안에서 혼자 풀 수 없음), L4는 "broken messages"라는 극히 난해한 퍼즐 하나입니다. Basso는 같은 순간에 서로 다른 세 부류의 플레이어를 위해 설계한다고 말했습니다. 비밀은 정해진 틀 없이, 게임의 규칙을 하나씩 깨는 "이상 현상"으로 만들었습니다.

### Cited Findings
- 레이어 정의(공식 위키): L1은 네 가지 주 도구로 하는 표면 메트로배니아 탐험이고, 맵 사분면마다 하나씩 있는 불꽃 4개를 모아 비컨을 켜면 맨티코어 보스가 나옵니다. L2는 도구를 더 얻고 숨은 통로를 찾는 단계로, 주 수집품은 알이며 전부 모으면 65번째 알이 우주로 데려갑니다. L3의 일부 퍼즐은 위키 표현대로 "not solvable in the game itself"이고 외부 입력이 필요해 혼자 풀 수 없습니다. 주 수집품은 비밀 토끼이며 BDTP 퍼즐로 이어지고, 이를 풀면 거대 토끼가 나옵니다. L4는 플레이어들이 "broken messages"라 부르는 퍼즐 하나입니다 — [Animal Well Wiki: Layers](https://animalwell.wiki.gg/wiki/Layers)
- Wikipedia 정리: 1차 엔딩 뒤에 "레이어"가 세 개 더 있습니다. L2는 "discovery and secret-oriented players"를 위한 층(숨은 알, 두 번째 크레딧)이고, L3은 숨은 토끼와 ARG 요소로 이루어지며 한 퍼즐은 최소 50명의 부분 해답을 합쳐야 풀립니다. L4는 반복 플레이 도전(스피드런 등)과 설명되지 않은 행동으로 열립니다 — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- Basso(Thinky Games 인터뷰, 2024-05, 스니펫): 어느 시점이든 서로 다른 세 사람을 위해 설계한다고 말했습니다("designs for three different people at any given point") — [Thinky Games](https://thinkygames.com/features/interview-how-animal-well-is-using-secrets-and-mysteries-to-be-a-different-kind-of-metroidvania/)
- Basso(Edge 2025-04호 "Ghosts in the machine", 스니펫):
  - "these secrets were harder to design than your average puzzle"
  - "Each one is a kind of anomaly that's breaking the rules of the game in some unique way. It doesn't follow a framework."
  - 게임은 "multiple games that are superimposed on top of each other"이고, 비밀 찾기가 본인이 가장 신나는 층이지만 플레이어가 비밀에 관심을 갖게 하려면 탄탄한 기본 게임이 필요했다고 했습니다. Edge는 첫 레이어를 엔딩까지 비교적 짧은 길로, 가장 독창적인 비밀은 더 깊은 레이어에 있다고 묘사했습니다 — [Edge via Pocketmags](https://pocketmags.com/edge-magazine/april-2025/articles/ghosts-in-the-machine)
- Basso(Software Engineering Daily #1694, 2024-05):
  - "Animal Well is a game that offers no guidance to the player… it's all about learning how things work in the game without explanation."
  - "the game is just packed full of secrets. And the secrets have secrets. And there's hidden passages everywhere." — [SED transcript](https://softwareengineeringdaily.com/wp-content/uploads/2024/05/SED1694-Animal-Well.txt)
- Basso(TheGamer, 2024-09-12):
  - "It's a game about secrets and holding back information, and I think that's what makes it interesting to play."
  - "it's hard to market a game like that – I can't just show the best parts." — [TheGamer](https://www.thegamer.com/animal-well-interview-billy-basso-bigmode-dunkey/)
- Basso는 출시 후 콘텐츠 없이 하나의 완결된 작품으로 만들고 싶어 했고, 아이템으로 지역을 잠그는 것을 피해 플레이어마다 다른 시점에 같은 지역에 도달할 수 있게 했습니다(Wikipedia의 의역) — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- 최종 게임에는 인카운터 256개가 들어갔고, 개발 중 최소 500개를 잘라냈다고 합니다 — [GamesRadar](https://gamesradar.com/games/platformer/solo-dev-behind-breakout-metroidvania-hit-animal-well-says-his-game-has-256-encounters-but-he-had-to-cut-at-least-500-of-them-during-development); [PC Gamer](https://pcgamer.com/games/action/animal-wells-solo-dev-casually-reveals-that-the-breakout-metroidvania-left-at-least-twice-as-many-rooms-that-are-in-the-game-on-the-cutting-room-floor)
- 영감: Super Mario Bros. 2의 발견감을 구체적 영감으로 들었고, 『Shadow of the Colossus』 팬들이 숨은 보스를 찾던 일을 두고 "It was almost like a religious conviction that they wanted to find this missing part of the game."이라고 말했습니다 — [Game Developer, 2024-11-13](https://www.gamedeveloper.com/design/why-animal-well-s-home-brewed-engine-was-key-to-its-success); [Time Extension(스니펫)](https://www.timeextension.com/features/best-of-2024-the-making-of-animal-well-2024s-most-unique-metroidvania)

### Inferences
- 레이어마다 "목표 수집품"을 바꿔 다음 층의 존재를 알립니다(불꽃 → 알 → 토끼 → 메시지). 앞 레이어의 보상이 다음 레이어의 입구가 되는 구조입니다. L2 이후 세이브 파일에 토끼 아이콘과 숫자가 뜨는 것(Kotaku, Q4 참고)이 그 예입니다.
- "세 사람"은 L1=일반 플레이어, L2=완벽주의·탐험가, L3+=커뮤니티·ARG 해결자로 읽힙니다. 앞 층이 탄탄해야 뒤 층에 사람이 모인다는 전제입니다.

### Gaps
- Thinky Games·Nintendo Life 원문(403)의 "three different people" 전체 인용과 맥락은 확인하지 못했습니다.
- GDC 2025 강연에서 비밀 설계를 구체적으로 다룬 부분도 확인하지 못했습니다(Vault 유료).

## Q2. 커뮤니티 퍼즐: 토끼 벽화, 협력, 해결 속도와 조직 방식

### Takeaway
L3의 Bunny Mural은 플레이어마다 50조각 중 한 조각만 보여 줍니다. 그래서 정보를 모으지 않으면 원칙적으로 풀 수 없습니다. 커뮤니티는 Discord에서 조각을 모아 출시 약 하루 만에 풀었습니다. 출시 전에도 트레일러에 숨긴 퍼즐을 Discord에서 공동으로 풀었습니다. Basso는 일부 퍼즐이 몇 년 걸릴 것으로 예상했지만, 협업 덕분에 첫 달 안에 대부분 풀렸습니다. L4는 Discord에서 브루트포스로 풀렸습니다.

### Cited Findings
- 벽화: 각 플레이어는 한 조각만 받고 퍼즐에는 약 50조각이 필요해, 조각을 모아야 합니다. Discord 유저 CruM이 처음 완성했습니다. 보상은 비밀 토끼 #1이고, Basso 본인도 자기 조각을 제출했습니다 — [Dexerto(미러)](https://jamtest.dexerto.com/gaming/animal-well-players-complete-50-person-puzzle-just-one-day-after-launch-2715986); [TechRaptor](https://techraptor.net/gaming/guides/animal-well-bunny-mural-guide); [Robots Over Dinosaurs](https://robotsoverdinosaurs.net/animal-well-contains-a-hidden-puzzle-that-requires-at-least-50-people-to-complete)
- 해결 속도: 출시 다음 날 거의 완성됐고(Dexerto 제목 "complete 50-person puzzle just one day after launch"), 정식 출시 24시간 안에 풀었다는 보도도 있습니다 — [Dexerto(미러)](https://dexerto.pages.dev/posts/animal-well-players-complete-50-person-puzzle-just-one-day-after-launch)
- Kotaku: 세이브 파일에 조각이 하나만 보여 혼자서는 풀 수 없습니다. 혼자 하는 사람을 위한 커뮤니티 도구 "bunnymuralhelper"가 있고, 기사는 다른 플레이어와 팁을 교환하라고 권합니다. 다만 위키는 이 도구 링크를 같은 맥락에서 소개하지 않았습니다 — [Kotaku](https://kotaku.com/animal-well-guide-tips-layers-explained-1851532515/4)
- Basso(PAX West 인터뷰, 스니펫): 벽화는 기술적으로 혼자서도 풀 수 있지만 집단으로 풀도록 의도됐다는 취지입니다("It's possible to solve on your own… but it's meant to be solved collectively."). 팬들이 기대 이상으로 해 줬다는 뜻의 "going above and beyond"라는 감사도 남겼습니다 — [Boss Rush PAX 2023](https://bossrush.net/2023/09/03/pax-2023-boss-rush-interview-with-animal-well-developer-billy-basso/) (검색 요약 기준이라 원문 대조는 못 했습니다)
- 출시 전 ARG: 2022년 6월 Day of the Devs 공개 뒤, 수백 명이 Discord에 모여 발표 영상 속 퍼즐을 함께 풀었습니다. Basso는 일부 퍼즐이 몇 년 걸릴 것으로 예상했지만, 수천 명이 협업해 첫 달 안에 풀었습니다 — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- Basso는 홍보 채널 곳곳에 퍼즐을 숨겼습니다. 퍼블리셔 측(Dan Adelman)은 리뷰어 전용 Discord를 열어 평론가들이 정보를 공유하고 특정 퍼즐을 함께 풀게 했습니다. 처음부터 커뮤니티 해결을 전제한 설계였다고 합니다 — [Game Rant 등 검색 요약](https://gamerant.com/animal-well-bunny-mural-solution-secret-rabbit-puzzle-control-panel/) (원문 대조 안 함)
- L4: Discord 플레이어들이 정답 경로를 브루트포스로 찾아 "Time Capsule Island"를 열었습니다. 열린 틈은 세이브 사이에 유지되지 않습니다. 타임캡슐을 열면 Basso, Adelman, videogamedunkey의 음성 파일이 재생됩니다 — [TechRaptor](https://techraptor.net/gaming/guides/animal-well-strange-character-solution-guide); [Wiki: Time capsule](https://animalwell.wiki.gg/wiki/Time_capsule)
- 해킹 방지: 해킹으로만 얻을 수 있는 "cheater rabbit" 9마리를 넣어, 해킹으로 BDTP를 푸는 것을 막았습니다 — [Wiki: Secret rabbits](https://animalwell.wiki.gg/wiki/Secret_rabbits)
- Basso(2024-11): "there are some things the community hasn't found"라고 해 미발견 요소가 남았음을 시사했습니다. 깊은 콘텐츠까지 간 플레이어들이 "all seemed to really resonate with it"이라고도 했습니다 — [Game Developer](https://www.gamedeveloper.com/design/why-animal-well-s-home-brewed-engine-was-key-to-its-success)

### Inferences
- 벽화는 "한 사람이 모을 수 없는 정보"를 의도적으로 쪼개 플레이어에게 나눠 준 사례입니다. 50이라는 숫자는 커뮤니티 규모로는 금방 채워지고, 혼자서는 사실상 불가능한 선입니다. 그래서 해결 속도가 하루 단위로 빨랐습니다.
- 개발자도 "한 조각"을 들고 참여했습니다. 창작자가 같은 규칙 아래 참여자로 서는 연출이 커뮤니티 결속에 기여했을 것으로 보입니다.
- 릴레이 플랫폼에 주는 시사점: 교대마다 다른 단서 조각(예: 시드로 정해지는 "그 교대만의 벽화 조각")을 주고, 남긴 그림 메모나 리플레이로만 다음 사람에게 전달되게 하면 벽화 구조를 게임 안에서 닫을 수 있습니다. Animal Well은 외부 Discord에 의존했지만, 이 플랫폼은 메모·리플레이가 그 공유 채널 역할을 맡습니다.

### Gaps
- 벽화 조각이 세이브별로 어떻게 생성되는지(시드나 해시)는 1차 출처에서 확인하지 못했습니다.
- 커뮤니티가 스프레드시트를 썼는지 등 구체적인 조직 방식, 그리고 L4가 풀린 정확한 날짜와 소요 기간도 확인하지 못했습니다.

## Q3. 여러 용도의 도구와 지식 게이트(Metroidbrainia)

### Takeaway
Basso는 무기나 큰 업그레이드 대신 슬링키·요요·비눗방울 막대·프리스비 같은 "이미 검증된 장난감 상호작용"을 고성능 물리 시뮬레이션 위에 올렸습니다. 도구 하나가 이동, 퍼즐, 적 처리, 비밀 해법에 겹쳐 쓰입니다. 원래 쓰임 외의 용도는 L2~L4에서 새로 의미를 얻습니다.

### Cited Findings
- Basso:
  - "Didn't want to give you anything that felt explicitly like a weapon or like a big upgrade."
  - "you had to… use your brain to… figure out how they're useful."
  - "I'm trying to… make the items more and more technically interesting than a lot of Metroidvania abilities." — [SED #1694](https://softwareengineeringdaily.com/wp-content/uploads/2024/05/SED1694-Animal-Well.txt)
- Basso: "Once I get a cool system working, then I can play around with it and see what it allows for." 슬링키·요요·버블 완드·프리스비 같은 장난감을 차용한 이유로는 "That's already a proven interaction."을 들었습니다 — [Game Developer, 2024-11-13](https://www.gamedeveloper.com/design/why-animal-well-s-home-brewed-engine-was-key-to-its-success)
- 예시 — 디스크(프리스비)의 용도:
  - 던진 디스크에 올라타 수평 이동 수단으로 씁니다.
  - 개는 디스크를 쫓느라 무해해집니다. 개 구역 전반부 통과에 필수입니다.
  - 벽 스위치와 수평 버튼을 칩니다. 스위치는 올바른 방향에서 맞혀야 합니다.
  - 벽에 튕기고, 팬이나 고래의 물줄기를 타고 상승하며, 얇은 틈(disc slot)을 통과해 숨은 스위치를 칩니다.
  - 종유석은 부수지만 금속 가시는 못 부수고, 덩굴에 막힙니다.
  - 유령 개는 디스크를 쫓아오며, 나중에 Mock Disc로 바꿔치기해야 합니다. — [Wiki: Disc](https://animalwell.wiki.gg/wiki/Disc)
- 도구 획득 경로 자체가 레이어와 엮여 있습니다(위키 Tools):
  - 알 8개를 모으면 Animal flute, 32개를 모으면 Top이 보상입니다.
  - Remote, UV lantern, B. ball은 메달(S/E/K)을 동물 석상에 넣어 엽니다.
  - Wheel은 스라소니 새끼 5마리를 구하면 얻습니다.
  - B.B. wand는 클리어 후 업그레이드입니다. — [Wiki: Tools](https://animalwell.wiki.gg/wiki/Tools)
- 지식 게이트 예(L4 메시지):
  - 스라소니 방에서 Lynx 곡을 피리로 연주하면 바퀴 우리를 일찍 열 수 있습니다. 노래라는 지식이 열쇠입니다.
  - 벌새를 B.B. wand 거품으로 압도하면 메시지가 나타납니다. 이동용 도구를 적 상호작용에 쓰는 예입니다.
  - 캥거루를 가두고 폭죽을 여러 발 던집니다. — [Wiki: Broken messages](https://animalwell.wiki.gg/wiki/Broken_messages)
- Kotaku: L3는 탐험보다 암호 해독이 중심이며, Animal Flute와 배경 디테일 판독을 자주 요구합니다 — [Kotaku](https://kotaku.com/animal-well-guide-tips-layers-explained-1851532515/4)
- SED 인터뷰: 시퀀스 브레이크 다수를 "I'm already… aware of and sort of intentionally left in the game."이라며 의도적으로 남겼습니다 — [SED #1694](https://softwareengineeringdaily.com/wp-content/uploads/2024/05/SED1694-Animal-Well.txt)

### Inferences
- "검증된 장난감"을 쓰면 튜토리얼 없이도 기본 용도가 직관적으로 전달됩니다. 그 덕분에 물리 시스템에서 나오는 2차 용도(디스크 타기, 거품 발판)가 "내가 발견했다"는 느낌을 줍니다.
- 릴레이 플랫폼 적용: 60초 교대라면 도구 수는 적게 두고 상호작용 규칙(반사, 상승, 틈 통과, 적 유인)을 풍부하게 하는 편이 좋습니다. 다른 사람의 리플레이에서 처음 보는 사용법을 배우는 것이 지식 게이트의 사회적 버전이 됩니다.

### Gaps
- B. wand, 요요, 슬링크, 팽이, 랜턴, Remote, UV의 세부 다용도는 개별 위키 페이지를 수집하지 못해 출처로 확보하지 못했습니다. 일반적으로 알려진 예(거품을 발판으로, 랜턴과 유령의 상호작용 등)는 미검증입니다.

## Q4. 정보를 눈앞에 숨기는 법: 환경 패턴, 벽화, 소리, 빛과 어둠, 그리고 비밀이 있다는 신호

### Takeaway
단서는 배경 벽화, UV로만 보이는 그림, 맵과 어긋나는 지형, 피리 곡, 바코드나 출력물처럼 다양한 매체에 흩어져 있습니다. 비밀의 존재는 "빈 자리"로 알립니다. 우주 방의 토끼 석상 배열, 세이브 파일의 토끼 카운터, 집 안 포스터가 그 예이고, 해법은 알려 주지 않습니다.

### Cited Findings
- 비밀 토끼 16마리의 이름(Mural, Vine, Tutorial, Pillar, UV, Fish, Ghost, Spike, Duck, Dream, Bulb, Floor is lava, TV, Barcode/Origami, Ghost dog, Crow)이 단서 매체의 다양성을 보여 줍니다. 일부 토끼에는 피리 곡이 필요합니다. 토끼는 우주 방의 각 석상 바로 왼쪽에 나타나는데, 3·6·16·19번째 석상 앞에는 토끼가 없습니다 — [Wiki: Secret rabbits](https://animalwell.wiki.gg/wiki/Secret_rabbits)
- 신호 장치: L2 이후 세이브 파일에 토끼 아이콘과 숫자가 표시됩니다. L3 이후에는 L1에서 찾은 집에 새 퍼즐이 나타나 비행 방향을 알려 줍니다 — [Kotaku](https://kotaku.com/animal-well-guide-tips-layers-explained-1851532515/4)
- L4 해법 매체: 메시지 8개를 집 안의 색깔 포스터로 배열하면 경로가 됩니다. 이 경로를 거대 토끼 신전 가장 왼쪽 화면부터 따라가면 타임캡슐에 닿습니다 — [Wiki: Broken messages](https://animalwell.wiki.gg/wiki/Broken_messages). Office에서 UV 랜턴을 쓰면 L4 단서가 더 나온다는 반론, 번호 화살표와 귀 상태로 4진법 표를 만들었다는 플레이어 보고도 있습니다 — [Steam 토론, 2024-05-14~16](https://steamcommunity.com/app/813230/discussions/0/4365754575405326904/)
- "Floor is lava" 토끼는 게임 안 단서로 풀 수 있다는 반론이 있습니다. 물에 빠진 뒤 저장되지 않는 위치, 맵과 맞지 않는 터널이 그 단서입니다 — 같은 Steam 스레드(Jet Uppercut)
- Barcode/Origami 토끼는 출력하거나 바코드 리더가 필요합니다. 스캐너가 흰 바탕에 검은 바코드만 읽어서 반전 옵션이 필요했다는 불만이 있었습니다. 게임 밖 물리 매체로 퍼즐이 확장된 사례입니다 — 같은 Steam 스레드(apocalyptech, Ninethousand)
- Game Informer: "masterclass of environmental design" — [Wikipedia 경유](https://en.wikipedia.org/wiki/Animal_Well)
- Basso의 "you've got to really have the whole level in your mind"는 레벨 전체를 하나의 단서망으로 설계한다는 말입니다 — [TheGamer](https://www.thegamer.com/animal-well-interview-billy-basso-bigmode-dunkey/)

### Inferences
- "빈 받침대" 패턴(채워지지 않은 석상, 카운터, 포스터)은 정답 없이도 "더 있다"는 신호를 줍니다. 다만 일부러 비워 둔 석상은 Steam 스레드에서 "unnecessary red herring"이라는 비판을 받았습니다(Q6 참고).
- 릴레이 플랫폼 적용: 공유 월드에 "N개 중 k개 채워진" 공용 진행 표시를 두면, 교대자 각자는 한 칸만 채워도 전체 진척을 볼 수 있습니다.

### Gaps
- Thinky Games의 환경 디자인 기사(https://thinkygames.com/features/how-animal-wells-environmental-design-taps-into-our-need-for-puzzle-solving-satisfaction/)는 403이라 원문 예시를 확보하지 못했습니다.
- 개별 토끼(Duck, Dream, Bulb, Crow 등)의 획득 방법 세부도 확보하지 못했습니다.

## Q5. 시간, 리듬, 장기 관찰, 그리고 상태 지속

### Takeaway
확인된 시간 요소는 실시간 계절 이벤트보다 "누적 카운터와 플레이타임 조건" 쪽입니다. 걸음 수 100, 과일 100개, 60분 안에 두 번째 시계 도달, 다람쥐에게 5번 몰래 다가가기 같은 조건이 그렇습니다. 피리 곡이 리듬과 음 시퀀스 해법을 맡습니다.

### Cited Findings
- L4 메시지 조건:
  - 페도미터: 우물 꼭대기의 큰 페도미터에서 정확히 100걸음을 맞추면 상자가 열립니다.
  - 과일: 체력이 가득한 상태에서 피해 없이 과일 100개를 먹습니다.
  - 다람쥐: 5번 몰래 다가갑니다.
  - 스피드런: 60분 안에 두 번째 시계에 도착하면, 세 번째 문(90분 문)의 행동 설명에 메시지가 뜹니다.
  - 카멜레온: 하트 9개 이상(그라운드호그 엘릭서의 골든 하트 포함)으로 먹히고도 살아남습니다. — [Wiki: Broken messages](https://animalwell.wiki.gg/wiki/Broken_messages)
- Wikipedia: L4는 반복 플레이 도전(스피드런 등)과 설명되지 않은 행동으로 열립니다 — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- 패시브 아이템 Pedometer, Stopwatch, Stamps, Pencil이 있어 관찰과 기록 도구로 쓰입니다 — [Wiki: Items](https://animalwell.wiki.gg/wiki/Items)
- 타임캡슐 섬으로 가는 길은 세이브 사이에 유지되지 않습니다 — [TechRaptor](https://techraptor.net/gaming/guides/animal-well-strange-character-solution-guide)

### Inferences
- 누적 카운터 조건(정확히 100걸음, 연속 100개)은 플레이어가 "숫자가 의미 있다"고 의심하게 만드는 장치입니다. 릴레이 맥락에서는 "전 교대들의 누적 걸음이나 행동 수가 특정 값에 도달하면 열리는 문"으로 바꾸면 세대를 넘는 협력이 됩니다.
- 시계와 문 구조는 현재 세션 플레이타임 조건으로 보입니다. 60초 교대 구조라면 "누적 교대 수"나 "월드 시간"으로 치환할 수 있습니다.

### Gaps
- 실시간 시계, 계절, 요일 기반 이벤트가 있는지는 출처로 확인하지 못했습니다. 유령과 불꽃의 행동 패턴(랜턴, 폭죽에 대한 반응)의 세부도 출처를 확보하지 못했습니다.
- 시계와 문 메커니즘(정확히 무엇이 몇 분에 열리는지)은 위키 단편 외에는 확인하지 못했습니다.

## Q6. 비판과 한계: 너무 난해하다는 반응과 Basso의 균형 잡기

### Takeaway
L1·L2는 높게 평가받았습니다(Metacritic 88~90, OpenCritic 98% 추천). 반면 L3·L4는 혼자 풀 수 없거나 게임 밖 매체가 필요하고, "데이터마이닝 없이 불가능"하며 미완성처럼 느껴진다는 비판을 받았습니다. 옹호 측은 이것이 의도된 공동 해결 설계이며, 모두가 전부 풀 필요는 없다고 봅니다.

### Cited Findings
- Steam 스레드 "The later puzzles feel kind of unfinished or rushed"(2024-05-14~16):
  - 엔딩이 토끼 20마리를 암시하는데 실제로는 16마리입니다.
  - L4는 "a bunch of random nonsense actions you could never hope to figure out without datamining"이라는 평을 들었습니다.
  - 불공정한 퍼즐로 뒤집힌 알, 덩굴 뒤 토끼 곡, Dream 토끼, 오리가미/바코드, 벽화가 꼽혔습니다.
  - 벽화는 오프라인으로 풀 수 있다는 원칙을 깹니다: "the fact you HAVE to look up the puzzle was a big disappointment."
  - UV 벽화와 빈 석상은 "unnecessary red herring"이라는 비판을 받았습니다.
  - 반론: 단서는 있지만 수평적 사고가 필요하다, L4는 발견되라고 만든 게 아니어서 아름답다, 마케팅이 "layers"를 언급해 데이터마이닝과 '전부 풀어야 한다'는 기대를 불렀다, Tunic과 VVVVVV에 대한 오마주다. — [Steam 토론](https://steamcommunity.com/app/813230/discussions/0/4365754575405326904/)
- 평론: Game Informer는 L1 마지막 구간을 "stale"하다고 했고, GameSpot은 사망 후 백트래킹이 고되다고, PC Gamer는 지도가 쓰기 어렵다고 지적했습니다 — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- Basso의 균형 장치:
  - 1차 엔딩까지는 비교적 짧고 탄탄한 기본 게임으로 만들었습니다(Edge, 스니펫).
  - 벽화는 "혼자도 기술적으로 가능"하게 남겼습니다(PAX 인터뷰 요약).
  - 해킹 방지용 가짜 토끼를 넣었습니다(위키).
  - 플레이테스트로 맞췄습니다: "just a lot of play testing… watching people play a lot… There's no trick that I really know." — [SED #1694](https://softwareengineeringdaily.com/wp-content/uploads/2024/05/SED1694-Animal-Well.txt)
- 사전 정보 없이 하라는 권고: "The less you know going into it, the better." — [VideoGamesGood PAX West 2023](https://www.videogamesgood.com/post/billy-basso-beautiful-pixel-platformer-animal-well-pax-west-2023-hands-on-interview)

### Inferences
- 교훈 1: 층이 깊어질수록 "혼자 풀 수 있는가"라는 약속을 명시적으로 바꿔야 합니다. Animal Well은 이를 암묵적으로 처리해, 오프라인 원칙을 기대한 플레이어에게 배신감을 줬습니다.
- 교훈 2: 빈 슬롯이나 석상처럼 "더 있다"는 신호가 실제로 채워지지 않으면 레드 헤링 불만이 생깁니다. 신호와 실재를 일치시켜야 합니다.
- 교훈 3: 출력이나 바코드 같은 외부 매체 의존은 플랫폼과 기기 차이로 공정성을 해칩니다. 릴레이 플랫폼은 공유 메모와 리플레이 안에서 정보 교환을 닫는 편이 안전합니다.
- 교훈 4: 커뮤니티의 해결 속도는 설계자 예상(몇 년)을 크게 앞질렀습니다(첫 달). 집단 퍼즐은 참여자 수에 비례해 빨리 풀리므로, 최상층은 데이터마이닝에 강하도록 서버 측 상태나 시드 분산으로 만들어야 오래 버팁니다.

### Gaps
- Basso가 L3·L4 난이도 비판에 직접 답한 인터뷰 인용은 찾지 못했습니다.
- Wikipedia의 "몇 년 예상 vs 첫 달 해결" 원 출처 인터뷰도 확인하지 못했습니다.
