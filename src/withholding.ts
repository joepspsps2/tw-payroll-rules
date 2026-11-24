/**
 * 扣繳稅款與二代健保補充保費試算（純函式）。
 *
 * ⚠️ 這些公式照下列規定寫成，**尚未經記帳士或會計師確認**；是計算工具，不是稅務保證。正式使用前請找專業人員核對。
 *
 * 依據（數字本身與出處在年度表，見 `ratesOn` 的 cite）：
 * - 各類所得扣繳率標準第2條：境內居住個人的租賃、執行業務、稿費等 10%；第13條：每次應扣稅額不超過 2,000 元免扣繳。
 * - 各類所得扣繳率標準第3條：非居住者執行業務、租賃、其他所得 20%；薪資全月給付不超過基本工資 1.5 倍 6%、超過 18%；
 *   個人稿費、版稅等每次 5,000 元以下免扣（非居住者沒有「稅額 2,000 元以下免扣」）。
 * - 薪資所得扣繳辦法：兼職、獎金等非每月給付的薪資，每次給付達起扣標準按 5% 扣繳。
 * - 全民健康保險法第31條：補充保險費 2.11%；租金、執行業務、稿費單次給付達 2 萬元才扣、單次上限 1,000 萬；
 *   兼職薪資單次給付達基本工資才扣；非居住者通常不是健保保險對象，這裡不扣。
 * - 約定由給付人負擔稅款與補充保費時，要併計給付額計算：給付總額＝實拿 ÷（1 − 扣繳率 − 補充保費率），再找整數解（`fromNet`）。
 *
 * 金額一律四捨五入到元。算好的金額應存在單據上：年度表日後更新，不應回頭改舊單。
 */
import { ratesOn, ratesOfYear, type YearRates } from './years.ts';

/** 試算用的數字（欄位名沿用常見寫法；值從年度表來） */
export interface WithholdingRates {
  /** 居住者租賃、執行業務、稿費扣繳率（10%） */
  taxRate: number;
  /** 二代健保補充保險費率（2.11%） */
  nhiRate: number;
  /** 每次應扣稅額不超過這個數免扣（2,000） */
  taxExemptMax: number;
  /** 單次給付達這個數才扣補充保費（20,000） */
  nhiMin: number;
  /** 補充保費單次計費上限（10,000,000） */
  nhiCap: number;
  /** 居住者兼職、非每月給付薪資扣繳率（5%） */
  salaryRate: number;
  /** 居住者薪資每次給付起扣標準 */
  salaryStart: number;
  /** 基本工資：兼職薪資補充保費門檻、非居住者薪資分界都看它 */
  minWage: number;
  /** 非居住者執行業務、租賃、稿費、其他所得扣繳率（20%） */
  nonResidentRate: number;
  /** 非居住者薪資（不超過分界）扣繳率（6%） */
  nonResidentSalaryLow: number;
  /** 非居住者薪資（超過分界）扣繳率（18%） */
  nonResidentSalaryHigh: number;
  /** 非居住者薪資分界＝基本工資的幾倍（1.5） */
  nonResidentSalaryMultiple: number;
  /** 非居住者個人稿費等每次不超過這個數免扣（5,000） */
  nonResidentRoyaltyExempt: number;
}

function fromYear(r: YearRates): WithholdingRates {
  const v = r.values;
  return {
    taxRate: v.taxRate, nhiRate: v.nhiSupplementRate, taxExemptMax: v.taxExemptMax, nhiMin: v.nhiSupplementMin,
    nhiCap: v.nhiSupplementCap, salaryRate: v.salaryRate, salaryStart: v.salaryStart, minWage: v.minWage,
    nonResidentRate: v.nonResidentRate, nonResidentSalaryLow: v.nonResidentSalaryLow, nonResidentSalaryHigh: v.nonResidentSalaryHigh,
    nonResidentSalaryMultiple: v.nonResidentSalaryMultiple, nonResidentRoyaltyExempt: v.nonResidentRoyaltyExempt,
  };
}

export interface WithholdingRatesResult {
  year: number;
  usedYear: number;
  fallback: boolean;
  /** 年度表裡官方還沒公告、暫用的欄位（年度表欄位名） */
  pending: readonly string[];
  rates: WithholdingRates;
}

/** 某個給付日（台灣日期 YYYY-MM-DD）適用的扣繳與補充保費數字 */
export function withholdingRatesOn(payOn: string): WithholdingRatesResult {
  const r = ratesOn(payOn);
  return { year: r.year, usedYear: r.usedYear, fallback: r.fallback, pending: r.pending, rates: fromYear(r) };
}

/** 某一年度適用的扣繳與補充保費數字 */
export function withholdingRatesOfYear(year: number): WithholdingRatesResult {
  const r = ratesOfYear(year);
  return { year: r.year, usedYear: r.usedYear, fallback: r.fallback, pending: r.pending, rates: fromYear(r) };
}

/** 所得類別（扣繳憑單格式代號）：51 租賃、9A 執行業務、9B 稿費、92 其他所得（不扣補充保費） */
export const AUTO_CODES = ['51', '9A', '9B', '92'] as const;
export type AutoCode = (typeof AUTO_CODES)[number];
const NHI_CODES = new Set<string>(['51', '9A', '9B']);

