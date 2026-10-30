// 多源抓免费节点：node refresh.mjs
import fs from 'node:fs';
import net from 'node:net';

const OUT = process.cwd(); // run from repo root

// 仓库 + 可能的路径，挨个试，哪个 200 用哪个
const SOURCES = [
  ['ermaozi/get_subscribe', ['subscribe/v2ray.txt', 'subscribe/v2ray']],
  ['ripaojiedian/freenode', ['sub', 'sub/sub.txt']],
  ['aiboboxx/v2rayfree', ['v2ray', 'v2ray.txt', 'clash']],
  ['mfuu/v2ray', ['v2ray', 'v2ray.txt']],
  ['Pawdroid/Free-servers', ['sub/sub.txt', 'sub']],
  ['freefq/free', ['v2', 'v2ray', 'clash']],
  ['Leon406/SubCrawler', ['sub/share.txt', 'sub/sub_merge.txt']],
  ['Alvin9999/pac2', ['v2ray/config.yaml']],
  ['ts-sf/fly', ['v2', 'clash']],
  ['Rokate/Proxy-Sub', ['v2ray', 'V2ray', 'clash']],
];

async function ghFile(repo, path) {
  const r = await fetch('https://api.github.com/repos/' + repo + '/contents/' + encodeURIComponent(path),
    { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.content) return null;
  return Buffer.from(j.content, 'base64').toString('utf8');
}

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function parse(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const u = line.trim();
    if (!u) continue;
    if (u.startsWith('ss://')) {
      const body = u.slice(5).split('#')[0].split('?')[0];
      let method = '', pass = '', host = '', port = 0;
      if (body.includes('@')) {
        const [cred, hp] = body.split('@');
        let dec = cred;
        try { dec = b64(cred + '='.repeat((4 - cred.length % 4) % 4)); } catch {}
        [method, pass] = dec.split(':');
        [host, port] = hp.split(':');
      } else {
        const dec = b64(body + '='.repeat((4 - body.length % 4) % 4));
        const [cred, hp] = dec.split('@');
        [method, pass] = cred.split(':');
        [host, port] = hp.split(':');
      }
      if (method && pass && host && port) out.push({ proto: 'ss', method, pass, host, port: +port });
    } else if (u.startsWith('vmess://')) {
      try {
        const j = JSON.parse(b64(u.slice(8).split('#')[0]));
        if (j.add && j.id) out.push({ proto: 'vmess', id: j.id, aid: +(j.aid || 0), host: j.add, port: +j.port });
      } catch {}
    }
  }
  return out;
}

function probe(host, port, timeout = 2500) {
  return new Promise((res) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    let done = false;
    const fin = (v) => { if (done) return; done = true; s.destroy(); res(v); };
    s.setTimeout(timeout);
    s.on('connect', () => fin(Date.now() - t0));
    s.on('timeout', () => fin(-1));
    s.on('error', () => fin(-1));
  });
}

// 1. 抓
let all = [], hits = [];
for (const [repo, paths] of SOURCES) {
  let got = null, used = '';
  for (const p of paths) { got = await ghFile(repo, p); if (got) { used = p; break; } }
  if (!got) { console.log('x  ' + repo); continue; }
  const body = /^[A-Za-z0-9+/=\s]+$/.test(got.trim()) && !got.includes('://') ? b64(got.replace(/\s/g, '')) : got;
  const list = parse(body);
  all = all.concat(list);
  hits.push(repo + '(' + used + '):' + list.length);
  console.log('ok ' + repo + ' via ' + used + ' -> ' + list.length);
}
console.log('\n命中源:', hits.join(', '));

// 2. 去重
const uniq = [...new Map(all.map(n => [n.host + ':' + n.port, n])).values()];
console.log('去重后:', uniq.length, '| ss:', uniq.filter(n => n.proto === 'ss').length, '| vmess:', uniq.filter(n => n.proto === 'vmess').length);

// 3. 并发探测（60 路）
const alive = [];
for (let i = 0; i < uniq.length; i += 60) {
  const batch = uniq.slice(i, i + 60);
  const ms = await Promise.all(batch.map(n => probe(n.host, n.port)));
  batch.forEach((n, k) => { if (ms[k] > 0) alive.push({ ...n, ms: ms[k] }); });
  if (i % 300 === 0) console.log('  探测', i, '/', uniq.length, '存活', alive.length);
}
alive.sort((a, b) => a.ms - b.ms);
console.log('TCP 可达:', alive.length);

// 4. 写配置
const proxies = alive.map((n, i) => n.proto === 'ss'
  ? { name: 'n' + i + '-ss', type: 'ss', server: n.host, port: n.port, cipher: n.method, password: n.pass, udp: true }
  : { name: 'n' + i + '-vm', type: 'vmess', server: n.host, port: n.port, uuid: n.id, alterId: n.aid, cipher: 'auto', udp: true });
const cfg = ['mixed-port: 7890', 'allow-lan: false', 'mode: rule', 'log-level: warning',
  'external-controller: 127.0.0.1:9099', 'secret: ' + (process.env.MIHOMO_SECRET || 'local'),
  'dns:', '  enable: true', "  nameserver: ['223.5.5.5', '119.29.29.29']",
  'proxies:', ...proxies.map(p => '  - ' + JSON.stringify(p)),
  'proxy-groups:', '  - name: PROXY', '    type: select',
  '    proxies: [' + proxies.map(p => p.name).join(', ') + ']',
  'rules:', '  - MATCH,PROXY', ''].join('\n');
fs.writeFileSync(OUT + '/config.yaml', cfg);
console.log('已写 config.yaml，', proxies.length, '个节点');
