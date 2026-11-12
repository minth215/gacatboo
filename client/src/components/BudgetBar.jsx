import { fmtP, getPrimary } from '../lib/primaryCurrency.js';

const unitLabel = () => (getPrimary().code === 'KRW' ? '원' : getPrimary().code);

// 예산 바(통계 분류별 예산과 같은 모양): 확정 금액(진한 색) + 예정 금액(같은 색 옅게, 이어서).
// 아래 줄 — 좌: 예산 {확정}/{예산} 원 ({%} %), 우: {남은 금액} 원 남음 또는 {넘은 금액} 원 초과.
// 예정 금액이 있으면 그 아래 작은 줄에 "구매 예정 포함 …"을 덧붙인다.
export default function BudgetBar({ budget, spent, planned = 0, color = '#FF3B5C', overColor = '#FF3B5C', plannedLabel = '구매 예정' }) {
  if (!budget) return null;
  const pct = Math.round((spent / budget) * 100);
  const spentW = Math.min(100, Math.max(0, (spent / budget) * 100));
  const plannedW = Math.min(100 - spentW, Math.max(0, (planned / budget) * 100));
  const over = spent - budget;
  const overWithPlan = spent + planned - budget;
  const u = unitLabel();
  return (
    <div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--k-bg-f2f1f5)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ height: '100%', background: color, width: `${spentW}%`, borderRadius: plannedW > 0 ? '999px 0 0 999px' : 999 }} />
        {plannedW > 0 && <div style={{ height: '100%', background: color, opacity: 0.35, width: `${plannedW}%`, borderRadius: spentW > 0 ? '0 999px 999px 0' : 999 }} />}
      </div>
      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.25, color: 'var(--k-tx-8b8798)' }}>
        <span style={{ whiteSpace: 'nowrap' }}>예산 {fmtP(spent)}/{fmtP(budget)} {u} ({pct} %)</span>
        <span style={{ whiteSpace: 'nowrap', ...(over > 0 ? { color: overColor, fontWeight: 700 } : {}) }}>
          {over > 0 ? `${fmtP(over)} ${u} 초과` : `${fmtP(-over)} ${u} 남음`}
        </span>
      </div>
      {planned > 0 && (
        <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.25, color: 'var(--k-tx-a29ead)' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{plannedLabel} {fmtP(planned)} {u}</span>
          <span style={{ whiteSpace: 'nowrap', ...(overWithPlan > 0 ? { color: overColor, fontWeight: 700 } : {}) }}>
            {plannedLabel} 포함 {overWithPlan > 0 ? `${fmtP(overWithPlan)} ${u} 초과` : `${fmtP(-overWithPlan)} ${u} 남음`}
          </span>
        </div>
      )}
    </div>
  );
}
