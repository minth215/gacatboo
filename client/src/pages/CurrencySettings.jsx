import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CURRENCIES, CURRENCY_NAME } from '../lib/currency.js';

export default function CurrencySettings() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => db.listCurrencies().then(setList).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const addedCodes = new Set(list.map((c) => c.code));
  const available = CURRENCIES.filter((c) => !addedCodes.has(c.code));

  const add = async (code) => {
    try { await db.addCurrency(user.id, code); setPicking(false); load(); } catch (e) { alert(e.message); }
  };
  const del = async (row) => {
    if (!confirm(`'${CURRENCY_NAME[row.code] || row.code}'를 삭제할까요?`)) return;
    try { await db.deleteCurrency(row.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="화폐 설정" flat right={
        <button className="tb-icon-btn" onClick={() => setPicking(true)} aria-label="보조 화폐 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      <p className="small muted" style={{ margin: '14px 2px 0' }}>주 화폐는 원화이며, 기록 페이지의 금액 입력 키패드에서 아래 보조 화폐로 바꿔 입력하면 자동으로 원화 환산 금액을 함께 보여줍니다.</p>

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#eef1fb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#191722', flex: 'none' }}>₩</span>
          <span style={{ fontSize: 13.75, fontWeight: 700, color: '#191722' }}>원화 (기본)</span>
        </div>

        {list.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0', borderTop: '1.5px solid #f2f1f5' }}>추가된 보조 화폐가 없습니다.</div>
        ) : list.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderTop: '1.5px solid #f2f1f5' }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#fde8ee', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#191722', flex: 'none' }}>{c.code}</span>
            <span style={{ flex: 1, fontSize: 13.75, fontWeight: 600, color: '#191722' }}>{CURRENCY_NAME[c.code] || c.code}</span>
            <button aria-label="삭제" onClick={() => del(c)} className="cat-del-btn">
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </button>
          </div>
        ))}
      </div>

      {picking && (
        <div className="catmodal-overlay" onClick={() => setPicking(false)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>보조 화폐 추가</div>
              <button aria-label="닫기" onClick={() => setPicking(false)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {available.length === 0 ? (
                <p className="small muted" style={{ padding: '8px 2px' }}>추가할 수 있는 화폐가 없습니다.</p>
              ) : available.map((c, i) => (
                <button
                  key={c.code} type="button" onClick={() => add(c.code)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent',
                    padding: '12px 2px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit', width: '100%',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#8b8798', width: 36, flex: 'none' }}>{c.code}</span>
                  <span style={{ fontSize: 13.75, fontWeight: 600, color: '#191722' }}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
