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

-- Subcategorías iniciales (Jireh las renombra, ordena o borra desde el panel)
insert into public.subcategorias (id, nombre, orden) values
  ('cosmetiqueros', 'Cosmetiqueros', 1),
  ('billeteras', 'Billeteras', 2),
  ('fundas', 'Fundas', 3),
  ('bolsos', 'Bolsos y bananos', 4),
  ('gorros', 'Gorros y cintillos', 5),
  ('pequenos', 'Llaveros y monederos', 6),
  ('giftcard', 'Gift Card', 7)
on conflict (id) do nothing;

-- Cada producto puede elegir su subcategoría (vacío = se asigna sola por el nombre)
alter table public.productos add column if not exists sub text;
