#!/usr/bin/env python3
"""Apply the dated editorial pass to share text only; never run during build."""
import importlib.util
import json
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REV = APP / 'content/policy-topics/revisions/2026-11-07-share-expansion'
spec = importlib.util.spec_from_file_location('builder', APP / 'scripts/build-expanded-topics.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
rows, originals, agents = {}, {}, {}
for batch in 'abc':
    originals.update({r['id']: r for r in json.loads((REV / f'before-batch-{batch}.json').read_text())})
    p = REV / f'proposed-{batch}.json'
    archived = REV / f'agent-proposed-{batch}.json'
    if not archived.exists():
        shutil.copy2(p, archived)
    agents.update({r['id']: r for r in json.loads(archived.read_text())})
for tid, original in originals.items():
    rows[tid] = {'id': tid, 'share_body': original['share_body'], 'share_source_urls': original['share_source_urls'], 'added_details': [], 'note': '保留原稿；未為篇幅硬添內容。'}


def excerpt(tid, uid, anchor, count=300, label=None, source=0, pack='main'):
    unit = json.loads((builder.PACKS[pack] / f'{uid}.json').read_text())
    at = unit['text'].find(anchor)
    if at < 0:
        raise ValueError(f'{tid}: missing anchor {uid}/{anchor}')
    rows[tid]['added_details'].append({'text': label or anchor, 'pack_id': pack, 'unit_id': uid, 'source_url': rows[tid]['share_source_urls'][source], 'quote': unit['text'][at:at + count]})


def append(tid, text):
    rows[tid]['share_body'] += '\n\n' + text
    rows[tid]['note'] = '新增來源內的不同細節，保留原始來源與500字元上限。'


append('t001', '政策也把權利整合、估價不透明與安置不足列為卡關原因。選擇退場者可獲法律諮詢；處理停滯案件時，除了催進度，也要協助住戶選擇下一步。')
excerpt('t001', 'u0001', '1.所有權整合困難', 260)
excerpt('t001', 'u0001', '選擇下車退場案件', 100)

append('t002', '住戶遷出後，符合安全條件的舊屋可先作社宅、青創或托育空間，等待社區整合。原基地重建後，部分出售挹注基金、其餘接續下一輪換屋；官方並註明初期房源不足，媒合門檻較嚴。')
excerpt('t002', 'u0001', '**五、舊屋包租代管', 230)
excerpt('t002', 'u0001', '(備註 : 1. 初期房源不足', 110)

append('t003', '聯合預審要先確認公益設施與都市計畫變更。政策也提出都發局與住都中心的待遇、績效獎金改革，把留住承辦人和改善流程一起做。')
excerpt('t003', 'u0001', '報核前聯合預審', 200)
excerpt('t003', 'u0001', '都發局與住都中心待遇提升', 130)

append('t007', '官網以「減生不減師」為原則，把少子化釋出的空間用來降低班級人數。行政減量的順序則是先刪除過時流程，再導入數位工具與自動化，避免只是把繁瑣工作搬到線上。')
excerpt('t007', 'u0002', '規劃於117學年度', 400)

append('t009', '推動藍圖把中期目標列為累計改善50所國小通學區，長期則以8年內完成全市150多所國小為方向。從試辦、檢驗到擴大改善，都是這項規劃的一部分。')
excerpt('t009', 'u0003', '**第二階段（中期）', 290)

append('t011', '官網另提出讓家長、校友與社會資源協助學校自設廚房、配置營養師或改善供餐環境，投入的資源以全校共享方式使用；飲食素養教材也納入規劃，讓孩子認識餐盤裡的食物。')
excerpt('t011', 'u0016', '例如由具備能力的家長', 340)

append('t012', '推動藍圖先盤點現有專線、據點和轉介斷點，建立受理與轉介流程，再擴充服務和陪伴人力。後續依各區需求逐步擴大據點及服務年齡，朝區區有站、支持0至18歲育兒家庭推進。')
excerpt('t012', 'u0009', '## 06｜推動藍圖', 1100)

append('t016', '官網另列文化幣、運動幣、分齡閱讀禮袋與家庭教育獎勵點數，也規劃「親子同行認證」，把獨立書店、小劇場、社區小店和在地活動串進家庭可參與的場域。')
excerpt('t016', 'u0011', '透過文化幣', 180)

append('t021', '官網列18至22歲為適用對象，並寫23歲可領；商周訪談則談到22歲使用，另提出上課與考試的配套。兩份來源對領用年齡的寫法有差異。')
excerpt('t021', 'u0007', '第一項｜城市青年基金', 430)
excerpt('t021', 'u0054', '讓他在22歲的時候再用這筆錢', 1000, source=1)

append('t022', '公費額度每月底歸零、月初重配，個人自費加值另計；申請基本額度不以修過AI課程為前提。課程加值由教師或學校申請，專案額度可支援研究、競賽、創業與公益應用。')
excerpt('t022', 'u0013', '額度每月底歸零', 390)

append('t025', 'AI政策頁列出研究院的四類任務：AI數位政策、都市發展、交通運輸，以及教育與照護。題目涵蓋公車路網、微電網與氣候韌性、失智及身障相關設計等，讓研究對準市府需要處理的具體問題。')
excerpt('t025', 'u0013', '台北研究院優先推進四類任務', 360)

append('t028', '官網的推動藍圖安排第一年試辦健身小巴，第2至3年擴大巡迴路線；同時盤點閒置公有空間，規劃每區新增3至5處特色運動據點。小巴、鄰近場地與專業指導分頭補位，讓參與運動少一點奔波。')
excerpt('t028', 'u0008', '第一階段（盤點與試辦', 550)
excerpt('t028', 'u0008', '巷口到河濱：', 240)

rows['t029']['share_body'] = rows['t029']['share_body'].replace('也鼓勵大樓增設淋浴設施', '也提出以綠建築與容積獎勵，鼓勵大樓增設淋浴設施')
excerpt('t029', 'u0003', '補與配套：', 280)

append('t030', '訪談以固定球友每週繳費、一起打球為例，也提到跑團能互相砥礪。場地開放之外，讓團體能固定使用、持續找到隊友和教練，也是他談到的運動支持。')
excerpt('t030', 'u0119', '只要你有一群固定的團體', 330, source=1)

# Remove an attribution that the selected share sources did not support.
rows['t031']['share_body'] = rows['t031']['share_body'].replace('訪談中他用「點、線、面」說明城市故事如何串聯，也談到', '訪談中也談到')
rows['t031']['note'] = '刪除需第三來源支持的點線面說法，保留當篇兩個來源。'

append('t033', '影視論壇中，他舉例可在捷運廊道結合既有場館，常態放映約20分鐘的紀錄片、動畫或獨立作品；也提出讓敬老卡、愛心卡點數兌換藝文消費，以及共用辦公空間、行政支援窗口等構想。')
excerpt('t033', 'u0446', '**[00:56:07] 沈伯洋**', 720, source=1)

append('t034', '官網把管理範圍往前拉到種植前的根域設計，再接健康監測與後續照顧；並規劃跨局處都市森林委員會、維運基金及市民回報平台，讓養護經費、責任與居民回饋都有銜接。')
excerpt('t034', 'u0006', '制定台北都市林自治條例', 270)
excerpt('t034', 'u0006', '從種植前的根域設計', 220)

append('t035', '水循環部分，官網舉出收集橋梁、建物排水，過濾後再利用的做法；也把都市林、文化徑與社區溝通平台放進水路規劃，讓水質改善和附近居民的生活一起討論。')
excerpt('t035', 'u0012', '**二、美感', 600)

append('t036', '維護方面，官網提出以上述5項指標每季評分公開，並讓維護預算與評分連動；另規劃YouBike 2.0E在08:00–10:00、17:00–19:00尖峰時段前30分鐘免費，搭配通勤路網。')
excerpt('t036', 'u0003', '**自行車通勤路網', 430)

rows['t037']['share_body'] = rows['t037']['share_body'].replace('薪資補貼也規劃連結服務可靠度與勞動條件', '薪資補貼也規劃從按行駛里程，轉向按服務可靠度與勞動條件')
append('t037', '路線安排則依據運量重整公車與捷運分工，低運量路段評估使用需求反應式運輸（DRTS）或小型巴士，將班表、路線和駕駛休息一起規劃。')
excerpt('t037', 'u0003', '低運量路段改以', 190)

append('t039', '交通政策簡報列出的路外停放空間包括公有、委外及媒合民間停車場，並提出合格業者一律適用，讓共享機車的接駁優惠和車輛停放一起處理。')
excerpt('t039', 'u0001', '停車場進駐', 120, pack='official-pdf')

append('t049', '數字台灣訪談說明，公車總站就在變電所預定地旁，可一併處理夜間充電需求；周邊再結合24小時數位圖書館與社區互動空間，作為北士科技術試驗場域的一部分。')
excerpt('t049', 'u0282', '我和地方議員跟台電討論出一個具體方案', 550)

rows['t018']['share_body'] = rows['t018']['share_body'].replace('；政策頁的服務對象與訪談提出的次數主張，分別保留來源', '')

rows['t060']['share_body'] = '傳統產業要用AI，先得知道工具能幫上哪一段工作。沈伯洋在市政Debug松提出AI教練構想：讓熟悉AI的人進入特定產業實習3至6個月，與業者一起工作、梳理流程，找出適合用AI處理的環節。確認需求後，AI人才再回到智庫開發工具，後續可經商業化或產品化提供產業使用。這項安排把現場經驗、需求確認與工具開發接起來，讓工作者使用合用工具，不必先成為AI專家。'
rows['t060']['added_details'] = agents['t060']['added_details']
rows['t060']['note'] = '整合3–6個月產業實習、確認需求及回智庫開發工具的順序。'

append('t064', '簡報列出象山、劍潭山與貓空三處中心，規劃裝備租借、置物櫃、更衣室、中英日韓導覽、即時步道狀態與生態季節導覽預約，讓出發前取得資訊、抵達步道口和裝備整理都有支援。')
rows['t064']['added_details'] = agents['t064']['added_details']

append('t065', '官網並註明初期房源不足，媒合門檻較嚴。住戶搬出後，符合安全條件的舊屋可先投入社宅、青創或托育用途；原基地重建後，部分出售挹注基金、其餘再投入下一輪，這是政策所描述的循環方式。')
excerpt('t065', 'u0001', '(備註 : 1. 初期房源不足', 180)
excerpt('t065', 'u0001', '**五、舊屋包租代管', 260)

append('t066', '幼教方面，官網以117學年度幼幼班每班10人、幼兒園24人為目標，並提出公立幼兒園專任主任制度；特教則重新檢視助理員配置，連結家庭一站通、心理諮商等家庭支持資源。')
excerpt('t066', 'u0002', '### 三｜幼教環境再提升', 650)

append('t068', '11點熱吵店訪談舉出的具體做法包括女性員警陪同，以及讓被害人以書面指認侮辱內容，避免再次被要求親口覆述；受理流程的調整，和案件本身的處理同樣受到關注。')
excerpt('t068', 'u0040', '女性員警', 600)

append('t074', '滯洪做法包括改造校園與公園、鼓勵建物設置防洪設施，並優先改善高風險節點。官網也把水徑與風廊帶的關係納入降溫目標，讓防洪、水循環與城市微氣候一起規劃。')
excerpt('t074', 'u0012', '**四、滯洪', 350)
excerpt('t074', 'u0012', '3.調節微氣候', 180)

append('t076', '他舉例用「台北車站一號、二號、三號」等名稱，整理成約6至8個清楚的站點；同時重新盤點公車路線，把站名辨識與路線安排一起處理。')
excerpt('t076', 'u0406', '台北車站一號', 300)

append('t077', '警示聲的具體想法包括讓蜂鳴或語音朝向有風險的位置，減少其他方向的干擾；也依時段調整音量，降低對沿線環境的影響。')
rows['t077']['added_details'] = agents['t077']['added_details']

append('t078', '官網列出六大實驗沙盒：數位孿生、地底膠囊、智慧垃圾處理、產學共生人才科技宅、無人載具與數位圖書館；並規劃連結石牌醫療、關渡生態與劍潭商圈，讓科技試驗有在地應用題目。')
excerpt('t078', 'u0013', '園區將規劃', 250)

for batch in 'abc':
    ids = [r['id'] for r in json.loads((REV / f'before-batch-{batch}.json').read_text())]
    (REV / f'proposed-{batch}.json').write_text(json.dumps([rows[tid] for tid in ids], ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'topics': len(rows), 'changed': sum(r['share_body'] != originals[tid]['share_body'] for tid, r in rows.items())}, ensure_ascii=False))
