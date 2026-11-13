import * as THREE from "three";

const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x071018, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);
scene.fog = new THREE.FogExp2(0x071018, 0.045);
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 40);
camera.position.set(0.2, 0.35, 7.4);

const gyro = new THREE.Group();
scene.add(gyro);

function ring(radius, color, rot) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.018, 16, 160),
    new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.25, emissive: color, emissiveIntensity: 0.35 })
  );
  mesh.rotation.set(...rot);
  gyro.add(mesh);
  return mesh;
}

const rings = [
  ring(1.45, 0x3ee0c5, [1.2, 0.2, 0]),
  ring(1.82, 0x8eb6ff, [0.35, 0.8, 0.4]),
  ring(2.2, 0xf2b85a, [1.7, 0.15, 0.9]),
];

const glass = new THREE.Mesh(
  new THREE.SphereGeometry(0.78, 48, 48),
  new THREE.MeshStandardMaterial({ color: 0xc5ecff, metalness: 0.12, roughness: 0.08, transparent: true, opacity: 0.38, emissive: 0x12384a, emissiveIntensity: 0.5 })
);
gyro.add(glass);

const core = new THREE.Mesh(
  new THREE.SphereGeometry(0.26, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x3ee0c5, emissive: 0x3ee0c5, emissiveIntensity: 1.5, roughness: 0.35 })
);
gyro.add(core);

const bead = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 18, 18),
  new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: 0x3ee0c5, emissiveIntensity: 0.9 })
);
scene.add(bead);

const shutter = new THREE.Mesh(
  new THREE.CircleGeometry(1.05, 48),
  new THREE.MeshStandardMaterial({ color: 0xf2b85a, transparent: true, opacity: 0, side: THREE.DoubleSide, emissive: 0xf2b85a, emissiveIntensity: 0.35 })
);
shutter.position.z = 0.35;
gyro.add(shutter);

const count = 260;
const positions = new Float32Array(count * 3);
for (let i = 0; i < count; i += 1) {
  const radius = 3 + Math.random() * 4.2;
  const angle = Math.random() * Math.PI * 2;
  positions[i * 3] = Math.cos(angle) * radius;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 5.2;
  positions[i * 3 + 2] = Math.sin(angle) * radius * 0.62;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xb7d4ff, size: 0.028, transparent: true, opacity: 0.75 }));
scene.add(dust);

scene.add(new THREE.AmbientLight(0x9eb4d0, 0.7));
const key = new THREE.PointLight(0x3ee0c5, 6, 14);
key.position.set(2.2, 1.4, 3.2);
scene.add(key);
const fill = new THREE.PointLight(0x8eb6ff, 8, 14);
fill.position.set(-2.4, -0.8, 2);
scene.add(fill);

const pointer = { x: 0, y: 0 };
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const palette = {
  idle: 0x3ee0c5,
  wait: 0x8eb6ff,
  pass: 0x3ee0c5,
  revert: 0xff6d7e,
  gas: 0xf2b85a,
};
let mode = "idle";
let spin = 0.22;
let targetSpin = 0.22;
let shake = 0;
let clock = 0;
const targetColor = new THREE.Color(palette.idle);

export function setMode(next) {
  mode = next;
  const color = palette[next] || palette.idle;
  targetColor.set(color);
  targetSpin = next === "wait" ? 1.25 : next === "revert" ? 0.04 : next === "gas" ? 0.45 : 0.28;
  if (next === "revert") shake = 1;
}

function frame() {
  requestAnimationFrame(frame);
  clock += reduce ? 0.004 : 0.016;
  spin += (targetSpin - spin) * 0.05;
  const speed = reduce ? 0.2 : spin;
  gyro.rotation.y += 0.006 * speed;
  gyro.rotation.x = Math.sin(clock * 0.4) * 0.16;
  rings[0].rotation.z += 0.005 * speed;
  rings[1].rotation.x += 0.004 * speed;
  rings[2].rotation.y -= 0.006 * speed;
  core.material.emissive.lerp(targetColor, 0.08);
  core.material.color.lerp(targetColor, 0.08);
  bead.material.emissive.lerp(targetColor, 0.08);
  key.color.lerp(targetColor, 0.08);
  const travel = mode === "wait" || mode === "pass" ? 1.55 : 1.15;
  bead.position.set(Math.cos(clock * (mode === "wait" ? 2.4 : 0.9)) * travel, Math.sin(clock * 0.7) * 0.42, Math.sin(clock * 0.9) * 0.7);
  const shut = mode === "gas" ? 0.78 : 0;
  shutter.material.opacity += (shut - shutter.material.opacity) * 0.08;
  if (shake > 0.02 && !reduce) {
    shake *= 0.9;
    gyro.position.x = (Math.random() - 0.5) * 0.12 * shake;
    gyro.position.y = (Math.random() - 0.5) * 0.08 * shake;
  } else {
    gyro.position.x *= 0.9;
    gyro.position.y *= 0.9;
  }
  dust.rotation.y += reduce ? 0 : 0.0007;
  camera.position.x += (pointer.x * 0.45 - camera.position.x) * 0.04;
  camera.position.y += (0.35 + pointer.y * 0.25 - camera.position.y) * 0.04;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}
frame();

addEventListener("pointermove", (event) => {
  pointer.x = event.clientX / window.innerWidth - 0.5;
  pointer.y = -(event.clientY / window.innerHeight - 0.5);
});
addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
