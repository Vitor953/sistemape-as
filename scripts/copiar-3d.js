/*
 * Copia a biblioteca de 3D (three.js) de node_modules para public/vendor,
 * de onde a tela carrega. Rode depois de atualizar o pacote "three":
 *
 *   npm run copiar-3d
 */

const fs = require('fs');
const path = require('path');

const origem = path.join(__dirname, '..', 'node_modules', 'three');
const destino = path.join(__dirname, '..', 'public', 'vendor', 'three');

const arquivos = [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/environments/RoomEnvironment.js', 'addons/RoomEnvironment.js'],
  ['LICENSE', 'LICENSE']
];

for (const [de, para] of arquivos) {
  const alvo = path.join(destino, para);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.copyFileSync(path.join(origem, de), alvo);
  console.log(`  ${para}`);
}
console.log(`\n  three ${JSON.parse(fs.readFileSync(path.join(origem, 'package.json'), 'utf8')).version} copiado para public/vendor/three\n`);
