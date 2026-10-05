-- Ejecutá este archivo una sola vez en Supabase > SQL Editor.
-- No borra ni modifica tus pedidos actuales.

alter table public.productos_pedido
  add column if not exists registro_id text;

alter table public.productos_pedido
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists productos_pedido_registro_idx
  on public.productos_pedido (registro_id);

create index if not exists productos_pedido_user_idx
  on public.productos_pedido (user_id);

alter table public.productos_pedido enable row level security;

drop policy if exists "Leer productos propios" on public.productos_pedido;
drop policy if exists "Crear productos propios" on public.productos_pedido;
drop policy if exists "Actualizar productos propios" on public.productos_pedido;
drop policy if exists "Eliminar productos propios" on public.productos_pedido;

create policy "Leer productos propios"
on public.productos_pedido for select
to authenticated
using (auth.uid() = user_id);

create policy "Crear productos propios"
on public.productos_pedido for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Actualizar productos propios"
on public.productos_pedido for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Eliminar productos propios"
on public.productos_pedido for delete
to authenticated
using (auth.uid() = user_id);
