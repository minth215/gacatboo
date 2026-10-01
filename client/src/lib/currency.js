// 보조 화폐 목록(Frankfurter API가 지원하는 통화 중 자주 쓰는 것들) + 원화 환율 조회.
// Frankfurter(https://www.frankfurter.app)는 ECB 공시 환율을 API 키 없이 제공하는 무료 서비스로,
// 영업일 기준 하루 1회 갱신된다. 가계부 특성상 분·초 단위 실시간은 필요 없어 이 정도로 충분.
export const CURRENCIES = [
  { code: 'USD', name: '미국 달러' },
  { code: 'JPY', name: '일본 엔' },
  { code: 'EUR', name: '유로' },
  { code: 'CNY', name: '중국 위안' },
  { code: 'GBP', name: '영국 파운드' },
  { code: 'AUD', name: '호주 달러' },
  { code: 'CAD', name: '캐나다 달러' },
  { code: 'CHF', name: '스위스 프랑' },
  { code: 'HKD', name: '홍콩 달러' },
  { code: 'SGD', name: '싱가포르 달러' },
  { code: 'THB', name: '태국 바트' },
  { code: 'INR', name: '인도 루피' },
  { code: 'IDR', name: '인도네시아 루피아' },
  { code: 'PHP', name: '필리핀 페소' },
  { code: 'MYR', name: '말레이시아 링깃' },
  { code: 'NZD', name: '뉴질랜드 달러' },
  { code: 'TRY', name: '튀르키예 리라' },
  { code: 'MXN', name: '멕시코 페소' },
  { code: 'ZAR', name: '남아공 랜드' },
  { code: 'NOK', name: '노르웨이 크로네' },
  { code: 'SEK', name: '스웨덴 크로나' },
  { code: 'DKK', name: '덴마크 크로네' },
  { code: 'PLN', name: '폴란드 즈워티' },
  { code: 'CZK', name: '체코 코루나' },
  { code: 'HUF', name: '헝가리 포린트' },
  { code: 'ILS', name: '이스라엘 셰켈' },
  { code: 'RON', name: '루마니아 레우' },
  { code: 'BGN', name: '불가리아 레프' },
  { code: 'ISK', name: '아이슬란드 크로나' },
  { code: 'BRL', name: '브라질 헤알' },
];
export const CURRENCY_NAME = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.name]));

// 1 {code} = ? 원. 날짜별로 캐시(sessionStorage)해서 같은 날엔 API를 다시 부르지 않는다.
export async function fetchKrwRate(code) {
  if (!code || code === 'KRW') return 1;
  const cacheKey = `gacatboo_fx_${code}_${new Date().toISOString().slice(0, 10)}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return Number(cached);
  } catch {}
  const res = await fetch(`https://api.frankfurter.app/latest?from=${code}&to=KRW`);
  if (!res.ok) throw new Error('환율 정보를 가져오지 못했습니다.');
  const data = await res.json();
  const rate = data?.rates?.KRW;
  if (!rate) throw new Error('환율 정보를 가져오지 못했습니다.');
  try { sessionStorage.setItem(cacheKey, String(rate)); } catch {}
  return rate;
}
