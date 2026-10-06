/*
 * Consulta de Autopeças — programa de mesa
 *
 * Este arquivo cria a janela do programa, sobe o motor internamente
 * (sem prompt, sem navegador) e cuida das atualizações vindas do GitHub.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { iniciar } = require('./servidor');
const { SUPABASE_URL } = require('./config');
const { autoUpdater } = require('electron-updater');

// As telas viajam dentro do programa. Os dados ficam no Supabase.
const PASTA_PUBLICA = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ */
/* Janela                                                              */
/* ------------------------------------------------------------------ */

let janela = null;
let endereco = null;

// A janela não usa a barra de título nem o menu do Windows: a tela ocupa
// tudo e os botões de minimizar, maximizar e fechar ficam por cima, no
// canto direito, pintados com as cores do sistema.
const ALTURA_BARRA = 40;
const CORES_DA_BARRA = {
  nenhuma: { color: '#080b11', symbolColor: '#aab4c3' },
  baixando: { color: '#161e2c', symbolColor: '#e7ecf3' },
  pronta: { color: '#f2a816', symbolColor: '#12100a' }
};

// Os botões acompanham a faixa de atualização (que só existe na tela principal).
function pintarBarra() {
  if (!janela || process.platform !== 'win32') return;
  const naTelaPrincipal = !janela.webContents.getURL().includes('/login.html');
  const fase = naTelaPrincipal ? estadoAtualizacao.fase : 'nenhuma';
  janela.setTitleBarOverlay({ ...CORES_DA_BARRA[fase], height: ALTURA_BARRA });
}

async function criarJanela() {
  const { porta } = await iniciar({ pastaPublica: PASTA_PUBLICA, porta: 0 });
  endereco = `http://127.0.0.1:${porta}`;

  janela = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#080b11',
    title: 'Consulta de Autopeças',
    icon: path.join(__dirname, 'build', 'icone.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...CORES_DA_BARRA.nenhuma, height: ALTURA_BARRA },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // O menu continua existindo (os atalhos de teclado dele funcionam), só não aparece.
  janela.setMenuBarVisibility(false);
  janela.webContents.on('did-navigate', pintarBarra);

  janela.once('ready-to-show', () => {
    janela.maximize();
    janela.show();
  });

  janela.on('closed', () => (janela = null));

  // Links externos abrem no navegador do sistema, nunca dentro do programa.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await janela.loadURL(endereco);
}

/* ------------------------------------------------------------------ */
/* Atualização pelo GitHub                                             */
/* ------------------------------------------------------------------ */

let checagemManual = false;

// O que a tela precisa saber para mostrar a faixa de atualização:
// fase 'nenhuma', 'baixando' (com percentual) ou 'pronta'.
let estadoAtualizacao = { fase: 'nenhuma', versao: null, percentual: 0 };

function informarTela(novoEstado) {
  estadoAtualizacao = { ...estadoAtualizacao, ...novoEstado };
  if (janela) janela.webContents.send('atualizacao:estado', estadoAtualizacao);
  pintarBarra();
}

// Com o programa aberto o dia todo, procura versão nova de tempos em tempos.
const INTERVALO_CHECAGEM = 30 * 60 * 1000;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function verificarAtualizacao(manual = false) {
  checagemManual = manual;

  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox(janela, {
        type: 'info',
        title: 'Modo de desenvolvimento',
        message: 'A atualização automática só funciona no programa instalado.',
        detail: 'Rodando por "npm start", você já está vendo a versão mais recente do seu código.',
        buttons: ['Entendi']
      });
    }
    return;
  }

  autoUpdater.checkForUpdates().catch(erro => {
    if (checagemManual) {
      dialog.showMessageBox(janela, {
        type: 'error',
        title: 'Não deu para verificar',
        message: 'Não consegui falar com o GitHub agora.',
        detail: String(erro && erro.message ? erro.message : erro),
        buttons: ['Fechar']
      });
    }
  });
}

autoUpdater.on('update-not-available', () => {
  if (!checagemManual) return;
  checagemManual = false;
  dialog.showMessageBox(janela, {
    type: 'info',
    title: 'Tudo em dia',
    message: `Você já está na versão ${app.getVersion()}.`,
    buttons: ['Fechar']
  });
});

// A partir daqui quem avisa é a faixa no topo da tela, não uma caixa de diálogo.
autoUpdater.on('update-available', info => {
  checagemManual = false;
  if (estadoAtualizacao.fase === 'pronta') return;
  informarTela({ fase: 'baixando', versao: info.version, percentual: 0 });
});

autoUpdater.on('download-progress', p => {
  if (janela) janela.setProgressBar(p.percent / 100);
  informarTela({ fase: 'baixando', percentual: Math.round(p.percent) });
});

autoUpdater.on('update-downloaded', info => {
  if (janela) janela.setProgressBar(-1);
  informarTela({ fase: 'pronta', versao: info.version, percentual: 100 });
});

function instalarAtualizacao() {
  if (estadoAtualizacao.fase !== 'pronta') return;
  // Instala em silêncio e abre o programa de novo sozinho.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

autoUpdater.on('error', erro => {
  if (janela) janela.setProgressBar(-1);
  if (estadoAtualizacao.fase === 'baixando') informarTela({ fase: 'nenhuma', percentual: 0 });
  if (!checagemManual) return;
  checagemManual = false;
  dialog.showMessageBox(janela, {
    type: 'error',
    title: 'Falha na atualização',
    message: 'A atualização não pôde ser concluída.',
    detail: String(erro && erro.message ? erro.message : erro),
    buttons: ['Fechar']
  });
});

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function montarMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [{ label: 'Sair', role: 'quit' }]
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Zoom normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        { label: 'Ferramentas do desenvolvedor', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Verificar atualizações',
          click: () => verificarAtualizacao(true)
        },
        {
          label: 'Sobre',
          click: () =>
            dialog.showMessageBox(janela, {
              type: 'info',
              title: 'Sobre',
              message: 'Consulta de Autopeças',
              detail: `Versão ${app.getVersion()}\nBanco de dados: ${SUPABASE_URL}`,
              buttons: ['Fechar']
            })
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:versao', () => app.getVersion());
ipcMain.handle('app:verificar-atualizacao', () => verificarAtualizacao(true));
ipcMain.handle('app:estado-atualizacao', () => estadoAtualizacao);
ipcMain.handle('app:instalar-atualizacao', () => instalarAtualizacao());

const instanciaUnica = app.requestSingleInstanceLock();

if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(async () => {
    montarMenu();

    try {
      await criarJanela();
    } catch (erro) {
      dialog.showErrorBox('Não foi possível abrir o sistema', String(erro && erro.message ? erro.message : erro));
      app.quit();
      return;
    }

    // Checagem silenciosa alguns segundos depois de abrir, e depois a cada meia hora.
    setTimeout(() => verificarAtualizacao(false), 5000);
    setInterval(() => verificarAtualizacao(false), INTERVALO_CHECAGEM);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
}
