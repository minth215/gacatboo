import { useState } from 'react';
import { db } from '../lib/db.js';
import { today, dotDate } from '../lib/format.js';

// 그룹 멤버 관리 (계정/외부 멤버 공통). owner(총무/총대)만 추가·수정·삭제.
export default function MembersPanel({ groupId, members, isOwner, leaderName, onReload }) {
  const [editor, setEditor] = useState(null); // null | {id?, nickname, start_date, end_date, contact, memo, username}
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setErr(''); setEditor({ nickname: '', start_date: today(), end_date: '', contact: '', memo: '', username: '' }); };
  const openEdit = (m) => {
    setErr('');
    setEditor({ id: m.id, nickname: m.nickname, start_date: m.start_date || '', end_date: m.end_date || '', contact: m.contact || '', memo: m.memo || '', username: m.username || '', is_account: m.is_account });
  };
  const closeModal = () => setEditor(null);

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
      closeModal(); onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (m.role === 'owner') return;
    if (!confirm(`${m.nickname}님을 그룹에서 제거할까요?`)) return;
    try { await db.removeMember(m.id); onReload(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="tx-daycard" style={{ marginTop: 14 }}>
        {members.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 8px 13px 18px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{m.nickname}</span>
                {m.role === 'owner' && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 6px' }}>{leaderName}</span>}
                {m.role !== 'owner' && !m.is_account && <span style={{ fontSize: 9, fontWeight: 700, color: '#8b8798', background: '#f4f2f0', borderRadius: 999, padding: '2px 6px' }}>외부</span>}
              </div>
              <div style={{ marginTop: 3, fontSize: 10.5, color: '#a29ead' }}>
                {m.is_account && m.username ? `@${m.username} · ` : ''}
                {m.start_date ? `${m.start_date}${m.end_date ? ` ~ ${m.end_date}` : ' ~'}` : ''}
                {m.contact ? ` · ${m.contact}` : ''}
              </div>
              {isOwner && m.memo && <div style={{ marginTop: 4, fontSize: 10.75, color: '#8b8798' }}>📝 {m.memo}</div>}
            </div>
            {isOwner && m.role !== 'owner' && (
              <>
                <button aria-label="멤버 수정" onClick={() => openEdit(m)} className="row-icon-btn sm">
                  <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button aria-label="멤버 삭제" onClick={() => remove(m)} className="row-icon-btn sm danger">
                  <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <button className="fab" onClick={openAdd} aria-label="멤버 추가">
          <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      )}

      {editor && (
        <div className="catmodal-overlay" onClick={closeModal}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>{editor.id ? '멤버 수정' : '멤버 추가'}</div>
              <button aria-label="닫기" onClick={closeModal} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>멤버 이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
              <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} placeholder="멤버 이름(닉네임)" autoFocus className="catmodal-name-input" />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>시작일자 <span style={{ color: '#FF3B5C' }}>*</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${editor.start_date ? '' : ' placeholder'}`}>{editor.start_date ? dotDate(editor.start_date) : '날짜 선택'}</div>
                  <input type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} className="catmodal-date-input" />
                </div>
              </label>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>종료일자</span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${editor.end_date ? '' : ' placeholder'}`}>{editor.end_date ? dotDate(editor.end_date) : '날짜 선택'}</div>
                  <input type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} className="catmodal-date-input" />
                </div>
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>연락처</span>
              <input value={editor.contact} onChange={(e) => setEditor({ ...editor, contact: e.target.value })} placeholder="전화번호/이메일 등" className="catmodal-name-input" />
            </label>
            {!editor.id && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>가캣부 아이디</span>
                <input value={editor.username} onChange={(e) => setEditor({ ...editor, username: e.target.value })} placeholder="회원일 경우 해당 그룹에 초대됩니다" className="catmodal-name-input" />
              </label>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>메모</span>
              <textarea rows={2} value={editor.memo} onChange={(e) => setEditor({ ...editor, memo: e.target.value })} placeholder="총무만 열람 가능합니다" className="catmodal-name-input" style={{ resize: 'none' }} />
            </label>

            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            <button className="btn-ink-pill" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      )}
    </>
  );
}
