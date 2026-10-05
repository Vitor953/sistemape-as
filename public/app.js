/* ==================================================================
   Consulta de Autopeças — interface
   ================================================================== */

const $ = seletor => document.querySelector(seletor);
const $$ = seletor => Array.from(document.querySelectorAll(seletor));

const estado = {
  pecas: [],
  cache: new Map(),
  resumo: null,
  pecaAberta: null,
  filtros: { q: '', categoria: '', marca: '', montadora: '', situacao: '', ordem: 'relevancia' }
};

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numeroBR = new Intl.NumberFormat('pt-BR');

const escapar = texto =>
  String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------- Avisos ----------------------------- */

let temporizadorAviso;
function avisar(mensagem, tipo = 'neutro') {
  const caixa = $('#aviso');
  caixa.textContent = mensagem;
  caixa.dataset.tipo = tipo;
  caixa.dataset.visivel = 'sim';
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (caixa.dataset.visivel = 'nao'), 3800);
}

/* ----------------------------- API ------------------------------- */

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
  });
  const dado = await resposta.json().catch(() => ({}));
  // Sessão acabou (programa reaberto, senha trocada…): volta para a entrada.
  if (resposta.status === 401) {
    window.location.replace('/login.html');
    throw new Error(dado.erro || 'Entre com seu usuário para continuar.');
  }
  if (!resposta.ok) throw new Error(dado.erro || 'Não foi possível concluir a operação.');
  return dado;
}

/* --------------------------- Carregamento ------------------------ */

function lembrar(pecas) {
  pecas.forEach(p => estado.cache.set(p.id, p));
}

