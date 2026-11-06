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
const CUERPOS = {
  ct: { url: "assets/human/skeleton.gltf", rayos: false, orientar: "z", hueso: true },
  xr: { url: "assets/human/human.glb", rayos: true },
  mr: { url: "assets/human/guy/scene.gltf", rayos: false, orientar: "y" },
};
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
  xr: { etiqueta: "XR", nota: "Volumen azul de rayos X.", filtro: "none" },
  ct: { etiqueta: "CT", nota: "Esqueleto del cuerpo.", filtro: "none" },
  mr: { etiqueta: "MR", nota: "Persona con su textura.", filtro: "none" },
  us: { etiqueta: "US", nota: "La misma malla, con menos luz.", filtro: "contrast(0.82) brightness(0.78)" },
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const intro = document.getElementById("intro");
const app = document.getElementById("app");

function mostrarFigura() {
  if (intro.hidden) return;
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

sessionStorage.removeItem("intro-vista");
document.getElementById("saltar-intro").addEventListener("click", cerrarIntro);
window.setTimeout(cerrarIntro, INTRO_MS);
window.addEventListener("pageshow", (evento) => {
  if (evento.persisted) window.location.reload();
});

const canvas = document.getElementById("escena");
const escenario = document.getElementById("escenario");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf3f3f3, 1);

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
let cuerpoActual = "xr";
let zonaActiva = null;
let ampliacion = 1;
const cuerposListos = new Map();
const loaderCuerpo = new GLTFLoader();

scene.add(new THREE.AmbientLight("#ffffff", 0.65));
const luzCuerpo = new THREE.DirectionalLight("#ffffff", 1.05);
luzCuerpo.position.set(3, 5, 4);
scene.add(luzCuerpo);

function mostrarCuerpo(prep) {
  const giroY = figura ? figura.grupo.rotation.y : 0;
  const giroX = figura ? figura.grupo.rotation.x : 0;
  if (figura) scene.remove(figura.grupo);
  figura = prep;
  figura.grupo.rotation.y = giroY;
  figura.grupo.rotation.x = giroX;
  scene.add(figura.grupo);
  estado.hidden = true;
}

function cargarCuerpo(modo) {
  const info = CUERPOS[modo];
  if (!info) return;
  cuerpoActual = modo;
  if (cuerposListos.has(modo)) {
    mostrarCuerpo(cuerposListos.get(modo));
    return;
  }
  estado.hidden = false;
  estado.textContent = "Adquiriendo estudio…";
  loaderCuerpo.load(
    info.url,
    (gltf) => {
      const prep = preparar(gltf.scene, ALTURA_CUERPO, info.rayos, info.orientar);
      if (info.hueso) {
        prep.grupo.traverse((nodo) => {
          if (!nodo.isMesh) return;
          [].concat(nodo.material).forEach((material) => {
            if (material && !material.map && material.color) material.color.set("#d9d0c1");
          });
        });
      }
      cuerposListos.set(modo, prep);
      if (cuerpoActual === modo) mostrarCuerpo(prep);
    },
    undefined,
    () => {
      if (cuerpoActual === modo) estado.textContent = "No se pudo adquirir el estudio.";
    }
  );
}

cargarCuerpo("xr");

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
  const vision = document.body.classList.contains("tema-oscuro") ? " · invertida" : "";
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
    ayuda.textContent = "Arrastra para girar";
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
  ayuda.textContent = "Arrastra para girar este corte";
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

const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
const senal = document.getElementById("senal");
const senalTexto = document.getElementById("senal-texto");
const senalLinea = document.getElementById("senal-linea");
const senalPunta = document.getElementById("senal-punta");
const cajaCuerpo = new THREE.Box3();
const esquinaCuerpo = new THREE.Vector3();
const columnaCuerpo = new THREE.Vector3();

const TEXTOS_CUERPO = {
  cuello: ["Cuello", "Lorem ipsum dolor sit amet,", "consectetur adipiscing elit."],
  hombroIzq: ["Hombro izquierdo", "Sed do eiusmod tempor,", "incididunt ut labore et dolore."],
  hombroDer: ["Hombro derecho", "Ut enim ad minim veniam,", "quis nostrud exercitation."],
  abdomen: ["Abdomen", "Duis aute irure dolor in", "reprehenderit in voluptate."],
  flancoIzq: ["Flanco izquierdo", "Excepteur sint occaecat,", "cupidatat non proident."],
  flancoDer: ["Flanco derecho", "Sunt in culpa qui officia", "deserunt mollit anim id."],
  cadera: ["Cadera", "Nemo enim ipsam voluptatem,", "quia voluptas sit aspernatur."],
  musloIzq: ["Muslo izquierdo", "Neque porro quisquam est,", "qui dolorem ipsum quia."],
  musloDer: ["Muslo derecho", "Ut enim ad minima veniam,", "quis nostrum exercitationem."],
  rodillaIzq: ["Rodilla izquierda", "Quis autem vel eum iure", "reprehenderit qui in ea."],
  rodillaDer: ["Rodilla derecha", "At vero eos et accusamus,", "et iusto odio dignissimos."],
  piernaIzq: ["Pierna izquierda", "Nam libero tempore, cum", "soluta nobis est eligendi."],
  piernaDer: ["Pierna derecha", "Temporibus autem quibusdam", "et aut officiis debitis."],
  pieIzq: ["Pie izquierdo", "Itaque earum rerum hic", "tenetur a sapiente delectus."],
  pieDer: ["Pie derecho", "Ut aut reiciendis voluptatibus,", "maiores alias consequatur."],
  manoIzq: ["Mano izquierda", "Nisi ut aliquid ex ea", "commodi consequatur quis."],
  manoDer: ["Mano derecha", "Quis autem vel eum iure,", "reprehenderit qui in ea."],
};

