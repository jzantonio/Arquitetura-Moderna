-- =====================================================================
-- FIAMS · Plataforma (portal público + área da equipe)
-- Perfis: aluno, supervisor, pesquisador (só leitura), admin.
-- Publicação de fichas aprovadas no portal, textos públicos editáveis
-- e leitura pública (papel "anon") restrita a colunas e linhas seguras.
-- Execute DEPOIS de 01_schema.sql e 02_seed_imoveis.sql. Pode ser executado de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Papéis
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('aluno','supervisor','pesquisador','admin'));

-- papel atribuído por e-mail (vale para contas novas e existentes)
create table if not exists public.papeis (
  email text primary key,
  role text not null check (role in ('aluno','supervisor','pesquisador','admin')),
  created_at timestamptz not null default now()
);

-- migra a lista antiga de supervisores; o coordenador do LUPA vira administrador
do $$
begin
  if to_regclass('public.supervisores') is not null then
    insert into public.papeis (email, role)
      select lower(email), case when lower(email) = 'jose.lopes@undb.edu.br' then 'admin' else 'supervisor' end
      from public.supervisores
    on conflict (email) do nothing;
  end if;
end $$;

create or replace function public.is_supervisor()   -- pode revisar, aprovar e devolver
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor','admin'));
$$;
create or replace function public.is_admin()        -- papéis, publicação e textos públicos
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_equipe()       -- lê tudo (supervisão, administração, pesquisa)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor','admin','pesquisador'));
$$;
revoke execute on function public.is_supervisor() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_equipe() from public, anon;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_equipe() to authenticated;

-- conta nova: papel vem da tabela papeis; sem registro, aluno
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce((select p.role from public.papeis p where p.email = lower(new.email)), 'aluno'))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- mudar a tabela papeis aplica o papel à conta existente; nunca fica sem administrador
create or replace function public.papeis_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare em text; era_admin boolean;
begin
  if tg_op = 'DELETE' then em := old.email; else new.email := lower(trim(new.email)); em := new.email; end if;
  era_admin := exists (select 1 from public.profiles where lower(email) = em and role = 'admin');
  update public.profiles set role = case when tg_op = 'DELETE' then 'aluno' else new.role end where lower(email) = em;
  if era_admin and not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'É preciso manter pelo menos um administrador.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.papeis_sync() from public, anon, authenticated;
drop trigger if exists papeis_sync on public.papeis;
create trigger papeis_sync before insert or update or delete on public.papeis
  for each row execute function public.papeis_sync();

-- a lista antiga deixa de ser usada
drop table if exists public.supervisores;

-- aplica os papéis às contas que já existem
update public.profiles p set role = pa.role from public.papeis pa
  where pa.email = lower(p.email) and p.role is distinct from pa.role;

-- administração muda o papel de uma pessoa já cadastrada
create or replace function public.definir_papel(alvo uuid, novo text)
returns void language plpgsql security definer set search_path = public as $$
declare em text;
begin
  if not public.is_admin() then raise exception 'Somente a administração pode mudar papéis.'; end if;
  if novo not in ('aluno','supervisor','pesquisador','admin') then raise exception 'Papel inválido.'; end if;
  select lower(email) into em from public.profiles where id = alvo;
  if em is null then raise exception 'Pessoa não encontrada.'; end if;
  insert into public.papeis (email, role) values (em, novo)
    on conflict (email) do update set role = excluded.role;
end $$;
revoke execute on function public.definir_papel(uuid, text) from public, anon;
grant execute on function public.definir_papel(uuid, text) to authenticated;

alter table public.papeis enable row level security;
drop policy if exists pa_admin on public.papeis;
create policy pa_admin on public.papeis for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.papeis from anon;

-- ---------------------------------------------------------------------
-- 2. Leitura pela equipe (pesquisador lê tudo, não escreve)
-- ---------------------------------------------------------------------
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_equipe());
drop policy if exists fi_read on public.fichas;
create policy fi_read on public.fichas for select to authenticated
  using (aluno_id = auth.uid() or public.is_equipe());
drop policy if exists rv_read on public.revisoes;
create policy rv_read on public.revisoes for select to authenticated
  using (public.is_equipe() or exists (select 1 from public.fichas f where f.id = ficha_id and f.aluno_id = auth.uid()));
