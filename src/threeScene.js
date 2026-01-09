import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const TV_MODEL_URL = "/assets/models/crt_tv.glb";
const SCREEN_CURVATURE = 0.12;
const FALLBACK_SCREEN_SCALE = { x: 0.56, y: 0.42, yOffset: 0.04, zOffset: 0.02 };

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uCurvature;
  uniform float uScanlineIntensity;
  uniform float uNoiseIntensity;
  varying vec2 vUv;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    float r2 = dot(centered, centered);
    centered *= 1.0 + uCurvature * r2;
    uv = centered * 0.5 + 0.5;

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float scan = sin(uv.y * uResolution.y * 3.14159);
    float noise = rand(uv + uTime) - 0.5;

    vec2 offset = vec2(0.0025, 0.0);
    float r = texture2D(tDiffuse, uv + offset).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - offset).b;

    vec3 color = vec3(r, g, b);
    color *= 0.92 + 0.08 * scan * uScanlineIntensity;
    color += noise * uNoiseIntensity;

    float vignette = smoothstep(1.1, 0.4, r2);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createLabelTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d7f7ee";
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(120, 255, 210, 0.7)";
  ctx.shadowBlur = 12;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { canvas, texture };
}

function updateLabelTexture(label, text) {
  const ctx = label.canvas.getContext("2d");
  ctx.clearRect(0, 0, label.canvas.width, label.canvas.height);
  ctx.fillStyle = "#d7f7ee";
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(120, 255, 210, 0.7)";
  ctx.shadowBlur = 12;
  ctx.fillText(text, label.canvas.width / 2, label.canvas.height / 2);
  label.texture.needsUpdate = true;
}

function buildButtonMesh(text, action) {
  const label = createLabelTexture(text);
  const material = new THREE.MeshBasicMaterial({
    map: label.texture,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), material);    
  mesh.userData.action = action;
  mesh.userData.label = label;
  return mesh;
}

function createHotspot(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.style.position = "absolute";
  button.style.pointerEvents = "auto";
  button.style.background = "rgba(0, 0, 0, 0)";
  button.style.border = "none";
  button.style.padding = "0";
  button.style.margin = "0";
  button.style.cursor = "pointer";
  button.style.outline = "none";
  return button;
}

