-- App Operações · Mundo das Bombas
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run.
-- Pode rodar de novo sem problema: ele não apaga dados.
--
-- Regra principal: qualquer funcionário ativo pode LANÇAR (inserir) na área dele.
-- Só o GERENTE pode ALTERAR ou EXCLUIR. Essa trava fica no banco (RLS),
-- então vale mesmo para quem tentar mexer fora do aplicativo.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Perfis (login de cada funcionário)
-- ---------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,
  nome text not null,
  funcao text not null check (funcao in ('gerente','estoque','motorista')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.minha_funcao() returns text
language sql stable security definer set search_path = public as $$
  select funcao from public.perfis where id = auth.uid() and ativo
$$;
create or replace function public.e_gerente() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_funcao() = 'gerente', false)
$$;
create or replace function public.pode_veiculos() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_funcao() in ('gerente','motorista'), false)
$$;
create or replace function public.pode_estoque() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_funcao() in ('gerente','estoque'), false)
$$;

-- Diz se já existe gerente (a tela de primeiro acesso usa isso).
create or replace function public.existe_gerente() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.perfis where funcao = 'gerente' and ativo)
$$;

-- Primeiro acesso: transforma o usuário logado em gerente, só se ainda não houver nenhum.
create or replace function public.primeiro_gerente(p_usuario text, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre primeiro.'; end if;
  if exists(select 1 from public.perfis where funcao = 'gerente') then
    raise exception 'Já existe um gerente.';
  end if;
  insert into public.perfis(id, usuario, nome, funcao) values (auth.uid(), lower(p_usuario), p_nome, 'gerente');
end $$;

-- O gerente troca a senha de um funcionário.
create or replace function public.redefinir_senha(p_id uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.e_gerente() then raise exception 'Só o gerente pode trocar a senha de outra pessoa.'; end if;
  if length(p_senha) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
  where id = p_id;
end $$;

-- ---------------------------------------------------------------
-- Veículos
-- ---------------------------------------------------------------
create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  modelo text not null,
  apelido text,
  km_inicial integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  cnh text,
  categoria text,
  cnh_validade date,
  usuario_id uuid references public.perfis(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Entregas do dia: um lançamento por entrega.
create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora time,
  veiculo_id uuid references public.veiculos(id),
  motorista_id uuid references public.motoristas(id),
  destino text not null,
  cliente text,
  nf text,
  obs text,
  criado_por uuid not null default auth.uid() references public.perfis(id),
  criado_em timestamptz not null default now()
);
create index if not exists entregas_data on public.entregas(data);

-- Abastecimento e outros gastos.
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  veiculo_id uuid not null references public.veiculos(id),
  motorista_id uuid references public.motoristas(id),
  tipo text not null,
  valor numeric(12,2) not null default 0,
  litros numeric(10,2),
  km integer,
  fornecedor text,
  descricao text,
  foto text,
  criado_por uuid not null default auth.uid() references public.perfis(id),
  criado_em timestamptz not null default now()
);
create index if not exists gastos_data on public.gastos(data);

-- ---------------------------------------------------------------
-- Estoque: saídas registradas com foto
-- ---------------------------------------------------------------
create table if not exists public.saidas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora time,
  descricao text not null,
  nf text,
  pedido text,
  cliente text not null,
  situacao text,
  recebedor text,
  obs text,
  fotos text[] not null default '{}',
  criado_por uuid not null default auth.uid() references public.perfis(id),
  criado_em timestamptz not null default now()
);
create index if not exists saidas_data on public.saidas(data);

-- ---------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.veiculos enable row level security;
alter table public.motoristas enable row level security;
alter table public.entregas enable row level security;
alter table public.gastos enable row level security;
alter table public.saidas enable row level security;

do $$
declare r record;
begin
  -- apaga as regras antigas destas tabelas para poder rodar de novo
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('perfis','veiculos','motoristas','entregas','gastos','saidas')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- perfis: todo funcionário ativo vê nomes; só o gerente cria, muda e exclui
create policy perfis_ver on public.perfis for select to authenticated using (public.minha_funcao() is not null or id = auth.uid());
create policy perfis_criar on public.perfis for insert to authenticated with check (public.e_gerente());
create policy perfis_mudar on public.perfis for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy perfis_excluir on public.perfis for delete to authenticated using (public.e_gerente() and id <> auth.uid());

-- cadastros de veículos e motoristas: área Veículos vê; só o gerente cadastra, muda e exclui
create policy veiculos_ver on public.veiculos for select to authenticated using (public.pode_veiculos());
create policy veiculos_criar on public.veiculos for insert to authenticated with check (public.e_gerente());
create policy veiculos_mudar on public.veiculos for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy veiculos_excluir on public.veiculos for delete to authenticated using (public.e_gerente());

create policy motoristas_ver on public.motoristas for select to authenticated using (public.pode_veiculos());
create policy motoristas_criar on public.motoristas for insert to authenticated with check (public.e_gerente());
create policy motoristas_mudar on public.motoristas for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy motoristas_excluir on public.motoristas for delete to authenticated using (public.e_gerente());

-- lançamentos: quem é da área lança em nome próprio; só o gerente muda e exclui
create policy entregas_ver on public.entregas for select to authenticated using (public.pode_veiculos());
create policy entregas_criar on public.entregas for insert to authenticated with check (public.pode_veiculos() and criado_por = auth.uid());
create policy entregas_mudar on public.entregas for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy entregas_excluir on public.entregas for delete to authenticated using (public.e_gerente());

create policy gastos_ver on public.gastos for select to authenticated using (public.pode_veiculos());
create policy gastos_criar on public.gastos for insert to authenticated with check (public.pode_veiculos() and criado_por = auth.uid());
create policy gastos_mudar on public.gastos for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy gastos_excluir on public.gastos for delete to authenticated using (public.e_gerente());

create policy saidas_ver on public.saidas for select to authenticated using (public.pode_estoque());
create policy saidas_criar on public.saidas for insert to authenticated with check (public.pode_estoque() and criado_por = auth.uid());
create policy saidas_mudar on public.saidas for update to authenticated using (public.e_gerente()) with check (public.e_gerente());
create policy saidas_excluir on public.saidas for delete to authenticated using (public.e_gerente());

-- ninguém sem login lê nada
revoke all on public.perfis, public.veiculos, public.motoristas, public.entregas, public.gastos, public.saidas from anon;
grant select, insert, update, delete on public.perfis, public.veiculos, public.motoristas, public.entregas, public.gastos, public.saidas to authenticated;
revoke execute on function public.redefinir_senha(uuid, text) from anon, public;
grant execute on function public.redefinir_senha(uuid, text) to authenticated;
revoke execute on function public.primeiro_gerente(text, text) from anon, public;
grant execute on function public.primeiro_gerente(text, text) to authenticated;

-- ---------------------------------------------------------------
-- Fotos (Storage): pasta privada "fotos"
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false;

drop policy if exists fotos_ver on storage.objects;
drop policy if exists fotos_enviar on storage.objects;
drop policy if exists fotos_excluir on storage.objects;
create policy fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.minha_funcao() is not null);
create policy fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.minha_funcao() is not null);
create policy fotos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.e_gerente());
