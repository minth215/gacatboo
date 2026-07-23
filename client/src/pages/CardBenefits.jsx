import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon } from '../lib/format.js';
import Modal from '../components/Modal.jsx';

export default function CardBenefits() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState([]);   // 카드 원천 목록 [{id, name}]
  const [tiers, setTiers] = useState([]);
  const [editor, setEditor] = useState(null); // {sourceId, id?, threshold, benefit}

  const load = useCallback(() => {
    db.listSources().then(({ tree }) => {
      const cardTop = tree.find((t) => t.name === '카드');
      const list = [];
      if (cardTop) {
        list.push({ id: cardTop.id, name: '카드 (전체)' });
        (cardTop.children || []).forEach((c) => list.push({ id: c.id, name: c.name }));
      }
      setCards(list);
    }).catch(() => setCards([]));
    db.listCardBenefits().then(setTiers).catch(() => setTiers([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const tiersFor = (sid) => tiers.filter((t) => t.source_id === sid).sort((a, b) => a.threshold - b.threshold);

  const save = async () => {
    if (!editor.benefit.trim()) return alert('혜택 내용을 입력하세요.');
    try {
      if (editor.id) await db.updateCardTier(editor.id, editor);
      else await db.addCardTier(user.id, editor.sourceId, editor);
      setEditor(null); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (t) => {
    if (!confirm('이 실적 구간을 삭제할까요?')) return;
    try { await db.deleteCardTier(t.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/settings')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 설정</button>
      <h2 style={{ margin: '4px 2px 4px', fontSize: 20 }}>카드 실적 관리</h2>
      <p className="small muted" style={{ margin: '0 2px 14px' }}>
        원천 관리의 &lsquo;카드&rsquo; 항목별로 실적(사용액) 구간에 따른 혜택을 등록합니다. 통계의 지출 원천별 화면에서 달성 현황을 볼 수 있습니다.
      </p>

      {cards.length === 0 ? (
        <div className="empty">원천 관리에서 &lsquo;카드&rsquo; 아래에 카드를 먼저 등록하세요.</div>
      ) : cards.map((card) => (
        <div className="card" key={card.id}>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>💳 {card.name}</h3>
            <button className="btn sm primary" onClick={() => setEditor({ sourceId: card.id, threshold: '', benefit: '' })}>＋ 구간 추가</button>
          </div>
          {tiersFor(card.id).length === 0 ? (
            <div className="small muted">등록된 실적 구간이 없습니다.</div>
          ) : tiersFor(card.id).map((t) => (
            <div className="list-item" key={t.id}>
              <div className="li-main">
                <div style={{ fontWeight: 600 }}>{Number(t.threshold) > 0 ? `${fmtWon(t.threshold)} 이상` : '실적 없이'}</div>
                <div className="small muted">{t.benefit || '혜택 미입력'}</div>
              </div>
              <button className="btn sm ghost" onClick={() => setEditor({ sourceId: card.id, id: t.id, threshold: String(t.threshold), benefit: t.benefit })}>수정</button>
              <button className="btn sm ghost" style={{ color: 'var(--expense)' }} onClick={() => del(t)}>삭제</button>
            </div>
          ))}
        </div>
      ))}

      {editor && (
        <Modal title={editor.id ? '실적 구간 수정' : '실적 구간 추가'} onClose={() => setEditor(null)}>
          <div className="field">
            <label>실적 기준 <span className="small muted">(이 사용액 이상이면 혜택 적용, 0 = 실적 없이)</span></label>
            <div className="with-suffix">
              <input type="number" min="0" value={editor.threshold} onChange={(e) => setEditor({ ...editor, threshold: e.target.value })} placeholder="0" autoFocus />
              <span className="suffix">원</span>
            </div>
          </div>
          <div className="field">
            <label>혜택 내용</label>
            <input value={editor.benefit} onChange={(e) => setEditor({ ...editor, benefit: e.target.value })} placeholder="예: 커피 10% 할인 / 5천원 캐시백" onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn block" onClick={() => setEditor(null)}>취소</button>
            <button className="btn primary block" onClick={save}>{editor.id ? '수정' : '추가'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
