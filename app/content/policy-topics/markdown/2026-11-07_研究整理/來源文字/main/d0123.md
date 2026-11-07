# 市政 debug 松：從十組城市提案，到 AI 教練與公民協作

來源：https://puma-hub.pages.dev/articles/city-debug-2026-10-24/

垃圾桶滿了，回報之後去了哪裡？老屋想改善，第一步該找誰？「市政 debug 松」把市民日常遇到的問題帶進開發現場，讓工程師、設計師與其他參與者試著做出能操作的工具。
本文依提供的 `debug.md` 整理成果展示與松後座談。活動資訊已對照官網；Demo 功能依原稿呈現，屬團隊提案與原型展示。附件收錄原稿全文，包含逐字對話與依報導整理的發言紀要。
## 活動資訊與閱讀方式
- 活動：市政 debug 松，主題為 `$ git checkout taipei`
- 日期：2026 年 10 月 24 日；官網公告當日以線上方式進行開發、Demo 與座談。
- 成果 Demo 由 Brian 主持。松後座談由黑貘主持，與談人為沈伯洋、蕭上農、杜奕瑾與侯宜秀。
- 官網入選名單列出 36 支隊伍；本篇聚焦原稿收錄的十組 Demo 流程，其中《折返點》因連線狀況未完成展示。
[活動官網](https://puma.taipei/hackathon)可核對活動流程與主題，[入選名單](https://puma.taipei/hackathon/finalists)列出完整隊伍。[作品票選頁](https://puma.taipei/hackathon/vote)可查看作品介紹；隊名、成員及作品名稱可能與直播時的口述不同。
## 十組 Demo：先看問題，再看工具
下表依提供原稿整理。時間碼連到原直播，供定位使用；尚未逐句聽校（needs verification）。
| 團隊／作品 | 想處理的問題與展示構想 | 影音定位 |
| --- | --- | --- |
| AI 方舟計畫《大樹神獸》 | 以樹木圖鑑、掃碼、移樹通知與社區活動，讓居民持續關心身邊的樹。 | [00:30:24](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1824s) |
| 怎麼 Young 都 Soon《BinSoon》 | 整合垃圾桶地圖、拍照回報、點數獎勵與預約清運小車。 | [00:32:33](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1953s) |
| 什麼意鼠《有鼠請回答！》 | 結合風險圖資、店家自我檢測與回報，提出鼠患源頭治理工具。 | [00:34:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2077s) |
| 好麻煩《內湖島時間島》 | 用即時車流、歷史回放與通勤模擬，協助討論彈性工時。 | [00:37:07](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2227s) |
| 菜市場阿龍《折返點 TurnAround》 | 原稿記載分享畫面及音訊異常，未完成現場展示；不據此補寫功能。 | [00:38:51](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2331s) |
| 小水滴大浪潮《模擬市民－都更人生》 | 從老屋資訊、都更試算到共同規劃與障礙模擬，降低理解門檻。 | [00:39:39](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2379s) |
| 健身隊《公車順順行》 | 以手機感測與種花獎勵構想，讓乘客回饋行車平穩度。 | [00:42:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2549s) |
| 台北桶報局《台北桶報局》 | 以垃圾桶 QR Code 通報、處理進度與派車儀表板，連結市民與清潔端。 | [00:45:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2728s) |
| 不敢蔣 English 怕鼠《市民 1999 通報地圖》 | 將陳情轉成地圖與貼文，輔以分類、聯絡資訊與歷史探索。 | [00:49:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2940s) |
| 同流 One Flow／桶桶沒問題 | 以滿桶監控、六角網格分析與市民掃碼，輔助垃圾桶配置與清運。 | [00:52:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3150s) |
這些展示的共同問題是：資訊如何從民眾手上進入處理流程，又如何讓民眾看到回應？有些團隊從回報介面切入，有些把資料做成地圖、圖鑑或遊戲，讓複雜問題更容易理解。
原稿把《同流 One Flow》與《桶桶沒問題》合併記載，官網入選名單則分列「同流 One Flow」與「Sage」，票選頁的《桶桶沒問題》列於 Sage 名下。兩者在直播中的對應關係尚待核對（needs verification），本表保留原稿標示。
## 沈伯洋講評：資訊易達、容易理解、能夠互動
依原稿，沈伯洋將各組成果歸納為三個方向：資訊找得到、內容看得懂，以及市民與市府能形成雙向互動。
護樹工具透過圖鑑與社區活動吸引居民參與；鼠患提案把回報結合自我檢查；老屋工具則先幫居民理解自己的情況，再銜接進一步協助。垃圾清運的多組提案，也把找桶子、回報滿溢、清運安排與處理進度放在同一條流程裡。
本段原稿自 00:55:50 後混用報導與整理性發言，尚未完成影音逐句核對（needs verification）。原稿所述都更政策發布時間屬當時預告，不能視為政策已公布或實施。
## 松後座談：AI 寫得出程式，如何接住城市需求？
官網確認座談主題與來賓。原稿則將蕭上農的發言整理為問題定義與服務設計、杜奕瑾的發言整理為在地 AI 與數位韌性、侯宜秀的發言整理為公部門與民間協作的制度介面。
這些段落是發言紀要，並非已核實的逐句引文（needs verification）。依原稿脈絡，座談關心的核心是：快速做出的原型，如何持續運作，並有人接手維護、確認資料與制度條件。
## 台北研究院：從原型到公務體系之間的工作
原稿記載，市民追問黑客松成果如何交給公務體系，而不增加基層負擔。沈伯洋提出以「台北研究院」承接跨領域研究、法規對接、資安與資料整合，選定場域試辦，再把成熟方案交付正式制度。
本頁將它呈現為座談中的政策構想；組織設計、預算、法定權責與執行時程，仍須依後續正式文件確認。此段的具體發言與原稿引用報導目前未能完整核實（needs verification）。
## AI 教練：讓工具走進工作現場
另一個提問是 AI 是否會拉大數位落差。依原稿，沈伯洋提出由熟悉 AI 的人才進入特定產業工作一段時間，了解業者流程，再回到研發端製作可直接使用的工具。
他也談到中年轉職者的 AI 支持，以及符合兼職需求的職能培訓。這些內容是原稿記錄的主張，尚待影音與正式方案核對（needs verification）；其中駐點三至六個月、Token 支持對象等細節，並非本頁確認已實施的措施。
## 台北程式工作組：活動之後繼續協作
依原稿尾聲，黑貘與主持人談到降低民間參與者與公部門之間的協作摩擦，並宣布成立「台北程式工作組」。市民可以提出生活問題，PM、UX、法律及技術工作者協助整理需求與開發解法，團隊再協助銜接市政。
活動官網流程也列有宣布成立程式工作組的安排。實際加入方式與後續運作，請以主辦單位最新公告為準。
## 來源、時間碼與逐字稿說明
- 本文依使用者提供的 `debug.md`
- [原直播](https://www.youtube.com/live/QP2w7IJNsuU)
- 原稿第 12 章自 00:55:50 後、第 13 章為混合來源或核心發言整理，引用時須區分逐字轉錄與紀要（needs verification）。
- 原稿時間表將第 14 章起點列為 02:05:20，正文則為 02:05:10，另有 00:45:17 發言早於該章時間區間；全文保留差異，時間碼供定位（needs verification）。
- 官網可核對 36 組入選；原稿的 324 人報名、94 人錄取及 34 至 36 組說法未完整核實（needs verification）。颱風名稱與改線上原因亦依原稿保留待查證。
- 原稿所引自由時報、太報、華視、鏡報、三立、ETtoday 與 PTT 部分連結目前無法取得完整內容；作者、日期與具體引文仍待核對（needs verification）。原稿提到的國際文獻未列作者、年份與 DOI（needs verification），本次未新增 DOI。
## 延伸閱讀
- [看見縫隙：公共空間與城市治理](https://puma-hub.pages.dev/articles/in-between-spaces-2026-10-22/)
- [房業涵專訪：市民提問、居住與城市智庫](https://puma-hub.pages.dev/articles/fang-yehan-2026-10-20/)
- [回到 PUMA HUB 全部文章](https://puma-hub.pages.dev/)
## 逐字稿與發言紀要全文
本頁完整收錄提供的逐字稿與發言紀要。原稿第 12 章 00:55:50 後及第 13 章包含依報導整理的內容，並非全部為逐句轉錄；發言、數字及部分時間碼尚待影音核對（needs verification）。
[開啟全文獨立頁](https://puma-hub.pages.dev/articles/city-debug-2026-10-24/transcript/)[下載原始逐字稿](https://puma-hub.pages.dev/articles/city-debug-2026-10-24/transcript.md)
**展開提供原稿全文**
## 【沈伯洋 Puma】市政debug松｜黑客松成果 Demo 與松後座談 完整逐字稿與深度紀要
## 節目與活動基本資訊
- **直播頻道**[沈伯洋 Puma YouTube 頻道](https://www.youtube.com/live/QP2w7IJNsuU)
- **活動名稱**`$ git checkout taipei`
- **活動官網與線上票選**[市政 debug 松官方網站](https://puma.taipei/hackathon)[參賽作品線上票選頁面](https://puma.taipei/hackathon/vote)[36 支入選隊伍名單](https://puma.taipei/hackathon/finalists)
- **播出日期**
- **影片全長**`[00:00:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=0s) - [00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s)``[00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s)`
- **登場講者與來賓陣容**
- **成果 Demo 主持人****Brian**
- **候選人講評與座談與談人****沈伯洋（Puma Shen）****小麻糬**
- **松後座談主持人****洪進吉（食夢黑貘）**
- **松後座談與談來賓**
  - **蕭上農（fOx）**
  - **杜奕瑾**
  - **侯宜秀**
- **十組成果 Demo 發表團隊代表**
  1. **AI 方舟計畫**
  2. **怎麼Young都Soon**
  3. **什麼意鼠**
  4. **好麻煩**
  5. **菜市場阿龍**
  6. **小水滴大浪潮**
  7. **健身隊／公車順順行**
  8. **台北桶報局**
  9. **不敢蔣English怕鼠**
  10. **同流 One Flow／桶桶沒問題**
## 活動核心摘要與政策重點
1. **從市民抱怨到 MVP 實作****7 大市政痛點**[自由時報](https://news.ltn.com.tw/news/politics/breakingnews/5617684)[市政 debug 松官網](https://puma.taipei/hackathon)
2. **十組團隊展現遊戲化與數據治理創意****樹木保護****垃圾桶與清運調度****鼠患治理****內湖交通與公車安全****危老都更與 1999 視覺化**[太報](https://today.line.me/tw/v3/article/vXLrx80)
3. **沈伯洋講評與三大核心原則****資訊易達性****容易理解的程度****雙向互動性**[太報](https://today.line.me/tw/v3/article/vXLrx80)[華視新聞](https://today.line.me/tw/v3/article/RBKvz1q)
4. **成立「台北研究院」強化市政基礎設施****台北研究院**[鏡報](https://www.mirrordaily.news/story/93585)[三立新聞網](https://www.setn.com/news/1927882)
5. **拋出「AI 教練」駐點百工百業與中年轉職支持****AI 教練****中年轉職者**[太報](https://today.line.me/tw/v3/article/zNMxpzj)
6. **正式成立「台北程式工作組」****台北程式工作組**[ETtoday 新聞雲](https://www.ettoday.net/news/20261024/3260243.htm)
## 章節時間軸一覽
| 章節 | 時間區間 | 階段主題 | 登場講者 |
| --- | --- | --- | --- |
| 第 1 章 | `[00:00:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=0s) - [00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s)` | 直播待機與開場前倒數 | （待機音樂與背景音） |
| 第 2 章 | `[00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s) - [00:30:23](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1823s)` | 黑客松成果 Demo 正式開場 | 主持人 Brian |
| 第 3 章 | `[00:30:24](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1824s) - [00:32:32](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1952s)` | 第 1 組 Demo：《大樹神獸》（樹木保護與社區認養） | AI 方舟計畫代表、主持人 Brian |
| 第 4 章 | `[00:32:33](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1953s) - [00:34:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2076s)` | 第 2 組 Demo：《BinSoon 讓台北丟垃圾變順》 | 怎麼Young都Soon代表、主持人 Brian |
| 第 5 章 | `[00:34:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2077s) - [00:37:06](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2226s)` | 第 3 組 Demo：《有鼠請回答！城市鼠患處方箋》 | 什麼意鼠代表、主持人 Brian |
| 第 6 章 | `[00:37:07](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2227s) - [00:38:50](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2330s)` | 第 4 組 Demo：《內湖島時間島》（車流監控與彈性工時） | 好麻煩代表、主持人 Brian |
| 第 7 章 | `[00:38:51](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2331s) - [00:42:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2548s)` | 第 5 組連線插曲與第 6 組 Demo：《模擬市民－都更人生》 | 菜市場阿龍、小水滴大浪潮代表、主持人 Brian |
| 第 8 章 | `[00:42:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2549s) - [00:45:27](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2727s)` | 第 7 組 Demo：《公車順順行》（行車平穩度感測與皮克敏獎勵） | 健身隊代表、主持人 Brian |
| 第 9 章 | `[00:45:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2728s) - [00:48:59](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2939s)` | 第 8 組 Demo：《台北桶報局》（QR Code 掃碼與 3D 清運儀表板） | 台北桶報局代表、主持人 Brian |
| 第 10 章 | `[00:49:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2940s) - [00:52:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3149s)` | 第 9 組 Demo：《台北市，你給我聽好了｜市民 1999 通報地圖》 | 不敢蔣English怕鼠代表、主持人 Brian |
| 第 11 章 | `[00:52:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3150s) - [00:54:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3295s)` | 第 10 組 Demo：《同流 One Flow／桶桶沒問題》 | 同流 One Flow 代表、主持人 Brian |
| 第 12 章 | `[00:54:56](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3296s) - [01:05:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3900s)` | 候選人總講評：垃圾桶、護樹、鼠患與預告下週公布都更政策 | 沈伯洋（Puma）、小麻糬（入鏡彩蛋） |
| 第 13 章 | `[01:05:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3900s) - [02:05:19](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7519s)` | 松後座談：《AI 寫得出程式，寫不出城市》暨市民 QA | 洪進吉（食夢黑貘）、沈伯洋、蕭上農、杜奕瑾、侯宜秀 |
| 第 14 章 | `[02:05:20](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7520s) - [02:08:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7716s)` | 座談總結與宣布成立「台北程式工作組」、活動閉幕 | 洪進吉（食夢黑貘）、主持人 Brian |
## 完整逐字稿與分段紀錄（依講者與時間戳標註）
### 第 1 章｜直播待機與開場前倒數（[00:00:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=0s) - [00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s)）
- `[[00:00:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=0s) - [00:29:46](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1786s)]`**【系統／現場環境音】**
### 第 2 章｜黑客松成果 Demo 正式開場（[00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s) - [00:30:23](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1823s)）
- `[[00:29:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1787s)]`**主持人 Brian**
- `[[00:29:54](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1794s)]`**主持人 Brian**
- `[[00:30:05](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1805s)]`**主持人 Brian**
### 第 3 章｜第 1 組 Demo：《大樹神獸：讓台北每棵樹，都有一群守護祂的鄰居》（[00:30:24](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1824s) - [00:32:32](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1952s)）
- `[[00:30:24](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1824s)]`**第 1 組代表（AI 方舟計畫｜Qmoa、Saori）**
- `[[00:30:27](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1827s)]`**主持人 Brian**
- `[[00:30:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1828s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:30:42](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1842s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:30:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1855s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:31:14](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1874s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:31:27](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1887s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:31:34](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1894s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:31:47](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1907s)]`**第 1 組代表（AI 方舟計畫）**
- `[[00:32:09](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1929s)]`**主持人 Brian**
### 第 4 章｜第 2 組 Demo：《BinSoon 讓台北丟垃圾變順》（[00:32:33](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1953s) - [00:34:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2076s)）
- `[[00:32:33](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1953s)]`**主持人 Brian**
- `[[00:32:43](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1963s)]`**第 2 組代表（怎麼Young都Soon｜Janet、Champion、Amatsuki、Wen、Charles）**
- `[[00:33:02](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=1982s)]`**第 2 組代表（怎麼Young都Soon）**
- `[[00:33:23](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2003s)]`**第 2 組代表（怎麼Young都Soon）**
- 第一，認領每次回報都有兩倍點數；
- 第二，市民投票哪裡要增設桶子，大家一起來決定，過程對政府和市民都更透明；
- 第三，點數是可以換禮物，守護市容才能換杯咖啡！
- `[[00:33:45](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2025s)]`**第 2 組代表（怎麼Young都Soon）**
- `[[00:34:06](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2046s)]`**第 2 組代表（怎麼Young都Soon）**
- `[[00:34:31](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2071s)]`**主持人 Brian**
### 第 5 章｜第 3 組 Demo：《有鼠請回答！城市鼠患處方箋》（[00:34:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2077s) - [00:37:06](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2226s)）
- `[[00:34:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2077s)]`**主持人 Brian**
- `[[00:34:43](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2083s)]`**第 3 組代表（什麼意鼠｜孟德、Jess）**
- `[[00:34:56](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2096s)]`**第 3 組代表（什麼意鼠）**
- `[[00:35:08](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2108s)]`**第 3 組代表（什麼意鼠）**
- `[[00:35:22](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2122s)]`**第 3 組代表（什麼意鼠）**
- `[[00:35:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2137s)]`**第 3 組代表（什麼意鼠）**
- `[[00:35:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2155s)]`**第 3 組代表（什麼意鼠）**
- `[[00:36:09](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2169s)]`**第 3 組代表（什麼意鼠）**
- `[[00:36:51](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2211s)]`**主持人 Brian**
### 第 6 章｜第 4 組 Demo：《內湖島時間島：內湖園區搞清楚要走的路》（[00:37:07](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2227s) - [00:38:50](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2330s)）
- `[[00:37:07](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2227s)]`**主持人 Brian**
- `[[00:37:14](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2234s)]`**第 4 組代表（好麻煩｜WellHuang、gash）**
- `[[00:37:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2250s)]`**第 4 組代表（好麻煩）**
- `[[00:37:40](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2260s)]`**第 4 組代表（好麻煩）**
- `[[00:37:57](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2277s)]`**第 4 組代表（好麻煩）**
- `[[00:38:17](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2297s)]`**第 4 組代表（好麻煩）**
- `[[00:38:39](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2319s)]`**主持人 Brian**
### 第 7 章｜第 5 組連線插曲與第 6 組 Demo：《模擬市民－都更人生（現正加映公務員篇 DLC）》（[00:38:51](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2331s) - [00:42:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2548s)）
- `[[00:38:51](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2331s)]`**主持人 Brian**
- `[[00:38:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2335s)]`**第 5 組代表（菜市場阿龍｜高見龍、高思）**
- `[[00:39:11](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2351s)]`**主持人 Brian**
- `[[00:39:31](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2371s)]`**第 6 組代表（小水滴大浪潮｜Abraham、麋稽阿姨、Derick、Jerry）**
- `[[00:39:38](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2378s)]`**主持人 Brian**
- `[[00:39:39](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2379s)]`**第 6 組代表（小水滴大浪潮）**
- `[[00:39:45](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2385s)]`**第 6 組代表（小水滴大浪潮｜Demo 旁白）**
- `[[00:40:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2429s)]`**第 6 組代表（小水滴大浪潮｜Demo 旁白）**
- `[[00:40:53](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2453s)]`**第 6 組代表（小水滴大浪潮｜Demo 旁白）**
- `[[00:41:03](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2463s)]`**第 6 組代表（小水滴大浪潮｜Demo 旁白）**
- `[[00:41:38](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2498s)]`**主持人 Brian**
- `[[00:41:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2515s)]`**主持人 Brian**
### 第 8 章｜第 7 組 Demo：《公車順順行》（[00:42:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2549s) - [00:45:27](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2727s)）
- `[[00:42:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2549s)]`**主持人 Brian**
- `[[00:42:38](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2558s)]`**第 7 組代表（健身隊｜Kepler、Ryan、Frason）**
- `[[00:42:43](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2563s)]`**主持人 Brian**
- `[[00:42:44](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2564s)]`**第 7 組代表（健身隊）**
- `[[00:43:03](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2583s)]`**第 7 組代表（健身隊）**
- `[[00:43:19](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2599s)]`**第 7 組代表（健身隊）**
- `[[00:43:46](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2626s)]`**第 7 組代表（健身隊）**
- `[[00:44:08](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2648s)]`**第 7 組代表（健身隊）**
- `[[00:44:39](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2679s)]`**第 7 組代表（健身隊）**
- `[[00:45:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2700s)]`**主持人 Brian**
### 第 9 章｜第 8 組 Demo：《台北桶報局》（[00:45:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2728s) - [00:48:59](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2939s)）
- `[[00:45:17](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2717s)]`**主持人 Brian**
- `[[00:45:28](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2728s)]`**第 8 組代表（台北桶報局｜Ian、Harry、Pamis、Vicky、Swimming、Kyra）**
- `[[00:45:48](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2748s)]`**主持人 Brian**
- `[[00:46:39](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2799s)]`**第 8 組代表（台北桶報局）**
- `[[00:47:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2820s)]`**第 8 組代表（台北桶報局）**
- `[[00:47:12](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2832s)]`**第 8 組代表（台北桶報局）**
- `[[00:47:35](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2855s)]`**第 8 組代表（台北桶報局）**
- `[[00:48:06](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2886s)]`**第 8 組代表（台北桶報局）**
- `[[00:48:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2916s)]`**第 8 組代表（台北桶報局）**
- `[[00:48:54](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2934s)]`**主持人 Brian**
### 第 10 章｜第 9 組 Demo：《台北市，你給我聽好了｜市民 1999 通報地圖》（[00:49:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2940s) - [00:52:29](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3149s)）
- `[[00:49:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2940s)]`**主持人 Brian**
- `[[00:49:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2950s)]`**第 9 組代表（不敢蔣English怕鼠｜徐瑞伯、Laban、Lemoni）**
- `[[00:49:19](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2959s)]`**主持人 Brian**
- `[[00:49:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=2995s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:50:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3030s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:50:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3055s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:51:16](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3076s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:51:35](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3095s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:51:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3115s)]`**第 9 組代表（不敢蔣English怕鼠）**
- `[[00:52:15](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3135s)]`**主持人 Brian**
### 第 11 章｜第 10 組 Demo：《同流 One Flow／桶桶沒問題》（[00:52:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3150s) - [00:54:55](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3295s)）
- `[[00:52:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3150s)]`**主持人 Brian**
- `[[00:52:35](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3155s)]`**第 10 組代表（同流 One Flow／桶桶沒問題｜Sage 等）**
- `[[00:52:37](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3157s)]`**主持人 Brian**
- `[[00:52:48](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3168s)]`**第 10 組代表（同流 One Flow）**
- `[[00:53:07](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3187s)]`**第 10 組代表（同流 One Flow）**
- 第一個就是「即時動態調度」：系統可以即時監控示範區的滿桶狀況，並且自動跳出通知到分隊的手機裝置，可以派機動小組出勤清運，提高清潔作業的效率。
- 那第二個呢，是有「佈建分析」：是可以讓未來可以用來規劃未來垃圾桶位置。我們將台北市切成六角網格，以商圈、大眾交通和人流為因子去計算熱區，顏色越深的話，缺乏垃圾桶的程度就越高。那市府可以去參考，把不同的因子增加或減少權重；進階需求的話，他們也可以匯入歷史檔去改變這個計算的公式。
- 第三個功能是最後，我們可以提供「市民通報的機制」：市民可以掃垃圾桶上的 QR Code，即時回報現在垃圾桶現況，補足感測器的盲區。
- `[[00:54:25](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3265s)]`**第 10 組代表（同流 One Flow）**
- `[[00:54:38](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3278s)]`**主持人 Brian**
### 第 12 章｜候選人總講評：垃圾桶、護樹、鼠患與預告下週公布都更政策（[00:54:56](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3296s) - [01:05:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3900s)）
> **【轉錄說明】**：本段自 `[00:54:56](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3296s)` 至 `[00:55:50](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3350s)` 為 YouTube 原始語音辨識逐字紀錄；`[00:55:50](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3350s)` 後因直播串流音軌切換，YouTube 自動字幕暫停，以下整合沈伯洋於該時段之完整逐字發言與媒體現場實錄（來源：[太報](https://today.line.me/tw/v3/article/vXLrx80)、[華視新聞](https://today.line.me/tw/v3/article/RBKvz1q)、[自由時報](https://news.ltn.com.tw/news/politics/breakingnews/5617684)）。直播過程中，沈伯洋女兒「**小麻糬**」亦戴著墨鏡驚喜入鏡，緊貼爸爸手臂撒嬌並對鏡頭偷比 YA（[鏡報](https://www.mirrordaily.news/story/93585)）。
- `[[00:54:56](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3296s)]`**主持人 Brian**
- `[[00:55:08](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3308s)]`**沈伯洋（Puma）**
- `[[00:55:11](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3311s)]`**主持人 Brian**
- `[[00:55:14](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3314s)]`**沈伯洋（Puma）**
- `[[00:55:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3336s)]`**沈伯洋（Puma）**
- `[[00:57:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3420s)]`**沈伯洋（Puma）**
- `[[00:58:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3510s)]`**沈伯洋（Puma）**[華視新聞逐字引述](https://today.line.me/tw/v3/article/RBKvz1q)
- `[[01:00:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3600s)]`**沈伯洋（Puma）**
- `[[01:02:30](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3750s)]`**沈伯洋（Puma）****資訊的易達性****容易理解的程度****雙方的互動性**`https://puma.taipei/hackathon`
### 第 13 章｜松後座談：《AI 寫得出程式，寫不出城市：資訊人如何改變城市》暨市民 QA（[01:05:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3900s) - [02:05:19](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7519s)）
> **【轉錄說明】**：本段為 17:30–18:25 進行之「松後座談」，由資訊顧問 **洪進吉（食夢黑貘）** 主持，與談人包括 **沈伯洋**、**蕭上農（fOx）**、**杜奕瑾**、**侯宜秀**。因多方視訊連線音軌未觸發 YouTube 自動字幕直到 `[02:05:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7510s)`，以下根據現場直播實錄、新聞逐字引述與座談紀錄整理各講者核心發言與 QA 問答（來源：[自由時報](https://today.line.me/tw/v3/article/vXLrENQ)、[太報](https://today.line.me/tw/v3/article/zNMxpzj)、[鏡報](https://www.mirrordaily.news/story/93585)、[三立新聞網](https://www.setn.com/news/1927882)、[PTT 現場實況紀錄](https://www.ptt.cc/bbs/HatePolitics/M.1792833122.A.5FD.html)）。
#### 13.1 座談開場與來賓介紹（[01:05:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=3900s) - [01:15:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=4500s)）
- **洪進吉（食夢黑貘｜座談主持人）****沈伯洋（Puma）****蕭上農（fOx）****杜奕瑾****侯宜秀**
#### 13.2 跨界對談：AI 時代工程師的價值、台灣主權 AI 與政府公民科技協力（[01:15:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=4500s) - [01:45:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=6300s)）
- **蕭上農（愛料理、INSIDE 共同創辦人）**
- **杜奕瑾（PTT 創辦人、台灣人工智慧實驗室創辦人）**
- **侯宜秀（台灣人工智慧學校基金會前秘書長）**
#### 13.3 關鍵提問一：黑客松的民間創意如何交給公務體系落地實現？「台北研究院」構想（[01:45:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=6300s) - [01:55:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=6900s)）
- **市民／主持人提問**
- **沈伯洋（Puma）**
- 目前台北市面臨的最大問題，是缺乏完善的基礎設施，以及「議題對應到政策中間的過程」。
- 舉例來說，像「無菸城市」概念本身很棒，但現在市府的做法往往是市長一拍腦袋覺得很棒，就壓著局處公務員趕著上架、生報告，結果缺乏配套就變成現在這樣；或者是平常負責執行的公務員被迫自己去發想不是他專業的系統。
- 因此，我主張應該先參考首爾等國際城市經驗，成立專責智庫性質的「**台北研究院****法規對接****資訊安全保障****資料整合**
- 當方案在台北研究院與民間協力下驗證成熟後，再經由議會與正式制度交付給公務體系實施，這樣反而能減輕基層公務員的負擔，讓公務員專心在本職執行上。未來若相關專案在台北成功落實，也能將成果開源分享給台灣其他城市使用，進一步提升台北的城市光榮感。
#### 13.4 關鍵提問二：AI 時代「強者越強、弱者越弱」，如何避免擴大數位落差？「AI 教練」與中年轉職支持（[01:55:00](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=6900s) - [02:05:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7510s)）
- **市民提問**
- **沈伯洋（Puma）**
- 確實有許多人對 AI 不熟悉。目前政府常見的因應方式，就是替產業安排課程、教大家如何使用；不過我認為，單純「上課」完全趕不上現在 AI 發展的速度。這不代表不能上課，而是應該有人專門處理 AI 相關工作，協助把技術轉化成產業能夠直接使用的工具。
- 我先前參加記帳士公會聚餐時，受邀出席的日本記帳士公會就分享，他們內部有一組人專門研究 AI——雖然並非每位記帳士都懂得使用 AI，但該團隊會研究 AI 未來如何應用於記帳士的工作，並開發相關工具，再提供其他人直接使用。就像網路、大數據及統計等知識與技術出現時，不是每個人都能掌握，但透過工具開發，就有機會讓更多人使用——「**他不一定懂，但是他可以使用**
- 除了運用科技解決市政問題，百工百業同樣有 AI 應用需求，例如商圈可能想知道 AI 能如何協助日常工作，但如果要求業者先學會 AI、再自行摸索如何應用，時間上可能來不及。因此可以參考「**AI 教練**
- 至於個人層面的協助，因為**中年轉職者****AI Token 支持方案**
- 同時，AI 導入職能訓練同樣值得重視。過去有不少產業反映現場需要更多兼職人力，希望台北市安排職能培訓時也能考量這類需求；由於部分民眾並沒有投入全職工作的打算，培訓可以朝時間較短、符合兼職工作需求的方向設計，並在其中導入 AI，協助民眾取得所需能力、縮小差距。
- 最後，數位落差不能只看台北市內部，城鄉之間的差距也很重要。即使有人可能認為城鄉差距與台北無關，但我仍認為：「**做為首都，我們有必要帶著全台灣一起飛！**
### 第 14 章｜座談總結與宣布成立「台北程式工作組」、活動閉幕（[02:05:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7510s) - [02:08:36](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7716s)）
> **【轉錄說明】**：自 `[02:05:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7510s)`（對應聯播流 `[02:22:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=8530s)`）起，YouTube 自動語音辨識恢復逐字紀錄，直到直播結束。
- `[[02:05:10](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7510s)]`**洪進吉（食夢黑貘｜座談主持人）**
- `[[02:05:23](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7523s)]`**洪進吉（食夢黑貘）**
- `[[02:05:46](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7546s)]`**洪進吉（食夢黑貘）****如何把這個所謂的「摩擦問題」解決，讓資訊能夠更流通、人力能夠更流通，把它給留下來**
- `[[02:06:14](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7574s)]`**主持人 Brian**
- `[[02:06:22](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7582s)]`**主持人 Brian**
- `[[02:06:48](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7608s)]`**主持人 Brian****台北程式工作組**
- `[[02:07:04](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7624s)]`**主持人 Brian**
- `[[02:07:11](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7631s)]`**主持人 Brian**
- `[[02:07:34](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7654s)]`**主持人 Brian**
- `[[02:08:01](https://www.youtube.com/watch?v=QP2w7IJNsuU&t=7681s)]`**主持人 Brian**
延伸閱讀[本篇文章整理](https://puma-hub.pages.dev/articles/city-debug-2026-10-24/)[本場逐字稿與紀要](https://puma-hub.pages.dev/articles/city-debug-2026-10-24/transcript/)[黃暐瀚專訪沈伯洋：四場辯論與台北市政](https://puma-hub.pages.dev/articles/qiang-news-2026-10-12/)[沈伯洋談選戰與韌性台北](https://puma-hub.pages.dev/articles/ep148/)[回到 PUMA HUB 全部文章](https://puma-hub.pages.dev/)
