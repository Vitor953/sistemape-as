/*
 * Consulta de Autopeças — motor do sistema
 *
 * Este arquivo não abre janela nenhuma. Ele só responde às requisições
 * da tela. Quem cria a janela é o main.js.
 *
 * Os dados ficam no Supabase. Cada pessoa entra com o próprio usuário e o
 * motor conversa com o banco em nome dela, então as regras de acesso do
 * banco valem para tudo o que passa por aqui.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./config');

let PASTA_PUBLICA;

/* ------------------------------------------------------------------ */
/* Conversa com o Supabase                                             */
/* ------------------------------------------------------------------ */

class ErroDoBanco extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function chamarSupabase(caminho, { metodo = 'GET', token, corpo, cabecalhos = {} } = {}) {
  let resposta;
  try {
    resposta = await fetch(SUPABASE_URL + caminho, {
      method: metodo,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        ...cabecalhos
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    throw new ErroDoBanco('Sem conexão com o banco de dados. Confira a internet e tente de novo.', 503);
  }

  const texto = await resposta.text();
  let dado = null;
  try {
    dado = texto ? JSON.parse(texto) : null;
  } catch (e) {
    dado = null;
  }

  if (!resposta.ok) {
    // Sem JSON, quem respondeu não foi o Supabase (servidor fora do ar, proxy…).
    if (!dado) {
      throw new ErroDoBanco(
        `O servidor do banco de dados não respondeu como deveria (código ${resposta.status}). Tente de novo em instantes.`,
        503
      );
    }
    const mensagem =
      dado.message || dado.msg || dado.error_description || dado.error ||
      `O banco de dados recusou a operação (código ${resposta.status}).`;
    throw new ErroDoBanco(mensagem, resposta.status);
  }
  return dado;
}

/* ------------------------------------------------------------------ */
/* Sessões                                                             */
/* ------------------------------------------------------------------ */
// A tela recebe só um cookie com um número aleatório. Os tokens do
// Supabase ficam aqui no motor e nunca chegam à tela.

const sessoes = new Map();

function lerCookie(req) {
  const achado = (req.headers.cookie || '').match(/(?:^|;\s*)sessao=([a-f0-9]{64})/);
  return achado ? achado[1] : null;
}

function sessaoDaRequisicao(req) {
  return sessoes.get(lerCookie(req)) || null;
}

function guardarTokens(sessao, dado) {
  sessao.accessToken = dado.access_token;
  sessao.refreshToken = dado.refresh_token;
  sessao.expiraEm = Date.now() + (dado.expires_in || 3600) * 1000;
}

async function tokenDaSessao(sessao) {
  if (Date.now() < sessao.expiraEm - 60 * 1000) return sessao.accessToken;

  // Várias requisições podem pedir a renovação ao mesmo tempo; só uma vai ao banco.
  if (!sessao.renovando) {
    sessao.renovando = chamarSupabase('/auth/v1/token?grant_type=refresh_token', {
      metodo: 'POST',
      corpo: { refresh_token: sessao.refreshToken }
    })
      .then(dado => guardarTokens(sessao, dado))
      .finally(() => (sessao.renovando = null));
  }

  try {
    await sessao.renovando;
  } catch (erro) {
    if (erro.status === 503) throw erro;
    sessoes.delete(sessao.id);
    throw new ErroDoBanco('Sua sessão expirou. Entre de novo.', 401);
  }
  return sessao.accessToken;
}

async function banco(sessao, caminho, opcoes = {}) {
  return chamarSupabase(caminho, { ...opcoes, token: await tokenDaSessao(sessao) });
}

/* ------------------------------------------------------------------ */
/* Peças no banco                                                      */
/* ------------------------------------------------------------------ */

const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O Supabase devolve no máximo 1000 linhas por vez.
const TAMANHO_PAGINA = 1000;

function daLinha(l) {
  return {
    id: l.id,
    codigo: l.codigo,
    nome: l.nome,
    marca: l.marca,
    categoria: l.categoria,
    descricao: l.descricao,
    fornecedor: l.fornecedor,
    localizacao: l.localizacao,
    precoCusto: Number(l.preco_custo) || 0,
    precoVenda: Number(l.preco_venda) || 0,
    estoque: l.estoque,
    estoqueMinimo: l.estoque_minimo,
    equivalentes: l.equivalentes || [],
    aplicacoes: l.aplicacoes || [],
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em
  };
}

function paraLinha(p) {
  return {
    id: p.id,
    codigo: p.codigo,
    codigo_chave: somenteAlfanumerico(p.codigo),
    nome: p.nome,
    marca: p.marca,
    categoria: p.categoria,
    descricao: p.descricao,
    fornecedor: p.fornecedor,
    localizacao: p.localizacao,
    preco_custo: p.precoCusto,
    preco_venda: p.precoVenda,
    estoque: p.estoque,
    estoque_minimo: p.estoqueMinimo,
    equivalentes: p.equivalentes,
    aplicacoes: p.aplicacoes,
    criado_em: p.criadoEm,
    atualizado_em: p.atualizadoEm
  };
}

async function listarPecas(sessao) {
  const todas = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const pagina = await banco(
      sessao,
      `/rest/v1/pecas?select=*&order=codigo_chave.asc&limit=${TAMANHO_PAGINA}&offset=${inicio}`
    );
    todas.push(...pagina.map(daLinha));
    if (pagina.length < TAMANHO_PAGINA) return todas;
  }
}

async function listarMovimentosDesde(sessao, inicioISO) {
  const todos = [];
  const desde = encodeURIComponent(inicioISO);
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const pagina = await banco(
      sessao,
      `/rest/v1/movimentacoes?select=peca_id,codigo,nome,tipo,quantidade,data&data=gte.${desde}` +
        `&order=data.asc&limit=${TAMANHO_PAGINA}&offset=${inicio}`
    );
    todos.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) return todos;
  }
}

