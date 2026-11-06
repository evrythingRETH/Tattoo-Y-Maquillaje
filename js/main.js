import * as THREE from "three";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { preparar } from "./human.js";

// Parámetros de la portada y del visor.
const INTRO_MS = 4000;
const FADE_MS = 900;
const ZOOM_MS = 1680; // acercamiento a una zona
const DOLLY_MS = 420; // rueda y botones +/−
const ALTURA_CUERPO = 2.3;
const GIRO = 0.008;
const MODELO = "assets/human/human.glb";
const CAMARA = {
  inicio: [0, 0.15, 3.6],
  mirada: [0, 0.1, 0],
  fov: 42,
};

const ZONAS = {
  cabeza: {
    codigo: "SC1",
    nombre: "Cabeza",
    serie: "Rostro",
    corte: "Pigmento",
    cerca: 0.72,
    nota: "Delineado, sombra y curación del rostro. Arrastra para recorrer la cabeza hacia los lados, arriba y abajo.",
    pagina: "cabeza.html",
    lamina: "Abrir lámina de cabeza",
    offset: [0.06, 0.14, 0.72],
  },
  brazo: {
    codigo: "SC2",
    nombre: "Brazo",
    serie: "Manga",
    corte: "Trazo",
    cerca: 0.55,
    nota: "Línea y cobertura de la manga. Desplaza el cursor para seguir el brazo.",
    pagina: "brazo.html",
    lamina: "Abrir lámina de brazo",
    offset: [0.34, 0.08, 0.48],
  },
  pecho: {
    codigo: "SC3",
    nombre: "Pecho",
    serie: "Torso",
    corte: "Vista 01",
    cerca: 0.64,
    nota: "El torso se queda en esta consola. Recórrelo con el cursor y vuelve al cuerpo cuando quieras.",
    pagina: "",
    lamina: "",
    offset: [0.05, 0.1, 0.64],
  },
};

const MODOS = {
  xr: { etiqueta: "XR", nota: "Ampliación luminosa, lectura de contorno.", filtro: "none" },
  ct: { etiqueta: "CT", nota: "Contraste alto, como un corte denso.", filtro: "contrast(1.35) saturate(0.7)" },
  mr: { etiqueta: "MR", nota: "Tono desplazado para leer otro tejido.", filtro: "hue-rotate(280deg) saturate(1.3)" },
  us: { etiqueta: "US", nota: "Eco suave, otra capa del mismo estudio.", filtro: "hue-rotate(90deg) saturate(1.2)" },
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const intro = document.getElementById("intro");
const app = document.getElementById("app");

function mostrarFigura() {
  if (intro.hidden) return;
  sessionStorage.setItem("intro-vista", "1");
  intro.hidden = true;
  app.hidden = false;
  document.getElementById("titulo-app").focus();
}

function cerrarIntro() {
  if (intro.hidden) return;
  if (reduceMotion) {
    mostrarFigura();
    return;
  }
  intro.classList.add("saliendo");
  intro.addEventListener("transitionend", mostrarFigura, { once: true });
  window.setTimeout(mostrarFigura, FADE_MS);
}

if (sessionStorage.getItem("intro-vista")) {
  mostrarFigura();
} else {
  document.getElementById("saltar-intro").addEventListener("click", cerrarIntro);
  window.setTimeout(cerrarIntro, INTRO_MS);
}

const canvas = document.getElementById("escena");
const escenario = document.getElementById("escenario");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x02060c, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMARA.fov, 1, 0.05, 100);
const camaraInicio = new THREE.Vector3(...CAMARA.inicio);
const miradaHome = new THREE.Vector3(...CAMARA.mirada);
const baseCam = camaraInicio.clone();
const baseMir = miradaHome.clone();
const pan = new THREE.Vector3();
const mirada = miradaHome.clone();
camera.position.copy(camaraInicio);

const estado = document.getElementById("estado-modelo");
let figura = null;
let modoActual = "xr";
let zonaActiva = null;
let ampliacion = 1;

