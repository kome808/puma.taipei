import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemblePost, countCharacters, isPostWithinLimit, sourceSuffix } from '../shared/post';
import type { PostSource } from '../shared/contracts';

const source: PostSource = { id: 'policy-sport', title: '運動政策', kind: 'official', url: 'https://puma.taipei/policies/%E9%81%8B%E5%8B%95%E6%94%BF%E7%AD%96' };

test('500 boundary includes final sources and all newlines', () => {
  const suffix = sourceSuffix([source]);
  const exact = assemblePost('文'.repeat(500 - countCharacters(suffix)), [source]);
  assert.equal(countCharacters(exact), 500);
  assert.equal(isPostWithinLimit(exact), true);
  assert.equal(isPostWithinLimit('文' + exact), false);
  assert.ok(exact.endsWith('https://puma.taipei/policies/運動政策'));
});

test('emoji and combined unicode count conservatively without hiding extra characters', () => {
  assert.equal(countCharacters('文😀\n'), 4);
  assert.equal(isPostWithinLimit('😀'.repeat(251)), false);
});

test('final source footer is deterministic and deduplicates URLs', () => {
  const post = assemblePost('政策原文說明。', [source, { ...source, id: 'same-url' }]);
  assert.equal(post.match(/https:\/\//g)?.length, 1);
  assert.equal(post, '政策原文說明。\n\n資料來源：\nhttps://puma.taipei/policies/運動政策');
});

test('empty and whitespace-only posts cannot be copied', () => {
  assert.equal(isPostWithinLimit(''), false);
  assert.equal(isPostWithinLimit('  \n'), false);
  assert.equal(assemblePost('  ', [source]), '');
});

test('source URLs with unexpected hosts or control characters are rejected', () => {
  assert.throws(() => assemblePost('說明', [{ ...source, url: 'https://evil.example/' }]));
  assert.throws(() => assemblePost('說明', [{ ...source, url: 'https://puma.taipei/\nspoof' }]));
});

test('downloaded interview mirror URLs remain valid traceable citations', () => {
  const mirror = { ...source, url: 'https://puma-shen-interview.pages.dev/puma-shen-2026-04-12' };
  const post = assemblePost('訪談內容整理。', [mirror]);
  assert.ok(post.endsWith(mirror.url));
});