async function pecaPorId(sessao, id) {
  if (!ID_VALIDO.test(id)) return null;
  const linhas = await banco(sessao, `/rest/v1/pecas?select=*&id=eq.${id}`);
  return linhas.length ? daLinha(linhas[0]) : null;
}

async function pecaPorCodigo(sessao, codigo) {
  const chave = encodeURIComponent(somenteAlfanumerico(codigo));
  const linhas = await banco(sessao, `/rest/v1/pecas?select=*&codigo_chave=eq.${chave}`);
  return linhas.length ? daLinha(linhas[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Normalização e busca                                                */
/* ------------------------------------------------------------------ */

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function somenteAlfanumerico(texto) {
  return normalizar(texto).replace(/[^a-z0-9]/g, '');
}

function textoDaPeca(peca) {
  const aplicacoes = (peca.aplicacoes || [])
    .map(a => [a.montadora, a.modelo, a.motor, a.anoInicio, a.anoFim].filter(Boolean).join(' '))
    .join(' ');
  return normalizar(
    [
      peca.codigo,
      peca.nome,
      peca.marca,
      peca.categoria,
      peca.descricao,
      peca.fornecedor,
      peca.localizacao,
      (peca.equivalentes || []).join(' '),
      aplicacoes
    ].join(' ')
  );
}

function atendeAno(peca, ano) {
  return (peca.aplicacoes || []).some(a => {
    const inicio = Number(a.anoInicio) || 0;
    const fim = Number(a.anoFim) || 9999;
    return ano >= inicio && ano <= fim;
  });
}

function situacaoDaPeca(peca) {
  const estoque = Number(peca.estoque) || 0;
  const minimo = Number(peca.estoqueMinimo) || 0;
  if (estoque <= 0) return 'zerado';
  if (estoque <= minimo) return 'critico';
  return 'disponivel';
}

function buscar(pecas, filtros) {
  const termos = normalizar(filtros.q).split(/\s+/).filter(Boolean);

  let resultado = pecas.filter(peca => {
    const texto = textoDaPeca(peca);
    const textoLimpo = texto.replace(/[^a-z0-9]/g, '');

    const casaTodosOsTermos = termos.every(termo => {
      if (/^(19|20)\d{2}$/.test(termo) && atendeAno(peca, Number(termo))) return true;
      if (texto.includes(termo)) return true;
      const termoLimpo = termo.replace(/[^a-z0-9]/g, '');
      return termoLimpo.length >= 3 && textoLimpo.includes(termoLimpo);
    });
    if (!casaTodosOsTermos) return false;

    if (filtros.categoria && peca.categoria !== filtros.categoria) return false;
    if (filtros.marca && peca.marca !== filtros.marca) return false;
    if (filtros.montadora) {
      const temMontadora = (peca.aplicacoes || []).some(a => a.montadora === filtros.montadora);
      if (!temMontadora) return false;
    }
    if (filtros.situacao && situacaoDaPeca(peca) !== filtros.situacao) return false;
    return true;
  });

  const ordem = filtros.ordem || 'relevancia';
  const porTexto = (a, b) => normalizar(a.nome).localeCompare(normalizar(b.nome));

  if (ordem === 'nome') resultado.sort(porTexto);
  else if (ordem === 'codigo') resultado.sort((a, b) => normalizar(a.codigo).localeCompare(normalizar(b.codigo)));
  else if (ordem === 'estoque') resultado.sort((a, b) => (Number(a.estoque) || 0) - (Number(b.estoque) || 0));
  else if (ordem === 'preco') resultado.sort((a, b) => (Number(a.precoVenda) || 0) - (Number(b.precoVenda) || 0));
  else if (ordem === 'preco-desc') resultado.sort((a, b) => (Number(b.precoVenda) || 0) - (Number(a.precoVenda) || 0));
  else {
    // Relevância: código exato primeiro, depois início do nome, depois alfabético.
    const alvo = somenteAlfanumerico(filtros.q);
    resultado.sort((a, b) => {
      const pesoA = somenteAlfanumerico(a.codigo) === alvo ? 0 : normalizar(a.nome).startsWith(normalizar(filtros.q)) ? 1 : 2;
      const pesoB = somenteAlfanumerico(b.codigo) === alvo ? 0 : normalizar(b.nome).startsWith(normalizar(filtros.q)) ? 1 : 2;
      return pesoA - pesoB || porTexto(a, b);
    });
  }

  return resultado;
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

// Data no fuso do computador (o dia da loja), no formato 2026-10-05.
function diaLocal(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Os maiores primeiro; o que passar do limite vira uma linha "Outras".
function topoComOutras(mapa, limite, rotuloOutras = 'Outras') {
  const ordenado = [...mapa.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);
  if (ordenado.length <= limite) return ordenado;
  const resto = ordenado.slice(limite - 1).reduce((s, i) => s + i.valor, 0);
  return [...ordenado.slice(0, limite - 1), { rotulo: rotuloOutras, valor: resto }];
}

const FAIXAS_DE_PRECO = [
  { rotulo: 'até 50', ate: 50 },
  { rotulo: '50–100', ate: 100 },
  { rotulo: '100–200', ate: 200 },
  { rotulo: '200–500', ate: 500 },
  { rotulo: '500–1 mil', ate: 1000 },
  { rotulo: 'acima de 1 mil', ate: Infinity }
];

function montarPainel(pecas, movimentos, dias) {
  const somar = (lista, f) => lista.reduce((s, p) => s + (Number(f(p)) || 0), 0);

  /* Estoque agora */
  const valorCusto = somar(pecas, p => p.precoCusto * p.estoque);
  const valorVenda = somar(pecas, p => p.precoVenda * p.estoque);
  const situacoes = { disponivel: 0, critico: 0, zerado: 0 };
  pecas.forEach(p => situacoes[situacaoDaPeca(p)]++);

  const valorPorCategoria = new Map();
  const custoPorCategoria = new Map();
  const vendaPorCategoria = new Map();
  const pecasPorMontadora = new Map();
  for (const p of pecas) {
    const categoria = p.categoria || 'Sem categoria';
    valorPorCategoria.set(categoria, (valorPorCategoria.get(categoria) || 0) + p.precoVenda * p.estoque);
    custoPorCategoria.set(categoria, (custoPorCategoria.get(categoria) || 0) + p.precoCusto);
    vendaPorCategoria.set(categoria, (vendaPorCategoria.get(categoria) || 0) + p.precoVenda);
    for (const montadora of new Set((p.aplicacoes || []).map(a => a.montadora).filter(Boolean))) {
      pecasPorMontadora.set(montadora, (pecasPorMontadora.get(montadora) || 0) + 1);
    }
  }

  // Margem da categoria = quanto o preço de venda está acima do custo, somando as peças dela.
  const margemPorCategoria = [...custoPorCategoria.entries()]
    .filter(([, custo]) => custo > 0)
    .map(([rotulo, custo]) => ({ rotulo, valor: ((vendaPorCategoria.get(rotulo) - custo) / custo) * 100 }))
    .sort((a, b) => b.valor - a.valor);

  const faixasDePreco = FAIXAS_DE_PRECO.map(f => ({ rotulo: f.rotulo, valor: 0 }));
  for (const p of pecas) faixasDePreco[FAIXAS_DE_PRECO.findIndex(f => p.precoVenda < f.ate)].valor++;

  // As que acabam primeiro: saldo mais perto (ou abaixo) do mínimo.
  const reposicao = pecas
    .filter(p => situacaoDaPeca(p) !== 'disponivel')
    .sort((a, b) => a.estoque - a.estoqueMinimo - (b.estoque - b.estoqueMinimo) || a.estoque - b.estoque)
    .slice(0, 8)
    .map(p => ({ codigo: p.codigo, nome: p.nome, estoque: p.estoque, minimo: p.estoqueMinimo }));

  /* Movimento no período */
  const porDia = new Map();
  const hoje = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
    porDia.set(diaLocal(d), { data: diaLocal(d), entradas: 0, saidas: 0 });
  }
  const vendidas = new Map();
  for (const m of movimentos) {
    const dia = porDia.get(diaLocal(m.data));
    if (!dia) continue;
    if (m.tipo === 'entrada') dia.entradas += m.quantidade;
    else {
      dia.saidas += m.quantidade;
      const chave = m.peca_id || m.codigo;
      const atual = vendidas.get(chave) || { codigo: m.codigo, nome: m.nome, valor: 0 };
      atual.valor += m.quantidade;
      vendidas.set(chave, atual);
    }
  }
  const serie = [...porDia.values()];

  return {
    dias,
    estoque: {
      itens: pecas.length,
      unidades: somar(pecas, p => p.estoque),
      valorCusto,
      valorVenda,
      situacoes
    },
    periodo: {
      entradas: somar(serie, d => d.entradas),
      saidas: somar(serie, d => d.saidas),
      movimentos: movimentos.length
    },
    porDia: serie,
    maisVendidas: [...vendidas.values()]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
      .map(v => ({ rotulo: `${v.codigo} · ${v.nome}`, valor: v.valor })),
    valorPorCategoria: topoComOutras(valorPorCategoria, 8),
    margemPorCategoria: margemPorCategoria.slice(0, 8),
    pecasPorMontadora: topoComOutras(pecasPorMontadora, 8, 'Outras montadoras'),
    faixasDePreco,
    reposicao
  };
}

/* ------------------------------------------------------------------ */
/* Saneamento dos dados vindos do formulário                           */
/* ------------------------------------------------------------------ */

function numero(valor, padrao = 0) {
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : padrao;
}

function sanearPeca(entrada, anterior) {
  const base = anterior || {};
  return {
    id: base.id || crypto.randomUUID(),
    codigo: String(entrada.codigo ?? base.codigo ?? '').trim(),
    nome: String(entrada.nome ?? base.nome ?? '').trim(),
    marca: String(entrada.marca ?? base.marca ?? '').trim(),
    categoria: String(entrada.categoria ?? base.categoria ?? '').trim(),
    descricao: String(entrada.descricao ?? base.descricao ?? '').trim(),
    fornecedor: String(entrada.fornecedor ?? base.fornecedor ?? '').trim(),
    localizacao: String(entrada.localizacao ?? base.localizacao ?? '').trim(),
    precoCusto: numero(entrada.precoCusto ?? base.precoCusto, 0),
    precoVenda: numero(entrada.precoVenda ?? base.precoVenda, 0),
    estoque: Math.round(numero(entrada.estoque ?? base.estoque, 0)),
    estoqueMinimo: Math.round(numero(entrada.estoqueMinimo ?? base.estoqueMinimo, 0)),
    equivalentes: Array.isArray(entrada.equivalentes)
      ? entrada.equivalentes.map(c => String(c).trim()).filter(Boolean)
      : base.equivalentes || [],
    aplicacoes: Array.isArray(entrada.aplicacoes)
      ? entrada.aplicacoes
          .map(a => ({
            montadora: String(a.montadora || '').trim(),
            modelo: String(a.modelo || '').trim(),
            anoInicio: a.anoInicio ? Math.round(numero(a.anoInicio)) : null,
            anoFim: a.anoFim ? Math.round(numero(a.anoFim)) : null,
            motor: String(a.motor || '').trim()
          }))
          .filter(a => a.montadora || a.modelo)
      : base.aplicacoes || [],
    criadoEm: base.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const COLUNAS_CSV = [
  'codigo',
  'nome',
  'marca',
  'categoria',
  'preco_custo',
  'preco_venda',
  'estoque',
  'estoque_minimo',
  'localizacao',
  'fornecedor',
  'equivalentes',
  'aplicacoes',
  'descricao'
];

function aplicacaoParaTexto(a) {
  const anos = a.anoInicio || a.anoFim ? `${a.anoInicio || ''}-${a.anoFim || ''}` : '';
  return [a.montadora, a.modelo, anos, a.motor].filter(Boolean).join(' > ');
}

function textoParaAplicacao(texto) {
  const partes = String(texto).split('>').map(p => p.trim());
  const anos = (partes[2] || '').split('-');
  return {
    montadora: partes[0] || '',
    modelo: partes[1] || '',
    anoInicio: anos[0] ? Number(anos[0]) : null,
    anoFim: anos[1] ? Number(anos[1]) : null,
    motor: partes[3] || ''
  };
}

function escaparCSV(valor) {
  const texto = String(valor ?? '');
  return /[";\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

function gerarCSV(pecas) {
  const linhas = [COLUNAS_CSV.join(';')];
  for (const p of pecas) {
    linhas.push(
      [
        p.codigo,
        p.nome,
        p.marca,
        p.categoria,
        String(p.precoCusto ?? 0).replace('.', ','),
        String(p.precoVenda ?? 0).replace('.', ','),
        p.estoque ?? 0,
        p.estoqueMinimo ?? 0,
        p.localizacao,
        p.fornecedor,
        (p.equivalentes || []).join(' | '),
        (p.aplicacoes || []).map(aplicacaoParaTexto).join(' // '),
        p.descricao
      ]
        .map(escaparCSV)
        .join(';')
    );
  }
  return '﻿' + linhas.join('\r\n');
}

function dividirLinhaCSV(linha, separador) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map(c => c.trim());
}

// Só devolve os campos que a planilha traz preenchidos. Assim, ao atualizar
// uma peça que já existe, coluna ausente ou célula vazia mantém o valor atual.
function lerCSV(texto) {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  const linhas = limpo.split('\n').filter(l => l.trim());
  if (!linhas.length) return [];
  const separador = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const cabecalho = dividirLinhaCSV(linhas[0], separador).map(c => normalizar(c).replace(/\s+/g, '_'));

  return linhas.slice(1).map(linha => {
    const campos = dividirLinhaCSV(linha, separador);
    const obj = {};
    cabecalho.forEach((coluna, i) => (obj[coluna] = campos[i] ?? ''));
    const preenchido = coluna => obj[coluna] !== undefined && obj[coluna] !== '';

    const peca = { codigo: obj.codigo || '' };
    for (const campo of ['nome', 'marca', 'categoria', 'descricao', 'fornecedor', 'localizacao']) {
      if (preenchido(campo)) peca[campo] = obj[campo];
    }
    // Planilhas de outros sistemas às vezes chamam o nome da peça de "descricao".
    if (!cabecalho.includes('nome') && preenchido('descricao')) peca.nome = obj.descricao;

    if (preenchido('preco_custo')) peca.precoCusto = numero(obj.preco_custo, 0);
    if (preenchido('preco_venda')) peca.precoVenda = numero(obj.preco_venda, 0);
    if (preenchido('estoque')) peca.estoque = numero(obj.estoque, 0);
    if (preenchido('estoque_minimo')) peca.estoqueMinimo = numero(obj.estoque_minimo, 0);
    if (preenchido('equivalentes')) {
      peca.equivalentes = obj.equivalentes.split('|').map(s => s.trim()).filter(Boolean);
    }
    if (preenchido('aplicacoes')) {
      peca.aplicacoes = obj.aplicacoes.split('//').map(s => s.trim()).filter(Boolean).map(textoParaAplicacao);
    }
    return peca;
  });
}

/* ------------------------------------------------------------------ */
/* Utilitários HTTP                                                    */
/* ------------------------------------------------------------------ */

function responderJSON(res, status, dado) {
  const corpo = JSON.stringify(dado);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(corpo)
  });
  res.end(corpo);
}

function redirecionar(res, destino) {
  res.writeHead(302, { Location: destino, 'Cache-Control': 'no-store' });
  res.end();
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', parte => {
      dados += parte;
      if (dados.length > 20 * 1024 * 1024) {
        reject(new Error('Arquivo grande demais. O limite é 20 MB.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch (e) {
        reject(new Error('Não foi possível ler os dados enviados.'));
      }
    });
    req.on('error', reject);
  });
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function servirEstatico(req, res, caminhoUrl) {
  const logado = Boolean(sessaoDaRequisicao(req));
  // Sem login, a tela principal manda para a página de entrada, e vice-versa.
  if ((caminhoUrl === '/' || caminhoUrl === '/index.html') && !logado) return redirecionar(res, '/login.html');
  if (caminhoUrl === '/login.html' && logado) return redirecionar(res, '/');

  let relativo;
  try {
    relativo = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl).replace(/^\/+/, '');
  } catch (e) {
    res.writeHead(400).end('Endereço inválido.');
    return;
  }
  const alvo = path.join(PASTA_PUBLICA, relativo);
  if (!alvo.startsWith(PASTA_PUBLICA)) {
    res.writeHead(403).end('Acesso negado.');
    return;
  }
  fs.readFile(alvo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Página não encontrada.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(conteudo);
  });
}

/* ------------------------------------------------------------------ */
/* Entrada e saída do sistema                                          */
/* ------------------------------------------------------------------ */

async function entrar(req, res) {
  const corpo = await lerCorpo(req);
  const email = String(corpo.email || '').trim().toLowerCase();
  const senha = String(corpo.senha || '');
  if (!email || !senha) return responderJSON(res, 400, { erro: 'Informe o e-mail e a senha.' });

  let dado;
  try {
    dado = await chamarSupabase('/auth/v1/token?grant_type=password', {
      metodo: 'POST',
      corpo: { email, password: senha }
    });
  } catch (erro) {
    if (erro.status === 400 || erro.status === 401) {
      return responderJSON(res, 401, { erro: 'E-mail ou senha incorretos.' });
    }
    if (erro.status === 429) {
      return responderJSON(res, 429, { erro: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' });
    }
    throw erro;
  }

  // Ter conta não basta: a pessoa precisa estar liberada na tabela "usuarios".
  const perfil = await chamarSupabase(`/rest/v1/usuarios?select=nome,email&id=eq.${dado.user.id}`, {
    token: dado.access_token
  });
  if (!perfil.length) {
    chamarSupabase('/auth/v1/logout', { metodo: 'POST', token: dado.access_token }).catch(() => {});
    return responderJSON(res, 403, { erro: 'Este usuário não tem acesso ao sistema. Fale com o responsável.' });
  }

  const sessao = {
    id: crypto.randomBytes(32).toString('hex'),
    usuario: { id: dado.user.id, email: dado.user.email, nome: perfil[0].nome || dado.user.email }
  };
  guardarTokens(sessao, dado);
  sessoes.set(sessao.id, sessao);

  res.setHeader('Set-Cookie', `sessao=${sessao.id}; HttpOnly; SameSite=Strict; Path=/`);
  return responderJSON(res, 200, { usuario: sessao.usuario });
}

function sair(req, res) {
  const sessao = sessaoDaRequisicao(req);
  if (sessao) {
    sessoes.delete(sessao.id);
    chamarSupabase('/auth/v1/logout', { metodo: 'POST', token: sessao.accessToken }).catch(() => {});
  }
  res.setHeader('Set-Cookie', 'sessao=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return responderJSON(res, 200, { saiu: true });
}

/* ------------------------------------------------------------------ */
/* Rotas da API                                                        */
/* ------------------------------------------------------------------ */

async function tratarAPI(req, res, url) {
  const partes = url.pathname.split('/').filter(Boolean); // ['api', 'pecas', id?]
  const recurso = partes[1];
  const id = partes[2];
  const acao = partes[3];

  if (recurso === 'login' && req.method === 'POST') return entrar(req, res);
  if (recurso === 'logout' && req.method === 'POST') return sair(req, res);

  // Daqui para baixo, só com login.
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) return responderJSON(res, 401, { erro: 'Entre com seu usuário para continuar.' });

  /* ---- Quem está usando ---- */
  if (recurso === 'sessao' && req.method === 'GET') {
    return responderJSON(res, 200, { usuario: sessao.usuario });
  }

  /* ---- Listagem e busca ---- */
  if (recurso === 'pecas' && !id && req.method === 'GET') {
    const filtros = {
      q: url.searchParams.get('q') || '',
      categoria: url.searchParams.get('categoria') || '',
      marca: url.searchParams.get('marca') || '',
      montadora: url.searchParams.get('montadora') || '',
      situacao: url.searchParams.get('situacao') || '',
      ordem: url.searchParams.get('ordem') || 'relevancia'
    };
    const todas = await listarPecas(sessao);
    const encontradas = buscar(todas, filtros);
    return responderJSON(res, 200, {
      total: todas.length,
      encontradas: encontradas.length,
      pecas: encontradas.map(p => ({ ...p, situacao: situacaoDaPeca(p) }))
    });
  }

  /* ---- Cadastro ---- */
  if (recurso === 'pecas' && !id && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    if (!String(corpo.codigo || '').trim() || !String(corpo.nome || '').trim()) {
      return responderJSON(res, 400, { erro: 'Informe ao menos o código e o nome da peça.' });
    }
    const duplicada = await pecaPorCodigo(sessao, corpo.codigo);
    if (duplicada) {
      return responderJSON(res, 409, { erro: `O código ${corpo.codigo} já está cadastrado em "${duplicada.nome}".` });
    }
    const [linha] = await banco(sessao, '/rest/v1/pecas', {
      metodo: 'POST',
      corpo: paraLinha(sanearPeca(corpo, null)),
      cabecalhos: { Prefer: 'return=representation' }
    });
    return responderJSON(res, 201, daLinha(linha));
  }

  /* ---- Edição ---- */
  if (recurso === 'pecas' && id && !acao && req.method === 'PUT') {
    const corpo = await lerCorpo(req);
    const anterior = await pecaPorId(sessao, id);
    if (!anterior) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });

    const conflito = await pecaPorCodigo(sessao, corpo.codigo || anterior.codigo);
    if (conflito && conflito.id !== id) {
      return responderJSON(res, 409, { erro: `O código ${corpo.codigo} já pertence a "${conflito.nome}".` });
    }

    // "versao" é a data da última alteração que a tela conhecia. Se outro
    // computador mexeu na peça depois disso, nada é gravado por cima.
    let filtro = `id=eq.${id}`;
    if (corpo.versao) filtro += `&atualizado_em=eq.${encodeURIComponent(corpo.versao)}`;

    const linhas = await banco(sessao, `/rest/v1/pecas?${filtro}`, {
      metodo: 'PATCH',
      corpo: paraLinha(sanearPeca(corpo, anterior)),
      cabecalhos: { Prefer: 'return=representation' }
    });
    if (!linhas.length) {
      return responderJSON(res, 409, {
        erro: 'Esta peça foi alterada em outro computador enquanto você editava. Feche, abra a peça de novo e refaça a alteração.'
      });
    }
    return responderJSON(res, 200, daLinha(linhas[0]));
  }

  /* ---- Exclusão ---- */
  if (recurso === 'pecas' && id && !acao && req.method === 'DELETE') {
    if (!ID_VALIDO.test(id)) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });
    const removidas = await banco(sessao, `/rest/v1/pecas?id=eq.${id}`, {
      metodo: 'DELETE',
      cabecalhos: { Prefer: 'return=representation' }
    });
    if (!removidas.length) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });
    return responderJSON(res, 200, { removida: true });
  }

  /* ---- Entrada e saída de estoque ---- */
  if (recurso === 'pecas' && id && acao === 'movimento' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const quantidade = Math.abs(Math.round(numero(corpo.quantidade, 0)));
    if (!quantidade) return responderJSON(res, 400, { erro: 'Informe uma quantidade maior que zero.' });
    if (!ID_VALIDO.test(id)) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });

    // A conferência de saldo e a gravação acontecem juntas, dentro do banco.
    const resultado = await banco(sessao, '/rest/v1/rpc/registrar_movimento', {
      metodo: 'POST',
      corpo: {
        p_peca_id: id,
        p_tipo: corpo.tipo === 'saida' ? 'saida' : 'entrada',
        p_quantidade: quantidade,
        p_motivo: String(corpo.motivo || '').trim()
      }
    });
    const peca = daLinha(Array.isArray(resultado) ? resultado[0] : resultado);
    return responderJSON(res, 200, { ...peca, situacao: situacaoDaPeca(peca) });
  }

  /* ---- Histórico de movimentações ---- */
  if (recurso === 'movimentacoes' && req.method === 'GET') {
    const limite = Math.min(Math.max(Number(url.searchParams.get('limite')) || 100, 1), TAMANHO_PAGINA);
    const pecaId = url.searchParams.get('pecaId');
    let caminho = `/rest/v1/movimentacoes?select=*&order=data.desc&limit=${limite}`;
    if (pecaId) {
      if (!ID_VALIDO.test(pecaId)) return responderJSON(res, 200, []);
      caminho += `&peca_id=eq.${pecaId}`;
    }
    const linhas = await banco(sessao, caminho);
    return responderJSON(
      res,
      200,
      linhas.map(m => ({
        id: m.id,
        pecaId: m.peca_id,
        codigo: m.codigo,
        nome: m.nome,
        tipo: m.tipo,
        quantidade: m.quantidade,
        saldoApos: m.saldo_apos,
        motivo: m.motivo,
        usuario: m.usuario_email || '',
        data: m.data
      }))
    );
  }

  /* ---- Resumo do estoque ---- */
  if (recurso === 'resumo' && req.method === 'GET') {
    const pecas = await listarPecas(sessao);
    const resumo = {
      totalItens: pecas.length,
      totalUnidades: pecas.reduce((s, p) => s + (Number(p.estoque) || 0), 0),
      valorCusto: pecas.reduce((s, p) => s + (Number(p.precoCusto) || 0) * (Number(p.estoque) || 0), 0),
      valorVenda: pecas.reduce((s, p) => s + (Number(p.precoVenda) || 0) * (Number(p.estoque) || 0), 0),
      criticos: pecas.filter(p => situacaoDaPeca(p) === 'critico').length,
      zerados: pecas.filter(p => situacaoDaPeca(p) === 'zerado').length,
      categorias: [...new Set(pecas.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      marcas: [...new Set(pecas.map(p => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      montadoras: [
        ...new Set(pecas.flatMap(p => (p.aplicacoes || []).map(a => a.montadora)).filter(Boolean))
      ].sort((a, b) => a.localeCompare(b))
    };
    return responderJSON(res, 200, resumo);
  }

  /* ---- Painel ---- */
  if (recurso === 'painel' && req.method === 'GET') {
    const dias = [7, 30, 90].includes(Number(url.searchParams.get('dias'))) ? Number(url.searchParams.get('dias')) : 30;
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1));
    const [pecas, movimentos] = await Promise.all([
      listarPecas(sessao),
      listarMovimentosDesde(sessao, inicio.toISOString())
    ]);
    return responderJSON(res, 200, montarPainel(pecas, movimentos, dias));
  }

  /* ---- Exportar CSV ---- */
  if (recurso === 'exportar' && req.method === 'GET') {
    const csv = gerarCSV(await listarPecas(sessao));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pecas-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    return res.end(csv);
  }

  /* ---- Importar CSV ---- */
  if (recurso === 'importar' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const linhas = lerCSV(String(corpo.csv || ''));
    if (!linhas.length) return responderJSON(res, 400, { erro: 'Nenhuma linha válida encontrada no arquivo.' });

    const existentes = new Map((await listarPecas(sessao)).map(p => [somenteAlfanumerico(p.codigo), p]));
    // Um código repetido na planilha vira uma peça só (vale a última linha).
    const lote = new Map();
    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const linha of linhas) {
      const chave = somenteAlfanumerico(linha.codigo);
      const anterior = lote.get(chave) || existentes.get(chave) || null;
      if (!chave || (!anterior && !String(linha.nome || '').trim())) {
        ignoradas++;
        continue;
      }
      if (!lote.has(chave)) {
        if (existentes.has(chave)) atualizadas++;
        else criadas++;
      }
      lote.set(chave, sanearPeca(linha, anterior));
    }

    const pecas = [...lote.values()].map(paraLinha);
    for (let i = 0; i < pecas.length; i += 500) {
      await banco(sessao, '/rest/v1/pecas?on_conflict=codigo_chave', {
        metodo: 'POST',
        corpo: pecas.slice(i, i + 500),
        cabecalhos: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      });
    }
    return responderJSON(res, 200, { criadas, atualizadas, ignoradas });
  }

  return responderJSON(res, 404, { erro: 'Endereço não encontrado na API.' });
}

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */

function criarServidor({ pastaPublica }) {
  PASTA_PUBLICA = pastaPublica;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      try {
        await tratarAPI(req, res, url);
      } catch (erro) {
        const status = erro.status >= 400 && erro.status < 600 ? erro.status : 500;
        responderJSON(res, status, { erro: erro.message || 'Erro inesperado no servidor.' });
      }
      return;
    }

    servirEstatico(req, res, url.pathname);
  });
}

/**
 * Sobe o servidor numa porta livre escolhida pelo sistema.
 * Devolve { servidor, porta }.
 */
function iniciar({ pastaPublica, porta = 0 }) {
  return new Promise((resolve, reject) => {
    const servidor = criarServidor({ pastaPublica });
    servidor.once('error', reject);
    servidor.listen(porta, '127.0.0.1', () => {
      resolve({ servidor, porta: servidor.address().port });
    });
  });
}

module.exports = { criarServidor, iniciar };

/* --- Modo avulso: node servidor.js, sem janela, para depuração --- */
if (require.main === module) {
  iniciar({
    pastaPublica: path.join(__dirname, 'public'),
    porta: Number(process.env.PORTA || 3000)
  }).then(({ porta }) => {
    console.log(`\n  Motor no ar em http://localhost:${porta}\n  Banco: ${SUPABASE_URL}\n  Ctrl + C para encerrar.\n`);
  });
}
