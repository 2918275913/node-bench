import fs from 'node:fs';
// 并发测延迟，挑最快的：node rank.mjs
const H = { Authorization: 'Bearer ' + (process.env.MIHOMO_SECRET || 'local') };
const API = process.env.MIHOMO_API || 'http://127.0.0.1:9099';
const CONC = 15;
const URL = encodeURIComponent('http://www.gstatic.com/generate_204');

const all = await (await fetch(API + '/proxies', { headers: H, signal: AbortSignal.timeout(10000) })).json();
const names = Object.keys(all.proxies).filter(n => /^n\d+-/.test(n));
console.log('待测节点:', names.length);

async function delay(n) {
  try {
    const r = await fetch(API + '/proxies/' + encodeURIComponent(n) + '/delay?url=' + URL + '&timeout=5000',
      { headers: H, signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return j.delay || null;
  } catch { return null; }
}

const results = [];
for (let i = 0; i < names.length; i += CONC) {
  const batch = names.slice(i, i + CONC);
  const ds = await Promise.all(batch.map(delay));
  batch.forEach((n, k) => { if (ds[k]) results.push({ n, d: ds[k] }); });
  process.stdout.write('\r测了 ' + Math.min(i + CONC, names.length) + '/' + names.length + ' 可用 ' + results.length);
}
console.log('');
results.sort((a, b) => a.d - b.d);
console.log('可用:', results.length, '/', names.length);
console.log(results.slice(0, 15).map(r => r.n + '  ' + r.d + 'ms').join('\n'));

if (results.length) {
  const best = results[0].n;
  await fetch(API + '/proxies/PROXY', { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ name: best }) });
  console.log('已切到', best);
  fs.writeFileSync('rank.json', JSON.stringify(results, null, 1));
}