new GLTFLoader().load(
  MODELO,
  (gltf) => {
    figura = preparar(gltf.scene, ALTURA_CUERPO, true);
    scene.add(figura.grupo);
    estado.hidden = true;
  },
  undefined,
  () => {
    estado.textContent = "No se pudo adquirir el estudio.";
  }
);

const anclas = { cabeza: "anclaCabeza", brazo: "anclaBrazo", pecho: "anclaPecho" };
const offsetLocal = new THREE.Vector3();
const desdeCam = new THREE.Vector3();
const haciaCam = new THREE.Vector3();
const desdeMir = new THREE.Vector3();
const haciaMir = new THREE.Vector3();
const panDesde = new THREE.Vector3();
const panHacia = new THREE.Vector3();
const arco = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
const tmpMir = new THREE.Vector3();
const tmpPan = new THREE.Vector3();
const punto = new THREE.Vector3();
const offsetMundo = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();

let yendo = false;
let usarArco = false;
let enganchado = false;
let zoomDesde = 0;
let duracionZoom = ZOOM_MS;
let arrastre = false;
let girando = false;
let ultimoX = 0;
let ultimoY = 0;

function curvaCam(t) {
  return 1 - (1 - t) ** 3;
}

function curvaMir(t) {
  return 1 - (1 - t) ** 2;
}

function progreso() {
  return Math.min(1, (performance.now() - zoomDesde) / duracionZoom);
}

function muestra(t) {
  const eCam = curvaCam(t);
  const eMir = curvaMir(t);
  tmpCam.lerpVectors(desdeCam, haciaCam, eCam);
  if (usarArco) tmpCam.addScaledVector(arco, Math.sin(eCam * Math.PI));
  tmpMir.lerpVectors(desdeMir, haciaMir, eMir);
  tmpPan.lerpVectors(panDesde, panHacia, eCam);
}

function encuadre() {
  camera.position.copy(baseCam).add(pan);
  mirada.copy(baseMir).add(pan);
  camera.lookAt(mirada);
  camera.updateMatrixWorld();
}

function congelar() {
  if (!yendo) return;
  muestra(progreso());
  baseCam.copy(tmpCam);
  baseMir.copy(tmpMir);
  pan.copy(tmpPan);
  yendo = false;
  enganchado = false;
  encuadre();
}

function animarHacia(cam, mir, panFinal, conArco, ms) {
  congelar();
  if (ms <= 0) {
    baseCam.copy(cam);
    baseMir.copy(mir);
    pan.copy(panFinal);
    yendo = false;
    enganchado = Boolean(zonaActiva);
    encuadre();
    escribirNivel();
    abrirPagina();
    return;
  }
  desdeCam.copy(baseCam);
  desdeMir.copy(baseMir);
  panDesde.copy(pan);
  haciaCam.copy(cam);
  haciaMir.copy(mir);
  panHacia.copy(panFinal);
  usarArco = conArco;
  arco.set(0, 0, 0);
  if (conArco) {
    arco.crossVectors(tmpCam.copy(haciaCam).sub(desdeCam), up.set(0, 1, 0));
    if (arco.lengthSq() < 1e-8) arco.set(1, 0, 0);
    arco.normalize().multiplyScalar(desdeCam.distanceTo(haciaCam) * 0.2);
  }
  duracionZoom = ms;
  zoomDesde = performance.now();
  yendo = true;
  enganchado = false;
}

function seguirZona() {
  if (!zonaActiva || !figura || yendo || !enganchado) return;
  const ancla = figura[anclas[zonaActiva]];
  if (!ancla) return;
  ancla.getWorldPosition(punto);
  offsetMundo.copy(offsetLocal).applyQuaternion(figura.grupo.quaternion);
  baseMir.copy(punto);
  baseCam.copy(punto).add(offsetMundo);
}

function escribirNivel() {
  const dist = Math.max(camera.position.distanceTo(mirada), 0.05);
  const home = Math.max(camaraInicio.distanceTo(miradaHome), 0.05);
  document.getElementById("nivel").textContent = (home / dist).toFixed(2);
}