let seccionActual = "";

function ocultarSenal() {
  senal.hidden = true;
  seccionActual = "";
}

function escribirSeccion(clave) {
  if (clave === seccionActual) return;
  seccionActual = clave;
  const lineas = TEXTOS_CUERPO[clave];
  const spans = senalTexto.querySelectorAll("span");
  lineas.forEach((linea, indice) => {
    spans[indice].textContent = linea;
  });
}

function claveSeccion(ny, lado, enEje, extremo) {
  const sufijo = lado === "izq" ? "Izq" : "Der";
  if (extremo && ny > 0.2 && ny < 0.56) return "mano" + sufijo;
  if (ny < 0.18) return enEje ? "cuello" : "hombro" + sufijo;
  if (ny < 0.36) return enEje ? "abdomen" : "flanco" + sufijo;
  if (ny < 0.5) return enEje ? "cadera" : "muslo" + sufijo;
  if (ny < 0.64) return "muslo" + sufijo;
  if (ny < 0.78) return "rodilla" + sufijo;
  if (ny < 0.9) return "pierna" + sufijo;
  return "pie" + sufijo;
}

function esZonaNombrada(x, y) {
  const umbral = Math.max(76, canvas.clientHeight * 0.13);
  return ["hot-cabeza", "hot-brazo", "hot-pecho"].some((id) => {
    const boton = document.getElementById(id);
    if (boton.hidden) return false;
    const bx = parseFloat(boton.style.left);
    const by = parseFloat(boton.style.top);
    return Math.hypot(bx - x, by - y) < umbral;
  });
}

