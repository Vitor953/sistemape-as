/* ==================================================================
   Consulta de Autopeças — cena 3D
   Disco de freio, pinça e engrenagem em metal, girando com luz real
   (three.js). Usada na página de entrada e no topo do Painel.

   A cena para de desenhar quando não está visível (aba escondida,
   janela minimizada) e fica parada para quem pediu menos movimento
   nas configurações do Windows.
   ================================================================== */

import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/addons/RoomEnvironment.js';

const AMBAR = 0xf2a816;
const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------- Peças ------------------------------ */

function circulo(raio, x = 0, y = 0) {
  const caminho = new THREE.Path();
  caminho.absarc(x, y, raio, 0, Math.PI * 2, true);
  return caminho;
}

function discoDeFreio() {
  const grupo = new THREE.Group();

  // Pista de frenagem com furação em espiral.
  const pista = new THREE.Shape();
  pista.absarc(0, 0, 2.2, 0, Math.PI * 2, false);
  pista.holes.push(circulo(1.12));
  const aneis = [1.42, 1.66, 1.9];
  for (let i = 0; i < 18; i++) {
    aneis.forEach((r, a) => {
      const angulo = (i / 18) * Math.PI * 2 + a * 0.12;
      pista.holes.push(circulo(0.065, Math.cos(angulo) * r, Math.sin(angulo) * r));
    });
  }
  const metalPolido = new THREE.MeshStandardMaterial({ color: 0xc2c8d1, metalness: 1, roughness: 0.3, envMapIntensity: 0.85 });
  const geometriaPista = new THREE.ExtrudeGeometry(pista, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 72
  });
  geometriaPista.center();
  grupo.add(new THREE.Mesh(geometriaPista, metalPolido));

  // Cubo central, mais escuro, com os cinco furos de parafuso.
  const cubo = new THREE.Shape();
  cubo.absarc(0, 0, 1.18, 0, Math.PI * 2, false);
  cubo.holes.push(circulo(0.42));
  for (let i = 0; i < 5; i++) {
    const angulo = (i / 5) * Math.PI * 2 + Math.PI / 2;
    cubo.holes.push(circulo(0.11, Math.cos(angulo) * 0.76, Math.sin(angulo) * 0.76));
  }
  const geometriaCubo = new THREE.ExtrudeGeometry(cubo, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 64
  });
  geometriaCubo.center();
  const malhaCubo = new THREE.Mesh(
    geometriaCubo,
    new THREE.MeshStandardMaterial({ color: 0x5b6472, metalness: 0.9, roughness: 0.42 })
  );
  malhaCubo.position.z = 0.3;
  grupo.add(malhaCubo);

  return grupo;
}

function pincaDeFreio() {
  // Um arco grosso que abraça a borda do disco, pintado de âmbar com verniz.
  const inicio = THREE.MathUtils.degToRad(18);
  const fim = THREE.MathUtils.degToRad(82);
  const forma = new THREE.Shape();
  forma.absarc(0, 0, 2.62, inicio, fim, false);
  forma.absarc(0, 0, 1.72, fim, inicio, true);
  forma.closePath();
  const geometria = new THREE.ExtrudeGeometry(forma, {
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 5,
    curveSegments: 40
  });
  geometria.translate(0, 0, -0.45);
  return new THREE.Mesh(
    geometria,
    new THREE.MeshPhysicalMaterial({
      color: 0xe8920a,
      metalness: 0.2,
      roughness: 0.4,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.5
    })
  );
}

function engrenagem(dentes, raioExterno, raioInterno, espessura) {
  const forma = new THREE.Shape();
  const passo = (Math.PI * 2) / dentes;
  for (let i = 0; i < dentes; i++) {
    const a = i * passo;
    const pontos = [
      [raioInterno, a],
      [raioExterno, a + passo * 0.18],
      [raioExterno, a + passo * 0.48],
      [raioInterno, a + passo * 0.66]
    ];
    pontos.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) forma.moveTo(x, y);
      else forma.lineTo(x, y);
    });
  }
  forma.closePath();
  forma.holes.push(circulo(raioInterno * 0.32));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    forma.holes.push(circulo(raioInterno * 0.13, Math.cos(ang) * raioInterno * 0.62, Math.sin(ang) * raioInterno * 0.62));
  }
  const geometria = new THREE.ExtrudeGeometry(forma, {
    depth: espessura,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 24
  });
  geometria.center();
  return new THREE.Mesh(geometria, new THREE.MeshStandardMaterial({ color: 0x2b3442, metalness: 0.95, roughness: 0.35 }));
}

