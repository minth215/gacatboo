import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { leaderLabel, dotDate } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';
import GroupFilterSheet from '../components/GroupFilterSheet.jsx';
import { loadPrefs } from '../lib/prefs.js';
import SwipeRow from '../components/SwipeRow.jsx';
import { InviteButton } from '../components/MemberPicker.jsx';

export default function Groups() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupCats, setGroupCats] = useState([]);
  const [loading, setLoading] = useState(true);
  // 스와이프 복사: 한 번에 한 카드만 열림 / 복사 방식 선택 모달 / 그대로 복사 진행 중
  const [openId, setOpenId] = useState(null);
  const [copyTarget, setCopyTarget] = useState(null);
  const [copying, setCopying] = useState(false);
  // 그대로 복사: 설정값을 불러와 초대장을 받을 멤버가 있으면 확인 모달(초대 여부 변경 가능), 없으면 바로 생성
  const [copyTpl, setCopyTpl] = useState(null);
  const runCopy = async (gid, tpl) => {
    setCopying(true);
    try {
      const { group, errors } = await db.copyGroup(gid, user.id, tpl);
      if (errors.length) alert('일부 멤버를 추가하지 못했습니다.\n' + errors.join('\n'));
      setCopyTarget(null); setCopyTpl(null);
      nav(`/groups/${group.id}`);
    } catch (e) { alert(e.message); } finally { setCopying(false); }
  };
  const copyAsIs = async () => {
    if (!copyTarget || copying) return;
    setCopying(true);
    let tpl;
    try { tpl = await db.groupCopyTemplate(copyTarget.id, user.id); } catch (e) { alert(e.message); setCopying(false); return; }
    setCopying(false);
    const keys = tpl.members.map((m, i) => (m.invite ? i : -1)).filter((i) => i >= 0);
    if (keys.length) { setCopyTpl({ ...tpl, inviteableKeys: keys }); return; }
    runCopy(copyTarget.id, tpl);
  };
  const toggleCopyInvite = (i) => setCopyTpl((t) => ({ ...t, members: t.members.map((m, j) => (j === i ? { ...m, invite: !m.invite } : m)) }));
  // 복사 버튼: 내가 총무/총대인 그룹만 복사 방식 선택, 아니면 바로 그룹 만들기(복사 범위 설정과 같음)
  const onCopy = (g) => {
    setOpenId(null);
    if (g.owner_id === user.id) setCopyTarget(g);
    else nav('/groups/new', { state: { copyFrom: g.id } });
  };

  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterCats, setFilterCats] = useState([]); // 선택한 카테고리(빈 배열 = 전체)
  // 종료된 그룹 표시 기본값: 설정 > 가계부 커스터마이즈(기본 숨기기)
  const [showEnded, setShowEnded] = useState(() => loadPrefs(user?.id).groupShowEnded);

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
  const filterActive = filterCats.length > 0 || showEnded !== loadPrefs(user?.id).groupShowEnded;

  const filteredGroups = groups
    .filter((g) => {
      if (query.trim() && !g.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (filterCats.length && !filterCats.includes(g.category)) return false;
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
        <GroupFilterSheet
          categories={groupCats} filterCats={filterCats} setFilterCats={setFilterCats}
          showEnded={showEnded} setShowEnded={setShowEnded} defaultShowEnded={loadPrefs(user?.id).groupShowEnded} onClose={() => setFilterOpen(false)}
        />
      )}

      {loading ? (
        <Spinner />
      ) : filteredGroups.length === 0 ? (
        <div className="empty empty-center-notabs">
          {groups.length === 0 ? '아직 참여 중인 그룹이 없습니다.' : '조건에 맞는 그룹이 없습니다.'}
        </div>
      ) : (
        filteredGroups.map((g) => (
          // 왼쪽으로 밀면 복사 버튼
          <div key={g.id} className="group-swipe">
          <SwipeRow
            onTap={() => nav(`/groups/${g.id}`)} isOpen={openId === g.id} onOpenChange={(o) => setOpenId(o ? g.id : null)} actionsWidth={60}
            actions={(progress) => (
              <div className="tx-swipe-actions" style={{ opacity: progress }}>
                <button type="button" className="settle-icon-btn" aria-label="복사" onClick={() => onCopy(g)}>
                  <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}
          >
          <div
            className="group-card"
            style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: isEnded(g) ? 0.55 : 1 }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 12, background: g.color || 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16.5, flex: 'none' }}>{g.category_emoji || '💸'}</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{g.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--k-tx-6c6779)', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: '2px 8px' }}>{g.category}</span>
                    {g.owner_id === user.id && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>{leaderLabel(g.category)}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--k-tx-a29ead)', flex: 'none', whiteSpace: 'nowrap' }}>{g.member_count} 명</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--k-tx-8b8798)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || '-'}</span>
                <span style={{ fontSize: 10.5, color: 'var(--k-tx-a29ead)', flex: 'none', whiteSpace: 'nowrap' }}>
                  {g.start_date
                    ? (!g.end_date ? `${dotDate(g.start_date)} ~` : g.end_date === g.start_date ? dotDate(g.start_date) : `${dotDate(g.start_date)} ~ ${dotDate(g.end_date)}`)
                    : ''}
                </span>
              </div>
            </div>
          </div>
          </SwipeRow>
          </div>
        ))
      )}

      {/* 복사 방식 선택(헤더 없는 모달) */}
      {copyTarget && !copyTpl && (
        <div className="catmodal-overlay" onClick={() => !copying && setCopyTarget(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" disabled={copying} onClick={copyAsIs}
                style={{ width: '100%', height: 44, border: 'none', borderRadius: 999, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)', opacity: copying ? 0.6 : 1 }}>
                {copying ? '복사 중…' : '그대로 복사'}
              </button>
              <button type="button" disabled={copying} onClick={() => { const id = copyTarget.id; setCopyTarget(null); nav('/groups/new', { state: { copyFrom: id } }); }}
                style={{ width: '100%', height: 44, border: 'none', borderRadius: 999, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', background: 'var(--k-bg-f4f2f0)', color: 'var(--k-tx-191722)' }}>
                복사 범위 설정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 그대로 복사: 초대장 발송 확인(멤버별로 보내지 않도록 변경 가능) */}
      {copyTarget && copyTpl && (
        <div className="catmodal-overlay" onClick={() => { if (!copying) { setCopyTpl(null); setCopyTarget(null); } }}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--k-tx-191722)', textAlign: 'center', padding: '6px 0 2px' }}>다음 멤버에게 초대장이 발송됩니다.</div>
            <div style={{ background: 'var(--k-bg-faf9f8)', borderRadius: 14, maxHeight: '45vh', overflowY: 'auto' }}>
              {copyTpl.members.map((m, i) => ({ m, i })).filter(({ i }) => copyTpl.inviteableKeys.includes(i)).map(({ m, i }, k) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', borderTop: k === 0 ? 'none' : '1px solid var(--k-divider)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.25, fontWeight: 600, color: m.invite ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nickname}</span>
                  <InviteButton on={m.invite} onClick={() => toggleCopyInvite(i)} />
                </div>
              ))}
            </div>
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 46, fontSize: 14 }} disabled={copying} onClick={() => runCopy(copyTarget.id, copyTpl)}>{copying ? '복사 중…' : '복사'}</button>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => nav('/groups/new')} aria-label="그룹 만들기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}
