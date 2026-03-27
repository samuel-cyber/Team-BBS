/*-- USERS TABLE
-- Stores every vendor's profile information
create table users (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  email text unique not null,
  phone text,
  market_location text,
  product_categories text,
  identity_verified boolean default false,
  created_at timestamp default now()
);

-- SALES TABLE
-- Every single sale a vendor logs goes here
create table sales (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  product_name text not null,
  quantity integer not null,
  selling_price numeric not null,
  cost_price numeric not null,
  profit numeric generated always as (selling_price - cost_price) stored,
  sale_date date default current_date,
  created_at timestamp default now()
);

-- AJO GROUPS TABLE
-- Every ajo group created on the platform
create table ajo_groups (
  id uuid default gen_random_uuid() primary key,
  group_name text not null,
  created_by uuid references users(id),
  contribution_amount numeric not null,
  frequency text not null,
  max_members integer not null,
  current_members integer default 1,
  minimum_bcs integer default 40,
  status text default 'active',
  created_at timestamp default now()
);

-- AJO MEMBERS TABLE
-- Tracks which vendors are in which ajo groups
create table ajo_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references ajo_groups(id),
  user_id uuid references users(id),
  joined_at timestamp default now(),
  payout_position integer,
  has_received_payout boolean default false
);

-- TRADE POSTS TABLE
-- Community board posts from vendors
create table trade_posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  post_type text not null,
  title text not null,
  description text,
  location text,
  whatsapp_number text,
  created_at timestamp default now()
);*/

/*-- This function runs automatically every time a new user
-- signs up through Supabase auth (any method)
-- It creates a minimal row in our users table using only
-- the data Supabase already has from Google/Facebook/email
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, identity_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    false
  )
  on conflict (id) do nothing;
  -- on conflict means: if this user id already exists, skip silently
  -- this prevents any duplicate row errors
  return new;
end;
$$ language plpgsql security definer;

-- Attach the function to the auth.users table as a trigger
-- so it fires automatically on every new signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Make sure the email column is unique so duplicates are impossible
alter table public.users
  add constraint users_email_unique unique (email);*/

-- ══════════════════════════════════════════
-- SUWE — Full Database Setup
-- Run this entirely in one go
-- ══════════════════════════════════════════
/*
-- SALES TABLE
drop table if exists sales cascade;
create table sales (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      integer not null default 1,
  unit          text default 'units',
  selling_price numeric not null default 0,
  cost_price    numeric not null default 0,
  profit        numeric generated always as (selling_price - cost_price) stored,
  sale_date     date not null default current_date,
  created_at    timestamptz default now()
);

-- INVENTORY TABLE
drop table if exists inventory cascade;
create table inventory (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      integer not null default 0,
  unit          text default 'units',
  reorder_level integer default 5,
  updated_at    timestamptz default now(),
  unique(user_id, item_name)
);

-- USERS TABLE (safe update)
create table if not exists users (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  email              text,
  phone              text,
  market_location    text,
  product_categories text,
  trading_years      text,
  identity_verified  boolean default false,
  bvn_submitted      boolean default false,
  bvn_verified       boolean default false,
  created_at         timestamptz default now()
);
alter table users add column if not exists bvn_verified boolean default false;
alter table users add column if not exists trading_years text;
alter table users add column if not exists bvn_submitted boolean default false;

-- AJO GROUPS
create table if not exists ajo_groups (
  id                  uuid default gen_random_uuid() primary key,
  group_name          text not null,
  created_by          uuid references auth.users(id),
  contribution_amount numeric not null,
  frequency           text not null,
  max_members         integer not null,
  current_members     integer default 1,
  minimum_bcs         integer default 40,
  status              text default 'active',
  created_at          timestamptz default now()
);

-- AJO MEMBERS
create table if not exists ajo_members (
  id                  uuid default gen_random_uuid() primary key,
  group_id            uuid references ajo_groups(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete cascade,
  joined_at           timestamptz default now(),
  payout_position     integer,
  has_received_payout boolean default false,
  unique(group_id, user_id)
);

-- TRADE POSTS
create table if not exists trade_posts (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  post_type       text not null,
  title           text not null,
  description     text,
  location        text,
  whatsapp_number text,
  created_at      timestamptz default now()
);

-- ══════════════════════════════════════════
-- ROW LEVEL SECURITY — THIS IS THE BUG FIX
-- Without these policies, all DB writes fail
-- ══════════════════════════════════════════

alter table sales       enable row level security;
alter table inventory   enable row level security;
alter table users       enable row level security;
alter table ajo_groups  enable row level security;
alter table ajo_members enable row level security;
alter table trade_posts enable row level security;

-- Drop all existing policies first (clean slate)
drop policy if exists "sales_insert"        on sales;
drop policy if exists "sales_select"        on sales;
drop policy if exists "sales_update"        on sales;
drop policy if exists "sales_delete"        on sales;
drop policy if exists "inventory_all"       on inventory;
drop policy if exists "users_select"        on users;
drop policy if exists "users_insert"        on users;
drop policy if exists "users_update"        on users;
drop policy if exists "ajo_groups_select"   on ajo_groups;
drop policy if exists "ajo_groups_insert"   on ajo_groups;
drop policy if exists "ajo_members_select"  on ajo_members;
drop policy if exists "ajo_members_insert"  on ajo_members;
drop policy if exists "trade_posts_select"  on trade_posts;
drop policy if exists "trade_posts_insert"  on trade_posts;

-- SALES
create policy "sales_insert" on sales for insert with check (auth.uid() = user_id);
create policy "sales_select" on sales for select using (auth.uid() = user_id);
create policy "sales_update" on sales for update using (auth.uid() = user_id);
create policy "sales_delete" on sales for delete using (auth.uid() = user_id);

-- INVENTORY
create policy "inventory_all" on inventory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- USERS
create policy "users_select" on users for select using (auth.uid() = id);
create policy "users_insert" on users for insert with check (auth.uid() = id);
create policy "users_update" on users for update using (auth.uid() = id);

-- AJO GROUPS (any logged-in user can browse)
create policy "ajo_groups_select" on ajo_groups for select using (auth.role() = 'authenticated');
create policy "ajo_groups_insert" on ajo_groups for insert with check (auth.uid() = created_by);

-- AJO MEMBERS
create policy "ajo_members_select" on ajo_members for select using (auth.uid() = user_id);
create policy "ajo_members_insert" on ajo_members for insert with check (auth.uid() = user_id);

-- TRADE POSTS (any logged-in user can read)
create policy "trade_posts_select" on trade_posts for select using (auth.role() = 'authenticated');
create policy "trade_posts_insert" on trade_posts for insert with check (auth.uid() = user_id);

-- ══════════════════════════════════════════
-- AUTO-CREATE USER ROW ON SIGNUP
-- ══════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, identity_verified, bvn_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    false, false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();*/

