import { useState } from 'react';
import { createPortal } from 'react-dom';

// 가계부 필터 하단 모달(시안 2a 그대로). 유형(전체/수입/지출/이체)은 하나만, 분류·원천은 여러 개 선택.
// 선택은 바로 반영되고 "적용하기"는 모달만 닫는다. 초기화는 전체 해제.
const TYPES = [{ key: 'all', label: '전체' }, { key: 'income', label: '수입' }, { key: 'expense', label: '지출' }, { key: 'transfer', label: '이체' }];
const toggleIn = (arr, val) => (arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

const ChevDown = () => <svg width="13" style={{ flex: "none" }} viewBox="0 0 24 24" fill="none" stroke="#8b8798" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
const ChevRight = () => <svg width="13" style={{ flex: "none" }} viewBox="0 0 24 24" fill="none" stroke="#8b8798" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>;

export default function LedgerFilterSheet({
  categories, // [{ name, emoji }]
  sourceGroups, // [{ name, items: [name] }]
  filterType, setFilterType, filterCats, setFilterCats, filterSrcs, setFilterSrcs,
  onClose,
}) {
  // 분류/원천은 한 번에 하나만 펼침('cat' | 'src' | null)
  const [expanded, setExpanded] = useState(null);
  const catExpanded = expanded === 'cat';
  const srcExpanded = expanded === 'src';
  const toggleSection = (key) => setExpanded((v) => (v === key ? null : key));
  const resetFilter = () => { setFilterType('all'); setFilterCats([]); setFilterSrcs([]); };
  // 분류는 수입/지출 탭에서만 보임 — 전체/이체로 바꾸면 분류 선택은 해제
  const showCategory = filterType === 'income' || filterType === 'expense';
  const onType = (key) => {
    setFilterType(key);
    if (key !== 'income' && key !== 'expense') { setFilterCats([]); if (expanded === 'cat') setExpanded(null); }
  };

  // 라벨 옆 요약은 고른 순서가 아니라 목록(분류/원천 관리) 순서대로
  const catOrder = categories.map((c) => c.name);
  const srcOrder = sourceGroups.flatMap((g) => (g.items.length ? g.items : [g.name]));
  const inOrder = (selected, order) => [...selected].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
  const catSummary = filterCats.length === 0 ? '전체' : inOrder(filterCats, catOrder).join(', ');
  // 원천: 상위 항목의 하위가 모두 선택돼 있으면 하위 이름들 대신 상위 이름(카드, 은행 등)으로 묶어 표기
  const srcSummary = filterSrcs.length === 0 ? '전체' : sourceGroups.flatMap((g) => {
    if (!g.items.length) return filterSrcs.includes(g.name) ? [g.name] : [];
    if (g.items.every((it) => filterSrcs.includes(it))) return [g.name];
    return g.items.filter((it) => filterSrcs.includes(it));
  }).concat(filterSrcs.filter((n) => !srcOrder.includes(n))).join(', ');

  const catChips = [{ name: '전체', emoji: '' }, ...categories].map(({ name, emoji }) => {
    const checked = name === '전체' ? filterCats.length === 0 : filterCats.includes(name);
    return {
      name, emoji, checked,
      bg: '#fff',
      fg: checked ? '#191722' : '#6c6779',
      border: checked ? '#191722' : '#efeef2',
      onClick: name === '전체' ? () => setFilterCats([]) : () => setFilterCats((x) => toggleIn(x, name)),
    };
  });

  const srcRows = (() => {
    const rows = [{ key: '전체', label: '전체', indent: false, bold: true, checked: filterSrcs.length === 0, onClick: () => setFilterSrcs([]) }];
    sourceGroups.forEach((g) => {
      if (g.items.length === 0) {
        rows.push({ key: g.name, label: g.name, indent: false, bold: false, checked: filterSrcs.includes(g.name), onClick: () => setFilterSrcs((x) => toggleIn(x, g.name)) });
      } else {
        const allChecked = g.items.every((it) => filterSrcs.includes(it));
        rows.push({
          key: g.name, label: g.name, indent: false, bold: true, checked: allChecked,
          onClick: () => setFilterSrcs((x) => (allChecked ? x.filter((n) => !g.items.includes(n)) : [...new Set([...x, ...g.items])])),
        });
        g.items.forEach((it) => {
          rows.push({ key: `${g.name}/${it}`, label: it, indent: true, bold: false, checked: filterSrcs.includes(it), onClick: () => setFilterSrcs((x) => toggleIn(x, it)) });
        });
      }
    });
    return rows.map((r) => ({
      ...r,
      fg: r.checked ? '#191722' : '#6c6779',
      dotBg: r.checked ? '#191722' : '#fff',
      dotBorder: r.checked ? '#191722' : '#d8d5dc',
      paddingLeft: r.indent ? '26px' : '0px',
      fontWeight: r.bold ? 700 : 500,
    }));
  })();

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(25,23,34,.42)' }} />
      <div className="ledger-filter-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', background: '#fff', borderRadius: '24px 24px 0 0', boxShadow: '0 -12px 32px rgba(25,23,34,.18)', padding: '10px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'sheet-up .22s ease-out', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e4e2e7', margin: '0 auto 14px', flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#191722', letterSpacing: '-.3px' }}>필터</div>
          <button type="button" onClick={resetFilter} style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.25, fontWeight: 700, color: '#8b8798', cursor: 'pointer', padding: '4px 2px' }}>초기화</button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', background: '#f4f2f0', borderRadius: 999, padding: 3, flex: 'none' }}>
          {TYPES.map((t) => (
            <button
              key={t.key} type="button" onClick={() => onType(t.key)}
              style={{ flex: 1, border: 'none', borderRadius: 999, padding: '9px 0', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: filterType === t.key ? '#fff' : 'transparent', color: filterType === t.key ? '#191722' : '#8b8798' }}
            >{t.label}</button>
          ))}
        </div>

        {showCategory && (<>
        <button type="button" onClick={() => toggleSection('cat')} style={{ flex: 'none', marginTop: 22, width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ flex: 1, minWidth: 0, marginRight: 10, display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 12.75, textAlign: 'left' }}>
            <span style={{ flex: 'none', fontWeight: 700, color: '#191722' }}>분류</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 500, color: '#a29ead', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {catSummary}</span>
          </span>
          {catExpanded ? <ChevDown /> : <ChevRight />}
        </button>
        {catExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
            {catChips.map((c) => (
              <button
                key={c.name} type="button" onClick={c.onClick}
                style={{ border: `1.5px solid ${c.border}`, borderRadius: 999, background: c.bg, color: c.fg, fontFamily: 'inherit', fontSize: 12.25, fontWeight: 600, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {c.emoji ? `${c.emoji} ` : ''}{c.name}
              </button>
            ))}
          </div>
        )}

        </>)}

        <button type="button" onClick={() => toggleSection('src')} style={{ flex: 'none', marginTop: 22, width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ flex: 1, minWidth: 0, marginRight: 10, display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 12.75, textAlign: 'left' }}>
            <span style={{ flex: 'none', fontWeight: 700, color: '#191722' }}>원천</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 500, color: '#a29ead', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {srcSummary}</span>
          </span>
          {srcExpanded ? <ChevDown /> : <ChevRight />}
        </button>
        {srcExpanded && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
            {srcRows.map((r) => (
              <button
                key={r.key} type="button" onClick={r.onClick}
                style={{ flex: 'none', border: 'none', background: 'transparent', fontFamily: 'inherit', padding: `9px 0 9px ${r.paddingLeft}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left' }}
              >
                <span style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${r.dotBorder}`, background: r.dotBg, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.checked && <svg width="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span style={{ fontSize: 13, color: r.fg, fontWeight: r.fontWeight }}>{r.label}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={onClose} style={{ flex: 'none', marginTop: 26, width: '100%', fontFamily: 'inherit', height: 52, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>적용하기</button>
      </div>
    </div>,
    document.body
  );
}
