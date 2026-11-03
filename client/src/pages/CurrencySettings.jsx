import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';
import { CURRENCY_NAME } from '../lib/currency.js';

export default function CurrencySettings() {
  const nav = useNavigate();
  const [list, setList] = useState([]);

  const load = useCallback(() => db.listCurrencies().then(setList).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const del = async (row) => {
    if (!confirm(`'${CURRENCY_NAME[row.code] || row.code}'를 삭제할까요?`)) return;
    try { await db.deleteCurrency(row.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="화폐 설정" flat right={
        <button className="tb-icon-btn" onClick={() => nav('/settings/currency/add')} aria-label="보조 화폐 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#eef1fb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--k-tx-191722)', flex: 'none' }}>₩</span>
          <span style={{ fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>원화 (기본)</span>
        </div>

        {list.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0', borderTop: '1.5px solid var(--k-divider)' }}>추가된 보조 화폐가 없습니다.</div>
        ) : list.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderTop: '1.5px solid var(--k-divider)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#fde8ee', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--k-tx-191722)', flex: 'none' }}>{c.code}</span>
            <span style={{ flex: 1, fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{CURRENCY_NAME[c.code] || c.code}</span>
            <button aria-label="삭제" onClick={() => del(c)} className="cat-del-btn">
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
