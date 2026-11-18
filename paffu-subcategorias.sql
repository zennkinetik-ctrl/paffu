-- Subcategorías de Accesorios (Cosmetiqueros, Billeteras, Fundas…), cada una con su foto de portada.
-- Correr una vez en Supabase (SQL Editor). Se puede volver a correr sin problema.

create table if not exists public.subcategorias (
  id text primary key,
  cat text not null default 'Accesorios',
  nombre text not null,
  foto text,                      -- portada; vacía = la tienda usa la foto de la primera pieza
  orden integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.subcategorias enable row level security;

drop policy if exists "todos ven subcategorias" on public.subcategorias;
create policy "todos ven subcategorias" on public.subcategorias for select using (true);
drop policy if exists "panel edita subcategorias" on public.subcategorias;
create policy "panel edita subcategorias" on public.subcategorias for all to authenticated using (true) with check (true);

-- Subcategorías por tipo de producto (Jireh las renombra, ordena o borra desde el panel)
insert into public.subcategorias (id, nombre, orden) values
  ('billeteras', 'Billeteras', 1),
  ('funda-ipad', 'Fundas iPad/tablet', 2),
  ('funda-kindle', 'Fundas Kindle', 3),
  ('funda-lentes', 'Fundas de lentes', 4),
  ('cosmetiqueros', 'Cosmetiqueros', 5),
  ('bolsos', 'Bolsos y bananos', 6),
  ('gorros', 'Gorros', 7),
  ('cintillos', 'Cintillos', 8),
  ('pequenos', 'Llaveros y monederos', 9),
  ('giftcard', 'Gift Card', 10)
on conflict (id) do nothing;

-- "Fundas" se separó en Fundas iPad/tablet, Kindle y lentes; "Gorros y cintillos" en Gorros y Cintillos
update public.subcategorias set nombre = 'Gorros' where id = 'gorros' and nombre = 'Gorros y cintillos';
delete from public.subcategorias where id = 'fundas';

-- Cada producto puede elegir su subcategoría (vacío = se asigna sola por el nombre)
alter table public.productos add column if not exists sub text;

-- Piezas que estaban en "Fundas": vuelven a asignarse solas (Kindle, iPad/tablet o lentes según su nombre)
update public.productos set sub = null where sub = 'fundas';
