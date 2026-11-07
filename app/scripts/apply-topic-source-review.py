#!/usr/bin/env python3
"""Apply the independent source review to editorial data, retaining provenance."""
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
UNITS = ROOT / '00_來源資料/2026-11-06_更新版01/檢查/全文閱讀工作包/units'
BATCH = APP / 'content/policy-topics/batches'
rows = [t for p in sorted(BATCH.glob('batch-*.json')) for t in json.loads(p.read_text())]
topics = {t['id']: t for t in rows}
changes = []


def unit(uid):
    return json.loads((UNITS / f'{uid}.json').read_text())


def proof(uid, needle, length=150):
    u = unit(uid)
    start = u['text'].find(needle)
    if start < 0:
        raise ValueError(f'{uid}: cannot locate {needle}')
    return {'pack_id': 'main', 'unit_id': uid, 'quote': u['text'][start:start + length]}


def para(text, uid, needle):
    return {'text': text, 'source_urls': [unit(uid)['url']], 'evidence': [proof(uid, needle)]}


def add(tid, section, uid, needle):
    p = topics[tid][section][0]
    url = unit(uid)['url']
    if url not in p['source_urls']:
        p['source_urls'].append(url)
    p['evidence'].append(proof(uid, needle))
    changes.append({'topic_id': tid, 'action': f'added {uid} proof and matching URL'})


t = topics['t030']
t['official'][0]['text'] = t['official'][0]['text'].split('並檢討學校')[0].rstrip('，；。') + '。'
t['interview'] = [para('邱沁宜Podcast完整稿中，沈伯洋談到透過體育局改善學校場地開放與社區俱樂部制度，讓居民更容易組隊、認養場地，延續固定運動的習慣。', 'u0119', '臺北市未來應該透過體育局')]
t['share_body'] = '沈伯洋的運動政策提出每區新增3至5處特色運動據點，盤點公有閒置空間，依社區需求設置小型場地，也改善河濱照明、休息與急救設施。訪談另外談到，透過體育局改善學校場地開放與社區俱樂部制度，讓居民更容易組隊、認養場地，延續日常運動習慣。'
t['share_source_urls'] = [t['official'][0]['source_urls'][0], unit('u0119')['url']]

add('t031', 'interview', 'u0086', '遊戲是一種')
topics['t031']['share_source_urls'] = [topics['t031']['official'][0]['source_urls'][0], unit('u0086')['url']]
add('t032', 'interview', 'u0089', '不管用長租還是用買賣')

t = topics['t033']
t['interview'] = [
    para('王淺秋訪談談到把板南線發展為動漫廊帶，讓動漫與既有交通、街區空間連結。', 'u0138', '動漫'),
    para('影視音座談中，沈伯洋提出結合捷運地下街與既有場館，在廊道節點設置舒適、常態性的放映空間，增加紀錄片、動畫及獨立作品被看見的機會。', 'u0446', '若在捷運廊道節點設置'),
    para('同場音樂議題回應中，他談到北流應連結產業與獨立音樂，支持中小型Livehouse，並在都市計畫中處理音樂空間容許標準及音樂廊帶。', 'u0269', '針對 Livehouse'),
]
t['share_source_urls'] = [unit('u0138')['url'], unit('u0446')['url']]
# The complete forum transcript contains both the film and music response.
t['interview'][2]['source_urls'].append(unit('u0446')['url'])
t['interview'][2]['evidence'].append(proof('u0446', '首先談「音樂展演空間'))

add('t034', 'interview', 'u0166', '讓居民知道樹木為何被移除')
topics['t034']['share_source_urls'] = [topics['t034']['official'][0]['source_urls'][0], unit('u0166')['url']]
add('t035', 'interview', 'u0250', '不會採取全線開蓋')
add('t035', 'official', 'u0012', '礫間')
add('t040', 'interview', 'u0401', '跟工會談')
topics['t040']['share_source_urls'] = [unit('u0166')['url'], unit('u0401')['url']]

t = topics['t043']
t['interview'] = [
    para('訪談以競選期間蒐集問題為例，說明按議題、行政區甚至情緒分類，再帶著問題到街頭直接回答市民。', 'u0097', '依照議題、行政區甚至情緒'),
    para('另一場訪談提出繼續蒐集問題、以AI整理，並構想透過廣播或直播定期由市長直接回應市民，讓蒐集與回答接續。', 'u0406', '廣播是很好的'),
    para('JomoTalk訪談中，他以不熟悉潛水設施需求的經驗，說明遇到當場答不出的題目會回去研究。這是對陌生提案的處理例子。', 'u0113', '我回去研究'),
]
t['share_body'] = '市民提問很多，重點是整理後能不能得到回應。沈伯洋在訪談以競選期間蒐集問題為例，談到按議題、行政區甚至情緒分類，再帶著問題到街頭回答。另一場訪談則提出持續蒐集、以AI整理，並構想用廣播或直播，定期由市長直接回覆市民，讓提問、整理與回答接成流程。'
t['share_source_urls'] = [unit('u0097')['url'], unit('u0406')['url']]

