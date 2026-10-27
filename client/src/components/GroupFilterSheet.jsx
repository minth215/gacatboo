import { createPortal } from 'react-dom';

// 그룹 페이지 필터 하단 모달(가계부 필터 하단 모달과 같은 모양).
// 카테고리는 가계부 필터의 "분류"처럼 버튼으로 여러 개 선택(전체 = 선택 없음),
// 종료된 그룹 표시는 iOS 스타일 토글. 선택은 바로 반영되고 "적용하기"는 모달만 닫는다.
const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function GroupFilterSheet({ categories, filterCats, setFilterCats, showEnded, setShowEnded, onClose }) {
  const resetFilter = () => { setFilterCats([]); setShowEnded(true); };

  const chips = [{ name: '전체' }, ...categories].map(({ name }) => {
    const checked = name === '전체' ? filterCats.length === 0 : filterCats.includes(name);
    return {
      name, checked,
      fg: checked ? 'var(--k-tx-191722)' : 'var(--k-tx-6c6779)',
      border: checked ? 'var(--k-bd-191722)' : 'var(--k-bd-efeef2)',
      onClick: name === '전체' ? () => setFilterCats([]) : () => setFilterCats((x) => toggleIn(x, name)),
    };
  });

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(25,23,34,.42)' }} />
      <div className="ledger-filter-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', background: 'var(--k-bg-fff)', borderRadius: '24px 24px 0 0', boxShadow: '0 -12px 32px rgb(var(--k-sh) / calc(.18 * var(--k-sha)))', padding: '10px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'sheet-up .22s ease-out', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--k-bg-e4e2e7)', margin: '0 auto 14px', flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--k-tx-191722)', letterSpacing: '-.3px' }}>필터</div>
          <button type="button" onClick={resetFilter} style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.25, fontWeight: 700, color: 'var(--k-tx-8b8798)', cursor: 'pointer', padding: '4px 2px' }}>초기화</button>
        </div>

        <div style={{ flex: 'none', marginTop: 22, fontSize: 12.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>카테고리</div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {chips.map((c) => (
            <button
              key={c.name} type="button" onClick={c.onClick}
              style={{ border: `1.5px solid ${c.border}`, borderRadius: 999, background: 'var(--k-bg-fff)', color: c.fg, fontFamily: 'inherit', fontSize: 12.25, fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}
            >{c.name}</button>
          ))}
        </div>

        <div style={{ flex: 'none', marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>종료된 그룹 표시</span>
          <button type="button" role="switch" aria-checked={showEnded} aria-label="종료된 그룹 표시"
            className={`ios-toggle${showEnded ? ' on' : ''}`} onClick={() => setShowEnded((v) => !v)}>
            <span className="ios-toggle-knob" />
          </button>
        </div>

        <button type="button" onClick={onClose} style={{ flex: 'none', marginTop: 26, width: '100%', fontFamily: 'inherit', height: 52, border: 'none', borderRadius: 999, background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>적용하기</button>
      </div>
    </div>,
    document.body
  );
}
