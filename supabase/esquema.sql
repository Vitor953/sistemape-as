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

-- Avisa a API do Supabase que a estrutura mudou.
notify pgrst, 'reload schema';
