/* ==================================================================
   Consulta de Autopeças — usuários do sistema (só administradores)
   O banco confere de novo, em cada operação, se quem pede é
   administrador. Esconder o link é só para não confundir quem é balcão.
   ================================================================== */

const NOME_DO_PAPEL = { admin: 'Administrador', balcao: 'Balcão' };

function quandoFoi(iso) {
  if (!iso) return 'nunca entrou';
  const data = new Date(iso);
  const hoje = new Date();
  const dias = Math.floor((new Date(hoje.toDateString()) - new Date(data.toDateString())) / 86400000);
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias === 0) return `hoje, ${hora}`;
  if (dias === 1) return `ontem, ${hora}`;
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function carregarUsuarios() {
  const alvo = $('#listaUsuarios');
  try {
    const usuarios = await api('/api/usuarios');
    estado.usuarios = usuarios;
    alvo.innerHTML = `
      <div class="usuario usuario--cabecalho" aria-hidden="true">
        <span>Nome</span><span>E-mail</span><span>Nível</span><span>Último acesso</span><span></span>
      </div>
      ${usuarios
        .map(
          u => `
        <div class="usuario">
          <span class="usuario__nome">${escapar(u.nome)}${u.voce ? ' <em class="usuario__voce">você</em>' : ''}</span>
          <span class="usuario__email">${escapar(u.email)}</span>
          <span><span class="usuario__papel usuario__papel--${u.papel}">${NOME_DO_PAPEL[u.papel] || escapar(u.papel)}</span></span>
          <span class="usuario__acesso">${quandoFoi(u.ultimoAcesso)}</span>
          <span class="usuario__acoes">
            <button class="botao botao--texto botao--pequeno" type="button" data-editar-usuario="${u.id}">Editar</button>
          </span>
        </div>`
        )
        .join('')}`;
  } catch (erro) {
    alvo.innerHTML = '';
    avisar(erro.message, 'erro');
  }
}

function abrirFormularioUsuario(usuario) {
  const editando = Boolean(usuario);
  $('#tituloUsuario').textContent = editando ? 'Editar usuário' : 'Novo usuário';
  $('#usuarioId').value = usuario?.id || '';
  $('#uNome').value = usuario?.nome || '';
  $('#uEmail').value = usuario?.email || '';
  // O e-mail é o login: muda-se removendo e criando de novo.
  $('#uEmail').disabled = editando;
  $(`input[name="papelUsuario"][value="${usuario?.papel || 'balcao'}"]`).checked = true;
  $('#uSenha').value = '';
  $('#uSenha').required = !editando;
  $('#rotuloSenha').textContent = editando ? 'Nova senha' : 'Senha';
  $('#dicaSenha').textContent = editando
    ? 'Deixe em branco para manter a senha atual.'
    : 'Pelo menos 8 caracteres. Passe a senha para a pessoa pessoalmente.';
  // Ninguém remove a si mesmo nem tira o próprio acesso de administrador.
  $('#btRemoverUsuario').hidden = !editando || usuario.voce;
  $$('input[name="papelUsuario"]').forEach(r => (r.disabled = Boolean(usuario?.voce)));
  abrirModal('#modalUsuario');
}

$('#btUsuarios').addEventListener('click', () => mostrarPainel('usuarios'));
$('#btNovoUsuario').addEventListener('click', () => abrirFormularioUsuario(null));

$('#listaUsuarios').addEventListener('click', evento => {
  const botao = evento.target.closest('[data-editar-usuario]');
  if (!botao) return;
  const usuario = (estado.usuarios || []).find(u => u.id === botao.dataset.editarUsuario);
  if (usuario) abrirFormularioUsuario(usuario);
});

$('#formUsuario').addEventListener('submit', async evento => {
  evento.preventDefault();
  const id = $('#usuarioId').value;
  const corpo = {
    nome: $('#uNome').value.trim(),
    email: $('#uEmail').value.trim(),
    papel: $('input[name="papelUsuario"]:checked').value,
    senha: $('#uSenha').value
  };
  if (corpo.senha && corpo.senha.length < 8) {
    avisar('A senha precisa ter pelo menos 8 caracteres.', 'erro');
    $('#uSenha').focus();
    return;
  }
  try {
    await api(id ? `/api/usuarios/${id}` : '/api/usuarios', { method: id ? 'PUT' : 'POST', corpo });
    fecharModais();
    avisar(id ? 'Usuário atualizado.' : `Usuário ${corpo.email} criado. Ele já pode entrar.`, 'sucesso');
    if (id && estado.usuario && id === estado.usuario.id) $('#usuarioNome').textContent = corpo.nome || estado.usuario.email;
    carregarUsuarios();
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});

$('#btRemoverUsuario').addEventListener('click', async () => {
  const id = $('#usuarioId').value;
  const nome = $('#uNome').value || $('#uEmail').value;
  if (!confirm(`Remover "${nome}"? A pessoa perde o acesso na hora. O histórico de movimentações dela continua guardado.`)) return;
  try {
    await api(`/api/usuarios/${id}`, { method: 'DELETE' });
    fecharModais();
    avisar('Usuário removido.', 'sucesso');
    carregarUsuarios();
  } catch (erro) {
    avisar(erro.message, 'erro');
  }
});
