-- =====================================================================
-- FIAMS Campo · Esquema do banco de dados (Supabase / PostgreSQL)
-- Execute este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- Depois execute 02_seed_imoveis.sql para carregar os 86 imóveis.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Supervisores (e-mails com acesso ao menu de supervisão)
-- ---------------------------------------------------------------------
create table if not exists public.supervisores (
  email text primary key
);
-- ATENÇÃO: no pedido original o primeiro e-mail aparece como "jose.lopes@und.edu.br".
-- Foi adotado o domínio institucional @undb.edu.br. Ajuste aqui se necessário.
insert into public.supervisores (email) values
  ('jose.lopes@undb.edu.br'),
  ('luis.longhi@undb.edu.br')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Perfis (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text default '',
  turma text default '',
  matricula text default '',
  role text not null default 'aluno' check (role in ('aluno','supervisor')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'nome',''),
    case when exists (select 1 from public.supervisores s where lower(s.email) = lower(new.email))
         then 'supervisor' else 'aluno' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- promove contas já existentes cujo e-mail esteja na lista de supervisores
update public.profiles p set role = 'supervisor'
  where exists (select 1 from public.supervisores s where lower(s.email) = lower(p.email));

create or replace function public.is_supervisor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor');
$$;

-- ---------------------------------------------------------------------
-- 3. Imóveis do inventário (com a ficha pré-preenchida em "seed")
-- ---------------------------------------------------------------------
create table if not exists public.imoveis (
  id text primary key,                 -- código FIAMS, ex.: FIAMS-MC-001
  n integer,                           -- nº no Consolidado do Inventário v4
  nome text not null,
  endereco text,
  bairro text,                         -- aba do inventário (Monte Castelo, João Paulo, Filipinho)
  localidade text,                     -- bairro real / subárea
  lat double precision,
  lon double precision,
  autor text,
  data_ref text,
  funcao text,
  origem text,
  levantamento_2026 text,
  alertas text,
  seed jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Fichas (uma por aluno e por imóvel)
-- ---------------------------------------------------------------------
create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  imovel_id text not null references public.imoveis(id) on delete cascade,
  aluno_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  progresso jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','devolvida','aprovada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enviada_em timestamptz,
  revisada_em timestamptz,
  unique (imovel_id, aluno_id)
);
create index if not exists fichas_aluno_idx on public.fichas(aluno_id);
create index if not exists fichas_status_idx on public.fichas(status);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists fichas_touch on public.fichas;
create trigger fichas_touch before update on public.fichas
  for each row execute function public.touch_updated_at();

-- aluno não pode aprovar a própria ficha
create or replace function public.guard_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_supervisor() then
    if new.status is distinct from old.status and new.status not in ('rascunho','enviada') then
      raise exception 'Somente a supervisão pode aprovar ou devolver fichas.';
    end if;
    if new.status = 'enviada' and old.status is distinct from 'enviada' then
      new.enviada_em = now();
    end if;
  else
    if new.status in ('aprovada','devolvida') and old.status is distinct from new.status then
      new.revisada_em = now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fichas_guard on public.fichas;
create trigger fichas_guard before update on public.fichas
  for each row execute function public.guard_status();

-- ---------------------------------------------------------------------
-- 5. Revisões da supervisão (comentários por seção, aprovações, devoluções)
-- ---------------------------------------------------------------------
create table if not exists public.revisoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.profiles(id),
  secao text,
  tipo text not null default 'comentario' check (tipo in ('comentario','aprovacao','devolucao')),
  comentario text not null default '',
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Fotos (arquivos no Storage, bucket "fotos")
-- ---------------------------------------------------------------------
create table if not exists public.fotos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas(id) on delete cascade,
  aluno_id uuid not null default auth.uid() references public.profiles(id),
  path text not null,
  vista text,
  orientacao text,
  legenda text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('fotos','fotos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. Segurança (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.supervisores enable row level security;
alter table public.profiles    enable row level security;
alter table public.imoveis     enable row level security;
alter table public.fichas      enable row level security;
alter table public.revisoes    enable row level security;
alter table public.fotos       enable row level security;

-- supervisores: apenas supervisores leem a lista
drop policy if exists sup_read on public.supervisores;
create policy sup_read on public.supervisores for select to authenticated using (public.is_supervisor());

-- profiles
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_supervisor());
drop policy if exists prof_update on public.profiles;
create policy prof_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (nome, turma, matricula) on public.profiles to authenticated;

-- imóveis: todos leem; alunos podem cadastrar imóvel novo; supervisão edita/apaga
drop policy if exists im_read on public.imoveis;
create policy im_read on public.imoveis for select to authenticated using (true);
drop policy if exists im_insert on public.imoveis;
create policy im_insert on public.imoveis for insert to authenticated
  with check (created_by = auth.uid() or public.is_supervisor());
drop policy if exists im_update on public.imoveis;
create policy im_update on public.imoveis for update to authenticated
  using (public.is_supervisor()) with check (public.is_supervisor());
drop policy if exists im_delete on public.imoveis;
create policy im_delete on public.imoveis for delete to authenticated using (public.is_supervisor());

-- fichas
drop policy if exists fi_read on public.fichas;
create policy fi_read on public.fichas for select to authenticated
  using (aluno_id = auth.uid() or public.is_supervisor());
drop policy if exists fi_insert on public.fichas;
create policy fi_insert on public.fichas for insert to authenticated
  with check (aluno_id = auth.uid());
drop policy if exists fi_update_aluno on public.fichas;
create policy fi_update_aluno on public.fichas for update to authenticated
  using (aluno_id = auth.uid() and status in ('rascunho','devolvida'))
  with check (aluno_id = auth.uid());
drop policy if exists fi_update_sup on public.fichas;
create policy fi_update_sup on public.fichas for update to authenticated
  using (public.is_supervisor()) with check (public.is_supervisor());
drop policy if exists fi_delete on public.fichas;
create policy fi_delete on public.fichas for delete to authenticated
  using ((aluno_id = auth.uid() and status = 'rascunho') or public.is_supervisor());

-- revisões
drop policy if exists rv_read on public.revisoes;
create policy rv_read on public.revisoes for select to authenticated
  using (public.is_supervisor() or exists (select 1 from public.fichas f where f.id = ficha_id and f.aluno_id = auth.uid()));
drop policy if exists rv_insert on public.revisoes;
create policy rv_insert on public.revisoes for insert to authenticated with check (public.is_supervisor());
drop policy if exists rv_update on public.revisoes;
create policy rv_update on public.revisoes for update to authenticated
  using (public.is_supervisor() or exists (select 1 from public.fichas f where f.id = ficha_id and f.aluno_id = auth.uid()));

-- fotos (tabela)
drop policy if exists ft_read on public.fotos;
create policy ft_read on public.fotos for select to authenticated
  using (aluno_id = auth.uid() or public.is_supervisor());
drop policy if exists ft_insert on public.fotos;
create policy ft_insert on public.fotos for insert to authenticated with check (aluno_id = auth.uid());
drop policy if exists ft_delete on public.fotos;
create policy ft_delete on public.fotos for delete to authenticated using (aluno_id = auth.uid() or public.is_supervisor());

-- fotos (arquivos no Storage): pasta raiz = id do aluno
drop policy if exists st_insert on storage.objects;
create policy st_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists st_read on storage.objects;
create policy st_read on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_supervisor()));
drop policy if exists st_delete on storage.objects;
create policy st_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_supervisor()));

-- Funções internas não devem ser chamáveis pela API (aplicado também no projeto Supabase).
revoke execute on function public.guard_status() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated;

-- ---------------------------------------------------------------------
-- 8. Cadastro somente com Google institucional (@undb.edu.br)
-- ---------------------------------------------------------------------
create or replace function public.enforce_undb_google()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@[:space:]]+@undb\.edu\.br$' then
    raise exception 'Cadastro restrito a contas @undb.edu.br.';
  end if;
  if coalesce(new.raw_app_meta_data->>'provider','') <> 'google' then
    raise exception 'O cadastro é feito somente com a conta Google institucional.';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_undb_google() from public, anon, authenticated;
drop trigger if exists enforce_undb_google on auth.users;
create trigger enforce_undb_google before insert on auth.users
  for each row execute function public.enforce_undb_google();

-- nome vem do Google (full_name / name)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    case when exists (select 1 from public.supervisores s where lower(s.email) = lower(new.email))
         then 'supervisor' else 'aluno' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
