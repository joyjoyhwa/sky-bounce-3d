import * as THREE from "../vendor/three.module.js";
import * as CANNON from "../vendor/cannon-es.js";

const canvas = document.querySelector("#scene");
const ui = {
  score: document.querySelector("#score"),
  best: document.querySelector("#best"),
  rings: document.querySelector("#rings"),
  speed: document.querySelector("#speed"),
  overlay: document.querySelector("#overlay"),
  overlayEyebrow: document.querySelector("#overlayEyebrow"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  forwardControl: document.querySelector("#forwardControl"),
  backControl: document.querySelector("#backControl"),
  leftControl: document.querySelector("#leftControl"),
  rightControl: document.querySelector("#rightControl"),
  jumpControl: document.querySelector("#jumpControl"),
};

const BALL_RADIUS = 0.46;
const START_Z = 2.2;
const SEGMENT_GAP = 5.65;
const LANE_WIDTH = 3.25;
const BASE_SPEED = 5.8;
const MAX_SPEED = 14.2;
const REVERSE_SPEED = 5.4;
const STEER_SPEED = 7.65;
const LANDING_EDGE_MARGIN = BALL_RADIUS * 0.18;
const NORMAL_BOUNCE = 9.35;
const BOOST_BOUNCE = 13.65;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7aa8bd);
scene.fog = new THREE.Fog(0x7aa8bd, 28, 170);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -23.5, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

const physicsMaterials = {
  ball: new CANNON.Material("ball"),
  platform: new CANNON.Material("platform"),
};
world.addContactMaterial(
  new CANNON.ContactMaterial(physicsMaterials.ball, physicsMaterials.platform, {
    friction: 0.06,
    restitution: 0.08,
  }),
);

const state = {
  mode: "ready",
  elapsed: 0,
  score: 0,
  best: readBestScore(),
  rings: 0,
  speed: BASE_SPEED,
  distance: 0,
  seed: 1,
  currentLane: 0,
  segmentIndex: 0,
  farthestZ: START_Z,
  previousBallY: 0,
  lastImpact: 0,
  lastBounceAt: -10,
  lastGroundedAt: -10,
  boostQueuedAt: -10,
};

const input = {
  left: false,
  right: false,
  forward: false,
  back: false,
};

const platforms = [];
const pickups = [];
const hazards = [];
const bursts = [];
const trail = [];

const reusable = {
  ballPosition: new THREE.Vector3(),
  cameraTarget: new THREE.Vector3(),
  lookTarget: new THREE.Vector3(),
  rollAxis: new THREE.Vector3(),
  rollStep: new THREE.Quaternion(),
};

const ballVisual = {
  roll: new THREE.Quaternion(),
  squash: 0,
};

const textures = {
  ball: makeBallTexture(),
  normal: makePanelTexture("#33415c", "#5b6c88", "#47e6cf"),
  boost: makePanelTexture("#106064", "#47e6cf", "#ffd166"),
  glass: makePanelTexture("#44316f", "#9b8cff", "#ffd166"),
};

