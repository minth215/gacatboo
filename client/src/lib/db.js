import { supabase } from './supabase.js';

// supabase 쿼리 에러를 통일된 형태로 던짐
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// 월 경계 [start, endExclusive). endExclusive = 다음 달 1일.
// Postgres date 는 '2026-06-31' 같은 잘못된 날짜를 거부하므로 상한을 배타적으로 둔다.
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start: `${month}-01`, endExclusive };
}

// 원천 id → "부모 > 자식" 형태의 스냅샷 이름 (플랫 목록 기준)
function sourceName(flat, id) {
  if (!id) return '';
  const s = flat.find((x) => x.id === id);
  if (!s) return '';
  if (s.parent_id) {
    const p = flat.find((x) => x.id === s.parent_id);
    return p ? `${p.name} > ${s.name}` : s.name;
  }
  return s.name;
}

const TX_SELECT =
  '*, group:groups(name), author:profiles!transactions_user_fk(display_name)';

// 조회 결과를 평탄화 (group_name, author_name)
function flattenTx(rows) {
  return (rows || []).map((r) => ({
    ...r,
    group_name: r.group?.name || null,
    author_name: r.author?.display_name || null,
  }));
}

export const db = {
  // ---------- 분류 ----------
  async listCategories(type) {
    let q = supabase.from('categories').select('*').order('sort_order').order('id');
    if (type) q = q.eq('type', type);
    return unwrap(await q);
  },
  async addCategory(userId, type, name, emoji = '') {
    const existing = unwrap(await supabase.from('categories').select('sort_order').eq('type', type).order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('categories').insert({ user_id: userId, type, name, emoji, sort_order: next }).select().single());
  },
  async updateCategory(id, patch) {
    return unwrap(await supabase.from('categories').update(patch).eq('id', id).select().single());
  },
  async deleteCategory(id) {
    return unwrap(await supabase.from('categories').delete().eq('id', id));
  },

  // ---------- 원천 ----------
  async listSources() {
    const flat = unwrap(await supabase.from('sources').select('*').order('sort_order').order('id'));
    const tops = flat.filter((s) => s.parent_id == null).map((t) => ({ ...t, children: flat.filter((c) => c.parent_id === t.id) }));
    return { tree: tops, flat };
  },
  async addSource(userId, name, parentId = null) {
    let q = supabase.from('sources').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
    const existing = unwrap(await q);
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('sources').insert({ user_id: userId, name, parent_id: parentId, sort_order: next }).select().single());
  },
  async updateSource(id, name) {
    return unwrap(await supabase.from('sources').update({ name }).eq('id', id).select().single());
  },
  async deleteSource(id) {
    return unwrap(await supabase.from('sources').delete().eq('id', id));
  },

  // ---------- 트랜잭션 ----------
  async listTransactions({ month, groupId = null }) {
    const { start, endExclusive } = monthBounds(month);
    let q = supabase.from('transactions').select(TX_SELECT).gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false });
    if (groupId) q = q.eq('group_id', groupId);
    else q = q.is('group_id', null);
    return flattenTx(unwrap(await q));
  },

  // 개인 가계부: 개인 항목 + 내가 속한 그룹 항목(반영)
  async listLedger({ month }) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select(TX_SELECT)
      .gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false }));
    return flattenTx(rows);
  },

  async getTransaction(id) {
    return unwrap(await supabase.from('transactions').select(TX_SELECT).eq('id', id).single());
  },

  async saveTransaction({ id, userId, payload, sourcesFlat }) {
    const category_name = payload.category_name ?? '';
    const source_name = payload.source_name !== undefined
      ? payload.source_name
      : sourceName(sourcesFlat || [], payload.source_id);
    const base = {
      type: payload.type,
      date: payload.date,
      amount: payload.amount,
      category_id: payload.category_id || null,
      category_name,
      category_emoji: payload.category_emoji ?? '',
      source_id: payload.source_id || null,
      source_name,
      content: (payload.content || '').trim(),
      memo: (payload.memo || '').trim(),
    };
    if (id) {
      return unwrap(await supabase.from('transactions').update(base).eq('id', id).select(TX_SELECT).single());
    }
    const insert = { ...base, user_id: userId, created_by: userId, group_id: payload.group_id || null };
    return unwrap(await supabase.from('transactions').insert(insert).select(TX_SELECT).single());
  },
  async deleteTransaction(id) {
    return unwrap(await supabase.from('transactions').delete().eq('id', id));
  },

  // ---------- 그룹 ----------
  async listGroups(userId) {
    // 내가 멤버인 그룹만 RLS로 노출됨
    const groups = unwrap(await supabase.from('groups').select('*, owner:profiles!groups_owner_id_fkey(display_name), group_members(count)')
      .order('created_at', { ascending: false }));
    return groups.map((g) => ({
      ...g,
      owner_name: g.owner?.display_name || '',
      member_count: g.group_members?.[0]?.count ?? 0,
    }));
  },
  async createGroup(userId, { name, description, category, category_emoji }) {
    const g = unwrap(await supabase.from('groups').insert({
      name, description: description || '', category, category_emoji: category_emoji || '', owner_id: userId,
    }).select().single());
    unwrap(await supabase.from('group_members').insert({ group_id: g.id, user_id: userId, role: 'owner' }));
    return g;
  },

  // ---------- 그룹 카테고리 (사용자별 선택지) ----------
  async listGroupCategories() {
    return unwrap(await supabase.from('group_categories').select('*').order('sort_order').order('id'));
  },
  async addGroupCategory(userId, name, emoji = '') {
    const existing = unwrap(await supabase.from('group_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('group_categories').insert({ user_id: userId, name, emoji, sort_order: next }).select().single());
  },
  async updateGroupCategory(id, patch) {
    return unwrap(await supabase.from('group_categories').update(patch).eq('id', id).select().single());
  },
  async deleteGroupCategory(id) {
    return unwrap(await supabase.from('group_categories').delete().eq('id', id));
  },
  async getGroup(id) {
    const group = unwrap(await supabase.from('groups').select('*, owner:profiles!groups_owner_id_fkey(display_name)').eq('id', id).single());
    const rows = unwrap(await supabase.from('group_members')
      .select('id, user_id, role, nickname, start_date, end_date, contact, profiles(username, display_name)')
      .eq('group_id', id));
    // 메모는 총무/총대만 조회 가능(RLS). 아니면 빈 결과.
    const notes = {};
    (unwrap(await supabase.from('group_member_notes').select('member_id, memo').eq('group_id', id)) || [])
      .forEach((n) => { notes[n.member_id] = n.memo; });
    const members = rows.map((m) => ({
      id: m.id, user_id: m.user_id, role: m.role,
      nickname: m.nickname || m.profiles?.display_name || '멤버',
      username: m.profiles?.username || null,
      is_account: !!m.user_id,
      start_date: m.start_date, end_date: m.end_date, contact: m.contact,
      memo: notes[m.id] || '',
    })).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : (a.nickname || '').localeCompare(b.nickname || '')));
    return { group: { ...group, owner_name: group.owner?.display_name || '' }, members };
  },
  async addMember(groupId, { nickname, start_date, end_date, contact, memo, username }) {
    let user_id = null;
    if (username && username.trim()) {
      const prof = unwrap(await supabase.from('profiles').select('id, status').eq('username', username.trim()).maybeSingle());
      if (!prof) throw new Error('해당 아이디의 사용자를 찾을 수 없습니다.');
      if (prof.status !== 'approved') throw new Error('승인된 사용자만 연결할 수 있습니다.');
      const exists = unwrap(await supabase.from('group_members').select('id').eq('group_id', groupId).eq('user_id', prof.id).maybeSingle());
      if (exists) throw new Error('이미 멤버로 추가된 계정입니다.');
      user_id = prof.id;
    }
    const row = unwrap(await supabase.from('group_members').insert({
      group_id: groupId, user_id, role: 'member',
      nickname: (nickname || '').trim(),
      start_date: start_date || null, end_date: end_date || null,
      contact: (contact || '').trim() || null,
    }).select('id').single());
    if (memo && memo.trim()) {
      unwrap(await supabase.from('group_member_notes').insert({ member_id: row.id, group_id: groupId, memo: memo.trim() }));
    }
    return row;
  },
  async updateMember(memberId, groupId, { nickname, start_date, end_date, contact, memo }) {
    unwrap(await supabase.from('group_members').update({
      nickname: (nickname || '').trim(),
      start_date: start_date || null, end_date: end_date || null,
      contact: (contact || '').trim() || null,
    }).eq('id', memberId));
    unwrap(await supabase.from('group_member_notes').upsert({ member_id: memberId, group_id: groupId, memo: (memo || '').trim() }));
  },
  async removeMember(memberId) {
    return unwrap(await supabase.from('group_members').delete().eq('id', memberId));
  },
  async deleteGroup(id) {
    return unwrap(await supabase.from('groups').delete().eq('id', id));
  },

  // ---------- 구독 설정 ----------
  async getSubscription(groupId) {
    return unwrap(await supabase.from('subscriptions').select('*').eq('group_id', groupId).maybeSingle());
  },
  async upsertSubscription(groupId, s) {
    return unwrap(await supabase.from('subscriptions').upsert({ group_id: groupId, ...s }).select().single());
  },

  // ---------- 결제 내역 (총대 지출 자동기입) ----------
  async listPayments(groupId) {
    return unwrap(await supabase.from('subscription_payments').select('*')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async createPayment(groupId, userId, p) {
    const tx = unwrap(await supabase.from('transactions').insert({
      user_id: userId, group_id: null, type: 'expense', date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), created_by: userId,
    }).select('id').single());
    const pay = unwrap(await supabase.from('subscription_payments').insert({
      group_id: groupId, date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), tx_id: tx.id, created_by: userId,
    }).select().single());
    // 미러 tx 에 원본 링크
    unwrap(await supabase.from('transactions').update({ origin_type: 'payment', origin_id: pay.id, origin_group_id: groupId }).eq('id', tx.id));
    return pay;
  },
  // 결제 수정 → 트리거가 미러 tx 동기화
  async updatePayment(id, p) {
    return unwrap(await supabase.from('subscription_payments').update({
      date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
    }).eq('id', id).select().single());
  },
  async deletePayment(id) {
    const pay = unwrap(await supabase.from('subscription_payments').select('tx_id').eq('id', id).single());
    unwrap(await supabase.from('subscription_payments').delete().eq('id', id));
    if (pay?.tx_id) unwrap(await supabase.from('transactions').delete().eq('id', pay.tx_id));
  },

  // ---------- 입금 내역 (총대 수입 + 멤버 지출 자동기입, RPC) ----------
  async listDeposits(groupId) {
    return unwrap(await supabase.from('subscription_deposits')
      .select('*, member:group_members(nickname)')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async createDeposit(p) {
    const { data, error } = await supabase.rpc('create_subscription_deposit', {
      p_group_id: p.group_id, p_member_id: p.member_id, p_date: p.date, p_amount: p.amount,
      p_periods: p.periods, p_category_name: p.category_name || '', p_category_emoji: p.category_emoji || '',
      p_source_id: p.source_id || null, p_source_name: p.source_name || '',
      p_deposit_source_name: p.deposit_source_name || '', p_content: p.content || '', p_memo: p.memo || '',
    });
    if (error) throw new Error(error.message);
    return data;
  },
  // 입금 수정 → 트리거가 총대/멤버 미러 tx 동기화 (RLS: 총대 또는 본인)
  async updateDeposit(id, p) {
    return unwrap(await supabase.from('subscription_deposits').update({
      date: p.date, amount: p.amount, periods: Math.max(Number(p.periods) || 1, 1),
      category_name: p.category_name || '', category_emoji: p.category_emoji || '',
      source_name: p.source_name || '', deposit_source_name: p.deposit_source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
    }).eq('id', id).select().single());
  },
  async deleteDeposit(id) {
    const { error } = await supabase.rpc('delete_subscription_deposit', { p_id: id });
    if (error) throw new Error(error.message);
  },

  // ---------- 관리자 ----------
  async listUsers() {
    const users = unwrap(await supabase.from('profiles').select('*').order('created_at', { ascending: false }));
    return users.sort((a, b) => (a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0));
  },
  async setUserStatus(id, status) {
    return unwrap(await supabase.from('profiles').update({ status }).eq('id', id));
  },
  async setUserRole(id, role) {
    return unwrap(await supabase.from('profiles').update({ role }).eq('id', id));
  },
  // ---------- 통계 (클라이언트 집계) ----------
  async personalStats(month, userId) {
    const [y, m] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 6, 1)); // 최근 6개월
    const startMonth = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const { endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select('type, amount, date, category_name')
      .is('group_id', null).eq('user_id', userId)
      .gte('date', `${startMonth}-01`).lt('date', endExclusive));

    const inMonth = (r) => r.date.slice(0, 7) === month;
    const cur = rows.filter(inMonth);
    const sum = (arr, t) => arr.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
    const income = sum(cur, 'income');
    const expense = sum(cur, 'expense');

    const byCat = (type) => {
      const map = {};
      cur.filter((r) => r.type === type).forEach((r) => {
        const n = r.category_name || '미분류';
        map[n] = (map[n] || 0) + Number(r.amount);
      });
      return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    };

    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const mrows = rows.filter((r) => r.date.slice(0, 7) === mm);
      trend.push({ month: mm, income: sum(mrows, 'income'), expense: sum(mrows, 'expense') });
    }

    return {
      totals: { income, expense, balance: income - expense },
      incomeByCategory: byCat('income'),
      expenseByCategory: byCat('expense'),
      trend,
    };
  },

  async groupStats(groupId, month, members) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select('type, amount, category_name, user_id')
      .eq('group_id', groupId).gte('date', start).lt('date', endExclusive));
    const sum = (arr, t) => arr.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
    const income = sum(rows, 'income');
    const expense = sum(rows, 'expense');

    const byMember = members.map((mem) => {
      const mr = rows.filter((r) => r.user_id === mem.user_id);
      return { name: mem.display_name, income: sum(mr, 'income'), expense: sum(mr, 'expense') };
    }).sort((a, b) => b.expense - a.expense);

    const catMap = {};
    rows.filter((r) => r.type === 'expense').forEach((r) => {
      const n = r.category_name || '미분류';
      catMap[n] = (catMap[n] || 0) + Number(r.amount);
    });
    const byCategory = Object.entries(catMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

    return { totals: { income, expense, balance: income - expense }, byMember, byCategory };
  },

  async createUser({ email, password, username, display_name, role }) {
    const { data, error } = await supabase.functions.invoke('admin', {
      body: { action: 'create_user', email, password, username, display_name, role },
    });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async deleteUser(id) {
    const { data, error } = await supabase.functions.invoke('admin', { body: { action: 'delete_user', id } });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
};
