-- Avisos de venta al celular (notificaciones push del panel). Correr una vez en Supabase (SQL Editor).
-- Cada celular donde Jireh active los avisos queda guardado aquí. Las funciones de Netlify
-- leen esta tabla (con la service role) para enviar el aviso cuando entra una venta.

create table if not exists public.push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  ua text,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subs enable row level security;

drop policy if exists "panel ve avisos" on public.push_subs;
create policy "panel ve avisos" on public.push_subs for select to authenticated using (true);
drop policy if exists "panel guarda avisos" on public.push_subs;
create policy "panel guarda avisos" on public.push_subs for insert to authenticated with check (true);
drop policy if exists "panel actualiza avisos" on public.push_subs;
create policy "panel actualiza avisos" on public.push_subs for update to authenticated using (true) with check (true);
drop policy if exists "panel borra avisos" on public.push_subs;
create policy "panel borra avisos" on public.push_subs for delete to authenticated using (true);
