# Consulta de Autopeças

Programa de mesa para consultar peças, controlar saldo e registrar entradas e saídas.
Instala no computador, abre em janela própria e se atualiza sozinho pelo GitHub.

---

## Como isso funciona

Você trabalha no VS Code e envia o código para o GitHub. O GitHub monta o instalador
sozinho e publica. Os computadores que já têm o programa instalado percebem a versão
nova sozinhos, baixam em segundo plano e mostram uma faixa amarela no topo com o botão
**Atualizar agora**.

```
VS Code  →  GitHub  →  instalador montado na nuvem  →  programa avisa e atualiza
```

Você não precisa mandar arquivo para ninguém nem reinstalar nada no balcão.

---

## Parte 1 — Preparar o computador (uma vez só)

Instale estes três, todos com as opções padrão:

| O quê | Onde | Para quê |
|---|---|---|
| Node.js (versão LTS) | <https://nodejs.org> | Rodar e montar o programa |
| Git | <https://git-scm.com> | Enviar o código para o GitHub |
| VS Code | <https://code.visualstudio.com> | Editar o sistema |

Crie também uma conta em <https://github.com>, se ainda não tiver.

## Parte 2 — Colocar o projeto no GitHub

**1.** No GitHub, clique em **New repository**. Nome: `consulta-autopecas`.
Deixe **Public** e não marque nenhuma opção extra. Clique em **Create repository**.

**2.** Abra a pasta do projeto no VS Code (**Arquivo › Abrir pasta**).

**3.** Abra o arquivo `package.json` e troque `SEU-USUARIO-DO-GITHUB` pelo seu usuário
real. É o único lugar que precisa disso:

```json
"publish": {
  "provider": "github",
  "owner": "SEU-USUARIO-DO-GITHUB",
  "repo": "consulta-autopecas"
}
```

**4.** No terminal do VS Code (`Ctrl + '`), rode uma linha de cada vez:

```
git init
git add .
git commit -m "Primeira versao"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO-DO-GITHUB/consulta-autopecas.git
git push -u origin main
```

## Parte 3 — Gerar o instalador

Ainda no terminal:

```
git tag v1.0.0
git push origin v1.0.0
```

Isso avisa o GitHub de que existe uma versão pronta. Vá ao seu repositório, aba
**Actions**, e acompanhe — leva de 3 a 5 minutos. Quando a bolinha ficar verde, vá em
**Releases**, na coluna direita da página inicial do repositório.

Lá estará o arquivo **`Consulta de Autopecas Setup 1.0.0.exe`**. Esse é o instalador.
Baixe, execute, escolha a pasta e pronto: o programa aparece no menu Iniciar e na área
de trabalho, como qualquer outro. Sem prompt, sem navegador.

> Se a aba Actions acusar falta de permissão, vá em **Settings › Actions › General**,
> desça até **Workflow permissions**, marque **Read and write permissions** e salve.
> Depois, em Actions, clique no fluxo que falhou e em **Re-run jobs**.

## Parte 4 — O ciclo do dia a dia

Esta é a parte que você vai repetir sempre:

**1.** Edite o que quiser no VS Code.

**2.** Teste na hora, sem instalar nada:

```
npm install     (só na primeira vez)
npm start
```

O programa abre em janela, igual à versão instalada.

**3.** Quando estiver satisfeito, publique. Abra o `package.json`, suba o número da
versão (de `"version": "1.0.0"` para `"1.0.1"`) e rode:

```
git add .
git commit -m "Descreva o que mudou"
git push
git tag v1.0.1
git push origin v1.0.1
```

**4.** Alguns minutos depois, todo computador com o programa instalado percebe a
versão nova (ele procura ao abrir e a cada meia hora, ou na hora pelo botão
**Verificar atualização**). O download acontece em segundo plano e, quando termina,
aparece no topo da tela uma faixa amarela com o botão **Atualizar agora**. Quem
estiver no balcão clica, o programa fecha e abre de novo já atualizado. Se ninguém
clicar, a atualização é instalada da próxima vez que o programa for fechado.

> O número da tag precisa bater com o do `package.json`. Se o `package.json` diz
> `1.0.1`, a tag é `v1.0.1`. Esse é o erro mais comum, e a atualização não chega sem isso.

---

## Onde ficam os dados

O catálogo e o histórico ficam no **Supabase**, o banco de dados online. Todos os
computadores da loja enxergam o mesmo estoque, e cada entrada ou saída registra
quem fez. O programa precisa de internet para funcionar.

O endereço do banco e a chave pública ficam em `config.js`. A chave `anon` pode
ficar no código: sozinha ela não abre nada, porque o banco só libera os dados para
quem entrou com um usuário cadastrado na tabela `usuarios`. **A chave
`service_role` nunca vai para o código**: ela dá acesso total e o instalador é
público.

