import { test } from 'node:test';
import assert from 'node:assert/strict';
import { premiumBreakdown, monthlyPremium, employerMonthlyCost } from '../src/insurance.ts';
import { ratesOfYear } from '../src/years.ts';

test('勞保帳單 2026：最高一級 45,800、11.5%＋就保 1%、自付 20%／公司 70%＋職災＋墊償', () => {
  const b = premiumBreakdown('bli', 45800, 0, 2026);
  assert.equal(b.employee, 1145);            // 45,800 × 12.5% × 20%
  assert.equal(b.employer, 4008 + 96 + 11);  // 公司 70% 4,007.5→4,008；職災 0.21% 96；墊償 0.025% 11
  assert.equal(b.bill, b.employee + b.employer);
  // 投保薪資超過最高一級，以最高一級計
  assert.deepEqual(premiumBreakdown('bli', 60000, 0, 2026).employee, 1145);
});

test('勞保 2027：普通事故 12%（勞保局 2026-10-21 公告）', () => {
  assert.equal(ratesOfYear(2027).values.bliRate, 0.12);
  assert.equal(premiumBreakdown('bli', 45800, 0, 2027).employee, 1191); // 45,800 × 13% × 20% = 1,190.8
});

test('健保：自付含眷屬最多 3 口、公司按平均眷口數', () => {
  const one = premiumBreakdown('nhi', 30000, 0, 2026);
  assert.equal(one.employee, 465);  // 30,000 × 5.17% × 30%
  assert.equal(premiumBreakdown('nhi', 30000, 5, 2026).employee, 1861); // 465.3 × 4 口（眷屬最多計 3 口）
  assert.equal(one.employer, Math.round(30000 * 0.0517 * 0.6 * 1.56));
});

test('勞退：6%、上限 150,000', () => {
  assert.equal(monthlyPremium('pension', 30000, 0, 2026), 1800);
  assert.equal(monthlyPremium('pension', 200000, 0, 2026), 9000);
});

test('投保薪資 0 或亂填＝0；公司負擔合計', () => {
  assert.deepEqual(premiumBreakdown('nhi', 0, 0, 2026), { employee: 0, employer: 0, bill: 0 });
  assert.equal(monthlyPremium('bli', Number.NaN, 0, 2026), 0);
  const c = employerMonthlyCost(30000, 2026);
  assert.equal(c, premiumBreakdown('bli', 30000, 0, 2026).employer + premiumBreakdown('nhi', 30000, 0, 2026).employer + 1800);
});

test('勞保最低一級＝基本工資（推出來的，不另外存）', () => {
  assert.equal(ratesOfYear(2026).values.bliMinSalary, 29500);
  assert.equal(ratesOfYear(2027).values.bliMinSalary, 30900);
});