function limitesCuerpo(ancho, alto) {
  cajaCuerpo.setFromObject(figura.grupo);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let ix = 0; ix < 2; ix += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      for (let iz = 0; iz < 2; iz += 1) {
        esquinaCuerpo.set(
          ix ? cajaCuerpo.max.x : cajaCuerpo.min.x,
          iy ? cajaCuerpo.max.y : cajaCuerpo.min.y,
          iz ? cajaCuerpo.max.z : cajaCuerpo.min.z
        ).project(camera);
        if (esquinaCuerpo.z > 1) continue;
        const sx = (esquinaCuerpo.x * 0.5 + 0.5) * ancho;
        const sy = (-esquinaCuerpo.y * 0.5 + 0.5) * alto;
        minX = Math.min(minX, sx);
        minY = Math.min(minY, sy);
        maxX = Math.max(maxX, sx);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function actualizarSenal(evento) {
  if (!figura || arrastre || yendo) {
    ocultarSenal();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = evento.clientX - rect.left;
  const y = evento.clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    ocultarSenal();
    return;
  }
  puntero.x = (x / rect.width) * 2 - 1;
  puntero.y = -(y / rect.height) * 2 + 1;
  raycaster.setFromCamera(puntero, camera);
  const golpes = raycaster.intersectObject(figura.grupo, true);
  if (!golpes.length || esZonaNombrada(x, y)) {
    ocultarSenal();
    return;
  }
  const golpe = golpes[0].point.clone().project(camera);
  const hx = (golpe.x * 0.5 + 0.5) * rect.width;
  const hy = (-golpe.y * 0.5 + 0.5) * rect.height;
  const limites = limitesCuerpo(rect.width, rect.height);
  if (!Number.isFinite(limites.minX)) {
    ocultarSenal();
    return;
  }
  const anchoTexto = 200;
  const altoTexto = 62;
  const margen = 18;
  columnaCuerpo.set(0, 0, 0);
  figura.grupo.localToWorld(columnaCuerpo);
  const columna = columnaCuerpo.project(camera);
  const centroX = (columna.x * 0.5 + 0.5) * rect.width;
  const altoCuerpo = Math.max(limites.maxY - limites.minY, 1);
  const anchoCuerpo = Math.max(limites.maxX - limites.minX, 1);
  const aLaDerecha = hx >= centroX;
  const lado = aLaDerecha ? "der" : "izq";
  const enEje = Math.abs(hx - centroX) < altoCuerpo * 0.07;
  const extremo = Math.abs(hx - centroX) > anchoCuerpo * 0.32;
  const ny = Math.min(1, Math.max(0, (hy - limites.minY) / altoCuerpo));
  escribirSeccion(claveSeccion(ny, lado, enEje, extremo));
  let tx = aLaDerecha ? limites.maxX + margen : limites.minX - margen - anchoTexto;
  if (aLaDerecha) tx = Math.max(tx, centroX + 12);
  else tx = Math.min(tx, centroX - anchoTexto - 12);
  tx = Math.max(8, Math.min(rect.width - anchoTexto - 8, tx));
  let ty = hy - altoTexto / 2;
  ty = Math.max(8, Math.min(rect.height - altoTexto - 8, ty));
  senalTexto.style.left = tx + "px";
  senalTexto.style.top = ty + "px";
  senalTexto.style.textAlign = aLaDerecha ? "left" : "right";
  const xTexto = aLaDerecha ? tx : tx + anchoTexto;
  const yTexto = ty + altoTexto / 2;
  const angulo = Math.atan2(hy - yTexto, hx - xTexto);
  const punta = 10;
  const xFlecha = hx - Math.cos(angulo) * 2;
  const yFlecha = hy - Math.sin(angulo) * 2;
  senalLinea.setAttribute("x1", xTexto);
  senalLinea.setAttribute("y1", yTexto);
  senalLinea.setAttribute("x2", xFlecha - Math.cos(angulo) * punta);
  senalLinea.setAttribute("y2", yFlecha - Math.sin(angulo) * punta);
  const abrir = 0.42;
  const ax = xFlecha - Math.cos(angulo - abrir) * punta;
  const ay = yFlecha - Math.sin(angulo - abrir) * punta;
  const bx = xFlecha - Math.cos(angulo + abrir) * punta;
  const by = yFlecha - Math.sin(angulo + abrir) * punta;
  senalPunta.setAttribute("points", xFlecha + "," + yFlecha + " " + ax + "," + ay + " " + xFlecha + "," + yFlecha + " " + bx + "," + by);
  senal.hidden = false;
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
  ocultarSenal();
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
canvas.addEventListener("pointerleave", ocultarSenal);
canvas.addEventListener("contextmenu", (evento) => evento.preventDefault());
canvas.addEventListener("pointermove", (evento) => {
  if (!arrastre) actualizarSenal(evento);
  else ocultarSenal();
  if (!arrastre) return;
  if (yendo) congelar();
  const dx = evento.clientX - ultimoX;
  const dy = evento.clientY - ultimoY;
  ultimoX = evento.clientX;
  ultimoY = evento.clientY;
  if (!figura) return;
  figura.grupo.rotation.y += dx * GIRO;
  figura.grupo.rotation.x = Math.max(-1.1, Math.min(1.1, figura.grupo.rotation.x + dy * GIRO));
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

canvas.tabIndex = 0;
canvas.addEventListener("keydown", (evento) => {
  const tecla = evento.key;
  if (tecla === "ArrowLeft" || tecla === "ArrowRight" || tecla === "ArrowUp" || tecla === "ArrowDown") {
    evento.preventDefault();
    if (!figura) return;
    if (tecla === "ArrowLeft") figura.grupo.rotation.y += 0.12;
    if (tecla === "ArrowRight") figura.grupo.rotation.y -= 0.12;
    if (tecla === "ArrowUp") figura.grupo.rotation.x = Math.max(-1.1, figura.grupo.rotation.x - 0.08);
    if (tecla === "ArrowDown") figura.grupo.rotation.x = Math.min(1.1, figura.grupo.rotation.x + 0.08);
  }
  if (tecla === "+" || tecla === "=") {
    evento.preventDefault();
    cambiarAmpliacion(0.28);
  }
  if (tecla === "-" || tecla === "_") {
    evento.preventDefault();
    cambiarAmpliacion(-0.28);
  }
});

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
    if (CUERPOS[modoActual]) cargarCuerpo(modoActual);
    aplicarFiltro();
    escribirSerie();
    document.getElementById("aviso").textContent = MODOS[modoActual].nota;
  });
});

document.querySelectorAll("[data-menu]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const activo = boton.getAttribute("aria-pressed") === "true";
    document.querySelectorAll("[data-menu]").forEach((otro) => otro.setAttribute("aria-pressed", "false"));
    boton.setAttribute("aria-pressed", String(!activo));
    if (boton.dataset.menu !== "archivo") document.getElementById("panel-archivo").hidden = true;
    if (boton.dataset.menu === "estudio") {
      window.location.reload();
      return;
    }
    if (boton.dataset.menu === "vision") {
      document.body.classList.toggle("tema-oscuro");
      const oscuro = document.body.classList.contains("tema-oscuro");
      renderer.setClearColor(oscuro ? 0x141414 : 0xf3f3f3, 1);
      escribirSerie();
      document.getElementById("aviso").textContent = oscuro ? "Colores invertidos." : "Colores en claro.";
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
