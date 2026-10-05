/*
 * Cria um usuário e libera o acesso dele ao sistema.
 * Se o e-mail já existir, troca a senha e garante o acesso.
 *
 * Uso, no terminal do VS Code (PowerShell):
 *
 *   $env:SUPABASE_SERVICE_KEY = "a chave SERVICE_SUPABASESERVICE_KEY do Coolify"
 *   npm run criar-usuario -- vendedor@loja.com.br SenhaForte123 "Nome da pessoa"
 *
 * A chave service_role dá acesso total ao banco. Ela fica só na variável
 * do terminal: nunca escreva essa chave em arquivo do projeto.
 *
 * Para tirar o acesso de alguém, apague a linha da pessoa na tabela
 * "usuarios" pelo painel do Supabase (Table Editor).
 */

const { SUPABASE_URL } = require('../config');

const CHAVE = process.env.SUPABASE_SERVICE_KEY;
const [email, senha, ...partesDoNome] = process.argv.slice(2);
const nome = partesDoNome.join(' ').trim();

function parar(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

if (!CHAVE) parar('Defina antes a variável SUPABASE_SERVICE_KEY (veja o topo deste arquivo).');
if (!email || !senha) parar('Uso: npm run criar-usuario -- email senha "Nome da pessoa"');
if (senha.length < 8) parar('Use uma senha com pelo menos 8 caracteres.');

async function chamar(caminho, metodo = 'GET', corpo, cabecalhos = {}) {
  const resposta = await fetch(SUPABASE_URL + caminho, {
    method: metodo,
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', ...cabecalhos },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const texto = await resposta.text();
  const dado = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    const erro = new Error((dado && (dado.msg || dado.message || dado.error_description)) || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }
  return dado;
}

async function acharPorEmail(alvo) {
  for (let pagina = 1; ; pagina++) {
    const { users } = await chamar(`/auth/v1/admin/users?page=${pagina}&per_page=200`);
    const achado = users.find(u => (u.email || '').toLowerCase() === alvo);
    if (achado || users.length < 200) return achado || null;
  }
}

(async () => {
  const emailNormalizado = email.trim().toLowerCase();
  let usuario;
  let situacao;

  try {
    usuario = await chamar('/auth/v1/admin/users', 'POST', {
      email: emailNormalizado,
      password: senha,
      email_confirm: true
    });
    situacao = 'criado';
  } catch (erro) {
    if (erro.status !== 422) throw erro;
    usuario = await acharPorEmail(emailNormalizado);
    if (!usuario) throw erro;
    await chamar(`/auth/v1/admin/users/${usuario.id}`, 'PUT', { password: senha, email_confirm: true });
    situacao = 'já existia: senha trocada';
  }

  await chamar(
    '/rest/v1/usuarios?on_conflict=id',
    'POST',
    { id: usuario.id, email: emailNormalizado, nome: nome || emailNormalizado },
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );

  console.log(`\n  Usuário ${emailNormalizado} ${situacao} e com acesso liberado.\n`);
})().catch(erro => parar(`Não deu certo: ${erro.message}`));
