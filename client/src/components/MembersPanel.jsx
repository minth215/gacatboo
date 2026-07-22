import { useState } from 'react';
import { db } from '../lib/db.js';
import Modal from './Modal.jsx';

// 그룹 멤버 관리 (계정/외부 멤버 공통). owner(총무/총대)만 추가·수정·삭제.
export default function MembersPanel({ groupId, members, isOwner, leaderName, onReload }) {
  const [editor, setEditor] = useState(null); // null | {id?, nickname, start_date, end_date, contact, memo, username}
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setErr(''); setEditor({ nickname: '', start_date: '', end_date: '', contact: '', memo: '', username: '' }); };
  const openEdit = (m) => {
    setErr('');
    setEditor({ id: m.id, nickname: m.nickname, start_date: m.start_date || '', end_date: m.end_date || '', contact: m.contact || '', memo: m.memo || '', username: m.username || '', is_account: m.is_account });
  };

  const save = async () => {
    if (!editor.nickname.trim()) return setErr('이름을 입력하세요.');
    if (!editor.start_date) return setErr('시작일자를 입력하세요.');
    setBusy(true); setErr('');
    try {
      if (editor.id) {
        await db.updateMember(editor.id, groupId, editor);
      } else {
        await db.addMember(groupId, editor);
      }
      setEditor(null); onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (m.role === 'owner') return;
    if (!confirm(`${m.nickname}님을 그룹에서 제거할까요?`)) return;
    try { await db.removeMember(m.id); onReload(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>멤버 ({members.length})</h3>
        {isOwner && <button className="btn primary sm" onClick={openAdd}>＋ 멤버 추가</button>}
      </div>

      {members.map((m) => (
        <div className="list-item" key={m.id} style={{ alignItems: 'flex-start' }}>
          <div className="li-main">
            <div style={{ fontWeight: 600 }}>
              {m.nickname}
              {m.role === 'owner' && <span className="badge admin" style={{ marginLeft: 6 }}>{leaderName}</span>}
              {m.role !== 'owner' && !m.is_account && <span className="badge pending" style={{ marginLeft: 6 }}>외부</span>}
            </div>
            <div className="small muted">
              {m.is_account && m.username ? `@${m.username} · ` : ''}
              {m.start_date ? `${m.start_date}${m.end_date ? ` ~ ${m.end_date}` : ' ~'}` : ''}
              {m.contact ? ` · ${m.contact}` : ''}
            </div>
            {isOwner && m.memo && <div className="small" style={{ color: 'var(--muted)', marginTop: 2 }}>📝 {m.memo}</div>}
          </div>
          {isOwner && m.role !== 'owner' && (
            <div className="row">
              <button className="btn sm ghost" onClick={() => openEdit(m)}>수정</button>
              <button className="btn sm ghost" style={{ color: 'var(--expense)' }} onClick={() => remove(m)}>제거</button>
            </div>
          )}
        </div>
      ))}

      {editor && (
        <Modal title={editor.id ? '멤버 수정' : '멤버 추가'} onClose={() => setEditor(null)}>
          <div className="field">
            <label>이름 *</label>
            <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} placeholder="멤버 이름(닉네임)" autoFocus />
          </div>
          <div className="grid2">
            <div className="field">
              <label>시작일자 *</label>
              <input type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} />
            </div>
            <div className="field">
              <label>종료일자</label>
              <input type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>연락처</label>
            <input value={editor.contact} onChange={(e) => setEditor({ ...editor, contact: e.target.value })} placeholder="전화번호/이메일 등 (선택)" />
          </div>
          {!editor.id && (
            <div className="field">
              <label>가캣부 아이디 연결 (선택)</label>
              <input value={editor.username} onChange={(e) => setEditor({ ...editor, username: e.target.value })} placeholder="회원이면 아이디 입력 — 가계부 자동 반영" />
            </div>
          )}
          <div className="field">
            <label>메모 <span className="small muted">({leaderName}만 열람)</span></label>
            <textarea value={editor.memo} onChange={(e) => setEditor({ ...editor, memo: e.target.value })} placeholder="총무만 볼 수 있는 메모 (선택)" />
          </div>
          {err && <p className="error">{err}</p>}
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn block" onClick={() => setEditor(null)}>취소</button>
            <button className="btn primary block" disabled={busy} onClick={save}>{busy ? '저장 중…' : editor.id ? '수정' : '추가'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