function escribirSerie() {
  const modo = MODOS[modoActual];
  const serie = document.getElementById("serie");
  const vision = document.body.classList.contains("vision-clara") ? " · clara" : "";
  if (zonaActiva) {
    serie.textContent = modo.etiqueta + "-2040 · " + ZONAS[zonaActiva].nombre + vision;
  } else {
    serie.textContent = modo.etiqueta + "-2040 · Cuerpo" + vision;
  }
  document.getElementById("modo-nota").textContent = modo.nota;
}

function personalizar(zona) {
  const placa = document.getElementById("placa-zona");
  const volver = document.getElementById("volver-cuerpo");
  const lamina = document.getElementById("zona-lamina");
  const ayuda = document.getElementById("ayuda");
  document.querySelectorAll("[data-zona]").forEach((boton) => {
    boton.setAttribute("aria-pressed", String(boton.dataset.zona === zona));
  });
  if (!zona) {
    placa.hidden = true;
    volver.hidden = true;
    escenario.classList.remove("en-zona");
    document.getElementById("dato-serie").textContent = "Cuerpo";
    document.getElementById("dato-corte").textContent = "Vista completa";
    ayuda.textContent = "Arrastra para desplazar · Mayús para girar";
    document.getElementById("aviso").textContent = "Vista del cuerpo completo.";
    escribirSerie();
    return;
  }
  const info = ZONAS[zona];
  placa.hidden = false;
  volver.hidden = false;
  escenario.classList.add("en-zona");
  document.getElementById("zona-kicker").textContent = info.codigo;
  document.getElementById("zona-nombre").textContent = info.nombre;
  document.getElementById("zona-nota").textContent = info.nota;
  document.getElementById("dato-serie").textContent = info.serie;
  document.getElementById("dato-corte").textContent = info.corte;
  ayuda.textContent = "Arrastra para recorrer este corte";
  document.getElementById("aviso").textContent = info.nombre + ". " + info.nota;
  if (info.pagina) {
    lamina.hidden = false;
    lamina.href = info.pagina;
    lamina.textContent = info.lamina;
  } else {
    lamina.hidden = true;
  }
  escribirSerie();
}

function abrirPagina() {
  const pagina = zonaActiva && ZONAS[zonaActiva].pagina;
  if (pagina) window.location.href = pagina;
}

function aplicarFiltro() {
  const base = MODOS[modoActual].filtro === "none" ? "" : MODOS[modoActual].filtro;
  const foco = document.getElementById("foco");
  const n = foco ? Number(foco.value) / 100 : 1;
  const px = (1 - n) * 6;
  const blur = px < 0.12 ? "" : "blur(" + px.toFixed(2) + "px)";
  canvas.style.filter = [base, blur].filter(Boolean).join(" ") || "none";
}

function sincronizarZoom() {
  const rango = document.getElementById("zoom-rango");
  if (!rango || document.activeElement === rango) return;
  const nivel = Number(document.getElementById("nivel").textContent);
  rango.value = String(Math.round(Math.min(600, Math.max(70, nivel * 100))));
}

function encuadrar(zona) {
  const info = ZONAS[zona];
  const ancla = figura && figura[anclas[zona]];
  if (!ancla) {
    document.getElementById("aviso").textContent = "El estudio aún se está adquiriendo.";
    return;
  }
  offsetLocal.set(info.offset[0], info.offset[1], info.offset[2]);
  ancla.getWorldPosition(punto);
  offsetMundo.copy(offsetLocal).applyQuaternion(figura.grupo.quaternion);
  const cam = punto.clone().add(offsetMundo);
  const mir = punto.clone();
  zonaActiva = zona;
  personalizar(zona);
  ampliacion = camaraInicio.distanceTo(miradaHome) / Math.max(offsetLocal.length(), 0.05);
  animarHacia(cam, mir, new THREE.Vector3(), true, reduceMotion ? 0 : ZOOM_MS);
  escribirNivel();
}

