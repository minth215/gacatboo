import { fmtNum, fmtForeign } from '../lib/format.js';

// 카드 우측 금액(가계부 카드와 동일): 보조 화폐로 입력한 기록이면 보조 화폐 금액을 크게, 그 아래 작은
// 회색 글씨로 원화 금액을 함께 표시. 기록 단위 화폐 정보가 없고 항목이 하나뿐이면 그 항목의 화폐 정보를 쓴다.
export function fxOf(row) {
  if (row?.input_currency) return { code: row.input_currency, amount: row.input_amount };
  const items = Array.isArray(row?.items) ? row.items : [];
  if (items.length === 1 && items[0]?.input_currency) return { code: items[0].input_currency, amount: items[0].input_amount };
  return null;
}

export default function FxAmount({ row, sign = '', color, style }) {
  const fx = fxOf(row);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 'none' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color, ...style }}>
        {sign}{fx ? fmtForeign(fx.amount, fx.code) : fmtNum(row?.amount)}
      </span>
      {fx && <span style={{ fontSize: 10.5, color: '#a29ead', marginTop: 1 }}>{sign}{fmtNum(row?.amount)} KRW</span>}
    </span>
  );
}
