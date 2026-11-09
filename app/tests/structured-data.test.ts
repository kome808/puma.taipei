import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as pages from '../scripts/build-topic-pages.mjs';

const origin='https://puma-note.pages.dev';
const data=JSON.parse(await readFile(new URL('../public/topics/data.json',import.meta.url),'utf8'));
const template=await readFile(new URL('../public/topics/index.html',import.meta.url),'utf8');
function graph(html:string){
  const scripts=[...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1,'one complete JSON-LD graph per page');
  const value=JSON.parse(scripts[0][1]);
  assert.equal(value['@context'],'https://schema.org');
  assert.ok(Array.isArray(value['@graph']));
  return value['@graph'] as Array<Record<string,any>>;
}

test('the library identifies the independent website and all 86 canonical topics without a search action',()=>{
  assert.equal(typeof pages.renderLibraryPage,'function');
  const html=pages.renderLibraryPage(template,data);
  const nodes=graph(html);
  const site=nodes.find(n=>n['@type']==='WebSite')!;
  assert.equal(site.name,'Puma政策筆記');assert.equal(site.url,origin+'/');
  assert.equal(site.potentialAction,undefined);
  const collection=nodes.find(n=>n['@type']==='CollectionPage')!;
  assert.equal(collection.url,origin+'/');
  assert.equal(collection.dateModified,data.content_updated);
  assert.match(html,/<link rel="canonical" href="https:\/\/puma-note.pages.dev\/">/);
  assert.match(html,/<meta property="og:url" content="https:\/\/puma-note.pages.dev\/">/);
  const list=nodes.find(n=>n['@id']===collection.mainEntity['@id'])!;
  assert.equal(list['@type'],'ItemList');assert.equal(list.numberOfItems,86);
  assert.deepEqual(list.itemListElement.map((i:any)=>[i.position,i.name,i.url]),data.topics.map((t:any,index:number)=>[index+1,t.title,`${origin}/topics/${t.id}/`]));
  assert.doesNotMatch(JSON.stringify(nodes),/GovernmentOrganization|PoliticalParty|SearchAction|FAQPage|QAPage|aggregateRating/);
});

test('every topic describes its exact visible summary, dates and cited sources without official authorship',()=>{
  for(const topic of data.topics){
    const nodes=graph(pages.renderTopicPage(topic,data));
    const page=nodes.find(n=>n['@type']==='WebPage')!;
    assert.ok(page,topic.id);
    assert.equal(page.url,`${origin}/topics/${topic.id}/`);
    const note=nodes.find(n=>n['@id']===page.mainEntity['@id'])!;
    assert.equal(note['@type'],'CreativeWork');assert.equal(note.name,topic.title);
    assert.equal(note.text,topic.share.text);assert.equal(note.dateModified,topic.content_updated || data.content_updated);
    assert.equal(note.inLanguage,'zh-Hant-TW');assert.equal(note.about.name,topic.group_title);
    assert.deepEqual(note.citation.map((s:any)=>s.url),topic.share.source_urls);
    for(const citation of note.citation){
      assert.equal(citation['@type'],'CreativeWork');
      assert.equal(citation.name,topic.sources.find((s:any)=>s.url===citation.url)?.title);
    }
    const crumbs=nodes.find(n=>n['@id']===page.breadcrumb['@id'])!;
    assert.equal(crumbs['@type'],'BreadcrumbList');
    assert.deepEqual(crumbs.itemListElement.map((c:any)=>[c.position,c.item]),[[1,origin+'/'],[2,page.url]]);
    assert.equal(note.author,undefined);assert.equal(note.publisher,undefined);
    assert.doesNotMatch(JSON.stringify(nodes),/GovernmentOrganization|PoliticalParty|FAQPage|QAPage|Service|aggregateRating/);
  }
});

test('JSON-LD cannot close its script element and uses content dates rather than deployment dates',()=>{
  const topic=structuredClone(data.topics[0]);
  delete topic.content_updated;
  const attack='</script><script>alert("schema")</script> & \u2028';
  topic.title=attack;topic.share.text=attack;topic.sources[0].title=attack;
  const html=pages.renderTopicPage(topic,{...data,content_updated:undefined,source_snapshot_date:'2026-01-02'});
  const nodes=graph(html);
  const note=nodes.find(n=>n['@type']==='CreativeWork')!;
  assert.equal(note.name,attack);assert.equal(note.text,attack);assert.equal(note.dateModified,'2026-01-02');
  assert.equal(html.includes('<script>alert('),false);
  const encoded=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
  assert.equal(encoded.includes('<'),false);assert.equal(encoded.includes('\u2028'),false);
});

test('checking sources again preserves the content date of an unchanged topic',()=>{
  const topic={...data.topics[0],content_updated:'2026-11-07'};
  const updatedLibrary={...data,content_updated:'2026-11-09',source_snapshot_date:'2026-11-09'};
  const html=pages.renderTopicPage(topic,updatedLibrary);
  const dated=graph(html).filter(n=>n.dateModified);
  assert.ok(dated.length>0);
  assert.ok(dated.every(n=>n.dateModified==='2026-11-07'));
  assert.match(html,/data-source-snapshot-date="2026-11-09" data-content-updated="2026-11-07"/);
});
