/* ==================================================================
   Consulta de Autopeças — painel de gráficos
   Tudo desenhado em SVG e HTML puros, sem biblioteca. Cada gráfico
   tem uma tabela com os mesmos números (botão "Tabela" no cartão).
   ================================================================== */

const painel = { dias: 30, dados: null, cartoes: [] };

const fmtNumero = new Intl.NumberFormat('pt-BR');
const fmtDinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPorcento = valor => `${fmtNumero.format(Math.round(valor))}%`;
const fmtUnidades = valor => `${fmtNumero.format(valor)} un`;

/* ----------------------------- Peças de DOM ---------------------- */

function el(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function svgEl(tag, atributos = {}) {
  const elemento = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [chave, valor] of Object.entries(atributos)) elemento.setAttribute(chave, valor);
  return elemento;
}

function svgTexto(x, y, texto, atributos = {}) {
  const t = svgEl('text', { x, y, ...atributos });
  t.textContent = texto;
  return t;
}

function vazio(corpo, mensagem) {
  corpo.append(el('p', 'dash-vazio', mensagem));
}

/* ------------------------------ Dica (tooltip) ------------------- */
// Valor em destaque, nome da série em segundo plano, chave em traço.

const dica = el('div', 'dash-dica');
dica.hidden = true;
document.body.append(dica);

function preencherDica(titulo, linhas) {
  dica.replaceChildren();
  if (titulo) dica.append(el('div', 'dash-dica__titulo', titulo));
  for (const linha of linhas) {
    const item = el('div', 'dash-dica__linha');
    if (linha.cor) {
      const chave = el('span', 'dash-dica__chave');
      chave.style.background = linha.cor;
      item.append(chave);
    }
    item.append(el('strong', '', linha.valor));
    if (linha.rotulo) item.append(el('span', 'dash-dica__rotulo', linha.rotulo));
    dica.append(item);
  }
  dica.hidden = false;
}

function posicionarDica(x, y) {
  const caixa = dica.getBoundingClientRect();
  let esquerda = x + 14;
  let topo = y + 14;
  if (esquerda + caixa.width > window.innerWidth - 8) esquerda = x - caixa.width - 14;
  if (topo + caixa.height > window.innerHeight - 8) topo = y - caixa.height - 14;
  dica.style.left = `${Math.max(8, esquerda)}px`;
  dica.style.top = `${Math.max(8, topo)}px`;
}

function esconderDica() {
  dica.hidden = true;
}

// A dica fica presa à tela; ao rolar, ela sairia de cima do gráfico.
window.addEventListener('scroll', esconderDica, { passive: true });

// Mostra a dica ao passar o mouse e também ao chegar pelo teclado (Tab).
function ligarDica(alvo, conteudo) {
  alvo.addEventListener('pointermove', evento => {
    preencherDica(...conteudo());
    posicionarDica(evento.clientX, evento.clientY);
  });
  alvo.addEventListener('pointerleave', esconderDica);
  alvo.addEventListener('focus', () => {
    preencherDica(...conteudo());
    const caixa = alvo.getBoundingClientRect();
    posicionarDica(caixa.left + caixa.width / 2, caixa.top);
  });
  alvo.addEventListener('blur', esconderDica);
}

/* ------------------------------- Escalas ------------------------- */

// Topo do eixo e passo "redondos" (0, 5, 10, 15…), nunca menos que 1 unidade.
function escalaRedonda(maximo, partes = 4) {
  if (maximo <= 0) return { topo: partes, passo: 1 };
  const bruto = maximo / partes;
  const grandeza = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / grandeza;
  const passo = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * grandeza);
  return { topo: Math.ceil(maximo / passo) * passo, passo };
}

