import * as THREE from "three";

// Parámetros del rayos X. Solo se aplican al cuerpo.
const RAYOS = {
  borde: "#e9fbff", // color del contorno, como placa radiográfica
  interior: "#1a6ea8", // color del volumen
  potencia: 1.7, // más alto = borde más fino
  alfaBase: 0.55, // transparencia del centro, 0 a 1
  alfaBorde: 0.4, // transparencia extra en el contorno
};

export function materialRayosX() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uBorde: { value: new THREE.Color(RAYOS.borde) },
      uInterior: { value: new THREE.Color(RAYOS.interior) },
      uPotencia: { value: RAYOS.potencia },
      uAlfaBase: { value: RAYOS.alfaBase },
      uAlfaBorde: { value: RAYOS.alfaBorde },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vPos = mundo.xyz;
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      uniform vec3 uBorde;
      uniform vec3 uInterior;
      uniform float uPotencia;
      uniform float uAlfaBase;
      uniform float uAlfaBorde;
      void main() {
        vec3 vista = normalize(cameraPosition - vPos);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vista)), uPotencia);
        gl_FragColor = vec4(mix(uInterior, uBorde, fresnel), uAlfaBase + fresnel * uAlfaBorde);
      }
    `,
  });
}

function cajaDeMallas(raiz) {
  const caja = new THREE.Box3();
  raiz.updateMatrixWorld(true);
  raiz.traverse((nodo) => {
    if (nodo.isMesh) caja.expandByObject(nodo);
  });
  return caja;
}

// alto: tamaño del eje más largo, en unidades de la escena.
// rayosX: true solo para el cuerpo en rayos X. orientar: "z" endereza un modelo tumbado.
export function preparar(raiz, alto, rayosX, orientar) {
  const grupo = new THREE.Group();
  grupo.add(raiz);

  if (orientar === "z") raiz.rotateX(-Math.PI / 2);
  if (rayosX || orientar) raiz.rotateY(Math.PI);

  if (rayosX) {
    raiz.traverse((nodo) => {
      if (!nodo.isMesh) return;
      nodo.material = materialRayosX();
      nodo.frustumCulled = false;
    });
  } else {
    raiz.traverse((nodo) => {
      if (!nodo.isMesh) return;
      nodo.frustumCulled = false;
      const materiales = [].concat(nodo.material);
      materiales.forEach((material) => {
        if (!material) return;
        material.side = THREE.DoubleSide;
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
      });
    });
  }

  const medida = cajaDeMallas(raiz).getSize(new THREE.Vector3());
  const mayor = Math.max(medida.x, medida.y, medida.z, 0.0001);
  raiz.scale.multiplyScalar(alto / mayor);

  const caja = cajaDeMallas(raiz);
  raiz.position.sub(caja.getCenter(new THREE.Vector3()));
  const final = cajaDeMallas(raiz);
  const tam = final.getSize(new THREE.Vector3());

  const anclaCabeza = new THREE.Object3D();
  const anclaPecho = new THREE.Object3D();
  const anclaBrazo = new THREE.Object3D();
  // Posición de los botones, en proporción del cuerpo ya centrado.
  anclaCabeza.position.set(0, final.max.y - tam.y * 0.1, 0);
  anclaPecho.position.set(0, final.min.y + tam.y * 0.63, 0);
  anclaBrazo.position.set(final.max.x * 0.55, final.min.y + tam.y * 0.5, 0);
  grupo.add(anclaCabeza, anclaPecho, anclaBrazo);
  grupo.traverse((nodo) => {
    if (!nodo.isMesh || !nodo.geometry) return;
    nodo.geometry.computeBoundingBox();
    nodo.geometry.computeBoundingSphere();
  });

  return { grupo, anclaCabeza, anclaPecho, anclaBrazo };
}
