import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { matches } from '../lib/useFavoriteToggle.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import TransactionList from '../components/TransactionList.jsx';

// 즐겨찾기 > "+" → 기록 내역. 그동안 작성한 가계부 기록을 최신순으로 보여주고, 고르면 그 기록
// (날짜 제외: 유형/금액/분류/원천/내용/메모/항목)을 즐겨찾기로 추가한 뒤 즐겨찾기 목록으로 돌아간다.
const snapshotOf = (t) => ({
  type: t.type, amount: Math.round(Number(t.amount) || 0),
  category_id: t.category_id || null, category_name: t.category_name || '', category_emoji: t.category_emoji || '', category_color: t.category_color || '',
  source_id: t.source_id || null, source_name: t.source_name || '',
  to_source_id: t.type === 'transfer' ? (t.to_source_id || null) : null, to_source_name: t.type === 'transfer' ? (t.to_source_name || '') : '',
  content: t.content || '', memo: t.memo || '',
  // 정산 대상 연결(targetId)은 그 기록에만 의미가 있어 템플릿에서는 뺀다
  items: Array.isArray(t.items) && t.items.length ? t.items.map(({ targetId, ...it }) => it) : null,
});

export default function FavoriteAdd() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const busyRef = useRef(false);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg); setToastKey((k) => k + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  useEffect(() => {
    db.searchTransactions({ userId: user.id }).then(setRows).catch(() => setRows([]));
    db.listFavoriteTransactions(user.id).then(setFavorites).catch(() => {});
  }, [user.id]);

  const pick = async (t) => {
    if (busyRef.current) return;
    const snap = snapshotOf(t);
    if (favorites.some((f) => matches(f, snap))) { showToast('이미 즐겨찾기에 있는 기록입니다'); return; }
    busyRef.current = true;
    try {
      await db.addFavoriteTransaction(user.id, snap);
      nav(-1); // 즐겨찾기 목록으로(목록은 다시 불러와 방금 추가한 항목이 맨 위)
    } catch (e) { showToast(e.message || '즐겨찾기 추가에 실패했습니다'); busyRef.current = false; }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="기록 내역" flat />
      {rows == null ? <Spinner /> : (
        <TransactionList
          transactions={rows} onEdit={pick} canEdit={() => true} groupByMonth
          emptyText="작성한 기록이 없습니다." emptyCenter
        />
      )}
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
    </div>
  );
}
