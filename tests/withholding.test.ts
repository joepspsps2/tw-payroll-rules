import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withholdingRatesOn, withholdingRatesOfYear, fromGross, fromNet, laborCalc, laborFromNet, isAutoCode,
} from '../src/withholding.ts';

const R26 = withholdingRatesOfYear(2026).rates;
const R27 = withholdingRatesOfYear(2027).rates;

test('照給付日查年度：12/31 用今年、1/1 用明年', () => {
  assert.equal(withholdingRatesOn('2026-12-31').rates.minWage, 29500);
  assert.equal(withholdingRatesOn('2027-01-01').rates.minWage, 30900);
  assert.equal(withholdingRatesOn('2027-01-01').fallback, false);
  assert.ok(withholdingRatesOn('2027-01-01').pending.includes('salaryStart'));
  assert.equal(withholdingRatesOfYear(2031).fallback, true);
});

test('居住者租賃：給付總額 → 扣 10%＋補充保費 2.11%', () => {
  assert.deepEqual(fromGross(30000, '51', R26), { gross: 30000, tax: 3000, nhi: 633, net: 26367 });
  // 稅額 ≤ 2,000 免扣，補充保費單次未達 2 萬免扣
  assert.deepEqual(fromGross(19000, '51', R26), { gross: 19000, tax: 0, nhi: 0, net: 19000 });
  assert.deepEqual(fromGross(20000, '9A', R26), { gross: 20000, tax: 0, nhi: 422, net: 19578 });
  // 92 其他所得不扣補充保費
  assert.deepEqual(fromGross(30000, '92', R26), { gross: 30000, tax: 3000, nhi: 0, net: 27000 });
  // 補充保費上限 1,000 萬
  assert.equal(fromGross(20_000_000, '51', R26).nhi, 211000);
});

test('實拿反推給付總額：扣完剛好等於實拿', () => {
  const x = fromNet(26367, '51', R26);
  assert.equal(x.gross, 30000);
  assert.equal(x.net, 26367);
  for (const net of [20001, 25000, 33333, 87654]) {
    const y = fromNet(net, '9A', R26);
    assert.ok(y.net >= net && y.net - net <= 1, `${net} → ${JSON.stringify(y)}`);
  }
  assert.deepEqual(fromNet(15000, '51', R26), { gross: 15000, tax: 0, nhi: 0, net: 15000 });
});

test('勞報單 50 薪資：起扣標準 5%、兼職補充保費門檻＝基本工資（跟著年度動）', () => {
  assert.deepEqual(laborCalc(29499, '50', 'tw', R26), { gross: 29499, tax: 0, nhi: 0, net: 29499 });
  assert.equal(laborCalc(29500, '50', 'tw', R26).nhi, 622);
  // 2027 基本工資 30,900：29,500 不再達門檻
  assert.equal(laborCalc(29500, '50', 'tw', R27).nhi, 0);
  assert.equal(laborCalc(30900, '50', 'tw', R27).nhi, 652);
  assert.deepEqual(laborCalc(100000, '50', 'tw', R26), { gross: 100000, tax: 5000, nhi: 2110, net: 92890 });
});

test('非居住者：20%、薪資 6%／18% 分界＝基本工資 1.5 倍、稿費 5,000 以下免扣、不扣補充保費', () => {
  assert.deepEqual(laborCalc(10000, '9A', 'foreign_lt183', R26), { gross: 10000, tax: 2000, nhi: 0, net: 8000 });
  assert.equal(laborCalc(44250, '50', 'foreign_lt183', R26).tax, 2655);  // 29,500 × 1.5 以下 6%
  assert.equal(laborCalc(44251, '50', 'foreign_lt183', R26).tax, 7965);  // 超過 18%
  assert.equal(laborCalc(46350, '50', 'foreign_lt183', R27).tax, 2781);  // 2027：30,900 × 1.5＝46,350
  assert.equal(laborCalc(5000, '9B', 'foreign_lt183', R26).tax, 0);
  assert.equal(laborCalc(5001, '9B', 'foreign_lt183', R26).tax, 1000);
  // 外國人滿 183 天＝居住者
  assert.deepEqual(laborCalc(30000, '9A', 'foreign_ge183', R26), fromGross(30000, '9A', R26));
});

test('laborFromNet：分界附近實拿不連續也找得到不少於實拿的給付額', () => {
  for (const [net, code, res] of [[41000, '50', 'foreign_lt183'], [36500, '50', 'foreign_lt183'], [50000, '9A', 'tw'], [95000, '50', 'tw']] as const) {
    const x = laborFromNet(net, code, res, R26);
    assert.ok(x.net >= net, `${net} ${code} ${res} → ${JSON.stringify(x)}`);
    assert.ok(laborCalc(x.gross - 1, code, res, R26).net < net);
  }
});

test('isAutoCode', () => {
  assert.equal(isAutoCode('51'), true);
  assert.equal(isAutoCode('50'), false);
  assert.equal(isAutoCode(null), false);
});