const materials = {
  ball: new THREE.MeshStandardMaterial({
    map: textures.ball,
    roughness: 0.34,
    metalness: 0.22,
  }),
  normal: new THREE.MeshStandardMaterial({
    map: textures.normal,
    roughness: 0.62,
    metalness: 0.16,
  }),
  boost: new THREE.MeshStandardMaterial({
    map: textures.boost,
    emissive: new THREE.Color(0x0b746f),
    emissiveIntensity: 0.42,
    roughness: 0.5,
    metalness: 0.24,
  }),
  glass: new THREE.MeshStandardMaterial({
    map: textures.glass,
    color: 0xded7ff,
    emissive: new THREE.Color(0x2d1b67),
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.86,
    roughness: 0.22,
    metalness: 0.38,
  }),
  edge: new THREE.LineBasicMaterial({
    color: 0xdffcff,
    transparent: true,
    opacity: 0.36,
  }),
  ring: new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xd48a00,
    emissiveIntensity: 0.82,
    roughness: 0.36,
    metalness: 0.58,
  }),
  hazard: new THREE.MeshStandardMaterial({
    color: 0xff4668,
    emissive: 0x7d0820,
    emissiveIntensity: 0.82,
    roughness: 0.28,
    metalness: 0.18,
  }),
  dangerZone: new THREE.MeshBasicMaterial({
    color: 0xff4668,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }),
  pad: new THREE.MeshStandardMaterial({
    color: 0x47e6cf,
    emissive: 0x47e6cf,
    emissiveIntensity: 0.68,
    transparent: true,
    opacity: 0.78,
  }),
  ground: new THREE.MeshStandardMaterial({
    color: 0x314d49,
    roughness: 0.8,
    metalness: 0.06,
  }),
  trail: new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  }),
};

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 40, 28),
  materials.ball,
);
ballMesh.castShadow = true;
scene.add(ballMesh);

const ballBody = new CANNON.Body({
  mass: 1,
  material: physicsMaterials.ball,
  shape: new CANNON.Sphere(BALL_RADIUS),
  linearDamping: 0.035,
  angularDamping: 0.14,
});
world.addBody(ballBody);

setupEnvironment();
setupTrail();
setupInput();
resize();
resetGame();
setMode("ready");
requestAnimationFrame(tick);

function setupEnvironment() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3b3952, 1.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.45);
  sun.position.set(-8, 18, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0xffd166, 0.85);
  rim.position.set(12, 8, -14);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 420, 18, 18), materials.ground);
  ground.position.set(0, -9.4, -95);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(230, 46, 0x47e6cf, 0x59626f);
  grid.position.set(0, -9.36, -95);
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);
}

function setupTrail() {
  const geometry = new THREE.SphereGeometry(0.12, 12, 8);
  for (let i = 0; i < 18; i += 1) {
    const dot = new THREE.Mesh(geometry, materials.trail.clone());
    dot.visible = false;
    scene.add(dot);
    trail.push({
      mesh: dot,
      life: 0,
      maxLife: 0.52 + i * 0.012,
    });
  }
}

function setupInput() {
  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space"].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }

    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      input.left = true;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      input.right = true;
    }
    if (event.code === "ArrowUp" || event.code === "KeyW") {
      input.forward = true;
    }
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      input.back = true;
    }
    if (event.code === "Space" && !event.repeat) {
      if (state.mode === "ready" || state.mode === "gameover") {
        startGame();
      } else {
        queueBoost();
      }
    }
    if (event.code === "Enter" && !event.repeat && state.mode !== "playing") {
      startGame();
    }
    if (event.code === "KeyP" && !event.repeat) {
      togglePause();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      input.left = false;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      input.right = false;
    }
    if (event.code === "ArrowUp" || event.code === "KeyW") {
      input.forward = false;
    }
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      input.back = false;
    }
  });

  bindHoldButton(ui.forwardControl, "forward");
  bindHoldButton(ui.backControl, "back");
  bindHoldButton(ui.leftControl, "left");
  bindHoldButton(ui.rightControl, "right");
  ui.jumpControl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    ui.jumpControl.classList.add("is-active");
    if (state.mode === "ready" || state.mode === "gameover") {
      startGame();
    } else {
      queueBoost();
    }
  });
  ui.jumpControl.addEventListener("pointerup", () => ui.jumpControl.classList.remove("is-active"));
  ui.jumpControl.addEventListener("pointercancel", () => ui.jumpControl.classList.remove("is-active"));

  ui.startButton.addEventListener("click", startGame);
  ui.pauseButton.addEventListener("click", togglePause);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") {
      setMode("paused");
    }
  });
}

