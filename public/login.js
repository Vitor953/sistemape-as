/* ==================================================================
   Consulta de Autopeças — página de entrada
   ================================================================== */

const formulario = document.getElementById('formLogin');
const campoEmail = document.getElementById('lEmail');
const campoSenha = document.getElementById('lSenha');
const caixaErro = document.getElementById('loginErro');
const botao = document.getElementById('btEntrar');

// Lembra o último e-mail usado neste computador, para só digitar a senha.
try {
  campoEmail.value = localStorage.getItem('ultimoEmail') || '';
} catch (e) {}
(campoEmail.value ? campoSenha : campoEmail).focus();

function mostrarErro(mensagem) {
  caixaErro.textContent = mensagem;
  caixaErro.hidden = false;
}

formulario.addEventListener('submit', async evento => {
  evento.preventDefault();
  const email = campoEmail.value.trim();
  const senha = campoSenha.value;
  if (!email || !senha) {
    mostrarErro('Informe o e-mail e a senha.');
    (email ? campoSenha : campoEmail).focus();
    return;
  }

  caixaErro.hidden = true;
  botao.disabled = true;
  botao.textContent = 'Entrando…';

  try {
    const resposta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const dado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dado.erro || 'Não foi possível entrar.');

    try {
      localStorage.setItem('ultimoEmail', email);
    } catch (e) {}
    window.location.replace('/');
  } catch (erro) {
    mostrarErro(erro.message === 'Failed to fetch' ? 'O programa não respondeu. Feche e abra de novo.' : erro.message);
    campoSenha.select();
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});
