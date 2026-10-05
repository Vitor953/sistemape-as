/*
 * Consulta de Autopeças — motor do sistema
 *
 * Este arquivo não abre janela nenhuma. Ele só responde às requisições
 * da tela. Quem cria a janela é o main.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let PASTA_PUBLICA;
let PASTA_DADOS;
let ARQ_PECAS;
let ARQ_MOVIMENTOS;

/* ------------------------------------------------------------------ */
/* Armazenamento em arquivo JSON                                       */
/* ------------------------------------------------------------------ */

function lerJSON(arquivo, padrao) {
  try {
    const bruto = fs.readFileSync(arquivo, 'utf8');
    const dado = JSON.parse(bruto);
    return Array.isArray(dado) ? dado : padrao;
  } catch (e) {
    return padrao;
  }
}

function salvarJSON(arquivo, dado) {
  if (!fs.existsSync(PASTA_DADOS)) fs.mkdirSync(PASTA_DADOS, { recursive: true });
  const temporario = arquivo + '.tmp';
  fs.writeFileSync(temporario, JSON.stringify(dado, null, 2), 'utf8');
  fs.renameSync(temporario, arquivo);
}

const banco = {
  get pecas() {
    return lerJSON(ARQ_PECAS, []);
  },
  set pecas(v) {
    salvarJSON(ARQ_PECAS, v);
  },
  get movimentos() {
    return lerJSON(ARQ_MOVIMENTOS, []);
  },
  set movimentos(v) {
    salvarJSON(ARQ_MOVIMENTOS, v);
  }
};

/* ------------------------------------------------------------------ */
/* Normalização e busca                                                */
/* ------------------------------------------------------------------ */

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  return '\uFEFF' + linhas.join('\r\n');
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

function lerCSV(texto) {
  const limpo = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const linhas = limpo.split('\n').filter(l => l.trim());
  if (!linhas.length) return [];
  const separador = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const cabecalho = dividirLinhaCSV(linhas[0], separador).map(c => normalizar(c).replace(/\s+/g, '_'));

  return linhas.slice(1).map(linha => {
    const campos = dividirLinhaCSV(linha, separador);
    const obj = {};
    cabecalho.forEach((coluna, i) => (obj[coluna] = campos[i] ?? ''));
    return {
      codigo: obj.codigo || '',
      nome: obj.nome || obj.descricao || '',
      marca: obj.marca || '',
      categoria: obj.categoria || '',
      descricao: obj.descricao || '',
      fornecedor: obj.fornecedor || '',
      localizacao: obj.localizacao || '',
      precoCusto: numero(obj.preco_custo, 0),
      precoVenda: numero(obj.preco_venda, 0),
      estoque: numero(obj.estoque, 0),
      estoqueMinimo: numero(obj.estoque_minimo, 0),
      equivalentes: (obj.equivalentes || '').split('|').map(s => s.trim()).filter(Boolean),
      aplicacoes: (obj.aplicacoes || '').split('//').map(s => s.trim()).filter(Boolean).map(textoParaAplicacao)
    };
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
  const relativo = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl).replace(/^\/+/, '');
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
/* Rotas da API                                                        */
/* ------------------------------------------------------------------ */

async function tratarAPI(req, res, url) {
  const partes = url.pathname.split('/').filter(Boolean); // ['api', 'pecas', id?]
  const recurso = partes[1];
  const id = partes[2];
  const acao = partes[3];

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
    const todas = banco.pecas;
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
    const pecas = banco.pecas;
    const duplicada = pecas.find(p => somenteAlfanumerico(p.codigo) === somenteAlfanumerico(corpo.codigo));
    if (duplicada) {
      return responderJSON(res, 409, { erro: `O código ${corpo.codigo} já está cadastrado em "${duplicada.nome}".` });
    }
    const nova = sanearPeca(corpo, null);
    pecas.push(nova);
    banco.pecas = pecas;
    return responderJSON(res, 201, nova);
  }

  /* ---- Edição ---- */
  if (recurso === 'pecas' && id && !acao && req.method === 'PUT') {
    const corpo = await lerCorpo(req);
    const pecas = banco.pecas;
    const indice = pecas.findIndex(p => p.id === id);
    if (indice < 0) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });

    const conflito = pecas.find(
      p => p.id !== id && somenteAlfanumerico(p.codigo) === somenteAlfanumerico(corpo.codigo || pecas[indice].codigo)
    );
    if (conflito) {
      return responderJSON(res, 409, { erro: `O código ${corpo.codigo} já pertence a "${conflito.nome}".` });
    }

    pecas[indice] = sanearPeca(corpo, pecas[indice]);
    banco.pecas = pecas;
    return responderJSON(res, 200, pecas[indice]);
  }

  /* ---- Exclusão ---- */
  if (recurso === 'pecas' && id && !acao && req.method === 'DELETE') {
    const pecas = banco.pecas;
    const restantes = pecas.filter(p => p.id !== id);
    if (restantes.length === pecas.length) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });
    banco.pecas = restantes;
    return responderJSON(res, 200, { removida: true });
  }

  /* ---- Entrada e saída de estoque ---- */
  if (recurso === 'pecas' && id && acao === 'movimento' && req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const quantidade = Math.abs(Math.round(numero(corpo.quantidade, 0)));
    if (!quantidade) return responderJSON(res, 400, { erro: 'Informe uma quantidade maior que zero.' });

    const pecas = banco.pecas;
    const peca = pecas.find(p => p.id === id);
    if (!peca) return responderJSON(res, 404, { erro: 'Peça não encontrada.' });

    const tipo = corpo.tipo === 'saida' ? 'saida' : 'entrada';
    if (tipo === 'saida' && quantidade > (peca.estoque || 0)) {
      return responderJSON(res, 400, {
        erro: `Saldo insuficiente: há ${peca.estoque || 0} em estoque e você pediu baixa de ${quantidade}.`
      });
    }

    peca.estoque = (Number(peca.estoque) || 0) + (tipo === 'entrada' ? quantidade : -quantidade);
    peca.atualizadoEm = new Date().toISOString();
    banco.pecas = pecas;

    const movimentos = banco.movimentos;
    movimentos.unshift({
      id: crypto.randomUUID(),
      pecaId: peca.id,
      codigo: peca.codigo,
      nome: peca.nome,
      tipo,
      quantidade,
      saldoApos: peca.estoque,
      motivo: String(corpo.motivo || '').trim(),
      data: new Date().toISOString()
    });
    banco.movimentos = movimentos.slice(0, 5000);

    return responderJSON(res, 200, { ...peca, situacao: situacaoDaPeca(peca) });
  }

  /* ---- Histórico de movimentações ---- */
  if (recurso === 'movimentacoes' && req.method === 'GET') {
    const limite = Number(url.searchParams.get('limite')) || 100;
    const pecaId = url.searchParams.get('pecaId');
    let lista = banco.movimentos;
    if (pecaId) lista = lista.filter(m => m.pecaId === pecaId);
    return responderJSON(res, 200, lista.slice(0, limite));
  }

  /* ---- Resumo do estoque ---- */
  if (recurso === 'resumo' && req.method === 'GET') {
    const pecas = banco.pecas;
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

  /* ---- Exportar CSV ---- */
  if (recurso === 'exportar' && req.method === 'GET') {
    const csv = gerarCSV(banco.pecas);
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

    const pecas = banco.pecas;
    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const linha of linhas) {
      if (!linha.codigo || !linha.nome) {
        ignoradas++;
        continue;
      }
      const indice = pecas.findIndex(p => somenteAlfanumerico(p.codigo) === somenteAlfanumerico(linha.codigo));
      if (indice >= 0) {
        pecas[indice] = sanearPeca(linha, pecas[indice]);
        atualizadas++;
      } else {
        pecas.push(sanearPeca(linha, null));
        criadas++;
      }
    }
    banco.pecas = pecas;
    return responderJSON(res, 200, { criadas, atualizadas, ignoradas });
  }

  return responderJSON(res, 404, { erro: 'Endereço não encontrado na API.' });
}

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */

