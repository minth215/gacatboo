import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate, dotDateWithWeekday, fmtWon, fmtNum, renderTemplate } from '../lib/format.js';
import { resolveRecurrence, countDueDates } from '../lib/recurrence.js';
import { saveTxDraft, takeTxDraft } from '../lib/txDraft.js';
import { useFavoriteToggle } from '../lib/useFavoriteToggle.js';
import CalcAmountInput from './CalcAmountInput.jsx';
import RecurrenceModal from './RecurrenceModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';

// "반복 관리" 메뉴와 동일한 반복 아이콘(채워진 순환 화살표)
export const RepeatIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>
    <path d="M12,4V1L8,5l4,4V6c3.31,0,6,2.69,6,6c0,1.01-0.25,1.97-0.7,2.8l1.46,1.46C19.54,15.03,20,13.57,20,12C20,7.58,16.42,4,12,4z M6,12c0-1.01,0.25-1.97,0.7-2.8L5.24,7.74C4.46,8.97,4,10.43,4,12c0,4.42,3.58,8,8,8v3l4-4l-4-4v3c-3.31,0-6-2.69-6-6z" />
  </svg>
);
const RemoveIcon = () => (
  <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
);
// 즐겨찾기 등록 별 아이콘 — 미등록이면 속이 빈 옅은 회색 테두리, 등록되면 노란색으로 채워짐
export const StarIcon = ({ filled }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? '#FFC53D' : 'none'} stroke={filled ? '#FFC53D' : '#c7c3cc'} strokeWidth="1.6" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// 분류/원천에 id 는 없고 이름(스냅샷)만 있는 항목(그룹 자동기입 등)을 표시하기 위한 센티넬
const SNAP = '__snap__';

// 정산 참여 멤버 금액 균등분배: 내림으로 나누고 남는 1원 단위는 앞쪽 멤버부터 1원씩 더 받음
function equalSplitAmounts(count, total) {
  if (!count) return [];
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
// 항목 하나(행)의 참여 멤버별 금액을 계산(체크 해제된 멤버는 0, 직접 수정한 금액은 그대로 유지)
function memberRowsFor(item, members, total) {
  const checkedIds = members.filter((m) => item.memberChecked?.[m.id] !== false).map((m) => m.id);
  const shares = equalSplitAmounts(checkedIds.length, total);
  const shareOf = {};
  checkedIds.forEach((id, i) => { shareOf[id] = shares[i]; });
  return members.map((m) => {
    const checked = item.memberChecked?.[m.id] !== false;
    const override = item.memberAmountOverride?.[m.id];
    return { id: m.id, name: m.nickname, isOwner: m.role === 'owner', checked, amount: checked ? (override ?? (shareOf[m.id] || 0)) : 0 };
  });
}
const itemTotalOf = (it) => (Number(it.amount) || 0) * (Number(it.qty) || 1);
const emptyItem = () => ({
  name: '', qty: '1', amount: '', currencyMeta: null, expanded: false, memberChecked: {}, memberAmountOverride: {},
  fromSourceId: '', toSourceId: '', // 이체일 때만 사용(항목명 칸 대신 출금/입금 원천 선택)
  targetId: '', // 분류=정산일 때만 사용(항목명 칸 대신 정산 대상 선택)
});
const ArrowRightIcon = () => (
  <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12" /><polyline points="13 5 20 12 13 19" /></svg>
);

// 사진 파일을 리사이즈 후 base64(순수 데이터, data: 접두어 제외)로 변환(전송 용량 절감용).
// 가계부 페이지의 "영수증으로 기록" 버튼에서도 재사용하기 위해 export.
export async function fileToResizedBase64(file, maxSize = 1280, quality = 0.75) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  URL.revokeObjectURL(img.src);
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

// 자동완성 후보를 입력한 글자로 시작하는 것 우선 → 중간에 포함된 것 다음 순으로 정렬해
// 최대 max 개까지만 추려낸다("내용"/"항목명" 입력창 공용). 아무것도 입력하지 않았으면
// 아무 것도 추천하지 않는다.
export function rankSuggestions(list, query, max = 4) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = []; const contains = [];
  for (const s of list) {
    const low = s.toLowerCase();
    if (low === q) continue; // 이미 입력한 그대로인 건 제안할 필요 없음
    if (low.startsWith(q)) starts.push(s);
    else if (low.includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, max);
}

// 후보 문자열에서 사용자가 입력한 부분(먹색)과 나머지(회색)를 나눠 표시
function HighlightedText({ text, query }) {
  const idx = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (idx === -1) return <span style={{ color: '#a29ead' }}>{text}</span>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before && <span style={{ color: '#a29ead' }}>{before}</span>}
      <span style={{ color: '#191722' }}>{match}</span>
      {after && <span style={{ color: '#a29ead' }}>{after}</span>}
    </>
  );
}

// 입력창 바로 아래에 뜨는 자체 자동완성 드롭다운(네이티브 datalist 대신 — 모양/동작을
// 직접 제어하기 위함). mousedown 에서 preventDefault 해, 항목을 눌러도 입력창의 포커스가
// 먼저 끊기지 않게 한다(끊기면 onBlur 가 먼저 실행돼 클릭이 무시될 수 있음).
export function SuggestList({ items, query, onPick }) {
  if (!items.length) return null;
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40,
      background: '#fff', borderRadius: 12, boxShadow: '0 8px 20px rgba(25,23,34,.14)',
      border: '1px solid #f2f1f5', overflow: 'hidden',
    }}>
      {items.map((s, i) => (
        <button
          key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none',
            borderTop: i === 0 ? 'none' : '1px solid #f6f5f3',
            background: 'transparent', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
          }}
        >
          <HighlightedText text={s} query={query} />
        </button>
      ))}
    </div>
  );
}

// 입력창이 포커스돼 있을 때만 우측 끝에 보이는 작은 원형 X(지우기) 버튼. mousedown 에서
// preventDefault 해 버튼을 눌러도 입력창의 포커스(blur)가 먼저 끊기지 않게 한다.
export function ClearButton({ onClear }) {
  return (
    <button
      type="button" aria-label="지우기" onMouseDown={(e) => e.preventDefault()} onClick={onClear}
      style={{
        position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
        width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#e4e2e6', color: '#8b8798',
        padding: 0, margin: 0, flex: 'none', cursor: 'pointer', lineHeight: 0,
      }}
    >
      {/* flex 정렬 대신 버튼 기준 절대 중앙 배치(translate -50%/-50%)로 고정해, 브라우저별
          flex+svg 정렬 오차 없이 원 한가운데 정확히 오게 한다. */}
      <svg
        width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }}
      >
        <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
      </svg>
    </button>
  );
}

// 영수증형 항목 입력 행 한 줄(내용/수량(또는 회차)/금액 [+정산 그룹이면 참여 멤버 펼치기]).
// 이체(isTransfer)일 때는 항목명 칸 대신 출금/입금 원천 셀렉트 두 개 + 화살표를 두고, 수량 칸은 없다.
// 이체 출금/입금 수단 목록: 특성(group_type)이 제외 대상인 원천 그룹은 빼되(출금: 신용카드, 입금: 신용카드·
// 체크카드), 이미 선택돼 있는 값이 그 그룹에 속하면(예전 기록 수정) 그 그룹은 남겨 둔다.
function transferSources(tree, excludeTypes, selectedId) {
  return (tree || []).filter((top) => !excludeTypes.includes(top.group_type)
    || String(top.id) === String(selectedId)
    || (top.children || []).some((c) => String(c.id) === String(selectedId)));
}

