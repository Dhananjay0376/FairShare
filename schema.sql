-- ============================================================
-- FairShare — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL).
-- Tables: profiles, groups, group_members, expenses,
--         expense_splits, settlements, activities
-- Includes Row Level Security so users only see their own groups.
-- ============================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------- Profiles ----------------
-- One row per auth user. Created by the app on first sign-in.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  upi_id       text,
  avatar_color text not null default '#6366f1',
  created_at   timestamptz not null default now()
);

-- ---------------- Groups ----------------
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'other',   -- trip | home | couple | event | other
  currency    text not null default 'INR',
  owner_id    uuid references profiles(id),
  invite_code text not null unique
              default upper(substr(md5(random()::text), 1, 6)),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------- Group members ----------------
create table if not exists group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null default 'member',   -- owner | member
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  unique (group_id, user_id)
);

-- ---------------- Expenses ----------------
-- amount_minor = amount in paise (integer, no float math)
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  description  text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency     text not null default 'INR',
  category     text not null default 'other',
  expense_date date not null default current_date,
  paid_by      uuid not null references profiles(id),
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz                      -- soft delete
);

-- ---------------- Expense splits ----------------
-- amount_minor = paise this user owes for the expense
create table if not exists expense_splits (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  amount_minor integer not null check (amount_minor >= 0),
  unique (expense_id, user_id)
);

-- ---------------- Settlements ----------------
create table if not exists settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  from_user_id uuid not null references profiles(id),  -- payer
  to_user_id   uuid not null references profiles(id),  -- receiver
  amount_minor integer not null check (amount_minor > 0),
  method       text not null default 'upi',            -- upi | cash | bank | other
  note         text,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

-- ---------------- Activity feed ----------------
create table if not exists activities (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  actor_id   uuid references profiles(id),
  kind       text not null,   -- group.created | member.joined | member.left
                              -- expense.created | expense.updated | expense.deleted
                              -- settlement.recorded
  summary    text not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);

-- ---------------- Indexes ----------------
create index if not exists idx_members_group   on group_members(group_id);
create index if not exists idx_members_user    on group_members(user_id);
create index if not exists idx_expenses_group  on expenses(group_id);
create index if not exists idx_expenses_payer  on expenses(paid_by);
create index if not exists idx_splits_expense  on expense_splits(expense_id);
create index if not exists idx_splits_user     on expense_splits(user_id);
create index if not exists idx_settle_group   on settlements(group_id);
create index if not exists idx_activity_group  on activities(group_id, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles        enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
alter table settlements     enable row level security;
alter table activities      enable row level security;

-- Helper: is the current user an active member of this group?
create or replace function is_group_member(g_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = g_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;

-- ---------------- profiles ----------------
create policy "profiles_read_all" on profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- ---------------- groups ----------------
create policy "groups_select_member" on groups
  for select using (is_group_member(id));

create policy "groups_insert_owner" on groups
  for insert with check (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "groups_update_owner" on groups
  for update using (owner_id = auth.uid());

-- ---------------- group_members ----------------
create policy "members_select" on group_members
  for select using (is_group_member(group_id));

create policy "members_insert_owner" on group_members
  for insert with check (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy "members_update_self_or_owner" on group_members
  for update using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ---------------- expenses ----------------
create policy "expenses_select" on expenses
  for select using (is_group_member(group_id));

create policy "expenses_insert" on expenses
  for insert with check (
    is_group_member(group_id)
    and created_by = auth.uid()
    and exists (
      select 1 from group_members m
      where m.group_id = expenses.group_id
        and m.user_id = expenses.paid_by
        and m.left_at is null
    )
  );

create policy "expenses_update" on expenses
  for update using (
    is_group_member(group_id)
    and (created_by = auth.uid()
         or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()))
  );

create policy "expenses_delete" on expenses
  for delete using (
    is_group_member(group_id)
    and (created_by = auth.uid()
         or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()))
  );

-- ---------------- expense_splits ----------------
create policy "splits_select" on expense_splits
  for select using (
    exists (select 1 from expenses e
            where e.id = expense_splits.expense_id
              and is_group_member(e.group_id))
  );

create policy "splits_write" on expense_splits
  for all using (
    exists (select 1 from expenses e
            where e.id = expense_splits.expense_id
              and is_group_member(e.group_id))
  )
  with check (
    exists (select 1 from expenses e
            where e.id = expense_splits.expense_id
              and is_group_member(e.group_id))
  );

-- ---------------- settlements ----------------
create policy "settlements_select" on settlements
  for select using (is_group_member(group_id));

create policy "settlements_insert" on settlements
  for insert with check (
    is_group_member(group_id)
    and created_by = auth.uid()
    and exists (select 1 from group_members m
                where m.group_id = settlements.group_id
                  and m.user_id = settlements.from_user_id
                  and m.left_at is null)
    and exists (select 1 from group_members m
                where m.group_id = settlements.group_id
                  and m.user_id = settlements.to_user_id
                  and m.left_at is null)
  );

-- ---------------- activities ----------------
create policy "activities_select" on activities
  for select using (is_group_member(group_id));

create policy "activities_insert" on activities
  for insert with check (is_group_member(group_id) and actor_id = auth.uid());

-- ============================================================
-- Join a group with an invite code (bypasses RLS safely)
-- ============================================================
create or replace function join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id   uuid;
  v_group_name text;
  v_actor_name text;
begin
  select id, name into v_group_id, v_group_name
  from groups
  where invite_code = upper(trim(p_code))
    and archived = false;

  if v_group_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  insert into group_members (group_id, user_id, role)
  values (v_group_id, auth.uid(), 'member')
  on conflict (group_id, user_id)
  do update set left_at = null, joined_at = now();

  select display_name into v_actor_name from profiles where id = auth.uid();

  insert into activities (group_id, actor_id, kind, summary)
  values (v_group_id, auth.uid(), 'member.joined',
          coalesce(v_actor_name, 'Someone') || ' joined ' || v_group_name);

  return v_group_id;
end;
$$;

grant execute on function join_group_by_code(text) to authenticated;
grant execute on function is_group_member(uuid) to authenticated;