function bindHoldButton(button, key) {
  const release = () => {
    input[key] = false;
    button.classList.remove("is-active");
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    input[key] = true;
    button.classList.add("is-active");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

function tick(time) {
  requestAnimationFrame(tick);

  const seconds = time / 1000;
  const rawDelta = Math.min(seconds - state.elapsed, 0.05) || 1 / 60;
  state.elapsed = seconds;

  if (state.mode === "playing") {
    updateGame(rawDelta);
  } else {
    idleMotion(seconds);
  }

  updateCamera(rawDelta);
  renderer.render(scene, camera);
}

function updateGame(delta) {
  state.previousBallY = ballBody.position.y;
  handleControls(delta);
  world.step(1 / 60, delta, 3);
  resolveVisibleLanding();
  updateBallVisual(delta);
  updateTrack();
  updatePickups(delta);
  updateHazards(delta);
  updateBursts(delta);
  updateTrail(delta);
  updateHud();

  if (ballBody.position.y < -10 || Math.abs(ballBody.position.x) > 11) {
    endGame("fall");
  }
}

function handleControls(delta) {
  const steer = Number(input.right) - Number(input.left);
  const thrust = Number(input.forward) - Number(input.back);
  const progress = Math.max(0, START_Z - ballBody.position.z);
  const targetX = steer * STEER_SPEED;
  const blend = 1 - Math.pow(0.0008, delta);
  ballBody.velocity.x += (targetX - ballBody.velocity.x) * blend;

  state.distance = Math.max(state.distance, progress);
  const speedGrowth = Math.min(3.2, state.distance * 0.006 + state.rings * 0.02);
  let targetForwardSpeed = BASE_SPEED + speedGrowth;

  if (thrust > 0) {
    targetForwardSpeed = Math.min(MAX_SPEED, BASE_SPEED + 5.3 + speedGrowth * 1.2);
  } else if (thrust < 0) {
    targetForwardSpeed = -REVERSE_SPEED;
  }

  const currentForwardSpeed = -ballBody.velocity.z;
  const speedBlend = 1 - Math.pow(0.00003, delta);
  state.speed = THREE.MathUtils.lerp(currentForwardSpeed, targetForwardSpeed, speedBlend);
  ballBody.velocity.z = -state.speed;

  const queuedRecently = state.elapsed - state.boostQueuedAt < 0.16;
  const groundedRecently = state.elapsed - state.lastGroundedAt < 0.22;
  if (queuedRecently && groundedRecently) {
    ballBody.velocity.y = Math.max(ballBody.velocity.y, 13.2);
    ballVisual.squash = Math.max(ballVisual.squash, 0.62);
    state.boostQueuedAt = -10;
    createBurst(ballBody.position, 0xff6b6b);
  }
}

function resolveVisibleLanding() {
  const previousBottom = state.previousBallY - BALL_RADIUS;
  const currentBottom = ballBody.position.y - BALL_RADIUS;
  const movingDown = ballBody.velocity.y <= 1.2;
  const canBounce = state.elapsed - state.lastBounceAt > 0.14;

  if (!movingDown || !canBounce) {
    return;
  }

  let landing = null;
  for (const platform of platforms) {
    const top = platform.height / 2;
    const crossedTop = previousBottom >= top - 0.08 && currentBottom <= top + 0.14;
    const stillCatchable = ballBody.position.y >= top - 0.08 && currentBottom <= top;
    if (!crossedTop && !stillCatchable) {
      continue;
    }

    const withinX =
      Math.abs(ballBody.position.x - platform.x) <= platform.width / 2 + LANDING_EDGE_MARGIN;
    const withinZ =
      Math.abs(ballBody.position.z - platform.z) <= platform.depth / 2 + LANDING_EDGE_MARGIN;
    if (!withinX || !withinZ) {
      continue;
    }

    if (!landing || platform.z < landing.z) {
      landing = platform;
    }
  }

  if (!landing) {
    return;
  }

  const top = landing.height / 2;
  ballBody.position.y = top + BALL_RADIUS;
  const impact = THREE.MathUtils.clamp(Math.abs(ballBody.velocity.y) / 13, 0.36, 1);
  const lift = landing.kind === "boost" ? BOOST_BOUNCE : NORMAL_BOUNCE;
  ballBody.velocity.y = Math.max(ballBody.velocity.y, lift);
  state.lastImpact = impact;
  state.lastBounceAt = state.elapsed;
  state.lastGroundedAt = state.elapsed;
  ballVisual.squash = Math.max(ballVisual.squash, landing.kind === "boost" ? 1 : impact);
  createBurst(ballBody.position, landing.kind === "boost" ? 0x47e6cf : 0xffd166);
}

function syncBall() {
  ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
}

function updateBallVisual(delta) {
  syncBall();

  const horizontalSpeed = Math.hypot(ballBody.velocity.x, ballBody.velocity.z);
  if (horizontalSpeed > 0.03) {
    reusable.rollAxis.set(ballBody.velocity.z, 0, -ballBody.velocity.x).normalize();
    const grounded = state.elapsed - state.lastGroundedAt < 0.28;
    const rollAmount = (horizontalSpeed * delta) / BALL_RADIUS;
    reusable.rollStep.setFromAxisAngle(reusable.rollAxis, rollAmount * (grounded ? 1 : 0.42));
    ballVisual.roll.premultiply(reusable.rollStep).normalize();
  }

  ballVisual.squash = Math.max(0, ballVisual.squash - delta * 4.8);
  const impactSquash = ballVisual.squash * ballVisual.squash;
  const riseStretch = THREE.MathUtils.clamp(ballBody.velocity.y / BOOST_BOUNCE, 0, 1) * 0.1;
  const scaleY = THREE.MathUtils.clamp(1 - impactSquash * 0.28 + riseStretch, 0.72, 1.12);
  const scaleXZ = THREE.MathUtils.clamp(1 + impactSquash * 0.18 - riseStretch * 0.04, 0.96, 1.18);

  ballMesh.quaternion.copy(ballVisual.roll);
  ballMesh.scale.set(scaleXZ, scaleY, scaleXZ);

  const keepsContact = state.elapsed - state.lastGroundedAt < 0.16;
  if (keepsContact) {
    ballMesh.position.y += BALL_RADIUS * (scaleY - 1);
  }
}

function updateTrack() {
  while (ballBody.position.z < state.farthestZ + 115) {
    createNextSegment();
  }

  const cutoff = ballBody.position.z + 34;
  removeBehind(platforms, cutoff, (item) => {
    scene.remove(item.group);
    world.removeBody(item.body);
    disposeObject(item.group);
  });
  removeBehind(pickups, cutoff, (item) => {
    scene.remove(item.mesh);
    disposeObject(item.mesh);
  });
  removeBehind(hazards, cutoff, (item) => {
    scene.remove(item.group);
    disposeObject(item.group);
  });
}

function updatePickups(delta) {
  const ball = reusable.ballPosition.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
  for (const pickup of pickups) {
    if (pickup.collected) {
      continue;
    }
    pickup.mesh.rotation.z += delta * 2.25;
    pickup.mesh.position.y = pickup.baseY + Math.sin(state.elapsed * 3.2 + pickup.phase) * 0.12;
    if (pickup.mesh.position.distanceTo(ball) < 0.78) {
      pickup.collected = true;
      pickup.mesh.visible = false;
      state.rings += 1;
      createBurst(pickup.mesh.position, 0xffd166);
    }
  }
}

function updateHazards(delta) {
  const bx = ballBody.position.x;
  const by = ballBody.position.y;
  const bz = ballBody.position.z;

  for (const hazard of hazards) {
    const dx = bx - hazard.x;
    const dz = bz - hazard.z;
    const insideDangerZone =
      Math.abs(dx) <= hazard.width / 2 && Math.abs(dz) <= hazard.depth / 2;
    if (insideDangerZone && by < 1.35 && by > -0.3) {
      createBurst(ballBody.position, 0xff4668);
      endGame("hit");
      return;
    }
  }
}

function updateBursts(delta) {
  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    const burst = bursts[i];
    burst.life -= delta;
    const positions = burst.geometry.attributes.position;
    for (let j = 0; j < burst.velocities.length; j += 1) {
      positions.array[j * 3] += burst.velocities[j].x * delta;
      positions.array[j * 3 + 1] += burst.velocities[j].y * delta;
      positions.array[j * 3 + 2] += burst.velocities[j].z * delta;
      burst.velocities[j].y -= delta * 2.8;
    }
    positions.needsUpdate = true;
    burst.points.material.opacity = Math.max(0, burst.life / burst.maxLife);
    if (burst.life <= 0) {
      scene.remove(burst.points);
      burst.geometry.dispose();
      burst.points.material.dispose();
      bursts.splice(i, 1);
    }
  }
}

function updateTrail(delta) {
  if (Math.floor(state.elapsed * 28) % 3 === 0) {
    const dot = trail.reduce((oldest, current) => (current.life < oldest.life ? current : oldest), trail[0]);
    dot.mesh.position.copy(ballMesh.position);
    dot.mesh.position.y -= 0.12;
    dot.mesh.visible = true;
    dot.life = dot.maxLife;
  }

  for (const dot of trail) {
    if (dot.life <= 0) {
      dot.mesh.visible = false;
      continue;
    }
    dot.life -= delta;
    const t = Math.max(0, dot.life / dot.maxLife);
    dot.mesh.scale.setScalar(0.38 + t * 0.94);
    dot.mesh.material.opacity = t * 0.34;
  }
}

function idleMotion(seconds) {
  ballMesh.position.y = ballBody.position.y + Math.sin(seconds * 1.9) * 0.08;
  reusable.rollStep.setFromAxisAngle(reusable.rollAxis.set(0.8, 0, 0.45).normalize(), 0.012);
  ballVisual.roll.premultiply(reusable.rollStep).normalize();
  ballMesh.quaternion.copy(ballVisual.roll);
  ballMesh.scale.setScalar(1);
  updateBursts(1 / 60);
}

function updateCamera(delta) {
  const smooth = 1 - Math.pow(0.000001, delta);
  reusable.cameraTarget.set(
    ballMesh.position.x * 0.52,
    Math.max(4.2, ballMesh.position.y + 5.6),
    ballMesh.position.z + 10.7,
  );
  camera.position.lerp(reusable.cameraTarget, smooth);

  reusable.lookTarget.set(
    ballMesh.position.x * 0.34,
    Math.max(0.9, ballMesh.position.y + 0.5),
    ballMesh.position.z - 9.8,
  );
  camera.lookAt(reusable.lookTarget);
}

function createNextSegment() {
  const index = state.segmentIndex;
  let lane = state.currentLane;

  if (index > 4) {
    const roll = random();
    if (roll < 0.46) {
      lane += random() < 0.5 ? -1 : 1;
      lane = THREE.MathUtils.clamp(lane, -1, 1);
    }
  }

  state.currentLane = lane;
  const z = START_Z - index * SEGMENT_GAP;
  const x = lane * LANE_WIDTH;
  const kind = choosePlatformKind(index);
  const width = kind === "glass" ? 2.82 : 3.78;
  const depth = kind === "boost" ? 5.08 : 4.72;

  createPlatform(x, z, width, depth, kind, index);

  if (index > 2 && random() < 0.74) {
    createPickup(x + (random() - 0.5) * 1.2, z + (random() - 0.5) * 1.8);
  }

  if (index > 10 && kind !== "boost" && random() < 0.2) {
    createHazard(x + (random() - 0.5) * 1.05, z + (random() - 0.5) * 1.7);
  }

  state.segmentIndex += 1;
  state.farthestZ = Math.min(state.farthestZ, z);
}

function choosePlatformKind(index) {
  if (index < 6) {
    return "normal";
  }
  if (index % 11 === 0) {
    return "boost";
  }
  if (index > 18 && random() < 0.17) {
    return "glass";
  }
  return "normal";
}

function createPlatform(x, z, width, depth, kind, index) {
  const height = 0.34;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, materials[kind] || materials.normal);
  mesh.receiveShadow = true;
  mesh.castShadow = kind !== "glass";

  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), materials.edge);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(mesh);
  group.add(edge);

  if (kind === "boost") {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.72, depth * 0.52), materials.pad);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = height / 2 + 0.012;
    group.add(pad);

    for (let i = -1; i <= 1; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.36, 0.035, 0.11), materials.pad);
      bar.position.set(0, height / 2 + 0.055, i * 0.56);
      bar.rotation.y = Math.PI / 4;
      group.add(bar);
    }
  }

  scene.add(group);

  const body = new CANNON.Body({
    mass: 0,
    material: physicsMaterials.platform,
    shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)),
  });
  body.position.set(x, 0, z);
  body.collisionResponse = false;
  body.userData = {
    type: "platform",
    kind,
    height,
    index,
  };
  world.addBody(body);

  platforms.push({ group, body, x, z, width, depth, height, kind, index });
}

