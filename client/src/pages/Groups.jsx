import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { leaderLabel, dotDate } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';

export default function Groups() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupCats, setGroupCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [showEnded, setShowEnded] = useState(true);

  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 260); };
  const closeSearch = () => { setSearchOpen(false); setQuery(''); };
  const onSearchIcon = () => { if (searchOpen) searchRef.current?.focus(); else openSearch(); };
  const onFilterClick = () => setFilterOpen((v) => !v);

  const load = useCallback(() => {
    setLoading(true);
    db.listGroups(user.id).then(setGroups).catch(() => setGroups([])).finally(() => setLoading(false));
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { db.listGroupCategories().then(setGroupCats).catch(() => setGroupCats([])); }, []);

  const isEnded = (g) => !!(g.end_date && new Date(g.end_date) < new Date());
  const filterActive = !!filterCategory || !showEnded;

  const filteredGroups = groups
    .filter((g) => {
      if (query.trim() && !g.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (filterCategory && g.category !== filterCategory) return false;
      if (!showEnded && isEnded(g)) return false;
      return true;
    })
    .sort((a, b) => {
      const endedDiff = (isEnded(a) ? 1 : 0) - (isEnded(b) ? 1 : 0);
      if (endedDiff !== 0) return endedDiff;
      return (b.start_date || '').localeCompare(a.start_date || '');
    });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <div className="ledger-topbar">
        <div className="lt-title" style={{ opacity: searchOpen ? 0 : 1, transition: 'opacity 0.26s ease', pointerEvents: searchOpen ? 'none' : 'auto' }}>그룹</div>
        <button aria-label="필터" className={`lt-filter${filterActive ? ' on' : ''}`} onClick={onFilterClick}>
          <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 4 21 4 14 13 14 20 10 22 10 13 3 4" /></svg>
        </button>
        <div className={`lt-search${searchOpen ? ' open' : ''}`}>
          <button aria-label="검색" className="lt-search-icon" onClick={onSearchIcon}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
          </button>
          <input
            ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            placeholder="그룹 이름 검색" tabIndex={searchOpen ? 0 : -1}
          />
          {searchOpen && (
            <button aria-label="닫기" className="lt-search-close" onClick={closeSearch}>
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
            </button>
          )}
        </div>
      </div>

      {filterOpen && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, marginTop: 14, marginBottom: 10, boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
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
        <div className="empty empty-center-notabs">
          {groups.length === 0 ? '아직 참여 중인 그룹이 없습니다.' : '조건에 맞는 그룹이 없습니다.'}
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
                <span style={{ fontSize: 10.5, color: '#a29ead', flex: 'none', whiteSpace: 'nowrap' }}>
                  {g.start_date
                    ? (!g.end_date ? `${dotDate(g.start_date)} ~` : g.end_date === g.start_date ? dotDate(g.start_date) : `${dotDate(g.start_date)} ~ ${dotDate(g.end_date)}`)
                    : ''}
                </span>
              </div>
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={() => nav('/groups/new')} aria-label="그룹 만들기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}