### Montar o banco (uma vez só)

No painel do Supabase, abra **SQL Editor**, cole o conteúdo de
`supabase/esquema.sql` e clique em **Run**. Pode rodar de novo sem medo: o
script só cria o que falta.

### Liberar uma pessoa para entrar

No terminal do VS Code, com a chave `service_role` (no Coolify ela se chama
`SERVICE_SUPABASESERVICE_KEY`):

```
$env:SUPABASE_SERVICE_KEY = "cole a chave aqui"
npm run criar-usuario -- vendedor@loja.com.br SenhaForte123 "Nome da pessoa"
```

Rodar de novo com o mesmo e-mail troca a senha. Para tirar o acesso de alguém,
apague a linha da pessoa na tabela `usuarios` pelo **Table Editor** do Supabase.

### Backup

Use **Exportar CSV** dentro do programa, ou os backups do próprio Supabase no
Coolify.

## Onde fica cada coisa no projeto

| Arquivo | O que faz |
|---|---|
| `main.js` | Cria a janela, cuida do menu e das atualizações |
| `servidor.js` | O motor: login, busca, cadastro, movimentação, CSV, conversa com o banco |
| `config.js` | Endereço do Supabase e chave pública |
| `preload.js` | Ponte entre a tela e o programa |
| `public/login.html` · `login.js` | Página de entrada |
| `public/index.html` | Estrutura da tela e campos dos formulários |
| `public/estilo.css` | Cores, fontes e layout (tudo no bloco `:root` do topo) |
| `public/app.js` | Comportamento da tela: busca, filtros, modais |
| `supabase/esquema.sql` | Tabelas, regras de acesso e a função de entrada e saída |
| `scripts/criar-usuario.js` | Cria e libera usuários (`npm run criar-usuario`) |
| `dados-iniciais/pecas.json` | 40 peças de demonstração (não vão no instalador) |
| `build/icone.ico` | Ícone do programa e do instalador |
| `.github/workflows/publicar.yml` | Receita que o GitHub usa para montar o instalador |

## Como usar no dia a dia

A busca aceita termos misturados, na ordem que vier: `pastilha gol 2012`,
`filtro óleo corolla`, `NGK vela`, ou o código completo. Um ano de quatro dígitos
é comparado com a faixa de anos das aplicações da peça. Traços e pontos no código
são ignorados, então `90919-01253` e `9091901253` encontram a mesma peça, inclusive
pelos códigos equivalentes.

Atalhos: `/` vai para o campo de busca, `Esc` fecha o que estiver aberto.

A tarja colorida na lateral de cada ficha indica o saldo — verde acima do mínimo,
âmbar no mínimo, vermelho zerado.

### Colunas da planilha CSV

`codigo` · `nome` · `marca` · `categoria` · `preco_custo` · `preco_venda` ·
`estoque` · `estoque_minimo` · `localizacao` · `fornecedor` · `equivalentes` ·
`aplicacoes` · `descricao`

Só `codigo` e `nome` são obrigatórios. Separador de colunas: ponto e vírgula.
Preços aceitam vírgula decimal. Na importação, códigos que já existem são
atualizados e os novos são criados; nada é apagado. Numa peça que já existe, só
mudam as colunas que a planilha traz preenchidas: coluna ausente ou célula vazia
mantém o valor atual.

- **equivalentes** — separados por barra vertical: `1987948123 | N-1234`
- **aplicacoes** — cada uma no formato `montadora > modelo > ano-ano > motor`,
  várias separadas por `//`:
  `Volkswagen > Gol > 2009-2016 > 1.0 // Volkswagen > Fox > 2010-2018 > 1.6`

---

## Problemas conhecidos

**O Windows mostra "aplicativo não reconhecido" ao instalar** — acontece com todo
instalador sem certificado digital. Clique em **Mais informações › Executar assim
mesmo**. Para eliminar o aviso seria preciso comprar um certificado de assinatura de
código, que custa algumas centenas de reais por ano.

**A atualização não chega** — confira se o número da tag bate com o do `package.json`,
se o Release aparece na página do repositório e se o `owner` no `package.json` é o seu
usuário. A atualização só funciona no programa instalado, nunca no `npm start`.

**Quero montar o instalador na minha máquina, sem o GitHub** — rode
`npm run instalador`. O arquivo sai na pasta `dist`. Só funciona rodando no Windows.

**Quero olhar só o motor, sem janela** — `npm run motor` sobe o sistema em
`http://localhost:3000`, com a mesma página de login e o mesmo banco do programa.
Serve para depurar a API. Atenção: o que você mexer ali muda o estoque de verdade.

**"O servidor do banco de dados não respondeu"** — o Supabase está fora do ar ou
sem internet. Confira no Coolify se o serviço está como *Running*.