t = topics['t046']
t['share_body'] = '沈伯洋在訪談表示，只要沒有政治前提、維持對等尊嚴，城市之間可以交流，但須做好主權與資安風險管理。他也對交流後接著發生軍演表示不能接受。這段主張同時討論交流機會與必要條件，要求把實質往來、政治對等和安全風險一起看。'
t['interview'] = [para(t['share_body'], 'u0103', '只要無政治前提且對等尊嚴')]
t['share_source_urls'] = [unit('u0103')['url']]

t = topics['t047']
t['official'] = [para('城市外交政策提出「無限城」，串聯地方政府、智庫、企業與僑界，加深基層人員交流，讓國際經驗進入長期規劃，再由公務體系接續執行，回應住宅、交通安全與街道樹蔭等生活議題。', 'u0015', '「無限城」希望拓展台北')]
t['share_source_urls'] = [unit('u0015')['url'], t['interview'][0]['source_urls'][0]]
add('t048', 'interview', 'u0108', '與地方及消防單位合作辦親子活動')
topics['t048']['share_source_urls'] = [topics['t048']['interview'][0]['source_urls'][0], unit('u0108')['url']]
add('t049', 'interview', 'u0282', '數位圖書館和社區空間一起規劃')

t = topics['t058']
t['intro'] = '霸凌受害者報案時，重複覆述侮辱內容可能再次受傷。訪談提出陪同及書面指認等流程建議。'
t['share_body'] = '網路霸凌的傷害，可能在報案時因再次覆述侮辱內容而重現。沈伯洋在11點熱吵店訪談認為，實務流程需要檢討，例如安排女性員警陪同，避免要求被害人親口覆述侮辱內容，改用書面指認。這些建議關注案件如何受理，也關注求助者在報案過程受到的對待，減少二度傷害。'
t['interview'] = [para(t['share_body'], 'u0040', '比如應安排女性員警陪同')]
t['share_source_urls'] = [unit('u0040')['url']]

t = topics['t060']
t['intro'] = '業者若要先學AI再自行摸索，可能來不及。訪談提出讓AI人才進入產業理解需求，再開發工具。'
t['share_body'] = t['share_body'].replace('讓中小企業自行摸索', '讓業者自行摸索')
t['interview'][0]['text'] = t['share_body']

t = topics['t064']
t['share_body'] = '搭車去爬山，步道資訊與最後一段接駁都會影響體驗。沈伯洋的政策提出登山觀光中心，並增加中心與步道口之間的交通接駁；訪談也談到盤點登山路線、登山口公車、指標與廁所維護。這些做法從資訊、交通與步道設施著手，改善淺山步道和城市生活圈的連結。'

t = topics['t070']
t['interview'] = [para('中山大同演講以「圓山超級市民運動中心」說明運動空間構想，納入各式球類與新興運動，並希望保留原商圈、帶入人流，與自行車路線及運動驛站功能銜接。', 'u0281', '我們要去做「圓山的超級市民運動中心」')]
t['share_body'] = '沈伯洋的運動政策提出花博旗艦運動中心，補足不同運動場地需求。中山大同演講則以「圓山超級市民運動中心」說明構想，納入各式球類與新興運動，保留原有商圈並帶入人流，與自行車路線及運動驛站功能銜接，讓運動和周邊街區一起規劃。'
t['share_source_urls'] = [t['official'][0]['source_urls'][0], unit('u0281')['url']]

t = topics['t080']
t['share_body'] = '第一線看到問題，能不能往上說，會影響組織能否修正。沈伯洋在訪談表示，他喜歡同仁把問題提出來，因為這代表還有改進空間；出錯後應趕快修正、避免重犯。這段治理想法重視向上回報與面對問題，讓日常工作中發現的困難能成為調整做法的依據。'
t['interview'][0]['text'] = t['share_body']
t['intro'] = '問題被提出來，才有機會改善。訪談主張讓同仁向上回報，出錯後修正、避免重犯。'

t = topics['t082']
t['share_body'] = '沈伯洋在2023年公共議題訪談，以資助網紅、社群平台與內容傳播討論資訊操作。他認為，資訊作戰可以透過這些傳播管道接觸民眾，進而影響公共討論與社會信任。這段內容呈現他對資訊操作及平台傳播角色的分析。'
t['interview'][0]['text'] = t['share_body']
t = topics['t083']
t['share_body'] = '歷史景觀也能和自行車通勤一起思考。沈伯洋在水文化記者會提出，把明治橋的部分意象重現在河岸陸地，再延伸銜接現代自行車橋，將歷史記憶、景觀與跨河交通需求放進同一個構想。'
t['interview'][0]['text'] = t['share_body']

for batch in ['a', 'b', 'c']:
    path = BATCH / f'batch-{batch}.json'
    original = json.loads(path.read_text())
    path.write_text(json.dumps([topics[t['id']] for t in original], ensure_ascii=False, indent=2) + '\n')
(APP / 'content/policy-topics/reviews/source-review-resolutions.json').write_text(json.dumps({'reviewed_batches': ['b', 'c'], 'status': 'applied', 'changes': changes, 'notes': ['學校場地開放實際引文在u0119，非審查報告建議的u0118。', '不同訪談補充拆段引用；分享稿保留最多兩個真正支持正文的來源。', '不增加資格、地點或時程待補套話。']}, ensure_ascii=False, indent=2) + '\n')
print('Applied source review corrections.')
