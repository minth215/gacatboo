import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

export default function CardBenefits() {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);   // 카드 원천 목록 [{id, name}]
  const [tiers, setTiers] = useState([]);
  const [addingCardId, setAddingCardId] = useState(null);
  const [addAmount, setAddAmount] = useState('');
  const [addBenefit, setAddBenefit] = useState('');
  const [editId, setEditId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editBenefit, setEditBenefit] = useState('');

  const load = useCallback(() => {
    db.listSources().then(({ tree }) => {
      const cardTop = tree.find((t) => t.name === '카드');
      setCards((cardTop?.children || []).map((c) => ({ id: c.id, name: c.name })));
    }).catch(() => setCards([]));
    db.listCardBenefits().then(setTiers).catch(() => setTiers([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const tiersFor = (sid) => tiers.filter((t) => t.source_id === sid).sort((a, b) => a.threshold - b.threshold);
  const onlyDigits = (v) => v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');

  const openAddTier = (cardId) => { setAddingCardId(cardId); setAddAmount(''); setAddBenefit(''); };
  const cancelAddTier = () => setAddingCardId(null);
  const saveAddTier = async (cardId) => {
    const benefit = addBenefit.trim();
    if (!benefit) { setAddingCardId(null); return; }
    try { await db.addCardTier(user.id, cardId, { threshold: addAmount || '0', benefit }); setAddingCardId(null); load(); }
    catch (e) { alert(e.message); }
  };

  const startEdit = (t) => { setEditId(t.id); setEditAmount(String(t.threshold)); setEditBenefit(t.benefit); };
  const cancelEdit = () => setEditId(null);
  const saveEdit = async (t) => {
    const benefit = editBenefit.trim();
    if (!benefit) { setEditId(null); return; }
    try { await db.updateCardTier(t.id, { threshold: editAmount || '0', benefit }); setEditId(null); load(); }
    catch (e) { alert(e.message); }
  };
  const del = async (t) => {
    if (!confirm('이 실적 구간을 삭제할까요?')) return;
    try { await db.deleteCardTier(t.id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="카드 실적 관리" flat />

      {cards.length === 0 ? (
        <div className="empty">원천 관리에서 &lsquo;카드&rsquo; 아래에 카드를 먼저 등록하세요.</div>
      ) : cards.map((card) => {
        const list = tiersFor(card.id);
        return (
          <div className="tx-daycard" style={{ marginTop: 14 }} key={card.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 14px 18px' }}>
              <span style={{ fontSize: 15, flex: 'none' }}>💳</span>
              <span style={{ flex: 1, fontSize: 13.75, fontWeight: 700, color: '#191722' }}>{card.name}</span>
              <button aria-label="실적 구간 추가" onClick={() => openAddTier(card.id)} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>

            {list.length === 0 && addingCardId !== card.id && (
              <div style={{ padding: '4px 18px 16px', fontSize: 12.5, color: '#a29ead' }}>등록된 실적 구간이 없습니다.</div>
            )}

            {list.map((t) => (
              editId === t.id ? (
                <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 12px 18px', borderTop: '1.5px solid #f2f1f5' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" inputMode="numeric" placeholder="실적 기준" value={editAmount ? Number(editAmount).toLocaleString('ko-KR') : ''}
                      onChange={(e) => setEditAmount(onlyDigits(e.target.value))} autoFocus
                      style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.75, color: '#191722', background: '#faf9f8', border: '1.5px solid #efeef2', borderRadius: 10, padding: '8px 40px 8px 11px', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: '#a29ead', pointerEvents: 'none' }}>원</span>
                  </div>
                  <input
                    type="text" placeholder="혜택" value={editBenefit} onChange={(e) => setEditBenefit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(t)}
                    style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.75, color: '#191722', background: '#faf9f8', border: '1.5px solid #efeef2', borderRadius: 10, padding: '8px 11px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="inline-cancel-btn" onClick={cancelEdit}>취소</button>
                    <button className="inline-save-btn" onClick={() => saveEdit(t)}>저장</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px 11px 18px', borderTop: '1.5px solid #f2f1f5' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.75, fontWeight: 700, color: '#191722' }}>{fmtNum(t.threshold)} 원 이상</div>
                    <div style={{ marginTop: 2, fontSize: 11.5, color: '#8b8798' }}>{t.benefit}</div>
                  </div>
                  <button aria-label="구간 수정" onClick={() => startEdit(t)} className="row-icon-btn sm">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button aria-label="구간 삭제" onClick={() => del(t)} className="row-icon-btn sm danger">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
              )
            ))}

            {addingCardId === card.id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 12px 18px', borderTop: '1.5px solid #f2f1f5' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text" inputMode="numeric" placeholder="실적 기준" value={addAmount ? Number(addAmount).toLocaleString('ko-KR') : ''}
                    onChange={(e) => setAddAmount(onlyDigits(e.target.value))} autoFocus
                    style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.75, color: '#191722', background: '#faf9f8', border: '1.5px solid #efeef2', borderRadius: 10, padding: '8px 40px 8px 11px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: '#a29ead', pointerEvents: 'none' }}>원</span>
                </div>
                <input
                  type="text" placeholder="혜택" value={addBenefit} onChange={(e) => setAddBenefit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveAddTier(card.id)}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.75, color: '#191722', background: '#faf9f8', border: '1.5px solid #efeef2', borderRadius: 10, padding: '8px 11px', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="inline-cancel-btn" onClick={cancelAddTier}>취소</button>
                  <button className="inline-save-btn" onClick={() => saveAddTier(card.id)}>저장</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
