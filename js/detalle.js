import * as THREE from "three";
import { FBXLoader } from "../vendor/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { preparar } from "./human.js";

// Parámetros de las páginas Cabeza y Brazo.
const ALTURA = 1.7; // tamaño del eje más largo del modelo
const DISTANCIA = 2.6; // distancia de la cámara
const REVELAR = 0.25; // parte visible de la sección para que aparezca el texto

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x02060c, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
let distancia = DISTANCIA;
let distanciaMeta = DISTANCIA;
let panX = 0;
let panY = 0;
camera.position.set(0, 0, DISTANCIA);
scene.add(new THREE.AmbientLight("#ffffff", 0.42));
const luz = new THREE.DirectionalLight("#ffffff", 0.7);
luz.position.set(3, 4, 5);
scene.add(luz);

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const cache = new Map();
let objeto = null;
const estado = document.getElementById("estado-modelo");

function tamano() {
  const ancho = canvas.clientWidth || window.innerWidth;
  const alto = canvas.clientHeight || window.innerHeight;
  camera.aspect = ancho / Math.max(alto, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(ancho, alto, false);
}

function mostrar(grupo) {
  if (objeto) scene.remove(objeto);
  objeto = grupo;
  objeto.rotation.y = 0;
  grupo.traverse((nodo) => {
    if (!nodo.isMesh) return;
    nodo.frustumCulled = false;
    if (nodo.geometry) nodo.geometry.computeBoundingSphere();
    if (Array.isArray(nodo.material) && (!nodo.geometry.groups || nodo.geometry.groups.length === 0)) {
      nodo.material = nodo.material.find((material) => material) || nodo.material[0];
    }
    [].concat(nodo.material).forEach((material) => {
      if (material) material.side = THREE.DoubleSide;
    });
  });
  scene.add(objeto);
  estado.hidden = true;
}

function adaptarTexturas(gltf) {
  // Cabeza 1 guarda el color en una extensión que esta versión de Three no lee.
  // Se copia esa imagen al canal de color estándar, sin perder el archivo.
  const extension = "KHR_materials_pbrSpecularGlossiness";
  delete gltf.extensionsRequired;
  if (gltf.extensionsUsed) {
    gltf.extensionsUsed = gltf.extensionsUsed.filter((nombre) => nombre !== extension);
  }
  (gltf.materials || []).forEach((material) => {
    const extra = material.extensions && material.extensions[extension];
    if (!extra) return;
    material.pbrMetallicRoughness = material.pbrMetallicRoughness || {};
    if (extra.diffuseTexture) material.pbrMetallicRoughness.baseColorTexture = extra.diffuseTexture;
    if (extra.diffuseFactor) material.pbrMetallicRoughness.baseColorFactor = extra.diffuseFactor;
    material.pbrMetallicRoughness.metallicFactor = 0;
    material.pbrMetallicRoughness.roughnessFactor = extra.glossinessFactor == null ? 0.5 : 1 - extra.glossinessFactor;
    delete material.extensions[extension];
  });
}

function cargar(url) {
  estado.hidden = false;
  estado.textContent = "Adquiriendo corte…";
  if (cache.has(url)) {
    mostrar(cache.get(url));
    return;
  }
  const listo = (raiz) => {
    const grupo = preparar(raiz, ALTURA, false).grupo;
    cache.set(url, grupo);
    mostrar(grupo);
  };
  const fallo = () => {
    estado.textContent = "No se pudo cargar este modelo.";
  };
  if (url.endsWith(".fbx")) {
    fbxLoader.load(url, listo, undefined, fallo);
    return;
  }
  if (url.endsWith(".gltf")) {
    fetch(url)
      .then((respuesta) => respuesta.json())
      .then((json) => {
        adaptarTexturas(json);
        const carpeta = url.slice(0, url.lastIndexOf("/") + 1);
        gltfLoader.parse(JSON.stringify(json), carpeta, (gltf) => listo(gltf.scene), fallo);
      })
      .catch(fallo);
    return;
  }
  gltfLoader.load(url, (gltf) => listo(gltf.scene), undefined, fallo);
}

function aplicarFoco() {
  const foco = document.getElementById("foco");
  const n = foco ? Number(foco.value) / 100 : 1;
  const px = (1 - n) * 7;
  canvas.style.filter = px < 0.12 ? "none" : "blur(" + px.toFixed(2) + "px)";
}

function aplicarGiro() {
  const girar = document.getElementById("girar");
  if (objeto && girar) objeto.rotation.y = ((Number(girar.value) - 50) / 50) * Math.PI;
}

function distanciaDeZoom(valor) {
  return 5.2 - (valor / 100) * 4.05;
}

function sincronizarZoom() {
  const rango = document.getElementById("zoom-rango");
  if (!rango || document.activeElement === rango) return;
  rango.value = String(Math.round(((5.2 - distanciaMeta) / 4.05) * 100));
}

function personalizar(boton) {
  const titulo = document.getElementById("titulo-corte");
  const leyenda = document.getElementById("leyenda");
  const marca = document.getElementById("marca");
  const relato = document.getElementById("relato");
  const nombre = boton.dataset.titulo || (titulo ? titulo.textContent : "");
  if (titulo && boton.dataset.titulo) titulo.textContent = boton.dataset.titulo;
  if (leyenda && boton.dataset.nota) leyenda.textContent = boton.dataset.nota;
  if (relato && boton.dataset.relato) relato.textContent = boton.dataset.relato;
  if (marca && nombre) marca.textContent = "Estudio de imagen · " + nombre;
  if (nombre) document.title = nombre + " · Estudio de imagen";
  panX = 0;
  panY = 0;
  distanciaMeta = DISTANCIA;
  if (objeto) objeto.rotation.y = 0;
  const girar = document.getElementById("girar");
  const foco = document.getElementById("foco");
  if (girar) girar.value = "50";
  if (foco) foco.value = "100";
  aplicarFoco();
  sincronizarZoom();
}

document.querySelectorAll("[data-src]").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll("[data-src]").forEach((otro) => {
      otro.setAttribute("aria-pressed", String(otro === boton));
    });
    personalizar(boton);
    cargar(boton.dataset.src);
  });
});

