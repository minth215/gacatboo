import { useEffect, useState } from 'react';
import { db } from './db.js';
import { useAuth } from './auth.jsx';

const sameItems = (a, b) => {
  const an = a?.length ? a : null, bn = b?.length ? b : null;
  if (!an && !bn) return true;
  if (!an || !bn || an.length !== bn.length) return false;
  return an.every((x, i) => (x.name || '') === (bn[i].name || '') && Number(x.qty || 1) === Number(bn[i].qty || 1) && Number(x.amount) === Number(bn[i].amount));
};

// 날짜를 뺀 나머지(유형/금액/내용/분류/원천/항목)가 완전히 같으면 같은 즐겨찾기로 본다.
// 분류·원천은 이름으로 비교해, 개인 기록 폼과 그룹 기록 폼이 같은 목록을 공유할 수 있게 함.
const matches = (f, s) => (
  f.type === s.type
  && Number(f.amount) === Number(s.amount)
  && (f.content || '').trim() === (s.content || '').trim()
  && (f.category_name || '') === (s.category_name || '')
  && (f.source_name || '') === (s.source_name || '')
  && (f.to_source_name || '') === (s.to_source_name || '')
  && sameItems(f.items, s.items)
);

// 기록 폼(개인/그룹 공용)의 즐겨찾기 별 아이콘 상태와 등록/해제 토글.
// snapshot 은 favorite_transactions 컬럼 모양 그대로(type, amount, category_*, source_*, to_source_*,
// content, memo, items) — 등록할 때 그대로 저장된다. 즐겨찾기는 개인별 목록 하나만 있음.
export function useFavoriteToggle(snapshot, { showToast, onEmptyContent }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    db.listFavoriteTransactions(user.id).then(setFavorites).catch(() => {});
  }, [user.id]);

  const matched = favorites.filter((f) => matches(f, snapshot));
  const favorited = matched.length > 0;

  const toggle = async () => {
    if (busy) return;
    if (favorited) {
      setBusy(true);
      try {
        await Promise.all(matched.map((f) => db.deleteFavoriteTransaction(f.id)));
        setFavorites((prev) => prev.filter((f) => !matched.some((m) => m.id === f.id)));
        showToast('즐겨찾기 해제되었습니다');
      } catch (err) {
        showToast(err.message || '즐겨찾기 해제에 실패했습니다');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!(snapshot.content || '').trim()) { onEmptyContent?.(); return; }
    setBusy(true);
    try {
      const row = await db.addFavoriteTransaction(user.id, snapshot);
      setFavorites((prev) => [row, ...prev]);
      showToast('즐겨찾기에 등록되었습니다');
    } catch (err) {
      showToast(err.message || '즐겨찾기 등록에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  return { favorited, toggle, busy };
}
