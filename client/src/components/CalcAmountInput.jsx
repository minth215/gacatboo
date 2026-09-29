import { useState } from 'react';

const OP_CHARS = '+-×÷';
const OP_SYMBOL = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

// "12000+3000" 같은 수식 문자열을 계산(×÷ 우선순위 적용). 끝에 연산자가 남아 있으면 무시하고,
// 결과는 원 단위 정수로 반올림하며 음수는 0으로 clamp(금액은 항상 0 이상).
function evaluate(expr) {
  const tokens = [];
  let num = '';
  for (const ch of expr) {
    if (OP_CHARS.includes(ch)) { if (num) { tokens.push(num); num = ''; } tokens.push(ch); }
    else num += ch;
  }
  if (num) tokens.push(num);
  while (tokens.length && OP_CHARS.includes(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) return 0;

  const vals = [Number(tokens[0])];
  const lowOps = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const v = Number(tokens[i + 1]);
    if (op === '×') vals[vals.length - 1] *= v;
    else if (op === '÷') vals[vals.length - 1] = v === 0 ? vals[vals.length - 1] : vals[vals.length - 1] / v;
    else { lowOps.push(op); vals.push(v); }
  }
  let result = vals[0];
  for (let i = 0; i < lowOps.length; i++) result = lowOps[i] === '+' ? result + vals[i + 1] : result - vals[i + 1];
  return Math.max(0, Math.round(result));
}

// 숫자 토큰(정수부만 천 단위 콤마, 소수점 이하는 입력한 그대로 유지)
function formatNumberToken(numStr) {
  if (numStr === '') return '';
  const dotIdx = numStr.indexOf('.');
  if (dotIdx === -1) {
    const n = Number(numStr);
    return Number.isNaN(n) ? numStr : n.toLocaleString('ko-KR');
  }
  const intPart = numStr.slice(0, dotIdx);
  const decPart = numStr.slice(dotIdx + 1);
  const n = intPart === '' ? 0 : Number(intPart);
  return `${n.toLocaleString('ko-KR')}.${decPart}`;
}

// 편집 중인 수식을 "12,000 + 3,000" 형태로(숫자는 천 단위 콤마, 연산자 앞뒤 띄어쓰기) 표시용 포맷
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

const KeyBtn = ({ label, onClick, bg, color, style }) => (
  <button
    type="button" onClick={onClick}
    style={{
      height: 46, border: 'none', borderRadius: 12, background: bg || '#f4f2f0', color: color || '#191722',
      fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', ...style,
    }}
  >
    {label}
  </button>
);

// 금액 입력 전용: 포커스 시 네이티브 키패드 대신 사칙연산 계산기 키패드를 띄운다.
// 포커스 중엔 입력 중인 수식(예: "12,000 + 3,000")을, 포커스가 풀리면 계산된 최종 금액을 보여준다.
export default function CalcAmountInput({ value, onChange, placeholder = '0', autoFocus }) {
  const [focused, setFocused] = useState(false);
  const [expr, setExpr] = useState('');
  const [justEvaluated, setJustEvaluated] = useState(false);

  const open = () => { setExpr(value || ''); setJustEvaluated(false); setFocused(true); };
  const commit = (e) => { const result = evaluate(e); onChange(String(result)); return result; };
  const close = () => { commit(expr); setFocused(false); };

  // 연산자 뒤에서 시작하는(또는 맨 앞) 현재 입력 중인 숫자 구간만 잘라냄(소수점 중복 입력 방지용)
  const currentSegment = (s) => {
    let last = -1;
    for (const op of OP_CHARS) last = Math.max(last, s.lastIndexOf(op));
    return s.slice(last + 1);
  };

  const pressDigit = (d) => setExpr((prev) => {
    if (justEvaluated) { setJustEvaluated(false); return d; }
    if (prev === '0') return d;
    return prev + d;
  });
  const pressDot = () => setExpr((prev) => {
    if (justEvaluated) { setJustEvaluated(false); return '0.'; }
    const seg = currentSegment(prev);
    if (seg.includes('.')) return prev;
    return prev + (seg === '' ? '0.' : '.');
  });
  const pressOp = (op) => setExpr((prev) => {
    setJustEvaluated(false);
    if (!prev) return prev;
    if (OP_CHARS.includes(prev[prev.length - 1])) return prev.slice(0, -1) + op;
    return prev + op;
  });
  const pressBackspace = () => setExpr((prev) => prev.slice(0, -1));
  const pressClear = () => setExpr('');
  const pressEquals = () => { const result = commit(expr); setExpr(String(result)); setJustEvaluated(true); };

  const onKeyDown = (e) => {
    e.preventDefault();
    if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
    else if (e.key === '.') pressDot();
    else if (e.key === '+') pressOp('+');
    else if (e.key === '-') pressOp('-');
    else if (e.key === '*') pressOp('×');
    else if (e.key === '/') pressOp('÷');
    else if (e.key === 'Enter' || e.key === '=') pressEquals();
    else if (e.key === 'Backspace') pressBackspace();
    else if (e.key === 'Escape') close();
  };

  const displayValue = focused ? formatExpr(expr) : (value ? Number(value).toLocaleString('ko-KR') : '');

  return (
    <div style={{ position: 'relative' }}>
      <div className="with-suffix">
        <input
          readOnly value={displayValue} placeholder={placeholder} autoFocus={autoFocus}
          onFocus={open} onClick={open} onKeyDown={onKeyDown}
        />
        <span className="suffix">원</span>
      </div>

      {focused && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={close} />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
            background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 20px rgba(25,23,34,.12)',
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 2px 8px' }}>
              <button type="button" onClick={close} style={{ border: 'none', background: 'none', color: '#191722', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>완료</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <KeyBtn label="C" onClick={pressClear} bg="#fde8ee" color="#FF4358" />
              <KeyBtn label="⌫" onClick={pressBackspace} bg="#fde8ee" color="#FF4358" />
              <KeyBtn label="÷" onClick={() => pressOp('÷')} bg="#eef1fb" />
              <KeyBtn label="×" onClick={() => pressOp('×')} bg="#eef1fb" />
              <KeyBtn label="7" onClick={() => pressDigit('7')} />
              <KeyBtn label="8" onClick={() => pressDigit('8')} />
              <KeyBtn label="9" onClick={() => pressDigit('9')} />
              <KeyBtn label="−" onClick={() => pressOp('-')} bg="#eef1fb" />
              <KeyBtn label="4" onClick={() => pressDigit('4')} />
              <KeyBtn label="5" onClick={() => pressDigit('5')} />
              <KeyBtn label="6" onClick={() => pressDigit('6')} />
              <KeyBtn label="+" onClick={() => pressOp('+')} bg="#eef1fb" />
              <KeyBtn label="1" onClick={() => pressDigit('1')} />
              <KeyBtn label="2" onClick={() => pressDigit('2')} />
              <KeyBtn label="3" onClick={() => pressDigit('3')} />
              <KeyBtn label="." onClick={pressDot} />
              <KeyBtn label="0" onClick={() => pressDigit('0')} style={{ gridColumn: 'span 3' }} />
              <KeyBtn label="=" onClick={pressEquals} bg="#191722" color="#fff" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
