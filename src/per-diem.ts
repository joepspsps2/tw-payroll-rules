/**
 * 出差日支（膳雜費、膳宿雜費）上限與超額試算（純函式）。
 *
 * 依據：營利事業所得稅查核準則第74條（國內職級標準、國外依日支數額表、自訂宿費檢據核實辦法者膳雜費按五成）；
 * 國外與大陸港澳日支數額表由行政院主計總處公布，每版一列（`data/per-diem-overseas.json`），按出差當天日期查。
 * 公司實際給的超過標準：超過的部分屬員工薪資所得（所得類別 50），要評估扣繳。
 *
 * 公司自己決定的事（每天實際給多少、國外用算法 A 還是 B、返國當日要不要按 30%）由呼叫端傳參數，這裡不預設。
 */
import overseasData from './data/per-diem-overseas.json' with { type: 'json' };
import { ratesOn } from './years.ts';

export type TripScope = 'domestic' | 'overseas';
export type TravelerRank = 'executive' | 'staff';
export type OverseasMethod = 'A' | 'B';

/** 地區：usd＝全年一個數；seasons＝依日期（MM-DD 起訖，可跨年）不同數額。key 跨版本固定。 */
export interface OverseasRegion {
  key: string;
  table: 'foreign' | 'mainland';
  area?: string;
  country: string;
  city: string;
  usd?: number;
  seasons?: { from_to: [string, string][]; usd: number }[];
}

export interface OverseasEdition {
  effectiveFrom: string;
  roc: number;
  dataDate: string;
  source: string;
  urls: string[];
  note?: string;
  added?: string[];
  removed?: string[];
  regions: OverseasRegion[];
}

