import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { fieldStyle, labelStyle } from './FriendAdd.jsx';
import BareSelect from '../components/BareSelect.jsx';

const isCardGroup = (t) => t === 'credit' || t === 'check';
const GROUP_TYPES = [['general', '일반'], ['credit', '신용카드'], ['check', '체크카드'], ['onnuri', '디지털 온누리']];
const TYPE_LABEL = Object.fromEntries(GROUP_TYPES);
const BUSINESS_DAY_LABELS = { none: '없음', before: '전 영업일', after: '후 영업일' };
// 청구 기간 기본값(대금 납부일 기준, 수정 가능): 14일 → 전월 1일~전월 말일,
// 14일 이후 → 전월 (d-13)일~당월 (d-14)일, 14일 이전 → 전전월 (d+17)일~전월 (d+16)일. 일자 31 = 말일.
// 납부일을 바꾸면(수정 화면 포함) 항상 이 기본값으로 다시 맞춘다.
function defaultBillPeriod(d) {
  const n = Number(d);
  if (!(n >= 1 && n <= 31)) return { so: '-1', sd: '1', eo: '-1', ed: '31' };
  if (n === 14) return { so: '-1', sd: '1', eo: '-1', ed: '31' };
  if (n > 14) return { so: '-1', sd: String(n - 13), eo: '0', ed: String(n - 14) };
  return { so: '-2', sd: String(n + 17), eo: '-1', ed: String(n + 16) };
}
// 청구 기간(한 달 간격): 시작(월 오프셋·일자)만 정하면 끝이 정해짐. 1 일 시작 → 같은 달 말일, N 일 시작 → 다음 달 (N-1) 일
const OFFSET_NAME = { '-2': '전전월', '-1': '전월', '0': '당월' };
const dayLabel = (d) => (Number(d) === 31 ? '말일' : `${d} 일`);
const periodKey = (f) => `${f.so}|${f.sd}`;
function periodFromKey(k) {
  const [so, sd] = k.split('|');
  if (Number(sd) === 1) return { so, sd, eo: so, ed: '31' };
  return { so, sd, eo: String(Number(so) + 1), ed: String(Number(sd) - 1) };
}
const periodLabel = (f) => `${OFFSET_NAME[f.so] || ''} ${dayLabel(f.sd)} ~ ${OFFSET_NAME[f.eo] || ''} ${dayLabel(f.ed)}`;
const PERIOD_STARTS = [
  ...Array.from({ length: 30 }, (_, i) => ['-2', String(i + 2)]), // 전전월 2 일 ~ 전월 1 일 … 전전월 31 일
  ...Array.from({ length: 31 }, (_, i) => ['-1', String(i + 1)]), // 전월 1 일 ~ 전월 말일 … 전월 31 일
].filter(([so, sd]) => !(so === '-1' && Number(sd) === 31) && !(so === '-2' && Number(sd) === 31));
function periodOptions(f) {
  const opts = PERIOD_STARTS.map(([so, sd]) => [`${so}|${sd}`, periodLabel(periodFromKey(`${so}|${sd}`))]);
  // 예전에 직접 고른 기간이 목록에 없으면 그대로 표시
  if (!opts.some(([k]) => k === periodKey(f))) opts.unshift([periodKey(f), periodLabel(f)]);
  return opts;
}

