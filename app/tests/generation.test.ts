import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDraft, finishDraft, buildInstructions } from '../worker/generation';
import type { Evidence } from '../shared/contracts';

const evidence: Evidence[] = [{ id: 'e1', sourceId: 's1', title: '運動政策', kind: 'official', url: 'https://puma.taipei/policies/運動政策', section: '運動小巴', text: '規劃社區運動小巴，提供運動教學。', verification: 'downloaded_not_fact_checked', notes: [] }];

test('unknown evidence IDs cannot become valid citations', () => {
  assert.throws(() => validateDraft({ relevant: true, body: '政策有提供社區運動教學規劃。', evidenceIds: ['invented'] }, evidence), /來源/);
});

test('body cannot contain fabricated source links or source footers', () => {
  assert.throws(() => validateDraft({ relevant: true, body: '請看 https://evil.example/ 的說明。', evidenceIds: ['e1'] }, evidence));
});

test('overlength output fails closed rather than truncating the citation', () => {
  const draft = validateDraft({ relevant: true, body: '政策說明'.repeat(180), evidenceIds: ['e1'] }, evidence);
  assert.throws(() => finishDraft(draft, evidence), /500/);
});

test('every valid post ends in a server-resolved source URL', () => {
  const result = finishDraft(validateDraft({ relevant: true, body: '官方政策規劃社區運動小巴，提供運動教學。', evidenceIds: ['e1'] }, evidence), evidence);
  assert.equal(result.sources[0].id, 's1');
  assert.ok(result.post.endsWith('https://puma.taipei/policies/運動政策'));
  assert.ok(result.characterCount <= 500);
});

test('unrelated model answer does not create a sourced post', () => {
  assert.throws(() => validateDraft({ relevant: false, body: '', evidenceIds: [] }, evidence), /相關/);
});

test('proposal sources do not become assertions that a service is already available', () => {
  assert.throws(() => validateDraft({ relevant: true, body: '運動小巴已正式上路，現在就可以申請。', evidenceIds: ['e1'] }, evidence), /狀態/);
  for (const body of ['運動小巴已推出。', '目前開放申請。', '已開始受理。', '服務正在實施。']) {
    assert.throws(() => validateDraft({ relevant: true, body, evidenceIds: ['e1'] }, evidence), /狀態/);
  }
});

test('instructions distinguish untrusted user text and supplied sources', () => {
  const instructions = buildInstructions('reply', 320);
  assert.ok(instructions.includes('不可信'));
  assert.ok(instructions.includes('320'));
  assert.ok(instructions.includes('訪談'));
});

test('a retrieved excerpt cannot establish that a policy or interview did not mention a topic', () => {
  for (const body of ['這段內容沒有提到換屋安排。', '他未曾提出換屋。', '訪談沒有說明這件事。']) {
    assert.throws(() => validateDraft({ relevant: true, body, evidenceIds: ['e1'] }, evidence), /沒說過/);
  }
  assert.doesNotThrow(() => validateDraft({ relevant: true, body: '政策提出社區運動小巴。', evidenceIds: ['e1'] }, evidence));
});
