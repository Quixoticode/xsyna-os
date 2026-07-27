import * as THREE from "three";

export function initNeuralBackground(containerId = "neural-canvas") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030508, 0.0025);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 400;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const particleCount = 120;
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
    velocities.push({
      x: (Math.random() - 0.5) * 0.3,
      y: (Math.random() - 0.5) * 0.3,
      z: (Math.random() - 0.5) * 0.1,
    });
  }

  particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const particleMaterial = new THREE.PointsMaterial({
    color: 0x00f0ff,
    size: 3,
    transparent: true,
    opacity: 0.8,
  });

  const particleSystem = new THREE.Points(particles, particleMaterial);
  scene.add(particleSystem);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.08,
  });

  const mouse = new THREE.Vector2();
  let targetRotationX = 0;
  let targetRotationY = 0;

  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    targetRotationX = mouse.y * 0.15;
    targetRotationY = mouse.x * 0.15;
  }

  window.addEventListener("mousemove", onMouseMove, { passive: true });

  function animate() {
    requestAnimationFrame(animate);

    const posArray = particles.attributes.position.array;

    for (let i = 0; i < particleCount; i++) {
      posArray[i * 3] += velocities[i].x;
      posArray[i * 3 + 1] += velocities[i].y;
      posArray[i * 3 + 2] += velocities[i].z;

      for (let j = 0; j < 3; j++) {
        if (Math.abs(posArray[i * 3 + j]) > 600) {
          velocities[i].x *= -1;
          velocities[i].y *= -1;
          velocities[i].z *= -1;
        }
      }
    }

    particles.attributes.position.needsUpdate = true;

    // Mouse influence tilt
    particleSystem.rotation.x += (targetRotationX - particleSystem.rotation.x) * 0.02;
    particleSystem.rotation.y += (targetRotationY - particleSystem.rotation.y) * 0.02;

    // Draw synapse lines between close particles
    const linePositions = [];
    const maxDistance = 150;
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

    scene.children = scene.children.filter((child) => child !== lineGroup);
    lineGroup = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3)),
      lineMaterial
    );
    scene.add(lineGroup);

    renderer.render(scene, camera);
  }

  let lineGroup = new THREE.Group();
  scene.add(lineGroup);
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
