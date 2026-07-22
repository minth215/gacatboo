import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import Modal from '../components/Modal.jsx';
import EmojiField from '../components/EmojiField.jsx';

export default function GroupCategoryManage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [editor, setEditor] = useState(null); // null | {id?, name, emoji}

  const load = useCallback(() => db.listGroupCategories().then(setCats).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const name = editor.name.trim();
    if (!name) return alert('이름을 입력하세요.');
    try {
      if (editor.id) await db.updateGroupCategory(editor.id, { name, emoji: editor.emoji });
      else await db.addGroupCategory(user.id, name, editor.emoji);
      setEditor(null); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (c) => {
    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?`)) return;
    try { await db.deleteGroupCategory(c.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/settings')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 설정</button>
      <div className="between" style={{ margin: '4px 2px 14px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>그룹 카테고리 관리</h2>
        <button className="btn primary sm" onClick={() => setEditor({ name: '', emoji: '' })}>＋ 추가</button>
      </div>
      <p className="small muted" style={{ margin: '0 2px 14px' }}>그룹을 만들 때 선택할 수 있는 카테고리 목록입니다.</p>

      <div className="card">
        {cats.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>카테고리가 없습니다.</div>
        ) : cats.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="cat-emoji">{c.emoji || '·'}</span>
            <span className="li-main">{c.name}</span>
            <button className="btn sm ghost" onClick={() => setEditor({ id: c.id, name: c.name, emoji: c.emoji || '' })}>수정</button>
            <button className="btn sm ghost" onClick={() => del(c)} style={{ color: 'var(--expense)' }}>삭제</button>
          </div>
        ))}
      </div>

      {editor && (
        <Modal title={editor.id ? '카테고리 수정' : '카테고리 추가'} onClose={() => setEditor(null)}>
          <EmojiField value={editor.emoji} onChange={(emoji) => setEditor({ ...editor, emoji })} />
          <div className="field">
            <label>이름</label>
            <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="카테고리 이름" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn block" onClick={() => setEditor(null)}>취소</button>
            <button className="btn primary block" onClick={save}>{editor.id ? '수정' : '추가'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
