import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildSummaryCopy} from '../public/topics/summary-copy.mjs';

const data=JSON.parse(readFileSync(new URL('../public/topics/data.json',import.meta.url),'utf8'));

test('all published topics copy their title and complete cited summary within the 500-character share limit',()=>{
  assert.equal(data.topics.length,86);
  for(const topic of data.topics){
    const copy=buildSummaryCopy(topic.title,topic.share.text);
    const prefix=topic.title+'\n\n';
    assert.ok(copy.startsWith(prefix),`${topic.id} copied text is missing its title`);
    assert.equal(copy.slice(prefix.length),topic.share.text,`${topic.id} changes the cited summary`);
    assert.ok(copy.length<=500,`${topic.id} exceeds 500 characters including title and sources`);
  }
});
