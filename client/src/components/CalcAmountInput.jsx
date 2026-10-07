import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db.js';
import { CURRENCY_NAME, fetchKrwRate } from '../lib/currency.js';

const OP_CHARS = '+-×÷';
const OP_SYMBOL = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

// "%"가 붙은 숫자는 100으로 나눈 값으로 취급(예: 10000×10% = 10000×0.1 = 1000)
function numToken(tok) {
  return tok.endsWith('%') ? Number(tok.slice(0, -1)) / 100 : Number(tok);
}

// "12000×10%" 같은 수식 문자열을 계산(×÷ 우선순위 적용). 끝에 연산자가 남아 있으면 무시.
// round=true(기본, 원화)면 정수로 반올림, round=false(외화)면 소수점을 그대로 유지(센트 단위 보존).
// 결과는 항상 0 이상으로 clamp(금액은 음수가 될 수 없음).
function evaluate(expr, { round = true } = {}) {
  const tokens = [];
  let num = '';
  for (const ch of expr) {
    if (OP_CHARS.includes(ch)) { if (num) { tokens.push(num); num = ''; } tokens.push(ch); }
    else num += ch;
  }
  if (num) tokens.push(num);
  while (tokens.length && OP_CHARS.includes(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) return 0;

  const vals = [numToken(tokens[0])];
  const lowOps = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const v = numToken(tokens[i + 1]);
    if (op === '×') vals[vals.length - 1] *= v;
    else if (op === '÷') vals[vals.length - 1] = v === 0 ? vals[vals.length - 1] : vals[vals.length - 1] / v;
    else { lowOps.push(op); vals.push(v); }
  }
  let result = vals[0];
  for (let i = 0; i < lowOps.length; i++) result = lowOps[i] === '+' ? result + vals[i + 1] : result - vals[i + 1];
  const clamped = Math.max(0, result);
  return round ? Math.round(clamped) : clamped;
}

// 숫자 토큰(정수부만 천 단위 콤마, 소수점 이하·% 는 입력한 그대로 유지)
function formatNumberToken(numStr) {
  if (numStr === '') return '';
  const pct = numStr.endsWith('%');
  const core = pct ? numStr.slice(0, -1) : numStr;
  const dotIdx = core.indexOf('.');
  let formatted;
  if (dotIdx === -1) {
    const n = Number(core);
    formatted = Number.isNaN(n) ? core : n.toLocaleString('ko-KR');
  } else {
    const intPart = core.slice(0, dotIdx);
    const decPart = core.slice(dotIdx + 1);
    const n = intPart === '' ? 0 : Number(intPart);
    formatted = `${n.toLocaleString('ko-KR')}.${decPart}`;
  }
  return pct ? `${formatted}%` : formatted;
}

// 편집 중인 수식을 "12,000 × 10%" 형태로(숫자는 천 단위 콤마, 연산자 앞뒤 띄어쓰기) 표시용 포맷
function formatExpr(expr) {
  if (!expr) return '';
  let out = '';
  let num = '';
  for (const ch of expr) {
    if (OP_CHARS.includes(ch)) {
      out += formatNumberToken(num);
      num = '';
      out += ` ${OP_SYMBOL[ch]} `;
    } else {
      num += ch;
    }
  }
  out += formatNumberToken(num);
  return out;
}

// onClick 대신 onPointerDown 으로 즉시 반응(터치 클릭 합성 지연으로 인한 빠른 연타 시
// 입력 누락을 방지). 눌림 표시는 CSS :active(.calc-key)로 처리.
const KeyBtn = ({ label, onClick, bg, color, style }) => (
  <button
    type="button" className="calc-key"
    onPointerDown={(e) => { e.preventDefault(); onClick(); }}
    style={{
      height: 46, border: 'none', borderRadius: 12, background: bg || '#f4f2f0', color: color || '#191722',
      fontSize: 16, fontWeight: 700, fontFamily: 'inherit', ...style,
    }}
  >
    {label}
  </button>
);

