// مدرج: سيرفر بيانات الدوريات
// 1) npm install
// 2) API_FOOTBALL_KEY=مفتاحك npm start
// 3) لإيجاد رقم دوري: API_FOOTBALL_KEY=مفتاحك node server.js find Egypt
//
// حساب الطلبات: عدد الدوريات × (1440 ÷ REFRESH_MIN) يجب ألا يتعدى حد باقتك اليومي.
// مثال: 5 دوريات وتحديث كل 180 دقيقة = 40 طلب في اليوم.

import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY = process.env.API_FOOTBALL_KEY;
const PORT = process.env.PORT || 3000;
const REFRESH_MIN = Number(process.env.REFRESH_MIN || 180);
const BASE = 'https://v3.football.api-sports.io';
const CACHE_FILE = 'cache.json';

// ضيف باقي الدوريات بعد ما تجيب أرقامها بأمر find
// season: اختياري، لو الدوري يبدأ موسمه في سنة غير المتوقعة
const LEAGUES = {
  sa: { id: 307, name: 'الدوري السعودي' },
  // eg: { id: 0, name: 'الدوري المصري' },
};

if (!KEY) { console.error('ضع المفتاح في API_FOOTBALL_KEY'); process.exit(1); }

const currentSeason = () => {
  const d = new Date();
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
};

async function api(path) {
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY } });
  if (!r.ok) throw new Error('API ' + r.status);
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) throw new Error(JSON.stringify(j.errors));
  return j.response;
}

// أداة البحث عن رقم الدوري
if (process.argv[2] === 'find') {
  const rows = await api('/leagues?country=' + encodeURIComponent(process.argv[3] || ''));
  rows.forEach(x => console.log(x.league.id, '|', x.league.name, '|', x.country.name));
  process.exit(0);
}

let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

async function refresh(code) {
  const L = LEAGUES[code];
  const res = await api(`/standings?league=${L.id}&season=${L.season || currentSeason()}`);
  const table = (res[0]?.league?.standings?.[0] || []).map(t => ({
    rank: t.rank,
    teamId: t.team.id, // اربط المقاطع والتصويت بهذا الرقم، مو بمكان الفريق في الجدول
    name: t.team.name,
    points: t.points,
    played: t.all.played,
    gd: t.goalsDiff,
  }));
  cache[code] = { updatedAt: Date.now(), table };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log('تم تحديث', code, table.length, 'فريق');
}

async function refreshAll() {
  for (const code of Object.keys(LEAGUES)) {
    try { await refresh(code); } catch (e) { console.error(code, e.message); }
  }
}
refreshAll();
setInterval(refreshAll, REFRESH_MIN * 60 * 1000);

const app = express();
const PAGE = fileURLToPath(new URL('./index.html', import.meta.url));
app.get('/', (_, res) => res.sendFile(PAGE)); // صفحة مدرج

app.get('/api/leagues', (_, res) =>
  res.json(Object.entries(LEAGUES).map(([code, l]) => ({ code, name: l.name }))));

app.get('/api/standings/:code', (req, res) => {
  const c = cache[req.params.code];
  if (!c) return res.status(404).json({ error: 'لا توجد بيانات لهذا الدوري بعد' });
  res.json({ updatedAt: c.updatedAt, top4: c.table.slice(0, 4), table: c.table });
});

app.listen(PORT, () => console.log('مدرج يعمل على المنفذ', PORT));