function volverCuerpo() {
  const quieto = !zonaActiva && pan.lengthSq() < 1e-6 && Math.abs(ampliacion - 1) < 0.02 && !yendo;
  zonaActiva = null;
  ampliacion = 1;
  personalizar(null);
  if (quieto) return;
  animarHacia(camaraInicio.clone(), miradaHome.clone(), new THREE.Vector3(), true, reduceMotion ? 0 : 1300);
  escribirNivel();
}

document.querySelectorAll("[data-zona]").forEach((boton) => {
  boton.addEventListener("click", () => encuadrar(boton.dataset.zona));
});
document.getElementById("volver-cuerpo").addEventListener("click", volverCuerpo);

function tamano() {
  const ancho = canvas.clientWidth || window.innerWidth;
  const alto = canvas.clientHeight || window.innerHeight;
  camera.aspect = ancho / Math.max(alto, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(ancho, alto, false);
}

function proyectar(objeto, boton) {
  const centro = objeto.getWorldPosition(new THREE.Vector3()).project(camera);
  if (centro.z > 1) {
    boton.hidden = true;
    return;
  }
  boton.hidden = false;
  boton.style.left = (centro.x * 0.5 + 0.5) * canvas.clientWidth + "px";
  boton.style.top = (-centro.y * 0.5 + 0.5) * canvas.clientHeight + "px";
}

function desplazar(dx, dy) {
  right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const dist = Math.max(0.12, baseCam.distanceTo(baseMir));
  const escala = dist * 0.0024;
  pan.addScaledVector(right, -dx * escala);
  pan.addScaledVector(up, dy * escala);
  const tope = zonaActiva ? Math.max(0.22, dist * 1.45) : 1.05;
  if (pan.length() > tope) pan.setLength(tope);
  encuadre();
}

canvas.addEventListener("pointerdown", (evento) => {
  if (evento.button !== 0 && evento.button !== 2) return;
  arrastre = true;
  girando = evento.button === 2 || evento.shiftKey;
  ultimoX = evento.clientX;
  ultimoY = evento.clientY;
  canvas.classList.add("tomando");
  canvas.setPointerCapture(evento.pointerId);
});
function soltar() {
  arrastre = false;
  girando = false;
  canvas.classList.remove("tomando");
}
canvas.addEventListener("pointerup", soltar);
canvas.addEventListener("pointercancel", soltar);
canvas.addEventListener("contextmenu", (evento) => evento.preventDefault());
canvas.addEventListener("pointermove", (evento) => {
  if (!arrastre) return;
  if (yendo) congelar();
  const dx = evento.clientX - ultimoX;
  const dy = evento.clientY - ultimoY;
  ultimoX = evento.clientX;
  ultimoY = evento.clientY;
  if (girando || evento.shiftKey) {
    if (figura) figura.grupo.rotation.y += dx * GIRO;
    return;
  }
  desplazar(dx, dy);
});
canvas.addEventListener(
  "wheel",
  (evento) => {
    evento.preventDefault();
    cambiarAmpliacion(evento.deltaY > 0 ? -0.18 : 0.18);
  },
  { passive: false }
);
window.addEventListener("resize", tamano);
tamano();

document.addEventListener("keydown", (evento) => {
  const alejado = Math.abs(ampliacion - 1) > 0.02;
  if (evento.key === "Escape" && (zonaActiva || pan.lengthSq() > 1e-6 || alejado)) volverCuerpo();
});

function cuadro() {
  if (yendo && !reduceMotion) {
    const t = progreso();
    muestra(t);
    camera.position.copy(tmpCam).add(tmpPan);
    mirada.copy(tmpMir).add(tmpPan);
    camera.lookAt(mirada);
    if (t >= 1) {
      baseCam.copy(haciaCam);
      baseMir.copy(haciaMir);
      pan.copy(panHacia);
      yendo = false;
      enganchado = Boolean(zonaActiva);
      seguirZona();
      encuadre();
      abrirPagina();
    }
  } else {
    seguirZona();
    encuadre();
  }
  escribirNivel();
  sincronizarZoom();
  renderer.render(scene, camera);
  if (figura) {
    proyectar(figura.anclaCabeza, document.getElementById("hot-cabeza"));
    proyectar(figura.anclaBrazo, document.getElementById("hot-brazo"));
    proyectar(figura.anclaPecho, document.getElementById("hot-pecho"));
  }
  requestAnimationFrame(cuadro);
}
cuadro();

document.querySelectorAll("[data-modo]").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll("[data-modo]").forEach((otro) => {
      otro.setAttribute("aria-pressed", String(otro === boton));
    });
    modoActual = boton.dataset.modo;
    aplicarFiltro();
    escribirSerie();
  });
});