function dataCurta(iso) {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function dataLonga(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/* ----------------------------- Cartão ---------------------------- */

function montarTabela({ colunas, linhas }) {
  const tabela = el('table', 'dash-tabela');
  const cabeca = el('tr');
  colunas.forEach((c, i) => cabeca.append(el('th', i ? 'dash-tabela__numero' : '', c)));
  tabela.append(el('thead'), el('tbody'));
  tabela.tHead.append(cabeca);
  for (const linha of linhas) {
    const tr = el('tr');
    linha.forEach((valor, i) => tr.append(el('td', i ? 'dash-tabela__numero' : '', valor)));
    tabela.tBodies[0].append(tr);
  }
  if (!linhas.length) {
    const tr = el('tr');
    const td = el('td', 'dash-tabela__vazia', 'Sem dados.');
    td.colSpan = colunas.length;
    tr.append(td);
    tabela.tBodies[0].append(tr);
  }
  return tabela;
}

function cartao({ titulo, subtitulo, largo, desenhar, tabela }) {
  const elemento = el('section', `dash-cartao${largo ? ' dash-cartao--largo' : ''}`);
  const topo = el('header', 'dash-cartao__topo');
  const textos = el('div');
  textos.append(el('h3', 'dash-cartao__titulo', titulo));
  if (subtitulo) textos.append(el('p', 'dash-cartao__subtitulo', subtitulo));
  const alternar = el('button', 'dash-cartao__alternar', 'Tabela');
  alternar.type = 'button';
  topo.append(textos, alternar);

  const corpo = el('div', 'dash-cartao__corpo');
  elemento.append(topo, corpo);

  let emTabela = false;
  const desenharAgora = () => {
    corpo.replaceChildren();
    if (emTabela) corpo.append(montarTabela(tabela));
    else desenhar(corpo);
  };
  alternar.addEventListener('click', () => {
    emTabela = !emTabela;
    alternar.textContent = emTabela ? 'Gráfico' : 'Tabela';
    desenharAgora();
  });

  return { elemento, desenhar: desenharAgora };
}

/* ------------------------- Barras horizontais -------------------- */

function barrasHorizontais(corpo, itens, formatar, mensagemVazia) {
  if (!itens.length || itens.every(i => !i.valor)) return vazio(corpo, mensagemVazia);
  const maximo = Math.max(...itens.map(i => i.valor), 0) || 1;

  const lista = el('div', 'dash-barras');
  for (const item of itens) {
    const linha = el('div', 'dash-barras__linha');
    linha.tabIndex = 0;
    const rotulo = el('span', 'dash-barras__rotulo', item.rotulo);
    rotulo.title = item.rotulo;

    const trilho = el('span', 'dash-barras__trilho');
    const barra = el('span', 'dash-barras__barra');
    const fracao = Math.max(item.valor, 0) / maximo;
    // A barra divide o espaço com o valor escrito na ponta dela.
    barra.style.width = `calc((100% - 88px) * ${fracao})`;
    if (item.valor > 0) barra.style.minWidth = '3px';
    trilho.append(barra, el('span', 'dash-barras__valor', formatar(item.valor)));

    linha.append(rotulo, trilho);
    ligarDica(linha, () => [item.rotulo, [{ valor: formatar(item.valor), cor: 'var(--serie-1)' }]]);
    lista.append(linha);
  }
  corpo.append(lista);
}

/* ------------------------------ Linhas ----------------------------- */

function graficoLinhas(corpo, dias, series, mensagemVazia) {
  const maximo = Math.max(0, ...series.flatMap(s => s.valores));
  if (!maximo) return vazio(corpo, mensagemVazia);

  // Legenda acima: sempre presente com duas séries ou mais.
  const legenda = el('div', 'dash-legenda');
  for (const serie of series) {
    const item = el('span', 'dash-legenda__item');
    const chave = el('span', 'dash-legenda__linha');
    chave.style.background = serie.cor;
    item.append(chave, document.createTextNode(serie.nome));
    legenda.append(item);
  }
  corpo.append(legenda);

  const largura = Math.max(corpo.clientWidth, 280);
  const altura = 230;
  const m = { esquerda: 38, direita: 72, topo: 10, base: 26 };
  const w = largura - m.esquerda - m.direita;
  const h = altura - m.topo - m.base;
  const { topo, passo } = escalaRedonda(maximo);
  const n = dias.length;
  const x = i => m.esquerda + (n === 1 ? w / 2 : (i * w) / (n - 1));
  const y = v => m.topo + h - (v / topo) * h;

  const svg = svgEl('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, class: 'dash-svg', role: 'img' });
  svg.setAttribute('aria-label', series.map(s => `${s.nome}: ${fmtNumero.format(s.valores.reduce((a, b) => a + b, 0))} no período`).join('; '));

  // Grade e eixo Y.
  for (let v = 0; v <= topo; v += passo) {
    svg.append(svgEl('line', { x1: m.esquerda, x2: m.esquerda + w, y1: y(v), y2: y(v), class: v === 0 ? 'dash-eixo' : 'dash-guia' }));
    svg.append(svgTexto(m.esquerda - 8, y(v) + 4, fmtNumero.format(v), { class: 'dash-rotulo-eixo', 'text-anchor': 'end' }));
  }

  // Datas no eixo X, contando de hoje para trás.
  const salto = Math.ceil(n / 6);
  dias.forEach((dia, i) => {
    if ((n - 1 - i) % salto) return;
    svg.append(svgTexto(x(i), altura - 6, dataCurta(dia), { class: 'dash-rotulo-eixo', 'text-anchor': 'middle' }));
  });

  // Uma linha por série, com ponto no fim.
  const finais = [];
  for (const serie of series) {
    const pontos = serie.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.append(svgEl('polyline', { points: pontos, class: 'dash-linha', style: `stroke: ${serie.cor}` }));
    const ultimo = serie.valores[n - 1];
    svg.append(svgEl('circle', { cx: x(n - 1), cy: y(ultimo), r: 4, class: 'dash-ponto', style: `fill: ${serie.cor}` }));
    finais.push({ serie, y: y(ultimo) });
  }

  // Nome na ponta de cada linha, só se as pontas não estiverem coladas (a legenda cobre o resto).
  const separadas = finais.every((a, i) => finais.every((b, j) => i === j || Math.abs(a.y - b.y) >= 14));
  if (separadas) {
    for (const f of finais) {
      svg.append(svgTexto(x(n - 1) + 10, f.y + 4, f.serie.nome, { class: 'dash-rotulo-ponta' }));
    }
  }

  // Mira: uma linha vertical que segue o mouse e encaixa no dia mais próximo.
  const mira = svgEl('g', { class: 'dash-mira', visibility: 'hidden' });
  const miraLinha = svgEl('line', { y1: m.topo, y2: m.topo + h, class: 'dash-mira__linha' });
  mira.append(miraLinha);
  const miraPontos = series.map(serie => {
    const ponto = svgEl('circle', { r: 4, class: 'dash-ponto', style: `fill: ${serie.cor}` });
    mira.append(ponto);
    return ponto;
  });
  svg.append(mira);

  const area = svgEl('rect', { x: m.esquerda - 10, y: 0, width: w + 20, height: altura, fill: 'transparent' });
  const mostrarDia = (i, cx, cy) => {
    mira.setAttribute('visibility', 'visible');
    miraLinha.setAttribute('x1', x(i));
    miraLinha.setAttribute('x2', x(i));
    series.forEach((serie, s) => {
      miraPontos[s].setAttribute('cx', x(i));
      miraPontos[s].setAttribute('cy', y(serie.valores[i]));
    });
    preencherDica(
      dataLonga(dias[i]),
      series.map(serie => ({ valor: fmtNumero.format(serie.valores[i]), rotulo: serie.nome, cor: serie.cor }))
    );
    posicionarDica(cx, cy);
  };
  area.addEventListener('pointermove', evento => {
    const caixa = svg.getBoundingClientRect();
    const px = evento.clientX - caixa.left;
    const i = Math.min(n - 1, Math.max(0, Math.round(((px - m.esquerda) / w) * (n - 1))));
    mostrarDia(i, evento.clientX, evento.clientY);
  });
  area.addEventListener('pointerleave', () => {
    mira.setAttribute('visibility', 'hidden');
    esconderDica();
  });
  svg.append(area);
  corpo.append(svg);
}

/* ------------------------------ Colunas ---------------------------- */

function colunaArredondada(x, y, largura, altura, raio = 4) {
  const r = Math.min(raio, altura, largura / 2);
  return `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + altura} Z`;
}

function graficoColunas(corpo, itens, formatar, mensagemVazia) {
  const maximo = Math.max(0, ...itens.map(i => i.valor));
  if (!maximo) return vazio(corpo, mensagemVazia);

  const largura = Math.max(corpo.clientWidth, 260);
  const altura = 210;
  const m = { esquerda: 4, direita: 4, topo: 22, base: 28 };
  const w = largura - m.esquerda - m.direita;
  const h = altura - m.topo - m.base;
  const banda = w / itens.length;
  const espessura = Math.min(24, banda * 0.6);
  const y = v => m.topo + h - (v / maximo) * h;

  const svg = svgEl('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, class: 'dash-svg', role: 'img' });
  svg.setAttribute('aria-label', itens.map(i => `${i.rotulo}: ${formatar(i.valor)}`).join('; '));
  svg.append(svgEl('line', { x1: m.esquerda, x2: m.esquerda + w, y1: m.topo + h, y2: m.topo + h, class: 'dash-eixo' }));

  itens.forEach((item, i) => {
    const centro = m.esquerda + banda * i + banda / 2;
    const grupo = svgEl('g', { class: 'dash-coluna', tabindex: 0 });
    grupo.append(svgEl('rect', { x: centro - banda / 2, y: 0, width: banda, height: altura, fill: 'transparent' }));
    if (item.valor > 0) {
      const topoColuna = y(item.valor);
      grupo.append(svgEl('path', { d: colunaArredondada(centro - espessura / 2, topoColuna, espessura, m.topo + h - topoColuna), class: 'dash-coluna__marca' }));
    }
    grupo.append(svgTexto(centro, y(item.valor) - 7, formatar(item.valor), { class: 'dash-rotulo-valor', 'text-anchor': 'middle' }));
    grupo.append(svgTexto(centro, altura - 8, item.rotulo, { class: 'dash-rotulo-eixo', 'text-anchor': 'middle' }));
    ligarDica(grupo, () => [item.rotulo, [{ valor: formatar(item.valor), cor: 'var(--serie-1)' }]]);
    svg.append(grupo);
  });
  corpo.append(svg);
}

/* ------------------------- Barra de situação ----------------------- */

const SITUACOES = [
  { chave: 'disponivel', nome: 'Em estoque', cor: 'var(--verde)' },
  { chave: 'critico', nome: 'No mínimo ou abaixo', cor: 'var(--ambar)' },
  { chave: 'zerado', nome: 'Zerado', cor: 'var(--vermelho)' }
];

function barraDeSituacao(corpo, situacoes) {
  const total = SITUACOES.reduce((s, i) => s + situacoes[i.chave], 0);
  if (!total) return vazio(corpo, 'Nenhuma peça cadastrada.');

  const barra = el('div', 'dash-pilha');
  const legenda = el('div', 'dash-pilha__legenda');
  for (const situacao of SITUACOES) {
    const quantidade = situacoes[situacao.chave];
    const parte = (quantidade / total) * 100;
    if (quantidade) {
      const segmento = el('span', 'dash-pilha__segmento');
      segmento.style.flexGrow = quantidade;
      segmento.style.background = situacao.cor;
      segmento.tabIndex = 0;
      ligarDica(segmento, () => [situacao.nome, [{ valor: `${fmtNumero.format(quantidade)} peças`, rotulo: fmtPorcento(parte), cor: situacao.cor }]]);
      barra.append(segmento);
    }
    const item = el('div', 'dash-pilha__item');
    const chave = el('span', 'dash-pilha__chave');
    chave.style.background = situacao.cor;
    const textos = el('span');
    textos.append(el('strong', '', fmtNumero.format(quantidade)), document.createTextNode(` ${situacao.nome} · ${fmtPorcento(parte)}`));
    item.append(chave, textos);
    legenda.append(item);
  }
  corpo.append(barra, legenda);
}

/* ------------------------- Lista de reposição ---------------------- */

function listaDeReposicao(corpo, pecas) {
  if (!pecas.length) return vazio(corpo, 'Nenhuma peça no mínimo. Estoque em dia.');
  const lista = el('div', 'dash-repor');
  for (const peca of pecas) {
    const linha = el('div', 'dash-repor__linha');
    const nome = el('span', 'dash-repor__nome');
    nome.append(el('b', '', peca.codigo), document.createTextNode(` ${peca.nome}`));
    nome.title = `${peca.codigo} ${peca.nome}`;

    // Medidor: o trilho é o mínimo; o preenchimento é o saldo.
    const medidor = el('span', 'dash-repor__medidor');
    const cheio = el('span', `dash-repor__cheio${peca.estoque <= 0 ? ' dash-repor__cheio--zerado' : ''}`);
    cheio.style.width = `${Math.min(100, (peca.estoque / (peca.minimo || 1)) * 100)}%`;
    medidor.append(cheio);

    const numeros = el('span', 'dash-repor__numeros', peca.estoque <= 0 ? `zerado · mín. ${peca.minimo}` : `${peca.estoque} de ${peca.minimo}`);
    linha.append(nome, medidor, numeros);
    lista.append(linha);
  }
  corpo.append(lista);
}

/* --------------------------- Números do topo ----------------------- */

function sparkline(valores, cor) {
  const largura = 120;
  const altura = 30;
  const maximo = Math.max(...valores, 0) || 1;
  const x = i => 2 + (i * (largura - 8)) / Math.max(valores.length - 1, 1);
  const y = v => altura - 4 - (v / maximo) * (altura - 8);
  const svg = svgEl('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, class: 'dash-faisca', 'aria-hidden': 'true' });
  svg.append(svgEl('polyline', { points: valores.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'dash-faisca__linha' }));
  const ultimo = valores.length - 1;
  svg.append(svgEl('circle', { cx: x(ultimo), cy: y(valores[ultimo]), r: 3, style: `fill: ${cor}` }));
  return svg;
}

function blocoNumero({ rotulo, valor, detalhe, faisca, alerta }) {
  const bloco = el('div', `dash-numero${alerta ? ' dash-numero--alerta' : ''}`);
  bloco.append(el('span', 'dash-numero__rotulo', rotulo), el('span', 'dash-numero__valor', valor));
  if (detalhe) bloco.append(el('span', 'dash-numero__detalhe', detalhe));
  if (faisca) bloco.append(faisca);
  return bloco;
}

function montarNumeros(d) {
  const linha = el('section', 'dash-numeros');

  const destaque = el('div', 'dash-numero dash-numero--destaque');
  destaque.append(
    el('span', 'dash-numero__rotulo', 'Valor do estoque a preço de venda'),
    el('span', 'dash-numero__valor', fmtDinheiro.format(d.estoque.valorVenda)),
    el(
      'span',
      'dash-numero__detalhe',
      `custo ${fmtDinheiro.format(d.estoque.valorCusto)} · margem potencial ${fmtDinheiro.format(d.estoque.valorVenda - d.estoque.valorCusto)}`
    )
  );

  const paraRepor = d.estoque.situacoes.critico + d.estoque.situacoes.zerado;
  linha.append(
    destaque,
    blocoNumero({ rotulo: 'Itens cadastrados', valor: fmtNumero.format(d.estoque.itens), detalhe: `${fmtNumero.format(d.estoque.unidades)} unidades` }),
    blocoNumero({
      rotulo: `Saídas em ${d.dias} dias`,
      valor: fmtNumero.format(d.periodo.saidas),
      detalhe: 'unidades',
      faisca: sparkline(d.porDia.map(p => p.saidas), 'var(--serie-2)')
    }),
    blocoNumero({
      rotulo: `Entradas em ${d.dias} dias`,
      valor: fmtNumero.format(d.periodo.entradas),
      detalhe: 'unidades',
      faisca: sparkline(d.porDia.map(p => p.entradas), 'var(--serie-1)')
    }),
    blocoNumero({
      rotulo: 'Para repor',
      valor: fmtNumero.format(paraRepor),
      detalhe: `${fmtNumero.format(d.estoque.situacoes.zerado)} zeradas`,
      alerta: paraRepor > 0
    })
  );
  return linha;
}

/* ------------------------------ Montagem --------------------------- */

function montarPainel(d) {
  const periodo = `últimos ${d.dias} dias`;
  const linhasDeItens = (itens, formatar) => itens.map(i => [i.rotulo, formatar(i.valor)]);

  painel.cartoes = [
    cartao({
      titulo: 'Entradas e saídas por dia',
      subtitulo: `Unidades movimentadas, ${periodo}`,
      largo: true,
      desenhar: corpo =>
        graficoLinhas(
          corpo,
          d.porDia.map(p => p.data),
          [
            { nome: 'Entradas', cor: 'var(--serie-1)', valores: d.porDia.map(p => p.entradas) },
            { nome: 'Saídas', cor: 'var(--serie-2)', valores: d.porDia.map(p => p.saidas) }
          ],
          `Nenhuma entrada ou saída nos ${periodo}.`
        ),
      tabela: {
        colunas: ['Dia', 'Entradas', 'Saídas'],
        linhas: d.porDia.map(p => [dataLonga(p.data), fmtNumero.format(p.entradas), fmtNumero.format(p.saidas)])
      }
    }),
    cartao({
      titulo: 'Situação do estoque',
      subtitulo: 'Peças por saldo em relação ao mínimo, agora',
      largo: true,
      desenhar: corpo => barraDeSituacao(corpo, d.estoque.situacoes),
      tabela: {
        colunas: ['Situação', 'Peças'],
        linhas: SITUACOES.map(s => [s.nome, fmtNumero.format(d.estoque.situacoes[s.chave])])
      }
    }),
    cartao({
      titulo: 'Mais vendidas',
      subtitulo: `Unidades que saíram, ${periodo}`,
      desenhar: corpo => barrasHorizontais(corpo, d.maisVendidas, fmtUnidades, `Nenhuma saída nos ${periodo}.`),
      tabela: { colunas: ['Peça', 'Unidades'], linhas: linhasDeItens(d.maisVendidas, fmtNumero.format) }
    }),
    cartao({
      titulo: 'Repor primeiro',
      subtitulo: 'Saldo comparado ao estoque mínimo',
      desenhar: corpo => listaDeReposicao(corpo, d.reposicao),
      tabela: {
        colunas: ['Peça', 'Saldo', 'Mínimo'],
        linhas: d.reposicao.map(p => [`${p.codigo} ${p.nome}`, fmtNumero.format(p.estoque), fmtNumero.format(p.minimo)])
      }
    }),
    cartao({
      titulo: 'Valor em estoque por categoria',
      subtitulo: 'Saldo × preço de venda',
      desenhar: corpo => barrasHorizontais(corpo, d.valorPorCategoria, v => fmtDinheiro.format(v), 'Nenhuma peça com saldo.'),
      tabela: { colunas: ['Categoria', 'Valor'], linhas: linhasDeItens(d.valorPorCategoria, v => fmtDinheiro.format(v)) }
    }),
    cartao({
      titulo: 'Margem por categoria',
      subtitulo: 'Quanto o preço de venda está acima do custo',
      desenhar: corpo => barrasHorizontais(corpo, d.margemPorCategoria, fmtPorcento, 'Cadastre os preços de custo para ver a margem.'),
      tabela: { colunas: ['Categoria', 'Margem'], linhas: linhasDeItens(d.margemPorCategoria, fmtPorcento) }
    }),
    cartao({
      titulo: 'Peças por montadora',
      subtitulo: 'Quantas peças do catálogo servem em cada marca de carro',
      desenhar: corpo => barrasHorizontais(corpo, d.pecasPorMontadora, v => fmtNumero.format(v), 'Nenhuma aplicação cadastrada.'),
      tabela: { colunas: ['Montadora', 'Peças'], linhas: linhasDeItens(d.pecasPorMontadora, fmtNumero.format) }
    }),
    cartao({
      titulo: 'Faixas de preço',
      subtitulo: 'Peças por preço de venda, em R$',
      desenhar: corpo => graficoColunas(corpo, d.faixasDePreco, v => fmtNumero.format(v), 'Nenhuma peça cadastrada.'),
      tabela: { colunas: ['Faixa', 'Peças'], linhas: linhasDeItens(d.faixasDePreco, fmtNumero.format) }
    })
  ];

  const grade = el('div', 'dash-grade');
  painel.cartoes.forEach(c => grade.append(c.elemento));

  const conteudo = $('#dashConteudo');
  conteudo.replaceChildren(montarNumeros(d), grade);
  // Desenha depois de estar na tela: os gráficos medem a largura do cartão.
  painel.cartoes.forEach(c => c.desenhar());
}

async function carregarPainel() {
  const conteudo = $('#dashConteudo');
  // Ao trocar o período, o painel anterior fica esmaecido em vez de piscar.
  conteudo.classList.add('dash--carregando');
  try {
    painel.dados = await api(`/api/painel?dias=${painel.dias}`);
    montarPainel(painel.dados);
  } catch (erro) {
    avisar(erro.message, 'erro');
  } finally {
    conteudo.classList.remove('dash--carregando');
  }
}

$$('.dash-periodo').forEach(botao =>
  botao.addEventListener('click', () => {
    $$('.dash-periodo').forEach(b => {
      b.classList.toggle('dash-periodo--ativo', b === botao);
      b.setAttribute('aria-pressed', String(b === botao));
    });
    painel.dias = Number(botao.dataset.dias);
    carregarPainel();
  })
);

// Os gráficos se ajustam quando a janela muda de tamanho.
let temporizadorPainel;
window.addEventListener('resize', () => {
  clearTimeout(temporizadorPainel);
  temporizadorPainel = setTimeout(() => {
    if ($('#painel-graficos').classList.contains('painel--ativo')) painel.cartoes.forEach(c => c.desenhar());
  }, 150);
});
