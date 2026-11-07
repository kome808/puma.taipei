import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(appDir, 'content/policy-topics/expanded-topics.json');
const outputPath = path.join(appDir, 'public/topics/data.json');
const EXPECTED_TOPICS = 86;
const EXPECTED_GROUPS = 15;
const MAX_SHARE_LENGTH = 500;

function fail(message) {
  throw new Error(`Public topics export validation failed: ${message}`);
}

function assertSourceUrls(urls, sourceUrls, topicId, field) {
  if (!Array.isArray(urls) || !urls.length) fail(`${topicId}.${field} must have source URLs`);
  for (const url of urls) {
    if (!sourceUrls.has(url)) fail(`${topicId}.${field} references missing source URL: ${url}`);
  }
}

const source = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(source.groups) || !Array.isArray(source.topics)) fail('groups/topics must be arrays');
if (source.topics.length !== EXPECTED_TOPICS) fail(`expected ${EXPECTED_TOPICS} topics, got ${source.topics.length}`);
if (source.groups.length !== EXPECTED_GROUPS) fail(`expected ${EXPECTED_GROUPS} groups, got ${source.groups.length}`);

const groupIds = new Set();
for (const group of source.groups) {
  if (groupIds.has(group.id)) fail(`duplicate group ID: ${group.id}`);
  groupIds.add(group.id);
}

const topicIds = new Set();
const topicGroupCounts = new Map(source.groups.map(({ id }) => [id, 0]));
let maxShareLength = 0;
const topics = source.topics.map((topic) => {
  if (topicIds.has(topic.id)) fail(`duplicate topic ID: ${topic.id}`);
  topicIds.add(topic.id);
  if (!topicGroupCounts.has(topic.group_id)) fail(`${topic.id} references unknown group ${topic.group_id}`);
  topicGroupCounts.set(topic.group_id, topicGroupCounts.get(topic.group_id) + 1);

  const sources = (topic.sources ?? []).map(({ title, url, type, kind }) => ({ title, url, type, kind }));
  const sourceUrls = new Set(sources.map(({ url }) => url));
  let hasContent = false;
  const content = {};
  for (const field of ['official', 'interview', 'differences']) {
    if (!Array.isArray(topic[field])) fail(`${topic.id}.${field} must be an array`);
    content[field] = topic[field].map(({ text, source_urls }) => {
      if (field !== 'differences') hasContent = true;
      assertSourceUrls(source_urls, sourceUrls, topic.id, field);
      return { text, source_urls };
    });
  }
  if (!hasContent) fail(`${topic.id} has no official/interview/differences content`);

  const share = topic.share;
  if (!share || typeof share.text !== 'string' || typeof share.body !== 'string') fail(`${topic.id} has invalid share body/text`);
  const actualLength = share.text.length;
  if (actualLength > MAX_SHARE_LENGTH) fail(`${topic.id} share.text is ${actualLength} UTF-16 units (max ${MAX_SHARE_LENGTH})`);
  if (actualLength !== share.utf16_length) fail(`${topic.id} share.utf16_length is ${share.utf16_length}, expected ${actualLength}`);
  maxShareLength = Math.max(maxShareLength, actualLength);
  assertSourceUrls(share.source_urls, sourceUrls, topic.id, 'share');
  if (share.source_urls.length > 2 || new Set(share.source_urls).size !== share.source_urls.length) fail(`${topic.id} share must have one or two unique source URLs`);
  const postUrls = (share.text.match(/https:\/\/[^\s]+/g) ?? []).map((url) => decodeURI(url));
  if (postUrls.length !== share.source_urls.length || !share.source_urls.every((url) => postUrls.includes(decodeURI(url)))) fail(`${topic.id} share text does not retain its original source URLs`);

  return {
    id: topic.id,
    group_id: topic.group_id,
    group_title: topic.group_title,
    title: topic.title,
    question: topic.question,
    scope: topic.scope,
    intro: topic.intro,
    keywords: topic.keywords,
    ...content,
    sources,
    share: {
      body: share.body,
      text: share.text,
      source_urls: share.source_urls,
      utf16_length: share.utf16_length,
    },
  };
});

const groups = source.groups.map(({ id, title }) => ({
  id,
  title,
  count: topicGroupCounts.get(id),
}));
const output = {
  schema_version: 1,
  name: source.name,
  version: source.version,
  source_snapshot_date: source.source_snapshot_date,
  content_updated: source.content_revision?.date ?? source.source_snapshot_date,
  topic_count: topics.length,
  groups,
  topics,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Exported ${topics.length} topics across ${groups.length} groups; maximum share.text length ${maxShareLength}/${MAX_SHARE_LENGTH} UTF-16 units.`);
