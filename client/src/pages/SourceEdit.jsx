import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { fieldStyle, labelStyle, optional } from './FriendAdd.jsx';

const isCardGroup = (t) => t === 'credit' || t === 'check';
const GROUP_TYPES = [['general', '일반'], ['credit', '신용카드'], ['check', '체크카드'], ['onnuri', '디지털 온누리']];
const TYPE_LABEL = Object.fromEntries(GROUP_TYPES);

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
      paymentDay: src?.payment_day ? String(src.payment_day) : '',
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
    if (busy) return;
    setBusy(true);
    const deposit = depositDisabled ? false : form.deposit;
    try {
      let sid = src?.id;
      if (isNew) {
        const row = await api.add(name, isGroup ? null : Number(form.parentId || parentId), isGroup ? form.groupType : null);
        sid = row.id;
        // 원천 그룹은 선택할 수 없으므로 같은 이름의 세부 항목을 함께 만들고, 주결제/주입금 지정도 그 항목에
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
      if (form.payment !== !!src?.is_primary_payment) await api.setPrimary(sid, 'payment', form.payment);
      if (deposit !== !!src?.is_primary_deposit) await api.setPrimary(sid, 'deposit', deposit);
      if (!admin && !isGroup) {
        const newBal = cardItem || form.balance === '' || form.balance === '-' ? null : Number(form.balance);
        // 금액을 직접 바꾸면 그 값이 새 기준 금액, 수정 시각이 기준 시점(그 날짜 이전 기록은 이미 반영된 것으로 봄).
        // 비우면 기준 없음(모든 기록 반영).
        const balanceChanged = !cardItem && newBal !== (src?.current_balance ?? null);
        const details = {
          linked_source_id: cardItem && form.linkedId ? Number(form.linkedId) : null,
          payment_day: creditItem && form.paymentDay ? Number(form.paymentDay) : null,
          onnuri_linked: cardItem && hasOnnuri && !!form.onnuri,
          ...(balanceChanged ? { balance: newBal, balance_set_at: newBal == null ? null : new Date().toISOString() } : {}),
        };
        const changed = balanceChanged || details.linked_source_id !== (src?.linked_source_id ?? null)
          || details.payment_day !== (src?.payment_day ?? null) || details.onnuri_linked !== !!src?.onnuri_linked;
        if (changed) await db.updateSourceDetails(sid, details);
      }
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const selectStyle = { ...fieldStyle, WebkitAppearance: 'none', appearance: 'none', paddingRight: 40, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23a29ead%27 stroke-width=%272.4%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' };
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
            <span style={labelStyle}>원천 그룹</span>
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

        {/* 일반 그룹 세부 항목: 금액 */}
        {!admin && !isGroup && !cardItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>금액{optional}</span>
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

        {/* 카드 그룹 세부 항목: 연결 계좌 */}
        {!admin && cardItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>연결 계좌{optional}</span>
            <select value={form.linkedId} onChange={(e) => set({ linkedId: e.target.value })} style={{ ...selectStyle, color: form.linkedId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
              <option value="">카드값이 빠져나갈 원천 선택</option>
              {/* 기록 페이지 원천 셀렉트처럼 원천 그룹 라벨 아래 세부 항목 */}
              {/* 카드·디지털 온누리 그룹 제외, 원천 그룹은 선택 불가(세부 항목만) */}
              {tree.filter((t) => !isCardGroup(t.group_type) && t.group_type !== 'onnuri' && t.children?.length).map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        {/* 신용카드 그룹 세부 항목: 대금 납부일 */}
        {!admin && creditItem && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>대금 납부일{optional}</span>
            <select value={form.paymentDay} onChange={(e) => set({ paymentDay: e.target.value })} style={{ ...selectStyle, color: form.paymentDay ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
              <option value="">납부일 선택</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>매달 {d}일</option>)}
            </select>
          </label>
        )}

        {/* 주결제/주입금수단 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>주 수단 지정{optional}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['payment', '주결제수단', '#2CDDB9', '#E5FBF6'], ['deposit', '주입금수단', '#FF8A00', '#FFF1DC']].map(([key, label, fg, bg]) => {
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

        {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.name.trim()} onClick={save}>
          {busy ? '저장 중…' : isNew ? '추가' : '저장'}
        </button>
      </div>
    </div>
  );
}
