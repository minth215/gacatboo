import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import TransactionForm from '../components/TransactionForm.jsx';

// 항목 작성/수정 전용 페이지 (하단 시트가 아닌 별도 화면).
// /new            → 개인 항목 추가
// /new?group=ID   → 그룹 항목 추가
// /tx/:id         → 기존 항목 수정
export default function TransactionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const groupId = params.get('group') ? Number(params.get('group')) : null;
  const nav = useNavigate();
  const editing = !!id;

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    db.getTransaction(id)
      .then((tx) => setInitial(tx))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  // 저장/취소 후 이동: 그룹 항목이면 그룹으로, 아니면 가계부로.
  const done = () => {
    const target = groupId || initial?.group_id;
    nav(target ? `/groups/${target}` : '/');
  };

  if (loading) return <div className="empty">불러오는 중…</div>;
  if (error) return (
    <div>
      <button className="btn sm ghost" onClick={() => nav(-1)} style={{ paddingLeft: 0 }}>‹ 뒤로</button>
      <div className="empty">{error}</div>
    </div>
  );

  return (
    <div>
      <button className="btn sm ghost" onClick={done} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 뒤로</button>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>{editing ? '항목 수정' : '항목 추가'}</h2>
      <div className="card">
        <TransactionForm initial={initial} groupId={groupId} onSaved={done} onClose={done} />
      </div>
    </div>
  );
}
