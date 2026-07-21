# 가계부 (gacatboo)

모바일 반응형 가계부 웹 애플리케이션. 관리자 승인 기반 회원 관리, 월 단위 수입/지출 가계부, 통계, 그룹 공동 관리 기능을 제공합니다.

## 주요 기능

### 1. 회원 관리 (관리자 역할 분리)
- 가입 신청 → **관리자 승인** 후에만 로그인 가능 (`pending` / `approved` / `rejected` 상태)
- 관리자가 계정을 직접 생성(즉시 승인)하거나 역할(관리자/일반) 지정 가능
- 최초 실행 시 기본 관리자 계정 자동 생성: **`admin` / `admin1234`** (환경변수로 변경 가능)

### 2. 가계부 CRUD
- **월 단위 보드** — 이전/다음 달로 이동하며 관리
- **수입/지출** 구분 선택
- 작성 항목: 날짜 / 금액 / **분류** / **원천** / 내용 / 메모
  - 분류(수입 기본): 월급 · 부수입 · 용돈 · 금융소득 — 사용자 편집 가능
  - 분류(지출 기본): 식당 · 교통 · 쇼핑 · 문화생활 · 통신 · 보험 · 병원 · 교육 · 구독 · 기타 — 사용자 편집 가능
  - 원천: 현금 / 은행 / 카드 / 기타 (2단계 트리) — 은행 아래 우리은행·국민은행, 카드 아래 삼성카드 등 세부 항목 추가 편집 가능

### 3. 통계
- 월별 수입/지출 합계, 최근 6개월 추이(막대 그래프)
- 분류별 수입/지출 도넛 차트 + 비율

### 4. 그룹 기능
- 여행 / 구독 / 동거 / N빵 / 기타 카테고리로 그룹 생성 (생성자가 **총무**)
- 항목: 그룹명 / 설명 / 카테고리
- 그룹 내 작성 항목은 **참여 멤버 전원의 가계부에 반영**
- 그룹 내 **멤버별 통계** 제공
- 총무는 멤버 추가/제거 및 그룹 삭제 가능

> 그룹 기능은 기본 골격이며, 추후 상세화(정산/N빵 분배 등) 예정입니다.

## 기술 스택
- **백엔드**: Node.js + Express + better-sqlite3 (파일 기반 DB, 별도 설치 불필요) + JWT/bcrypt
- **프론트엔드**: React + Vite + React Router + Chart.js
- 모바일 우선 반응형 UI (하단 네비게이션, 바텀시트)

## 실행 방법

```bash
# 1. 의존성 설치 (server + client)
npm run install:all

# 2-A. 개발 모드 (server:4000, client:5173 동시 실행, /api 프록시)
npm run dev
# 브라우저에서 http://localhost:5173

# 2-B. 프로덕션 모드 (client 빌드 후 server가 정적 서빙)
npm run build
npm start
# 브라우저에서 http://localhost:4000
```

최초 로그인: **admin / admin1234**

### 환경 변수 (선택)
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `4000` | 서버 포트 |
| `ADMIN_USERNAME` | `admin` | 초기 관리자 아이디 |
| `ADMIN_PASSWORD` | `admin1234` | 초기 관리자 비밀번호 |
| `JWT_SECRET` | (개발용 기본값) | JWT 서명 키 — **운영 시 반드시 변경** |
| `DB_PATH` | `server/data.sqlite` | SQLite 파일 경로 |

## 프로젝트 구조
```
server/                Express API + SQLite
  src/db.js            스키마 · 기본값 시드 · 관리자 부트스트랩
  src/auth.js          JWT 발급 · 인증/관리자 미들웨어
  src/routes/          auth · admin · categories · sources · transactions · stats · groups
client/                React + Vite SPA
  src/pages/           Login · Register · Ledger · Stats · Settings · Groups · GroupDetail · Admin
  src/components/       Layout · Modal · TransactionForm · TransactionList
```