drop policy if exists ft_read on public.fotos;
create policy ft_read on public.fotos for select to authenticated
  using (aluno_id = auth.uid() or public.is_equipe());
drop policy if exists st_read on storage.objects;
create policy st_read on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_equipe()));

-- ---------------------------------------------------------------------
-- 3. Publicação de fichas no portal
-- ---------------------------------------------------------------------
alter table public.fichas add column if not exists publicada boolean not null default false;
alter table public.fichas add column if not exists publicada_em timestamptz;
alter table public.fichas add column if not exists dados_publicos jsonb;
create index if not exists fichas_publicada_idx on public.fichas(publicada) where publicada;

-- o que nunca vai ao público: visita de campo (V.*), entrevista (23.*, Q1–Q7),
-- fontes orais (24.5), inscrição imobiliária (1.1.3) e marcas internas (__pre)
create or replace function public.dados_para_publico(d jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each(coalesce(d, '{}'::jsonb)) as e(k, v)
  where k !~ '^(v\.|23\.|Q[0-9]+(\||$)|24\.5(\||$)|1\.1\.3(\||$)|__)';
$$;

create or replace function public.guard_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_supervisor() then new.status := 'rascunho'; end if;
    new.publicada := false; new.publicada_em := null; new.dados_publicos := null;
    return new;
  end if;
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
  -- publicação: só a administração, só ficha aprovada; sair de "aprovada" despublica
  if new.publicada is distinct from old.publicada then
    if not public.is_admin() then raise exception 'Somente a administração publica fichas no portal.'; end if;
    if new.publicada and new.status <> 'aprovada' then raise exception 'Só fichas aprovadas podem ser publicadas.'; end if;
  end if;
  if new.status <> 'aprovada' then new.publicada := false; end if;
  if new.publicada then
    if not old.publicada or new.dados is distinct from old.dados or new.dados_publicos is null then
      new.dados_publicos := public.dados_para_publico(new.dados);
    end if;
    if not old.publicada then new.publicada_em := now(); end if;
  else
    new.dados_publicos := null; new.publicada_em := null;
  end if;
  return new;
end $$;
revoke execute on function public.guard_status() from public, anon, authenticated;
drop trigger if exists fichas_guard on public.fichas;
create trigger fichas_guard before update on public.fichas
  for each row execute function public.guard_status();
drop trigger if exists fichas_guard_ins on public.fichas;
create trigger fichas_guard_ins before insert on public.fichas
  for each row execute function public.guard_status();

-- ---------------------------------------------------------------------
-- 4. Leitura pública (visitante sem login = papel anon), por coluna
-- ---------------------------------------------------------------------
revoke all on public.imoveis from anon;
grant select (id, n, nome, endereco, bairro, localidade, lat, lon, autor, data_ref, funcao) on public.imoveis to anon;
drop policy if exists im_read_anon on public.imoveis;
create policy im_read_anon on public.imoveis for select to anon using (true);

revoke all on public.fichas from anon;
grant select (id, imovel_id, publicada, publicada_em, dados_publicos) on public.fichas to anon;
drop policy if exists fi_read_anon on public.fichas;
create policy fi_read_anon on public.fichas for select to anon using (publicada);

revoke all on public.fotos from anon;
grant select (id, ficha_id, path, vista, orientacao, legenda, created_at) on public.fotos to anon;
drop policy if exists ft_read_anon on public.fotos;
create policy ft_read_anon on public.fotos for select to anon
  using (exists (select 1 from public.fichas f where f.id = ficha_id and f.publicada));

drop policy if exists st_read_anon on storage.objects;
create policy st_read_anon on storage.objects for select to anon
  using (bucket_id = 'fotos' and exists (
    select 1 from public.fotos ft join public.fichas f on f.id = ft.ficha_id
    where ft.path = storage.objects.name and f.publicada));

revoke all on public.profiles from anon;
revoke all on public.revisoes from anon;

-- números do inventário para o portal (só contagens, nenhum dado pessoal)
create or replace function public.estatisticas_publicas()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'imoveis', (select count(*) from public.imoveis),
    'com_ficha', (select count(distinct imovel_id) from public.fichas),
    'aprovadas', (select count(distinct imovel_id) from public.fichas where status = 'aprovada'),
    'publicadas', (select count(distinct imovel_id) from public.fichas where publicada),
    'participantes', (select count(distinct aluno_id) from public.fichas),
    'em_estudo', (select coalesce(jsonb_agg(distinct imovel_id), '[]'::jsonb) from public.fichas),
    'atualizado_em', (select max(updated_at) from public.fichas));