export function initCRTScene({ gameCanvas, togglePause, isPaused, onSwitchGame }) {
  const canvas = document.getElementById("three-canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });        
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.pointerEvents = "auto";
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.2 : 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 6.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI / 2.2;

  const ambient = new THREE.AmbientLight(0x223033, 0.25);
  scene.add(ambient);

  const screenLight = new THREE.PointLight(0x7fffd4, 2.2, 8, 2);
  screenLight.position.set(0, 1.3, 1.4);
  scene.add(screenLight);

  const fillLight = new THREE.SpotLight(0x99ffd8, 0.6, 12, Math.PI / 5, 0.8, 1.2);
  fillLight.position.set(0, 3.5, 4.5);
  fillLight.target.position.set(0, 1.1, 0);
  scene.add(fillLight);
  scene.add(fillLight.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.95, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.9 })
  );
  wall.position.set(0, 3.5, -6);
  scene.add(wall);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.25, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2a1b14, roughness: 0.85 })
  );
  table.position.set(0, 0.45, 0);
  scene.add(table);

  const tableLeg = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.8, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x1d120e, roughness: 0.9 })
  );
  tableLeg.position.set(0, 0.05, 0);
  scene.add(tableLeg);

  const captureCanvas = document.createElement("canvas");
  const captureCtx = captureCanvas.getContext("2d");
  captureCanvas.width = gameCanvas.width || 960;
  captureCanvas.height = gameCanvas.height || 540;

  const gameTexture = new THREE.CanvasTexture(captureCanvas);
  gameTexture.colorSpace = THREE.SRGBColorSpace;
  gameTexture.minFilter = THREE.LinearFilter;
  gameTexture.magFilter = THREE.LinearFilter;
  gameTexture.generateMipmaps = false;

  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: gameTexture },
      uResolution: { value: new THREE.Vector2(gameCanvas.width || 512, gameCanvas.height || 512) },
      uTime: { value: 0 },
      uCurvature: { value: SCREEN_CURVATURE },
      uScanlineIntensity: { value: 1.0 },
      uNoiseIntensity: { value: 0.05 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
  screenMaterial.toneMapped = false;
  screenMaterial.depthWrite = false;
  screenMaterial.polygonOffset = true;
  screenMaterial.polygonOffsetFactor = -1;

  const gltfLoader = new GLTFLoader();
  const modelGroup = new THREE.Group();
  scene.add(modelGroup);
  let screenMesh = null;

  gltfLoader.load(TV_MODEL_URL, (gltf) => {
    const model = gltf.scene;
    model.scale.set(2.2, 2.2, 2.2);
    model.position.set(0, 0.45, 0);
    model.updateMatrixWorld(true);

    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = new THREE.Vector3();
    const initialCenter = new THREE.Vector3();
    initialBounds.getSize(initialSize);
    initialBounds.getCenter(initialCenter);
    let yRotate = 0;
    if (initialSize.x < initialSize.z) {
      yRotate = Math.PI / 2;
    }
    model.rotation.y = Math.PI + yRotate;
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const name = child.name.toLowerCase();
      const matName = child.material && child.material.name ? child.material.name.toLowerCase() : "";
      if (name.includes("screen") || matName.includes("screen")) {
        screenMesh = child;
      }
    });

    if (!screenMesh) {
      let best = null;
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        const area = size.x * size.y;
        const depth = size.z;
        if (!best || (area > best.area && depth < best.depth * 2)) {
          best = { mesh: child, area, depth };
        }
      });
      screenMesh = best ? best.mesh : null;
    }

    if (!screenMesh) {
      const bounds = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);

      const screenGeo = new THREE.PlaneGeometry(
        size.x * FALLBACK_SCREEN_SCALE.x,
        size.y * FALLBACK_SCREEN_SCALE.y
      );
      screenMesh = new THREE.Mesh(screenGeo, screenMaterial);
      let forward = new THREE.Vector3(0, 0, 1).applyEuler(model.rotation).normalize();
      const cameraDir = camera.position.clone().sub(center).normalize();
      if (forward.dot(cameraDir) < 0) {
        forward = forward.negate();
      }
      const offset = forward.clone().multiplyScalar(size.z * 0.5 + FALLBACK_SCREEN_SCALE.zOffset);
      screenMesh.position.set(
        center.x + offset.x,
        center.y + size.y * FALLBACK_SCREEN_SCALE.yOffset,
        center.z + offset.z
      );
      screenMesh.rotation.copy(model.rotation);
      screenMesh.userData.isScreen = true;
      screenMesh.renderOrder = 2;
      modelGroup.add(screenMesh);
    } else {
      screenMesh.material = screenMaterial;
      screenMesh.userData.isScreen = true;
      screenMesh.renderOrder = 2;
    }

    modelGroup.add(model);
  });

  const playButton = buildButtonMesh(isPaused() ? "PLAY" : "PAUSE", "toggle");  
  playButton.position.set(-1.6, 0.9, 1.15);
  scene.add(playButton);

  const switchButton = buildButtonMesh("SWITCH", "switch");
  switchButton.position.set(1.6, 0.9, 1.15);
  scene.add(switchButton);

  const overlay = document.createElement("div");
  overlay.id = "crt-ui-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "10";
  document.body.appendChild(overlay);

  const playHotspot = createHotspot("Play/Pause");
  const switchHotspot = createHotspot("Switch Game");
  const screenHotspot = createHotspot("Toggle Play");
  overlay.append(playHotspot, switchHotspot, screenHotspot);

  function toggleFromUI() {
    togglePause();
    const paused = isPaused();
    updateLabelTexture(playButton.userData.label, paused ? "PLAY" : "PAUSE");
  }

  playHotspot.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFromUI();
  });

  screenHotspot.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFromUI();
  });

  switchHotspot.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSwitchGame();
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomStrength = isMobile ? 0.35 : 0.6;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomStrength,
    0.6,
    0.85
  );
  composer.addPass(bloomPass);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let needsInitialTexture = true;

  function getScreenBounds(mesh, rect) {
    if (!mesh) return null;
    const geometry = mesh.geometry;
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return null;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      corner.applyMatrix4(mesh.matrixWorld);
      corner.project(camera);
      const x = ((corner.x + 1) / 2) * rect.width + rect.left;
      const y = ((-corner.y + 1) / 2) * rect.height + rect.top;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }

  function pointInBounds(pos, bounds) {
    if (!bounds) return false;
    return pos.x >= bounds.minX && pos.x <= bounds.maxX && pos.y >= bounds.minY && pos.y <= bounds.maxY;
  }

  function getPointer(event) {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }

  function handlePointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const pos = getPointer(event);
    if (pos.x == null || pos.y == null) return;
    pointer.x = ((pos.x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((pos.y - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return;
    for (const hit of hits) {
      if (hit.object.userData.action) {
        event.preventDefault?.();
        if (hit.object.userData.action === "toggle") {
          toggleFromUI();
        } else if (hit.object.userData.action === "switch") {
          onSwitchGame();
        }
        break;
      }
      if (hit.object.userData.isScreen) {
        event.preventDefault?.();
        toggleFromUI();
        break;
      }
    }
  }

  renderer.domElement.addEventListener("pointerdown", handlePointer, { capture: true });
  renderer.domElement.addEventListener("pointerup", handlePointer, { capture: true });
  renderer.domElement.addEventListener("click", handlePointer, { capture: true });
  window.addEventListener("pointerdown", handlePointer, { capture: true, passive: false });

  function onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();

  function animate() {
    const delta = clock.getDelta();
    controls.update();
    camera.updateMatrixWorld();
    screenMaterial.uniforms.uTime.value += delta;

    if (
      gameCanvas.width !== captureCanvas.width ||
      gameCanvas.height !== captureCanvas.height
    ) {
      captureCanvas.width = gameCanvas.width || captureCanvas.width;
      captureCanvas.height = gameCanvas.height || captureCanvas.height;
      screenMaterial.uniforms.uResolution.value.set(
        captureCanvas.width,
        captureCanvas.height
      );
    }

    if (captureCtx) {
      captureCtx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
      captureCtx.drawImage(gameCanvas, 0, 0, captureCanvas.width, captureCanvas.height);
    }
    gameTexture.needsUpdate = true;
    needsInitialTexture = false;

    const rect = renderer.domElement.getBoundingClientRect();
    playButton.updateMatrixWorld(true);
    switchButton.updateMatrixWorld(true);
    if (screenMesh) screenMesh.updateMatrixWorld(true);

    const playBounds = getScreenBounds(playButton, rect);
    const switchBounds = getScreenBounds(switchButton, rect);
    const screenBounds = screenMesh ? getScreenBounds(screenMesh, rect) : null;

    if (playBounds) {
      playHotspot.style.display = "block";
      playHotspot.style.left = `${playBounds.minX}px`;
      playHotspot.style.top = `${playBounds.minY}px`;
      playHotspot.style.width = `${playBounds.maxX - playBounds.minX}px`;
      playHotspot.style.height = `${playBounds.maxY - playBounds.minY}px`;
    } else {
      playHotspot.style.display = "none";
    }

    if (switchBounds) {
      switchHotspot.style.display = "block";
      switchHotspot.style.left = `${switchBounds.minX}px`;
      switchHotspot.style.top = `${switchBounds.minY}px`;
      switchHotspot.style.width = `${switchBounds.maxX - switchBounds.minX}px`;
      switchHotspot.style.height = `${switchBounds.maxY - switchBounds.minY}px`;
    } else {
      switchHotspot.style.display = "none";
    }

    if (screenBounds) {
      screenHotspot.style.display = "block";
      screenHotspot.style.left = `${screenBounds.minX}px`;
      screenHotspot.style.top = `${screenBounds.minY}px`;
      screenHotspot.style.width = `${screenBounds.maxX - screenBounds.minX}px`;
      screenHotspot.style.height = `${screenBounds.maxY - screenBounds.minY}px`;
    } else {
      screenHotspot.style.display = "none";
    }

    composer.render();
    requestAnimationFrame(animate);
  }

  animate();
}
