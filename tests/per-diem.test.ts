import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePerDiem, overseasEditionOn, findRegion, regionUsdOn, dailyUsdForTrip, dayCount, daysBetween, domesticPerDiemOn, OVERSEAS_EDITIONS,
} from '../src/per-diem.ts';

test('版本：按出差當天日期查（115 年版到 2026-12-31、116 年版自 2027-01-01）', () => {
  assert.deepEqual([...OVERSEAS_EDITIONS], ['2026-01-01', '2027-01-01']);
  assert.equal(overseasEditionOn('2026-12-31').roc, 115);
  assert.equal(overseasEditionOn('2027-01-01').roc, 116);
  assert.equal(overseasEditionOn('2020-05-01').roc, 115);
});

test('116 年版抽查（對官方修正後 PDF）', () => {
  assert.equal(findRegion('F006', '2027-03-01')?.usd, 300);  // 東京
  assert.equal(findRegion('F006', '2026-03-01')?.usd, 299);
  assert.equal(findRegion('C001', '2027-03-01')?.usd, 322);  // 北京
  assert.equal(findRegion('C017', '2027-03-01')?.usd, 360);  // 香港
  assert.equal(findRegion('C019', '2027-03-01')?.usd, 181);  // 大陸其他
});

test('地區 key 跨版固定：新增城市給新 key、刪除的只在舊版', () => {
  const e116 = overseasEditionOn('2027-01-01');
  const e115 = overseasEditionOn('2026-01-01');
  assert.equal(e115.regions.length, 570);
  assert.equal(e116.regions.length, 574);
  for (const k of e116.added ?? []) assert.equal(findRegion(k, '2026-06-01'), null);
  for (const k of e116.removed ?? []) {
    assert.ok(findRegion(k, '2026-06-01'));
    assert.equal(findRegion(k, '2027-06-01'), null);
  }
  const keys = new Set<string>();
  for (const e of [e115, e116]) {
    const seen = new Set<string>();
    for (const r of e.regions) {
      assert.ok(!seen.has(r.key), `重複 key ${r.key}`);
      seen.add(r.key);
      keys.add(r.key);
      assert.ok(typeof r.usd === 'number' || (r.seasons ?? []).length > 0, `${r.key} 沒數額`);
    }
  }
  // 同一 key 兩版是同一個城市（中文名相同）
  for (const r of e116.regions) {
    const o = e115.regions.find((x) => x.key === r.key);
    if (o) assert.equal(o.city.split('(')[0], r.city.split('(')[0], r.key);
  }
});

test('分季節：跨年區間、找不到季節回 null', () => {
  const dubai = findRegion('F155', '2027-12-10')!;
  assert.equal(regionUsdOn(dubai, '2027-12-10'), 590);
  assert.equal(regionUsdOn(dubai, '2027-02-10'), 493);
  assert.equal(regionUsdOn(dubai, '2027-05-10'), 368);
  const sanSebastian = findRegion('F242', '2027-06-01');
  if (sanSebastian?.seasons) assert.equal(regionUsdOn(sanSebastian, '2027-01-15'), null);
});

test('跨年出差：每天照當天版本', () => {
  assert.deepEqual(dailyUsdForTrip('F006', '2026-12-30', '2027-01-02'), [299, 299, 300, 300]);
});

test('天數', () => {
  assert.equal(dayCount('2026-11-01', '2026-11-03'), 3);
  assert.equal(dayCount('2026-11-03', '2026-11-01'), 0);
  assert.deepEqual(daysBetween('2026-02-27', '2026-03-01'), ['2026-02-27', '2026-02-28', '2026-03-01']);
});

test('國內：700／600、超過的部分列薪資', () => {
  assert.equal(domesticPerDiemOn('2026-05-01', 'executive'), 700);
  const r = computePerDiem({ scope: 'domestic', startOn: '2026-05-01', days: 3, rank: 'staff', policyDaily: 800 });
  assert.equal(r.standardTwd, 1800);
  assert.equal(r.excessTwd, 600);
  assert.equal(computePerDiem({ scope: 'domestic', startOn: '2026-05-01', days: 2, rank: 'executive' }).paidTwd, 1400);
  assert.equal(computePerDiem({ scope: 'domestic', startOn: '2026-05-01', days: 2, rank: 'executive', policyDaily: 0 }).paidTwd, 0);
  assert.throws(() => computePerDiem({ scope: 'domestic', startOn: '2026-05-01', days: 2 }), /職級/);
});

test('國外：算法 B 五成、返國日 30%、尾數進位', () => {
  const r = computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 3, method: 'B', dailyUsd: [300, 300, 300], usdRate: 32, returnDay30: true });
  assert.equal(r.standardUsd, 345); // 150＋150＋45
  assert.equal(r.standardTwd, 345 * 32);
  const a = computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 1, method: 'B', dailyUsd: [227], usdRate: 30 });
  assert.equal(a.standardTotal, 114); // 113.5 → 進位 114
});

test('國外算法 A＋另報住宿：上限先扣住宿', () => {
  const r = computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 2, method: 'A', dailyUsd: [300, 300], usdRate: 30, lodgingTwd: 10000 });
  assert.equal(r.standardTwd, 18000 - 10000);
  assert.equal(r.lodgingOverTwd, 0);
  const over = computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 1, method: 'A', dailyUsd: [300], usdRate: 30, lodgingTwd: 12000 });
  assert.equal(over.lodgingOverTwd, 3000);
  assert.equal(over.paidTwd, 0);
});

test('國外公司多給：超過標準列薪資', () => {
  const r = computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 2, method: 'A', dailyUsd: [300, 300], usdRate: 30, policyDaily: 350 });
  assert.equal(r.excessUsd, 100);
  assert.equal(r.excessTwd, 3000);
  assert.throws(() => computePerDiem({ scope: 'overseas', startOn: '2027-03-01', days: 2, method: 'A', dailyUsd: [300], usdRate: 30 }), /地區/);
});
