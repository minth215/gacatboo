// 예산 적용 값 계산(분류별·전체 공통): 그 달 재정의 ?? 그 해 기본(month 0) ?? null(미설정)
export function effectiveOf(rows, month) {
  const own = rows.find((r) => r.month === month);
  if (own) return Number(own.amount);
  const base = rows.find((r) => r.month === 0);
  return base ? Number(base.amount) : null;
}

// 그 달 분류별 예산 합(설정한 분류만). catIds: 이 종류(수입/지출)의 분류 id 목록
export function categorySum(catRows, catIds, month) {
  return catIds.reduce((s, id) => s + (effectiveOf(catRows.filter((r) => r.category_id === id), month) || 0), 0);
}

// 전체 예산 검사: 그 달 전체 예산(설정돼 있으면)이 분류별 예산 합보다 커야 함. 어긋나는 첫 달과 값들을 돌려줌
export function findBudgetConflict(totalRows, catRows, catIds) {
  for (let m = 1; m <= 12; m++) {
    const total = effectiveOf(totalRows, m);
    if (total == null) continue;
    const sum = categorySum(catRows, catIds, m);
    if (sum > 0 && total <= sum) return { month: m, total, sum };
  }
  return null;
}
