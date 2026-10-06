-- ==================================================================
-- Consulta de Autopeças — estrutura do banco no Supabase
--
-- Pode rodar quantas vezes quiser: só cria o que ainda não existe e
-- recria as regras de acesso e as funções.
--
-- Quem pode usar o sistema: só quem tem login no Supabase E está na
-- tabela "usuarios". Ter uma conta criada não basta, então a chave
-- pública (anon) que vai dentro do programa não abre nada sozinha.
-- ==================================================================

/* ------------------------------ Tabelas --------------------------- */

create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.pecas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (codigo <> ''),
  -- Código só com letras e números, sem acento, em minúsculas.
  -- É o que impede "90919-01253" e "9091901253" de virarem duas peças.
  codigo_chave text not null unique,
  nome text not null check (nome <> ''),
  marca text not null default '',
  categoria text not null default '',
  descricao text not null default '',
  fornecedor text not null default '',
  localizacao text not null default '',
  preco_custo numeric(12, 2) not null default 0,
  preco_venda numeric(12, 2) not null default 0,
  estoque integer not null default 0,
  estoque_minimo integer not null default 0,
  equivalentes text[] not null default '{}',
  aplicacoes jsonb not null default '[]',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  -- Se a peça for excluída, o histórico fica (com código e nome copiados).
  peca_id uuid references public.pecas (id) on delete set null,
  codigo text not null,
  nome text not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  quantidade integer not null check (quantidade > 0),
  saldo_apos integer not null,
  motivo text not null default '',
  usuario_id uuid default auth.uid(),
  usuario_email text default (auth.jwt() ->> 'email'),
  data timestamptz not null default now()
);

create index if not exists movimentacoes_data_idx on public.movimentacoes (data desc);
create index if not exists movimentacoes_peca_idx on public.movimentacoes (peca_id, data desc);

/* ------------------------- Quem tem acesso ------------------------ */

create or replace function public.autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid());
$$;

revoke all on function public.autorizado() from public, anon;
grant execute on function public.autorizado() to authenticated;

alter table public.usuarios enable row level security;
alter table public.pecas enable row level security;
alter table public.movimentacoes enable row level security;

revoke all on public.usuarios, public.pecas, public.movimentacoes from anon;
grant select on public.usuarios to authenticated;
grant select, insert, update, delete on public.pecas to authenticated;
grant select, insert on public.movimentacoes to authenticated;

drop policy if exists usuarios_proprio on public.usuarios;
create policy usuarios_proprio on public.usuarios
  for select to authenticated
  using (id = auth.uid());

drop policy if exists pecas_equipe on public.pecas;
create policy pecas_equipe on public.pecas
  for all to authenticated
  using (public.autorizado())
  with check (public.autorizado());

-- O histórico só recebe linhas novas: ninguém edita nem apaga movimentação.
drop policy if exists movimentacoes_leitura on public.movimentacoes;
create policy movimentacoes_leitura on public.movimentacoes
  for select to authenticated
  using (public.autorizado());

drop policy if exists movimentacoes_registro on public.movimentacoes;
create policy movimentacoes_registro on public.movimentacoes
  for insert to authenticated
  with check (public.autorizado());

/* ------------------------ Entrada e saída ------------------------- */
-- Trava a linha da peça enquanto mexe no saldo. Dois balcões dando baixa
-- na mesma peça ao mesmo tempo não conseguem deixar o saldo negativo.

create or replace function public.registrar_movimento(
  p_peca_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text default ''
)
returns public.pecas
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_peca public.pecas;
begin
  if not public.autorizado() then
    raise exception 'Este usuário não tem acesso ao sistema.';
  end if;
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimento inválido.';
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  select * into v_peca from public.pecas where id = p_peca_id for update;
  if not found then
    raise exception 'Peça não encontrada.';
  end if;

  if p_tipo = 'saida' and p_quantidade > v_peca.estoque then
    raise exception 'Saldo insuficiente: há % em estoque e você pediu baixa de %.', v_peca.estoque, p_quantidade;
  end if;

  update public.pecas
     set estoque = estoque + case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end,
         atualizado_em = now()
   where id = p_peca_id
  returning * into v_peca;

  insert into public.movimentacoes (peca_id, codigo, nome, tipo, quantidade, saldo_apos, motivo)
  values (v_peca.id, v_peca.codigo, v_peca.nome, p_tipo, p_quantidade, v_peca.estoque, coalesce(trim(p_motivo), ''));

  return v_peca;
