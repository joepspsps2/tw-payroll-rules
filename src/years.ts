/**
 * 年度數字表：每年一列（1/1 生效），每格附政府公告出處與資料日期。
 *
 * - 資料檔 `data/years.json` 也可以直接讀（Python 等其他語言用）。
 * - 基本工資只寫一次（`minWage`）。勞保最低一級、兼職薪資補充保費門檻、非居住者薪資 6%／18% 的分界
 *   都由它推出（見 `derived`），不另外存，所以基本工資一改，三個數字一起動。
 * - 政府還沒公告的格子列在該年的 `pending`，數字暫用前一年（或目前最可能的值），出處欄寫明。
 * - 表裡沒有的年度：沿用最近的前一年，`fallback: true`，所有欄位都算 pending。
 */
import data from './data/years.json' with { type: 'json' };

/** 存在表裡的欄位（每年每格都有值與出處） */
export interface StoredValues {
  /** 每月基本工資（最低工資），元 */
  minWage: number;
  /** 居住者租賃、執行業務、稿費等扣繳率 */
  taxRate: number;
  /** 居住者每次應扣稅額不超過這個數免扣繳，元 */
  taxExemptMax: number;
  /** 居住者兼職、非每月給付薪資扣繳率 */
  salaryRate: number;
  /** 居住者薪資每次給付起扣標準，元 */
  salaryStart: number;
  /** 非居住者執行業務、租賃、稿費、其他所得扣繳率 */
  nonResidentRate: number;
  /** 非居住者薪資（全月不超過基本工資的倍數以下）扣繳率 */
  nonResidentSalaryLow: number;
  /** 非居住者薪資（超過分界）扣繳率 */
  nonResidentSalaryHigh: number;
  /** 非居住者薪資分界＝基本工資的幾倍 */
  nonResidentSalaryMultiple: number;
  /** 非居住者個人稿費、版稅等每次不超過這個數免扣繳，元 */
  nonResidentRoyaltyExempt: number;
  /** 二代健保補充保險費率 */
  nhiSupplementRate: number;
  /** 租金、執行業務、稿費單次給付達這個數才扣補充保費，元 */
  nhiSupplementMin: number;
  /** 補充保費單次給付計費上限，元 */
  nhiSupplementCap: number;
  /** 勞保普通事故保險費率（不含就業保險） */
  bliRate: number;
  /** 就業保險費率 */
  empRate: number;
  /** 勞保、就保保費：被保險人負擔比例（一般受僱勞工） */
  bliEmployeeShare: number;
  /** 勞保、就保保費：投保單位負擔比例（一般受僱勞工） */
  bliEmployerShare: number;
  /** 勞保月投保薪資最高一級，元 */
  bliMaxSalary: number;
  /** 職災保險費率（行業平均，估算用；實際依行業別） */
  occAvgRate: number;
  /** 職災保險月投保薪資最高一級，元 */
  occMaxSalary: number;
  /** 積欠工資墊償基金提繳費率 */
  wageFundRate: number;
  /** 全民健保一般保險費率 */
  nhiRate: number;
  /** 健保保費：一般受僱者本人負擔比例 */
  nhiEmployeeShare: number;
  /** 健保保費：投保單位負擔比例 */
  nhiEmployerShare: number;
  /** 健保：投保單位負擔的平均眷口數 */
  nhiAvgDependents: number;
  /** 健保：被保險人自付時眷屬最多計幾口 */
  nhiMaxDependents: number;
  /** 勞退：雇主提繳率 */
  pensionRate: number;
  /** 勞退：月提繳工資最高一級，元 */
  pensionMaxSalary: number;
  /** 國內出差膳雜費：董事長、總經理、經理、廠長每人每日，元 */
  perDiemExecutive: number;
  /** 國內出差膳雜費：其他職員每人每日，元 */
  perDiemStaff: number;
  /** 國外出差：自訂宿費檢據核實報銷辦法者，膳雜費按日支數額的比例 */
  perDiemMethodBRatio: number;
}

/** 從基本工資推出、不另外存的數字 */
export interface DerivedValues {
  /** 勞保月投保薪資最低一級＝基本工資 */
  bliMinSalary: number;
  /** 兼職薪資單次給付達這個數才扣補充保費＝基本工資 */
  nhiPartTimeMin: number;
  /** 非居住者薪資 6%／18% 分界＝基本工資 × nonResidentSalaryMultiple */
  nonResidentSalaryBoundary: number;
}

