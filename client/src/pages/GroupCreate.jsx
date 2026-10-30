import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import { useMemberPicker, useFixedHeaderScroll } from '../components/MemberPicker.jsx';

const PALETTE = ['#EEEBFE', '#E8F4EC', '#FDEEE6', '#E6EEFD', '#FDE8EE', '#FBF1D3', '#FDE2E2'];
const STEP_LABELS = ['그룹 정보', '내 정보', '멤버 추가'];

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function GroupCreate() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [groupCats, setGroupCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
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

  // 스텝 3: 멤버 추가(그룹 상세 > 멤버 추가 페이지와 같은 구성)
  const bodyRef = useRef(null); // 단계 본문 스크롤 영역
  const [confirmOpen, setConfirmOpen] = useState(false); // 만들기 전 초대장 발송 확인 모달
  const picker = useMemberPicker({ userId: user.id });

  useEffect(() => {
    db.listGroupCategories().then((cs) => {
      setGroupCats(cs);
      setCategory((c) => c || cs[0]?.name || '');
    }).catch(() => {});
    db.listSources().then((s) => {
      setSources(s);
      // 주입금수단이 세부 항목을 가진 원천 그룹이면(그룹 자체는 선택 불가) 기본값으로 쓰지 않음
      const primary = s.flat.find((x) => x.is_primary_deposit && !s.tree.find((t) => t.id === x.id)?.children?.length);
      if (primary) setDepositSourceId(String(primary.id));
    }).catch(() => {});
  }, []);

  // 스텝 바는 항상 고정, 본문은 넘칠 때만 스크롤(바운스도 본문 안에서만)
  const bodyScrollable = useFixedHeaderScroll(bodyRef, [step]);

  // 단계가 바뀌면 이전 단계의 스크롤 위치를 이어받지 않도록 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  const step1Invalid = !name.trim() || !category;
  const nextDisabled = step === 1 && step1Invalid;

  const onBack = () => { if (step > 1) setStep(step - 1); else nav('/groups'); };

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
      const memberErrors = await picker.addAll(g.id, startDate);
      if (memberErrors.length) alert('일부 멤버를 추가하지 못했습니다.\n' + memberErrors.join('\n'));
      // 생성 화면을 상세 화면으로 바꿔치기(replace) — 상세에서 "<"를 누르면 그룹 목록으로 돌아감
      nav(`/groups/${g.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const goNext = () => {
    if (nextDisabled) return;
    if (step < 3) { setStep(step + 1); return; }
    // 초대장을 보낼 멤버가 있으면 한 번 더 확인
    if (picker.hasInvites) { setConfirmOpen(true); return; }
    submit();
  };

  return (
    // 페이지 자체는 화면 높이에 맞춰 스크롤하지 않고, 스텝 바 아래 본문만 스크롤(바운스도 본문 안에서만)
    // 높이 = 화면 - 컨테이너 위아래 여백(16×2). 위 여백 44 는 고정 상단바 자리.
    <div style={{ padding: '44px 0 0', boxSizing: 'border-box', height: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="그룹 만들기" flat onBack={onBack} right={(
        // 단계 이동은 상단바 오른쪽 버튼(이전 단계는 "<")
        <button
          type="button" onClick={goNext} disabled={nextDisabled || busy}
          // 텍스트 버튼: 비활성 회색, 활성 코랄 핑크
          style={{ height: 32, padding: '0 4px', fontFamily: 'inherit', border: 'none', background: 'transparent', color: (nextDisabled || busy) ? 'var(--k-tx-b6b2c0)' : '#FF3B5C', fontSize: 14.5, fontWeight: 800, cursor: (nextDisabled || busy) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? '만드는 중…' : step < 3 ? '다음' : '만들기'}
        </button>
      )} />

      {/* 스텝 표시(+ 멤버 추가 단계의 선택 목록·탭·검색창): 스크롤해도 상단바 아래에 고정 */}
      {/* 스텝 바(+ 멤버 추가 단계의 선택 목록·탭·검색창): 스크롤 영역 밖이라 움직이지 않음. 상단바 바로 아래(56px) */}
      <div style={{ flex: 'none', margin: '-4px -16px 0', padding: '6px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: num < 3 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', background: done || active ? '#FF3B5C' : 'var(--k-bg-efeef2)',
                  color: done || active ? '#fff' : 'var(--k-tx-a29ead)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flex: 'none',
                }}>
                  {done ? (
                    <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : num}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: done || active ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {num < 3 && <span style={{ flex: 1, height: 2, background: step > num ? '#FF3B5C' : 'var(--k-bg-efeef2)', margin: '0 6px 16px' }} />}
            </div>
          );
        })}
      </div>
          {step === 3 && <div style={{ marginTop: 18 }}>{picker.header}</div>}
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: bodyScrollable ? 'auto' : 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', margin: '0 -16px', padding: '6px 16px 16px' }}>
        {step === 1 && (
          <div>
            <div style={{ background: 'var(--k-bg-fff)', borderRadius: 20, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', padding: '24px 20px 22px', marginBottom: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ position: 'relative', width: 96, height: 96 }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 26, background: color || 'transparent', border: color ? '1.5px solid var(--k-bd-efeef2)' : 'none',
                    boxShadow: '0 3px 10px rgb(var(--k-sh) / calc(.06 * var(--k-sha)))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 38, pointerEvents: 'none',
                  }}>
                    {emoji || '💸'}
                  </div>
                  <input
                    type="text" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-1).join(''))} maxLength={2}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', textAlign: 'center', fontSize: 38, fontFamily: 'inherit', color: 'transparent', caretColor: 'var(--k-tx-191722)', background: 'transparent', border: 'none', borderRadius: 26, outline: 'none' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--k-tx-8b8798)' }}>그룹을 나타낼 이모지를 직접 입력해 주세요</div>
                </div>
              </div>

              <div style={{ height: 1, background: '#f0eee9', margin: '0 0 20px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
                <button
                  type="button" onClick={() => setColor('')}
                  style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--k-bg-fff)', border: 'none', boxShadow: color === '' ? '0 0 0 2px var(--bg), 0 0 0 4px var(--k-bd-191722)' : 'inset 0 0 0 1.2px rgba(0,0,0,.18)', cursor: 'pointer', padding: 0, position: 'relative', overflow: 'hidden' }}
                >
                  <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0 }}><line x1="6" y1="24" x2="24" y2="6" stroke="#c9455f" strokeWidth="1.3" /></svg>
                </button>
                {PALETTE.map((sw) => (
                  <button
                    type="button" key={sw} aria-label={sw} onClick={() => setColor(sw)}
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: sw, border: 'none', boxShadow: color === sw ? '0 0 0 2px var(--bg), 0 0 0 4px var(--k-bd-191722)' : 'inset 0 0 0 1px rgba(0,0,0,.07)', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>그룹 이름<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 이름 입력" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>카테고리<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
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
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>시작일자<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${startDate ? '' : ' placeholder'}`}>{startDate ? dotDate(startDate) : '날짜 선택'}</div>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>종료일자<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${endDate ? '' : ' placeholder'}`}>{endDate ? dotDate(endDate) : '날짜 선택'}</div>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>코멘트<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span></span>
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
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>닉네임<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 내에서 사용할 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} style={fieldStyle} />
            </label>

            <div style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)', marginBottom: 3 }}>{category === '공금' ? '공금 관리 수단' : '입금 수단'}<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></div>
            <div style={{ fontSize: 11, color: 'var(--k-tx-a29ead)', marginBottom: 11 }}>
              {category === '공금' ? '초대되는 멤버의 원천에 자동으로 추가됩니다' : '다른 멤버가 입금할 때 받을 원천을 선택하세요'}
            </div>
            {sources.flat.length === 0 ? (
              <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                등록된 원천이 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/sources')}>편집 ›</button>
              </div>
            ) : (
              <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
                {sources.tree.map((top, gi) => {
                  const topSelected = String(depositSourceId) === String(top.id);
                  const SourceRow = ({ src, selected, indent }) => (
                    <button
                      type="button" onClick={() => setDepositSourceId(String(src.id))}
                      style={{ width: '100%', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, padding: `13px 16px 13px ${16 + indent}px`, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: indent ? 13 : 13.25, fontWeight: indent ? 500 : 600, color: indent ? 'var(--k-tx-4a4652)' : 'var(--k-tx-191722)' }}>{src.name}</div>
                      </div>
                      <span style={{ width: 19, height: 19, borderRadius: '50%', border: `1.5px solid ${selected ? 'var(--k-bd-191722)' : 'var(--k-bd-d8d5de)'}`, background: selected ? 'var(--k-bg-191722)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--k-bg-fff)' }} />}
                      </span>
                    </button>
                  );
                  return (
                    <div key={top.id} style={{ borderTop: gi === 0 ? 'none' : '1.5px solid var(--k-divider)' }}>
                      {top.children?.length ? (
                        // 세부 항목이 있는 원천 그룹은 기록 페이지 원천 셀렉트처럼 선택 불가(제목만)
                        <div style={{ padding: '13px 16px', fontSize: 13.25, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{top.name}</div>
                      ) : (
                        <SourceRow src={top} selected={topSelected} indent={0} />
                      )}
                      {top.children?.map((c) => (
                        <div key={c.id} style={{ borderTop: '1.5px solid var(--k-divider)' }}>
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

        {step === 3 && picker.body}

        {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
      </div>

      {picker.toastEl}
      {picker.confirmModal({
        open: confirmOpen, onClose: () => setConfirmOpen(false), busy,
        onConfirm: () => { setConfirmOpen(false); submit(); }, label: busy ? '만드는 중…' : '만들기',
      })}
    </div>
  );
}
