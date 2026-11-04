import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { fieldStyle, labelStyle } from './FriendAdd.jsx';

const isCardGroup = (t) => t === 'credit' || t === 'check';
const GROUP_TYPES = [['general', '일반'], ['credit', '신용카드'], ['check', '체크카드'], ['onnuri', '디지털 온누리']];
const TYPE_LABEL = Object.fromEntries(GROUP_TYPES);
const BUSINESS_DAY_LABELS = { none: '없음', before: '전 영업일', after: '후 영업일' };
const OFFSET_LABELS = [['-2', '전전월'], ['-1', '전월'], ['0', '당월']];
// 청구 기간 기본값(대금 납부일 기준, 수정 가능): 14일 → 전월 1일~전월 말일,
// 14일 이후 → 전월 (d-13)일~당월 (d-14)일, 14일 이전 → 전전월 (d+17)일~전월 (d+16)일. 일자 31 = 말일
function defaultBillPeriod(d) {
  const n = Number(d);
  if (!(n >= 1 && n <= 31)) return { so: '-1', sd: '1', eo: '-1', ed: '31' };
  if (n === 14) return { so: '-1', sd: '1', eo: '-1', ed: '31' };
  if (n > 14) return { so: '-1', sd: String(n - 13), eo: '0', ed: String(n - 14) };
  return { so: '-2', sd: String(n + 17), eo: '-1', ed: String(n + 16) };
}
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 설정 > 원천 관리 > 원천 그룹 추가/수정, 세부 항목 추가/수정 페이지.
//  · /settings/sources/new             원천 그룹 추가
//  · /settings/sources/:parentId/new   세부 항목 추가
//  · /settings/sources/:id/edit        원천 그룹/세부 항목 수정
// 세부 항목: 일반 그룹은 금액, 카드 그룹은 연결 계좌(카드 그룹 제외 원천), 신용카드 그룹은 대금 납부일(매달 1~31일).
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
  // 세부 항목의 원천 그룹: 셀렉트박스로 바꿀 수 있음(form.parentId)
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
      // 현재 금액(기준 금액 + 기록 반영)을 보여 주고, 바꾸면 그 값이 새 기준 금액(수정 시각 기준)
      balance: src?.current_balance != null ? String(src.current_balance) : '',
      linkedId: src?.linked_source_id ? String(src.linked_source_id) : '',
      onnuri: !!src?.onnuri_linked,
      includeTotals: src ? src.include_in_totals !== false : true,
      // 대금 납부(신용카드 세부 항목): 납부일 기본 14일, 청구 기간은 납부일 기준 기본값
      paymentDay: src?.payment_day ? String(src.payment_day) : '14',
      businessRule: src?.payment_business_rule || 'none',
      ...(src?.bill_start_offset != null && src?.bill_end_offset != null
        ? { so: String(src.bill_start_offset), sd: String(src.bill_start_day ?? 1), eo: String(src.bill_end_offset), ed: String(src.bill_end_day ?? 31), periodTouched: true }
        : { ...defaultBillPeriod(src?.payment_day || 14), periodTouched: false }),
      autoBill: !!src?.auto_bill,
      // 신용카드 그룹: 지출 반영 시점
      expenseTiming: src?.expense_timing || 'usage',
      parentId: isNew ? String(parentId || '') : String(src?.parent_id || ''),
    });
  }, [tree, form, isNew, src]);

  if (!tree || (!form && (isNew || src))) return <Spinner />;
  if (!form) return <div className="empty empty-center">원천을 찾을 수 없습니다.</div>;

  const title = isGroup ? (isNew ? '원천 그룹 추가' : '원천 그룹 수정') : (isNew ? '세부 항목 추가' : '세부 항목 수정');
  const cardItem = !isGroup && isCardGroup(parentType);
  const creditItem = !isGroup && parentType === 'credit';
  // 신용카드/체크카드 그룹(과 그 세부 항목)은 주입금수단으로 지정할 수 없음
  const depositDisabled = isCardGroup(isGroup ? form.groupType : parentType);

  // 카드 그룹이 되면 주입금수단 지정은 풀림
  const set = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    const nextParentType = tree.find((t) => t.id === Number(next.parentId))?.group_type || 'general';
    if (isCardGroup(isGroup ? next.groupType : nextParentType)) next.deposit = false;
    return next;
  });
  const typeLabel = (t) => TYPE_LABEL[t] || '';
  // 디지털 온누리 그룹이 있으면 카드 세부 항목에 "디지털 온누리 연결" 토글
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
    try {
      let sid = src?.id;
      let groupRowId = isGroup ? src?.id : null;
      if (isNew) {
        const row = await api.add(name, isGroup ? null : Number(form.parentId || parentId), isGroup ? form.groupType : null);
        sid = row.id;
        if (isGroup) groupRowId = row.id;
        // 원천 그룹은 선택할 수 없으므로 같은 이름의 세부 항목을 함께 만듦
        if (isGroup) sid = (await api.add(name, row.id)).id;
      } else if (name !== src.name || (isGroup && form.groupType !== (src.group_type || 'general'))) {
        await api.update(sid, name, isGroup ? form.groupType : undefined);
      }
      // 그룹을 카드 그룹으로 바꾸면 세부 항목의 주입금수단 지정도 해제
      if (!isNew && isGroup && isCardGroup(form.groupType)) {
        for (const c of src.children || []) if (c.is_primary_deposit) await api.setPrimary(c.id, 'deposit', false);
      }
      // 원천 그룹 변경(세부 항목)
      if (!isNew && !isGroup && Number(form.parentId) !== src.parent_id) await api.move(sid, Number(form.parentId));
      if (!isGroup) {
        if (form.payment !== !!src?.is_primary_payment) await api.setPrimary(sid, 'payment', form.payment);
        if (deposit !== !!src?.is_primary_deposit) await api.setPrimary(sid, 'deposit', deposit);
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
          include_in_totals: !!form.includeTotals,
          ...(balanceChanged ? { balance: newBal, balance_set_at: newBal == null ? null : new Date().toISOString() } : {}),
        };
        const changed = creditItem || balanceChanged || details.linked_source_id !== (src?.linked_source_id ?? null)
          || details.payment_day !== (src?.payment_day ?? null) || details.onnuri_linked !== !!src?.onnuri_linked
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
  const fixedText = { flex: 'none', fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-6c6779)' };
  const fmtBalance = (v) => {
    if (v === '' || v === '-') return v;
    const neg = v.startsWith('-');
    return (neg ? '-' : '') + Number(v.replace('-', '')).toLocaleString('ko-KR');
  };

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
          <span style={labelStyle}>{isGroup ? '원천 그룹 이름' : '세부 항목 이름'} <span style={{ color: '#FF3B5C' }}>*</span></span>
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} placeholder={isGroup ? '예: 은행' : '예: 우리은행'} style={fieldStyle} />
        </label>

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

        {/* 일반 그룹 세부 항목: 금액 */}
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

        {/* 체크카드 세부 항목: 연결 계좌 */}
        {!admin && cardItem && !creditItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>연결 계좌</span>
            <select value={form.linkedId} onChange={(e) => set({ linkedId: e.target.value })} style={{ ...selectStyle, color: form.linkedId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
              <option value="">카드값이 빠져나갈 원천 선택</option>
              {/* 기록 페이지 원천 셀렉트처럼 원천 그룹 라벨 아래 세부 항목(카드·디지털 온누리 그룹 제외) */}
              {tree.filter((t) => !isCardGroup(t.group_type) && t.group_type !== 'onnuri' && t.children?.length).map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        {/* 신용카드 세부 항목: "대금 납부" 영역(연결 계좌·납부일·영업일 처리·청구 기간·자동 입력) */}
        {!admin && creditItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>대금 납부</span>
            <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.07 * var(--k-sha)))', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={subLabel}>연결 계좌{req}</span>
            <select value={form.linkedId} onChange={(e) => set({ linkedId: e.target.value })} style={{ ...selectStyle, color: form.linkedId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
                  <option value="">카드값이 빠져나갈 원천 선택</option>
                  {/* 기록 페이지 원천 셀렉트처럼 원천 그룹 라벨 아래 세부 항목(카드·디지털 온누리 그룹 제외) */}
                  {tree.filter((t) => !isCardGroup(t.group_type) && t.group_type !== 'onnuri' && t.children?.length).map((t) => (
                    <optgroup key={t.id} label={t.name}>
                      {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={subLabel}>대금 납부일{req}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* "매월 [일자] 일" — 매월/일은 고정 텍스트 */}
                  <div style={{ ...fieldStyle, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px' }}>
                    <span style={fixedText}>매월</span>
                    <input
                      type="text" inputMode="numeric" value={form.paymentDay} placeholder="14"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                        const n = Math.min(31, Number(v) || 0);
                        const day = v === '' ? '' : String(n || '');
                        setForm((f) => ({ ...f, paymentDay: day, ...(f.periodTouched || !day ? {} : defaultBillPeriod(day)) }));
                      }}
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', padding: '14px 0', textAlign: 'right' }}
                    />
                    <span style={fixedText}>일</span>
                  </div>
                  {/* 영업일 처리 */}
                  <select value={form.businessRule} onChange={(e) => set({ businessRule: e.target.value })} aria-label="영업일 처리" style={{ ...selectStyle, flex: 'none', width: 132 }}>
                    {Object.entries(BUSINESS_DAY_LABELS).map(([v, l]) => <option key={v} value={v}>{v === 'none' ? '영업일 처리 없음' : l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={subLabel}>청구 기간{req}</span>
                {/* [전월] [1일] ~ [전월] [말일] — 납부일을 바꾸면 기본값으로(직접 고친 뒤에는 유지) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[['so', 'sd'], ['eo', 'ed']].map(([ok, dk], i) => (
                    <div key={ok} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i === 1 && <span style={{ ...fixedText, flex: 'none' }}>~</span>}
                      <select value={form[ok]} onChange={(e) => set({ [ok]: e.target.value, periodTouched: true })} aria-label={i ? '청구 기간 끝 월' : '청구 기간 시작 월'} style={{ ...selectStyle, flex: 1, minWidth: 0, padding: '14px 26px 14px 10px', backgroundPosition: 'right 8px center' }}>
                        {OFFSET_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select value={form[dk]} onChange={(e) => set({ [dk]: e.target.value, periodTouched: true })} aria-label={i ? '청구 기간 끝 일' : '청구 기간 시작 일'} style={{ ...selectStyle, flex: 1, minWidth: 0, padding: '14px 26px 14px 10px', backgroundPosition: 'right 8px center' }}>
                        {Array.from({ length: 31 }, (_, k) => k + 1).map((d) => <option key={d} value={d}>{d === 31 ? '말일' : `${d}일`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={subLabel}>대금 납부 자동 입력</span>
                  <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>납부일에 청구 기간 사용 금액을 연결 계좌 지출로 기록해요</span>
                </span>
                <button
                  type="button" role="switch" aria-checked={!!form.autoBill} aria-label="대금 납부 자동 입력"
                  className={`ios-toggle${form.autoBill ? ' on' : ''}`} onClick={() => set({ autoBill: !form.autoBill })}
                ><span className="ios-toggle-knob" /></button>
              </label>
            </div>
          </div>
        )}

        {/* 주결제/주입금수단 — 세부 항목만(원천 그룹은 원천으로 고를 수 없음) */}
        {!isGroup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>주 수단 지정</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['payment', '주결제수단', '#FF3B5C', '#FDE8EE'], ['deposit', '주입금수단', '#1FB597', '#E5FBF6']].map(([key, label, fg, bg]) => {
              const disabled = key === 'deposit' && depositDisabled;
              const on = !disabled && form[key];
              return (
                <button
                  key={key} type="button" aria-pressed={on} aria-disabled={disabled} className="pill-toggle"
                  onClick={() => {
                    if (disabled) { setToast(`${typeLabel(isGroup ? form.groupType : parentType)} 그룹은 주입금수단으로 지정할 수 없어요`); setToastKey((k) => k + 1); return; }
                    set({ [key]: !form[key] });
                  }}
                  style={{
                    flex: 1, height: 40, borderRadius: 999, fontFamily: 'inherit', fontSize: 12.75, fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                    borderColor: on ? fg : 'var(--k-bd-efeef2)', background: on ? bg : 'var(--k-bg-fff)', color: on ? fg : 'var(--k-tx-8b8798)',
                  }}
                >{on ? `✓ ${label}` : label}</button>
              );
            })}
          </div>
        </div>
        )}

        {/* 카드 그룹 세부 항목: 디지털 온누리 연결(디지털 온누리 그룹이 있을 때, 기본 OFF) */}
        {!admin && cardItem && hasOnnuri && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
            <span style={labelStyle}>디지털 온누리 연결</span>
            <button
              type="button" role="switch" aria-checked={!!form.onnuri} aria-label="디지털 온누리 연결"
              className={`ios-toggle${form.onnuri ? ' on' : ''}`} onClick={() => set({ onnuri: !form.onnuri })}
            ><span className="ios-toggle-knob" /></button>
          </label>
        )}

        {/* 모든 세부 항목: 집계 포함(기본 ON). OFF 면 가계부 상단 합계·분류별/항목별 통계에서 제외 */}
        {!admin && !isGroup && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={labelStyle}>집계 포함</span>
              <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>끄면 가계부 합계와 분류별·항목별 통계에서 빠져요</span>
            </span>
            <button
              type="button" role="switch" aria-checked={!!form.includeTotals} aria-label="집계 포함"
              className={`ios-toggle${form.includeTotals ? ' on' : ''}`} onClick={() => set({ includeTotals: !form.includeTotals })}
            ><span className="ios-toggle-knob" /></button>
          </label>
        )}

        {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.name.trim()} onClick={save}>
          {busy ? '저장 중…' : isNew ? '추가' : '저장'}
        </button>
      </div>
    </div>
  );
}