export type YearValues = StoredValues & DerivedValues;
export type FieldKey = keyof StoredValues;

/** 一格的出處 */
export interface Cite {
  /** 官方網址 */
  url: string;
  /** 最後一次對官方公告核對的日期（台灣日期） */
  dataDate: string;
  /** 依據說明（法條、函號、公告日） */
  note?: string;
}

export interface FieldInfo {
  label: string;
  group: 'wage' | 'withholding' | 'nhi-supplement' | 'insurance' | 'pension' | 'per-diem';
  unit: 'TWD' | 'rate' | 'ratio' | 'people' | 'times';
  /** 多久變一次 */
  changes: string;
}

interface YearRow {
  year: number;
  roc: number;
  values: StoredValues;
  pending: FieldKey[];
  cite: Record<FieldKey, Cite>;
}

const DATA = data as unknown as { about: string; dataDate: string; fields: Record<FieldKey, FieldInfo>; years: YearRow[] };

/** 欄位說明 */
export const FIELDS: Readonly<Record<FieldKey, FieldInfo>> = Object.freeze(DATA.fields);
export const FIELD_KEYS = Object.freeze(Object.keys(DATA.fields) as FieldKey[]);

/** 整張表最後核對官方公告的日期 */
export const DATA_DATE: string = DATA.dataDate;

const ROWS = [...DATA.years].sort((a, b) => a.year - b.year);

/** 表裡有的年度（西元） */
export const YEARS: readonly number[] = Object.freeze(ROWS.map((r) => r.year));

export function derive(v: StoredValues): YearValues {
  return {
    ...v,
    bliMinSalary: v.minWage,
    nhiPartTimeMin: v.minWage,
    nonResidentSalaryBoundary: Math.round(v.minWage * v.nonResidentSalaryMultiple),
  };
}

export interface YearRates {
  /** 問的年度 */
  year: number;
  /** 實際用哪一年的列 */
  usedYear: number;
  /** 表裡沒有這一年、沿用別年 */
  fallback: boolean;
  values: Readonly<YearValues>;
  /** 官方還沒公告、暫用的欄位（fallback 時＝全部欄位） */
  pending: readonly FieldKey[];
  cite: Readonly<Record<FieldKey, Cite>>;
}

function pick(year: number): YearRow {
  let row = ROWS[0];
  for (const r of ROWS) if (r.year <= year) row = r;
  return row;
}

/** 某一年度（西元）適用的數字 */
export function ratesOfYear(year: number): YearRates {
  if (!Number.isInteger(year)) throw new TypeError('year 要是西元年整數');
  const row = pick(year);
  const fallback = row.year !== year;
  return Object.freeze({
    year,
    usedYear: row.year,
    fallback,
    values: Object.freeze(derive(row.values)),
    pending: Object.freeze(fallback ? [...FIELD_KEYS] : [...row.pending]),
    cite: Object.freeze({ ...row.cite }),
  });
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** 某一天（台灣日期 YYYY-MM-DD，例如給付日、投保月份的第一天）適用的數字 */
export function ratesOn(date: string): YearRates {
  const m = typeof date === 'string' ? DATE_RE.exec(date) : null;
  if (!m) throw new TypeError('date 要是 YYYY-MM-DD（台灣日期）');
  return ratesOfYear(Number(m[1]));
}

/** 檢查表齊不齊（給每年保鮮檢查用）：today＝台灣日期 YYYY-MM-DD */
export function freshness(today: string): { year: number; missing: number[]; pending: { year: number; fields: FieldKey[] }[] } {
  const m = DATE_RE.exec(today);
  if (!m) throw new TypeError('today 要是 YYYY-MM-DD');
  const year = Number(m[1]);
  const month = Number(m[2]);
  const missing: number[] = [];
  const pending: { year: number; fields: FieldKey[] }[] = [];
  const cur = ROWS.find((r) => r.year === year);
  if (!cur) missing.push(year);
  else if (cur.pending.length) pending.push({ year, fields: [...cur.pending] });
  // 12 月起明年要有列（基本工資 10 月就公告了）；明年有列但還有 pending 在 12 月不算問題，跨年後才算
  if (month === 12 && !ROWS.some((r) => r.year === year + 1)) missing.push(year + 1);
  return { year, missing, pending };
}