function faiscas(quantidade) {
  const posicoes = new Float32Array(quantidade * 3);
  for (let i = 0; i < quantidade; i++) {
    const r = 2.6 + Math.random() * 3.4;
    const ang = Math.random() * Math.PI * 2;
    posicoes[i * 3] = Math.cos(ang) * r;
    posicoes[i * 3 + 1] = (Math.random() - 0.5) * 6;
    posicoes[i * 3 + 2] = Math.sin(ang) * r - 1.5;
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  return new THREE.Points(
    geometria,
    new THREE.PointsMaterial({
      color: AMBAR,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
}

/* ------------------------------ Cena ------------------------------ */

// posicaoX e posicaoY vão de -1 a 1: a fração da metade visível da cena
// (0 é o centro; 0.5 é a metade do caminho até a borda direita).
function montar(alvo, { escala = 1, posicaoX = 0, posicaoY = 0 } = {}) {
  let renderizador;
  try {
    renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (erro) {
    // Sem placa de vídeo compatível: a página continua, só sem o 3D.
    alvo.classList.add('cena3d--indisponivel');
    return null;
  }
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderizador.toneMapping = THREE.ACESFilmicToneMapping;
  renderizador.toneMappingExposure = 0.92;
  renderizador.outputColorSpace = THREE.SRGBColorSpace;
  renderizador.domElement.classList.add('cena3d__tela');
  alvo.append(renderizador.domElement);

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderizador);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);

  // Luz quente pela frente, contraluz azul por trás: dá volume ao metal.
  const chave = new THREE.DirectionalLight(0xffe2b0, 1.5);
  chave.position.set(4, 5, 6);
  const contraluz = new THREE.DirectionalLight(0x5b8cff, 3.2);
  contraluz.position.set(-6, 2, -5);
  const ambarBaixo = new THREE.PointLight(AMBAR, 18, 12);
  ambarBaixo.position.set(1.5, -3, 3);
  cena.add(chave, contraluz, ambarBaixo, new THREE.AmbientLight(0x1a2333, 0.6));

  const conjunto = new THREE.Group();
  const disco = discoDeFreio();
  const pinca = pincaDeFreio();
  const freio = new THREE.Group();
  freio.add(disco, pinca);
  conjunto.add(freio);

  const grande = engrenagem(22, 1.5, 1.26, 0.36);
  grande.position.set(-2.55, -1.65, -1.6);
  const pequena = engrenagem(12, 0.86, 0.66, 0.3);
  pequena.position.set(-0.6, -2.85, -1.25);
  conjunto.add(grande, pequena);

  const brilho = faiscas(180);
  cena.add(conjunto, brilho);

  conjunto.scale.setScalar(escala);
  conjunto.rotation.set(-0.32, 0.55, 0.12);

  // Estado da animação (declarado antes de ajustar(), que já o consulta).
  let visivel = true;
  let quadro = null;
  let anterior = performance.now();

  /* Tamanho */
  let alturaBase = 0;
  const ajustar = () => {
    const largura = Math.max(alvo.clientWidth, 1);
    const altura = Math.max(alvo.clientHeight, 1);
    renderizador.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    // Em telas estreitas a cena se afasta para caber inteira.
    camera.position.z = camera.aspect < 1 ? 10.5 / Math.max(camera.aspect, 0.55) : 10.5;
    camera.updateProjectionMatrix();
    const metadeAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    conjunto.position.x = posicaoX * metadeAltura * camera.aspect;
    alturaBase = posicaoY * metadeAltura;
    conjunto.position.y = alturaBase;
    if (quadro === null) renderizador.render(cena, camera);
  };
  const observador = new ResizeObserver(ajustar);
  observador.observe(alvo);
  ajustar();

  /* Mouse: o conjunto inclina de leve na direção do ponteiro */
  const alvoGiro = { x: 0, y: 0 };
  const aoMover = evento => {
    alvoGiro.x = (evento.clientY / window.innerHeight - 0.5) * 0.35;
    alvoGiro.y = (evento.clientX / window.innerWidth - 0.5) * 0.5;
  };
  window.addEventListener('pointermove', aoMover, { passive: true });

  /* Animação: só roda quando a cena está na tela */
  const desenhar = agora => {
    const passo = Math.min((agora - anterior) / 1000, 0.05);
    anterior = agora;
    const t = agora / 1000;
    if (!menosMovimento) {
      disco.rotation.z -= passo * 0.9;
      grande.rotation.z += passo * 0.55;
      pequena.rotation.z -= passo * 0.55 * (22 / 12);
      brilho.rotation.y += passo * 0.05;
      conjunto.position.y = alturaBase + Math.sin(t * 0.8) * 0.08;
      conjunto.rotation.x += (-0.32 + alvoGiro.x - conjunto.rotation.x) * 0.04;
      conjunto.rotation.y += (0.55 + alvoGiro.y - conjunto.rotation.y) * 0.04;
    }
    renderizador.render(cena, camera);
    quadro = visivel && !menosMovimento ? requestAnimationFrame(desenhar) : null;
  };
  const retomar = () => {
    if (quadro === null && visivel && !document.hidden) {
      anterior = performance.now();
      quadro = requestAnimationFrame(desenhar);
    }
  };
  const pausar = () => {
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = null;
  };

  const vigia = new IntersectionObserver(([entrada]) => {
    visivel = entrada.isIntersecting;
    if (visivel) retomar();
    else pausar();
  });
  vigia.observe(alvo);
  document.addEventListener('visibilitychange', () => (document.hidden ? pausar() : retomar()));

  renderizador.render(cena, camera);
  if (!menosMovimento) retomar();
  alvo.classList.add('cena3d--pronta');
  return { pausar, retomar };
}

/* Os scripts comuns da página pedem uma cena por aqui, mesmo antes deste
   módulo terminar de carregar (os pedidos ficam guardados na fila). */
window.montarCena3D = montar;
(window.__cenasPendentes || []).forEach(([alvo, opcoes]) => montar(alvo, opcoes));
window.__cenasPendentes = [];
