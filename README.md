# 가계부 (gacatboo)

모바일 반응형 가계부 웹 애플리케이션. **Supabase(Postgres + Auth + RLS)** 백엔드 위에서 React 프론트엔드가 직접 동작합니다. 관리자 승인 기반 회원 관리, 월 단위 수입/지출 가계부, 통계, 그룹 공동 관리 기능을 제공합니다.

## 아키텍처

```
client (React + Vite)  ──supabase-js──▶  Supabase
  · 페이지/컴포넌트                         · Postgres (스키마 + RLS 정책)
  · lib/db.js  데이터 접근 계층              · Auth (이메일/비밀번호)
  · lib/auth.jsx  세션·승인 게이트           · Edge Function `admin` (계정 생성/삭제)
```

- **인증**: Supabase Auth (이메일/비밀번호). 가입 시 프로필은 `pending` 상태로 생성되며, **관리자 승인(`approved`) 전에는 로그인이 차단**됩니다.
- **보안**: 모든 테이블에 **RLS(행 수준 보안)** 적용 — 각 사용자는 본인 데이터와 참여 그룹 데이터만 접근.
- **관리자 승인/역할 변경**: RLS로 보호된 `profiles` 업데이트(관리자만).
- **계정 생성/삭제**(service_role 필요): Edge Function `admin` 을 통해 처리.
- **최초 가입자는 자동으로 관리자(승인)** 로 부트스트랩됩니다.

## 주요 기능

### 1. 회원 관리 (관리자 역할 분리)
- 가입 신청 → **관리자 승인** 후에만 로그인 (`pending` / `approved` / `rejected`)
- 관리자가 계정 직접 생성(즉시 승인)·역할(관리자/일반) 지정·차단·삭제

### 2. 가계부 CRUD
- **월 단위 보드** (이전/다음 달 이동), 수입/지출 구분
- 항목: 날짜 / 금액 / **분류** / **원천** / 내용 / 메모
  - 분류 기본값(수입: 월급·부수입·용돈·금융소득 / 지출: 식당·교통·쇼핑·문화생활·통신·보험·병원·교육·구독·기타) — 편집 가능
  - 원천: 현금 / 은행 / 카드 / 기타 (2단계 트리, 예: 은행 > 우리은행) — 편집 가능

### 3. 통계
- 월별 수입/지출 합계, 최근 6개월 추이(막대), 분류별 도넛 차트

### 4. 그룹 기능
- 여행 / 구독 / 동거 / N빵 / 기타 카테고리로 그룹 생성 (생성자가 **총무**)
- 그룹 항목은 **참여 멤버 전원의 가계부에 반영**, **멤버별 통계** 제공
- 총무는 멤버 추가/제거·그룹 삭제 가능

## 기술 스택
- **프론트엔드**: React · Vite · React Router · Chart.js · @supabase/supabase-js
- **백엔드**: Supabase (Postgres, Auth, RLS, Edge Functions)

---

## 설치 & 실행

### 1) Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** 에서 마이그레이션을 순서대로 실행
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — 테이블 · RLS 정책 · 트리거 · 기본값 시드
   - [`supabase/migrations/0002_emoji_group_categories.sql`](supabase/migrations/0002_emoji_group_categories.sql) — 분류 이모지 · 사용자 편집형 그룹 카테고리 (기존 사용자 백필 포함)
3. **Authentication > Providers > Email** 활성화. 테스트 편의를 위해
   **Authentication > Sign In / Providers > "Confirm email"** 을 끄면 가입 즉시 로그인 흐름을 확인하기 쉽습니다.

### 2) 프론트엔드 환경 변수
```bash
cp client/.env.example client/.env
```
`client/.env` 를 프로젝트 값으로 채웁니다 (Supabase > **Project Settings > API**):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # anon public key
```

### 3) 실행
```bash
npm run install:all   # client 의존성 설치
npm run dev           # http://localhost:5173
# 프로덕션 빌드
npm run build         # client/dist 생성 (Vercel/Netlify 등 정적 호스팅에 배포)
```

### 4) 최초 관리자 만들기
- 앱의 **가입 신청**으로 첫 계정을 만들면, 트리거가 이를 **관리자 + 승인** 상태로 지정합니다.
- 이후 가입자는 `pending` 상태 → 관리자가 **관리 탭**에서 승인.

### 5) (선택) 관리자 계정 생성/삭제 기능 — Edge Function 배포
관리 탭의 **＋ 계정 생성**, **삭제** 는 service_role 권한이 필요하므로 Edge Function 으로 처리합니다.
승인 흐름(가입 → 관리자 승인)만 쓴다면 배포하지 않아도 됩니다.

```bash
# Supabase CLI 설치 후
supabase login
supabase link --project-ref <YOUR-PROJECT-REF>
supabase functions deploy admin
```
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 는 Edge Function 런타임에 자동 주입됩니다.
  (service_role 키는 **절대 클라이언트/저장소에 노출하지 마세요.**)

---

## 프로젝트 구조
```
client/
  .env.example              Supabase 연결 값 예시
  src/
    lib/
      supabase.js           supabase 클라이언트
      auth.jsx              세션 복원 · 로그인/가입 · 승인 게이트
      db.js                 데이터 접근 계층(쿼리 + 클라이언트 집계 통계)
      format.js, chartSetup.js
    components/             Layout · Modal · TransactionForm · TransactionList
    pages/                  Login · Register · Ledger · Stats · Settings · Groups · GroupDetail · Admin
supabase/
  migrations/0001_init.sql  스키마 · RLS · 트리거 · 시드
  functions/admin/index.ts  관리자 계정 생성/삭제 Edge Function
```

## 보안 메모
- RLS가 데이터 접근을 강제하므로 anon key는 공개되어도 안전합니다(정책이 방어).
- "승인된 계정만 로그인"은 앱 레벨(로그인 시 상태 검사 + 자동 로그아웃)에서 강제합니다. 필요 시 각 정책에 `status='approved'` 조건을 추가해 DB 레벨로도 강화할 수 있습니다.
- 원천/분류를 삭제해도 기존 항목에는 이름이 스냅샷으로 저장되어 표시가 유지됩니다.