function createPickup(x, z) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 14, 36), materials.ring);
  mesh.position.set(x, 1.34, z);
  mesh.castShadow = true;
  scene.add(mesh);
  pickups.push({
    mesh,
    z,
    baseY: mesh.position.y,
    phase: random() * Math.PI * 2,
    collected: false,
  });
}

function createHazard(x, z) {
  const width = 1.12;
  const depth = 0.76;
  const group = new THREE.Group();
  group.position.set(x, 0.18, z);

  const zone = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), materials.dangerZone);
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.014;
  group.add(zone);

  for (let i = 0; i < 3; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.82, 4), materials.hazard);
    spike.position.set((i - 1) * 0.26, 0.41, (i % 2) * 0.18);
    spike.rotation.y = Math.PI / 4;
    spike.castShadow = true;
    group.add(spike);
  }

  scene.add(group);
  hazards.push({ group, x, z, width, depth });
}

function createBurst(origin, color) {
  const count = 24;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = origin.x;
    positions[i * 3 + 1] = origin.y;
    positions[i * 3 + 2] = origin.z;
    velocities.push(
      new THREE.Vector3(
        (random() - 0.5) * 4.8,
        random() * 3.8 + 0.9,
        (random() - 0.5) * 4.8,
      ),
    );
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.09,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  bursts.push({
    points,
    geometry,
    velocities,
    life: 0.55,
    maxLife: 0.55,
  });
}