-- ══════════════════════════════════════════════════════════════
--  SUWE — Complete Database Schema v3
--  Run this ENTIRE file in Supabase Dashboard → SQL Editor
--  It is safe to run multiple times (uses IF NOT EXISTS + DROP IF EXISTS)
-- ══════════════════════════════════════════════════════════════
/*
-- ── EXTENSIONS ────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ══════════════════════════════════════════════════════════════
--  CORE TABLES
-- ══════════════════════════════════════════════════════════════

-- USERS
create table if not exists users (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  email              text,
  phone              text,
  market_location    text,
  state              text,           -- Nigerian state e.g. "Lagos", "Abuja"
  product_categories text,
  trading_years      text,
  bvn_verified       boolean default false,
  bvn_submitted      boolean default false,
  bvn_hash           text,           -- SHA-256 of BVN, never raw
  identity_verified  boolean default false,
  bcs_score          integer default 0,
  bcs_tier           text default 'Bronze',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- safe column additions for existing databases
alter table users add column if not exists state              text;
alter table users add column if not exists bvn_hash           text;
alter table users add column if not exists bcs_score          integer default 0;
alter table users add column if not exists bcs_tier           text default 'Bronze';
alter table users add column if not exists bvn_verified       boolean default false;
alter table users add column if not exists bvn_submitted      boolean default false;
alter table users add column if not exists trading_years      text;
alter table users add column if not exists updated_at         timestamptz default now();

-- SALES
drop table if exists sales cascade;
create table sales (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      numeric not null default 1,
  unit          text default 'units',
  selling_price numeric not null default 0,
  cost_price    numeric not null default 0,
  profit        numeric generated always as (selling_price - cost_price) stored,
  sale_date     date not null default current_date,
  created_at    timestamptz default now()
);

-- INVENTORY
drop table if exists inventory cascade;
create table inventory (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      numeric not null default 0,
  unit          text default 'units',
  reorder_level integer default 5,
  updated_at    timestamptz default now(),
  unique(user_id, item_name)
);

-- ══════════════════════════════════════════════════════════════
--  AJO SYSTEM TABLES
-- ══════════════════════════════════════════════════════════════

drop table if exists ajo_payouts   cascade;
drop table if exists ajo_payments  cascade;
drop table if exists ajo_invites   cascade;
drop table if exists ajo_members   cascade;
drop table if exists ajo_groups    cascade;

-- AJO GROUPS
create table ajo_groups (
  id                    uuid default gen_random_uuid() primary key,
  group_name            text not null,
  created_by            uuid references auth.users(id),
  contribution_amount   numeric not null,                    -- monthly per member
  max_members           integer not null check (max_members between 3 and 8),
  current_members       integer default 1,
  minimum_bcs           integer default 0,
  join_type             text not null default 'open',        -- 'open' | 'invite'
  status                text not null default 'forming',
  -- status values:
  --   'forming'  = created, not yet started, still accepting members
  --   'active'   = cycle running
  --   'paused'   = between cycles
  --   'closed'   = ended
  category              text,                               -- e.g. 'Food', 'Fabric', 'General'
  emoji                 text default '🔄',
  state                 text,                               -- Nigerian state of creator
  current_cycle         integer default 0,                  -- which month of the cycle we are on
  total_cycles          integer default 0,                  -- = final member count when cycle starts
  cycle_start_date      date,                               -- the first-of-month the cycle began
  pot_total             numeric default 0,                  -- contribution_amount * current_members
  description           text,
  is_public             boolean default true,
  created_at            timestamptz default now()
);

-- AJO MEMBERS
create table ajo_members (
  id                    uuid default gen_random_uuid() primary key,
  group_id              uuid references ajo_groups(id) on delete cascade not null,
  user_id               uuid references auth.users(id) on delete cascade not null,
  joined_at             timestamptz default now(),
  payout_position       integer,                            -- rank by BCS ascending (lowest pays out last)
  bcs_at_join           integer default 0,                  -- BCS locked at time of joining
  has_received_payout   boolean default false,
  status                text default 'active',              -- 'active' | 'grace' | 'removed'
  grace_started_at      timestamptz,                        -- when the 5-day grace period started
  unique(group_id, user_id)
);

-- AJO PAYMENTS (monthly contributions)
create table ajo_payments (
  id                    uuid default gen_random_uuid() primary key,
  group_id              uuid references ajo_groups(id) on delete cascade not null,
  user_id               uuid references auth.users(id) on delete cascade not null,
  amount                numeric not null,
  cycle_number          integer not null,
  payment_date          timestamptz default now(),
  due_date              date not null,
  status                text default 'paid',               -- 'paid' | 'pending' | 'overdue'
  interswitch_ref       text,                              -- transaction reference from Interswitch
  interswitch_status    text default 'pending'
);

-- AJO PAYOUTS (when someone receives the pot)
create table ajo_payouts (
  id                    uuid default gen_random_uuid() primary key,
  group_id              uuid references ajo_groups(id) on delete cascade not null,
  recipient_user_id     uuid references auth.users(id) on delete cascade not null,
  amount                numeric not null,
  cycle_number          integer not null,
  payout_date           date not null,
  status                text default 'pending',            -- 'pending' | 'sent' | 'failed'
  interswitch_ref       text,
  created_at            timestamptz default now()
);

-- AJO INVITES
create table ajo_invites (
  id                    uuid default gen_random_uuid() primary key,
  group_id              uuid references ajo_groups(id) on delete cascade not null,
  invited_by            uuid references auth.users(id) on delete cascade not null,
  invited_phone         text not null,                     -- phone number of invitee
  invited_user_id       uuid references auth.users(id),   -- filled when they sign up / match
  status                text default 'pending',            -- 'pending' | 'accepted' | 'declined'
  message               text,                             -- the invite message sent
  created_at            timestamptz default now(),
  responded_at          timestamptz
);

-- NOTIFICATIONS
drop table if exists notifications cascade;
create table notifications (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  type          text not null,
  -- type values: 'ajo_invite' | 'ajo_accepted' | 'ajo_payment_due' |
  --              'ajo_payout' | 'ajo_removed' | 'group_public' |
  --              'payment_received' | 'grace_warning'
  title         text not null,
  body          text not null,
  data          jsonb default '{}',  -- extra structured data (group_id, invite_id etc.)
  is_read       boolean default false,
  created_at    timestamptz default now()
);

-- TRADE POSTS
create table if not exists trade_posts (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  post_type       text not null,
  title           text not null,
  description     text,
  location        text,
  whatsapp_number text,
  created_at      timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

alter table sales          enable row level security;
alter table inventory      enable row level security;
alter table users          enable row level security;
alter table ajo_groups     enable row level security;
alter table ajo_members    enable row level security;
alter table ajo_payments   enable row level security;
alter table ajo_payouts    enable row level security;
alter table ajo_invites    enable row level security;
alter table notifications  enable row level security;
alter table trade_posts    enable row level security;

-- Drop all existing policies (clean slate)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- SALES
create policy "sales_own" on sales for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- INVENTORY
create policy "inventory_own" on inventory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- USERS: own row + members of same ajo group can read each other
create policy "users_own"   on users for all using (auth.uid() = id) with check (auth.uid() = id);
-- Allow reading other users only if in a shared ajo group
create policy "users_ajo_peer" on users for select using (
  exists (
    select 1 from ajo_members am1
    join ajo_members am2 on am1.group_id = am2.group_id
    where am1.user_id = auth.uid() and am2.user_id = users.id
  )
);

-- AJO GROUPS: forming + open groups visible to all authenticated users for browsing
create policy "ajo_groups_browse" on ajo_groups for select using (
  auth.role() = 'authenticated' and (
    is_public = true
    or created_by = auth.uid()
    or exists (
      select 1 from ajo_members where group_id = ajo_groups.id and user_id = auth.uid()
    )
  )
);
create policy "ajo_groups_insert" on ajo_groups for insert with check (auth.uid() = created_by);
create policy "ajo_groups_update" on ajo_groups for update using (
  auth.uid() = created_by or exists (
    select 1 from ajo_members where group_id = ajo_groups.id and user_id = auth.uid()
  )
);

-- AJO MEMBERS: see your own memberships + other members of same group
create policy "ajo_members_own" on ajo_members for select using (
  auth.uid() = user_id or
  exists (
    select 1 from ajo_members am where am.group_id = ajo_members.group_id and am.user_id = auth.uid()
  )
);
create policy "ajo_members_insert" on ajo_members for insert with check (auth.uid() = user_id);
create policy "ajo_members_update" on ajo_members for update using (
  auth.uid() = user_id or
  exists (select 1 from ajo_groups where id = ajo_members.group_id and created_by = auth.uid())
);

-- AJO PAYMENTS
create policy "ajo_payments_group" on ajo_payments for select using (
  auth.uid() = user_id or
  exists (
    select 1 from ajo_members where group_id = ajo_payments.group_id and user_id = auth.uid()
  )
);
create policy "ajo_payments_insert" on ajo_payments for insert with check (auth.uid() = user_id);
create policy "ajo_payments_update" on ajo_payments for update using (auth.uid() = user_id);

-- AJO PAYOUTS
create policy "ajo_payouts_group" on ajo_payouts for select using (
  auth.uid() = recipient_user_id or
  exists (
    select 1 from ajo_members where group_id = ajo_payouts.group_id and user_id = auth.uid()
  )
);

-- AJO INVITES
create policy "ajo_invites_own" on ajo_invites for select using (
  auth.uid() = invited_by or auth.uid() = invited_user_id
);
create policy "ajo_invites_insert" on ajo_invites for insert with check (auth.uid() = invited_by);
create policy "ajo_invites_update" on ajo_invites for update using (
  auth.uid() = invited_by or auth.uid() = invited_user_id
);

-- NOTIFICATIONS
create policy "notif_own" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TRADE POSTS
create policy "trade_posts_select" on trade_posts for select using (auth.role() = 'authenticated');
create policy "trade_posts_insert" on trade_posts for insert with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
--  STORED PROCEDURES / RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════

-- Safely increment member count
create or replace function increment_ajo_members(gid uuid)
returns void language plpgsql security definer as $$
begin
  update ajo_groups set current_members = current_members + 1 where id = gid;
end;
$$;

-- Safely decrement member count and delete group if below 3
create or replace function decrement_ajo_members(gid uuid)
returns void language plpgsql security definer as $$
declare
  new_count integer;
begin
  update ajo_groups set current_members = greatest(0, current_members - 1)
  where id = gid returning current_members into new_count;

  -- If below minimum of 3, mark as closed
  if new_count < 3 then
    update ajo_groups set status = 'closed' where id = gid;
  end if;
end;
$$;

-- Get count of active groups for a user
create or replace function get_user_active_group_count(uid uuid)
returns integer language plpgsql security definer as $$
declare
  cnt integer;
begin
  select count(*) into cnt
  from ajo_members am
  join ajo_groups ag on ag.id = am.group_id
  where am.user_id = uid and ag.status in ('forming', 'active') and am.status = 'active';
  return cnt;
end;
$$;

-- Get open groups near a user (same state first, then any)
create or replace function get_open_groups_near(uid uuid, result_limit integer default 5)
returns setof ajo_groups language plpgsql security definer as $$
declare
  user_state text;
begin
  select state into user_state from users where id = uid;

  -- Same state first
  return query
    select ag.* from ajo_groups ag
    where ag.status = 'forming'
      and ag.is_public = true
      and ag.current_members < ag.max_members
      and ag.state = user_state
      and not exists (select 1 from ajo_members where group_id = ag.id and user_id = uid)
    order by ag.created_at desc
    limit result_limit;

  -- If we got fewer than the limit, pad with any open groups
  if not found then
    return query
      select ag.* from ajo_groups ag
      where ag.status = 'forming'
        and ag.is_public = true
        and ag.current_members < ag.max_members
        and not exists (select 1 from ajo_members where group_id = ag.id and user_id = uid)
      order by ag.created_at desc
      limit result_limit;
  end if;
end;
$$;

-- Assign payout positions based on BCS score (lowest BCS = highest position number = paid out last)
create or replace function assign_payout_positions(gid uuid)
returns void language plpgsql security definer as $$
begin
  -- Rank members: highest BCS gets position 1 (paid first), lowest gets last
  update ajo_members am
  set payout_position = ranked.pos
  from (
    select am2.id,
           row_number() over (order by am2.bcs_at_join desc) as pos
    from ajo_members am2 where am2.group_id = gid
  ) ranked
  where am.id = ranked.id;
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  AUTO-CREATE USER ROW ON SIGNUP
-- ══════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, bvn_verified, identity_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    false, false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
--  INDEXES (performance)
-- ══════════════════════════════════════════════════════════════
create index if not exists idx_sales_user_date        on sales(user_id, sale_date desc);
create index if not exists idx_inventory_user         on inventory(user_id);
create index if not exists idx_ajo_members_user       on ajo_members(user_id);
create index if not exists idx_ajo_members_group      on ajo_members(group_id);
create index if not exists idx_ajo_payments_group     on ajo_payments(group_id);
create index if not exists idx_ajo_payouts_group      on ajo_payouts(group_id);
create index if not exists idx_notifications_user     on notifications(user_id, is_read, created_at desc);
create index if not exists idx_ajo_groups_status      on ajo_groups(status, is_public, created_at desc);
create index if not exists idx_ajo_invites_phone      on ajo_invites(invited_phone);*/


