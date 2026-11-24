/**
 * 勞保（含就業保險）、職災保險、積欠工資墊償基金、健保、勞退：每月保費估算（純函式）。
 *
 * 用途是「估」：例如到職、離職、調薪時，公司每月帳單會多或少多少。實際金額以勞保局、健保署寄來的帳單為準
 * （官方用分級表與各自的進位規則逐人計算；職災費率依行業別不同，這裡用行業平均）。
 *
 * 帳單金額＝投保單位負擔＋被保險人自付（自付那份公司先代扣、一起繳）；政府補助的那份不在帳單上。
 * 依據：勞工保險條例第13、15條；就業保險法第8條；勞工職業災害保險及保護法；積欠工資墊償基金提繳及墊償管理辦法；
 * 全民健康保險法第18、27條；勞工退休金條例第14條。數字與出處在年度表（`ratesOfYear(year).cite`）。
 */
import { ratesOfYear, type YearValues } from './years.ts';

export type PremiumKind = 'bli' | 'nhi' | 'pension';

export interface PremiumBreakdown {
  /** 被保險人自付（公司代扣） */
  employee: number;
  /** 投保單位負擔 */
  employer: number;
  /** 帳單金額＝employee＋employer */
  bill: number;
}

// 先去掉浮點誤差再四捨五入（45,800×12.5%×90% 要是 5,152.5 → 5,153，不是 5,152.4999…）
const round = (x: number) => Math.round(Math.round(x * 1000) / 1000);

function values(yearOrValues: number | YearValues): YearValues {
  return typeof yearOrValues === 'number' ? ratesOfYear(yearOrValues).values : yearOrValues;
}

/**
 * 一個人一整個月的保費拆分（元）。
 * @param kind bli＝勞保＋就保＋職災＋墊償基金（同一張勞保局帳單）；nhi＝健保；pension＝勞退雇主提繳
 * @param salary 月投保薪資（或月提繳工資）。超過最高一級的以最高一級計
 * @param dependents 健保眷屬人數（自付部分最多計 nhiMaxDependents 口）
 * @param yearOrValues 西元年度，或自備的一組數字
 */
export function premiumBreakdown(kind: PremiumKind, salary: number, dependents: number, yearOrValues: number | YearValues): PremiumBreakdown {
  if (!Number.isFinite(salary) || salary <= 0) return { employee: 0, employer: 0, bill: 0 };
  const r = values(yearOrValues);
  if (kind === 'bli') {
    const s = Math.min(salary, r.bliMaxSalary);
    const rate = r.bliRate + r.empRate;
    const employee = round(s * rate * r.bliEmployeeShare);
    const employer = round(s * rate * r.bliEmployerShare) + round(Math.min(salary, r.occMaxSalary) * r.occAvgRate) + round(s * r.wageFundRate);
    return { employee, employer, bill: employee + employer };
  }
  if (kind === 'nhi') {
    const dep = Math.max(0, Math.min(r.nhiMaxDependents, Math.floor(dependents || 0)));
    const employee = round(salary * r.nhiRate * r.nhiEmployeeShare * (1 + dep));
    const employer = round(salary * r.nhiRate * r.nhiEmployerShare * (1 + r.nhiAvgDependents));
    return { employee, employer, bill: employee + employer };
  }
  const employer = round(Math.min(salary, r.pensionMaxSalary) * r.pensionRate);
  return { employee: 0, employer, bill: employer };
}

/** 一個人一整個月、在這張帳單上的金額（元）＝premiumBreakdown(...).bill */
export function monthlyPremium(kind: PremiumKind, salary: number, dependents: number, yearOrValues: number | YearValues): number {
  return premiumBreakdown(kind, salary, dependents, yearOrValues).bill;
}

/** 公司每月負擔合計估算（勞保＋就保＋職災＋墊償＋健保＋勞退） */
export function employerMonthlyCost(salary: number, yearOrValues: number | YearValues): number {
  return (['bli', 'nhi', 'pension'] as const).reduce((sum, k) => sum + premiumBreakdown(k, salary, 0, yearOrValues).employer, 0);
}
