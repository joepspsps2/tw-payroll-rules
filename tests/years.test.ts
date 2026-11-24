import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ratesOfYear, ratesOn, freshness, FIELD_KEYS, YEARS, FIELDS } from '../src/years.ts';

const DATA = JSON.parse(readFileSync(new URL('../src/data/years.json', import.meta.url), 'utf8'));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test('每年一列、每格都有值與出處（官方網址＋資料日期）', () => {
  assert.ok(YEARS.includes(2026) && YEARS.includes(2027));
  for (const row of DATA.years) {
    assert.equal(row.roc, row.year - 1911);
    assert.deepEqual(Object.keys(row.values).sort(), [...FIELD_KEYS].sort(), `${row.year} 欄位不齊`);
    for (const k of FIELD_KEYS) {
      assert.equal(typeof row.values[k], 'number', `${row.year} ${k}`);
      const c = row.cite[k];
      assert.ok(c, `${row.year} ${k} 沒出處`);
      assert.match(c.url, /^https:\/\/[^/]*(gov\.tw)\//, `${row.year} ${k} 出處不是政府網站：${c.url}`);
      assert.match(c.dataDate, DATE, `${row.year} ${k} 資料日期`);
    }
    for (const p of row.pending) assert.ok(FIELD_KEYS.includes(p), `${row.year} pending 有不存在的欄位 ${p}`);
  }
});

test('基本工資只寫一次：推得出的數字不准存在表裡', () => {
  for (const row of DATA.years) {
    for (const k of ['bliMinSalary', 'nhiPartTimeMin', 'nonResidentSalaryBoundary']) assert.ok(!(k in row.values), `${row.year} 存了 ${k}`);
  }
  const v = ratesOfYear(2027).values;
  assert.equal(v.minWage, 30900);
  assert.equal(v.bliMinSalary, 30900);
  assert.equal(v.nhiPartTimeMin, 30900);
  assert.equal(v.nonResidentSalaryBoundary, 46350);
});

test('2027 已公告的數字', () => {
  const v = ratesOfYear(2027).values;
  assert.equal(v.minWage, 30900);
  assert.equal(v.bliRate, 0.12);
  assert.equal(v.empRate, 0.01);
});

test('fallback：沒列的年度沿用前一年、全部算 pending', () => {
  const r = ratesOfYear(2035);
  assert.equal(r.usedYear, Math.max(...YEARS));
  assert.equal(r.fallback, true);
  assert.equal(r.pending.length, FIELD_KEYS.length);
  assert.equal(ratesOfYear(2000).usedYear, Math.min(...YEARS));
  assert.throws(() => ratesOn('115/01/01'), TypeError);
});

test('保鮮檢查：今年缺列或 pending、12 月明年缺列', () => {
  const last = Math.max(...YEARS);
  assert.deepEqual(freshness(`${last + 1}-03-01`).missing, [last + 1]);
  assert.deepEqual(freshness(`${last}-12-01`).missing, [last + 1]);
  assert.deepEqual(freshness(`${last}-11-30`).missing, []);
});

test('欄位說明齊全', () => {
  for (const k of FIELD_KEYS) assert.ok(FIELDS[k].label && FIELDS[k].changes, k);
});
