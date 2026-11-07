import { useEffect } from 'react';

/** Legacy homepage entry: all public browsing now uses the static topic library. */
export default function App() {
  useEffect(() => {
    const incoming = new URL(window.location.href);
    const target = new URL('/topics/', incoming);
    for (const key of ['q', 'group', 'topic']) {
      const value = incoming.searchParams.get(key);
      if (value) target.searchParams.set(key, value.slice(0, 150));
    }
    window.location.replace(`${target.pathname}${target.search}`);
  }, []);

  return (
    <main style={{ maxWidth: 680, margin: '12vh auto', padding: 24 }}>
      <h1>Puma政策筆記</h1>
      <p>依主題或問題查找已整理的政策摘要與原始來源。</p>
      <a href="/topics/">前往政策主題館</a>
    </main>
  );
}
