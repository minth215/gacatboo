import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum } from '../lib/format.js';
import { tileBg, DayCardRow } from '../components/TransactionList.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

// 기록 폼에서 별 아이콘으로 등록해 둔 즐겨찾기 템플릿 목록. 카드를 고르면 그 내용(분류/원천/
// 내용/항목/금액)이 그대로 기록 폼에 채워진 채로 "/new" 화면으로 넘어간다(날짜는 항상 오늘).
export default function Favorites() {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = () => db.listFavoriteTransactions(user.id).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // 이 화면은 기록 화면(개인/그룹 공용) 위에 쌓여 있으므로 "<"는 평범한 뒤로가기로 그 기록 화면에
  // 돌아가고, 항목을 고르면 이 화면을 같은 종류의 새 기록 화면(returnTo)으로 바꿔치기(replace)해
  // 채워 넣는다. 그 화면에서 저장/닫기하면 원래 기록 화면까지 건너뛰고 그 전 화면으로(-2) 돌아간다.
  const returnTo = location.state?.returnTo || '/new';
  // pickCloseTo: 새 기록 화면을 닫을 때 돌아갈 거리(기록 화면에서 왔으면 -2, 가계부 퀵 메뉴에서 바로 왔으면 -1)
  const pickCloseTo = location.state?.pickCloseTo ?? -2;
  const pick = (fav) => nav(returnTo, { replace: true, state: { favorite: fav, closeTo: pickCloseTo } });
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
              <div key={f.id} className="tx-daygroup" style={{ marginBottom: 8 }}>
                <DayCardRow
                  index={0} count={1} clickable
                  isOpen={openId === f.id} onOpenChange={(open) => setOpenId(open ? f.id : null)}
                  onTap={() => pick(f)} onDelete={() => remove(f)}
                >
                  <span className="tx-tile" style={{ background: f.category_emoji ? (f.category_color || tileBg(f.category_name)) : 'var(--k-bg-f2f1f5)' }}>
                    {f.category_emoji || (f.type === 'income' ? '💰' : f.type === 'transfer' ? '🔁' : '💸')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tx-row-title"><span className="ttext">{f.content || f.category_name || '기록'}</span></div>
                    <div className="tx-row-sub">{sub}</div>
                  </div>
                  <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: f.type === 'income' ? '#2CDDB9' : f.type === 'transfer' ? 'var(--k-tx-4b4752)' : '#FF4358' }}>
                    {f.type === 'transfer' ? '' : (f.type === 'income' ? '+' : '-')}{fmtNum(f.amount)}
                  </span>
                </DayCardRow>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
