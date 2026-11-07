#!/usr/bin/env python3
"""Build the visual-reading handoff from pages actually displayed with view_image.

This is a temporary, local handoff builder. It never edits the downloaded source
tree; it reads the current official manifest and writes only the two handoff JSON
files in 補充文字/.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "00_來源資料" / "2026-11-06_更新版01"
MANIFEST_PATH = BASE / "官方政策" / "manifest.json"
OUT = BASE / "補充文字"
TMP = OUT / "視覺閱讀暫存"
MANIFEST_REL = "00_來源資料/2026-11-06_更新版01/官方政策/manifest.json"

manifest_bytes = MANIFEST_PATH.read_bytes()
manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
manifest = json.loads(manifest_bytes)
by_id = {a["id"]: a for a in manifest}
images = [a for a in manifest if a.get("kind") == "policy_image"]
assert len(images) == 109, len(images)

COMMON = "人工視覺閱讀；OCR未逐字圖面核驗"


def note(summary: str, points=(), caveats=(), readable: bool = True):
    return {
        "summary": summary,
        "policy_points": list(points),
        "caveats": list(caveats),
        "readable": readable,
    }


notes: dict[str, dict] = {}


def put_group(prefix: str, rows: list[dict]):
    found = [a for a in images if a["id"].startswith(prefix)]
    assert len(found) == len(rows), (prefix, len(found), len(rows))
    for asset, data in zip(found, rows):
        notes[asset["id"]] = data


put_group("policy_16_都更政策__image", [
    note("封面「無限鄰里 無限陪伴」；提出加速都更審查、活化邊陲都更、建立循環都更三條主線", ["精進審議制度，補人力、審得準、審得快", "以交換與循環房源降低搬遷卡關"]),
    note("加速都更審查：精進審議制度", ["都更涉及都市設計、交通影響評估、文化資產、老樹保護等跨域審查", "補人力、提高薪資獎金、導入公會協審與報核前聯合預審", "建立 AI 都更知識庫、審議資料庫與承辦專案管理"]),
    note("循環都更：不用搬來搬去，都更不再卡在安置", ["盤點公有地、老房舍、自主都更、聯開分回戶等屋源", "以交換平台讓舊房換新房、換屋或換權，公平估價、多退少補"]),
    note("加速都更審查：不想開車的就換手", ["北市有 70 多件核准五年以上未動工，最久近 20 年", "以黃燈輔導／推進計畫、紅燈廢止或換車下車處理停滯案件"]),
    note("循環都更六大步驟圖", ["盤點屋源、建立重劃更新區法源、交換平台公平估價", "循環住宅只搬一次、舊屋包租代管、完工分回進下一輪"]),
    note("盤點四種屋源", ["公有土地、殭屍都更、自主都更、聯開分回戶列為循環房源"], ["卡片小字未逐字轉錄"]),
    note("重劃更新區", ["盤點需求與地點，修法建立交換平台與租稅機制"]),
    note("交換平台與多退少補", ["示例顯示 1,500 萬換 1,200 萬可退 300 萬；1,800 萬需補 300 萬", "換屋是產權換產權，換權是產權換地上權；近區塊、整合完整者優先"], ["示例數字依圖面閱讀，細部門檻待政策核對"]),
    note("循環住宅：舊家到新家只搬一次", ["市府先蓋、住戶同意後直接搬；坪數與價格可選、可看實體房屋", "市府取得一定比例舊屋後開始都更，比例仍待研議"]),
    note("舊屋包租代管", ["舊屋可作社宅、青年出租、老人日照或社區托育等安全用途", "市府以容積參與，自建、招商或協商"]),
    note("完工分回戶進入下一輪", ["市府取得分回戶，部分標售回補基金，其餘作下一輪循環房源"]),
])

put_group("policy_01_教育政策__image", [
    note("教育有溫暖，孩子好未來", ["四條主線：教師減壓、親師溝通、幼教、特教"]),
    note("教師減壓", ["117 學年度每班國小 24 人、國中 25 人", "補正式員額、優化師資、評估獎金，配置雙導師與行政助理"]),
    note("第三方親師協助", ["以第三方協助師生調和與衝突分流", "設 EAP 諮商據點，納入心理諮商所"]),
    note("幼教支持", ["117 學年度幼幼班 10 人、幼兒園 24 人", "公幼設專任主任並簡化行政"]),
    note("特教與家庭支持", ["116 學年度推分數式資源班；師生比幼兒 1:15、國小 1:10、國中 1:8", "增加特教助理員、家庭教育與育兒支持"]),
])

put_group("policy_02_交通政策__image", [
    note("台北交通順起來：綠色通勤選項加一", ["通學區、公車安全、自行車路網、TPASS 共享電動機車四方案"]),
    note("公車安全改革", ["補貼駕駛薪資，改善人因座椅與折返點休息站", "重整公車路網"]),
    note("通學區共同標準", ["以學校周邊 150 公尺為範圍", "淨空、抬升式穿越、減速、庇護島與接送動線納入標準，保留意見調整"]),
    note("自行車路網", ["規劃迎風—港墘跨基隆河專用橋", "統一維護並升級 YouBike"]),
    note("TPASS 共享電動機車", ["前 10 分鐘免費，每日固定次數", "設計停車、借還與補助規則"]),
    note("整合交通示意圖", ["以捷運／鐵路、巴士、自行車架、共享機車與 TPASS 卡呈現多模態接駁"], ["此圖為版面示意，無可讀的新增政策文字"], False),
])

put_group("policy_03_社福政策__image", [
    note("打造台北幸福國：從孩子到長者的安全網", ["以多世代、多族群需求串起社福安全網"]),
    note("長者生活支持", ["敬老卡城市探索護照、健身小巴／在宅醫療", "爬梯機、修繕、租屋、住宿長照與臨托券，增加長者外出理由"]),
    note("中年與心理健康", ["50+ 皮蛇疫苗一劑；65 歲心理諮商加碼 3 次", "職場友善與 45+ 職涯／創業支持"]),
    note("兒少安全與資源", ["0—6 歲腸病毒疫苗、0—18 歲親子同行卡每月 600 點", "兒少治理中心與通學路安全"]),
    note("女性安全", ["推女性安全審計與女性身心一站式專線"]),
    note("身障與弱勢安全網", ["無障礙城市設計中心、罕病家用不斷電", "增加女性決策參與"]),
])

put_group("policy_04_台北文化徑_山林徑__image", [
    note("打造首都文化徑及山林徑", ["四大主題、亞洲第一觀光登山城、步道重新檢視", "路徑品牌、數位治理與親子同行 600 點"]),
    note("城市歷史記憶地圖", ["以城市歷史記憶串聯歷史場址與路徑節點"], ["地圖節點文字較小，僅記錄清楚可辨識標題與重點"]),
    note("產業文化遺跡地圖", ["標示產業文化遺跡路線／節點，並連結象山登山中心"], ["地圖節點文字較小，未逐字轉錄"]),
    note("多元族群文化地圖", ["以多元族群、文化場址與各區節點組成路徑"], ["地圖節點文字較小，未逐字轉錄"]),
    note("人權與民主記憶地圖", ["可辨識天馬茶房原址、清南基督長老教會、二二八國家紀念館、戒嚴時期政治受難者墓園等節點"], ["地圖節點文字較小，未逐字轉錄"]),
    note("文化路徑總覽", ["將城市歷史、產業、白色恐怖、人權等路徑與登山中心連結"], ["地圖／示意文字較小，未逐字轉錄"]),
    note("四大主題文化徑", ["產業文化遺跡、城市歷史記憶、多元族群敘事、人權與民主記憶", "第一階段四主題，第二階段進行共創"]),
    note("亞洲第一觀光登山城", ["象山、劍潭、貓空三座登山觀光中心", "裝備租借、置物更衣、洗鞋區；中英日韓導覽與即時步道狀況"]),
    note("重新檢視步道系統", ["因地制宜恢復自然步道並重訂分級", "數位導覽、安全應急、廁所飲水休息照明指標與登山口接駁"]),
    note("重新建立城市連結", ["路徑品牌化、數位治理、方便抵達、在地參與、跨局處平台五策略", "每月 600 點親子同行卡"]),
])

put_group("policy_05_都市微森林__image", [
    note("打造永續宜居台北，從都市微森林開始", ["專業專責／專法專款、智慧管理、市民參與、循環再利用"]),
    note("更重視每棵樹", ["推動都市林專法、都市森林委員會與維運基金", "培養綠領人才"]),
    note("讓行道樹再生", ["整合樹籍管理、監測系統、數位孿生三合一智慧管理"]),
    note("樹木種植全民規劃", ["串接樹籍、氣象與體感溫度，提供回報互動", "在高溫點投入樹木、遮蔭與補水，建立 COOL MAP"]),
    note("讓樹木重生，循環再利用", ["結合新創與學術，將樹木循環製造成公共設施與高值產品"]),
    note("3-30-300 國際目標", ["3：窗前看見 3 棵樹；30%：平地市區綠覆率；300：300 公尺內有綠蔭公園"]),
])

put_group("policy_06_青年政策__image", [
    note("台北發展青年力：年輕人的第一步", ["本金 × AI × 舞台；50 萬起跑本金、AI 使用支持、青年圓夢舞台"]),
    note("50 萬起跑本金", ["18—22 歲；市府存 1,500、青年再存 1,500，弱勢市府加碼 1,500", "大學畢業拿 50 萬"]),
    note("AI 使用支持方案", ["就學每月最高補助 300；競賽加碼", "第一期 18—25 歲設籍台北，第二期擴大 18—45 歲社會人士；跨模型、跨平台、有算力"]),
    note("AI 青年圓夢計畫", ["接續中央圓夢基金，協助落地創業並培育青年市民外交官", "8 年 20 億"]),
])

put_group("policy_07_運動政策__image", [
    note("運動政策：你的市長，你的主場", ["小巨蛋進社區巷口運動場、河濱市民運動主場、國際足球主場、運動外交、捷運／登山口運動驛站"]),
    note("巷口運動場", ["健身不用找，小巴進社區，出門就能動"]),
    note("點亮河濱公園，市民運動主場", ["以足球、籃球、羽球等運動設施活化河濱"]),
    note("運動外交", ["以運動交流讓台北成為可向世界遞出的城市名片"]),
    note("國際足球主場", ["還台北一座國際足球主場，提供市民旗艦運動中心"]),
])

put_group("policy_08_家庭一站通__image", [
    note("家庭一站通", ["以 0—18 歲資源與家長喘息支持家庭"]),
    note("免費臨托／喘息", ["6 個月—6 歲孩童每週一定時數免費臨托與喘息"]),
    note("心理諮商加碼", ["中央補助 3 次免費心理諮商，地方再加碼，支持家長喘息"]),
    note("免費到宅育兒先指導", ["未滿 2 歲家庭加碼至 6 次，含親職示範、餐點預備、居家安全、家務指導"]),
    note("第三方機制六個好處", ["釋放學校衝突壓力、保護學生教師、專業分流、增加調解、制度化支持、一致專業標準"]),
])

put_group("policy_09_公務員政策__image", [
    note("市府職場全面升級", ["彈性工時、專案獎金、EAP 與 AI 支援"]),
    note("友善職場空間總體檢", ["哺乳室、紓壓、運動、淋浴設施點檢改善，辦公空間向科技公司看齊"]),
    note("彈性上下班更彈性", ["擴大既有彈性方案，員工在相同工時下自行調整上下班起訖"]),
    note("市府專案獎金活化加碼", ["以大型專案獎勵工作成果；EAP 可自選心理、正念、運動、藝術、醫療等支持"]),
])

put_group("policy_10_親子同行卡__image", [
    note("每月 600 點的 0—18 歲家庭支持", ["可連結台北文化幣、運動幣、閱讀袋與家庭教育網絡"]),
    note("閱讀禮袋", ["0、2、5 歲各有一袋，從出生陪伴到入學"]),
    note("親子同行卡的第三方機制", ["圖面列出第三方機制與六項支持效益，與家庭／學校衝突分流相連"]),
    note("台北閱讀袋", ["0、2、5 歲書袋，建立出生到入學的閱讀陪伴"]),
    note("家庭教育網絡", ["提供孕產、親子溝通等家長學習，串接每月點數"]),
])

put_group("policy_11_水域政策__image", [
    note("找回台北水文化：水文化復興運動", ["Active、Beauty、Clean、Detention、Ecosystem 五面向"]),
    note("親近水岸與水文化", ["改善淡水河、基隆河岸與溪流，恢復歷史水道並連結文化、山林與社區"]),
    note("改善水質、強化防洪", ["Clean：改善溪流水質與循環再利用；Detention：學校、公園、社區防洪韌性", "濕地、綠色過濾與分散式微型滯洪設施"]),
    note("讓水成為城市降溫力量", ["以濕地、滯洪與都市森林形成夏季降溫廊道，跨局處打造永續台北"]),
])

put_group("policy_12_AI政策__image", [
    note("AI 應用實踐：城市的未來", ["青年 AI 基本使用權、中高齡職涯、博士／研究、北士科與市政 AI"]),
    note("青年 AI 基本使用權", ["AI 教育包每月最高 300，低收入／認定弱勢 500", "課程每月 500—1,000、專案 2,000—10,000，降低工具門檻"]),
    note("中高齡創業轉職支持", ["45+ 重新起步，薪資／學員補助、AI 職缺與貸款利息支持"]),
    note("北士科星群計畫", ["變電站／公車充電與六個實驗盒：數位孿生、地下管線、智慧垃圾、產學共生、無人載具、數位圖書館"]),
    note("台北研究院", ["跨域城市研究，聚焦 AI 政策、都市規劃、交通、教育與照護"]),
    note("市政 AI 支持", ["專業 AI 團隊進入局處，找出重複工作，減少額外訓練與工具負擔，聚焦服務"]),
])

put_group("policy_13_客家政策__image", [
    note("無限城論壇：讓台北成為全球客家樞紐", ["長輩有據點、學童有互訪、出門講客語、約聘有加分、世界有客家"]),
    note("長輩有據點，孩子有互訪", ["增設都會伯公照護站，結合社團據點、社區照顧與老幼共學", "串聯台北與客庄學校，推動中小學結盟及寒暑假交流"]),
    note("出門講客語，約聘有加分", ["客語學習集點、客語友善店家與數位幣", "修正約聘與 1999 第一線櫃檯規定，中級認證加分"]),
    note("讓世界看見台灣客家", ["將客家精神納入無限城國際論壇，推動跨國多元文化保存與全球客家樞紐"]),
])

put_group("policy_14_城市外交__image", [
    note("城市外交：台北與世界找到更好的生活方式", ["拓展無限城合作網絡、基層交流、台北研究院、市政實質合作、海外人才與產業"]),
    note("拓展無限城合作網絡", ["串聯地方領袖、議員、智庫、企業與海外夥伴，交換住宅、降溫、交通安全、人才治理經驗"]),
    note("展開深度計畫合作", ["推動基層公務員半年互換交流，累積城市外交制度知識"]),
    note("建立台北研究院", ["以都市設計、AI、產業、交通、社會與兒少安全支援長期規劃，連結研究、實作與國際知識"]),
    note("以市政問題推動實質合作", ["都市森林風險評估／保險、交通視線死角與行人零死亡試點、都更早期可負擔住宅與居民需求"]),
    note("串聯海外人才與產業合作", ["連結海外台灣人、企業、智庫與地方政府，促進人才回流與台北／世界流動"]),
])

put_group("policy_15_營養午餐__image", [
    note("營養午餐專法倡議：食農營養教育並進", ["專法、彈性費用、在地農場／學校、食農教育、營養與食物識讀"]),
    note("支持營養午餐專法", ["明確縣市預算、營養、安全、來源與教育責任"]),
    note("彈性午餐費機制", ["依原物料價格、天候與市場調整標準，降低學校／供應商壓力並維持品質"]),
    note("在地農場與學校合作", ["參考東京經驗，建立合作與穩定在地食材供應，連結農業與管理學習"]),
    note("營養教育", ["把午餐連結學校課程，讓學生理解食物來源、製作與供應"]),
    note("食物與營養識讀", ["發展教材、培養健康習慣，降低慢性病風險"]),
])

put_group("heart_quiz_1__image", [
    note("消除山徑苔蘚的魔法", ["改善雨天山徑濕滑、老舊步道與休息空間；提示天候、身體與食物準備"]),
    note("純插畫：鹿", (), ["no_substantive_text"], False),
    note("讓眼角長出後照鏡的魔法", ["看見車輛與道路風險，避免違停，讓家長與寵物探索更安全"]),
    note("純插畫：燕／鳥", (), ["no_substantive_text"], False),
    note("讓公告都有被好好閱讀的魔法", ["非營業時間不設門、避免違停與垃圾，讓店面周邊更安定；涉及租金折扣"]),
    note("純插畫：牛／水牛", (), ["no_substantive_text"], False),
    note("公車剛剛好到車站的魔法", ["減少炎熱或寒冷中久候，讓通勤休息、聽音樂或閱讀"], ["以魔法／生活情境表達，非具體執行細節"]),
    note("純插畫：橘色狗", (), ["no_substantive_text"], False),
    note("把路燈變成夕陽的魔法", ["以城市照明營造夕陽般的詩意，提出城市生活美感想像"], ["未見可核對的執行數字"]),
    note("純插畫：孔雀", (), ["no_substantive_text"], False),
    note("絕對不會把名片拿反的魔法", ["記住名片方向，減少客戶互動尷尬並能立即記下報價"], ["生活情境卡，非正式政策規格"]),
    note("純插畫：蜂鳥", (), ["no_substantive_text"], False),
    note("把人行道變成棉花糖的魔法", ["改善路面高低差與障礙，降低跌倒風險；仍提醒行走注意"], ["生活情境卡，未逐字轉錄"]),
    note("純插畫：貓頭鷹", (), ["no_substantive_text"], False),
    note("把青菜瞬間洗好的魔法", ["去除泥土與蟲，節省備餐時間"], ["生活情境卡，另以手洗衣物作對照，非正式政策規格"]),
    note("純插畫：大象", (), ["no_substantive_text"], False),
])

assert len(notes) == 109, len(notes)


def source_path(asset: dict) -> str:
    path = asset.get("image_path") or asset.get("raw_path")
    return f"00_來源資料/2026-11-06_更新版01/{path}"


def asset_record(asset_id: str, data: dict, page: int = 1, path: str | None = None, *, pdf_page=False):
    asset = by_id[asset_id]
    caveats = [COMMON, *data.get("caveats", [])]
    return {
        "asset_id": asset_id,
        "sha256": asset["sha256"],
        "page": page,
        "path": path or source_path(asset),
        "viewed_fully": True,
        "readable": bool(data.get("readable", True)),
        "summary": data["summary"],
        "policy_points": data.get("policy_points", []),
        "caveats": caveats,
        "source_url": asset.get("source_url"),
        "discovered_from": asset.get("discovered_from"),
        "ocr_status": "no_text_layer; vision_no_text_detected" if pdf_page else "vision_no_text_detected",
        "ocr_verification": "not_word_for_word_verified",
    }


assets_read = [asset_record(a["id"], notes[a["id"]]) for a in images]

jpg_id = "policy_03_社福政策__attachment_94bb29415a78"
assert jpg_id in by_id
assets_read.append(asset_record(jpg_id, note(
    "社福政策五大目標族群與概念總表", [
        "長者：敬老卡、健身小巴／運動胖卡、代間學習、高年級導航、無障礙城市、時間銀行、功能評估",
        "在宅醫療、社會處方 2.0、老人租屋／修繕／爬梯機、住宿型機構與鐘點移工、臨托老券／失智友善",
        "兒少：0—6 歲免費腸病毒、0—18 歲卡、兒少安全、幼教安全網、通學安全",
        "身障：無障礙鏈、爬梯機、不斷電、女性公共參與；中年：50+ 皮蛇、65 歲 6 次／15—45 歲免費 3+3、職場友善、45+ 轉職創業",
        "女性：安全審計與身心健康；社區共照一區 5—10 個",
    ], ["表格小字未逐字轉錄"]
), path=source_path(by_id[jpg_id])))

pdf_specs = [
    ("policy_02_交通政策__attachment_1d3a6cb64944", 1, "封面「台北交通順起來／綠色通勤選項+1」", ["通學區、公車安全、自行車路網、TPASS 共享電動機車四方案"], "policy_02_交通政策__attachment_1d3a6cb64944_p01.png", True, []),
    ("policy_02_交通政策__attachment_1d3a6cb64944", 21, "結尾橙色版面「SOON 你的市長 沈伯洋 台北順起來」", [], "policy_02_交通政策__attachment_1d3a6cb64944_p21.png", True, ["no_substantive_text", "封面／結尾版面"]),
    ("policy_04_台北文化徑_山林徑__attachment_7ae768c9b336", 1, "文化徑×山林徑政策封面", ["串連文化徑與山林徑，把台北重新接起來"], "policy_04_台北文化徑_山林徑__attachment_7ae768c9b336_p01.png", True, []),
    ("policy_04_台北文化徑_山林徑__attachment_7ae768c9b336", 8, "城市歷史記憶地圖頁", ["以城市歷史記憶與路徑／場址節點呈現文化路徑"], "policy_04_台北文化徑_山林徑__attachment_7ae768c9b336_p08.png", True, ["地圖節點文字較小，未逐字轉錄"]),
    ("policy_04_台北文化徑_山林徑__attachment_7ae768c9b336", 9, "文化路徑、河岸、山林徑連結示意", ["以城市、河岸、山林與交通串接文化徑／山林徑"], "policy_04_台北文化徑_山林徑__attachment_7ae768c9b336_p09.png", True, ["示意圖小字未逐字轉錄"]),
    ("policy_04_台北文化徑_山林徑__attachment_7ae768c9b336", 16, "結尾橙色版面「SOON 你的市長 沈伯洋 台北順起來」", [], "policy_04_台北文化徑_山林徑__attachment_7ae768c9b336_p16.png", True, ["no_substantive_text", "封面／結尾版面"]),
    ("policy_05_都市微森林__attachment_19adb5514d42", 1, "都市微森林政策封面：把樹種在你身邊，降溫台北", ["都市微森林以樹木、降溫與宜居為主題"], "policy_05_都市微森林__attachment_19adb5514d42_p01.png", True, []),
    ("policy_05_都市微森林__attachment_19adb5514d42", 11, "結尾橙色版面「SOON」", [], "policy_05_都市微森林__attachment_19adb5514d42_p11.png", True, ["no_substantive_text", "封面／結尾版面"]),
    ("policy_06_青年政策__attachment_ee958aad30fb", 1, "青年政策封面：年輕人的第一步，台北來發展", ["本金 × AI × 舞台"], "policy_06_青年政策__attachment_ee958aad30fb_p01.png", True, []),
    ("policy_06_青年政策__attachment_ee958aad30fb", 20, "結尾橙色版面「SOON」", [], "policy_06_青年政策__attachment_ee958aad30fb_p20.png", True, ["no_substantive_text", "封面／結尾版面"]),
]
for aid, page, summary, points, filename, readable, extra in pdf_specs:
    data = note(summary, points, extra, readable)
    assets_read.append(asset_record(aid, data, page, f"00_來源資料/2026-11-06_更新版01/補充文字/視覺閱讀暫存/pdf-pages/{filename}", pdf_page=True))

assert len(assets_read) == 120, len(assets_read)


def ref(asset_id: str, excerpt: str, page: int = 1):
    asset = by_id[asset_id]
    return {
        "asset_id": asset_id,
        "page": page,
        "url": asset.get("source_url"),
        "discovered_from": asset.get("discovered_from"),
        "speaker": "官方政策圖卡",
        "support_excerpt": excerpt,
    }


eligibility = "官方政策圖卡／附件的人工視覺閱讀索引；可供閱讀包定位，正式引用須與政策文字頁交叉核對。"
topics = [
    {"working_title": "都更審查與循環安置", "question": "如何縮短都更審查並降低反覆搬遷？", "points": ["補人力與跨域預審", "交換平台、公平估價、循環住宅與分回戶房源"], "source_refs": [ref("policy_16_都更政策__image_92d1d6cdf382", "都更審查跨域且有人力、標準與程序瓶頸"), ref("policy_16_都更政策__image_9d88baf94eb7", "循環都更主張不用搬來搬去")], "eligibility": eligibility},
    {"working_title": "教育減壓與支持", "question": "如何讓教師、親師、幼教與特教得到支持？", "points": ["降低班級人數、補師資與行政", "第三方協助、幼教行政、特教資源與家庭支持"], "source_refs": [ref("policy_01_教育政策__image_c725cbd5ba3a", "117 學年度班級人數與雙導師／行政助理"), ref("policy_01_教育政策__image_d9d99eeeffce", "特教師生比與助理員")], "eligibility": eligibility},
    {"working_title": "交通安全與綠色通勤", "question": "如何讓通學、公車、自行車與共享運具更順？", "points": ["150 公尺通學區標準、公車駕駛與路網改革", "自行車跨河專用橋、YouBike、TPASS 共享電動機車"], "source_refs": [ref("policy_02_交通政策__image_73e26897ce90", "自行車路網與迎風—港墘專用橋"), ref("policy_02_交通政策__image_afae879a9357", "TPASS 共享電動機車前 10 分鐘免費")], "eligibility": eligibility},
    {"working_title": "社福多世代安全網", "question": "如何涵蓋長者、兒少、身障、中年與女性？", "points": ["長者醫療、居住、照顧與外出", "兒少、女性與身障安全及支持"], "source_refs": [ref("policy_03_社福政策__image_44e1aefb72f9", "長者生活與照顧支持"), ref("policy_03_社福政策__attachment_94bb29415a78", "五大目標族群與概念總表")], "eligibility": eligibility},
    {"working_title": "文化徑與山林徑", "question": "如何用文化路徑串起城市、河岸與山林？", "points": ["四大文化徑主題與節點", "登山中心、步道系統、品牌與數位治理"], "source_refs": [ref("policy_04_台北文化徑_山林徑__image_0a7f3b7e7e8f", "四大主題文化徑"), ref("policy_04_台北文化徑_山林徑__image_f91caaaf118b", "三座登山觀光中心")], "eligibility": eligibility},
    {"working_title": "都市微森林", "question": "如何用樹木與智慧管理改善都市熱環境？", "points": ["專法專款、都市森林委員會與維運基金", "樹籍、監測、數位孿生、市民參與與 3-30-300"], "source_refs": [ref("policy_05_都市微森林__image_a4ec854ca20d", "樹籍、監測與數位孿生三合一"), ref("policy_05_都市微森林__image_262fe541cc7c", "3-30-300 國際目標")], "eligibility": eligibility},
    {"working_title": "青年本金與 AI 舞台", "question": "如何支持青年起步、使用 AI 與圓夢？", "points": ["18—22 歲起跑本金", "AI 工具補助、創業與青年市民外交官計畫"], "source_refs": [ref("policy_06_青年政策__image_b14358a62817", "50 萬起跑本金規則"), ref("policy_06_青年政策__image_9200d578ed63", "AI 圓夢計畫 8 年 20 億")], "eligibility": eligibility},
    {"working_title": "社區運動主場", "question": "如何把運動帶到社區、河濱與國際場域？", "points": ["巷口運動場、運動小巴、河濱運動主場", "國際足球主場與運動外交"], "source_refs": [ref("policy_07_運動政策__image_4fb42607d878", "小巴進社區與巷口運動場"), ref("policy_07_運動政策__image_522c66f05fe1", "國際足球主場")], "eligibility": eligibility},
    {"working_title": "家庭一站通與家長喘息", "question": "如何讓托育、心理諮商、到宅育兒與學校支持更可近？", "points": ["免費臨托／喘息、心理諮商加碼", "到宅育兒先指導與第三方機制"], "source_refs": [ref("policy_08_家庭一站通__image_f65b3b56434e", "6 個月—6 歲免費臨托／喘息"), ref("policy_08_家庭一站通__image_3cee2afa2d22", "到宅育兒先指導加碼至 6 次")], "eligibility": eligibility},
    {"working_title": "市府友善職場", "question": "如何升級公務員工作環境與彈性？", "points": ["空間總體檢、彈性上下班、專案獎金", "EAP 與 AI 支持"], "source_refs": [ref("policy_09_公務員政策__image_81fc2aa74181", "友善職場空間設施"), ref("policy_09_公務員政策__image_cf806fe27806", "專案獎金與 EAP 自選支持")], "eligibility": eligibility},
    {"working_title": "親子同行卡與閱讀袋", "question": "如何把每月資源導向閱讀與家庭教育？", "points": ["每月 600 點與 0／2／5 歲閱讀袋", "家庭教育網絡與第三方支持"], "source_refs": [ref("policy_10_親子同行卡__image_4912ac9bbf08", "0—18 歲家庭每月 600 點"), ref("policy_10_親子同行卡__image_4dac68a5eb61", "家庭教育網絡")], "eligibility": eligibility},
    {"working_title": "水文化與城市韌性", "question": "如何讓水岸、水質、防洪與降溫共同治理？", "points": ["親近水岸與歷史水道", "改善水質、滯洪、濕地、都市森林與降溫廊道"], "source_refs": [ref("policy_11_水域政策__image_b34b7bc2be2f", "親近水岸與水文化"), ref("policy_11_水域政策__image_829cff67d886", "改善水質與強化防洪")], "eligibility": eligibility},
    {"working_title": "AI 城市應用", "question": "如何把 AI 支持從青年延伸到職涯、研究與市政？", "points": ["青年基本使用權與中高齡轉職創業", "北士科實驗、台北研究院、市政 AI 團隊"], "source_refs": [ref("policy_12_AI政策__image_6005659a7456", "青年 AI 基本使用權補助"), ref("policy_12_AI政策__image_fcabcdd9bc0b", "市政 AI 團隊進局處找出重複工作")], "eligibility": eligibility},
    {"working_title": "客家世代與國際樞紐", "question": "如何讓客家文化在日常、世代與國際交流中被看見？", "points": ["伯公照護、老幼共學、學校交流", "客語友善與無限城國際論壇"], "source_refs": [ref("policy_13_客家政策__image_47a2e85f74fa", "長輩據點與孩子互訪"), ref("policy_13_客家政策__image_6c8b51e85c1f", "全球客家樞紐")], "eligibility": eligibility},
    {"working_title": "城市外交與實質合作", "question": "如何以市政問題連結海外城市、人才與產業？", "points": ["無限城網絡與公務員交換", "研究院、都市森林風險、交通與住宅試點"], "source_refs": [ref("policy_14_城市外交__image_9da641e043b4", "無限城合作網絡"), ref("policy_14_城市外交__image_e80364407e62", "以市政問題推動實質合作")], "eligibility": eligibility},
    {"working_title": "營養午餐與食農教育", "question": "如何以專法、彈性費用與食農教育維持午餐品質？", "points": ["明確預算、營養、安全與來源責任", "依市場彈性調整、在地食材與營養／食物識讀"], "source_refs": [ref("policy_15_營養午餐__image_be0cbaca8fc4", "營養午餐專法與食農教育"), ref("policy_15_營養午餐__image_f413d4e0d57c", "彈性午餐費機制")], "eligibility": eligibility},
    {"working_title": "心聲小卡的生活提案", "question": "圖卡中的生活情境如何指向城市微改善？", "points": ["山徑、防駕駛視線、公告、候車、照明、人行道與備餐等情境", "部分頁面為純插畫或生活隱喻，不能當成正式政策規格"], "source_refs": [ref("heart_quiz_1__image_474fed54e053", "改善山徑苔蘚與雨天行走"), ref("heart_quiz_1__image_5d4e250d5b2e", "把路燈變成夕陽的魔法")], "eligibility": eligibility},
]

now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")
progress = {
    "generated_at": now,
    "manifest_path": MANIFEST_REL,
    "manifest_sha256": manifest_sha,
    "viewing_method": "每張圖以 view_image 取得原圖或 PDF 無文字層頁的 pdftoppm render，並以 image(result.image_url) 確認顯示後閱讀。",
    "tool_display_confirmed": True,
    "expected_pages": 120,
    "viewed_count": len(assets_read),
    "unread_count": 0,
    "viewed": [{"asset_id": a["asset_id"], "page": a["page"], "path": a["path"]} for a in assets_read],
    "unread": [],
    "note": "目前這一輪已實際顯示並完整閱讀 109 張 policy_image、1 張社福 JPG 附件及 10 張 PDF 無文字層頁；OCR 空結果未被當成無字或正確原文。",
}

partial = {
    "generated_at": now,
    "manifest_path": MANIFEST_REL,
    "manifest_sha256": manifest_sha,
    "scope": "目前輪次實際顯示閱讀的 120 頁視覺資產；完整輸出可由後續 agent 以同一筆記與 SHA 核對。",
    "ocr_policy": COMMON + "；OCR 空結果不視為無字或正確原文。",
    "assets_read": assets_read,
    "topics": topics,
    "unreadable": [
        {"asset_id": a["asset_id"], "page": a["page"], "reason": "純插畫，無可讀政策文字"}
        for a in assets_read if not a["readable"]
    ],
}

(OUT / "visual-progress.json").write_text(json.dumps(progress, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "visual-reading.partial.json").write_text(json.dumps(partial, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"viewed_count": len(assets_read), "topics": len(topics), "unreadable": len(partial["unreadable"]), "manifest_sha256": manifest_sha}, ensure_ascii=False))