const inicial = document.querySelector('[data-src][aria-pressed="true"]');
if (inicial) {
  personalizar(inicial);
  cargar(inicial.dataset.src);
}

let arrastre = false;
let ultimoX = 0;
let ultimoY = 0;

canvas.addEventListener("pointerdown", (evento) => {
  if (evento.button !== 0) return;
  arrastre = true;
  ultimoX = evento.clientX;
  ultimoY = evento.clientY;
  canvas.classList.add("tomando");
  canvas.setPointerCapture(evento.pointerId);
});
function soltar() {
  arrastre = false;
  canvas.classList.remove("tomando");
}
canvas.addEventListener("pointerup", soltar);
canvas.addEventListener("pointercancel", soltar);
canvas.addEventListener("pointermove", (evento) => {
  if (!arrastre) return;
  const dx = evento.clientX - ultimoX;
  const dy = evento.clientY - ultimoY;
  ultimoX = evento.clientX;
  ultimoY = evento.clientY;
  const tope = Math.max(0.55, distancia * 0.55);
  const escala = distancia * 0.0022;
  panX = Math.max(-tope, Math.min(tope, panX - dx * escala));
  panY = Math.max(-tope, Math.min(tope, panY + dy * escala));
});
canvas.addEventListener(
  "wheel",
  (evento) => {
    evento.preventDefault();
    const paso = evento.deltaY > 0 ? 0.28 : -0.28;
    distanciaMeta = Math.max(1.15, Math.min(5.2, distanciaMeta + paso));
    sincronizarZoom();
  },
  { passive: false }
);
document.getElementById("zoom-rango").addEventListener("input", () => {
  distanciaMeta = distanciaDeZoom(Number(document.getElementById("zoom-rango").value));
});
document.getElementById("foco").addEventListener("input", aplicarFoco);
document.getElementById("girar").addEventListener("input", aplicarGiro);
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") window.location.href = "index.html";
});

window.addEventListener("resize", tamano);
if (window.ResizeObserver) new ResizeObserver(tamano).observe(canvas.parentElement);
tamano();

function cuadro() {
  if (reduceMotion) distancia = distanciaMeta;
  else distancia += (distanciaMeta - distancia) * 0.16;
  camera.position.set(panX, panY, distancia);
  camera.lookAt(panX, panY, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(cuadro);
}
cuadro();

const bloques = document.querySelectorAll(".reveal");
if (reduceMotion || !("IntersectionObserver" in window)) {
  bloques.forEach((bloque) => bloque.classList.add("visible"));
} else {
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) entrada.target.classList.add("visible");
      });
    },
    { threshold: REVELAR }
  );
  bloques.forEach((bloque) => observador.observe(bloque));
}

document.querySelectorAll("[data-chart]").forEach(montarGrafica);

function leerSerie(texto) {
  return texto.split(",").map((par) => {
    const [nombre, valor] = par.split(":");
    return { nombre, valor: Number(valor) };
  });
}

function montarGrafica(contenedor) {
  const serie = leerSerie(contenedor.dataset.serie);
  const maximo = Math.max(...serie.map((punto) => punto.valor));
  if (contenedor.dataset.chart === "linea") {
    montarLinea(contenedor, serie, maximo);
    return;
  }
  serie.forEach((punto) => {
    const fila = document.createElement("div");
    fila.className = "fila";
    fila.tabIndex = 0;
    fila.setAttribute("role", "img");
    fila.setAttribute("aria-label", punto.nombre + ": " + punto.valor + " de " + maximo);
    fila.innerHTML =
      "<span>" + punto.nombre + "</span>" +
      '<span class="barra-pista"><span class="barra-valor"></span></span>' +
      '<span class="valor">' + punto.valor + "</span>";
    contenedor.append(fila);
    requestAnimationFrame(() => {
      fila.querySelector(".barra-valor").style.width = (punto.valor / maximo) * 100 + "%";
    });
  });
}

function montarLinea(contenedor, serie, maximo) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 320 180");
  svg.setAttribute("class", "linea-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", serie.map((punto) => punto.nombre + " " + punto.valor).join(", "));
  const coords = serie.map((punto, indice) => {
    const x = 28 + (indice * 270) / Math.max(serie.length - 1, 1);
    const y = 150 - (punto.valor / maximo) * 120;
    return { ...punto, x, y };
  });
  const trazo = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  trazo.setAttribute("points", coords.map((punto) => punto.x + "," + punto.y).join(" "));
  trazo.setAttribute("fill", "none");
  trazo.setAttribute("stroke", "#9ad7e4");
  trazo.setAttribute("stroke-width", "2");
  svg.append(trazo);
  coords.forEach((punto) => {
    const circulo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circulo.setAttribute("cx", punto.x);
    circulo.setAttribute("cy", punto.y);
    circulo.setAttribute("r", "5");
    circulo.setAttribute("fill", "#d8f7ff");
    svg.append(circulo);
  });
  contenedor.append(svg);
  const lista = document.createElement("div");
  coords.forEach((punto) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "punto";
    boton.textContent = punto.nombre + ": " + punto.valor;
    lista.append(boton);
  });
  contenedor.append(lista);
}
