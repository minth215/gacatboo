import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

const PALETTE = ['#EEEBFE', '#E8F4EC', '#FDEEE6', '#E6EEFD', '#FDE8EE', '#FBF1D3', '#FDE2E2'];
const STEP_LABELS = ['그룹 정보', '내 정보', '멤버 추가'];

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#faf9f8',
  border: '1.5px solid #efeef2', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function GroupCreate() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [groupCats, setGroupCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 스텝 1: 그룹 정보
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');

  // 스텝 2: 내 정보
  const [nickname, setNickname] = useState(user.display_name || '');
  const [depositSourceId, setDepositSourceId] = useState('');

  // 스텝 3: 멤버 추가
  const [friendQuery, setFriendQuery] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [customMembers, setCustomMembers] = useState([]); // [{ nickname, username }]
  const [addingCustom, setAddingCustom] = useState(false);
  const [customNickname, setCustomNickname] = useState('');
  const [customUsername, setCustomUsername] = useState('');

  useEffect(() => {
    db.listGroupCategories().then((cs) => {
      setGroupCats(cs);
      setCategory((c) => c || cs[0]?.name || '');
    }).catch(() => {});
    db.listSources().then((s) => {
      setSources(s);
      const primary = s.flat.find((x) => x.is_primary_deposit);
      if (primary) setDepositSourceId(String(primary.id));
    }).catch(() => {});
    db.listFriends().then(setFriends).catch(() => {});
  }, []);

  const step1Invalid = !name.trim() || !category;
  const nextDisabled = step === 1 && step1Invalid;

  const onBack = () => { if (step > 1) setStep(step - 1); else nav('/groups'); };
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const toggleFriend = (id) => {
    setSelectedFriendIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };
  const removeFriend = (id) => setSelectedFriendIds((ids) => ids.filter((x) => x !== id));
  const removeCustom = (idx) => setCustomMembers((ms) => ms.filter((_, i) => i !== idx));

  const openAddCustom = () => { setCustomNickname(''); setCustomUsername(''); setAddingCustom(true); };
  const saveAddCustom = () => {
    const nn = customNickname.trim();
    if (!nn) return;
    setCustomMembers((ms) => [...ms, { nickname: nn, username: customUsername.trim() }]);
    setAddingCustom(false);
  };

  const submit = async () => {
    if (step1Invalid) { setStep(1); return; }
    setError(''); setBusy(true);
    try {
      const g = await db.createGroup(user.id, {
        name: name.trim(), description: comment, category, category_emoji: emoji, color,
        start_date: startDate, end_date: endDate, nickname,
      });
      if (depositSourceId) {
        const src = sources.flat.find((s) => String(s.id) === String(depositSourceId));
        try { await db.upsertSubscription(g.id, { deposit_source_id: Number(depositSourceId), deposit_source_name: src?.name || '' }); } catch {}
      }
      const memberErrors = [];
      for (const fid of selectedFriendIds) {
        const f = friends.find((x) => x.id === fid);
        if (!f) continue;
        try {
          await db.addMember(g.id, { nickname: f.nickname, username: f.friend?.username || '', start_date: startDate, end_date: '', contact: '', memo: '' });
        } catch (e) { memberErrors.push(`${f.nickname}: ${e.message}`); }
      }
      for (const cm of customMembers) {
        try {
          await db.addMember(g.id, { nickname: cm.nickname, username: cm.username || '', start_date: startDate, end_date: '', contact: '', memo: '' });
        } catch (e) { memberErrors.push(`${cm.nickname}: ${e.message}`); }
      }
      if (memberErrors.length) alert('일부 멤버를 추가하지 못했습니다.\n' + memberErrors.join('\n'));
      nav(`/groups/${g.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const goNext = () => {
    if (nextDisabled) return;
    if (step < 3) { setStep(step + 1); return; }
    submit();
  };

  const q = friendQuery.trim().toLowerCase();
  const filteredFriends = friends.filter((f) => !q || f.nickname.toLowerCase().includes(q));
  const selectedChips = [
    ...selectedFriendIds.map((id) => ({ key: `f${id}`, name: friends.find((f) => f.id === id)?.nickname || '', onRemove: () => removeFriend(id) })),
    ...customMembers.map((m, idx) => ({ key: `c${idx}`, name: m.nickname, onRemove: () => removeCustom(idx) })),
  ];

  return (
    <div style={{ padding: '44px 0 12px', minHeight: 'calc(100vh - 44px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="그룹 만들기" flat onBack={onBack} />

      {/* 스텝 표시 */}
      <div style={{ flex: 'none', padding: '14px 0 20px', display: 'flex', alignItems: 'flex-start' }}>
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: num < 3 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', background: done || active ? '#FF3B5C' : '#efeef2',
                  color: done || active ? '#fff' : '#a29ead', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flex: 'none',
                }}>
                  {done ? (
                    <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : num}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: done || active ? '#191722' : '#a29ead', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {num < 3 && <span style={{ flex: 1, height: 2, background: step > num ? '#FF3B5C' : '#efeef2', margin: '0 6px 16px' }} />}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 24px', margin: '0 -6px' }}>
        {step === 1 && (
          <div>
            <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', padding: '24px 20px 22px', marginBottom: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ position: 'relative', width: 96, height: 96 }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 26, background: color || 'transparent', border: '1.5px solid #efeef2',
                    boxShadow: '0 3px 10px rgba(25,23,34,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 38, pointerEvents: 'none',
                  }}>
                    {emoji || '💸'}
                  </div>
                  <input
                    type="text" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-1).join(''))} maxLength={2}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', textAlign: 'center', fontSize: 38, fontFamily: 'inherit', color: 'transparent', caretColor: '#191722', background: 'transparent', border: 'none', borderRadius: 26, outline: 'none' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#8b8798' }}>그룹을 나타낼 이모지를 직접 입력해 주세요</div>
                </div>
              </div>

              <div style={{ height: 1, background: '#f0eee9', margin: '0 0 20px' }} />

              <div style={{ fontSize: 13, fontWeight: 700, color: '#191722', textAlign: 'center', marginBottom: 11 }}>배경 색</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
                <button
                  type="button" onClick={() => setColor('')}
                  style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: '#fff', border: 'none', boxShadow: color === '' ? '0 0 0 2px #fdfcfe, 0 0 0 4px #47444F' : 'inset 0 0 0 1.2px rgba(0,0,0,.18)', cursor: 'pointer', padding: 0, position: 'relative', overflow: 'hidden' }}
                >
                  <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0 }}><line x1="6" y1="24" x2="24" y2="6" stroke="#c9455f" strokeWidth="1.3" /></svg>
                </button>
                {PALETTE.map((sw) => (
                  <button
                    type="button" key={sw} aria-label={sw} onClick={() => setColor(sw)}
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: sw, border: 'none', boxShadow: color === sw ? '0 0 0 2px #fdfcfe, 0 0 0 4px #47444F' : 'inset 0 0 0 1px rgba(0,0,0,.07)', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>그룹 이름<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 이름 입력" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>카테고리<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              {groupCats.length === 0 ? (
                <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  카테고리가 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/group-categories')}>편집 ›</button>
                </div>
              ) : (
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...fieldStyle, appearance: 'none' }}>
                  {groupCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </label>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>시작일자<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${startDate ? '' : ' placeholder'}`}>{startDate ? dotDate(startDate) : '날짜 선택'}</div>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>종료일자<span style={{ fontSize: 11, fontWeight: 600, color: '#b0b0b8', marginLeft: 2 }}> 선택</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${endDate ? '' : ' placeholder'}`}>{endDate ? dotDate(endDate) : '날짜 선택'}</div>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>코멘트<span style={{ fontSize: 11, fontWeight: 600, color: '#b0b0b8', marginLeft: 2 }}> 선택</span></span>
              <textarea
                placeholder="그룹을 소개하는 한마디를 남겨 보세요" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>닉네임<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 내에서 사용할 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} style={fieldStyle} />
            </label>

            <div style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: '#191722', marginBottom: 3 }}>입금 수단<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></div>
            <div style={{ fontSize: 11, color: '#a29ead', marginBottom: 11 }}>다른 멤버가 입금할 때 받을 원천을 선택하세요</div>
            {sources.flat.length === 0 ? (
              <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                등록된 원천이 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/sources')}>편집 ›</button>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
                {sources.tree.map((top, gi) => {
                  const topSelected = String(depositSourceId) === String(top.id);
                  const SourceRow = ({ src, selected, indent }) => (
                    <button
                      type="button" onClick={() => setDepositSourceId(String(src.id))}
                      style={{ width: '100%', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, padding: `13px 16px 13px ${16 + indent}px`, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: indent ? 13 : 13.25, fontWeight: indent ? 500 : 600, color: indent ? '#4a4652' : '#191722' }}>{src.name}</div>
                      </div>
                      <span style={{ width: 19, height: 19, borderRadius: '50%', border: `1.5px solid ${selected ? '#191722' : '#d8d5de'}`, background: selected ? '#191722' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                      </span>
                    </button>
                  );
                  return (
                    <div key={top.id} style={{ borderTop: gi === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
                      <SourceRow src={top} selected={topSelected} indent={0} />
                      {top.children?.map((c) => (
                        <div key={c.id} style={{ borderTop: '1.5px solid #f2f1f5' }}>
                          <SourceRow src={c} selected={String(depositSourceId) === String(c.id)} indent={16} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            {selectedChips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                {selectedChips.map((chip) => (
                  <span key={chip.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 12px', background: '#f4f2f0', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#191722' }}>
                    {chip.name}
                    <button aria-label="제거" onClick={chip.onRemove} style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'rgba(25,23,34,.08)', color: '#6c6779', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: 'none' }}>
                      <svg width="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text" placeholder="친구 닉네임 검색" value={friendQuery} onChange={(e) => setFriendQuery(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', background: '#faf9f8', border: '1.5px solid #efeef2', borderRadius: 999, padding: '12px 16px 12px 40px', outline: 'none' }}
              />
            </div>

            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden', marginBottom: 16 }}>
              {filteredFriends.map((f, i) => {
                const selected = selectedFriendIds.includes(f.id);
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.25, fontWeight: 600, color: '#191722' }}>{f.nickname}</div>
                    </div>
                    <button
                      aria-label={selected ? '추가됨' : '추가'} onClick={() => toggleFriend(f.id)}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: selected ? '#d9f1ec' : '#f4f2f0', color: selected ? '#2e9e85' : '#8b8798', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', padding: 0 }}
                    >
                      {selected ? (
                        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      )}
                    </button>
                  </div>
                );
              })}
              {filteredFriends.length === 0 && (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12.5, color: '#a29ead' }}>검색 결과가 없어요</div>
              )}
            </div>

            <button
              type="button" onClick={openAddCustom}
              style={{ width: '100%', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, border: '1.5px dashed #c7c3cc', borderRadius: 14, background: 'transparent', color: '#6c6779', fontSize: 12.75, fontWeight: 700, cursor: 'pointer' }}
            >
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              친구 목록에 없는 멤버 추가
            </button>
          </div>
        )}

        {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
      </div>

      <div style={{ flex: 'none', padding: '14px 0 22px', display: 'flex', gap: 10 }}>
        {step > 1 && (
          <button type="button" onClick={goPrev} disabled={busy} style={{ flex: 'none', fontFamily: 'inherit', height: 52, padding: '0 20px', border: '1.5px solid #efeef2', borderRadius: 999, background: '#fff', color: '#6c6779', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            이전
          </button>
        )}
        <button
          type="button" onClick={goNext} disabled={nextDisabled || busy}
          style={{ flex: 1, fontFamily: 'inherit', height: 52, border: 'none', borderRadius: 999, background: (nextDisabled || busy) ? '#f0eef1' : '#191722', color: (nextDisabled || busy) ? '#b6b2c0' : '#fff', fontSize: 14.5, fontWeight: 700, cursor: (nextDisabled || busy) ? 'not-allowed' : 'pointer' }}
        >
          {busy ? '만드는 중…' : step < 3 ? '다음' : '만들기'}
        </button>
      </div>

      {addingCustom && (
        <div className="catmodal-overlay" onClick={() => setAddingCustom(false)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>외부 멤버 추가</div>
              <button aria-label="닫기" onClick={() => setAddingCustom(false)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <input
              type="text" placeholder="닉네임" value={customNickname} onChange={(e) => setCustomNickname(e.target.value)} autoFocus
              className="catmodal-name-input"
            />
            <input
              type="text" placeholder="아이디 입력 시 그룹에 초대됩니다" value={customUsername} onChange={(e) => setCustomUsername(e.target.value.replace(/\s/g, ''))}
              className="catmodal-name-input"
            />
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0 }} disabled={!customNickname.trim()} onClick={saveAddCustom}>
              멤버 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
