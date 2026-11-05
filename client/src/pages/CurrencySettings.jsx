import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CURRENCY_NAME } from '../lib/currency.js';
import { applyPrimaryCurrency } from '../lib/primaryCurrency.js';
import { loadPrefs, savePrefs } from '../lib/prefs.js';
import { DayCardRow } from '../components/TransactionList.jsx';

const nameOf = (code) => (code === 'KRW' ? '대한민국 원' : CURRENCY_NAME[code] || code);

// 설정 > 화폐 설정. 주 화폐 카드(단독) + 보조 화폐 카드. 화폐 카드를 누르면 주 화폐로 변경
// (기존 기록은 그대로, 변경 후 입력하는 기록부터 주 화폐로 입력).
export default function CurrencySettings() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const [list, setList] = useState([]);
  const primary = user?.primary_currency || 'KRW';
  const [openId, setOpenId] = useState(null); // 스와이프로 열린 카드(하나만)
  // 여행 중인 보조 화폐: 기록 페이지 금액의 기본 화폐(주 화폐·환산은 그대로)
  const [travel, setTravelState] = useState(() => loadPrefs(user?.id).travelCurrency || null);
  const setTravel = (code) => { savePrefs(user?.id, { travelCurrency: code }); setTravelState(code); };

  const load = useCallback(() => db.listCurrencies().then(setList).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // 보조 화폐: 추가한 화폐 중 주 화폐 제외(주 화폐가 원화가 아니면 KRW 도 일반 보조 화폐처럼 삭제 가능)
  const secondary = list.filter((c) => c.code !== primary);

  const makePrimary = async (code) => {
    if (code === primary) return;
    if (!confirm('주 화폐를 변경할까요?')) return;
    try {
      await db.setPrimaryCurrency(code);
      // 원화가 아닌 화폐를 주 화폐로 바꾸면 보조 화폐 목록에도 남아 있게(키패드 화폐 선택용)
      if (code !== 'KRW' && !list.some((c) => c.code === code)) await db.addCurrency(user.id, code);
      // 원화에서 다른 화폐로 바꾸면 KRW 를 보조 화폐로 추가(이후 삭제 가능)
      if (primary === 'KRW' && !list.some((c) => c.code === 'KRW')) await db.addCurrency(user.id, 'KRW');
      if (travel === code) setTravel(null); // 주 화폐가 된 화폐는 여행 중 해제
      setUser((u) => ({ ...u, primary_currency: code }));
      applyPrimaryCurrency(code);
      load();
    } catch (e) { alert(e.message); }
  };
  const del = async (row) => {
    if (!confirm(`'${nameOf(row.code)}'를 삭제할까요?`)) return;
    try { await db.deleteCurrency(row.id); if (travel === row.code) setTravel(null); setOpenId(null); load(); } catch (err) { alert(err.message); }
  };
  // 여행 중 켜기/끄기(한 화폐만)
  const toggleTravel = (code) => { setTravel(travel === code ? null : code); setOpenId(null); };

  const codeBadge = (code, bg) => (
    <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#191722', flex: 'none' }}>{code}</span>
  );
  const rowStyle = () => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px' });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="화폐 설정" flat right={
        <button className="tb-icon-btn" onClick={() => nav('/settings/currency/add')} aria-label="보조 화폐 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {/* 주 화폐(단독 카드) */}
      <div className="tx-daycard">
        <div style={rowStyle(0)}>
          {codeBadge(primary, '#eef1fb')}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{nameOf(primary)}</span>
          <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '3px 8px' }}>주 화폐</span>
        </div>
      </div>

      {/* 보조 화폐: 누르면 주 화폐로 변경, 왼쪽으로 밀면 여행 중/삭제 */}
      {secondary.length === 0 ? (
        <div className="tx-daycard" style={{ marginTop: 12 }}>
          <div className="empty" style={{ padding: '20px 0' }}>추가된 보조 화폐가 없습니다.</div>
        </div>
      ) : (
        <div className="tx-daygroup" style={{ marginTop: 12 }}>
          {secondary.map((c, i) => (
            <DayCardRow
              key={c.id} index={i} count={secondary.length} clickable
              isOpen={openId === c.id} onOpenChange={(o) => setOpenId(o ? c.id : null)}
              onTap={() => makePrimary(c.code)}
              onTravel={() => toggleTravel(c.code)}
              onDelete={() => del(c)}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                {codeBadge(c.code, '#fde8ee')}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{nameOf(c.code)}</span>
                {travel === c.code && (
                  <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: '#1B9C85', background: '#DDF7F1', borderRadius: 999, padding: '3px 8px' }}>여행 중</span>
                )}
              </div>
            </DayCardRow>
          ))}
        </div>
      )}
    </div>
  );
}