-- ══════════════════════════════════════════════════════════
-- SUWE — Full RLS Rebuild (fixes infinite recursion + 500s)
-- Run this entire block in one go in SQL Editor
-- ══════════════════════════════════════════════════════════
/*
-- Step 1: Disable RLS temporarily so we can clean up
alter table if exists sales         disable row level security;
alter table if exists inventory     disable row level security;
alter table if exists users         disable row level security;
alter table if exists ajo_groups    disable row level security;
alter table if exists ajo_members   disable row level security;
alter table if exists trade_posts   disable row level security;
alter table if exists ajo_payments  disable row level security;
alter table if exists ajo_invitations disable row level security;
alter table if exists notifications disable row level security;

-- Step 2: Drop every policy on every table (clean slate)
do $$ 
declare
  r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Step 3: Ensure all tables exist with correct structure
create table if not exists users (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  email              text,
  phone              text,
  market_location    text,
  product_categories text,
  trading_years      text,
  identity_verified  boolean default false,
  bvn_submitted      boolean default false,
  bvn_verified       boolean default false,
  created_at         timestamptz default now()
);

-- Add missing columns safely
alter table users add column if not exists bvn_verified       boolean default false;
alter table users add column if not exists bvn_submitted      boolean default false;
alter table users add column if not exists trading_years      text;
alter table users add column if not exists identity_verified  boolean default false;

create table if not exists sales (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      integer not null default 1,
  unit          text default 'units',
  selling_price numeric not null default 0,
  cost_price    numeric not null default 0,
  profit        numeric generated always as (selling_price - cost_price) stored,
  sale_date     date not null default current_date,
  created_at    timestamptz default now()
);

create table if not exists inventory (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      integer not null default 0,
  unit          text default 'units',
  reorder_level integer default 5,
  updated_at    timestamptz default now(),
  unique(user_id, item_name)
);

create table if not exists ajo_groups (
  id                  uuid default gen_random_uuid() primary key,
  group_name          text not null,
  created_by          uuid references auth.users(id),
  contribution_amount numeric not null,
  frequency           text not null default 'monthly',
  max_members         integer not null default 8,
  current_members     integer default 1,
  minimum_bcs         integer default 0,
  status              text default 'forming',
  visibility          text default 'public',
  state               text,
  category            text default 'General',
  cycle_number        integer default 0,
  cycle_started_at    timestamptz,
  created_at          timestamptz default now()
);

create table if not exists ajo_members (
  id                  uuid default gen_random_uuid() primary key,
  group_id            uuid references ajo_groups(id) on delete cascade not null,
  user_id             uuid references auth.users(id) on delete cascade not null,
  joined_at           timestamptz default now(),
  payout_position     integer,
  has_received_payout boolean default false,
  bcs_at_join         integer default 0,
  payment_status      text default 'pending',
  unique(group_id, user_id)
);

create table if not exists ajo_payments (
  id            uuid default gen_random_uuid() primary key,
  group_id      uuid references ajo_groups(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  amount        numeric not null,
  cycle_number  integer not null default 1,
  payment_type  text not null default 'contribution',
  status        text not null default 'pending',
  paid_at       timestamptz,
  due_date      date,
  created_at    timestamptz default now()
);

create table if not exists ajo_invitations (
  id              uuid default gen_random_uuid() primary key,
  group_id        uuid references ajo_groups(id) on delete cascade not null,
  sender_id       uuid references auth.users(id) on delete cascade not null,
  recipient_phone text not null,
  recipient_id    uuid references auth.users(id) on delete set null,
  status          text default 'pending',
  created_at      timestamptz default now()
);

create table if not exists notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  title      text not null,
  message    text not null,
  type       text default 'general',
  read       boolean default false,
  meta       jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists trade_posts (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  post_type       text not null,
  title           text not null,
  description     text,
  location        text,
  whatsapp_number text,
  created_at      timestamptz default now()
);

-- Step 4: Re-enable RLS on all tables
alter table sales          enable row level security;
alter table inventory      enable row level security;
alter table users          enable row level security;
alter table ajo_groups     enable row level security;
alter table ajo_members    enable row level security;
alter table ajo_payments   enable row level security;
alter table ajo_invitations enable row level security;
alter table notifications  enable row level security;
alter table trade_posts    enable row level security;

-- Step 5: Create simple, NON-RECURSIVE policies
-- The key rule: never reference ajo_members INSIDE an ajo_members policy

-- USERS
create policy "users_select_own"  on users for select using (auth.uid() = id);
create policy "users_insert_own"  on users for insert with check (auth.uid() = id);
create policy "users_update_own"  on users for update using (auth.uid() = id);

-- SALES
create policy "sales_select_own"  on sales for select using (auth.uid() = user_id);
create policy "sales_insert_own"  on sales for insert with check (auth.uid() = user_id);
create policy "sales_update_own"  on sales for update using (auth.uid() = user_id);
create policy "sales_delete_own"  on sales for delete using (auth.uid() = user_id);

-- INVENTORY
create policy "inventory_all_own" on inventory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AJO GROUPS — any authenticated user can read all groups (needed for discovery)
create policy "ajo_groups_select_all"  on ajo_groups for select using (auth.role() = 'authenticated');
create policy "ajo_groups_insert_own"  on ajo_groups for insert with check (auth.uid() = created_by);
create policy "ajo_groups_update_creator" on ajo_groups for update using (auth.uid() = created_by);
create policy "ajo_groups_delete_creator" on ajo_groups for delete using (auth.uid() = created_by);

-- AJO MEMBERS — CRITICAL: only reference user_id, never subquery ajo_members itself
create policy "ajo_members_select_own"  on ajo_members for select using (auth.uid() = user_id);
create policy "ajo_members_insert_own"  on ajo_members for insert with check (auth.uid() = user_id);
create policy "ajo_members_update_own"  on ajo_members for update using (auth.uid() = user_id);
create policy "ajo_members_delete_own"  on ajo_members for delete using (auth.uid() = user_id);

-- AJO PAYMENTS
create policy "ajo_payments_select_own" on ajo_payments for select using (auth.uid() = user_id);
create policy "ajo_payments_insert_own" on ajo_payments for insert with check (auth.uid() = user_id);
create policy "ajo_payments_update_own" on ajo_payments for update using (auth.uid() = user_id);

-- AJO INVITATIONS
create policy "ajo_inv_select_own" on ajo_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "ajo_inv_insert_own" on ajo_invitations for insert with check (auth.uid() = sender_id);
create policy "ajo_inv_update_recipient" on ajo_invitations for update using (auth.uid() = recipient_id);

-- NOTIFICATIONS
create policy "notif_select_own"  on notifications for select using (auth.uid() = user_id);
create policy "notif_insert_own"  on notifications for insert with check (auth.uid() = user_id);
create policy "notif_update_own"  on notifications for update using (auth.uid() = user_id);

-- TRADE POSTS
create policy "trade_posts_select_all" on trade_posts for select using (auth.role() = 'authenticated');
create policy "trade_posts_insert_own" on trade_posts for insert with check (auth.uid() = user_id);
create policy "trade_posts_delete_own" on trade_posts for delete using (auth.uid() = user_id);

-- Step 6: Fix the auto-create user trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, identity_verified, bvn_verified)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    false,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Step 7: Service role bypass for backend operations
-- This allows your Node.js backend (using service role key) to write
-- to notifications, ajo_groups etc. on behalf of users
alter table notifications   force row level security;
alter table ajo_groups      force row level security;
alter table ajo_members     force row level security;
alter table ajo_invitations force row level security;

-- ══════════════════════════════════════════════════════════════
-- SUWE Complete Database Schema v4
-- Run this ENTIRE file in Supabase Dashboard → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS and DROP IF EXISTS
-- ══════════════════════════════════════════════════════════════

-- Disable RLS while we rebuild everything
alter table if exists sales             disable row level security;
alter table if exists inventory         disable row level security;
alter table if exists users             disable row level security;
alter table if exists ajo_groups        disable row level security;
alter table if exists ajo_members       disable row level security;
alter table if exists ajo_payments      disable row level security;
alter table if exists ajo_invitations   disable row level security;
alter table if exists notifications     disable row level security;
alter table if exists trade_posts       disable row level security;

-- Drop ALL existing policies (clean slate — avoids recursive policy bugs)
do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── USERS ────────────────────────────────────────────────────
create table if not exists users (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  email              text,
  phone              text,
  market_location    text,
  state              text,
  product_categories text,
  trading_years      text,
  identity_verified  boolean default false,
  bvn_submitted      boolean default false,
  bvn_verified       boolean default false,
  bcs_score          integer default 0,
  bcs_tier           text    default 'Bronze',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table users add column if not exists state              text;
alter table users add column if not exists bcs_score          integer default 0;
alter table users add column if not exists bcs_tier           text    default 'Bronze';
alter table users add column if not exists bvn_verified       boolean default false;
alter table users add column if not exists bvn_submitted      boolean default false;
alter table users add column if not exists trading_years      text;
alter table users add column if not exists updated_at         timestamptz default now();

-- ── SALES ────────────────────────────────────────────────────
create table if not exists sales (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      numeric not null default 1,
  unit          text default 'units',
  selling_price numeric not null default 0,
  cost_price    numeric not null default 0,
  profit        numeric generated always as (selling_price - cost_price) stored,
  sale_date     date not null default current_date,
  created_at    timestamptz default now()
);

-- ── INVENTORY ────────────────────────────────────────────────
create table if not exists inventory (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  item_name     text not null,
  quantity      numeric not null default 0,
  unit          text default 'units',
  reorder_level integer default 5,
  updated_at    timestamptz default now(),
  unique(user_id, item_name)
);

-- ── AJO GROUPS ───────────────────────────────────────────────
create table if not exists ajo_groups (
  id                  uuid default gen_random_uuid() primary key,
  group_name          text not null,
  created_by          uuid references auth.users(id),
  contribution_amount numeric not null,
  frequency           text not null default 'monthly',
  max_members         integer not null default 8 check (max_members between 3 and 8),
  current_members     integer default 1,
  minimum_bcs         integer default 0,
  status              text default 'forming',
  -- forming = open, active = cycle running, paused = between cycles, dissolved = ended
  visibility          text default 'public',
  state               text,
  category            text default 'General',
  cycle_number        integer default 0,
  total_cycles        integer default 0,
  cycle_started_at    timestamptz,
  created_at          timestamptz default now()
);
alter table ajo_groups add column if not exists total_cycles integer default 0;
alter table ajo_groups add column if not exists cycle_started_at timestamptz;

-- ── AJO MEMBERS ──────────────────────────────────────────────
-- payment_status here tracks THIS MONTH's payment for this member
create table if not exists ajo_members (
  id                  uuid default gen_random_uuid() primary key,
  group_id            uuid references ajo_groups(id) on delete cascade not null,
  user_id             uuid references auth.users(id) on delete cascade not null,
  joined_at           timestamptz default now(),
  payout_position     integer,           -- 1 = highest BCS = receives first
  has_received_payout boolean default false,
  bcs_at_join         integer default 0, -- BCS locked at join time
  payment_status      text default 'pending', -- 'paid' | 'pending' | 'overdue'
  paid_this_cycle     boolean default false,
  unique(group_id, user_id)
);
alter table ajo_members add column if not exists paid_this_cycle boolean default false;

-- ── AJO PAYMENTS (transaction log) ───────────────────────────
create table if not exists ajo_payments (
  id            uuid default gen_random_uuid() primary key,
  group_id      uuid references ajo_groups(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  amount        numeric not null,
  cycle_number  integer not null default 1,
  payment_type  text not null default 'contribution', -- 'contribution' | 'payout'
  status        text not null default 'pending',       -- 'pending' | 'completed' | 'failed'
  sandbox       boolean default false,
  paid_at       timestamptz,
  due_date      date,
  tx_ref        text,
  created_at    timestamptz default now()
);
alter table ajo_payments add column if not exists sandbox boolean default false;
alter table ajo_payments add column if not exists tx_ref  text;

-- ── AJO INVITATIONS ──────────────────────────────────────────
create table if not exists ajo_invitations (
  id              uuid default gen_random_uuid() primary key,
  group_id        uuid references ajo_groups(id) on delete cascade not null,
  sender_id       uuid references auth.users(id) on delete cascade not null,
  recipient_phone text not null,
  recipient_id    uuid references auth.users(id) on delete set null,
  status          text default 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at      timestamptz default now()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
-- NOTE: the 'read' column is intentionally named 'read' (boolean)
alter table if exists public.notifications
  add column if not exists "read" boolean default false;
create table if not exists notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  title      text not null,
  message    text not null,
  type       text default 'general',
  -- types: 'ajo_invitation' | 'ajo_accepted' | 'new_group' | 'payment_confirmed'
  --        'payment_due' | 'payout_sent' | 'member_joined' | 'new_post' | 'general'
  read       boolean default false,
  meta       jsonb default '{}',
  created_at timestamptz default now()
);

-- ── TRADE POSTS ───────────────────────────────────────────────
create table if not exists trade_posts (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  post_type       text not null,
  title           text not null,
  description     text,
  location        text,
  whatsapp_number text,
  created_at      timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
-- RE-ENABLE RLS
-- ══════════════════════════════════════════════════════════════
alter table sales           enable row level security;
alter table inventory       enable row level security;
alter table users           enable row level security;
alter table ajo_groups      enable row level security;
alter table ajo_members     enable row level security;
alter table ajo_payments    enable row level security;
alter table ajo_invitations enable row level security;
alter table notifications   enable row level security;
alter table trade_posts     enable row level security;

-- ══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- KEY RULE: ajo_members policies NEVER subquery ajo_members
--           (causes infinite recursion). Use simple user_id checks.
--           The backend (service role) bypasses RLS for cross-user writes.
-- ══════════════════════════════════════════════════════════════

-- USERS (own row only)
create policy "users_select_own"  on users for select using (auth.uid() = id);
create policy "users_insert_own"  on users for insert with check (auth.uid() = id);
create policy "users_update_own"  on users for update using (auth.uid() = id);

-- SALES (own rows)
create policy "sales_own" on sales for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- INVENTORY (own rows)
create policy "inventory_own" on inventory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AJO GROUPS
-- Any authenticated user can read all groups (needed for group discovery)
create policy "ajo_groups_read_all"   on ajo_groups for select using (auth.role() = 'authenticated');
create policy "ajo_groups_insert_own" on ajo_groups for insert with check (auth.uid() = created_by);
create policy "ajo_groups_update_own" on ajo_groups for update using (auth.uid() = created_by);
create policy "ajo_groups_delete_own" on ajo_groups for delete using (auth.uid() = created_by);

-- AJO MEMBERS
-- Each user can read/write only their own membership rows.
-- The backend service role reads ALL rows across groups (needed for member lists).
-- Frontend member-list reads are done via a server endpoint that uses service role.
create policy "ajo_members_select_own" on ajo_members for select using (auth.uid() = user_id);
create policy "ajo_members_insert_own" on ajo_members for insert with check (auth.uid() = user_id);
create policy "ajo_members_update_own" on ajo_members for update using (auth.uid() = user_id);
create policy "ajo_members_delete_own" on ajo_members for delete using (auth.uid() = user_id);

-- AJO PAYMENTS (own rows)
create policy "ajo_payments_own" on ajo_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- AJO INVITATIONS
create policy "ajo_inv_select" on ajo_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "ajo_inv_insert" on ajo_invitations for insert with check (auth.uid() = sender_id);
create policy "ajo_inv_update" on ajo_invitations for update
  using (auth.uid() = recipient_id or auth.uid() = sender_id);

-- NOTIFICATIONS (own rows)
create policy "notif_own" on notifications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TRADE POSTS (anyone can read, own insert)
create policy "trade_posts_read_all" on trade_posts for select using (auth.role() = 'authenticated');
create policy "trade_posts_insert"   on trade_posts for insert with check (auth.uid() = user_id);
create policy "trade_posts_delete"   on trade_posts for delete using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- AUTO-CREATE USER ROW ON SIGNUP
-- ══════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, bvn_verified, identity_verified, bcs_score)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name', ''
    ),
    false, false, 0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- HELPER FUNCTION: get_group_members_with_profiles
-- Used by backend to fetch all members + user profiles for a group
-- bypasses RLS (security definer)
-- ══════════════════════════════════════════════════════════════
create or replace function get_group_members_with_profiles(p_group_id uuid)
returns table (
  member_id        uuid,
  group_id         uuid,
  user_id          uuid,
  joined_at        timestamptz,
  payout_position  integer,
  bcs_at_join      integer,
  payment_status   text,
  paid_this_cycle  boolean,
  has_received_payout boolean,
  full_name        text,
  market_location  text,
  bcs_score        integer,
  bcs_tier         text,
  phone            text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      am.id          as member_id,
      am.group_id,
      am.user_id,
      am.joined_at,
      am.payout_position,
      am.bcs_at_join,
      am.payment_status,
      am.paid_this_cycle,
      am.has_received_payout,
      u.full_name,
      u.market_location,
      u.bcs_score,
      u.bcs_tier,
      u.phone
    from ajo_members am
    join users u on u.id = am.user_id
    where am.group_id = p_group_id
    order by am.payout_position asc nulls last, am.bcs_at_join desc;
end;
$$;

-- ══════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════
create index if not exists idx_sales_user_date     on sales(user_id, sale_date desc);
create index if not exists idx_inventory_user      on inventory(user_id);
create index if not exists idx_ajo_members_user    on ajo_members(user_id);
create index if not exists idx_ajo_members_group   on ajo_members(group_id);
create index if not exists idx_ajo_payments_group  on ajo_payments(group_id);
create index if not exists idx_notif_user_unread   on notifications(user_id, read, created_at desc);
create index if not exists idx_ajo_groups_status   on ajo_groups(status, visibility, created_at desc);
create index if not exists idx_inv_phone           on ajo_invitations(recipient_phone);*/