export interface WithholdingResult {
  /** 給付總額 */
  gross: number;
  /** 扣繳稅款 */
  tax: number;
  /** 二代健保補充保費 */
  nhi: number;
  /** 實付 */
  net: number;
}

export function isAutoCode(code: string | null | undefined): code is AutoCode {
  return !!code && (AUTO_CODES as readonly string[]).includes(code);
}

/** 給付總額 → 扣多少、實付多少（居住者） */
export function fromGross(gross: number, code: AutoCode, r: WithholdingRates): WithholdingResult {
  const g = Math.max(0, Math.round(gross));
  const t = Math.round(g * r.taxRate);
  const tax = t > r.taxExemptMax ? t : 0;
  const nhi = NHI_CODES.has(code) && g >= r.nhiMin ? Math.round(Math.min(g, r.nhiCap) * r.nhiRate) : 0;
  return { gross: g, tax, nhi, net: g - tax - nhi };
}

/**
 * 實拿（給付人負擔稅費）→ 反推給付總額。先用 實拿 ÷（1 − 稅率 − 費率）估，再在附近找「扣完剛好等於實拿」的整數；
 * 四捨五入造成找不到剛好的，取扣完「不少於實拿」最小的那個。實拿低到不用扣的，給付總額就等於實拿。
 */
export function fromNet(net: number, code: AutoCode, r: WithholdingRates): WithholdingResult {
  const n = Math.max(0, Math.round(net));
  const plain = fromGross(n, code, r);
  if (plain.tax === 0 && plain.nhi === 0) return plain;
  const est = Math.round(n / (1 - r.taxRate - (NHI_CODES.has(code) ? r.nhiRate : 0)));
  let best: WithholdingResult | null = null;
  for (let g = Math.max(n, est - 50); g <= est + 50; g++) {
    const x = fromGross(g, code, r);
    if (x.net === n) return x;
    if (x.net > n && (!best || x.gross < best.gross)) best = x;
  }
  return best ?? fromGross(est, code, r);
}

/** 身分別：tw 本國人、foreign_ge183 外國人當年在台滿 183 天（居住者）、foreign_lt183 未滿 183 天（非居住者） */
export type Residency = 'tw' | 'foreign_lt183' | 'foreign_ge183';
/** 勞務報酬單常見所得類別：50 薪資（單次給付）、9A、9B、92、51 */
export type LaborCode = '50' | '9A' | '9B' | '92' | '51';

/**
 * 勞務報酬單試算：依所得類別與身分別。50 薪資照兼職／非每月給付規則（單次給付，不是月薪）；
 * 非居住者照非居住者扣繳率、不扣補充保費。給付總額 → 扣多少、實付多少。
 */
export function laborCalc(gross: number, code: LaborCode, residency: Residency | null, r: WithholdingRates): WithholdingResult {
  const g = Math.max(0, Math.round(gross));
  if (residency === 'foreign_lt183') {
    let rate = r.nonResidentRate;
    if (code === '50') rate = g <= r.minWage * r.nonResidentSalaryMultiple ? r.nonResidentSalaryLow : r.nonResidentSalaryHigh;
    let tax = Math.round(g * rate);
    if (code === '9B' && g <= r.nonResidentRoyaltyExempt) tax = 0;
    return { gross: g, tax, nhi: 0, net: g - tax };
  }
  if (code === '50') {
    const t = g >= r.salaryStart ? Math.round(g * r.salaryRate) : 0;
    const tax = t > r.taxExemptMax ? t : 0;
    const nhi = g >= r.minWage ? Math.round(Math.min(g, r.nhiCap) * r.nhiRate) : 0;
    return { gross: g, tax, nhi, net: g - tax - nhi };
  }
  return fromGross(g, code, r);
}

/** 實拿 → 給付總額（給付人負擔稅費），反推規則同 fromNet */
export function laborFromNet(net: number, code: LaborCode, residency: Residency | null, r: WithholdingRates): WithholdingResult {
  const n = Math.max(0, Math.round(net));
  const plain = laborCalc(n, code, residency, r);
  if (plain.tax === 0 && plain.nhi === 0) return plain;
  let best: WithholdingResult | null = null;
  // 稅率最高 20%＋補充保費約 2%：先用總扣除率估中心點縮小範圍
  const est = Math.round(n / Math.max(0.5, plain.net / Math.max(1, plain.gross)));
  for (let g = Math.max(n, est - 200); g <= est + 200; g++) {
    const x = laborCalc(g, code, residency, r);
    if (x.net === n) return x;
    if (x.net > n && (!best || x.gross < best.gross)) best = x;
  }
  if (best) return best;
  // 估不準（例如非居住者薪資 6%／18% 分界讓實拿不連續）：從實拿往上逐元找第一個扣完不少於實拿的給付總額
  for (let g = n; g <= Math.ceil(n * 1.5) + 2; g++) {
    const x = laborCalc(g, code, residency, r);
    if (x.net >= n) return x;
  }
  return laborCalc(est, code, residency, r);
}
