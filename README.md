# @joelincc/tw-payroll-rules

台灣薪資與費用的**年度法定數字＋算法**：基本工資、扣繳、二代健保補充保費、勞健保勞退費率、國內外出差日支。

> ⚠️ **這是計算工具，不是稅務或法律保證。** 數字以各機關官方公告為準；扣繳與補充保費的公式**尚未經記帳士或會計師確認**，正式使用前請找專業人員核對。**不提供支援**（issue 可以開，但不保證回覆或修正時程）。

這些數字每年 10–12 月由不同機關公告，散在新聞稿、法條和 PDF 裡，沒有機器可讀檔。這個套件把它們整理成：

- **每年一列**（1/1 生效），**每一格都附官方出處網址與資料日期**（最後一次對公告核對的日子）。
- **政府還沒公告的格子標 `pending`**，數字暫用前一年，出處欄寫明原因。
- **基本工資只寫一次**：勞保投保薪資最低一級、兼職薪資補充保費門檻、非居住者薪資 6%／18% 分界都由它推出，不另外存。
- **國外、大陸港澳出差日支數額表**（行政院主計總處，570 多個城市）每版一列，按出差當天的日期查；地區代號跨版本固定。

沒有外部依賴，純函式，Node.js 22 以上、瀏覽器、Cloudflare Workers 都能跑。資料檔是 JSON，其他語言可以直接讀。

## 安裝

```bash
npm install @joelincc/tw-payroll-rules
```

## 年度數字

```ts
import { ratesOn, ratesOfYear } from '@joelincc/tw-payroll-rules';

const r = ratesOn('2027-01-01');   // 用給付日／投保月份第一天查
r.values.minWage;                  // 30900
r.values.bliRate;                  // 0.12（勞保普通事故，不含就保 1%）
r.values.bliMinSalary;             // 30900（＝基本工資，推出來的）
r.values.nonResidentSalaryBoundary;// 46350（＝基本工資 × 1.5）
r.pending;                         // ['salaryStart', 'nhiRate', ...]：官方還沒公告、暫用的欄位
r.cite.minWage;                    // { url: 'https://www.mol.gov.tw/…', dataDate: '2026-11-24', note: '…' }

ratesOfYear(2030).fallback;        // true：表裡沒有那一年，沿用最近的前一年（全部欄位都算 pending）
```

| 欄位 | 是什麼 | 多久變 |
| --- | --- | --- |
| `minWage` | 每月基本工資 | 每年 |
| `taxRate`、`taxExemptMax` | 居住者租賃／執行業務／稿費扣繳率、免扣門檻 | 修法 |
| `salaryRate`、`salaryStart` | 非每月給付薪資扣繳率、起扣標準 | 起扣標準每年 |
| `nonResident*` | 非居住者扣繳率、薪資分界倍數、稿費免扣門檻 | 修法 |
| `nhiSupplement*` | 二代健保補充保費率、單次門檻、上限 | 費率隨健保費率 |
| `bliRate`、`empRate`、`bli*Share`、`bliMaxSalary` | 勞保、就保費率、分擔比例、最高一級 | 每年 |
| `occAvgRate`、`occMaxSalary` | 職災保險（行業平均費率，估算用）、最高一級 | 3 年／每年 |
| `wageFundRate` | 積欠工資墊償基金 | 修法 |
| `nhiRate`、`nhi*Share`、`nhiAvgDependents`、`nhiMaxDependents` | 健保 | 每年審議 |
| `pensionRate`、`pensionMaxSalary` | 勞退雇主提繳率、最高一級 | 每年 |
| `perDiemExecutive`、`perDiemStaff`、`perDiemMethodBRatio` | 國內出差日支、國外算法 B 比例 | 修正查核準則 |

完整說明與每格出處：[`src/data/years.json`](src/data/years.json)（發布後在 `@joelincc/tw-payroll-rules/data/years.json`）。

## 扣繳與二代健保補充保費

```ts
import { withholdingRatesOn, fromGross, fromNet, laborCalc } from '@joelincc/tw-payroll-rules/withholding';

const { rates } = withholdingRatesOn('2026-11-30');
fromGross(30000, '51', rates);       // 租金 3 萬：{ gross: 30000, tax: 3000, nhi: 633, net: 26367 }
fromNet(26367, '51', rates);         // 給付人負擔稅費：反推給付總額 30000
laborCalc(44250, '50', 'foreign_lt183', rates); // 非居住者薪資，基本工資 1.5 倍以下 6%
```

所得類別用扣繳憑單代號：`51` 租賃、`9A` 執行業務、`9B` 稿費、`92` 其他所得、`50` 薪資（單次給付）。
身分別：`tw`、`foreign_ge183`（外國人滿 183 天＝居住者）、`foreign_lt183`（非居住者）。金額四捨五入到元。
算好的金額應存在單據上：年度表日後更新，不應回頭改舊單。