-- ══════════════════════════════════════════════════════════════
-- SUWE Complete Database Schema v5
-- Supabase / PostgreSQL
-- Run this ENTIRE file in Supabase Dashboard → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS, DROP IF EXISTS, and
-- ALTER TABLE ADD COLUMN IF NOT EXISTS for non-destructive updates
-- ══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- DISABLE RLS WHILE REBUILDING
-- ────────────────────────────────────────────────────────────
alter table if exists public.sales             disable row level security;
alter table if exists public.inventory         disable row level security;
alter table if exists public.users             disable row level security;
alter table if exists public.ajo_groups        disable row level security;
alter table if exists public.ajo_members       disable row level security;
alter table if exists public.ajo_payments      disable row level security;
alter table if exists public.ajo_invitations   disable row level security;
alter table if exists public.notifications     disable row level security;
alter table if exists public.trade_posts       disable row level security;
alter table if exists public.posts             disable row level security;
alter table if exists public.comments          disable row level security;
alter table if exists public.likes             disable row level security;
alter table if exists public.bulk_participants disable row level security;
alter table if exists public.ajo_requests      disable row level security;
alter table if exists public.follows           disable row level security;
alter table if exists public.price_alerts      disable row level security;
alter table if exists public.active_sessions   disable row level security;

-- ────────────────────────────────────────────────────────────
-- DROP ALL EXISTING POLICIES (clean slate)
-- ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- DROP OLD ENUMS IF THEY CONFLICT (re-created below)
-- ────────────────────────────────────────────────────────────
drop type if exists post_type          cascade;
drop type if exists ajo_request_status cascade;