$$;
revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Textos públicos do portal (editados pela administração)
-- ---------------------------------------------------------------------
create table if not exists public.conteudo (
  chave text primary key,
  titulo text not null default '',
  corpo text not null default '',
  ordem integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);
drop trigger if exists conteudo_touch on public.conteudo;
create trigger conteudo_touch before update on public.conteudo
  for each row execute function public.touch_updated_at();
alter table public.conteudo enable row level security;
drop policy if exists ct_read on public.conteudo;
create policy ct_read on public.conteudo for select to anon, authenticated using (true);
drop policy if exists ct_write on public.conteudo;
create policy ct_write on public.conteudo for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.conteudo from anon;

insert into public.conteudo (chave, titulo, ordem, corpo) values
('inicio', 'Apresentação', 1,
'O Inventário da Arquitetura Moderna de São Luís identifica, documenta e avalia edifícios modernos construídos entre 1930 e 1980 nos bairros de Monte Castelo, João Paulo e Filipinho.

Cada imóvel recebe uma ficha de inventário (FIAMS), preenchida em campo por estudantes de Arquitetura e Urbanismo e revisada pela supervisão do projeto. As fichas aprovadas são publicadas aqui, com fotografias, dados históricos e a avaliação de integridade de cada exemplar.'),
('sobre', 'O projeto', 2,
'## Por que inventariar o moderno

Grande parte da arquitetura moderna de São Luís está fora das áreas protegidas e se transforma rapidamente. O inventário registra esse acervo antes que ele desapareça e oferece base para a preservação, a pesquisa e a educação patrimonial.

O recorte inclui o **moderno difuso** dos bairros: residências, escolas, comércios e equipamentos públicos, muitas vezes sem autoria ou data documentadas. A autoria desconhecida não é critério de exclusão.

## Recorte

- **Período:** 1930 a 1980.
- **Território:** Monte Castelo (Retiro Natal, Fátima, Vila Passos, Belira, Canto da Fabril, Apeadouro, Alemanha, Coreia, Vila Ivar Saldanha), João Paulo e Filipinho.
- **Instituição:** LUPA — Laboratório de Urbanismo, Paisagem, Arquitetura e Artes, Centro Universitário UNDB.'),
('metodologia', 'Metodologia', 3,
'## Três níveis de registro

- **Nível 1 — Ficha de inventário:** identificação, localização, datação, autoria, tipologia, implantação, arquitetura, técnica construtiva, entorno, alterações, conservação, autenticidade, integridade e valores.
- **Nível 2 — Dossiê documental:** fotografias históricas e atuais, plantas, cortes, fachadas, redesenhos, mapas, documentos e entrevistas.
- **Nível 3 — Monitoramento:** atualização periódica do estado de conservação, das alterações, das ameaças e do entorno.

## Origem da informação

Cada campo da ficha indica como é obtido: **campo** (observação, medição, fotografia ou entrevista no local), **documental** (arquivos, cartografia e bibliografia) ou **análise** (avaliação técnica feita depois do campo).

## Índice de Integridade Modernista (IIM)

Sete atributos definidores da arquitetura moderna (A1 a A7) são avaliados como preservados (2 pontos), adaptados (1) ou suprimidos (0). O IIM é a proporção de pontos obtidos sobre o máximo possível, e classifica o exemplar de íntegro a não preservado.

## Referências

A FIAMS é uma adaptação temática e crítica dos referenciais INBI/INBI-SU e SICG do IPHAN, complementada pelas fichas DOCOMOMO e por experiências brasileiras de inventariação da arquitetura moderna.'),
('creditos', 'Equipe e créditos', 4,
'## Coordenação

Prof. José Antônio Viana Lopes e Prof. Luís Longhi — LUPA, Centro Universitário UNDB.

## Equipe de campo

Estudantes de Arquitetura e Urbanismo da UNDB. Os autores de cada ficha são creditados na própria ficha publicada.

## Contato

[jose.lopes@undb.edu.br](mailto:jose.lopes@undb.edu.br)')
on conflict (chave) do nothing;
