import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, addInterval } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import { DepositForm } from './SubscriptionGroup.jsx';

export default function MemberDetail() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [sub, setSub] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [cats, setCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [editor, setEditor] = useState(null);    // 카드 수정
  const [depEditor, setDepEditor] = useState(null); // 입금 수정

  const loadGroup = useCallback(() => {
    db.getGroup(gid).then(({ group, members }) => {
      setGroup(group);
      const m = members.find((x) => x.id === mid);
      if (!m) { alert('멤버를 찾을 수 없습니다.'); nav(`/groups/${gid}`); return; }
      setMember(m);
    }).catch((e) => { alert(e.message); nav(`/groups/${gid}`); });
  }, [gid, mid, nav]);
  const loadDeps = useCallback(() => {
    db.listDeposits(gid).then((all) => setDeposits(all.filter((d) => d.member_id === mid))).catch(() => setDeposits([]));
  }, [gid, mid]);

  useEffect(() => { loadGroup(); loadDeps(); db.getSubscription(gid).then(setSub).catch(() => {}); }, [loadGroup, loadDeps, gid]);
  useEffect(() => {
    db.listCategories('expense').then(setCats).catch(() => {});
    db.listSources().then(setSources).catch(() => {});
  }, []);

  if (!group || !member) return <div className="empty">불러오는 중…</div>;

  const isOwner = group.owner_id === user.id;
  const canEditDep = isOwner || member.user_id === user.id;

  const cum = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const periods = deposits.reduce((s, d) => s + Number(d.periods || 0), 0);
  const last = deposits.length ? deposits.map((d) => d.date).sort().slice(-1)[0] : null;
  const base = member.start_date || (deposits.length ? deposits.map((d) => d.date).sort()[0] : null);
  const autoNext = base && sub ? addInterval(base, sub.period_unit, sub.period_count, periods) : (base || null);
  const nextDue = member.next_due_override || autoNext;

  const openEdit = () => setEditor({
    nickname: member.nickname, start_date: member.start_date || '', end_date: member.end_date || '',
    contact: member.contact || '', memo: member.memo || '', next_due_override: member.next_due_override || '',
  });
  const saveEdit = async () => {
    if (!editor.nickname.trim()) return alert('닉네임을 입력하세요.');
    try { await db.updateMember(mid, gid, editor); setEditor(null); loadGroup(); loadDeps(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav(`/groups/${gid}`)} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ {group.name}</button>

      {/* 상단 카드 */}
      <div className="card">
        <div className="between" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{member.nickname}
            {!member.is_account && <span className="badge pending" style={{ marginLeft: 6 }}>외부</span>}
          </div>
          {isOwner && <button className="btn sm" onClick={openEdit}>수정</button>}
        </div>
        <div className="summary">
          <div className="box"><div className="lbl">누적 입금액</div><div className="val income">{fmtWon(cum)}</div></div>
          <div className="box"><div className="lbl">마지막 입금일</div><div className="val" style={{ fontSize: 14 }}>{last || '-'}</div></div>
          <div className="box"><div className="lbl">다음 입금일</div><div className="val" style={{ fontSize: 14 }}>{nextDue || '-'}</div></div>
        </div>
        {(member.contact || (isOwner && member.memo)) && (
          <div className="small muted" style={{ marginTop: 10 }}>
            {member.contact && <div>📞 {member.contact}</div>}
            {isOwner && member.memo && <div style={{ marginTop: 2 }}>📝 {member.memo}</div>}
          </div>
        )}
      </div>

      {/* 입금 내역 */}
      <h3 style={{ margin: '18px 2px 10px', fontSize: 16 }}>입금 내역</h3>
      {deposits.length === 0 ? <div className="empty">입금 내역이 없습니다.</div> : deposits.map((d) => (
        <div className="tx" key={d.id} onClick={() => canEditDep && setDepEditor(d)} style={{ cursor: canEditDep ? 'pointer' : 'default' }}>
          <span className="cat-emoji">{d.category_emoji || '💸'}</span>
          <div className="tx-main">
            <div className="tx-title">{fmtWon(d.amount)} <span className="tag-group">{d.periods}회차</span></div>
            <div className="tx-sub">{d.date} · {[d.content, d.category_name, d.deposit_source_name].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      ))}

      {editor && (
        <Modal title="멤버 정보 수정" onClose={() => setEditor(null)}>
          <div className="field"><label>닉네임 *</label>
            <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} autoFocus />
            <p className="small muted" style={{ margin: '4px 2px 0' }}>변경 시 이 그룹 내 모든 화면에 반영됩니다.</p>
          </div>
          <div className="grid2">
            <div className="field"><label>시작일자</label><input type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} /></div>
            <div className="field"><label>종료일자</label><input type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>다음 입금일 <span className="small muted">(비우면 자동)</span></label>
            <input type="date" value={editor.next_due_override} onChange={(e) => setEditor({ ...editor, next_due_override: e.target.value })} />
            <p className="small muted" style={{ margin: '4px 2px 0' }}>자동 계산: {autoNext || '-'}</p>
          </div>
          <div className="field"><label>연락처</label><input value={editor.contact} onChange={(e) => setEditor({ ...editor, contact: e.target.value })} /></div>
          <div className="field"><label>메모 <span className="small muted">(총무만 열람)</span></label>
            <textarea value={editor.memo} onChange={(e) => setEditor({ ...editor, memo: e.target.value })} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn block" onClick={() => setEditor(null)}>취소</button>
            <button className="btn primary block" onClick={saveEdit}>저장</button>
          </div>
        </Modal>
      )}

      {depEditor && (
        <DepositForm initial={depEditor} sub={sub} cats={cats} sources={sources} members={[member]}
          onClose={() => setDepEditor(null)}
          onSave={async (p) => { await db.updateDeposit(depEditor.id, p); setDepEditor(null); loadDeps(); }} />
      )}
    </div>
  );
}
