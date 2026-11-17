import { createPortal } from 'react-dom';

// 장바구니 필터 하단 모달(그룹·가계부 필터와 같은 모양). 분류는 여러 개(전체 = 선택 없음), 상태는 하나.
// 선택은 바로 반영되고 "적용하기"는 모달만 닫는다.
const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const STATUS = [['all', '전체'], ['planned', '구매 예정'], ['done', '구매 완료']];

export default function CartFilterSheet({ categories, filterCats, setFilterCats, status, setStatus, onClose }) {
  const chip = (key, label, checked, onClick) => (
    <button
      key={key} type="button" onClick={onClick}
      style={{ border: `1.5px solid ${checked ? 'var(--k-bd-191722)' : 'var(--k-bd-efeef2)'}`, borderRadius: 999, background: 'var(--k-bg-fff)', color: checked ? 'var(--k-tx-191722)' : 'var(--k-tx-6c6779)', fontFamily: 'inherit', fontSize: 12.25, fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}
    >{label}</button>
  );
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(25,23,34,.42)' }} />
      <div className="ledger-filter-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', background: 'var(--k-bg-fff)', borderRadius: '24px 24px 0 0', boxShadow: '0 -12px 32px rgb(var(--k-sh) / calc(.18 * var(--k-sha)))', padding: '10px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'sheet-up .22s ease-out', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--k-bg-e4e2e7)', margin: '0 auto 14px', flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--k-tx-191722)', letterSpacing: '-.3px' }}>필터</div>
          <button type="button" onClick={() => { setFilterCats([]); setStatus('all'); }} style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.25, fontWeight: 700, color: 'var(--k-tx-8b8798)', cursor: 'pointer', padding: '4px 2px' }}>초기화</button>
        </div>

        <div style={{ flex: 'none', marginTop: 22, fontSize: 12.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>상태</div>
        <div style={{ flex: 'none', marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATUS.map(([k, l]) => chip(k, l, status === k, () => setStatus(k)))}
        </div>

        <div style={{ flex: 'none', marginTop: 22, fontSize: 12.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>분류</div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {chip('__all', '전체', filterCats.length === 0, () => setFilterCats([]))}
          {categories.map((c) => chip(c.id, `${c.emoji ? `${c.emoji} ` : ''}${c.name}`, filterCats.includes(c.name), () => setFilterCats((x) => toggleIn(x, c.name))))}
        </div>

        <button type="button" onClick={onClose} style={{ flex: 'none', marginTop: 26, width: '100%', fontFamily: 'inherit', height: 52, border: 'none', borderRadius: 999, background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>적용하기</button>
      </div>
    </div>,
    document.body
  );
}