async function carregarPecas() {
  const params = new URLSearchParams();
  Object.entries(estado.filtros).forEach(([chave, valor]) => valor && params.set(chave, valor));

  try {
    const dado = await api('/api/pecas?' + params);
    estado.pecas = dado.pecas;
    lembrar(dado.pecas);
    const linha = $('#rodapeContagem');
    const versao = linha.dataset.versao ? ` · versão ${linha.dataset.versao}` : '';
    linha.textContent = `${dado.total} peças no catálogo${versao}`;
    $('#resultadoContagem').textContent =
      dado.encontradas === dado.total
        ? `${dado.total} peças`
        : `${dado.encontradas} de ${dado.total} peças`;
    desenharLista();
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
}

async function carregarResumo() {
  try {
    estado.resumo = await api('/api/resumo');
    preencherSelecoes();
    desenharIndicadores();
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
}

function preencherSelecoes() {
  const r = estado.resumo;
  if (!r) return;

  const preencher = (seletor, itens, rotuloTodos, valorAtual) => {
    const alvo = $(seletor);
    alvo.innerHTML =
      `<option value="">${rotuloTodos}</option>` +
      itens.map(i => `<option value="${escapar(i)}">${escapar(i)}</option>`).join('');
    alvo.value = valorAtual || '';
  };

  preencher('#filtroCategoria', r.categorias, 'Todas as categorias', estado.filtros.categoria);
  preencher('#filtroMarca', r.marcas, 'Todas as marcas', estado.filtros.marca);
  preencher('#filtroMontadora', r.montadoras, 'Todas as montadoras', estado.filtros.montadora);

  $('#listaMarcas').innerHTML = r.marcas.map(m => `<option value="${escapar(m)}">`).join('');
  $('#listaCategorias').innerHTML = r.categorias.map(c => `<option value="${escapar(c)}">`).join('');
}

/* --------------------------- Lista de peças ---------------------- */

function resumoAplicacoes(peca) {
  const lista = peca.aplicacoes || [];
  if (!lista.length) return 'Sem aplicação cadastrada';
  return lista
    .map(a => {
      const anos = a.anoInicio || a.anoFim ? ` ${a.anoInicio || ''}–${a.anoFim || ''}` : '';
      return `${a.montadora} ${a.modelo}${anos}${a.motor ? ' ' + a.motor : ''}`.trim();
    })
    .join('  ·  ');
}

function fichaHTML(peca) {
  return `
    <button class="ficha ficha--${peca.situacao}" data-id="${peca.id}">
      <span class="ficha__tarja"></span>
      <span class="ficha__identificacao">
        <span class="ficha__codigo">${escapar(peca.codigo)}</span>
        <span class="ficha__marca">${escapar(peca.marca || 'sem marca')}</span>
      </span>
      <span class="ficha__miolo">
        <span class="ficha__nome">${escapar(peca.nome)}</span>
        <span class="ficha__aplicacoes">${escapar(resumoAplicacoes(peca))}</span>
      </span>
      <span class="ficha__numeros">
        <span class="ficha__preco">${dinheiro.format(peca.precoVenda || 0)}</span>
        <span class="ficha__saldo">${peca.estoque} un · ${escapar(peca.localizacao || 'sem endereço')}</span>
      </span>
    </button>`;
}

function desenharLista() {
  const alvo = $('#listaPecas');
  if (!estado.pecas.length) {
    const temFiltro = ['q', 'categoria', 'marca', 'montadora', 'situacao'].some(c => estado.filtros[c]);
    alvo.innerHTML = `
      <div class="vazio">
        <strong>Nenhuma peça encontrada</strong>
        ${temFiltro
          ? 'Tente um termo mais curto, só o código, ou limpe os filtros.'
          : 'Cadastre a primeira peça para começar o catálogo.'}
      </div>`;
    return;
  }
  alvo.innerHTML = estado.pecas.map(fichaHTML).join('');
}

/* --------------------------- Indicadores ------------------------- */

function desenharIndicadores() {
  const r = estado.resumo;
  if (!r) return;

  const cartoes = [
    { valor: numeroBR.format(r.totalItens), rotulo: 'itens cadastrados', classe: '' },
    { valor: numeroBR.format(r.totalUnidades), rotulo: 'unidades em estoque', classe: '' },
    { valor: dinheiro.format(r.valorCusto), rotulo: 'estoque a preço de custo', classe: '' },
    { valor: dinheiro.format(r.valorVenda), rotulo: 'estoque a preço de venda', classe: '' },
    { valor: numeroBR.format(r.criticos), rotulo: 'no mínimo ou abaixo', classe: r.criticos ? 'indicador--alerta' : '' },
    { valor: numeroBR.format(r.zerados), rotulo: 'com saldo zerado', classe: r.zerados ? 'indicador--falta' : '' }
  ];

  $('#indicadores').innerHTML = cartoes
    .map(
      c => `<div class="indicador ${c.classe}">
              <div class="indicador__valor">${c.valor}</div>
              <div class="indicador__rotulo">${c.rotulo}</div>
            </div>`
    )
    .join('');
}

async function carregarReposicao() {
  try {
    const dado = await api('/api/pecas?ordem=estoque');
    lembrar(dado.pecas);
    const criticas = dado.pecas.filter(p => p.situacao !== 'disponivel');
    $('#listaReposicao').innerHTML = criticas.length
      ? criticas.map(fichaHTML).join('')
      : `<div class="vazio"><strong>Estoque em dia</strong>Nenhum item está no limite mínimo.</div>`;
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
}

/* -------------------------- Movimentações ------------------------ */

async function carregarMovimentos() {
  try {
    const lista = await api('/api/movimentacoes?limite=200');
    $('#listaMovimentos').innerHTML = lista.length
      ? lista
          .map(
            m => `<div class="movimento">
                    <span class="movimento__data">${new Date(m.data).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}</span>
                    <span class="movimento__tipo movimento__tipo--${m.tipo}">
                      ${m.tipo === 'entrada' ? '+' : '−'}${m.quantidade}
                    </span>
                    <span class="movimento__detalhe">
                      <b>${escapar(m.codigo)}</b> ${escapar(m.nome)}
                      ${m.motivo ? `<span>— ${escapar(m.motivo)}</span>` : ''}
                      ${m.usuario ? `<span>· ${escapar(m.usuario)}</span>` : ''}
                    </span>
                    <span class="movimento__saldo">saldo ${m.saldoApos}</span>
                  </div>`
          )
          .join('')
      : `<div class="vazio"><strong>Nenhuma movimentação ainda</strong>Entradas e saídas registradas aparecem aqui.</div>`;
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
}

/* ---------------------------- Gaveta ----------------------------- */

const ROTULO_SITUACAO = { disponivel: 'Em estoque', critico: 'No mínimo', zerado: 'Zerado' };

function abrirGaveta(peca) {
  estado.pecaAberta = peca;
  const margem = peca.precoCusto ? ((peca.precoVenda - peca.precoCusto) / peca.precoCusto) * 100 : null;

  $('#gavetaCorpo').innerHTML = `
    <span class="detalhe__codigo">${escapar(peca.codigo)}</span>
    <h2 class="detalhe__nome" id="gavetaNome">${escapar(peca.nome)}</h2>
    <p class="detalhe__marca">
      ${escapar(peca.marca || 'Sem marca')}${peca.categoria ? ' · ' + escapar(peca.categoria) : ''}
      ${peca.descricao ? '<br>' + escapar(peca.descricao) : ''}
    </p>

    <div class="detalhe__precos">
      <div><span>Venda</span><strong>${dinheiro.format(peca.precoVenda || 0)}</strong></div>
      <div><span>Custo</span><strong>${dinheiro.format(peca.precoCusto || 0)}</strong></div>
      ${margem !== null ? `<div><span>Margem</span><strong>${margem.toFixed(0)}%</strong></div>` : ''}
    </div>

    <div class="detalhe__bloco">
      <h3>Estoque</h3>
      <div class="saldo-destaque">
        <b>${peca.estoque}</b>
        <span>unidades · mínimo ${peca.estoqueMinimo} · ${escapar(peca.localizacao || 'sem endereço')}</span>
        <span class="selo-situacao selo-situacao--${peca.situacao}">${ROTULO_SITUACAO[peca.situacao]}</span>
      </div>
    </div>

    <div class="detalhe__bloco">
      <h3>Aplicações</h3>
      ${
        (peca.aplicacoes || []).length
          ? `<ul class="aplicacao-lista">${peca.aplicacoes
              .map(
                a => `<li><b>${escapar(a.montadora)} ${escapar(a.modelo)}</b>
                        <em>${a.anoInicio || a.anoFim ? `${a.anoInicio || ''}–${a.anoFim || ''}` : ''}${
                  a.motor ? ' · ' + escapar(a.motor) : ''
                }</em></li>`
              )
              .join('')}</ul>`
          : '<p class="busca__dica">Nenhuma aplicação cadastrada.</p>'
      }
    </div>

    ${
      (peca.equivalentes || []).length
        ? `<div class="detalhe__bloco">
             <h3>Códigos equivalentes</h3>
             <div class="etiquetas">${peca.equivalentes.map(c => `<span class="etiqueta">${escapar(c)}</span>`).join('')}</div>
           </div>`
        : ''
    }

    ${peca.fornecedor ? `<div class="detalhe__bloco"><h3>Fornecedor</h3><p>${escapar(peca.fornecedor)}</p></div>` : ''}

    <div class="detalhe__acoes">
      <button class="botao botao--principal" data-acao="entrada">Registrar entrada</button>
      <button class="botao botao--fantasma" data-acao="saida">Registrar saída</button>
      <button class="botao botao--fantasma" data-acao="editar">Editar</button>
    </div>`;

  $('#gaveta').dataset.aberta = 'sim';
  $('#gaveta').setAttribute('aria-hidden', 'false');
  $('#btFecharGaveta').focus();
}

function fecharGaveta() {
  $('#gaveta').dataset.aberta = 'nao';
  $('#gaveta').setAttribute('aria-hidden', 'true');
  estado.pecaAberta = null;
}

/* ---------------------------- Modais ----------------------------- */

function abrirModal(id) {
  const modal = $(id);
  modal.dataset.aberto = 'sim';
  modal.setAttribute('aria-hidden', 'false');
  const primeiro = modal.querySelector('input:not([type=hidden]), textarea');
  if (primeiro) setTimeout(() => primeiro.focus(), 40);
}

function fecharModais() {
  $$('.modal').forEach(m => {
    m.dataset.aberto = 'nao';
    m.setAttribute('aria-hidden', 'true');
  });
}

/* ------------------------ Formulário da peça --------------------- */

function textoAplicacoes(peca) {
  return (peca.aplicacoes || [])
    .map(a => {
      const anos = a.anoInicio || a.anoFim ? `${a.anoInicio || ''}-${a.anoFim || ''}` : '';
      return [a.montadora, a.modelo, anos, a.motor].filter(Boolean).join(' > ');
    })
    .join('\n');
}

function lerAplicacoes(texto) {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(linha => {
      const partes = linha.split('>').map(p => p.trim());
      const anos = (partes[2] || '').split('-');
      return {
        montadora: partes[0] || '',
        modelo: partes[1] || '',
        anoInicio: anos[0] ? Number(anos[0]) : null,
        anoFim: anos[1] ? Number(anos[1]) : null,
        motor: partes[3] || ''
      };
    });
}

function abrirFormulario(peca) {
  $('#tituloModal').textContent = peca ? 'Editar peça' : 'Cadastrar peça';
  $('#pecaId').value = peca?.id || '';
  $('#pecaVersao').value = peca?.atualizadoEm || '';
  $('#fCodigo').value = peca?.codigo || '';
  $('#fNome').value = peca?.nome || '';
  $('#fMarca').value = peca?.marca || '';
  $('#fCategoria').value = peca?.categoria || '';
  $('#fPrecoCusto').value = peca ? String(peca.precoCusto).replace('.', ',') : '';
  $('#fPrecoVenda').value = peca ? String(peca.precoVenda).replace('.', ',') : '';
  $('#fEstoque').value = peca?.estoque ?? '';
  $('#fEstoqueMinimo').value = peca?.estoqueMinimo ?? '';
  $('#fLocalizacao').value = peca?.localizacao || '';
  $('#fFornecedor').value = peca?.fornecedor || '';
  $('#fDescricao').value = peca?.descricao || '';
  $('#fEquivalentes').value = (peca?.equivalentes || []).join(', ');
  $('#fAplicacoes').value = peca ? textoAplicacoes(peca) : '';
  $('#btExcluir').hidden = !peca;
  abrirModal('#modalPeca');
}

$('#formPeca').addEventListener('submit', async evento => {
  evento.preventDefault();
  const id = $('#pecaId').value;
  const corpo = {
    codigo: $('#fCodigo').value,
    nome: $('#fNome').value,
    marca: $('#fMarca').value,
    categoria: $('#fCategoria').value,
    descricao: $('#fDescricao').value,
    fornecedor: $('#fFornecedor').value,
    localizacao: $('#fLocalizacao').value,
    precoCusto: $('#fPrecoCusto').value,
    precoVenda: $('#fPrecoVenda').value,
    estoque: $('#fEstoque').value,
    estoqueMinimo: $('#fEstoqueMinimo').value,
    equivalentes: $('#fEquivalentes').value.split(',').map(s => s.trim()).filter(Boolean),
    aplicacoes: lerAplicacoes($('#fAplicacoes').value),
    versao: $('#pecaVersao').value
  };

  try {
    await api(id ? `/api/pecas/${id}` : '/api/pecas', { method: id ? 'PUT' : 'POST', corpo });
    fecharModais();
    fecharGaveta();
    avisar(id ? 'Peça atualizada.' : 'Peça cadastrada.', 'sucesso');
    await Promise.all([carregarPecas(), carregarResumo()]);
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

$('#btExcluir').addEventListener('click', async () => {
  const id = $('#pecaId').value;
  const nome = $('#fNome').value;
  if (!confirm(`Excluir "${nome}" do catálogo? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/pecas/${id}`, { method: 'DELETE' });
    fecharModais();
    fecharGaveta();
    avisar('Peça excluída.', 'sucesso');
    await Promise.all([carregarPecas(), carregarResumo()]);
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

/* ------------------------ Movimentar estoque --------------------- */

function abrirMovimento(peca, tipo) {
  $('#movimentoPecaId').value = peca.id;
  $('#movimentoResumo').innerHTML = `<b>${escapar(peca.codigo)}</b> ${escapar(peca.nome)} — saldo atual ${peca.estoque}`;
  $(`input[name="tipoMovimento"][value="${tipo}"]`).checked = true;
  $('#fQuantidade').value = '1';
  $('#fMotivo').value = '';
  abrirModal('#modalMovimento');
}

$('#formMovimento').addEventListener('submit', async evento => {
  evento.preventDefault();
  const id = $('#movimentoPecaId').value;
  const corpo = {
    tipo: $('input[name="tipoMovimento"]:checked').value,
    quantidade: $('#fQuantidade').value,
    motivo: $('#fMotivo').value
  };
  try {
    const atualizada = await api(`/api/pecas/${id}/movimento`, { method: 'POST', corpo });
    fecharModais();
    avisar(`Saldo atualizado: ${atualizada.estoque} unidades.`, 'sucesso');
    await Promise.all([carregarPecas(), carregarResumo()]);
    if (estado.pecaAberta && estado.pecaAberta.id === id) abrirGaveta(atualizada);
    if ($('#painel-movimentos').classList.contains('painel--ativo')) carregarMovimentos();
    if ($('#painel-estoque').classList.contains('painel--ativo')) carregarReposicao();
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

/* --------------------------- CSV --------------------------------- */

$('#btExportar').addEventListener('click', () => {
  window.location.href = '/api/exportar';
});

$('#btImportar').addEventListener('click', () => $('#arquivoCSV').click());

$('#arquivoCSV').addEventListener('change', async evento => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const csv = await arquivo.text();
  evento.target.value = '';
  try {
    const r = await api('/api/importar', { method: 'POST', corpo: { csv } });
    avisar(`${r.criadas} peças criadas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas.`, 'sucesso');
    await Promise.all([carregarPecas(), carregarResumo()]);
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

/* ------------------------- Eventos gerais ------------------------ */

let temporizadorBusca;
$('#campoBusca').addEventListener('input', evento => {
  const valor = evento.target.value;
  $('#btLimparBusca').hidden = !valor;
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => {
    estado.filtros.q = valor;
    carregarPecas();
  }, 160);
});

$('#btLimparBusca').addEventListener('click', () => {
  $('#campoBusca').value = '';
  $('#btLimparBusca').hidden = true;
  estado.filtros.q = '';
  carregarPecas();
  $('#campoBusca').focus();
});

const ligarFiltro = (seletor, chave) =>
  $(seletor).addEventListener('change', evento => {
    estado.filtros[chave] = evento.target.value;
    atualizarBotaoLimpar();
    carregarPecas();
  });

ligarFiltro('#filtroCategoria', 'categoria');
ligarFiltro('#filtroMarca', 'marca');
ligarFiltro('#filtroMontadora', 'montadora');
ligarFiltro('#filtroSituacao', 'situacao');
ligarFiltro('#filtroOrdem', 'ordem');

function atualizarBotaoLimpar() {
  const ativo = ['categoria', 'marca', 'montadora', 'situacao'].some(c => estado.filtros[c]);
  $('#btLimparFiltros').hidden = !ativo;
}

$('#btLimparFiltros').addEventListener('click', () => {
  ['categoria', 'marca', 'montadora', 'situacao'].forEach(c => (estado.filtros[c] = ''));
  ['#filtroCategoria', '#filtroMarca', '#filtroMontadora', '#filtroSituacao'].forEach(s => ($(s).value = ''));
  atualizarBotaoLimpar();
  carregarPecas();
});

document.addEventListener('click', evento => {
  const ficha = evento.target.closest('.ficha');
  if (ficha) {
    const peca = estado.cache.get(ficha.dataset.id);
    if (peca) abrirGaveta(peca);
    return;
  }

  const acao = evento.target.dataset.acao;
  if (acao && estado.pecaAberta) {
    if (acao === 'editar') abrirFormulario(estado.pecaAberta);
    else abrirMovimento(estado.pecaAberta, acao);
    return;
  }

  if (evento.target.dataset.fecharModal !== undefined || evento.target.classList.contains('modal')) fecharModais();
  if (evento.target === $('#gaveta') || evento.target.id === 'btFecharGaveta') fecharGaveta();
});

$('#btNova').addEventListener('click', () => abrirFormulario(null));

$$('.aba').forEach(aba =>
  aba.addEventListener('click', () => {
    $$('.aba').forEach(a => a.classList.remove('aba--ativa'));
    $$('.painel').forEach(p => p.classList.remove('painel--ativo'));
    aba.classList.add('aba--ativa');
    $(`#painel-${aba.dataset.aba}`).classList.add('painel--ativo');
    if (aba.dataset.aba === 'estoque') carregarReposicao();
    if (aba.dataset.aba === 'movimentos') carregarMovimentos();
  })
);

document.addEventListener('keydown', evento => {
  if (evento.key === 'Escape') {
    fecharModais();
    fecharGaveta();
    return;
  }
  const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (evento.key === '/' && !digitando) {
    evento.preventDefault();
    $('#campoBusca').focus();
    $('#campoBusca').select();
  }
});

/* ---------------------------- Usuário ---------------------------- */

async function carregarUsuario() {
  try {
    const { usuario } = await api('/api/sessao');
    $('#usuarioNome').textContent = usuario.nome || usuario.email;
    $('#usuarioNome').title = usuario.email;
    $('#topoUsuario').hidden = false;
  } catch (erro) {
    // Sem sessão, a função api() já levou para a página de entrada.
  }
}

$('#btSair').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.replace('/login.html');
});

/* ---------------------------- Início ----------------------------- */

carregarUsuario();
carregarResumo().then(carregarPecas);
$('#campoBusca').focus();

/* ------------------- Extras do programa instalado ---------------- */
/* Só aparecem quando o sistema roda como aplicativo, não no navegador. */

if (window.appDesktop) {
  const botao = document.createElement('button');
  botao.className = 'botao botao--fantasma';
  botao.textContent = 'Verificar atualização';
  botao.title = 'Procurar uma versão nova no GitHub';
  botao.addEventListener('click', () => {
    botao.disabled = true;
    avisar('Procurando atualização…');
    window.appDesktop.verificarAtualizacao().finally(() => {
      setTimeout(() => (botao.disabled = false), 2500);
    });
  });
  $('.topo__acoes').prepend(botao);

  window.appDesktop.versao().then(v => {
    const linha = $('#rodapeContagem');
    linha.dataset.versao = v;
    linha.textContent = `${linha.textContent} · versão ${v}`;
  });

  /* Faixa no topo: aparece sozinha quando sai versão nova no GitHub. */
  const mostrarAtualizacao = ({ fase, versao, percentual }) => {
    const faixa = $('#faixaAtualizacao');
    faixa.dataset.fase = fase;
    faixa.hidden = fase === 'nenhuma';
    if (fase === 'baixando') {
      $('#faixaAtualizacaoTexto').textContent = `Baixando a versão ${versao}… ${percentual}%`;
      $('#faixaAtualizacaoProgresso').style.width = `${percentual}%`;
    }
    if (fase === 'pronta') {
      $('#faixaAtualizacaoTexto').textContent =
        `Nova versão ${versao} pronta. O programa fecha e abre de novo em alguns segundos; o catálogo não é afetado.`;
    }
  };

  window.appDesktop.aoMudarAtualizacao(mostrarAtualizacao);
  window.appDesktop.estadoAtualizacao().then(mostrarAtualizacao);

  $('#btInstalarAtualizacao').addEventListener('click', evento => {
    evento.target.disabled = true;
    evento.target.textContent = 'Atualizando…';
    window.appDesktop.instalarAtualizacao();
  });
}