function resetGame() {
  clearGeneratedObjects();
  state.seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0 || 1;
  state.currentLane = 0;
  state.segmentIndex = 0;
  state.farthestZ = START_Z;
  state.lastBounceAt = -10;
  state.lastGroundedAt = -10;
  state.boostQueuedAt = -10;
  state.lastImpact = 0;
  state.rings = 0;
  state.score = 0;
  state.distance = 0;
  state.speed = BASE_SPEED;
  ballVisual.roll.identity();
  ballVisual.squash = 0;

  ballBody.position.set(0, 1.62, START_Z + 0.4);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.quaternion.set(0, 0, 0, 1);
  ballBody.wakeUp();
  syncBall();
  ballMesh.quaternion.copy(ballVisual.roll);
  ballMesh.scale.setScalar(1);

  for (let i = 0; i < 42; i += 1) {
    createNextSegment();
  }

  camera.position.set(0, 7.4, 13.6);
  camera.lookAt(0, 1.5, -7);
  updateHud();
}

function clearGeneratedObjects() {
  for (const platform of platforms) {
    scene.remove(platform.group);
    world.removeBody(platform.body);
    disposeObject(platform.group);
  }
  platforms.length = 0;

  for (const pickup of pickups) {
    scene.remove(pickup.mesh);
    disposeObject(pickup.mesh);
  }
  pickups.length = 0;

  for (const hazard of hazards) {
    scene.remove(hazard.group);
    disposeObject(hazard.group);
  }
  hazards.length = 0;

  for (const burst of bursts) {
    scene.remove(burst.points);
    burst.geometry.dispose();
    burst.points.material.dispose();
  }
  bursts.length = 0;
}

