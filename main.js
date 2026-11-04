const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#070b14", 8, 22);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 6);

scene.add(new THREE.AmbientLight("#9eb6ff", 0.55));

const key = new THREE.DirectionalLight("#ffffff", 1.4);
key.position.set(4, 6, 3);
scene.add(key);

const fill = new THREE.PointLight("#4f7cff", 18, 20);
fill.position.set(-3, 1, 2);
scene.add(fill);

const group = new THREE.Group();
scene.add(group);

const material = new THREE.MeshStandardMaterial({
  color: "#6ea8ff",
  metalness: 0.35,
  roughness: 0.28,
});

const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), material);
group.add(core);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.9, 0.06, 16, 80),
  new THREE.MeshStandardMaterial({
    color: "#d7e6ff",
    metalness: 0.8,
    roughness: 0.2,
  })
);
ring.rotation.x = Math.PI / 2.4;
group.add(ring);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 64),
  new THREE.MeshStandardMaterial({ color: "#10182a", roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.8;
scene.add(floor);

let dragging = false;
let lastX = 0;
let lastY = 0;
let targetRotX = 0.2;
let targetRotY = 0.4;
let distance = 6;

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  targetRotY += (event.clientX - lastX) * 0.008;
  targetRotX += (event.clientY - lastY) * 0.008;
  targetRotX = Math.max(-0.8, Math.min(0.8, targetRotX));
  lastX = event.clientX;
  lastY = event.clientY;
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    distance = Math.max(3.2, Math.min(12, distance + event.deltaY * 0.004));
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();
  group.rotation.y += (targetRotY - group.rotation.y) * 0.08;
  group.rotation.x += (targetRotX - group.rotation.x) * 0.08;
  core.rotation.y = t * 0.35;
  ring.rotation.z = t * 0.2;
  camera.position.z += (distance - camera.position.z) * 0.08;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