function criarServidor({ pastaPublica, pastaDados }) {
  PASTA_PUBLICA = pastaPublica;
  PASTA_DADOS = pastaDados;
  ARQ_PECAS = path.join(pastaDados, 'pecas.json');
  ARQ_MOVIMENTOS = path.join(pastaDados, 'movimentacoes.json');

  if (!fs.existsSync(PASTA_DADOS)) fs.mkdirSync(PASTA_DADOS, { recursive: true });
  if (!fs.existsSync(ARQ_PECAS)) salvarJSON(ARQ_PECAS, []);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      try {
        await tratarAPI(req, res, url);
      } catch (erro) {
        responderJSON(res, 500, { erro: erro.message || 'Erro inesperado no servidor.' });
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
function iniciar({ pastaPublica, pastaDados, porta = 0 }) {
  return new Promise((resolve, reject) => {
    const servidor = criarServidor({ pastaPublica, pastaDados });
    servidor.once('error', reject);
    servidor.listen(porta, '127.0.0.1', () => {
      resolve({ servidor, porta: servidor.address().port });
    });
  });
}

module.exports = { criarServidor, iniciar, contarPecas: () => banco.pecas.length };

/* --- Modo avulso: node servidor.js, sem janela, para depuração --- */
if (require.main === module) {
  const pastaDados = path.join(__dirname, 'dados-teste');
  const semente = path.join(__dirname, 'dados-iniciais', 'pecas.json');
  if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados, { recursive: true });
  if (!fs.existsSync(path.join(pastaDados, 'pecas.json')) && fs.existsSync(semente)) {
    fs.copyFileSync(semente, path.join(pastaDados, 'pecas.json'));
  }

  iniciar({
    pastaPublica: path.join(__dirname, 'public'),
    pastaDados,
    porta: Number(process.env.PORTA || 3000)
  }).then(({ porta }) => {
    console.log(`\n  Motor no ar em http://localhost:${porta}\n  Ctrl + C para encerrar.\n`);
  });
}