function ItemRow({
  item, idx, canRemove, qtyLabel, settlementMembers, isTransfer, sources, itemNameSuggestions, onName, onQty, onAmount, onCurrencyChange, onRemove, onToggleExpand, onToggleMember, onMemberAmount, onFromSource, onToSource,
  isSettlement, recentExpenses, onTarget, usedTargetIds,
}) {
  const [nameFocused, setNameFocused] = useState(false);
  const [nameSuggestOpen, setNameSuggestOpen] = useState(false);
  // 금액 키패드에서 지금 고른 화폐(확정 전 포함) — 보조 화폐면 환산 줄 높이를 바로 확보
  const [liveCurrency, setLiveCurrency] = useState(item.currencyMeta?.input_currency || 'KRW');
  const rankedNameSuggestions = nameSuggestOpen ? rankSuggestions(itemNameSuggestions || [], item.name) : [];
  const hasSplit = !!settlementMembers?.length;
  const cols = (isTransfer || isSettlement) ? '1fr 84px 18px' : hasSplit ? '1fr 14px 46px 84px 18px' : '1fr 46px 84px 18px';
  const sourceSelectStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, color: '#191722', outline: 'none', appearance: 'none' };
  return (
    <div>
      {/* 보조 화폐로 입력한 행: 원화 환산 줄(금액 칸 아래 작은 회색 글씨)이 들어갈 높이를 아래쪽에 더 확보 —
          내용/수량/보조 화폐 금액은 같은 줄에 그대로 정렬되고, 환산 줄만 그 아래에 놓인다 */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: liveCurrency !== 'KRW' ? '5px 0 21px' : '5px 0' }}>
        {isTransfer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <select id="transfer-from-source-select" value={item.fromSourceId} onChange={(e) => onFromSource(e.target.value)} style={sourceSelectStyle}>
              <option value="">출금 수단 선택</option>
              {transferSources(sources, ['credit'], item.fromSourceId).map((top) => (
                top.children?.length ? (
                  <optgroup key={top.id} label={top.name}>
                    {String(item.fromSourceId) === String(top.id) && <option value={top.id}>{top.name}</option>}
                    {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={top.id} value={top.id}>{top.name}</option>
                )
              ))}
            </select>
            <span style={{ flex: 'none', color: '#c7c3cc', display: 'flex' }}><ArrowRightIcon /></span>
            <select id="transfer-to-source-select" value={item.toSourceId} onChange={(e) => onToSource(e.target.value)} style={sourceSelectStyle}>
              <option value="">입금 수단 선택</option>
              {transferSources(sources, ['credit', 'check'], item.toSourceId).map((top) => (
                top.children?.length ? (
                  <optgroup key={top.id} label={top.name}>
                    {String(item.toSourceId) === String(top.id) && <option value={top.id}>{top.name}</option>}
                    {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={top.id} value={top.id}>{top.name}</option>
                )
              ))}
            </select>
          </div>
        ) : isSettlement ? (
          <div style={{ position: 'relative', minWidth: 0 }}>
            {/* 실제 select 를 평범한 흐름으로 그대로 두어(항목명 input 과 똑같은 네이티브 폼 컨트롤이라
                둘의 세로 높이가 자연스럽게 일치함), 글자만 투명하게 지우고 그 위에 원하는 모양의
                라벨을 겹쳐서 보여준다(열었을 때 보이는 옵션 목록 글자는 각 option 에 색을 직접 줘서
                select 자체의 color:transparent 를 상속받지 않게 함). */}
            <select
              value={item.targetId} onChange={(e) => onTarget(e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: 'transparent', outline: 'none', minWidth: 0, appearance: 'none' }}
            >
              <option value="" style={{ color: '#191722' }}>정산 대상 선택</option>
              {recentExpenses.filter((x) => !usedTargetIds?.has(String(x.id)) || String(x.id) === item.targetId).map((x) => (
                <option key={x.id} value={x.id} style={{ color: '#191722' }}>{x.date.slice(5).replace('-', '.')} {x.category_emoji || ''} {x.content || x.category_name || '지출'} ({fmtWon(x.amount)})</option>
              ))}
            </select>
            {(() => {
              const picked = recentExpenses.find((x) => String(x.id) === item.targetId);
              const label = picked ? `${picked.category_emoji ? `${picked.category_emoji} ` : ''}${picked.content || picked.category_name || '지출'}` : '';
              return (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', fontSize: 13.5, color: label ? '#191722' : '#a29ead', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                  {label || '정산 대상 선택'}
                </span>
              );
            })()}
          </div>
        ) : (
          <div style={{ position: 'relative', minWidth: 0 }}>
            <input
              type="text" placeholder="항목 기입" value={item.name}
              onChange={(e) => { onName(e.target.value); setNameSuggestOpen(true); }}
              onFocus={() => { setNameFocused(true); setNameSuggestOpen(true); }}
              onBlur={() => { setNameFocused(false); setNameSuggestOpen(false); }}
              autoComplete="off"
              style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', outline: 'none', minWidth: 0, padding: nameFocused && item.name ? '0 22px 0 0' : 0 }}
            />
            {nameFocused && item.name && <ClearButton onClear={() => onName('')} />}
            <SuggestList items={rankedNameSuggestions} query={item.name} onPick={(s) => { onName(s); setNameSuggestOpen(false); }} />
          </div>
        )}
        {hasSplit && (
          <button
            type="button" aria-label="참여 멤버 펼치기" onClick={onToggleExpand}
            style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: '#8b8798', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: item.expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        )}
        {!isTransfer && !isSettlement && (
          <input
            type="text" inputMode="numeric" placeholder="1" value={item.qty} onChange={(e) => onQty(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', outline: 'none', textAlign: 'center', minWidth: 0 }}
          />
        )}
        <CalcAmountInput
          compact value={item.amount} onChange={onAmount}
          initialCurrency={item.currencyMeta?.input_currency} initialForeignAmount={item.currencyMeta?.input_amount}
          onCurrencyChange={onCurrencyChange} onCurrencySelect={setLiveCurrency}
        />
        {canRemove ? (
          <button type="button" aria-label="행 삭제" onClick={onRemove} style={{ width: 18, height: 18, border: 'none', background: 'transparent', color: '#c2bfc6', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RemoveIcon />
          </button>
        ) : <span />}
      </div>
      {hasSplit && item.expanded && (
        <div style={{ padding: '2px 0 6px 14px' }}>
          {memberRowsFor(item, settlementMembers, itemTotalOf(item)).map((m) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '2px 0' }}>
              <span style={{ gridColumn: '1 / span 3', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 11.5, color: '#6c6779' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {m.isOwner && <span style={{ flex: 'none', fontSize: 8, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '1px 6px' }}>총무</span>}
              </span>
              <input
                type="text" inputMode="numeric" disabled={!m.checked}
                value={m.checked ? Number(m.amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => onMemberAmount(m.id, e.target.value.replace(/[^0-9]/g, ''))}
                style={{ gridColumn: 4, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 11.5, color: '#8b8798', textAlign: 'right', outline: 'none', minWidth: 0, padding: 0, opacity: m.checked ? 1 : 0.4 }}
              />
              <input
                type="checkbox" checked={m.checked} onChange={() => onToggleMember(m.id)}
                style={{ gridColumn: 5, width: 14, height: 14, cursor: 'pointer', justifySelf: 'center', accentColor: '#6c6779' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 수입/지출 항목 작성·수정 폼(영수증형: 대표 내용 + 항목별 행 + 합계). groupId 지정 시 그룹 항목으로 저장.
// fixedType 지정 시 수입/지출 토글을 숨기고 해당 유형으로 고정(예: 그룹 결제=지출).
// defaultCategoryName 지정 시 신규 작성 때 해당 이름의 분류를 기본 선택.
// defaultAmount 지정 시 신규 작성 때 항목 금액을 이 값으로 자동 채움(예: 그룹 결제 → 정기결제금액).
// defaultContentTemplate 지정 시 신규 작성 때 "내용"을 이 템플릿({연}/{월}/{일} 변수 지원)으로 자동 채우고,
// 날짜를 바꾸면 그 날짜 기준으로 다시 채워짐.
// onSubmit 지정 시 db.saveTransaction 대신 이 함수로 저장을 위임(그룹 결제 등 별도 저장 로직).
// qtyLabel: 항목 표의 수량 칸 라벨(기본 "수량", 구독 그룹 결제는 "회차").
// settlementMembers 지정 시(정산 그룹 결제 내역) 각 항목 행에 참여 멤버 펼치기가 생기고, 기본 전원
// 체크·균등분배되며 체크 해제/금액 직접 수정이 가능하다. 저장 시 모든 항목의 합산액이 멤버별로 저장된다.
// initialSettlementSplit 은 기존 저장된 분담 내역([{member_id, amount}])으로, 수정 화면에서 비동기로
// 나중에 도착해도(아직 undefined 인 동안은 초기화를 기다림) 첫 번째 항목 행에 반영된다.
// groupBadge 지정 시({name, color}) 내용 입력 아래에 그룹 배지가 뜬다.
// initialLinkedFee 는 이체 기록에 연결된 수수료 지출 기록(수정 화면에서 비동기로 나중에 도착해도
// 반영됨, undefined=아직 조회 전·null=없음).
const TransactionForm = forwardRef(function TransactionForm({
  initial, groupId, onSaved, onClose, fixedType, defaultCategoryName, defaultAmount, defaultContentTemplate,
  onSubmit, topNotice, showPeriods, onScanBusyChange, initialPendingRecurrence,
  settlementMembers, initialSettlementSplit, qtyLabel = '수량', groupBadge, initialLinkedFee, defaultTransferToName,
  fixedSourceName, transferMembers, defaultTransferMemberId, autoReceiptBase64, autoReceiptMime, autoToast, onDelete,
  // templateMode: 반복 규칙(반복으로 등록될 내용) 수정 화면 — 즐겨찾기 별·반복 아이콘을 숨김
  templateMode = false,
  // periodField: 날짜 칸 대신 보여줄 노드(반복 수정 화면의 "반복 주기")
  periodField = null,
}, ref) {
  const { user } = useAuth();
  const nav = useNavigate();
  const editing = !!initial?.id;
  // 분류/원천 "편집"으로 설정 페이지에 다녀올 때 작성 중이던 내용을 복원하기 위한 구분 키
  const draftSlot = initial?.id ? `tx:${initial.id}` : (groupId ? `g:${groupId}` : 'new');
  const [type, setType] = useState(fixedType || initial?.type || 'expense');
  const [date, setDate] = useState(initial?.date || today());
  const [periods] = useState(initial?.periods ? String(initial.periods) : '1');
  // 구독 그룹 결제(showPeriods): 항목 표의 둘째 칸이 "회차" — 입금 내역과 같은 규칙으로, 금액에 곱하지 않고
  // 금액을 정기결제금액으로 나눈 값을 자동으로 채운다(직접 수정 가능). 합계는 금액 그대로, 저장 회차는 행 회차 합.
  const qtyIsPeriods = !!showPeriods;
  const lineTotal = (it) => (qtyIsPeriods ? (Number(it.amount) || 0) : itemTotalOf(it));
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ? String(initial.category_id) : (initial?.category_name ? SNAP : '')
  );
  const [sourceId, setSourceId] = useState(
    initial?.source_id ? String(initial.source_id) : (initial?.source_name ? SNAP : '')
  );
  // 보조 화폐로 입력했던 기록: 항목별로 저장된 화폐 정보(items[].input_currency…)를 복원하고, 항목별 정보가
  // 없는 예전 기록은 기록 단위로 저장된 값(initial.input_currency…)을 해당 항목(금액이 맞는 항목, 없으면 첫 항목)에 붙인다.
  const recordCurrencyMeta = initial?.input_currency
    ? { input_currency: initial.input_currency, input_amount: initial.input_amount != null ? Number(initial.input_amount) : null, fx_rate: initial.fx_rate != null ? Number(initial.fx_rate) : null }
    : null;
  const itemCurrencyMeta = (it) => (it?.input_currency
    ? { input_currency: it.input_currency, input_amount: it.input_amount != null ? Number(it.input_amount) : null, fx_rate: it.fx_rate != null ? Number(it.fx_rate) : null }
    : null);
  const [items, setItems] = useState(() => (
    (fixedType || initial?.type) === 'transfer'
      ? [{ ...emptyItem(), currencyMeta: recordCurrencyMeta, amount: initial?.amount ? String(initial.amount) : '', fromSourceId: initial?.source_id ? String(initial.source_id) : '', toSourceId: initial?.to_source_id ? String(initial.to_source_id) : '' }]
      // 분류=정산: 정산 대상을 여러 건 담은 기록은 items[].targetId 로 행을 복원하고, 그 외에는
      // settlement_target_id 컬럼이 기준값(과거 한때 빈 이름의 항목이 잘못 같이 저장된 적이 있어도 무시).
      : (initial?.category_name === '정산' && Array.isArray(initial?.items) && initial.items.some((it) => it?.targetId != null))
        ? initial.items.filter((it) => it?.targetId != null).map((it) => ({ ...emptyItem(), targetId: String(it.targetId), amount: it.amount ? String(it.amount) : '' }))
      : (Array.isArray(initial?.items) && initial.items.length && initial?.category_name !== '정산')
        ? (() => {
          const rows = initial.items.map((it) => ({ ...emptyItem(), name: it.name || '', qty: String(it.qty || 1), amount: it.amount ? String(it.amount) : '', currencyMeta: itemCurrencyMeta(it) }));
          if (recordCurrencyMeta && !rows.some((r) => r.currencyMeta)) {
            const target = recordCurrencyMeta.input_amount != null && recordCurrencyMeta.fx_rate
              ? rows.findIndex((r) => Math.round(recordCurrencyMeta.input_amount * recordCurrencyMeta.fx_rate) === Number(r.amount))
              : -1;
            rows[target >= 0 ? target : 0].currencyMeta = recordCurrencyMeta;
          }
          return rows;
        })()
        : [{ ...emptyItem(), qty: (showPeriods && initial?.periods) ? String(initial.periods) : '1', currencyMeta: (initial?.category_name === '정산') ? null : recordCurrencyMeta, amount: initial?.amount ? String(initial.amount) : (defaultAmount ? String(defaultAmount) : ''), targetId: initial?.settlement_target_id ? String(initial.settlement_target_id) : '' }]
  ));
  const [contentOverride, setContentOverride] = useState(initial?.content ?? null);
  const [contentFocused, setContentFocused] = useState(false);
  const [memo, setMemo] = useState(initial?.memo || '');
  const memoRef = useRef(null);
  // 이체 멤버 선택(transferMembers 지정 시, 예: 공금 그룹 이체 내역). 기본값은 본인이지만
  // "선택 안 함" 없이 항상 누군가로 채워지고, 다른 멤버로 바꿀 수 있다(총무만 전체 멤버 선택 가능).
  const [transferMemberId, setTransferMemberId] = useState(
    initial?.member_id ? String(initial.member_id) : (defaultTransferMemberId ? String(defaultTransferMemberId) : '')
  );
  useEffect(() => {
    if (transferMemberId || !defaultTransferMemberId) return;
    setTransferMemberId(String(defaultTransferMemberId));
  }, [defaultTransferMemberId, transferMemberId]);
  // 이체 수수료(연결된 지출 기록, 한 번만 추가 가능)
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feeName, setFeeName] = useState('수수료');
  const [feeAmount, setFeeAmount] = useState('');
  const feeInitRef = useRef(false);
  // 반복 설정: 이미 저장된 반복(recurringId)이거나, 아직 저장 전인 선택값(pendingRecurrence) 중 하나만 있을 수 있음
  const [recurringId, setRecurringId] = useState(initial?.recurring?.id || null);
  const [recurringLabel, setRecurringLabel] = useState(initial?.recurring?.label || '');
  const [pendingRecurrence, setPendingRecurrence] = useState(initialPendingRecurrence || null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [backfillPrompt, setBackfillPrompt] = useState(null); // { n, resolve } | null
  const askBackfill = (n) => new Promise((resolve) => setBackfillPrompt({ n, resolve }));

  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourcesFlat, setSourcesFlat] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [contentSuggestions, setContentSuggestions] = useState([]);
  const [contentSuggestOpen, setContentSuggestOpen] = useState(false);
  const [itemNameSuggestions, setItemNameSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const toastTimer = useRef(null);
  const categorySelectRef = useRef(null);
  const sourceSelectRef = useRef(null);
  const contentInputRef = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    setToastKey((k) => k + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  // 즐겨찾기 선택/복사로 넘어왔을 때(부모가 location.state.toast 로 넘겨줌) 한 번만 토스트 표시
  useEffect(() => {
    if (autoToast) showToast(autoToast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 필수 선택 칸(분류/원천)을 비워 둔 채 저장하려 할 때: 토스트로 안내하고 해당 셀렉트박스를 바로 열어줌
  const promptRequiredSelect = (refOrId, msg) => {
    showToast(msg);
    const el = typeof refOrId === 'string' ? document.getElementById(refOrId) : refOrId.current;
    el?.focus();
    try { el?.showPicker?.(); } catch {}
  };
  // 분류/원천 셀렉트박스의 "편집" 선택 시: 지금 작성 중인 내용을 기기에 저장해 두고 설정의
  // 관리 페이지로 이동. 그 페이지의 "<" 뒤로가기로 돌아오면 아래 복원 useEffect 가 그대로 되살림.
  const draftAppliedRef = useRef(false);
  const saveDraftAndGo = (path) => {
    saveTxDraft(draftSlot, { type, date, categoryId, sourceId, items, contentOverride, memo, transferMemberId, pendingRecurrence });
    nav(path);
  };
  useEffect(() => {
    if (draftAppliedRef.current) return;
    draftAppliedRef.current = true;
    const d = takeTxDraft(draftSlot);
    if (!d) return;
    if (d.type) setType(d.type);
    if (d.date) setDate(d.date);
    setCategoryId(d.categoryId ?? '');
    setSourceId(d.sourceId ?? '');
    if (Array.isArray(d.items)) setItems(d.items);
    setContentOverride(d.contentOverride ?? null);
    setMemo(d.memo ?? '');
    if (d.transferMemberId) setTransferMemberId(d.transferMemberId);
    if (d.pendingRecurrence) setPendingRecurrence(d.pendingRecurrence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const handleDelete = async () => {
    if (deleteBusy || !onDelete) return;
    if (!confirm('이 기록을 삭제할까요?')) return;
    setDeleteBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err.message);
      setDeleteBusy(false);
    }
  };
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const receiptInputRef = useRef(null);

  useImperativeHandle(ref, () => ({ openReceiptPicker: () => receiptInputRef.current?.click() }), []);
  useEffect(() => { onScanBusyChange?.(scanBusy); }, [scanBusy]);

  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  useEffect(() => {
    db.listCategories().then((cs) => {
      setCategories(cs);
      // 신규 작성 시 기본 분류 자동 선택(예: 그룹 결제 → '구독')
      if (!editing && !categoryId && defaultCategoryName) {
        const c = cs.find((x) => x.type === (fixedType || type) && x.name === defaultCategoryName);
        if (c) setCategoryId(String(c.id));
      }
    }).catch(() => {}).finally(() => setCategoriesLoaded(true));
    db.listSources().then(({ tree, flat }) => { setSources(tree); setSourcesFlat(flat); }).catch(() => {});
    db.listRecentExpenses(user.id, { includeId: [initial?.settlement_target_id, ...(Array.isArray(initial?.items) ? initial.items.map((it) => it?.targetId) : [])].filter((v) => v != null) }).then(setRecentExpenses).catch(() => {});
    db.listItemNameSuggestions(user.id).then(setItemNameSuggestions).catch(() => {});
    db.listContentSuggestions(user.id).then(setContentSuggestions).catch(() => {});
  }, []);

  // 분류/원천이 id 없이 이름만 저장된 기록(반복 자동 생성, 그룹 결제 미러 등): 같은 이름의 분류/원천이
  // 지금 목록에 있으면 그 항목으로 바로 선택해, "(기존)" 표시 없이 일반 선택값처럼 보이게 한다.
  useEffect(() => {
    if (categoryId !== SNAP || !categories.length) return;
    const t = fixedType || type;
    const c = categories.find((x) => x.type === t && x.name === initial?.category_name);
    if (c) setCategoryId(String(c.id));
  }, [categories]);
  useEffect(() => {
    if (sourceId !== SNAP || !sourcesFlat.length) return;
    const s = sourcesFlat.find((x) => x.name === initial?.source_name);
    if (s) setSourceId(String(s.id));
  }, [sourcesFlat]);

  // 신규 작성 시 "내용" 기본값 템플릿 적용(비동기로 나중에 도착해도 반영)
  // 항목(내용/수량/금액 표)의 첫 행 이름도 같은 값으로 채움(항목명을 직접 건드리기 전, 항목이 하나일 때만.
  // 이체는 항목 칸이 출금/입금 원천이라 제외, 분류가 정산이면 항목 칸이 정산 대상 셀렉트라 이름은 쓰이지 않음)
  const fillFirstItemName = (v) => {
    if ((fixedType || type) === 'transfer') return;
    setItems((prev) => ((prev.length === 1 && !itemNameTouchedRef.current) ? [{ ...prev[0], name: v }] : prev));
  };
  useEffect(() => {
    if (!editing && contentOverride == null && defaultContentTemplate) {
      const v = renderTemplate(defaultContentTemplate, date);
      setContentOverride(v);
      fillFirstItemName(v);
    }
  }, [defaultContentTemplate]);

  // 신규 작성 시 금액 기본값(예: 구독 그룹 결제 → 정기결제금액) 적용(비동기로 나중에 도착해도 반영).
  // 아직 아무것도 입력 안 한 첫 항목 하나뿐일 때만 채운다(사용자가 이미 입력했으면 덮어쓰지 않음).
  useEffect(() => {
    if (editing || !defaultAmount) return;
    setItems((prev) => (prev.length === 1 && !prev[0].name && !prev[0].amount)
      ? [{ ...prev[0], amount: String(defaultAmount) }] : prev);
  }, [defaultAmount]);

  // 신규 작성 시 원천 기본값: 지출은 주결제수단, 수입은 주입금수단(원천 관리에서 지정한 것)
  useEffect(() => {
    if (editing || sourceId || type === 'transfer') return;
    const key = type === 'expense' ? 'is_primary_payment' : 'is_primary_deposit';
    const s = sourcesFlat.find((x) => x[key]);
    if (s) setSourceId(String(s.id));
  }, [editing, type, sourcesFlat]);

  // 메모가 바뀌면(사용자 입력/영수증 인식 등) 높이를 내용에 맞게 늘림
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [memo]);

  const onDateChange = (v) => {
    setDate(v);
    if (!editing && defaultContentTemplate) {
      const c = renderTemplate(defaultContentTemplate, v);
      setContentOverride(c);
      fillFirstItemName(c);
    }
  };

  // 반복 아이콘 클릭: 이미 저장된 반복이면 해제 확인, 선택만 해둔 상태면 선택 취소, 둘 다 아니면 모달을 띄움
  const onRecurrenceIconClick = async () => {
    if (recurringId) {
      if (!confirm(`'${recurringLabel || '반복'}' 설정을 해제할까요? (이미 기록된 내역은 그대로 남습니다)`)) return;
      try { await db.deleteRecurringRule(recurringId); setRecurringId(null); setRecurringLabel(''); } catch (err) { alert(err.message); }
      return;
    }
    if (pendingRecurrence) { setPendingRecurrence(null); return; }
    setShowRecurrenceModal(true);
  };

  // 항목 행 조작
  const updateItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  // 대표 "내용"에 먼저 입력하면 첫 번째 항목명이 아직 비어 있는 동안은 그 값을 그대로 따라가다가,
  // 항목명을 직접 건드리는 순간부터는 더 이상 따라가지 않는다. 처음부터 항목명이 이미 채워져
  // 있었던 경우(수정 화면 등)는 "입력 안 한 상태"가 아니므로 애초에 따라가지 않게 한다.
  const itemNameTouchedRef = useRef(!!items[0]?.name);
  const onItemNameChange = (idx, v) => {
    if (idx === 0) itemNameTouchedRef.current = true;
    updateItem(idx, { name: v });
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const toggleItemExpand = (idx) => updateItem(idx, { expanded: !items[idx].expanded });
  const toggleItemMember = (idx, memberId) => setItems((prev) => prev.map((it, i) => {
    if (i !== idx) return it;
    const checked = it.memberChecked?.[memberId] !== false;
    const memberAmountOverride = { ...it.memberAmountOverride };
    delete memberAmountOverride[memberId]; // 체크 상태가 바뀌면 직접 수정한 금액은 초기화(자동 재계산)
    return { ...it, memberChecked: { ...it.memberChecked, [memberId]: !checked }, memberAmountOverride };
  }));
  const setItemMemberAmount = (idx, memberId, v) => updateItem(idx, {
    memberAmountOverride: { ...items[idx].memberAmountOverride, [memberId]: Math.max(0, Number(v) || 0) },
  });

  // 영수증 사진(base64) → Gemini 로 날짜/금액/상호명/분류 추출 → 폼에 제안값으로 채움(항상 사용자가
  // 확인 후 저장). 폼 안의 "영수증으로 채우기" 버튼과, 가계부 페이지의 촬영 버튼(아래 자동 실행
  // effect)이 공용으로 쓴다.
  const runReceiptScan = async (base64, mimeType) => {
    setScanError('');
    setScanBusy(true);
    try {
      const expenseCategoryNames = categories.filter((c) => c.type === 'expense').map((c) => c.name);
      const result = await db.parseReceipt(base64, mimeType, expenseCategoryNames);
      if (!fixedType) setType('expense');
      if (result.date) onDateChange(result.date);
      if (result.merchant) setContentOverride(result.merchant);
      if (result.category) {
        const c = categories.find((x) => x.type === 'expense' && x.name === result.category);
        if (c) setCategoryId(String(c.id));
      }
      // 구매 품목을 항목 행에 하나씩 채워줌(수량이 따로 적혀 있지 않으면 1).
      // 품목을 구분 못 했을 때만 총액 하나로 채운다.
      if (Array.isArray(result.items) && result.items.length) {
        setItems(result.items.map((it) => ({ ...emptyItem(), name: it.name || '', qty: String(it.qty || 1), amount: String(it.amount || '') })));
      } else if (result.amount) {
        updateItem(0, { amount: String(result.amount) });
      }
      if (!result.date && !result.amount && !result.merchant && !result.category) {
        setScanError('영수증에서 정보를 인식하지 못했어요. 직접 입력해 주세요.');
      }
    } catch (err) {
      setScanError(err.message || '영수증 인식에 실패했습니다.');
    } finally {
      setScanBusy(false);
    }
  };

  const onReceiptFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { base64, mimeType } = await fileToResizedBase64(file);
    await runReceiptScan(base64, mimeType);
  };

  // 가계부 페이지의 촬영 버튼으로 사진을 먼저 고르고 이 화면으로 넘어온 경우: 분류 목록이
  // 도착하는 즉시(인식 결과의 분류 매칭에 필요) 한 번만 자동으로 영수증 인식을 실행한다.
  const autoScanRef = useRef(false);
  useEffect(() => {
    if (autoScanRef.current || !autoReceiptBase64 || !categoriesLoaded) return;
    autoScanRef.current = true;
    runReceiptScan(autoReceiptBase64, autoReceiptMime || 'image/jpeg');
  }, [autoReceiptBase64, categoriesLoaded]);

  const catOptions = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const selCategory = categories.find((c) => String(c.id) === String(categoryId));
  const isSettlement = type === 'income' && selCategory?.name === '정산';
  // 이미 다른 행에서 고른 정산 대상은 중복 선택되지 않게 각 행의 선택지에서 뺀다(그 행 자신의
  // 현재 선택값은 예외 — ItemRow 쪽에서 처리).
  const usedSettlementTargetIds = useMemo(
    () => new Set(items.filter((it) => it.targetId).map((it) => String(it.targetId))),
    [items]
  );
  // 정산 대상을 고르면 그 지출 금액을 기본값으로 채워 주되(바로 수정 가능), 선택을 지우면 건드리지 않음.
  // 행마다 각자의 정산 대상을 고를 수 있어(여러 건을 한 번에 입력), idx 로 해당 항목만 갱신한다.
  const onItemTargetChange = (idx, value) => {
    const x = recentExpenses.find((e) => String(e.id) === value);
    updateItem(idx, { targetId: value, ...(x ? { amount: String(x.amount) } : {}) });
  };
  const isTransfer = type === 'transfer';
  // 카드 실적 포함/제외: 고른 원천이 "신용카드"·"체크카드" 원천 그룹(또는 그 하위)일 때만 선택(기본 포함)
  const [excludePerformance, setExcludePerformance] = useState(!!initial?.exclude_performance);
  const selectedSourceTop = sources.find((top) => String(top.id) === String(sourceId) || (top.children || []).some((c) => String(c.id) === String(sourceId)));
  const showPerformance = !isTransfer && !fixedSourceName && (selectedSourceTop?.group_type === 'credit' || selectedSourceTop?.group_type === 'check');
  const transferFromName = sourcesFlat.find((s) => String(s.id) === items[0]?.fromSourceId)?.name || '';
  const transferToName = sourcesFlat.find((s) => String(s.id) === items[0]?.toSourceId)?.name || '';

  // 이체 출금/입금 선택을 이름으로 복원(id 가 아니라 이름만 아는 호출자용, 예: 공금 그룹 이체
  // 내역 — 출금은 initial.source_name, 입금은 initial.to_source_name 또는 defaultTransferToName
  // 중 먼저 매칭되는 쪽을 쓴다). 일반 개인 이체(수정)는 이미 id로 채워져 있어 아무 동작 안 함.
  useEffect(() => {
    if (!isTransfer || !sourcesFlat.length) return;
    setItems((prev) => {
      if (prev.length !== 1) return prev;
      const cur = prev[0];
      const patch = {};
      if (!cur.fromSourceId && initial?.source_name) {
        const s = sourcesFlat.find((x) => x.name === initial.source_name);
        if (s) patch.fromSourceId = String(s.id);
      }
      if (!cur.toSourceId) {
        const name = initial?.to_source_name || defaultTransferToName;
        if (name) { const s = sourcesFlat.find((x) => x.name === name); if (s) patch.toSourceId = String(s.id); }
      }
      return Object.keys(patch).length ? [{ ...cur, ...patch }] : prev;
    });
  }, [isTransfer, sourcesFlat, initial, defaultTransferToName]);

  // 수정 화면: 이체에 연결된 수수료 기록이 이미 있으면 그대로 복원(비동기로 나중에 도착해도 반영)
  useEffect(() => {
    if (feeInitRef.current || !isTransfer) return;
    if (editing && initialLinkedFee === undefined) return; // 아직 조회 전
    feeInitRef.current = true;
    if (initialLinkedFee) {
      setFeeEnabled(true);
      setFeeName(initialLinkedFee.content || '수수료');
      setFeeAmount(initialLinkedFee.amount ? String(initialLinkedFee.amount) : '');
    }
  }, [isTransfer, editing, initialLinkedFee]);

  // 정산 그룹 결제 내역: 항목 행마다 참여 멤버 펼치기 + 멤버별 분담액(균등분배가 기본, 직접 수정 가능)
  const showMemberSplit = !!settlementMembers?.length && type === 'expense';
  const splitInitRef = useRef(false);
  useEffect(() => {
    if (splitInitRef.current) return;
    if (!showMemberSplit) return;
    if (editing && initialSettlementSplit === undefined) return; // 수정 화면: 기존 분담 내역 도착 대기
    splitInitRef.current = true;
    // 항목별로 체크된 멤버가 저장돼 있으면(initial.items[i].members) 그 항목의 체크 상태를 그대로
    // 복원한다. items 는 로드 시 그대로 state 로 들어가 있어 순서/개수가 initial.items 와 같다.
    const hasPerItemSplit = editing && Array.isArray(initial?.items) && initial.items.some((it) => Array.isArray(it.members));
    if (hasPerItemSplit) {
      setItems((prev) => prev.map((it, i) => {
        const saved = initial.items[i];
        if (!saved || !Array.isArray(saved.members)) return it;
        const memberChecked = {}; const memberAmountOverride = {};
        const checkedIds = new Set(saved.members.map((r) => r.member_id));
        for (const m of settlementMembers) memberChecked[m.id] = checkedIds.has(m.id);
        for (const r of saved.members) memberAmountOverride[r.member_id] = Number(r.amount);
        return { ...it, memberChecked, memberAmountOverride };
      }));
      return;
    }
    if (!initialSettlementSplit?.length) return; // 신규이거나 저장된 분담이 없으면 기본값(전원 체크) 유지
    // 이 기능 이전에 저장된 기록(항목별 체크 정보가 없음): 기존처럼 첫 행에만 전체 분담을 복원
    const memberChecked = {}; const memberAmountOverride = {};
    const checkedIds = new Set(initialSettlementSplit.map((r) => r.member_id));
    for (const m of settlementMembers) memberChecked[m.id] = checkedIds.has(m.id);
    for (const r of initialSettlementSplit) memberAmountOverride[r.member_id] = Number(r.amount);
    setItems((prev) => prev.map((it, i) => (i === 0 ? { ...it, memberChecked, memberAmountOverride } : it)));
  }, [showMemberSplit, initialSettlementSplit, editing]);

  const rowsTotal = items.reduce((s, it) => s + lineTotal(it), 0);
  // 정산 기록의 합계는 행 금액의 합으로 자동 계산되지만 직접 고쳐 적을 수 있다(예: 대상 합 40,000원에
  // 실제로 50,000원을 받음 → 차액은 정산 초과분 수입). 비우면 다시 자동 합계로 돌아간다.
  const [totalOverride, setTotalOverride] = useState(() => {
    if (initial?.category_name !== '정산' || !Array.isArray(initial?.items)) return null;
    const rows = initial.items.filter((it) => it?.targetId != null);
    if (!rows.length) return null;
    const sum = rows.reduce((t, it) => t + (Number(it.amount) || 0), 0);
    return Number(initial.amount) !== sum ? String(initial.amount) : null;
  });
  const total = (isSettlement && totalOverride != null && totalOverride !== '') ? Number(totalOverride) : rowsTotal;
  // 정산 대상을 고른 항목의 "내용"(지출 쪽 내용/분류명) — 내용 필드 자동 채움에 사용
  const settlementTargetLabel = (it) => {
    const x = recentExpenses.find((e) => String(e.id) === it.targetId);
    return x ? (x.content || x.category_name || '지출') : '';
  };
  const autoContent = isTransfer
    ? (transferFromName && transferToName ? `${transferFromName} → ${transferToName}` : '')
    : isSettlement
      ? (items.length > 1 ? `${settlementTargetLabel(items[0])} 외 ${items.length - 1}` : settlementTargetLabel(items[0]))
      : items.length > 1 ? `${items[0].name || ''} 외 ${items.length - 1}` : (items[0].name || '');
  const contentValue = contentOverride ?? autoContent;
  // 입력 중에는 지워도 그대로 빈 칸으로 둬서 자유롭게 다시 쓸 수 있게 하고, 포커스를 벗어났을 때
  // 비어 있으면 그제서야 자동 모드(항목명 기반)로 복귀한다.
  const onContentChange = (e) => {
    const v = e.target.value;
    setContentOverride(v);
    setContentSuggestOpen(true);
    // 항목명을 아직 한 번도 직접 건드리지 않았고 항목이 하나뿐이면, 내용에 입력한 값을 그대로
    // 첫 번째 항목명에도 채워준다(둘 다 비어 있는 상태에서 내용을 먼저 쓰는 경우를 위한 편의 기능).
    if (!itemNameTouchedRef.current && items.length === 1) updateItem(0, { name: v });
  };
  const onContentBlur = () => { setContentSuggestOpen(false); if (contentOverride === '') setContentOverride(null); };
  const clearContent = () => { setContentOverride(''); if (!itemNameTouchedRef.current && items.length === 1) updateItem(0, { name: '' }); };
  const pickContentSuggestion = (s) => {
    setContentOverride(s);
    setContentSuggestOpen(false);
    if (!itemNameTouchedRef.current && items.length === 1) updateItem(0, { name: s });
  };
  const rankedContentSuggestions = contentSuggestOpen ? rankSuggestions(contentSuggestions, contentValue) : [];

  // 지금 폼의 분류/원천 해석 결과(submit() 의 계산과 동일한 방식) — 즐겨찾기 저장·비교에 공용으로 씀
  const resolvedCategorySource = useMemo(() => {
    let category_id = null, category_name = '', category_emoji = '', category_color = '';
    if (isTransfer) {
      category_name = '이체';
    } else if (categoryId === SNAP) {
      category_name = initial?.category_name || '';
      category_emoji = initial?.category_emoji || '';
      category_color = initial?.category_color || '';
    } else if (categoryId) {
      const c = categories.find((x) => String(x.id) === String(categoryId));
      if (c) { category_id = Number(c.id); category_name = c.name; category_emoji = c.emoji || ''; category_color = c.color || ''; }
    }
    let source_id = null, source_name = '', to_source_id = null, to_source_name = '';
    if (isTransfer) {
      source_id = items[0]?.fromSourceId ? Number(items[0].fromSourceId) : null;
      source_name = sourcesFlat.find((x) => x.id === source_id)?.name || '';
      to_source_id = items[0]?.toSourceId ? Number(items[0].toSourceId) : null;
      to_source_name = sourcesFlat.find((x) => x.id === to_source_id)?.name || '';
    } else if (sourceId === SNAP) {
      source_name = initial?.source_name || '';
    } else if (sourceId) {
      source_id = Number(sourceId);
      const s = sourcesFlat.find((x) => x.id === source_id);
      if (s) source_name = s.name;
    }
    return { category_id, category_name, category_emoji, category_color, source_id, source_name, to_source_id, to_source_name };
  }, [isTransfer, categoryId, sourceId, categories, sourcesFlat, items, initial]);

  const favItemsSnapshot = useMemo(() => (
    isTransfer ? null : items
      .filter((it) => it.name.trim() || Number(it.amount) > 0)
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 1, amount: Number(it.amount) || 0 }))
  ), [isTransfer, items]);

  // 즐겨찾기(개인별 목록 하나 — 개인/그룹 기록 폼 공용): 지금 폼 내용 그대로를 템플릿으로 등록/해제
  // 신규 기록 화면 진입 시 "내용" 필드에 바로 포커스(수정 화면, 내용이 기본값/템플릿으로 자동으로
  // 채워진 경우는 제외)
  useEffect(() => {
    if (!editing && !defaultContentTemplate && !(initial?.content)) contentInputRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { favorited, toggle: toggleFavorite, busy: favoriteBusy } = useFavoriteToggle({
    type, amount: Math.round(total),
    ...resolvedCategorySource,
    content: contentValue.trim(), memo,
    items: favItemsSnapshot?.length ? favItemsSnapshot : null,
  }, {
    showToast,
    onEmptyContent: () => { showToast('내용을 입력해 주세요'); contentInputRef.current?.focus(); },
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!contentValue.trim()) {
      showToast('내용을 입력해 주세요');
      contentInputRef.current?.focus();
      return;
    }
    if (!isTransfer && !categoryId) return promptRequiredSelect(categorySelectRef, '분류를 선택해 주세요');
    if (!isTransfer && !fixedSourceName && !sourceId) return promptRequiredSelect(sourceSelectRef, '원천을 선택해 주세요');
    if (isTransfer && !items[0]?.fromSourceId) return promptRequiredSelect('transfer-from-source-select', '출금 수단을 선택해 주세요');
    if (isTransfer && !items[0]?.toSourceId) return promptRequiredSelect('transfer-to-source-select', '입금 수단을 선택해 주세요');
    if (isTransfer && items[0].fromSourceId === items[0].toSourceId) return setError('출금/입금 원천이 같을 수 없습니다.');
    if (transferMembers && !transferMemberId) return setError('멤버를 선택하세요.');
    if (isTransfer && feeEnabled && !(Number(feeAmount) > 0)) return setError('수수료 금액을 입력하세요.');
    const aggregateSplit = showMemberSplit ? (() => {
      const totals = {};
      for (const it of items) {
        for (const r of memberRowsFor(it, settlementMembers, itemTotalOf(it))) {
          if (r.checked) totals[r.id] = (totals[r.id] || 0) + r.amount;
        }
      }
      return Object.entries(totals).map(([id, amount]) => ({ member_id: Number(id), amount }));
    })() : null;
    if (showMemberSplit && !aggregateSplit.length) return setError('정산에 참여할 멤버를 1명 이상 선택하세요.');
    setBusy(true);

    // 분류 결정 (SNAP=기존 스냅샷 유지 / 실제 선택 / 선택 안 함). 이체는 분류 선택이 없고 항상 "이체"로 고정.
    let category_id = null, category_name = '', category_emoji = '', category_color = '';
    if (isTransfer) {
      category_name = '이체';
    } else if (categoryId === SNAP) {
      category_name = initial?.category_name || '';
      category_emoji = initial?.category_emoji || '';
      category_color = initial?.category_color || '';
    } else if (categoryId) {
      const c = categories.find((x) => String(x.id) === String(categoryId));
      if (c) { category_id = Number(c.id); category_name = c.name; category_emoji = c.emoji || ''; category_color = c.color || ''; }
    }

    // 원천 결정 (source_name 은 명시 전달 → db 가 그대로 사용). 이체는 항목 행의 출금/입금 선택이 곧 원천.
    // fixedSourceName 지정 시(예: 공금 그룹 사용 내역) 원천 선택 자체를 숨기고 그 값으로 고정.
    let source_id = null, source_name = '', to_source_id = null, to_source_name = '';
    if (fixedSourceName) {
      source_name = fixedSourceName;
    } else if (isTransfer) {
      source_id = Number(items[0].fromSourceId);
      source_name = sourcesFlat.find((x) => x.id === source_id)?.name || '';
      to_source_id = Number(items[0].toSourceId);
      to_source_name = sourcesFlat.find((x) => x.id === to_source_id)?.name || '';
    } else if (sourceId === SNAP) {
      source_name = initial?.source_name || '';
    } else if (sourceId) {
      source_id = Number(sourceId);
      const s = sourcesFlat.find((x) => x.id === source_id);
      if (s) source_name = s.name; // 세부 항목명만
    }

    // 정산 대상 행(여러 건 가능)은 기록 한 건 안에 items 로 담는다(대상별 금액 + 라벨). 대표 대상(첫 행)은
    // settlement_target_id 에도 넣어 기존 조회와 호환. 대상이 하나이고 합계를 고치지 않았으면 items 없이 저장.
    const settleRows = isSettlement
      ? items.filter((it) => it.targetId || Number(it.amount) > 0).map((it) => ({
        targetId: it.targetId ? Number(it.targetId) : null,
        label: settlementTargetLabel(it),
        amount: Math.round(Number(it.amount) || 0),
      }))
      : [];
    const settleItems = (isSettlement && (settleRows.length > 1 || Math.round(total) !== Math.round(rowsTotal))) ? settleRows : null;

    const recurrence = (!recurringId && pendingRecurrence) ? resolveRecurrence(pendingRecurrence, date) : null;
    // 과거 날짜로 반복을 새로 걸면, 그동안 밀린 회차를 한 번에 생성할지 물어봄
    let backfillPast = false;
    if (recurrence && (recurrence.start_date || date) < today()) {
      const n = countDueDates(recurrence, recurrence.start_date || date, today());
      if (n > 0) backfillPast = await askBackfill(n);
    }

    // 외화 입력 스냅샷: 여러 항목 중 외화로 입력한 첫 항목 기준(보통 항목 1개 또는 전부 원화라 충분함)
    const currencyItem = items.find((it) => it.currencyMeta);
    // 항목별 행(내용/수량/금액)을 그대로 저장해 수정 화면에서도 다시 보이도록 함(이체는 출금/입금
    // 원천이 위에서 이미 source_id/to_source_id 로 저장되므로 items 는 따로 저장하지 않음).
    // 정산 분담이 있으면 항목마다 체크된 멤버/금액도 함께 저장해(items.members) 수정 화면에서
    // 항목별로 다시 체크 상태를 복원할 수 있게 한다(전체 합계는 여전히 aggregateSplit 로 처리).
    const savedItems = (isTransfer || isSettlement) ? null : items
      .filter((it) => it.name.trim() || Number(it.amount) > 0)
      .map((it) => {
        const base = {
          name: it.name.trim(), qty: Number(it.qty) || 1, amount: Number(it.amount) || 0,
          // 보조 화폐로 입력한 항목은 화폐/입력 금액/환율을 함께 저장해 수정 화면에서 그대로 복원
          ...(it.currencyMeta?.input_currency ? { input_currency: it.currencyMeta.input_currency, input_amount: it.currencyMeta.input_amount, fx_rate: it.currencyMeta.fx_rate } : {}),
        };
        if (!showMemberSplit) return base;
        const members = memberRowsFor(it, settlementMembers, itemTotalOf(it))
          .filter((r) => r.checked)
          .map((r) => ({ member_id: r.id, amount: r.amount }));
        return { ...base, members };
      });
    const payload = {
      type, date, amount: Math.round(total),
      category_id, category_name, category_emoji, category_color,
      source_id, source_name,
      ...(isTransfer ? { to_source_id, to_source_name } : {}),
      content: (contentValue || '').trim(), memo,
      items: isTransfer ? null : isSettlement ? settleItems : (savedItems.length ? savedItems : null),
      input_currency: currencyItem?.currencyMeta?.input_currency || null,
      input_amount: currencyItem?.currencyMeta?.input_amount ?? null,
      fx_rate: currencyItem?.currencyMeta?.fx_rate ?? null,
      recurrence, backfillPast,
      settlement_target_id: isSettlement ? (settleRows.find((r) => r.targetId)?.targetId ?? null) : null,
      group_id: groupId || null,
      ...(showPeriods ? {
        periods: qtyIsPeriods
          ? Math.max(items.reduce((t, it) => t + (Number(it.qty) || 0), 0), 1)
          : Math.max(Number(periods) || 1, 1),
      } : {}),
      ...(aggregateSplit ? { aggregateSplit } : {}),
      ...(transferMembers ? { transferMemberId } : {}),
      // 카드 실적 제외 여부(카드 원천일 때만 의미. 예전에 제외였던 기록을 카드 아닌 원천으로 바꾸면 해제)
      ...((showPerformance || initial?.exclude_performance) ? { exclude_performance: showPerformance && excludePerformance } : {}),
    };
    try {
      if (onSubmit) await onSubmit(payload);
      else {
        const saved = await db.saveTransaction({ id: initial?.id, userId: user.id, payload, sourcesFlat });
        if (aggregateSplit) await db.saveSettlementSplit(saved.id, aggregateSplit);
        // 이체 수수료: 켜져 있으면 연결된 지출 기록을 생성/수정(분류=수수료, 원천=출금 원천과 동일),
        // 꺼져 있는데 기존에 연결된 기록이 있었으면 삭제
        if (isTransfer) {
          if (feeEnabled) {
            await db.saveLinkedFee({
              id: initialLinkedFee?.id, userId: user.id, transferId: saved.id, date,
              content: feeName.trim() || '수수료', amount: Math.round(Number(feeAmount)),
              source_id, source_name,
            });
          } else if (initialLinkedFee?.id) {
            await db.deleteLinkedFee(initialLinkedFee.id);
          }
        }
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rowLabelStyle = { width: 46, flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#8b8798' };
  const rowInputStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#191722', outline: 'none', textAlign: 'right', padding: 0 };
  const tableCols = (isTransfer || isSettlement) ? '1fr 84px 18px' : showMemberSplit ? '1fr 14px 46px 84px 18px' : '1fr 46px 84px 18px';

  return (
    <form onSubmit={submit}>
      {topNotice}

      <input
        ref={receiptInputRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={onReceiptFile}
      />
      {scanError && <p className="small muted" style={{ margin: '0 2px 12px', color: '#FF4358' }}>{scanError}</p>}

      {!fixedType && (
        <div className="type-pill">
          <button type="button" className={`income ${type === 'income' ? 'active' : ''}`} onClick={() => { setType('income'); setCategoryId(''); setSourceId(''); }}>수입</button>
          <button type="button" className={`expense ${type === 'expense' ? 'active' : ''}`} onClick={() => { setType('expense'); setCategoryId(''); setSourceId(''); }}>지출</button>
          {!groupId && (
            <button type="button" className={`transfer ${type === 'transfer' ? 'active' : ''}`} onClick={() => { setType('transfer'); setCategoryId(''); setSourceId(''); }}>이체</button>
          )}
        </div>
      )}

      {showRecurrenceModal && (
        <RecurrenceModal date={date} onClose={() => setShowRecurrenceModal(false)} onSelect={(p) => { setPendingRecurrence(p); setShowRecurrenceModal(false); }} />
      )}
      {backfillPrompt && (
        <ConfirmModal
          message={`과거의 반복 내역 ${backfillPrompt.n}개를 일괄 생성할까요?`}
          onYes={() => { backfillPrompt.resolve(true); setBackfillPrompt(null); }}
          onNo={() => { backfillPrompt.resolve(false); setBackfillPrompt(null); }}
        />
      )}

      <div className="rcpt-card">
        <div style={{ paddingBottom: groupBadge ? 6 : 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input
                ref={contentInputRef}
                type="text" placeholder="내용" value={contentValue} onChange={onContentChange}
                onFocus={() => { setContentFocused(true); setContentSuggestOpen(true); }}
                onBlur={() => { setContentFocused(false); onContentBlur(); }} autoComplete="off"
                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 20, fontWeight: 800, color: '#191722', outline: 'none', padding: `0 ${contentFocused && contentValue ? '26px' : '0'} 0 0` }}
              />
              {contentFocused && contentValue && <ClearButton onClear={clearContent} />}
              <SuggestList items={rankedContentSuggestions} query={contentValue} onPick={pickContentSuggestion} />
            </div>
            {editing && !templateMode && (
              <button
                type="button" onClick={toggleFavorite} disabled={favoriteBusy} aria-label={favorited ? '즐겨찾기 해제' : '즐겨찾기 등록'}
                style={{ flex: 'none', border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <StarIcon filled={favorited} />
              </button>
            )}
            {!templateMode && (
            <button
              type="button" onClick={onRecurrenceIconClick} aria-label="반복 설정"
              style={{ flex: 'none', border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RepeatIcon color={!(recurringId || pendingRecurrence) ? '#c7c3cc' : '#191722'} />
            </button>
            )}
          </div>
        </div>
        {groupBadge && (
          <span style={{ display: 'inline-block', marginBottom: 10, padding: '3px 9px', borderRadius: 999, background: groupBadge.color || '#e4e2e6', fontSize: 10.5, fontWeight: 700, color: '#6c6779' }}>
            {groupBadge.name}
          </span>
        )}

        {transferMembers && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={rowLabelStyle}>멤버</span>
            <select
              value={transferMemberId} onChange={(e) => setTransferMemberId(e.target.value)}
              disabled={editing || transferMembers.length <= 1} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right' }}
            >
              {transferMembers.map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
            </select>
          </div>
        )}

        {periodField || (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={rowLabelStyle}>날짜</span>
            <div style={{ flex: 1, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{dotDateWithWeekday(date)}</span>
                <input
                  type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="catmodal-date-input" aria-label="날짜 선택"
                />
              </div>
            </div>
          </div>
        )}

        {!isTransfer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={rowLabelStyle}>분류</span>
            <select
              ref={categorySelectRef} value={categoryId}
              onChange={(e) => {
                if (e.target.value === '__edit__') { saveDraftAndGo(`/settings/categories/${type === 'income' ? 'income' : 'expense'}`); return; }
                setCategoryId(e.target.value);
              }}
              style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right', fontWeight: categoryId ? 600 : 400, color: categoryId ? '#191722' : '#a29ead' }}
            >
              <option value="">분류 선택</option>
              {categoryId === SNAP && (
                <option value={SNAP}>{initial?.category_emoji ? `${initial.category_emoji} ` : ''}{initial?.category_name} (기존)</option>
              )}
              {catOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
              <option value="__edit__">편집</option>
            </select>
          </div>
        )}

        {!isTransfer && fixedSourceName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={rowLabelStyle}>원천</span>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{fixedSourceName}</span>
          </div>
        )}
        {!isTransfer && !fixedSourceName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={rowLabelStyle}>원천</span>
            <select
              ref={sourceSelectRef} value={sourceId}
              onChange={(e) => {
                if (e.target.value === '__edit__') { saveDraftAndGo('/settings/sources'); return; }
                setSourceId(e.target.value);
              }}
              style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right', fontWeight: sourceId ? 600 : 400, color: sourceId ? '#191722' : '#a29ead' }}
            >
              <option value="">원천 선택</option>
              {sourceId === SNAP && <option value={SNAP}>{initial?.source_name} (기존)</option>}
              {/* 수입은 신용카드·체크카드 원천 그룹 제외(이미 선택돼 있던 값은 유지) */}
              {(type === 'income' ? transferSources(sources, ['credit', 'check'], sourceId) : sources).map((top) => (
                top.children?.length ? (
                  <optgroup key={top.id} label={top.name}>
                    {String(sourceId) === String(top.id) && <option value={top.id}>{top.name}</option>}
                    {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={top.id} value={top.id}>{top.name}</option>
                )
              ))}
              <option value="__edit__">편집</option>
            </select>
            {/* 신용카드·체크카드 원천이면 같은 줄 오른쪽에 실적 포함/제외 알약 배지(누를 때마다 전환) */}
            {showPerformance && (
              <button
                type="button" onClick={() => setExcludePerformance((v) => !v)} aria-label="카드 실적 포함/제외 전환"
                style={{ flex: 'none', border: 'none', background: '#f4f2f0', borderRadius: 999, padding: '3px 8px', margin: 0, fontFamily: 'inherit', fontSize: 11, fontWeight: 400, lineHeight: 1.3, color: '#a29ead', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {excludePerformance ? '실적 제외' : '실적 포함'}
              </button>
            )}
          </div>
        )}

        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: tableCols, gap: 8, padding: '8px 0', borderTop: '1px dashed #cfccd4', borderBottom: '1px dashed #cfccd4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798' }}>내용</span>
          {showMemberSplit && <span />}
          {!isTransfer && !isSettlement && <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798', textAlign: 'center' }}>{qtyLabel}</span>}
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798', textAlign: 'right' }}>금액</span>
          <span />
        </div>

        {items.map((it, idx) => (
          <ItemRow
            key={idx} item={it} idx={idx} canRemove={!isTransfer && items.length > 1} qtyLabel={qtyLabel}
            settlementMembers={showMemberSplit ? settlementMembers : null}
            isTransfer={isTransfer} sources={sources}
            isSettlement={isSettlement} recentExpenses={recentExpenses} usedTargetIds={usedSettlementTargetIds}
            onTarget={(v) => onItemTargetChange(idx, v)}
            onName={(v) => onItemNameChange(idx, v)}
            itemNameSuggestions={itemNameSuggestions}
            onQty={(v) => updateItem(idx, { qty: v.replace(/[^0-9]/g, '') })}
            onAmount={(v) => updateItem(idx, (qtyIsPeriods && Number(defaultAmount) > 0 && v)
              ? { amount: v, qty: String(Math.round(Number(v) / Number(defaultAmount))) }
              : { amount: v })}
            onCurrencyChange={(meta) => updateItem(idx, { currencyMeta: meta })}
            onRemove={() => removeItem(idx)}
            onToggleExpand={() => toggleItemExpand(idx)}
            onToggleMember={(mid) => toggleItemMember(idx, mid)}
            onMemberAmount={(mid, v) => setItemMemberAmount(idx, mid, v)}
            onFromSource={(v) => updateItem(idx, { fromSourceId: v })}
            onToSource={(v) => updateItem(idx, { toSourceId: v })}
          />
        ))}

        {!isTransfer && <button type="button" onClick={addItem} className="rcpt-add-row">+ 행 추가</button>}

        {isTransfer && !onSubmit && feeEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: tableCols, gap: 8, alignItems: 'center', padding: '5px 0' }}>
            <input
              type="text" placeholder="수수료" value={feeName} onChange={(e) => setFeeName(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: '#191722', outline: 'none', minWidth: 0 }}
            />
            <CalcAmountInput compact value={feeAmount} onChange={setFeeAmount} />
            <button
              type="button" aria-label="수수료 삭제"
              onClick={() => { setFeeEnabled(false); setFeeName('수수료'); setFeeAmount(''); }}
              style={{ width: 18, height: 18, border: 'none', background: 'transparent', color: '#c2bfc6', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RemoveIcon />
            </button>
          </div>
        )}
        {isTransfer && !onSubmit && !feeEnabled && (
          <button type="button" onClick={() => setFeeEnabled(true)} className="rcpt-add-row">+ 수수료 추가</button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: tableCols, gap: 8, alignItems: 'center', padding: '8px 0 0', marginTop: 6, borderTop: '1px dashed #cfccd4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798' }}>합계</span>
          {showMemberSplit && <span />}
          {!isTransfer && !isSettlement && <span />}
          {isSettlement ? (
            <input
              type="text" inputMode="numeric" aria-label="합계 금액"
              value={totalOverride === '' ? '' : fmtNum(total)} placeholder={fmtNum(rowsTotal)}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setTotalOverride(v === '' ? '' : String(Number(v))); }}
              onBlur={() => { if (totalOverride === '' || Number(totalOverride) === rowsTotal) setTotalOverride(null); }}
              style={{ width: '100%', minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15.5, fontWeight: 800, color: '#2CDDB9', outline: 'none', textAlign: 'right', padding: 0 }}
            />
          ) : (
            <span style={{ fontSize: 15.5, fontWeight: 800, color: isTransfer ? '#4b4752' : (type === 'expense' ? '#FF4358' : '#2CDDB9'), textAlign: 'right' }}>{fmtNum(total)}</span>
          )}
          <span />
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="rcpt-dots" />
          <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#a29ead', letterSpacing: '.3px' }}>메모</span>
          <span className="rcpt-dots" style={{ textAlign: 'right' }} />
        </div>
        <textarea
          ref={memoRef} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="추가 설명을 적어주세요" rows={2}
          style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: '#191722', outline: 'none', resize: 'none', padding: 0, overflow: 'hidden' }}
        />
      </div>

      {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
      <button className="btn-ink-pill" style={{ marginTop: 26 }} disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
      {editing && onDelete && (
        <button
          type="button" onClick={handleDelete} disabled={deleteBusy}
          style={{
            display: 'block', width: '100%', marginTop: 12, border: 'none', background: 'transparent',
            padding: '4px 0', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#FF6F91', cursor: 'pointer',
          }}
        >
          {deleteBusy ? '삭제 중…' : '삭제'}
        </button>
      )}
    </form>
  );
});

export default TransactionForm;
