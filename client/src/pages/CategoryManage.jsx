import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import Modal from '../components/Modal.jsx';
import EmojiField from '../components/EmojiField.jsx';
import ColorField from '../components/ColorField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { tileBg } from '../components/TransactionList.jsx';

export default function CategoryManage() {
  const { type } = useParams(); // income | expense
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [editor, setEditor] = useState(null); // null | {id?, name, emoji}

  const kind = type === 'income' ? '수입' : '지출';
  const valid = type === 'income' || type === 'expense';

  const load = useCallback(() => {
    if (!valid) return;
    db.listCategories(type).then(setCategories).catch((e) => alert(e.message));
  }, [type, valid]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const name = editor.name.trim();
    if (!name) return alert('이름을 입력하세요.');
    try {
      if (editor.id) await db.updateCategory(editor.id, { name, emoji: editor.emoji, color: editor.color });
      else await db.addCategory(user.id, type, name, editor.emoji, editor.color);
      setEditor(null); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (c) => {
    if (!confirm(`'${c.name}' 분류를 삭제할까요?`)) return;
    try { await db.deleteCategory(c.id); load(); } catch (e) { alert(e.message); }
  };

  if (!valid) return <div className="empty">잘못된 접근입니다.</div>;

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={`${kind} 분류 관리`} right={
        <button className="btn primary sm" onClick={() => setEditor({ name: '', emoji: '', color: '' })}>＋ 추가</button>
      } />

      <div className="card">
        {categories.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>분류가 없습니다.</div>
        ) : categories.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="cat-emoji" style={{ width: 28, height: 28, borderRadius: 8, background: c.color || tileBg(c.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{c.emoji || '·'}</span>
            <span className="li-main">{c.name}</span>
            <button className="btn sm ghost" onClick={() => setEditor({ id: c.id, name: c.name, emoji: c.emoji || '', color: c.color || '' })}>수정</button>
            <button className="btn sm ghost" onClick={() => del(c)} style={{ color: 'var(--expense)' }}>삭제</button>
          </div>
        ))}
      </div>

      {editor && (
        <Modal title={editor.id ? '분류 수정' : `${kind} 분류 추가`} onClose={() => setEditor(null)}>
          <EmojiField value={editor.emoji} onChange={(emoji) => setEditor({ ...editor, emoji })} />
          <ColorField value={editor.color} onChange={(color) => setEditor({ ...editor, color })} />
          <div className="field">
            <label>이름</label>
            <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder={`${kind} 분류 이름`} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
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
