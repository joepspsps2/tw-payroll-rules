#!/usr/bin/env node
// 年度表齊不齊（保鮮檢查）。官方只有新聞稿、法條、PDF，不自動下載；這支只看「結果」：
//   ① 今年不在年度表裡，或今年還有 pending（官方還沒公告、暫用）→ 要補
//   ② 12 月起明年不在年度表裡 → 要補（基本工資 10 月就公告了）
//   ③ 日支數額表：今年（12 月起＝明年）還沒確認過適用哪一版 → 要查主計總處
// 用法：
//   node scripts/check-years.mjs                 印出結果；有要補的以 1 結束
//   node scripts/check-years.mjs --today 2027-12-01
//   node scripts/check-years.mjs --json          給程式讀
//   node scripts/check-years.mjs --status-only   只驗 status.json 跟資料檔一致（npm test 會跑）
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const years = JSON.parse(readFileSync(new URL('src/data/years.json', root), 'utf8'));
const perDiem = JSON.parse(readFileSync(new URL('src/data/per-diem-overseas.json', root), 'utf8'));
const status = JSON.parse(readFileSync(new URL('status.json', root), 'utf8'));
const args = process.argv.slice(2);

/** 由資料檔算出 status.json 應該有的內容 */
export function expectedStatus() {
  const pending = {};
  for (const y of years.years) if (y.pending.length) pending[y.year] = [...y.pending];
  return {
    dataDate: years.dataDate,
    years: years.years.map((y) => y.year).sort(),
    pending,
    perDiemEditions: perDiem.editions.map((e) => e.effectiveFrom).sort(),
    perDiemCheckedFor: perDiem.checkedFor,
  };
}

if (args.includes('--status-only')) {
  const want = expectedStatus();
  const bad = Object.entries(want).filter(([k, v]) => JSON.stringify(status[k]) !== JSON.stringify(v));
  if (bad.length) {
    for (const [k, v] of bad) console.error(`status.json 的 ${k} 跟資料檔不一致：應為 ${JSON.stringify(v)}，現在是 ${JSON.stringify(status[k])}`);
    process.exit(1);
  }
  console.log('status.json 跟資料檔一致');
  process.exit(0);
}

const todayArg = args.indexOf('--today');
const today = todayArg >= 0 ? args[todayArg + 1]
  : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4));
const month = Number(today.slice(5, 7));
const byYear = new Map(years.years.map((y) => [y.year, y]));
const items = [];

const cur = byYear.get(year);
if (!cur) items.push({ kind: 'missing', year, msg: `今年（${year}）不在年度表裡，使用者會沿用前一年的數字` });
else if (cur.pending.length) items.push({ kind: 'pending', year, fields: cur.pending, msg: `今年（${year}）還有欄位暫用：${cur.pending.join('、')}` });
if (month === 12 && !byYear.has(year + 1)) items.push({ kind: 'missing', year: year + 1, msg: `明年（${year + 1}）還不在年度表裡（基本工資通常 10 月已公告）` });
const needPerDiem = month === 12 ? year + 1 : year;
if ((perDiem.checkedFor ?? 0) < needPerDiem) {
  items.push({ kind: 'per-diem', year: needPerDiem, msg: `日支數額表還沒確認 ${needPerDiem} 年適用哪一版（主計總處通常 10 月公布次年版）` });
}

if (args.includes('--json')) {
  console.log(JSON.stringify({ today, ok: items.length === 0, items }, null, 2));
} else if (!items.length) {
  console.log(`✅ ${today}：年度表與日支表都齊`);
} else {
  console.log(`🟡 ${today}：要補 ${items.length} 項（出處見 src/data/years.json 的 cite，更新方式見 README「每年怎麼更新」）`);
  for (const i of items) console.log(`- ${i.msg}`);
}
process.exit(items.length ? 1 : 0);