依據：各類所得扣繳率標準第2、3、13條；薪資所得扣繳辦法；全民健康保險法第31條、全民健康保險扣取及繳納補充保險費辦法。

## 勞健保、勞退保費估算

```ts
import { premiumBreakdown, employerMonthlyCost } from '@joelincc/tw-payroll-rules/insurance';

premiumBreakdown('bli', 45800, 0, 2027);   // 勞保＋就保＋職災＋墊償：{ employee, employer, bill }
premiumBreakdown('nhi', 30000, 2, 2026);   // 健保（眷屬 2 口）
premiumBreakdown('pension', 30000, 0, 2026); // 勞退雇主提繳 6%
employerMonthlyCost(30000, 2026);          // 公司每月負擔合計
```

這是**估算**：官方帳單用分級表與各自的進位規則逐人計算，職災費率依行業別不同（這裡用全行業平均），請以勞保局、健保署寄來的帳單為準。
`salary` 請傳「月投保薪資」（已對到分級表的那一級）；超過最高一級會以最高一級計。

## 出差日支

```ts
import { dailyUsdForTrip, computePerDiem, findRegion } from '@joelincc/tw-payroll-rules/per-diem';

findRegion('F006', '2027-03-01');                 // 東京：{ key: 'F006', city: '東京(Tokyo)', usd: 300, … }
dailyUsdForTrip('F006', '2026-12-30', '2027-01-02'); // [299, 299, 300, 300]：跨年每天照當天版本

computePerDiem({ scope: 'domestic', startOn: '2026-05-01', days: 3, rank: 'staff', policyDaily: 800 });
// 標準 600×3 列差旅費，超過的 200×3 列薪資

computePerDiem({
  scope: 'overseas', startOn: '2027-03-01', days: 3, method: 'B',
  dailyUsd: dailyUsdForTrip('F006', '2027-03-01', '2027-03-03'), usdRate: 32, returnDay30: true,
});
```

- 國內：營利事業所得稅查核準則第74條，董事長、總經理、經理、廠長每日 700，其他職員 600。
- 國外：算法 A＝膳宿雜費全額按日支數額表；算法 B＝宿費檢據核實、膳雜費按日支數額五成（要自訂宿費檢據核實報銷辦法）。
- **公司自己決定的事由呼叫端傳參數**：每天實際給多少（`policyDaily`）、用算法 A 還是 B、返國當日要不要按 30%（`returnDay30`）。
- 分季節的城市某天不在任何季節內，`regionUsdOn` 回 `null`，請人工填。
- 地區代號 `F###`（國外）、`C###`（大陸港澳）跨版本固定；新增城市給新代號，刪除的城市只出現在舊版（`edition.added`／`edition.removed`）。

## 資料多新

`status.json` 記資料日期、有哪些年度、哪些格子還 pending、日支表確認到哪一年。

```bash
npm run check-years   # 今年缺列或還有 pending、12 月起明年缺列、日支表沒確認＝以 1 結束
```

GitHub Actions 每月 1 日跑一次（`.github/workflows/yearly-check.yml`），只檢查、不寫回。

## 每年怎麼更新

官方沒有機器可讀檔，所以不自動下載，由維護者讀公告後改表：

1. **基本工資**（勞動部 9–10 月）：`src/data/years.json` 明年那一列的 `minWage` 與 `cite`。
2. **勞保、職災、勞退分級表**（勞保局約 11 月）：`bliMaxSalary`、`occMaxSalary`、`pensionMaxSalary`；勞保費率（`bliRate`）依勞工保險條例逐年調整。
3. **健保費率、平均眷口數**（健保會 11 月審議）：`nhiRate`、`nhiAvgDependents`；一般費率變動時補充保費率（`nhiSupplementRate`）跟著調整。
4. **薪資起扣標準**（財政部年底）：`salaryStart`。
5. **日支數額表**（主計總處約 10 月）：在 `src/data/per-diem-overseas.json` 加新的一版（沿用舊代號，新增城市給新代號），`checkedFor` 改成新版的年度。官方會同時公布「修正對照表」，用它逐格核對舊版與新版。
6. 每改一格就更新那格的 `cite`（網址、`dataDate`、依據），清掉 `pending`，同步 `status.json`，`npm test` 全過後開 PR、發新版。

## 不包含的東西

- 申報書格式、報稅流程。
- 勞健保分級表本身（投保薪資要對到哪一級）：可以參考其他開源套件或勞保局、健保署的分級表檔案。
- 統一編號、身分證字號檢查。

## 授權

MIT。資料來自中華民國政府公開的公告與法規。
