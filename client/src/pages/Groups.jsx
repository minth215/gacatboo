import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { leaderLabel, today } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

const PALETTE = ['#FDE2E2', '#FCE8D6', '#FDF0C8', '#EAF4D6', '#DFF3E3', '#D9F1EC', '#D7EEF5', '#DCE9FB', '#E1E3F7', '#E6DEF5', '#F0DEF0', '#F7DCE8', '#F3E4E4'];

export default function Groups() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupCats, setGroupCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [showEnded, setShowEnded] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    db.listGroups(user.id).then(setGroups).catch(() => setGroups([])).finally(() => setLoading(false));
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { db.listGroupCategories().then(setGroupCats).catch(() => setGroupCats([])); }, []);

  const openModal = () => {
    setForm({
      emoji: '📦', color: PALETTE[0], name: '', category: '',
      description: '', start_date: today(), end_date: '',
    });
    setError('');
    setModal(true);
  };
  const closeModal = () => setModal(false);

  const create = async () => {
    const name = form.name.trim();
    if (!name) return setError('그룹명을 입력하세요.');
    if (!form.category) return setError('카테고리를 선택하세요.');
    setBusy(true); setError('');
    try {
      const g = await db.createGroup(user.id, { ...form, name, category_emoji: form.emoji });
      setModal(false);
      nav(`/groups/${g.id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const isEnded = (g) => !!(g.end_date && new Date(g.end_date) < new Date());
  const filterActive = !!filterCategory || !showEnded;

  const filteredGroups = groups.filter((g) => {
    if (query.trim() && !g.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filterCategory && g.category !== filterCategory) return false;
    if (!showEnded && isEnded(g)) return false;
    return true;
  });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="그룹" showBack={false} right={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tb-icon-btn" onClick={() => setFilterOpen((v) => !v)} aria-label="필터" style={filterActive ? { color: 'var(--accent)' } : undefined}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="17" x2="14" y2="17" /></svg>
          </button>
          <button className="tb-icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="검색" style={searchOpen ? { color: 'var(--accent)' } : undefined}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
          </button>
        </div>
      } />

      {searchOpen && (
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="그룹 이름 검색" autoFocus
          className="catmodal-name-input" style={{ width: '100%', marginBottom: 10 }}
        />
      )}
      {filterOpen && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="catmodal-name-input" style={{ appearance: 'none' }}>
            <option value="">카테고리 전체</option>
            {groupCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 600, color: '#6c6779' }}>
            <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> 종료된 그룹 표시
          </label>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filteredGroups.length === 0 ? (
        <div className="empty">
          {groups.length === 0
            ? <>아직 참여 중인 그룹이 없습니다.<br />여행·구독·N빵 등을 그룹으로 함께 관리해 보세요.</>
            : '조건에 맞는 그룹이 없습니다.'}
        </div>
      ) : (
        filteredGroups.map((g) => (
          <div
            key={g.id} className="group-card" onClick={() => nav(`/groups/${g.id}`)}
            style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: isEnded(g) ? 0.55 : 1, filter: isEnded(g) ? 'grayscale(0.6)' : 'none' }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 12, background: g.color || '#f4f2f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16.5, flex: 'none' }}>{g.category_emoji || '📦'}</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontSize: 13.75, fontWeight: 700, color: '#191722' }}>{g.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6c6779', background: '#f4f2f0', borderRadius: 999, padding: '2px 8px' }}>{g.category}</span>
                  {g.owner_id === user.id && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>{leaderLabel(g.category)}</span>}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#a29ead', flex: 'none', whiteSpace: 'nowrap' }}>{g.member_count} 명</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#8b8798', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || '설명 없음'}</span>
                <span style={{ fontSize: 10.5, color: '#a29ead', flex: 'none', whiteSpace: 'nowrap' }}>{g.start_date ? `${g.start_date}${g.end_date ? ` ~ ${g.end_date}` : ' ~'}` : ''}</span>
              </div>
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={openModal} aria-label="그룹 만들기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {modal && form && (
        <div className="catmodal-overlay" onClick={closeModal}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>그룹 만들기</div>
              <button aria-label="닫기" onClick={closeModal} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: form.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, pointerEvents: 'none' }}>{form.emoji}</div>
                <input
                  type="text" value={form.emoji} maxLength={2} autoFocus
                  onChange={(e) => setForm({ ...form, emoji: [...e.target.value].slice(-1).join('') })}
                  className="catmodal-emoji-input"
                />
              </div>
              <input
                type="text" placeholder="그룹명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="catmodal-name-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '10px 8px' }}>
              {PALETTE.map((sw) => (
                <button
                  type="button" key={sw} aria-label={sw} onClick={() => setForm({ ...form, color: sw })}
                  className="catmodal-swatch"
                  style={{ background: sw, border: form.color === sw ? '2px solid #191722' : '1.5px solid #e4e2e6', boxShadow: form.color === sw ? '0 0 0 3px #efeef2' : 'none' }}
                />
              ))}
              <label className="catmodal-swatch catmodal-custom-swatch">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
                <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.4" strokeLinecap="round" style={{ pointerEvents: 'none' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </label>
            </div>

            {groupCats.length === 0 ? (
              <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                카테고리가 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/group-categories')}>편집 ›</button>
              </div>
            ) : (
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="catmodal-name-input" style={{ flex: 'none', appearance: 'none' }}>
                <option value="" disabled>카테고리 선택</option>
                {groupCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            )}

            <textarea
              placeholder="설명 (선택)" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="catmodal-name-input" style={{ resize: 'none' }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>시작일자</span>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="catmodal-date-input" />
              </label>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>종료일자 (선택)</span>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="catmodal-date-input" />
              </label>
            </div>

            {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
            <button className="btn-ink-pill" disabled={busy} onClick={create}>{busy ? '만드는 중…' : '만들기'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