-- ════════════════════════════════════════════════════════════
-- TABLE 1: USERS
-- Main user profile table (used by supabase.js as "users")
-- ════════════════════════════════════════════════════════════
create table if not exists public.users (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  email              text,
  phone              text,
  market_location    text,   -- free-text, e.g. "Kasuwa Market, Kaduna"
  state              text,   -- e.g. "Lagos", "Kano", "Abuja"
  product_categories text,   -- comma-separated or JSON string
  trading_years      text,
  identity_verified  boolean  default false,
  bvn_submitted      boolean  default false,
  bvn_verified       boolean  default false,
  bcs_score          integer  default 0,
  bcs_tier           text     default 'Bronze',
  -- Avatar display
  avatar_color       text     default '#1a6637',
  avatar_tc          text     default '#ffffff',
  bio                text,
  profile_complete   boolean  default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Add missing columns safely for existing installations
alter table public.users add column if not exists state              text;
alter table public.users add column if not exists bcs_score          integer  default 0;
alter table public.users add column if not exists bcs_tier           text     default 'Bronze';
alter table public.users add column if not exists bvn_verified       boolean  default false;
alter table public.users add column if not exists bvn_submitted      boolean  default false;
alter table public.users add column if not exists trading_years      text;
alter table public.users add column if not exists updated_at         timestamptz default now();
alter table public.users add column if not exists avatar_color       text     default '#1a6637';
alter table public.users add column if not exists avatar_tc          text     default '#ffffff';
alter table public.users add column if not exists bio                text;
alter table public.users add column if not exists profile_complete   boolean  default false;

-- ════════════════════════════════════════════════════════════
-- TABLE 2: SALES
-- ════════════════════════════════════════════════════════════
create table if not exists public.sales (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  item_name     text        not null,
  quantity      numeric     not null default 1,
  unit          text        default 'units',
  selling_price numeric     not null default 0,
  cost_price    numeric     not null default 0,
  profit        numeric     generated always as (selling_price - cost_price) stored,
  sale_date     date        not null default current_date,
  created_at    timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- TABLE 3: INVENTORY
-- ════════════════════════════════════════════════════════════
create table if not exists public.inventory (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  item_name     text        not null,
  quantity      numeric     not null default 0,
  unit          text        default 'units',
  reorder_level integer     default 5,
  updated_at    timestamptz default now(),
  unique(user_id, item_name)
);

-- ════════════════════════════════════════════════════════════
-- TABLE 4: AJO GROUPS
-- ════════════════════════════════════════════════════════════
create table if not exists public.ajo_groups (
  id                  uuid        default gen_random_uuid() primary key,
  group_name          text        not null,
  created_by          uuid        references auth.users(id),
  contribution_amount numeric     not null,
  frequency           text        not null default 'monthly',
  max_members         integer     not null default 8 check (max_members between 3 and 8),
  current_members     integer     default 1,
  minimum_bcs         integer     default 0,
  status              text        default 'forming',
  -- forming | active | paused | dissolved
  visibility          text        default 'public',
  -- public = auto-join allowed | invite = invite only
  state               text,       -- state in Nigeria, free text
  category            text        default 'General',
  cycle_number        integer     default 0,
  total_cycles        integer     default 0,
  cycle_started_at    timestamptz,
  created_at          timestamptz default now()
);
alter table public.ajo_groups add column if not exists total_cycles     integer     default 0;
alter table public.ajo_groups add column if not exists cycle_started_at timestamptz;
alter table public.ajo_groups add column if not exists state            text;

-- ════════════════════════════════════════════════════════════
-- TABLE 5: AJO MEMBERS
-- ════════════════════════════════════════════════════════════
create table if not exists public.ajo_members (
  id                  uuid        default gen_random_uuid() primary key,
  group_id            uuid        references public.ajo_groups(id) on delete cascade not null,
  user_id             uuid        references auth.users(id) on delete cascade not null,
  joined_at           timestamptz default now(),
  payout_position     integer,
  has_received_payout boolean     default false,
  bcs_at_join         integer     default 0,
  payment_status      text        default 'pending',  -- paid | pending | overdue
  paid_this_cycle     boolean     default false,
  unique(group_id, user_id)
);
alter table public.ajo_members add column if not exists paid_this_cycle boolean default false;

-- ════════════════════════════════════════════════════════════
-- TABLE 6: AJO PAYMENTS (transaction log)
-- ════════════════════════════════════════════════════════════
create table if not exists public.ajo_payments (
  id            uuid        default gen_random_uuid() primary key,
  group_id      uuid        references public.ajo_groups(id) on delete cascade not null,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  amount        numeric     not null,
  cycle_number  integer     not null default 1,
  payment_type  text        not null default 'contribution',  -- contribution | payout
  status        text        not null default 'pending',       -- pending | completed | failed
  sandbox       boolean     default false,
  paid_at       timestamptz,
  due_date      date,
  tx_ref        text,
  created_at    timestamptz default now()
);
alter table public.ajo_payments add column if not exists sandbox boolean default false;
alter table public.ajo_payments add column if not exists tx_ref  text;

-- ════════════════════════════════════════════════════════════
-- TABLE 7: AJO INVITATIONS
-- ════════════════════════════════════════════════════════════
create table if not exists public.ajo_invitations (
  id              uuid        default gen_random_uuid() primary key,
  group_id        uuid        references public.ajo_groups(id) on delete cascade not null,
  sender_id       uuid        references auth.users(id) on delete cascade not null,
  recipient_phone text        not null,
  recipient_id    uuid        references auth.users(id) on delete set null,
  status          text        default 'pending',  -- pending | accepted | declined
  created_at      timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- TABLE 8: NOTIFICATIONS
-- Shared by ajo.html, dashboard.html, and community.html
-- ════════════════════════════════════════════════════════════
create table if not exists public.notifications (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  title      text        not null,
  message    text        not null,
  type       text        default 'general',
  -- ajo_invitation | ajo_accepted | new_group | payment_confirmed
  -- payment_due | payout_sent | member_joined | new_post | general
  -- community_post | price_alert | bulk_join | ajo_post_join
  "read"     boolean     default false,
  meta       jsonb       default '{}',
  created_at timestamptz default now()
);
alter table public.notifications add column if not exists "read" boolean default false;
alter table public.notifications add column if not exists meta   jsonb   default '{}';

-- ════════════════════════════════════════════════════════════
-- TABLE 9: COMMUNITY POSTS
-- Handles all 4 post types: update, price, bulk, ajo
-- Type-specific data lives in meta JSONB column
-- ════════════════════════════════════════════════════════════
create type post_type as enum ('update', 'price', 'bulk', 'ajo');

create table if not exists public.posts (
  id          uuid        primary key default uuid_generate_v4(),
  author_id   uuid        not null references public.users(id) on delete cascade,
  type        post_type   not null default 'update',

  -- Main text body
  body        text        not null,

  -- Category for filtering (replaces market-based filtering)
  -- Values: food, fabric, electronics, cosmetics, building, household, general
  category    text        not null default 'general',

  -- Free-text location (not a dropdown — can be any city/market in Nigeria)
  location    text        not null default '',

  -- Type-specific structured data:
  -- price → { item, new_price, price_unit, direction: "up"|"down", pct_change }
  -- bulk  → { item, price_per_unit, min_qty, spots_total, spots_filled }
  -- ajo   → { group_name, group_id, monthly_amount, spots_total, spots_filled, visibility }
  -- update→ {} (empty)
  meta        jsonb       not null default '{}',

  -- Soft delete
  deleted     boolean     not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_author_idx   on public.posts(author_id);
create index if not exists posts_category_idx on public.posts(category);
create index if not exists posts_type_idx     on public.posts(type);
create index if not exists posts_created_idx  on public.posts(created_at desc);
create index if not exists posts_deleted_idx  on public.posts(deleted) where deleted = false;

-- ════════════════════════════════════════════════════════════
-- TABLE 10: COMMENTS
-- ════════════════════════════════════════════════════════════
create table if not exists public.comments (
  id          uuid        primary key default uuid_generate_v4(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  author_id   uuid        not null references public.users(id) on delete cascade,
  body        text        not null,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists comments_post_idx   on public.comments(post_id);
create index if not exists comments_author_idx on public.comments(author_id);

-- ════════════════════════════════════════════════════════════
-- TABLE 11: LIKES
-- One like per user per post (composite PK enforces this)
-- ════════════════════════════════════════════════════════════
create table if not exists public.likes (
  post_id     uuid        not null references public.posts(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists likes_post_idx on public.likes(post_id);
create index if not exists likes_user_idx on public.likes(user_id);

-- ════════════════════════════════════════════════════════════
-- TABLE 12: BULK PARTICIPANTS
-- Tracks who has joined a bulk buy post
-- ════════════════════════════════════════════════════════════
create table if not exists public.bulk_participants (
  id        uuid        primary key default uuid_generate_v4(),
  post_id   uuid        not null references public.posts(id) on delete cascade,
  user_id   uuid        not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists bulk_post_idx on public.bulk_participants(post_id);
create index if not exists bulk_user_idx on public.bulk_participants(user_id);

-- ════════════════════════════════════════════════════════════
-- TABLE 13: AJO POST REQUESTS
-- When a user taps "Join Ajo Group" on a PUBLIC ajo post:
-- if public → auto-admit (trigger checks capacity & user group limit)
-- if invite-only → create pending request
-- ════════════════════════════════════════════════════════════
create type ajo_request_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.ajo_requests (
  id           uuid                primary key default uuid_generate_v4(),
  post_id      uuid                not null references public.posts(id) on delete cascade,
  group_id     uuid                references public.ajo_groups(id) on delete cascade,
  requester_id uuid                not null references public.users(id) on delete cascade,
  status       ajo_request_status  not null default 'pending',
  note         text,
  reviewed_at  timestamptz,
  created_at   timestamptz         not null default now(),
  unique (post_id, requester_id)
);

create index if not exists ajo_requests_post_idx      on public.ajo_requests(post_id);
create index if not exists ajo_requests_requester_idx on public.ajo_requests(requester_id);
create index if not exists ajo_requests_group_idx     on public.ajo_requests(group_id);

-- ════════════════════════════════════════════════════════════
-- TABLE 14: PRICE ALERTS (live ticker — 24h rolling window)
-- Derived from price-type posts. Aggregated per item.
-- When a price post is created, a trigger upserts this table.
-- Records older than 24h are ignored by the feed query.
-- ════════════════════════════════════════════════════════════
create table if not exists public.price_alerts (
  id           uuid        primary key default uuid_generate_v4(),
  -- Normalised item name (lower-cased for grouping)
  item_name    text        not null,
  -- Display name (from most recent post)
  display_name text        not null,
  -- Aggregate: running average of reported prices
  latest_price text        not null default '',
  price_unit   text        not null default '',
  -- Average % change from all posts in last 24h
  avg_pct_change numeric   not null default 0,
  -- Overall direction: 'up' | 'down' | 'mixed'
  direction    text        not null default 'up',
  -- How many posts contributed
  post_count   integer     not null default 1,
  -- Timestamp of most recent contributing post
  last_post_at timestamptz not null default now(),
  -- Auto-expire: record becomes stale after 24h
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (item_name)
);

create index if not exists price_alerts_expires_idx on public.price_alerts(expires_at desc);
create index if not exists price_alerts_name_idx    on public.price_alerts(item_name);

-- ════════════════════════════════════════════════════════════
-- TABLE 15: ACTIVE SESSIONS (for "Active Now" sidebar)
-- Upserted whenever a user loads the community page.
-- Records older than 15 minutes are considered offline.
-- ════════════════════════════════════════════════════════════
create table if not exists public.active_sessions (
  user_id        uuid        primary key references public.users(id) on delete cascade,
  last_seen      timestamptz not null default now(),
  market_location text,
  full_name      text
);

create index if not exists active_sessions_seen_idx on public.active_sessions(last_seen desc);

-- ════════════════════════════════════════════════════════════
-- OLD trade_posts TABLE (kept for backward compat, not used by community feed)
-- ════════════════════════════════════════════════════════════
create table if not exists public.trade_posts (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete cascade not null,
  post_type       text        not null,
  title           text        not null,
  description     text,
  location        text,
  whatsapp_number text,
  created_at      timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- TRIGGERS & FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- ── 1. Auto-create user row on signup ────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, bvn_verified, identity_verified, bcs_score)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name', ''
    ),
    false, false, 0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. Auto-update updated_at ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at  on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists posts_updated_at  on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists price_alerts_updated_at on public.price_alerts;
create trigger price_alerts_updated_at
  before update on public.price_alerts
  for each row execute function public.set_updated_at();

-- ── 3. Bulk buy spots cap & sync ─────────────────────────────
create or replace function public.check_bulk_spots()
returns trigger language plpgsql as $$
declare
  post_meta    jsonb;
  spots_total  integer;
  spots_filled integer;
begin
  select meta into post_meta from public.posts where id = new.post_id;
  spots_total  := coalesce((post_meta->>'spots_total')::integer, 0);
  spots_filled := (
    select count(*) from public.bulk_participants where post_id = new.post_id
  );
  if spots_filled >= spots_total then
    raise exception 'This bulk buy is full (% / % spots taken)', spots_filled, spots_total;
  end if;
  update public.posts
    set meta = jsonb_set(meta, '{spots_filled}', to_jsonb(spots_filled + 1))
    where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists before_bulk_join on public.bulk_participants;
create trigger before_bulk_join
  before insert on public.bulk_participants
  for each row execute function public.check_bulk_spots();

-- ── 4. Price alert upsert from new post ──────────────────────
-- When a post of type 'price' is inserted, upsert the price_alerts table.
-- The ticker will show the aggregate of all price posts in the last 24h.
create or replace function public.sync_price_alert()
returns trigger language plpgsql as $$
declare
  v_item     text;
  v_display  text;
  v_price    text;
  v_unit     text;
  v_pct      numeric;
  v_dir      text;
  v_existing public.price_alerts%rowtype;
  v_new_avg  numeric;
  v_new_dir  text;
  v_new_post_count integer;
begin
  -- Only handle price-type posts
  if new.type <> 'price' then return new; end if;

  v_display := coalesce(new.meta->>'item', 'Unknown item');
  v_item    := lower(trim(v_display));
  v_price   := coalesce(new.meta->>'new_price', '');
  v_unit    := coalesce(new.meta->>'price_unit', '');
  v_pct     := coalesce((new.meta->>'pct_change')::numeric, 0);
  v_dir     := coalesce(new.meta->>'direction', 'up');

  -- Try to find existing alert for this item (within 24h)
  select * into v_existing
    from public.price_alerts
    where item_name = v_item
    limit 1;

  if not found then
    -- Insert new alert
    insert into public.price_alerts (
      item_name, display_name, latest_price, price_unit,
      avg_pct_change, direction, post_count,
      last_post_at, expires_at
    ) values (
      v_item, v_display, v_price, v_unit,
      v_pct, v_dir, 1,
      now(), now() + interval '24 hours'
    );
  else
    -- Update: running average of pct_change
    v_new_post_count := v_existing.post_count + 1;
    v_new_avg := ((v_existing.avg_pct_change * v_existing.post_count) + v_pct) / v_new_post_count;

    -- Direction: if mixed posts, call it 'mixed'
    if v_existing.direction = v_dir then
      v_new_dir := v_dir;
    else
      v_new_dir := 'mixed';
    end if;

    update public.price_alerts set
      display_name   = v_display,
      latest_price   = v_price,
      price_unit     = v_unit,
      avg_pct_change = v_new_avg,
      direction      = v_new_dir,
      post_count     = v_new_post_count,
      last_post_at   = now(),
      -- Refresh 24h expiry on each new contribution
      expires_at     = now() + interval '24 hours',
      updated_at     = now()
    where item_name = v_item;
  end if;

  return new;
end;
$$;

drop trigger if exists after_price_post on public.posts;
create trigger after_price_post
  after insert on public.posts
  for each row execute function public.sync_price_alert();

-- ── 5. Ajo post request: auto-admit for public groups ─────────
-- When someone joins an ajo group from a community post:
--   a) Check user is not already in 2 groups
--   b) Check the linked ajo_group is not full
--   c) If public → immediately add them to ajo_members
--   d) Sync spots_filled in the post meta
create or replace function public.handle_ajo_post_join()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_group        public.ajo_groups%rowtype;
  v_post         public.posts%rowtype;
  v_user_groups  integer;
  v_spots_total  integer;
  v_spots_filled integer;
  v_group_id     uuid;
begin
  -- Only process newly inserted requests
  if TG_OP <> 'INSERT' then return new; end if;

  -- Get the post
  select * into v_post from public.posts where id = new.post_id;
  if not found then return new; end if;
  if v_post.type <> 'ajo' then return new; end if;

  -- Get linked group_id from post meta or from this record
  v_group_id := coalesce(new.group_id, (v_post.meta->>'group_id')::uuid);
  if v_group_id is null then return new; end if;

  -- Get the group
  select * into v_group from public.ajo_groups where id = v_group_id;
  if not found then return new; end if;

  -- If invite-only, leave as pending (admin will approve)
  if v_group.visibility = 'invite' then return new; end if;

  -- Check: user not in 2 groups already
  select count(*) into v_user_groups
    from public.ajo_members
    where user_id = new.requester_id;
  if v_user_groups >= 2 then
    raise exception 'You are already in 2 ajo groups. You cannot join another.';
  end if;

  -- Check: group not full
  v_spots_total  := v_group.max_members;
  v_spots_filled := coalesce(v_group.current_members, 1);
  if v_spots_filled >= v_spots_total then
    raise exception 'This ajo group is already full.';
  end if;

  -- Check: user not already a member
  if exists (
    select 1 from public.ajo_members
    where group_id = v_group_id and user_id = new.requester_id
  ) then
    raise exception 'You are already a member of this group.';
  end if;

  -- Auto-admit: insert into ajo_members
  insert into public.ajo_members (group_id, user_id, bcs_at_join, payment_status)
  select v_group_id, new.requester_id, coalesce(u.bcs_score, 0), 'pending'
  from public.users u where u.id = new.requester_id
  on conflict (group_id, user_id) do nothing;

  -- Update group member count
  update public.ajo_groups
    set current_members = coalesce(current_members, 1) + 1
    where id = v_group_id;

  -- Sync spots_filled in post meta
  v_spots_filled := v_spots_filled + 1;
  update public.posts
    set meta = jsonb_set(meta, '{spots_filled}', to_jsonb(v_spots_filled))
    where id = new.post_id;

  -- Mark request as approved
  new.status := 'approved';
  new.reviewed_at := now();

  return new;
end;
$$;

drop trigger if exists before_ajo_post_join on public.ajo_requests;
create trigger before_ajo_post_join
  before insert on public.ajo_requests
  for each row execute function public.handle_ajo_post_join();

-- ── 6. Sync ajo spots_filled when a request is approved (manual) ──
create or replace function public.sync_ajo_spots()
returns trigger language plpgsql as $$
declare
  approved_count integer;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select count(*) into approved_count
      from public.ajo_requests
      where post_id = new.post_id and status = 'approved';
    update public.posts
      set meta = jsonb_set(meta, '{spots_filled}', to_jsonb(approved_count))
      where id = new.post_id;
    -- Also update group member count if group_id is set
    if new.group_id is not null then
      update public.ajo_groups
        set current_members = approved_count + 1  -- +1 for creator
        where id = new.group_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists after_ajo_request_update on public.ajo_requests;
create trigger after_ajo_request_update
  after update on public.ajo_requests
  for each row execute function public.sync_ajo_spots();

-- ── 7. Cleanup expired price alerts (called by frontend cron) ──
create or replace function public.cleanup_expired_price_alerts()
returns void language plpgsql security definer as $$
begin
  delete from public.price_alerts where expires_at < now();
end;
$$;

-- ════════════════════════════════════════════════════════════
-- HELPER FUNCTION: get_group_members_with_profiles
-- Used by backend (service role) to fetch all members + profiles
-- Bypasses RLS for cross-user data reads
-- ════════════════════════════════════════════════════════════
create or replace function public.get_group_members_with_profiles(p_group_id uuid)
returns table (
  member_id           uuid,
  group_id            uuid,
  user_id             uuid,
  joined_at           timestamptz,
  payout_position     integer,
  bcs_at_join         integer,
  payment_status      text,
  paid_this_cycle     boolean,
  has_received_payout boolean,
  full_name           text,
  market_location     text,
  bcs_score           integer,
  bcs_tier            text,
  phone               text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      am.id             as member_id,
      am.group_id,
      am.user_id,
      am.joined_at,
      am.payout_position,
      am.bcs_at_join,
      am.payment_status,
      am.paid_this_cycle,
      am.has_received_payout,
      u.full_name,
      u.market_location,
      u.bcs_score,
      u.bcs_tier,
      u.phone
    from public.ajo_members am
    join public.users u on u.id = am.user_id
    where am.group_id = p_group_id
    order by am.payout_position asc nulls last, am.bcs_at_join desc;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- HELPER VIEW: feed_posts
-- Joins posts + users + like counts + comment counts + author info
-- The JS community page calls this view for the feed
-- ════════════════════════════════════════════════════════════
create or replace view public.feed_posts as
select
  p.id,
  p.type,
  p.body,
  p.category,
  p.location,
  p.meta,
  p.created_at,

  -- Author info (from users table, not profiles)
  u.id             as author_id,
  u.full_name      as author_name,
  u.market_location as author_market,
  coalesce(u.avatar_color, '#1a6637') as avatar_color,
  coalesce(u.avatar_tc,    '#ffffff') as avatar_tc,
  coalesce(u.bcs_score, 0)           as credit_score,

  -- Live counts
  (select count(*) from public.likes    l where l.post_id = p.id)                       as like_count,
  (select count(*) from public.comments c where c.post_id = p.id and c.deleted = false) as comment_count

from public.posts p
join public.users u on u.id = p.author_id
where p.deleted = false
order by p.created_at desc;

-- ════════════════════════════════════════════════════════════
-- HELPER VIEW: active_price_alerts
-- Returns only the price alerts that have NOT yet expired (within 24h window)
-- Community page sidebar uses this view
-- ════════════════════════════════════════════════════════════
create or replace view public.active_price_alerts as
select
  id,
  item_name,
  display_name,
  latest_price,
  price_unit,
  round(avg_pct_change, 1) as avg_pct_change,
  direction,
  post_count,
  last_post_at,
  expires_at
from public.price_alerts
where expires_at > now()
order by last_post_at desc;

-- ════════════════════════════════════════════════════════════
-- RE-ENABLE ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
alter table public.sales             enable row level security;
alter table public.inventory         enable row level security;
alter table public.users             enable row level security;
alter table public.ajo_groups        enable row level security;
alter table public.ajo_members       enable row level security;
alter table public.ajo_payments      enable row level security;
alter table public.ajo_invitations   enable row level security;
alter table public.notifications     enable row level security;
alter table public.trade_posts       enable row level security;
alter table public.posts             enable row level security;
alter table public.comments          enable row level security;
alter table public.likes             enable row level security;
alter table public.bulk_participants enable row level security;
alter table public.ajo_requests      enable row level security;
alter table public.price_alerts      enable row level security;
alter table public.active_sessions   enable row level security;

-- ════════════════════════════════════════════════════════════
-- RLS POLICIES
-- KEY RULES:
-- 1. ajo_members policies NEVER subquery ajo_members (infinite recursion)
-- 2. The backend service role bypasses RLS for cross-user writes
-- 3. Community posts/comments/likes are readable by ALL authenticated users
-- ════════════════════════════════════════════════════════════

-- ── USERS ──────────────────────────────────────────────────
-- Own row: full access. Other users: read-only (needed for author names in feed)
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

-- ── SALES ───────────────────────────────────────────────────
create policy "sales_own"
  on public.sales for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── INVENTORY ───────────────────────────────────────────────
create policy "inventory_own"
  on public.inventory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── AJO GROUPS ──────────────────────────────────────────────
create policy "ajo_groups_read_all"
  on public.ajo_groups for select
  using (auth.role() = 'authenticated');

create policy "ajo_groups_insert_own"
  on public.ajo_groups for insert
  with check (auth.uid() = created_by);

create policy "ajo_groups_update_own"
  on public.ajo_groups for update
  using (auth.uid() = created_by);

create policy "ajo_groups_delete_own"
  on public.ajo_groups for delete
  using (auth.uid() = created_by);

-- ── AJO MEMBERS ─────────────────────────────────────────────
-- Users can only see/modify their OWN membership row.
-- Backend service role reads ALL rows for member list display.
create policy "ajo_members_select_own"
  on public.ajo_members for select
  using (auth.uid() = user_id);

create policy "ajo_members_insert_own"
  on public.ajo_members for insert
  with check (auth.uid() = user_id);

create policy "ajo_members_update_own"
  on public.ajo_members for update
  using (auth.uid() = user_id);

create policy "ajo_members_delete_own"
  on public.ajo_members for delete
  using (auth.uid() = user_id);

-- ── AJO PAYMENTS ────────────────────────────────────────────
create policy "ajo_payments_own"
  on public.ajo_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── AJO INVITATIONS ─────────────────────────────────────────
create policy "ajo_inv_select"
  on public.ajo_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "ajo_inv_insert"
  on public.ajo_invitations for insert
  with check (auth.uid() = sender_id);

create policy "ajo_inv_update"
  on public.ajo_invitations for update
  using (auth.uid() = recipient_id or auth.uid() = sender_id);

-- ── NOTIFICATIONS ────────────────────────────────────────────
create policy "notif_own"
  on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── TRADE POSTS (legacy) ─────────────────────────────────────
create policy "trade_posts_read_all"
  on public.trade_posts for select
  using (auth.role() = 'authenticated');

create policy "trade_posts_insert"
  on public.trade_posts for insert
  with check (auth.uid() = user_id);

create policy "trade_posts_delete"
  on public.trade_posts for delete
  using (auth.uid() = user_id);

-- ── COMMUNITY POSTS ──────────────────────────────────────────
-- All authenticated users can read non-deleted posts
create policy "posts_select_authenticated"
  on public.posts for select
  to authenticated
  using (deleted = false);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id);

create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

-- ── COMMENTS ─────────────────────────────────────────────────
create policy "comments_select_authenticated"
  on public.comments for select
  to authenticated
  using (deleted = false);

create policy "comments_insert_own"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "comments_delete_own"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

-- ── LIKES ─────────────────────────────────────────────────────
create policy "likes_select_authenticated"
  on public.likes for select
  to authenticated
  using (true);

create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "likes_delete_own"
  on public.likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ── BULK PARTICIPANTS ─────────────────────────────────────────
create policy "bulk_select_authenticated"
  on public.bulk_participants for select
  to authenticated
  using (true);

create policy "bulk_insert_own"
  on public.bulk_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "bulk_delete_own"
  on public.bulk_participants for delete
  to authenticated
  using (auth.uid() = user_id);

-- ── AJO REQUESTS ─────────────────────────────────────────────
-- Requester can see their own requests
create policy "ajo_requests_select_own"
  on public.ajo_requests for select
  to authenticated
  using (auth.uid() = requester_id);

-- Post author can see all requests for their post
create policy "ajo_requests_select_as_author"
  on public.ajo_requests for select
  to authenticated
  using (
    auth.uid() = (select author_id from public.posts where id = post_id limit 1)
  );

create policy "ajo_requests_insert_own"
  on public.ajo_requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

-- Post author can approve/reject
create policy "ajo_requests_update_as_author"
  on public.ajo_requests for update
  to authenticated
  using (
    auth.uid() = (select author_id from public.posts where id = post_id limit 1)
  );

-- ── PRICE ALERTS ─────────────────────────────────────────────
-- Everyone can read; only triggers (security definer) write
create policy "price_alerts_select_authenticated"
  on public.price_alerts for select
  to authenticated
  using (true);

-- ── ACTIVE SESSIONS ──────────────────────────────────────────
create policy "active_sessions_select_authenticated"
  on public.active_sessions for select
  to authenticated
  using (true);

create policy "active_sessions_upsert_own"
  on public.active_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "active_sessions_update_own"
  on public.active_sessions for update
  to authenticated
  using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════
-- REALTIME SUBSCRIPTIONS
-- Enable Supabase Realtime on tables the community feed uses
-- ════════════════════════════════════════════════════════════
do $$
begin
  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.likes;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.bulk_participants;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.price_alerts;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.active_sessions;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.ajo_requests;
  exception when duplicate_object then null; end;
end $$;

-- ════════════════════════════════════════════════════════════
-- INDEXES (additional, for performance)
-- ════════════════════════════════════════════════════════════
create index if not exists idx_sales_user_date     on public.sales(user_id, sale_date desc);
create index if not exists idx_inventory_user      on public.inventory(user_id);
create index if not exists idx_ajo_members_user    on public.ajo_members(user_id);
create index if not exists idx_ajo_members_group   on public.ajo_members(group_id);
create index if not exists idx_ajo_payments_group  on public.ajo_payments(group_id);
create index if not exists idx_notif_user_unread   on public.notifications(user_id, "read", created_at desc);
create index if not exists idx_ajo_groups_status   on public.ajo_groups(status, visibility, created_at desc);
create index if not exists idx_inv_phone           on public.ajo_invitations(recipient_phone);
create index if not exists idx_comments_liked      on public.likes(user_id, post_id);
create index if not exists idx_commented_on        on public.comments(author_id, post_id);

