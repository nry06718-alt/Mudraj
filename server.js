// مدرج: سيرفر بيانات الدوريات العربية
// التشغيل: API_FOOTBALL_KEY=مفتاحك npm start
// البحث اليدوي عن رقم دوري: API_FOOTBALL_KEY=مفتاحك node server.js find Egypt
//
// الفكرة: ما في تحديث دوري بالخلفية. الجدول يتحدّث فقط لما يطلبه مستخدم
// وتكون بياناته أقدم من REFRESH_MIN. يعني الطلبات ما تنصرف على دوري ما أحد فتحه،
// وتناسب استضافة Render المجانية اللي تنام وتصحى.

import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY = (process.env.API_FOOTBALL_KEY || '').trim().replace(/^["']|["']$/g, '');
const PORT = process.env.PORT || 3000;
const REFRESH_MIN = Number(process.env.REFRESH_MIN || 180);
const REDISCOVER_DAYS = 7; // كل كم يوم نعيد التأكد من رقم الدوري والموسم
const BASE = 'https://v3.football.api-sports.io';
const CACHE_FILE = 'cache.json';

// الرموز لازم تطابق الرموز في index.html (قائمة LG)
// id: رقم ثابت إذا تبغى تحدده بنفسك، وإلا يُكتشف تلقائيًا من اسم الدولة
const LEAGUES = {
  sa: { name: 'الدوري السعودي',   country: 'Saudi-Arabia',          id: 307 },
  eg: { name: 'الدوري المصري',    country: 'Egypt' },
  ae: { name: 'الدوري الإماراتي', country: 'United-Arab-Emirates' },
  qa: { name: 'الدوري القطري',    country: 'Qatar' },
  ma: { name: 'الدوري المغربي',   country: 'Morocco' },
  kw: { name: 'الدوري الكويتي',   country: 'Kuwait' },
  bh: { name: 'الدوري البحريني',  country: 'Bahrain' },
  om: { name: 'الدوري العماني',   country: 'Oman' },
  jo: { name: 'الدوري الأردني',   country: 'Jordan' },
  iq: { name: 'الدوري العراقي',   country: 'Iraq' },
  dz: { name: 'الدوري الجزائري',  country: 'Algeria' },
  tn: { name: 'الدوري التونسي',   country: 'Tunisia' },
  ly: { name: 'الدوري الليبي',    country: 'Libya' },
  sd: { name: 'الدوري السوداني',  country: 'Sudan' },
  lb: { name: 'الدوري اللبناني',  country: 'Lebanon' },
  sy: { name: 'الدوري السوري',    country: 'Syria' },
  ps: { name: 'الدوري الفلسطيني', country: 'Palestine' },
  ye: { name: 'الدوري اليمني',    country: 'Yemen' },
};

if (!KEY) { console.error('ضع المفتاح في API_FOOTBALL_KEY'); process.exit(1); }
console.log('طول المفتاح:', KEY.length, '| أول حرفين:', KEY.slice(0, 2)); // للتأكد فقط، بدون كشف المفتاح

async function api(path) {
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY } });
  if (!r.ok) {
    const body = (await r.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    throw new Error('API ' + r.status + ' | ' + body);
  }
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) throw new Error(JSON.stringify(j.errors));
  return j.response;
}

// أداة البحث اليدوي
if (process.argv[2] === 'find') {
  const rows = await api('/leagues?country=' + encodeURIComponent(process.argv[3] || ''));
  rows.forEach(x => console.log(x.league.id, '|', x.league.name, '|', x.league.type, '|', x.country.name));
  process.exit(0);
}

let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const save = () => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch {} };

const SKIP = /women|femin|u-?\d\d|youth|reserve|second|2nd|division\s*[2-9]|\bii\b|cup|super\s?cup|qualif/i;

// يلقى الدوري الأول في الدولة وموسمه الحالي
async function discover(code) {
  const L = LEAGUES[code];
  const rows = await api('/leagues?type=league&current=true&country=' + encodeURIComponent(L.country));
  let pick;
  if (L.id) pick = rows.find(x => x.league.id === L.id);
  pick = pick || rows.find(x => !SKIP.test(x.league.name)) || rows[0];
  if (!pick) throw new Error('الدوري غير متوفر في API-Football');
  const season = (pick.seasons.find(s => s.current) || pick.seasons.at(-1)).year;
  console.log(`[${code}] اخترنا: ${pick.league.id} | ${pick.league.name} | موسم ${season}`);
  return { leagueId: pick.league.id, leagueName: pick.league.name, season, at: Date.now() };
}

async function refresh(code) {
  const old = cache[code] || {};
  let meta = old.meta;
  if (!meta || Date.now() - meta.at > REDISCOVER_DAYS * 864e5) meta = await discover(code);
  const res = await api(`/standings?league=${meta.leagueId}&season=${meta.season}`);
  const table = (res[0]?.league?.standings?.[0] || []).map(t => ({
    rank: t.rank,
    teamId: t.team.id, // اربط المقاطع والتصويت بهذا الرقم، مو بمكان الفريق في الجدول
    name: t.team.name,
    points: t.points,
    played: t.all.played,
    gd: t.goalsDiff,
  }));
  if (!table.length) throw new Error('الجدول فاضي');
  cache[code] = { meta, updatedAt: Date.now(), table };
  save();
  console.log('تم تحديث', code, table.length, 'فريق');
}

const inflight = {};
function refreshOnce(code) {
  return inflight[code] ||= refresh(code).finally(() => { delete inflight[code]; });
}

const app = express();
const PAGE = fileURLToPath(new URL('./index.html', import.meta.url));
app.get('/', (_, res) => res.sendFile(PAGE));

app.get('/api/leagues', (_, res) =>
  res.json(Object.entries(LEAGUES).map(([code, l]) => ({ code, name: l.name }))));

app.get('/api/standings/:code', async (req, res) => {
  const code = req.params.code;
  if (!LEAGUES[code]) return res.status(404).json({ error: 'دوري غير معروف' });
  let c = cache[code];
  const stale = !c || Date.now() - c.updatedAt > REFRESH_MIN * 60000;
  if (stale) {
    if (!c) {
      try { await refreshOnce(code); c = cache[code]; }
      catch (e) { console.error(code, e.message); return res.status(404).json({ error: 'لا توجد بيانات لهذا الدوري بعد' }); }
    } else {
      refreshOnce(code).catch(e => console.error(code, e.message)); // نرجّع القديم ونحدّث بالخلفية
    }
  }
  res.json({ updatedAt: c.updatedAt, top4: c.table.slice(0, 4), table: c.table });
});

app.listen(PORT, () => console.log('مدرج يعمل على المنفذ', PORT));
