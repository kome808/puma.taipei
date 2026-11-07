#!/usr/bin/env python3
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
PATH = APP / 'content/policy-topics/batches/batch-a.json'
rows = json.loads(PATH.read_text())
topics = {t['id']: t for t in rows}
fang = 'https://puma-hub.pages.dev/articles/fang-yehan-2026-10-20/'
topics['t002']['interview'].append({'text': '房業涵訪談中，沈伯洋談到換屋計算機制複雜，需要討論平台與估價方式；換屋地點距離原生活圈太遠，也會影響長者意願。', 'source_urls': [fang], 'evidence': [{'pack_id': 'main', 'unit_id': 'u0122', 'quote': '但這個計算機制很複雜，我們這陣子一直在跟專家學者討論換房平台跟估價方式'}]})
topics['t002']['share_source_urls'] = [topics['t002']['official'][0]['source_urls'][0], fang]
t = topics['t023']
t['intro'] = '45歲以上工作者轉職或創業，可以從既有經驗重新盤點方向。政策提出職涯健檢、職務再設計與創業支持。'
t['share_body'] = '沈伯洋的AI政策提出，為45歲以上市民提供專業職涯健檢，盤點再出發方向；透過「再出發產業公約」與友善企業合作，進行職務再設計，搭配帶薪轉職或實習補貼及就業媒合。創業方面則提出利息補貼，聚焦社會服務、醫事照護等社會企業工作，讓累積的專業經驗能銜接新的機會。'
t['official'] = [{'text': t['share_body'], 'source_urls': ['https://puma.taipei/policies/AI%E6%94%BF%E7%AD%96'], 'evidence': [{'pack_id': 'main', 'unit_id': 'u0013', 'quote': '針對 45 歲以上市民，提供由專業人士協助的職涯健檢'}]}]
t['interview'] = []
t['share_source_urls'] = ['https://puma.taipei/policies/AI%E6%94%BF%E7%AD%96']
t['editor_notes'].append('產業AI教練訪談歸t060；來源未證實該角色屬45歲以上轉職支持，故本題不串接兩者。')
PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print('Resolved t002 source and t023 distinct mechanisms.')