const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 설정 > 원천 관리 > 원천 그룹 추가/수정, 원천 추가/수정 페이지.
//  · /settings/sources/new             원천 그룹 추가
//  · /settings/sources/:parentId/new   원천 추가
//  · /settings/sources/:id/edit        원천 그룹/원천 수정
// 원천: 일반 그룹은 금액, 카드 그룹은 연결 계좌(카드 그룹 제외 원천), 신용카드 그룹은 대금 납부일(매달 1~31일).
// admin=true: 관리자 > 원천 기본값 관리(금액·연결 계좌·납부일은 회원별 정보라 없음).
export default function SourceEdit({ admin = false }) {
  const { id, parentId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const api = admin ? {
    list: () => db.listDefaultSources(),
    add: (name, pid, groupType) => db.addDefaultSource(name, pid, groupType),
    update: (sid, name, groupType) => db.updateDefaultSource(sid, name, groupType),
    setPrimary: (sid, kind, value) => db.setDefaultPrimarySource(sid, kind, value),
    move: (sid, pid) => db.moveDefaultSource(sid, pid),
  } : {
    list: () => db.listSources(),
    add: (name, pid, groupType) => db.addSource(user.id, name, pid, groupType),
    update: (sid, name, groupType) => db.updateSource(sid, name, groupType),
    setPrimary: (sid, kind, value) => db.setPrimarySource(sid, kind, value),
    move: (sid, pid) => db.updateSourceDetails(sid, { parent_id: pid }),
  };

  const [tree, setTree] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2000); return () => clearTimeout(t); }, [toast, toastKey]);

  useEffect(() => {
    api.list().then(({ tree: t }) => setTree(t)).catch((e) => { alert(e.message); setTree([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flat = tree ? tree.flatMap((t) => [t, ...(t.children || [])]) : [];
  const src = id ? flat.find((s) => s.id === Number(id)) : null;
  const isNew = !id;
  const isGroup = isNew ? !parentId : src?.parent_id == null;
  // 원천의 원천 그룹: 셀렉트박스로 바꿀 수 있음(form.parentId)
  const parent = isGroup ? null : tree?.find((t) => t.id === Number(form?.parentId || (isNew ? parentId : src?.parent_id)));
  const parentType = parent?.group_type || 'general';

  useEffect(() => {
    if (!tree || form) return;
    if (!isNew && !src) return;
    setForm({
      name: src?.name || '',
      groupType: src?.group_type || 'general',
      payment: !!src?.is_primary_payment,
      deposit: !!src?.is_primary_deposit,
      settle: !!src?.is_primary_settle,
      // 현재 금액(기준 금액 + 기록 반영)을 보여 주고, 바꾸면 그 값이 새 기준 금액(수정 시각 기준)
      balance: src?.current_balance != null ? String(src.current_balance) : '',
      linkedId: src?.linked_source_id ? String(src.linked_source_id) : '',
      onnuri: !!src?.onnuri_linked,
      // 카드 원천 입금 허용(기본 OFF): 켜면 주입금수단 지정·입금 쪽 원천 목록에 포함
      allowDeposit: !!src?.allow_deposit,
      includeTotals: src ? src.include_in_totals !== false : true,
      // 대금 납부(신용카드 원천): 납부일 기본 14일, 청구 기간은 납부일 기준 기본값
      paymentDay: src?.payment_day ? String(src.payment_day) : '14',
      businessRule: src?.payment_business_rule || 'none',
      ...(src?.bill_start_offset != null && src?.bill_end_offset != null
        ? { so: String(src.bill_start_offset), sd: String(src.bill_start_day ?? 1), eo: String(src.bill_end_offset), ed: String(src.bill_end_day ?? 31) }
        : { ...defaultBillPeriod(src?.payment_day || 14) }),
      autoBill: !!src?.auto_bill,
      // 신용카드 그룹: 지출 반영 시점
      expenseTiming: src?.expense_timing || 'usage',
      parentId: isNew ? String(parentId || '') : String(src?.parent_id || ''),
    });
  }, [tree, form, isNew, src]);

  if (!tree || (!form && (isNew || src))) return <Spinner />;
  if (!form) return <div className="empty empty-center">원천을 찾을 수 없습니다.</div>;

  const title = isGroup ? (isNew ? '원천 그룹 추가' : '원천 그룹 수정') : (isNew ? '원천 추가' : '원천 수정');
  const cardItem = !isGroup && isCardGroup(parentType);
  const creditItem = !isGroup && parentType === 'credit';
  // 신용카드/체크카드 그룹의 원천은 "입금 허용"을 켜야 주입금수단으로 지정할 수 있음
  const depositDisabled = isCardGroup(isGroup ? form.groupType : parentType) && (isGroup || admin || !form.allowDeposit);

  // 카드 그룹이 되면 주입금수단 지정은 풀림
  const set = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    const nextParentType = tree.find((t) => t.id === Number(next.parentId))?.group_type || 'general';
    if (isCardGroup(isGroup ? next.groupType : nextParentType)) next.settle = false; // 카드 원천은 주 정산 수단 지정 불가
    if (isCardGroup(isGroup ? next.groupType : nextParentType) && (isGroup || admin || !next.allowDeposit)) next.deposit = false;
    return next;
  });
  const typeLabel = (t) => TYPE_LABEL[t] || '';
  // 디지털 온누리 그룹이 있으면 카드 원천에 "디지털 온누리 연결" 토글
  const hasOnnuri = tree.some((t) => t.group_type === 'onnuri');
  const save = async () => {
    const name = form.name.trim();
    if (!name) return alert('이름을 입력하세요.');
    // 대금 납부 자동 입력 ON: 대금 납부 영역 전체 필수
    if (!admin && creditItem && form.autoBill) {
      const d = Number(form.paymentDay);
      if (!form.linkedId) return alert('연결 계좌를 선택하세요.');
      if (!(d >= 1 && d <= 31)) return alert('대금 납부일을 입력하세요.');
      if (![form.so, form.sd, form.eo, form.ed].every((v) => v !== '' && v != null)) return alert('청구 기간을 입력하세요.');
    }
    if (busy) return;
    setBusy(true);
    const deposit = depositDisabled ? false : form.deposit;
    const settle = cardItem ? false : form.settle;
    try {
      let sid = src?.id;
      let groupRowId = isGroup ? src?.id : null;
      if (isNew) {
        const row = await api.add(name, isGroup ? null : Number(form.parentId || parentId), isGroup ? form.groupType : null);
        sid = row.id;
        if (isGroup) groupRowId = row.id;
        // 원천 그룹은 선택할 수 없으므로 같은 이름의 원천을 함께 만듦
        if (isGroup) sid = (await api.add(name, row.id)).id;
      } else if (name !== src.name || (isGroup && form.groupType !== (src.group_type || 'general'))) {
        await api.update(sid, name, isGroup ? form.groupType : undefined);
      }
      // 그룹을 카드 그룹으로 바꾸면 원천의 주입금수단 지정도 해제
      if (!isNew && isGroup && isCardGroup(form.groupType)) {
        for (const c of src.children || []) {
          if (c.is_primary_settle) await api.setPrimary(c.id, 'settle', false);
          if (c.allow_deposit) continue;
          if (c.is_primary_deposit) await api.setPrimary(c.id, 'deposit', false);
        }
      }
      // 원천 그룹 변경(원천)
      if (!isNew && !isGroup && Number(form.parentId) !== src.parent_id) await api.move(sid, Number(form.parentId));
      if (!isGroup) {
        if (form.payment !== !!src?.is_primary_payment) await api.setPrimary(sid, 'payment', form.payment);
        if (deposit !== !!src?.is_primary_deposit) await api.setPrimary(sid, 'deposit', deposit);
        if (settle !== !!src?.is_primary_settle) await api.setPrimary(sid, 'settle', settle);
      }
      if (!admin && !isGroup) {
        const newBal = cardItem || form.balance === '' || form.balance === '-' ? null : Number(form.balance);
        // 금액을 직접 바꾸면 그 값이 새 기준 금액, 수정 시각이 기준 시점(그 날짜 이전 기록은 이미 반영된 것으로 봄).
        // 비우면 기준 없음(모든 기록 반영).
        const balanceChanged = !cardItem && newBal !== (src?.current_balance ?? null);
        const details = {
          linked_source_id: cardItem && form.linkedId ? Number(form.linkedId) : null,
          payment_day: creditItem && Number(form.paymentDay) >= 1 ? Math.min(31, Number(form.paymentDay)) : null,
          ...(creditItem ? {
            payment_business_rule: form.businessRule,
            bill_start_offset: Number(form.so), bill_start_day: Number(form.sd), bill_end_offset: Number(form.eo), bill_end_day: Number(form.ed),
            auto_bill: !!form.autoBill,
            // 켠 날짜부터 도래하는 납부일만 자동 입력
            auto_bill_since: form.autoBill ? (src?.auto_bill ? (src.auto_bill_since || todayKst()) : todayKst()) : null,
          } : {}),
          onnuri_linked: cardItem && hasOnnuri && !!form.onnuri,
          allow_deposit: cardItem && !!form.allowDeposit,
          include_in_totals: !!form.includeTotals,
          ...(balanceChanged ? { balance: newBal, balance_set_at: newBal == null ? null : new Date().toISOString() } : {}),
        };
        const changed = creditItem || balanceChanged || details.linked_source_id !== (src?.linked_source_id ?? null)
          || details.payment_day !== (src?.payment_day ?? null) || details.onnuri_linked !== !!src?.onnuri_linked
          || details.allow_deposit !== !!src?.allow_deposit
          || details.include_in_totals !== (src ? src.include_in_totals !== false : true);
        if (changed) await db.updateSourceDetails(sid, details);
      }
      // 신용카드 그룹: 지출 반영 시점
      if (!admin && isGroup && form.groupType === 'credit' && form.expenseTiming !== (src?.expense_timing || 'usage')) {
        await db.updateSourceDetails(groupRowId, { expense_timing: form.expenseTiming });
      }
      // 자동 입력이 켜져 있으면 이미 도래한 납부일 기록을 바로 생성
      if (!admin && creditItem && form.autoBill) await db.generateMyCardBills().catch(() => {});
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const selectStyle = { ...fieldStyle, WebkitAppearance: 'none', appearance: 'none', paddingRight: 40, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23a29ead%27 stroke-width=%272.4%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' };
  // 대금 납부 영역: 자동 입력 ON 이면 모든 필드 필수(*)
  const req = form.autoBill ? <span style={{ color: '#FF3B5C' }}> *</span> : null;
  const subLabel = { fontSize: 12.5, fontWeight: 700, color: 'var(--k-tx-4a4652)' };
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 };
  const bareText = { fontSize: 13.25, color: 'var(--k-tx-191722)' };
  const fmtBalance = (v) => {
    if (v === '' || v === '-') return v;
    const neg = v.startsWith('-');
    return (neg ? '-' : '') + Number(v.replace('-', '')).toLocaleString('ko-KR');
  };

  const primaryPills = (
        <div style={{ display: 'flex', gap: 8 }}>
          {[['payment', '주 결제 수단', '#FF3B5C', '#FDE8EE'], ['deposit', '주 입금 수단', '#1FB597', '#E5FBF6'], ['settle', '주 정산 수단', '#7B61FF', '#EEEBFE']].filter(([key]) => !(key === 'settle' && cardItem)).map(([key, label, fg, bg]) => {
            // 카드 원천은 입금 허용을 켜야 주 입금/정산 수단으로 지정 가능
            const disabled = key !== 'payment' && depositDisabled;
            const on = !disabled && form[key];
            return (
              <button
                key={key} type="button" aria-pressed={on} aria-disabled={disabled} className="pill-toggle"
                onClick={() => {
                  if (disabled) { setToast(cardItem && !admin ? `입금 허용을 켜면 ${label}으로 지정할 수 있어요` : `${typeLabel(isGroup ? form.groupType : parentType)} 그룹은 ${label}으로 지정할 수 없어요`); setToastKey((k) => k + 1); return; }
                  set({ [key]: !form[key] });
                }}
                style={{
                  flex: 1, minWidth: 0, height: 40, borderRadius: 999, fontFamily: 'inherit', fontSize: 12, padding: '0 6px', whiteSpace: 'nowrap', fontWeight: 700,
                  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                  borderColor: on ? fg : 'var(--k-bd-efeef2)', background: on ? bg : 'var(--k-bg-fff)', color: on ? fg : 'var(--k-tx-8b8798)',
                }}
              >{on ? `✓ ${label}` : label}</button>
            );
          })}
        </div>
  );
  // 라벨(+설명) 왼쪽, 토글 오른쪽
  const toggleRow = (label, desc, on, onClick, lblStyle) => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={lblStyle}>{label}</span>
        {desc && <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>{desc}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ios-toggle${on ? ' on' : ''}`} onClick={onClick}>
        <span className="ios-toggle-knob" />
      </button>
    </label>
  );
  // 집계 제외(기본 OFF): ON 이면 가계부 합계·분류별/항목별 통계에서 제외. 저장 값은 include_in_totals 의 반대
  const excludeRow = (lblStyle) => toggleRow('집계 제외', '가계부 탭 집계와 분류별·항목별 통계에 제외됩니다', !form.includeTotals, () => set({ includeTotals: !form.includeTotals }), lblStyle);
  // 카드 원천: "입출금 설정" 영역(입금 허용 토글 + 입력 자동화(주결제/주입금수단))
  const inOutBox = cardItem && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={labelStyle}>입출금 설정</span>
      <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.07 * var(--k-sha)))', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!admin && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={subLabel}>입금 허용</span>
              <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>수입 기록 및 그룹 입금 수단에 해당 원천 선택을 허용합니다</span>
            </span>
            <button
              type="button" role="switch" aria-checked={!!form.allowDeposit} aria-label="입금 허용"
              className={`ios-toggle${form.allowDeposit ? ' on' : ''}`} onClick={() => set({ allowDeposit: !form.allowDeposit })}
            ><span className="ios-toggle-knob" /></button>
          </label>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={subLabel}>입력 자동화</span>
          {primaryPills}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title={title} flat />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!isGroup && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>원천 그룹 <span style={{ color: '#FF3B5C' }}>*</span></span>
            <select value={form.parentId} onChange={(e) => set({ parentId: e.target.value })} style={selectStyle}>
              {tree.map((t) => <option key={t.id} value={t.id}>{t.name}{isCardGroup(t.group_type) ? ` (${typeLabel(t.group_type)})` : ''}</option>)}
            </select>
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>{isGroup ? '원천 그룹 이름' : '원천 이름'} <span style={{ color: '#FF3B5C' }}>*</span></span>
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} placeholder={isGroup ? '예: 은행' : '예: 우리은행'} style={fieldStyle} />
        </label>

        {/* 체크카드 원천: 원천 이름 아래 입출금 설정 */}
        {cardItem && !creditItem && inOutBox}

        {isGroup && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>그룹 특성</span>
            <select value={form.groupType} onChange={(e) => set({ groupType: e.target.value })} style={selectStyle}>
              {GROUP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}

        {/* 신용카드 그룹: 지출 반영 시점(카드 사용일 / 대금 납부일) */}
        {!admin && isGroup && form.groupType === 'credit' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>지출 반영 시점</span>
            <select value={form.expenseTiming} onChange={(e) => set({ expenseTiming: e.target.value })} style={selectStyle}>
              <option value="usage">카드 사용일</option>
              <option value="payment">대금 납부일</option>
            </select>
          </label>
        )}

        {/* 일반 그룹 원천: 금액 */}
        {!admin && !isGroup && !cardItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>금액</span>
            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
              <input
                type="text" inputMode="decimal" value={fmtBalance(form.balance)} placeholder="0"
                onChange={(e) => { const raw = e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''); set({ balance: raw.replace(/^(-?)0+(?=\d)/, '$1') }); }}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', padding: '14px 0', textAlign: 'right' }}
              />
              <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-6c6779)' }}>원</span>
            </div>
          </label>
        )}

        {/* 체크카드 원천: 연결 계좌 */}
        {!admin && cardItem && !creditItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>연결 계좌</span>
            <select value={form.linkedId} onChange={(e) => set({ linkedId: e.target.value })} style={{ ...selectStyle, color: form.linkedId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
              <option value="">카드값이 빠져나갈 원천 선택</option>
              {/* 기록 페이지 원천 셀렉트처럼 원천 그룹 라벨 아래 원천(카드·디지털 온누리 그룹 제외) */}
              {tree.filter((t) => !isCardGroup(t.group_type) && t.group_type !== 'onnuri' && t.children?.length).map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        {/* 신용카드 원천: "대금 납부" 영역(연결 계좌·납부일·영업일 처리·청구 기간·자동 입력) */}
        {!admin && creditItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>대금 납부</span>
            <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.07 * var(--k-sha)))', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 반복 상세 모달처럼 필드명은 왼쪽, 값은 오른쪽 끝 */}
              <div style={rowStyle}>
                <span style={{ ...subLabel, flex: 'none' }}>연결 계좌{req}</span>
                <BareSelect
                  value={form.linkedId} onChange={(v) => set({ linkedId: v })} placeholder="원천 선택"
                  // 기록 페이지 원천 셀렉트처럼 원천 그룹 라벨 아래 원천(카드·디지털 온누리 그룹 제외)
                  groups={tree.filter((t) => !isCardGroup(t.group_type) && t.group_type !== 'onnuri' && t.children?.length)
                    .map((t) => ({ label: t.name, options: t.children.map((c) => [String(c.id), c.name]) }))}
                />
              </div>

              <div style={rowStyle}>
                <span style={{ ...subLabel, flex: 'none' }}>대금 납부일{req}</span>
                {/* "매월 [일자] 일" — 매월/일은 고정 텍스트. 바꾸면 청구 기간도 납부일 기준 기본값으로 */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={bareText}>매월</span>
                  <input
                    type="text" inputMode="numeric" value={form.paymentDay} placeholder="14"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                      const n = Math.min(31, Number(v) || 0);
                      const day = v === '' ? '' : String(n || '');
                      setForm((f) => ({ ...f, paymentDay: day, ...(day ? defaultBillPeriod(day) : {}) }));
                    }}
                    style={{ width: 26, border: 'none', outline: 'none', background: 'transparent', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 13.25, color: 'var(--k-tx-191722)', textAlign: 'right' }}
                  />
                  <span style={bareText}>일</span>
                </span>
              </div>

              <div style={rowStyle}>
                <span style={{ ...subLabel, flex: 'none' }}>영업일 처리</span>
                <BareSelect value={form.businessRule} onChange={(v) => set({ businessRule: v })} options={Object.entries(BUSINESS_DAY_LABELS)} />
              </div>

              <div style={rowStyle}>
                <span style={{ ...subLabel, flex: 'none' }}>청구 기간{req}</span>
                {/* 한 달 간격이라 시작일만 고르면 끝은 정해짐 → 셀렉트박스 하나 */}
                <BareSelect
                  value={periodKey(form)} onChange={(v) => set(periodFromKey(v))}
                  options={periodOptions(form)}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={subLabel}>대금 납부 자동 입력</span>
                  <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>청구 기간 사용 금액을 연결 계좌 지출로 자동 기록합니다</span>
                </span>
                <button
                  type="button" role="switch" aria-checked={!!form.autoBill} aria-label="대금 납부 자동 입력"
                  className={`ios-toggle${form.autoBill ? ' on' : ''}`} onClick={() => set({ autoBill: !form.autoBill })}
                ><span className="ios-toggle-knob" /></button>
              </label>
            </div>
          </div>
        )}

        {/* 신용카드 원천: 대금 납부 영역 아래 입출금 설정 */}
        {creditItem && inOutBox}

        {/* 주결제/주입금수단 — 일반·디지털 온누리 그룹 원천(카드 원천은 아래 "입출금 설정" 영역의 "입력 자동화") */}
        {!isGroup && !cardItem && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>입력 자동화</span>
          {primaryPills}
        </div>
        )}

        {/* 카드 그룹 원천: "기타 설정" 영역(디지털 온누리 연결 + 집계 제외), 그 외 원천은 집계 제외만 */}
        {!admin && !isGroup && (cardItem ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>기타 설정</span>
            <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.07 * var(--k-sha)))', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {hasOnnuri && toggleRow('디지털 온누리 연결', '온누리 가맹점 결제 시 디지털 온누리 잔액이 우선 차감됩니다', !!form.onnuri, () => set({ onnuri: !form.onnuri }), subLabel)}
              {excludeRow(subLabel)}
            </div>
          </div>
        ) : excludeRow(labelStyle))}

        {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.name.trim()} onClick={save}>
          {busy ? '저장 중…' : isNew ? '추가' : '저장'}
        </button>
      </div>
    </div>
  );
}
