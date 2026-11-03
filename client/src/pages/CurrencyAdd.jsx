import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CURRENCIES } from '../lib/currency.js';
import { getPrimary } from '../lib/primaryCurrency.js';

// 설정 > 화폐 설정 > 보조 화폐 추가. 상단 검색창 고정, 아래 목록만 스크롤.
// 여러 화폐를 골라 하단 "추가" 버튼으로 한 번에 추가.
export default function CurrencyAdd() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [added, setAdded] = useState(null); // 이미 추가된 코드(Set)
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.listCurrencies().then((l) => setAdded(new Set(l.map((c) => c.code)))).catch((e) => { alert(e.message); setAdded(new Set()); });
  }, []);

  const q = query.trim().toLowerCase();
  // 주 화폐가 원화가 아니면 KRW 도 보조 화폐로 다시 추가할 수 있음
  const all = getPrimary().code !== 'KRW' ? [{ code: 'KRW', name: '대한민국 원' }, ...CURRENCIES] : CURRENCIES;
  const available = all.filter((c) => !added?.has(c.code) && c.code !== getPrimary().code)
    .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  const toggle = (code) => setSelected((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const submit = async () => {
    if (busy || !selected.size) return;
    setBusy(true);
    try {
      // 목록 순서대로 추가
      for (const c of all) if (selected.has(c.code)) await db.addCurrency(user.id, c.code);
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    // 높이 = 화면 - 컨테이너 위아래 여백(16×2). 위 여백 44 는 고정 상단바 자리.
    <div style={{ padding: '44px 0 0', boxSizing: 'border-box', height: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="보조 화폐 추가" flat />

      {/* 검색창(고정) */}
      <div style={{ flex: 'none', position: 'relative', marginTop: 10 }}>
        <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          type="search" enterKeyHint="search" className="plain-search" placeholder="화폐 이름 또는 코드 검색" value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 999, padding: '12px 16px 12px 40px', outline: 'none', WebkitAppearance: 'none', appearance: 'none' }}
        />
      </div>

      {/* 목록(스크롤) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', margin: '0 -16px', padding: '14px 16px 16px' }}>
        {added == null ? null : available.length === 0 ? (
          <div className="empty" style={{ padding: '28px 0' }}>{q ? '검색 결과가 없습니다.' : '추가할 수 있는 화폐가 없습니다.'}</div>
        ) : (
          <div className="tx-daycard">
            {available.map((c, i) => {
              const on = selected.has(c.code);
              return (
                <button
                  key={c.code} type="button" onClick={() => toggle(c.code)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'transparent',
                    padding: '12px 14px 12px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: '#fde8ee', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#191722', flex: 'none' }}>{c.code}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{c.name}</span>
                  {/* 선택 체크 */}
                  <span style={{
                    width: 22, height: 22, borderRadius: 999, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    background: on ? 'var(--k-bg-191722)' : 'transparent', border: on ? 'none' : '1.5px solid var(--k-bd-cfccd4)',
                  }}>
                    {on && <svg width="12" viewBox="0 0 24 24" fill="none" stroke="var(--k-onink-fff)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 추가 버튼 */}
      <div style={{ flex: 'none', padding: '10px 0 16px' }}>
        <button type="button" className="btn-ink-pill" style={{ marginTop: 0 }} disabled={busy || !selected.size} onClick={submit}>
          {busy ? '추가 중…' : selected.size ? `추가 (${selected.size})` : '추가'}
        </button>
      </div>
    </div>
  );
}