end;
$$;

revoke all on function public.registrar_movimento(uuid, text, integer, text) from public, anon;
grant execute on function public.registrar_movimento(uuid, text, integer, text) to authenticated;

/* --------------------- Níveis de acesso e usuários ---------------- */
-- "admin" cadastra e remove usuários; "balcao" usa o sistema no dia a dia.
-- O cadastro acontece aqui dentro do banco, por funções que só um
-- administrador consegue chamar. Assim a chave service_role nunca
-- precisa ir para dentro do programa.

alter table public.usuarios add column if not exists papel text not null default 'balcao';
alter table public.usuarios drop constraint if exists usuarios_papel_valido;
alter table public.usuarios add constraint usuarios_papel_valido check (papel in ('admin', 'balcao'));

create or replace function public.e_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and papel = 'admin');
$$;

revoke all on function public.e_admin() from public, anon;
grant execute on function public.e_admin() to authenticated;

create or replace function public.listar_usuarios()
returns table (id uuid, email text, nome text, papel text, criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_admin() then
    raise exception 'Só administradores podem ver os usuários.';
  end if;
  return query
    select u.id, u.email, u.nome, u.papel, u.criado_em, a.last_sign_in_at
      from public.usuarios u
      join auth.users a on a.id = u.id
     order by u.nome;
end;
$$;

create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text default 'balcao')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if not public.e_admin() then
    raise exception 'Só administradores podem criar usuários.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  if p_papel not in ('admin', 'balcao') then
    raise exception 'Nível de acesso inválido.';
  end if;

  select a.id into v_id from auth.users a where a.email = v_email;

  if v_id is null then
    -- Mesmo formato que o próprio Supabase grava ao criar um login confirmado.
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('nome', v_nome), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    -- O login já existia (alguém que perdeu o acesso): volta com a senha nova.
    if exists (select 1 from public.usuarios u where u.id = v_id) then
      raise exception 'Já existe um usuário com o e-mail %.', v_email;
    end if;
    update auth.users
       set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where auth.users.id = v_id;
  end if;

  insert into public.usuarios (id, email, nome, papel)
  values (v_id, v_email, coalesce(nullif(v_nome, ''), v_email), p_papel);
  return v_id;
end;
$$;

create or replace function public.alterar_usuario(p_id uuid, p_nome text, p_papel text, p_senha text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.e_admin() then
    raise exception 'Só administradores podem alterar usuários.';
  end if;
  if p_papel not in ('admin', 'balcao') then
    raise exception 'Nível de acesso inválido.';
  end if;
  if p_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  if coalesce(p_senha, '') <> '' and length(p_senha) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;

  update public.usuarios
     set nome = coalesce(nullif(trim(coalesce(p_nome, '')), ''), email),
         papel = p_papel
   where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  if coalesce(p_senha, '') <> '' then
    update auth.users
       set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
           updated_at = now()
     where id = p_id;
  end if;
end;
$$;

-- Apaga o login de vez. O histórico de movimentações guarda o e-mail
-- de quem fez, então nada se perde nele.
create or replace function public.remover_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.e_admin() then
    raise exception 'Só administradores podem remover usuários.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Você não pode remover o seu próprio usuário.';
  end if;
  if not exists (select 1 from public.usuarios where id = p_id) then
    raise exception 'Usuário não encontrado.';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

revoke all on function public.listar_usuarios() from public, anon;
revoke all on function public.criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.alterar_usuario(uuid, text, text, text) from public, anon;
revoke all on function public.remover_usuario(uuid) from public, anon;
grant execute on function public.listar_usuarios() to authenticated;
grant execute on function public.criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.alterar_usuario(uuid, text, text, text) to authenticated;
grant execute on function public.remover_usuario(uuid) to authenticated;

-- Avisa a API do Supabase que a estrutura mudou.
notify pgrst, 'reload schema';
