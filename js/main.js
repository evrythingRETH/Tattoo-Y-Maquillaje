import * as THREE from "three";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { preparar } from "./human.js";

// Parámetros de la portada.
const INTRO_MS = 5000; // espera antes de pasar sola a la figura
const FADE_MS = 900; // fundido de la intro
const ZOOM_MS = 2400; // acercamiento a una zona: más alto = más suave
const ALTURA_CUERPO = 2.3; // tamaño del cuerpo en la escena
const GIRO = 0.008; // velocidad al arrastrar
const MODELO = "assets/human/human.glb";
const CAMARA = {
  inicio: [0, 0.15, 3.6],
  mirada: [0, 0.1, 0],
  fov: 42,
  // Distancia al ancla de cada zona. Más bajo = más cerca.
  cabeza: { cerca: 0.16, pagina: "cabeza.html" },
  brazo: { cerca: 0.12, pagina: "brazo.html" },
  pecho: { cerca: 0.18 },
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const intro = document.getElementById("intro");
const app = document.getElementById("app");
const modal = document.getElementById("modal");
const cerrarModal = document.getElementById("cerrar-modal");
let ultimoFoco = null;
let yendo = false;

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x02060c, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMARA.fov, 1, 0.05, 100);
const camaraInicio = new THREE.Vector3(...CAMARA.inicio);
const mirada = new THREE.Vector3(...CAMARA.mirada);
camera.position.copy(camaraInicio);

const estado = document.getElementById("estado-modelo");
let figura = null;

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

let arrastre = false;
let ultimoX = 0;
let ampliacion = 1; // 1 = cuerpo completo; más alto acerca la cámara
const destino = camaraInicio.clone();
let miradaDestino = mirada.clone();
let zoomDesde = 0;
const desdeCam = new THREE.Vector3();
const desdeMir = new THREE.Vector3();
const anclas = { cabeza: "anclaCabeza", brazo: "anclaBrazo", pecho: "anclaPecho" };

function curva(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

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

function encuadrar(zona) {
  const info = CAMARA[zona];
  const ancla = figura && figura[anclas[zona]];
  if (!ancla) {
    if (info.pagina) window.location.href = info.pagina;
    else abrirModal();
    return;
  }
  const punto = ancla.getWorldPosition(new THREE.Vector3());
  const acercar = new THREE.Vector3(zona === "brazo" ? 0.08 : 0, 0.02, info.cerca);
  acercar.applyQuaternion(figura.grupo.quaternion);
  desdeCam.copy(camera.position);
  desdeMir.copy(mirada);
  destino.copy(punto).add(acercar);
  miradaDestino.copy(punto);
  zoomDesde = performance.now();
  yendo = true;
  document.getElementById("nivel").textContent = (1 / info.cerca).toFixed(2);
  if (reduceMotion) {
    camera.position.copy(destino);
    mirada.copy(miradaDestino);
    if (info.pagina) window.location.href = info.pagina;
    else abrirModal();
    yendo = false;
    return;
  }
  window.setTimeout(() => {
    yendo = false;
    if (info.pagina) window.location.href = info.pagina;
    else abrirModal();
  }, ZOOM_MS);
}

function irAPagina(zona) {
  if (yendo) return;
  encuadrar(zona);
}

document.querySelectorAll("[data-zona]").forEach((boton) => {
  boton.addEventListener("click", () => irAPagina(boton.dataset.zona));
});

function abrirModal() {
  ultimoFoco = document.activeElement;
  modal.hidden = false;
  cerrarModal.focus();
}

function ocultarModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  if (ultimoFoco) ultimoFoco.focus();
}

cerrarModal.addEventListener("click", ocultarModal);
modal.addEventListener("click", (evento) => {
  if (evento.target === modal) ocultarModal();
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") ocultarModal();
  if (modal.hidden || evento.key !== "Tab") return;
  const focos = [...modal.querySelectorAll("button, a")];
  const primero = focos[0];
  const ultimo = focos[focos.length - 1];
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
});

canvas.addEventListener("pointerdown", (evento) => {
  arrastre = true;
  ultimoX = evento.clientX;
});
window.addEventListener("pointerup", () => {
  arrastre = false;
});
window.addEventListener("pointermove", (evento) => {
  if (!arrastre || yendo || !figura) return;
  figura.grupo.rotation.y += (evento.clientX - ultimoX) * GIRO;
  ultimoX = evento.clientX;
});
window.addEventListener("resize", tamano);
tamano();

function cuadro() {
  if (yendo && !reduceMotion) {
    const t = Math.min(1, (performance.now() - zoomDesde) / ZOOM_MS);
    const e = curva(t);
    camera.position.lerpVectors(desdeCam, destino, e);
    mirada.lerpVectors(desdeMir, miradaDestino, e);
  }
  camera.lookAt(mirada);
  renderer.render(scene, camera);
  if (figura) {
    proyectar(figura.anclaCabeza, document.getElementById("hot-cabeza"));
    proyectar(figura.anclaBrazo, document.getElementById("hot-brazo"));
    proyectar(figura.anclaPecho, document.getElementById("hot-pecho"));
  }
  requestAnimationFrame(cuadro);
}
cuadro();

const filtros = { xr: "none", ct: "contrast(1.35) saturate(0.7)", mr: "hue-rotate(280deg) saturate(1.3)", us: "hue-rotate(90deg) saturate(1.2)" };

document.querySelectorAll("[data-modo]").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll("[data-modo]").forEach((otro) => {
      otro.setAttribute("aria-pressed", String(otro === boton));
    });
    canvas.style.filter = filtros[boton.dataset.modo];
    document.getElementById("serie").textContent = boton.textContent + "-2040 · Ampliación";
  });
});

document.querySelectorAll("[data-menu]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const activo = boton.getAttribute("aria-pressed") === "true";
    document.querySelectorAll("[data-menu]").forEach((otro) => otro.setAttribute("aria-pressed", "false"));
    boton.setAttribute("aria-pressed", String(!activo));
    if (boton.dataset.menu === "estudio") {
      yendo = false;
      destino.copy(camaraInicio);
      miradaDestino.copy(new THREE.Vector3(...CAMARA.mirada));
      camera.position.copy(camaraInicio);
      mirada.copy(miradaDestino);
      ampliacion = 1;
      document.getElementById("nivel").textContent = "1.00";
    }
    if (boton.dataset.menu === "vision") {
      document.body.classList.toggle("vision-clara");
    }
    if (boton.dataset.menu === "archivo") {
      estado.hidden = false;
      estado.textContent = activo ? "Adquiriendo estudio…" : "Archivo local · serie DX-2040";
    }
  });
});

function cambiarAmpliacion(delta) {
  if (yendo) return;
  ampliacion = Math.min(3.2, Math.max(0.7, ampliacion + delta));
  const base = camaraInicio.clone().sub(new THREE.Vector3(...CAMARA.mirada));
  destino.copy(new THREE.Vector3(...CAMARA.mirada)).add(base.multiplyScalar(1 / ampliacion));
  camera.position.copy(destino);
  document.getElementById("nivel").textContent = ampliacion.toFixed(2);
}

document.getElementById("acercar").addEventListener("click", () => cambiarAmpliacion(0.35));
document.getElementById("alejar").addEventListener("click", () => cambiarAmpliacion(-0.35));
