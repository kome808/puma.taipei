export const SITE_ORIGIN = 'https://puma-note.pages.dev';
const home = `${SITE_ORIGIN}/`;
const language = 'zh-Hant-TW';
const siteId = `${home}#website`;

function website() {
  return {
    '@type': 'WebSite', '@id': siteId, url: home, name: 'Puma政策筆記', inLanguage: language,
    description: '民間獨立整理的政策與訪談筆記，非官方網站，也不代表任何候選人或團隊發言。',
  };
}

function contentDate(data) {
  const date = data.content_updated || data.source_snapshot_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Structured data requires a valid content date');
  }
  return date;
}

export function libraryStructuredData(data) {
  const listId = `${home}#topics`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website(),
      {
        '@type': 'CollectionPage', '@id': `${home}#webpage`, url: home,
        name: '政策主題館｜Puma政策筆記', inLanguage: language,
        description: '民間獨立整理的政策與訪談筆記，附短摘要與原始來源。',
        dateModified: contentDate(data), isPartOf: { '@id': siteId }, mainEntity: { '@id': listId },
      },
      {
        '@type': 'ItemList', '@id': listId, name: '政策主題館', numberOfItems: data.topics.length,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: data.topics.map((topic, index) => ({
          '@type': 'ListItem', position: index + 1, name: topic.title, url: `${home}topics/${topic.id}/`,
        })),
      },
    ],
  };
}

export function topicStructuredData(topic, data, canonical) {
  const topicDate = contentDate({ ...data, content_updated: topic.content_updated || data.content_updated });
  const pageId = `${canonical}#webpage`;
  const noteId = `${canonical}#note`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  // Cite only sources present in the visible summary, retaining its official-first order.
  const citation = topic.share.source_urls.map((url) => {
    const source = topic.sources.find((entry) => entry.url === url);
    if (!source) throw new Error(`Missing cited source for ${topic.id}`);
    return { '@type': 'CreativeWork', name: source.title, url: source.url };
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website(),
      {
        '@type': 'WebPage', '@id': pageId, url: canonical, name: topic.title,
        inLanguage: language, dateModified: topicDate, isPartOf: { '@id': siteId },
        mainEntity: { '@id': noteId }, breadcrumb: { '@id': breadcrumbId },
      },
      {
        '@type': 'CreativeWork', '@id': noteId, url: canonical, name: topic.title,
        text: topic.share.text, genre: '政策與訪談的獨立整理', inLanguage: language,
        dateModified: topicDate, mainEntityOfPage: { '@id': pageId },
        about: { '@type': 'Thing', name: topic.group_title }, citation,
      },
      {
        '@type': 'BreadcrumbList', '@id': breadcrumbId,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '政策主題館', item: home },
          { '@type': 'ListItem', position: 2, name: topic.title, item: canonical },
        ],
      },
    ],
  };
}

export function jsonLdScript(data) {
  // JSON inside an HTML script is a raw-text block; HTML-entity escaping is not suitable here.
  const json = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<script type="application/ld+json">${json}</script>`;
}