function removeBehind(list, cutoff, remove) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].z > cutoff) {
      remove(list[i]);
      list.splice(i, 1);
    }
  }
}

function startGame() {
  if (state.mode === "paused") {
    setMode("playing");
    return;
  }
  resetGame();
  setMode("playing");
}

function togglePause() {
  if (state.mode === "playing") {
    setMode("paused");
  } else if (state.mode === "paused") {
    setMode("playing");
  }
}

function setMode(mode) {
  state.mode = mode;
  ui.pauseButton.disabled = mode === "ready" || mode === "gameover";
  ui.pauseButton.innerHTML = mode === "paused" ? '<span aria-hidden="true">&gt;</span>' : '<span aria-hidden="true">||</span>';
  ui.pauseButton.setAttribute("aria-label", mode === "paused" ? "resume" : "pause");
  ui.pauseButton.title = mode === "paused" ? "resume" : "pause";

  if (mode === "playing") {
    ui.overlay.classList.remove("open");
    return;
  }

  ui.overlay.classList.add("open");
  if (mode === "ready") {
    ui.overlayEyebrow.textContent = "3D ARCADE";
    ui.overlayTitle.textContent = "Sky Bounce";
    ui.overlayText.textContent = "앞뒤 속도를 조절하며 링을 노리세요.";
    ui.startButton.textContent = "플레이";
  }
  if (mode === "paused") {
    ui.overlayEyebrow.textContent = "PAUSED";
    ui.overlayTitle.textContent = "일시 정지";
    ui.overlayText.textContent = `점수 ${formatScore(state.score)} · 링 ${state.rings}`;
    ui.startButton.textContent = "계속";
  }
}

