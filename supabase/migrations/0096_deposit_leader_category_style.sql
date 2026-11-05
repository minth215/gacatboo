-- =====================================================================
-- 0096: 입금 내역의 총무(총대) 가계부 기록은 총무의 분류 설정(이모지·배경색)을 따름
--   · 멤버가 직접 정산 완료 처리하면 입금이 멤버 화면에서 만들어져, 총무 가계부 기록에 멤버의 분류
--     이모지가 들어가던 문제. 입금으로 생긴 수입 기록(origin_type='deposit')은 저장될 때마다
--     기록 주인(총무)의 같은 이름 수입 분류로 분류 id·이모지·배경색을 맞춘다.
--   · 기존 기록도 한 번 맞춤.
-- 0001~0095 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.trg_deposit_income_category_style()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.origin_type = 'deposit' and new.type = 'income' and coalesce(new.category_name, '') <> '' then
    select id, emoji, color into c from public.categories
    where user_id = new.user_id and type = 'income' and name = new.category_name
    order by sort_order, id limit 1;
    if c.id is not null then
      new.category_id := c.id;
      new.category_emoji := coalesce(c.emoji, '');
      new.category_color := coalesce(c.color, '');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_income_category_style on public.transactions;
create trigger deposit_income_category_style
  before insert or update on public.transactions
  for each row execute function public.trg_deposit_income_category_style();

update public.transactions t
set category_id = c.id, category_emoji = coalesce(c.emoji, ''), category_color = coalesce(c.color, '')
from public.categories c
where t.origin_type = 'deposit' and t.type = 'income'
  and c.user_id = t.user_id and c.type = 'income' and c.name = t.category_name
  and (t.category_emoji is distinct from coalesce(c.emoji, '') or t.category_color is distinct from coalesce(c.color, '') or t.category_id is distinct from c.id);
