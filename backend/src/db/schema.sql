-- ============================================
-- Forex Auto-Trading SaaS - Database Schema
-- Supabase (PostgreSQL) - Multi-tenant
-- ============================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  subscription_tier text not null default 'free',
  subscription_status text not null default 'trial',
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  broker_name text not null,
  server text not null,
  login text not null,
  encrypted_password text not null,
  metaapi_account_id text,
  account_type text not null default 'demo',
  connection_status text not null default 'pending',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, login, server)
);

create table if not exists public.risk_settings (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid not null references public.broker_accounts(id) on delete cascade,
  max_daily_loss_percent numeric not null default 3.0,
  max_drawdown_percent numeric not null default 10.0,
  max_risk_per_trade_percent numeric not null default 1.0,
  max_open_positions int not null default 3,
  max_lot_size numeric not null default 0.5,
  allowed_symbols text[] default array['EURUSD','GBPUSD','XAUUSD','USDJPY'],
  trading_hours_start time default '00:00',
  trading_hours_end time default '23:59',
  auto_disable_on_breach boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_strategies (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid not null references public.broker_accounts(id) on delete cascade,
  strategy_key text not null,
  is_enabled boolean not null default true,
  weight numeric not null default 1.0,
  timeframe text not null default 'M15',
  params jsonb default '{}'::jsonb
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid not null references public.broker_accounts(id) on delete cascade,
  metaapi_order_id text,
  symbol text not null,
  direction text not null,
  volume numeric not null,
  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  strategy_key text,
  status text not null default 'open',
  pnl numeric,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists public.event_log (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid references public.broker_accounts(id) on delete cascade,
  event_type text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id text not null,
  notify_trades boolean not null default true,
  notify_risk boolean not null default true,
  notify_daily_report boolean not null default true
);

-- Row Level Security
alter table public.broker_accounts enable row level security;
alter table public.risk_settings enable row level security;
alter table public.account_strategies enable row level security;
alter table public.trades enable row level security;
alter table public.event_log enable row level security;
alter table public.telegram_links enable row level security;

create policy "users manage own broker accounts" on public.broker_accounts
  for all using (auth.uid() = user_id);

create policy "users see own risk settings" on public.risk_settings
  for all using (
    broker_account_id in (select id from public.broker_accounts where user_id = auth.uid())
  );

create policy "users see own strategies" on public.account_strategies
  for all using (
    broker_account_id in (select id from public.broker_accounts where user_id = auth.uid())
  );

create policy "users see own trades" on public.trades
  for select using (
    broker_account_id in (select id from public.broker_accounts where user_id = auth.uid())
  );

create policy "users see own events" on public.event_log
  for select using (
    broker_account_id in (select id from public.broker_accounts where user_id = auth.uid())
  );

create policy "users manage own telegram link" on public.telegram_links
  for all using (auth.uid() = user_id);