function endGame(reason) {
  if (state.mode !== "playing") {
    return;
  }

  state.best = Math.max(state.best, state.score);
  writeBestScore(state.best);
  updateHud();

  setMode("gameover");
  ui.overlayEyebrow.textContent = reason === "hit" ? "CRASH" : "FALL";
  ui.overlayTitle.textContent = reason === "hit" ? "충돌" : "낙하";
  ui.overlayText.textContent = `점수 ${formatScore(state.score)} · 링 ${state.rings}`;
  ui.startButton.textContent = "다시";
}

function updateHud() {
  state.score = Math.floor(state.distance * 12 + state.rings * 125);
  const displaySpeed = Math.abs(state.speed) < 0.5 ? 0 : Math.round(state.speed);
  ui.score.textContent = formatScore(state.score);
  ui.best.textContent = formatScore(Math.max(state.best, state.score));
  ui.rings.textContent = String(state.rings);
  ui.speed.textContent = `${displaySpeed}`;
}

function queueBoost() {
  state.boostQueuedAt = state.elapsed;
}

function random() {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function formatScore(value) {
  return Math.max(0, Math.floor(value)).toString().padStart(6, "0");
}

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem("sky-bounce-best") || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    localStorage.setItem("sky-bounce-best", String(value));
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
}

function makeBallTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, "#fff1a8");
  gradient.addColorStop(0.42, "#ff6b6b");
  gradient.addColorStop(1, "#47e6cf");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "rgba(17, 21, 32, 0.42)";
  ctx.lineWidth = 18;
  for (let y = -256; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(64, y + 36, 192, y - 36, 256, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(92, 78, 44, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePanelTexture(base, line, accent) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = line;
  ctx.lineWidth = 4;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.78;
  ctx.fillRect(18, 18, 62, 8);
  ctx.fillRect(176, 230, 62, 8);
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.25, 1.25);
  return texture;
}

function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