const OVERSEAS = overseasData as unknown as { about: string; unit: 'USD'; rounding: string; editions: OverseasEdition[] };
const EDITIONS = [...OVERSEAS.editions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

/** 所有版本的生效日 */
export const OVERSEAS_EDITIONS: readonly string[] = Object.freeze(EDITIONS.map((e) => e.effectiveFrom));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 某一天（台灣日期）適用的國外／大陸港澳日支數額表；比最早一版還早＝用最早一版 */
export function overseasEditionOn(date: string): OverseasEdition {
  if (!DATE_RE.test(date)) throw new TypeError('date 要是 YYYY-MM-DD');
  let e = EDITIONS[0];
  for (const x of EDITIONS) if (x.effectiveFrom <= date) e = x;
  return e;
}

/** 某一天適用版本裡的地區 */
export function findRegion(key: string | null | undefined, date: string): OverseasRegion | null {
  return key ? overseasEditionOn(date).regions.find((r) => r.key === key) ?? null : null;
}

export function regionLabel(r: OverseasRegion): string {
  return r.country === r.city ? r.city : `${r.country}・${r.city}`;
}

/** 某地區某天的日支數額（美元）；分季節的地區那天不在任何季節內＝null（要人填） */
export function regionUsdOn(r: OverseasRegion, date: string): number | null {
  if (typeof r.usd === 'number') return r.usd;
  const md = date.slice(5);
  for (const s of r.seasons ?? []) {
    for (const [a, b] of s.from_to) if (a <= b ? md >= a && md <= b : md >= a || md <= b) return s.usd;
  }
  return null;
}

/** 起訖日（含頭尾）共幾天；日期不對回 0 */
export function dayCount(startOn: string, endOn: string): number {
  if (!DATE_RE.test(startOn) || !DATE_RE.test(endOn)) return 0;
  const d = (new Date(`${endOn}T00:00:00Z`).getTime() - new Date(`${startOn}T00:00:00Z`).getTime()) / 86_400_000;
  return Number.isInteger(d) && d >= 0 ? d + 1 : 0;
}

/** 起訖日之間的每一天（YYYY-MM-DD） */
export function daysBetween(startOn: string, endOn: string): string[] {
  const n = dayCount(startOn, endOn);
  const t0 = new Date(`${startOn}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * 一趟出差每天的日支數額（美元），每天照當天適用的版本查（跨年出差前後段可能不同版）。
 * 某天查不到（地區在那版被刪除、或分季節但那天不在任何季節）＝null，要人填。
 */
export function dailyUsdForTrip(key: string, startOn: string, endOn: string): (number | null)[] {
  return daysBetween(startOn, endOn).map((d) => {
    const r = findRegion(key, d);
    return r ? regionUsdOn(r, d) : null;
  });
}

/** 國內日支標準（元／天），照出差日期的年度表 */
export function domesticPerDiemOn(date: string, rank: TravelerRank): number {
  const v = ratesOn(date).values;
  return rank === 'executive' ? v.perDiemExecutive : v.perDiemStaff;
}

export interface PerDiemInput {
  scope: TripScope;
  /** 出差第一天（台灣日期）：決定用哪一年的國內標準與算法 B 比例 */
  startOn: string;
  days: number;
  /** 國內：職級 */
  rank?: TravelerRank | null;
  /** 國外：算法、每天的日支數額（美元，長度＝天數；用 dailyUsdForTrip 查或人填）、美元匯率 */
  method?: OverseasMethod | null;
  dailyUsd?: number[] | null;
  usdRate?: number | null;
  /** 國外：返國當日按日支數額 30%（政府出差人員報支規定；公司要不要比照由公司決定） */
  returnDay30?: boolean;
  /** 公司實際每天給多少（國內台幣／國外美元）；不填＝照標準給；0＝不領日支 */
  policyDaily?: number | null;
  /** 國外算法 A：這趟另外報的住宿（台幣）。算法 A 的上限是「膳宿雜費」合計，另報住宿要從上限扣掉 */
  lodgingTwd?: number | null;
}

export interface PerDiemResult {
  currency: 'TWD' | 'USD';
  days: number;
  /** 標準合計（國內台幣；國外美元，已含算法 B 比例、返國日 30%，尾數進位到整數美元） */
  standardTotal: number;
  /** 公司實際給的合計（同上幣別） */
  paidTotal: number;
  /** 標準內（列差旅費）、超過標準（列薪資），台幣整數元 */
  standardTwd: number;
  excessTwd: number;
  paidTwd: number;
  /** 國外：美元 */
  standardUsd: number | null;
  excessUsd: number | null;
  /** 國外算法 A：從上限扣掉的另報住宿（台幣） */
  lodgingTwd: number;
  /** 住宿本身就超過上限的部分（台幣）：屬員工薪資所得，只提醒 */
  lodgingOverTwd: number;
  basis: string;
}

const BASIS_DOMESTIC = '營利事業所得稅查核準則第74條：國內出差膳雜費按職級標準，免外來憑證';
const BASIS_OVERSEAS = '營利事業所得稅查核準則第74條：國外（含大陸港澳）出差膳宿雜費依行政院主計總處日支數額表，免外來憑證；自訂宿費檢據核實報銷辦法者，宿費核實、膳雜費按比例';

/** 試算。輸入不完整時丟 Error（訊息給人看） */
export function computePerDiem(input: PerDiemInput): PerDiemResult {
  const days = input.days;
  if (!Number.isInteger(days) || days < 0 || days > 366) throw new Error('日支天數要是 0 到 366 的整數');
  const year = ratesOn(input.startOn).values;
  const policy = input.policyDaily ?? null;
  if (policy !== null && (!Number.isFinite(policy) || policy < 0)) throw new Error('公司每天給的金額要是 0 以上的數字');
  if (policy === 0) {
    const dom = input.scope === 'domestic';
    return { currency: dom ? 'TWD' : 'USD', days, standardTotal: 0, paidTotal: 0, standardTwd: 0, excessTwd: 0, paidTwd: 0,
      standardUsd: dom ? null : 0, excessUsd: dom ? null : 0, lodgingTwd: 0, lodgingOverTwd: 0, basis: '這趟不領日支' };
  }
  if (input.scope === 'domestic') {
    const rank = input.rank === 'executive' ? 'executive' : input.rank === 'staff' ? 'staff' : null;
    if (!rank) throw new Error('請選出差人職級（國內日支標準看職級）');
    const std = rank === 'executive' ? year.perDiemExecutive : year.perDiemStaff;
    const paidDaily = policy === null ? std : Math.round(policy);
    const standardTwd = Math.min(paidDaily, std) * days;
    const excessTwd = Math.max(0, paidDaily - std) * days;
    return { currency: 'TWD', days, standardTotal: std * days, paidTotal: paidDaily * days, standardTwd, excessTwd, paidTwd: standardTwd + excessTwd,
      standardUsd: null, excessUsd: null, lodgingTwd: 0, lodgingOverTwd: 0, basis: BASIS_DOMESTIC };
  }
  const method = input.method === 'B' ? 'B' : input.method === 'A' ? 'A' : null;
  if (!method) throw new Error('請選國外日支算法（A 或 B）');
  const daily = input.dailyUsd ?? [];
  if (daily.length !== days || daily.some((x) => !Number.isFinite(x) || x <= 0)) throw new Error('請選出差地區（或填該地區的日支數額，美元）');
  const rate = input.usdRate ?? null;
  if (rate === null || !Number.isFinite(rate) || rate <= 0) throw new Error('請填美元匯率（1 美元換多少台幣）');
  // 以「分」計算避免小數誤差；有打折時總計尾數進位到整數美元（日支數額表附註）
  const ratioB = method === 'B' ? year.perDiemMethodBRatio : 1;
  let cents = 0;
  daily.forEach((usd, i) => { cents += Math.round(usd * 100 * ratioB * (input.returnDay30 && i === days - 1 && days > 1 ? 0.3 : 1)); });
  const standardUsd = Math.ceil(cents / 100 - 1e-9);
  const paidUsd = policy === null ? standardUsd : Math.round(policy * days * 100) / 100;
  const basis = `${BASIS_OVERSEAS}（${method === 'B' ? `算法 B：膳雜費按日支數額 ${Math.round(ratioB * 100)}%` : '算法 A：膳宿雜費全額'}${input.returnDay30 ? '，返國當日 30%' : ''}）`;
  const lodging = method === 'A' ? Math.max(0, Math.round(input.lodgingTwd ?? 0)) : 0;
  if (lodging > 0) {
    const capTwd = Math.round(standardUsd * rate);
    const roomTwd = Math.max(0, capTwd - lodging);
    const wantTwd = policy === null ? roomTwd : Math.round(paidUsd * rate);
    const stdTwd = Math.min(wantTwd, roomTwd);
    const exTwd = wantTwd - stdTwd;
    const usd = (twd: number) => Math.round((twd / rate) * 100) / 100;
    return {
      currency: 'USD', days, standardTotal: standardUsd, paidTotal: usd(wantTwd), standardTwd: stdTwd, excessTwd: exTwd, paidTwd: wantTwd,
      standardUsd: usd(stdTwd), excessUsd: usd(exTwd), lodgingTwd: lodging, lodgingOverTwd: Math.max(0, lodging - capTwd),
      basis: `${basis}；上限 NT$${capTwd.toLocaleString('en-US')} 已扣另報住宿 NT$${lodging.toLocaleString('en-US')}`,
    };
  }
  const inUsd = Math.min(paidUsd, standardUsd);
  const excessUsd = Math.round(Math.max(0, paidUsd - standardUsd) * 100) / 100;
  const standardTwd = Math.round(inUsd * rate);
  const paidTwd = Math.round((inUsd + excessUsd) * rate);
  return {
    currency: 'USD', days, standardTotal: standardUsd, paidTotal: paidUsd, standardTwd, excessTwd: paidTwd - standardTwd, paidTwd,
    standardUsd: inUsd, excessUsd, lodgingTwd: 0, lodgingOverTwd: 0, basis,
  };
}
