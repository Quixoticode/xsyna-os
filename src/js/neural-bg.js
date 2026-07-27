import * as THREE from "three";

export function initNeuralBackground(containerId = "neural-canvas") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030508, 0.002);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const particleCount = 80;
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1300;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1300;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 700;
    velocities.push({
      x: (Math.random() - 0.5) * 0.25,
      y: (Math.random() - 0.5) * 0.25,
      z: (Math.random() - 0.5) * 0.08,
    });
  }

  particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const particleMaterial = new THREE.PointsMaterial({
    color: 0x00c2cc,
    size: 2.2,
    transparent: true,
    opacity: 0.55,
  });

  const particleSystem = new THREE.Points(particles, particleMaterial);
  scene.add(particleSystem);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x00c2cc,
    transparent: true,
    opacity: 0.04,
  });

  const mouse = new THREE.Vector2();
  let targetRotationX = 0;
  let targetRotationY = 0;

  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    targetRotationX = mouse.y * 0.1;
    targetRotationY = mouse.x * 0.1;
  }

  window.addEventListener("mousemove", onMouseMove, { passive: true });

  let lineGroup = new THREE.Group();
  scene.add(lineGroup);

  function animate() {
    requestAnimationFrame(animate);

    const posArray = particles.attributes.position.array;

    for (let i = 0; i < particleCount; i++) {
      posArray[i * 3] += velocities[i].x;
      posArray[i * 3 + 1] += velocities[i].y;
      posArray[i * 3 + 2] += velocities[i].z;

      for (let j = 0; j < 3; j++) {
        if (Math.abs(posArray[i * 3 + j]) > 700) {
          velocities[i].x *= -1;
          velocities[i].y *= -1;
          velocities[i].z *= -1;
        }
      }
    }

    particles.attributes.position.needsUpdate = true;

    particleSystem.rotation.x += (targetRotationX - particleSystem.rotation.x) * 0.015;
    particleSystem.rotation.y += (targetRotationY - particleSystem.rotation.y) * 0.015;

    const linePositions = [];
    const maxDistance = 180;
    for (let i = 0; i < particleCount; i++) {
      for (let j = i + 1; j < particleCount; j++) {
        const dx = posArray[i * 3] - posArray[j * 3];
        const dy = posArray[i * 3 + 1] - posArray[j * 3 + 1];
        const dz = posArray[i * 3 + 2] - posArray[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < maxDistance) {
          linePositions.push(
            posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2],
            posArray[j * 3], posArray[j * 3 + 1], posArray[j * 3 + 2]
          );
        }
      }
    }

    scene.remove(lineGroup);
    lineGroup = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3)),
      lineMaterial
    );
    scene.add(lineGroup);

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener("resize", onResize);

  return {
    destroy() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
