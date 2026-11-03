import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CURRENCY_NAME } from '../lib/currency.js';
import { applyPrimaryCurrency } from '../lib/primaryCurrency.js';

const nameOf = (code) => (code === 'KRW' ? '대한민국 원' : CURRENCY_NAME[code] || code);

// 설정 > 화폐 설정. 주 화폐 카드(단독) + 보조 화폐 카드. 화폐 카드를 누르면 주 화폐로 변경
// (기존 기록은 그대로, 변경 후 입력하는 기록부터 주 화폐로 입력).
export default function CurrencySettings() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const [list, setList] = useState([]);
  const primary = user?.primary_currency || 'KRW';

  const load = useCallback(() => db.listCurrencies().then(setList).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // 보조 화폐: 원화(주 화폐가 아니면) + 추가한 화폐 중 주 화폐 제외
  const secondary = [
    ...(primary !== 'KRW' ? [{ id: 'KRW', code: 'KRW', fixed: true }] : []),
    ...list.filter((c) => c.code !== primary),
  ];

  const makePrimary = async (code) => {
    if (code === primary) return;
    if (!confirm('주 화폐를 변경할까요?')) return;
    try {
      await db.setPrimaryCurrency(code);
      // 원화가 아닌 화폐를 주 화폐로 바꾸면 보조 화폐 목록에도 남아 있게(키패드 화폐 선택용)
      if (code !== 'KRW' && !list.some((c) => c.code === code)) await db.addCurrency(user.id, code);
      setUser((u) => ({ ...u, primary_currency: code }));
      applyPrimaryCurrency(code);
      load();
    } catch (e) { alert(e.message); }
  };
  const del = async (e, row) => {
    e.stopPropagation();
    if (!confirm(`'${nameOf(row.code)}'를 삭제할까요?`)) return;
    try { await db.deleteCurrency(row.id); load(); } catch (err) { alert(err.message); }
  };

  const codeBadge = (code, bg) => (
    <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#191722', flex: 'none' }}>{code}</span>
  );
  const rowStyle = (i) => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', fontFamily: 'inherit', textAlign: 'left',
    padding: '12px 12px 12px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)', cursor: 'pointer',
  });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="화폐 설정" flat right={
        <button className="tb-icon-btn" onClick={() => nav('/settings/currency/add')} aria-label="보조 화폐 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {/* 주 화폐(단독 카드) */}
      <div className="tx-daycard" style={{ marginTop: 14 }}>
        <div style={rowStyle(0)}>
          {codeBadge(primary, '#eef1fb')}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{nameOf(primary)}</span>
          <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '3px 8px' }}>주 화폐</span>
        </div>
      </div>

      {/* 보조 화폐: 누르면 주 화폐로 변경 */}
      <div className="tx-daycard" style={{ marginTop: 12 }}>
        {secondary.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>추가된 보조 화폐가 없습니다.</div>
        ) : secondary.map((c, i) => (
          <div key={c.id} role="button" tabIndex={0} onClick={() => makePrimary(c.code)} style={rowStyle(i)}>
            {codeBadge(c.code, '#fde8ee')}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{nameOf(c.code)}</span>
            {!c.fixed && (
              <button aria-label="삭제" onClick={(e) => del(e, c)} className="cat-del-btn">
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