// 금액 입력 전용: 포커스 시 네이티브 키패드 대신 사칙연산 계산기 키패드를 띄운다.
// 포커스 중엔 입력 중인 수식(예: "12,000 × 10%")을, 포커스가 풀리면 계산된 최종 금액(항상 원화)을 보여준다.
// 보조 화폐(설정에서 추가)가 있으면 키패드 상단에 통화 선택 칩이 뜨고, 원화가 아닌 통화를 고르면
// 입력값을 그 통화의 금액으로 해석해 환율로 환산한 원화 금액을 회색 글씨로 함께 보여주며,
// 그 금액은 눌러서 직접 수정할 수 있다. initialCurrency/initialForeignAmount 는 기존 거래 수정 시
// 원래 입력했던 외화 금액을 복원하기 위한 값이고, onCurrencyChange 는 저장용 스냅샷
// ({ input_currency, input_amount, fx_rate } 또는 원화면 null)을 매 확정 시점에 알려준다.
// compact=true: 영수증형 기록의 좁은 항목 행에 들어갈 때 쓰는 테두리 없는 작은 표시(원 단위
// 접미사·환산 금액 미리보기 줄은 생략하고, 펼쳐지는 계산기 키패드는 그대로 동작).
export default function CalcAmountInput({ value, onChange, placeholder = '0', autoFocus, initialCurrency, initialForeignAmount, onCurrencyChange, compact = false }) {
  const [focused, setFocused] = useState(false);
  const [expr, setExpr] = useState('');
  const justEvaluatedRef = useRef(false);
  const firstOpenRef = useRef(true);
  const rootRef = useRef(null);

  const [userCurrencies, setUserCurrencies] = useState([]);
  const [currency, setCurrency] = useState(initialCurrency || 'KRW');
  const [foreignAmount, setForeignAmount] = useState(initialForeignAmount != null ? String(initialForeignAmount) : '');
  const [rate, setRate] = useState(currency === 'KRW' ? 1 : null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [manualKrw, setManualKrw] = useState(null);
  const [editingKrw, setEditingKrw] = useState(false);
  const [krwDraft, setKrwDraft] = useState('');

  useEffect(() => { db.listCurrencies().then(setUserCurrencies).catch(() => {}); }, []);

  useEffect(() => {
    if (currency === 'KRW') { setRate(1); setRateError(''); return; }
    let cancelled = false;
    setRateLoading(true); setRateError('');
    fetchKrwRate(currency)
      .then((r) => { if (!cancelled) setRate(r); })
      .catch((e) => { if (!cancelled) setRateError(e.message || '환율 조회 실패'); })
      .finally(() => { if (!cancelled) setRateLoading(false); });
    return () => { cancelled = true; };
  }, [currency]);

  const typedAmount = useMemo(() => evaluate(expr, { round: currency === 'KRW' }), [expr, currency]);
  useEffect(() => { setManualKrw(null); setEditingKrw(false); }, [typedAmount, currency]);

  const open = () => {
    if (firstOpenRef.current && currency !== 'KRW' && initialForeignAmount != null) {
      setExpr(String(initialForeignAmount));
    } else {
      setExpr(currency === 'KRW' ? (value || '') : (foreignAmount || ''));
    }
    firstOpenRef.current = false;
    justEvaluatedRef.current = false;
    setFocused(true);
  };

  const commitAndNotify = () => {
    if (currency === 'KRW') {
      onChange(String(typedAmount));
      onCurrencyChange?.(null);
    } else {
      const krw = manualKrw != null ? Number(manualKrw) : Math.round(typedAmount * (rate || 0));
      setForeignAmount(String(typedAmount));
      onChange(String(krw));
      onCurrencyChange?.({ input_currency: currency, input_amount: typedAmount, fx_rate: rate ?? null });
    }
  };
  // 금액 필드 아래의 회색 환산 금액을 직접 고칠 때(키패드가 닫혀 있어도 동작) — 즉시 부모에 반영
  const commitManualKrw = (krwStr) => {
    const krw = Number(krwStr) || 0;
    const amt = focused ? typedAmount : Number(foreignAmount || 0);
    setManualKrw(krwStr);
    setEditingKrw(false);
    onChange(String(krw));
    onCurrencyChange?.({ input_currency: currency, input_amount: amt, fx_rate: rate ?? null });
  };
  // 환율이 아직 로딩 중이면 닫기를 막아서(완료 버튼·바깥 탭·Esc 전부) 0원으로 저장되는 것을 방지
  const close = () => {
    if (currency !== 'KRW' && rateLoading) return;
    commitAndNotify();
    setFocused(false);
  };
  // close 는 매 렌더마다 새로 만들어지므로 ref 에 최신 버전을 담아 두고 바깥 클릭 리스너에서 참조한다.
  const closeRef = useRef(close);
  closeRef.current = close;

  // 키패드가 떠 있는 동안 바깥(다른 필드 등)을 누르면 키패드를 닫는다. 예전엔 전체 화면을 덮는 투명
  // 오버레이에 onClick 으로 닫았는데, 그러면 그 첫 클릭이 오버레이에 먹혀 정작 누르려던 필드(날짜/분류 등)엔
  // 전달되지 않아 한 번 더 눌러야 했다. pointerdown 시점에 state 로 키패드를 먼저 닫아 버리면, 뒤이어
  // 발생하는 click 이벤트가 도달할 때는 이미 오버레이가 사라져 있어 같은 탭 한 번으로 그 필드가 바로 열린다.
  useEffect(() => {
    if (!focused) return;
    const onPointerDownOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closeRef.current();
    };
    document.addEventListener('pointerdown', onPointerDownOutside);
    return () => document.removeEventListener('pointerdown', onPointerDownOutside);
  }, [focused]);

  // 연산자 뒤에서 시작하는(또는 맨 앞) 현재 입력 중인 숫자 구간만 잘라냄(소수점·% 중복 입력 방지용)
  const currentSegment = (s) => {
    let last = -1;
    for (const op of OP_CHARS) last = Math.max(last, s.lastIndexOf(op));
    return s.slice(last + 1);
  };

  const pressDigit = (d) => setExpr((prev) => {
    if (justEvaluatedRef.current) { justEvaluatedRef.current = false; return d; }
    if (currentSegment(prev).endsWith('%')) return prev; // % 뒤엔 연산자를 눌러야 새 숫자를 시작할 수 있음
    if (prev === '0') return d;
    return prev + d;
  });
  const pressDot = () => setExpr((prev) => {
    if (justEvaluatedRef.current) { justEvaluatedRef.current = false; return '0.'; }
    const seg = currentSegment(prev);
    if (seg.includes('.') || seg.endsWith('%')) return prev;
    return prev + (seg === '' ? '0.' : '.');
  });
  const pressPercent = () => setExpr((prev) => {
    justEvaluatedRef.current = false;
    const seg = currentSegment(prev);
    if (!seg || seg.endsWith('%')) return prev;
    return prev + '%';
  });
  const pressOp = (op) => setExpr((prev) => {
    justEvaluatedRef.current = false;
    if (!prev) return prev;
    if (OP_CHARS.includes(prev[prev.length - 1])) return prev.slice(0, -1) + op;
    return prev + op;
  });
  const pressBackspace = () => setExpr((prev) => prev.slice(0, -1));
  const pressClear = () => setExpr('');
  const pressEquals = () => {
    if (currency !== 'KRW' && rateLoading) return; // 환율 로딩 중엔 확정 보류(0원으로 확정되는 것 방지)
    commitAndNotify();
    setExpr(String(typedAmount));
    justEvaluatedRef.current = true;
  };

  const onKeyDown = (e) => {
    e.preventDefault();
    if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
    else if (e.key === '.') pressDot();
    else if (e.key === '%') pressPercent();
    else if (e.key === '+') pressOp('+');
    else if (e.key === '-') pressOp('-');
    else if (e.key === '*') pressOp('×');
    else if (e.key === '/') pressOp('÷');
    else if (e.key === 'Enter' || e.key === '=') pressEquals();
    else if (e.key === 'Backspace') pressBackspace();
    else if (e.key === 'Escape') close();
  };

  // 닫혀 있을 때도(처음 진입했을 때 포함) 외화로 입력된 거래면 그 통화로 표시(값은 항상 원화 그대로 유지)
  const displayValue = focused
    ? formatExpr(expr)
    : (currency !== 'KRW' && foreignAmount
        ? Number(foreignAmount).toLocaleString('ko-KR')
        : (value ? Number(value).toLocaleString('ko-KR') : ''));
  // 회색 환산 금액 미리보기: 입력 중엔 실시간 수식 결과, 닫혀 있으면 마지막으로 확정된 외화 금액 기준
  const previewAmount = focused ? typedAmount : Number(foreignAmount || 0);
  const previewKrw = manualKrw != null ? Number(manualKrw) : Math.round(previewAmount * (rate || 0));

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {compact ? (
        <input
          readOnly value={displayValue} placeholder={placeholder} autoFocus={autoFocus}
          onFocus={open} onClick={open} onKeyDown={onKeyDown}
          style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#191722', outline: 'none', textAlign: 'right', padding: 0 }}
        />
      ) : (
        <div className="with-suffix">
          <input
            readOnly value={displayValue} placeholder={placeholder} autoFocus={autoFocus}
            onFocus={open} onClick={open} onKeyDown={onKeyDown}
          />
          <span className="suffix">{currency !== 'KRW' ? currency : '원'}</span>
        </div>
      )}

      {/* 원화 환산 금액 — 키패드가 닫혀 있어도 금액 필드 바로 아래 항상 표시, 눌러서 직접 수정 가능.
          compact 에서는 좁은 항목 행 칸을 벗어나지 않도록 절대위치로 오른쪽 아래에 떠 있게 한다. */}
      {currency !== 'KRW' && (
        <div style={compact
          ? { position: 'absolute', top: '100%', right: 0, marginTop: 2, fontSize: 10.5, color: '#a29ead', whiteSpace: 'nowrap', background: '#fff', padding: '2px 4px', borderRadius: 6, boxShadow: '0 2px 8px rgba(25,23,34,.1)', zIndex: 5 }
          : { padding: '6px 2px 0', fontSize: 12.5, color: '#a29ead' }
        }>
          {rateLoading ? '환율 조회 중…' : rateError ? rateError : editingKrw ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>≈ ₩</span>
              <input
                type="text" inputMode="numeric" autoFocus value={krwDraft}
                onChange={(e) => setKrwDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => commitManualKrw(krwDraft || '0')}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                style={{ width: 110, border: '1px solid #e4e2e6', borderRadius: 8, padding: '3px 6px', fontSize: 12.5, color: '#191722', fontFamily: 'inherit' }}
              />
            </span>
          ) : (
            <span onClick={() => { setKrwDraft(String(previewKrw)); setEditingKrw(true); }} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>
              ≈ ₩{previewKrw.toLocaleString('ko-KR')} (눌러서 수정)
            </span>
          )}
        </div>
      )}

      {focused && (
        <>
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
            background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 20px rgba(25,23,34,.12)',
            padding: '10px 12px calc(32px + env(safe-area-inset-bottom, 0px))',
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 2px 8px' }}>
              <button
                type="button" onClick={close} disabled={currency !== 'KRW' && rateLoading}
                style={{ border: 'none', background: 'none', color: (currency !== 'KRW' && rateLoading) ? '#c7c3cc' : '#191722', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {(currency !== 'KRW' && rateLoading) ? '환율 조회 중…' : '완료'}
              </button>
            </div>

            {userCurrencies.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 2px 10px' }}>
                {['KRW', ...userCurrencies.map((c) => c.code)].map((code) => (
                  <button
                    key={code} type="button" className="calc-key"
                    onPointerDown={(e) => { e.preventDefault(); setCurrency(code); }}
                    style={{
                      flex: 'none', padding: '6px 14px', borderRadius: 999, border: 'none', fontSize: 12.5, fontWeight: 700,
                      background: currency === code ? '#191722' : '#f4f2f0', color: currency === code ? '#fff' : '#191722',
                    }}
                  >
                    {code === 'KRW' ? '원화' : (CURRENCY_NAME[code] || code)}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <KeyBtn label="⌫" onClick={pressBackspace} bg="#fde8ee" color="#FF4358" />
              <KeyBtn label="C" onClick={pressClear} bg="#fde8ee" color="#FF4358" />
              <KeyBtn label="%" onClick={pressPercent} bg="#eef1fb" />
              <KeyBtn label="÷" onClick={() => pressOp('÷')} bg="#eef1fb" />
              <KeyBtn label="7" onClick={() => pressDigit('7')} />
              <KeyBtn label="8" onClick={() => pressDigit('8')} />
              <KeyBtn label="9" onClick={() => pressDigit('9')} />
              <KeyBtn label="×" onClick={() => pressOp('×')} bg="#eef1fb" />
              <KeyBtn label="4" onClick={() => pressDigit('4')} />
              <KeyBtn label="5" onClick={() => pressDigit('5')} />
              <KeyBtn label="6" onClick={() => pressDigit('6')} />
              <KeyBtn label="−" onClick={() => pressOp('-')} bg="#eef1fb" />
              <KeyBtn label="1" onClick={() => pressDigit('1')} />
              <KeyBtn label="2" onClick={() => pressDigit('2')} />
              <KeyBtn label="3" onClick={() => pressDigit('3')} />
              <KeyBtn label="+" onClick={() => pressOp('+')} bg="#eef1fb" />
              <KeyBtn label="0" onClick={() => pressDigit('0')} style={{ gridColumn: 'span 2' }} />
              <KeyBtn label="." onClick={pressDot} />
              <KeyBtn label="=" onClick={pressEquals} bg="#191722" color="#fff" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