document.querySelectorAll("[data-menu]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const activo = boton.getAttribute("aria-pressed") === "true";
    document.querySelectorAll("[data-menu]").forEach((otro) => otro.setAttribute("aria-pressed", "false"));
    boton.setAttribute("aria-pressed", String(!activo));
    if (boton.dataset.menu !== "archivo") document.getElementById("panel-archivo").hidden = true;
    if (boton.dataset.menu === "estudio") {
      const foco = document.getElementById("foco");
      foco.value = "100";
      aplicarFiltro();
      volverCuerpo();
    }
    if (boton.dataset.menu === "vision") {
      document.body.classList.toggle("vision-clara");
      const clara = document.body.classList.contains("vision-clara");
      renderer.setClearColor(clara ? 0x0a1c28 : 0x02060c, 1);
      escribirSerie();
      document.getElementById("aviso").textContent = clara ? "Visión clara." : "Visión de consola.";
    }
    if (boton.dataset.menu === "archivo") {
      document.getElementById("panel-archivo").hidden = activo;
      document.getElementById("aviso").textContent = activo ? "Archivo cerrado." : "Archivo DX-2040 abierto.";
    }
  });
});

function fijarAmpliacion(valor) {
  if (zonaActiva && enganchado) {
    const home = camaraInicio.distanceTo(miradaHome);
    offsetLocal.setLength(Math.min(1.35, Math.max(0.08, home / valor)));
    ampliacion = home / offsetLocal.length();
    escribirNivel();
    return;
  }
  if (yendo) congelar();
  ampliacion = Math.min(3.2, Math.max(0.7, valor));
  const home = camaraInicio.distanceTo(miradaHome);
  const dist = home / ampliacion;
  const dir = baseCam.clone().sub(baseMir);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0.05, 1);
  dir.normalize();
  baseCam.copy(baseMir).add(dir.multiplyScalar(dist));
  encuadre();
  escribirNivel();
}

document.getElementById("zoom-rango").addEventListener("input", () => {
  fijarAmpliacion(Number(document.getElementById("zoom-rango").value) / 100);
});
document.getElementById("foco").addEventListener("input", aplicarFiltro);

function cambiarAmpliacion(delta) {
  if (yendo) return;
  if (zonaActiva && enganchado) {
    const largo = offsetLocal.length();
    const siguiente = largo * (delta > 0 ? 0.82 : 1.22);
    offsetLocal.setLength(Math.min(1.35, Math.max(0.08, siguiente)));
    ampliacion = camaraInicio.distanceTo(miradaHome) / offsetLocal.length();
    escribirNivel();
    return;
  }
  ampliacion = Math.min(3.2, Math.max(0.7, ampliacion + delta));
  const home = camaraInicio.distanceTo(miradaHome);
  const dist = home / ampliacion;
  const dir = baseCam.clone().sub(baseMir);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0.05, 1);
  dir.normalize();
  animarHacia(baseMir.clone().add(dir.multiplyScalar(dist)), baseMir.clone(), pan.clone(), false, reduceMotion ? 0 : DOLLY_MS);
}

document.getElementById("acercar").addEventListener("click", () => cambiarAmpliacion(0.28));
document.getElementById("alejar").addEventListener("click", () => cambiarAmpliacion(-0.28));
