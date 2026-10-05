/*
 * Ponte entre a tela e o programa. Só expõe o que a tela precisa:
 * saber a versão, procurar atualização, acompanhar o download
 * e mandar instalar quando estiver pronta.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appDesktop', {
  versao: () => ipcRenderer.invoke('app:versao'),
  verificarAtualizacao: () => ipcRenderer.invoke('app:verificar-atualizacao'),
  estadoAtualizacao: () => ipcRenderer.invoke('app:estado-atualizacao'),
  instalarAtualizacao: () => ipcRenderer.invoke('app:instalar-atualizacao'),
  aoMudarAtualizacao: funcao => ipcRenderer.on('atualizacao:estado', (_evento, estado) => funcao(estado))
});
