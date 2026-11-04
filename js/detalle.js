import * as THREE from "three";
import { FBXLoader } from "../vendor/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { preparar } from "./human.js";

// Parámetros de las páginas Cabeza y Brazo.
const ALTURA = 1.7; // tamaño del eje más largo del modelo
const DISTANCIA = 2.6; // distancia de la cámara
const GIRO = 0.006; // rotación automática; 0 la detiene
const REVELAR = 0.25; // parte visible de la sección para que aparezca el texto

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x02060c, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
camera.position.set(0, 0, DISTANCIA);
scene.add(new THREE.AmbientLight("#ffffff", 0.55));
const luz = new THREE.DirectionalLight("#ffffff", 1.1);
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

document.querySelectorAll("[data-src]").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll("[data-src]").forEach((otro) => {
      otro.setAttribute("aria-pressed", String(otro === boton));
    });
    cargar(boton.dataset.src);
  });
});

const inicial = document.querySelector('[data-src][aria-pressed="true"]');
if (inicial) cargar(inicial.dataset.src);

window.addEventListener("resize", tamano);
tamano();

function cuadro() {
  if (objeto && !reduceMotion) objeto.rotation.y += GIRO;
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
