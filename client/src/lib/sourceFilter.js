// 입금 쪽(수입·이체 입금·그룹 입금/출금 수단) 원천 목록: 신용카드/체크카드 그룹은 "입금 허용"(allow_deposit)을 켠
// 원천만 남기고(하나도 없으면 그룹째 뺌), 이미 선택된 값은 예전 기록 수정을 위해 항상 남겨 둔다.
// strictTypes: 입금 허용과 무관하게 통째로 뺄 그룹 특성(예: 결제 대금의 납부 계좌는 카드 제외).
const CARD = ['credit', 'check'];

export function depositableTree(tree, selectedId, strictTypes = []) {
  const sel = selectedId != null && selectedId !== '' ? String(selectedId) : null;
  return (tree || []).map((top) => {
    const keepSelected = (c) => sel != null && String(c.id) === sel;
    if (strictTypes.includes(top.group_type)) {
      const kids = (top.children || []).filter(keepSelected);
      return kids.length || String(top.id) === sel ? { ...top, children: kids } : null;
    }
    if (!CARD.includes(top.group_type)) return top;
    const kids = (top.children || []).filter((c) => c.allow_deposit || keepSelected(c));
    return kids.length ? { ...top, children: kids } : null;
  }).filter(Boolean);
}
