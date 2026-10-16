import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum } from '../lib/format.js';
import { tileBg } from '../components/TransactionList.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SwipeRow from '../components/SwipeRow.jsx';
import Spinner from '../components/Spinner.jsx';

// 기록 폼에서 별 아이콘으로 등록해 둔 즐겨찾기 템플릿 목록. 카드를 고르면 그 내용(분류/원천/
// 내용/항목/금액)이 그대로 기록 폼에 채워진 채로 "/new" 화면으로 넘어간다(날짜는 항상 오늘).
export default function Favorites() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = () => db.listFavoriteTransactions(user.id).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const pick = (fav) => nav('/new', { state: { favorite: fav } });
  const remove = async (fav) => {
    if (!confirm('이 즐겨찾기를 삭제할까요?')) return;
    try { await db.deleteFavoriteTransaction(fav.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="즐겨찾기" flat />

      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <div className="empty empty-center-notabs">저장된 즐겨찾기가 없습니다.<br />기록 페이지의 별 아이콘으로 등록해 보세요.</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {rows.map((f) => {
            const sub = f.type === 'transfer'
              ? [f.category_name || '이체', (f.source_name && f.to_source_name) ? `${f.source_name} → ${f.to_source_name}` : ''].filter(Boolean).join(' · ') || '—'
              : [f.category_name, f.source_name].filter(Boolean).join(' · ') || '—';
            return (
              <div key={f.id} style={{ marginBottom: 8 }}>
                <SwipeRow
                  isOpen={openId === f.id} onOpenChange={(open) => setOpenId(open ? f.id : null)}
                  onTap={() => pick(f)} actionsWidth={52}
                  actions={(progress) => (
                    <div className="tx-swipe-actions" style={{ opacity: progress }}>
                      <button type="button" className="settle-icon-btn danger" onClick={() => remove(f)} aria-label="삭제">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  )}
                >
                  <div className="tx-row" style={{ borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', cursor: 'pointer' }}>
                    <span className="tx-tile" style={{ background: f.category_emoji ? (f.category_color || tileBg(f.category_name)) : '#f2f1f5' }}>
                      {f.category_emoji || (f.type === 'income' ? '💰' : f.type === 'transfer' ? '🔁' : '💸')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tx-row-title"><span className="ttext">{f.content || f.category_name || '기록'}</span></div>
                      <div className="tx-row-sub">{sub}</div>
                    </div>
                    <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: f.type === 'income' ? '#2CDDB9' : f.type === 'transfer' ? '#4b4752' : '#FF4358' }}>
                      {f.type === 'transfer' ? '' : (f.type === 'income' ? '+' : '-')}{fmtNum(f.amount)}
                    </span>
                  </div>
                </SwipeRow>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
