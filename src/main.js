import * as THREE from "../vendor/three.module.js";
import * as CANNON from "../vendor/cannon-es.js";

const canvas = document.querySelector("#scene");
const ui = {
  score: document.querySelector("#score"),
  best: document.querySelector("#best"),
  rings: document.querySelector("#rings"),
  speed: document.querySelector("#speed"),
  dimensionBanner: document.querySelector("#dimensionBanner"),
  countdown: document.querySelector("#countdown"),
  countdownNumber: document.querySelector("#countdownNumber"),
  overlay: document.querySelector("#overlay"),
  overlayEyebrow: document.querySelector("#overlayEyebrow"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  endButton: document.querySelector("#endButton"),
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
const SHIFT_DURATION = 18;
const SHIFT_PLANE_DEPTH = 0.78;
const SHIFT_MOVE_SPEED = 5.55;
const SHIFT_AIR_CONTROL = 0.48;
const SHIFT_BOUNCE = 9.15;
const SHIFT_POWER_BOUNCE = 14.45;
const SHIFT_PAD_BOUNCE = 16.2;
const SHIFT_REENTRY_IGNORE = 0.14;
const SHIFT_FAILURE_BEHAVIOR = "return";

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
  countdownToken: 0,
  elapsed: 0,
  score: 0,
  best: readBestScore(),
  rings: 0,
  shiftCoins: 0,
  shiftBonus: 0,
  multiplier: 1,
  multiplierEndsAt: 0,
  dimension: "3d",
  shiftEndsAt: 0,
  shiftEntryZ: 0,
  shiftPlaneZ: 0,
  shiftResumeZ: 0,
  shiftFinishX: 0,
  shiftCooldownUntil: 0,
  ignoreLandingUntil: 0,
  nextSegmentZ: START_Z,
  cameraSnapUntil: 0,
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
const shiftOrbs = [];
const hazards = [];
const shiftPlatforms = [];
const shiftCoins = [];
const shiftHazards = [];
const shiftGates = [];
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
  shiftOrb: new THREE.MeshStandardMaterial({
    color: 0x9b8cff,
    emissive: 0x573cff,
    emissiveIntensity: 1.12,
    roughness: 0.18,
    metalness: 0.42,
  }),
  shiftPlatform: new THREE.MeshStandardMaterial({
    color: 0x1c2b48,
    emissive: 0x111b3a,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    metalness: 0.18,
  }),
  shiftCoin: new THREE.MeshStandardMaterial({
    color: 0x47e6cf,
    emissive: 0x18d6ce,
    emissiveIntensity: 1,
    roughness: 0.26,
    metalness: 0.48,
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

const shiftRoot = new THREE.Group();
shiftRoot.visible = false;
scene.add(shiftRoot);

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
  ui.endButton.addEventListener("click", endCurrentGame);

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
  if (state.multiplier > 1 && state.elapsed > state.multiplierEndsAt) {
    state.multiplier = 1;
  }

  if (state.dimension === "shift2d") {
    updateShiftMode(delta);
  } else {
    updateRunMode(delta);
  }

  updateBallVisual(delta);
  updateBursts(delta);
  updateTrail(delta);
  updateHud();
}

function updateRunMode(delta) {
  state.previousBallY = ballBody.position.y;
  handleControls(delta);
  world.step(1 / 60, delta, 3);
  if (state.elapsed >= state.ignoreLandingUntil) {
    resolveVisibleLanding();
  }
  updateTrack();
  updatePickups(delta);
  updateShiftOrbs(delta);
  updateHazards(delta);

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

function updateShiftMode(delta) {
  state.previousBallY = ballBody.position.y;
  updateShiftPlatforms(delta);
  handleShiftControls(delta);
  world.step(1 / 60, delta, 3);
  ballBody.position.z = state.shiftPlaneZ;
  ballBody.velocity.z = 0;
  if (state.elapsed >= state.ignoreLandingUntil) {
    resolveShiftLanding();
  }
  updateShiftCoins(delta);
  updateShiftHazards(delta);
  updateShiftGates(delta);

  if (state.dimension !== "shift2d") {
    return;
  }

  if (ballBody.position.y < -7.4) {
    exitShiftMode("fall");
    return;
  }

  if (state.elapsed >= state.shiftEndsAt) {
    exitShiftMode("timeout");
  }
}

function handleShiftControls(delta) {
  const steer = Number(input.right) - Number(input.left);
  const thrust = Number(input.forward) - Number(input.back);
  const horizontal = THREE.MathUtils.clamp(steer + thrust * 0.72, -1, 1);
  const groundedRecently = state.elapsed - state.lastGroundedAt < 0.18;
  const control = groundedRecently ? 1 : SHIFT_AIR_CONTROL;
  const targetX = horizontal * SHIFT_MOVE_SPEED;
  const blend = 1 - Math.pow(groundedRecently ? 0.00002 : 0.015, delta * control);
  ballBody.velocity.x += (targetX - ballBody.velocity.x) * blend;

  if (horizontal === 0 && groundedRecently) {
    ballBody.velocity.x *= Math.pow(0.001, delta);
  }

  ballBody.velocity.z = 0;
  state.speed = ballBody.velocity.x;
}

function resolveShiftLanding() {
  const previousBottom = state.previousBallY - BALL_RADIUS;
  const currentBottom = ballBody.position.y - BALL_RADIUS;
  const movingDown = ballBody.velocity.y <= 1.2;
  const canBounce = state.elapsed - state.lastBounceAt > 0.13;

  if (!movingDown || !canBounce) {
    return;
  }

  let landing = null;
  for (const platform of shiftPlatforms) {
    if (!platform.active || platform.vanished) {
      continue;
    }

    const top = platform.y + platform.height / 2;
    const crossedTop = previousBottom >= top - 0.08 && currentBottom <= top + 0.14;
    const stillCatchable = ballBody.position.y >= top - 0.08 && currentBottom <= top;
    const withinX =
      Math.abs(ballBody.position.x - platform.x) <= platform.width / 2 + LANDING_EDGE_MARGIN;

    if ((crossedTop || stillCatchable) && withinX) {
      landing = platform;
      break;
    }
  }

  if (!landing) {
    return;
  }

  const top = landing.y + landing.height / 2;
  ballBody.position.y = top + BALL_RADIUS + 0.01;
  const powerBounce = state.elapsed - state.boostQueuedAt < 0.28;
  const lift = landing.kind === "jump" ? SHIFT_PAD_BOUNCE : powerBounce ? SHIFT_POWER_BOUNCE : SHIFT_BOUNCE;
  ballBody.velocity.y = Math.max(ballBody.velocity.y, lift);
  ballBody.velocity.x += landing.velocityX || 0;
  state.lastBounceAt = state.elapsed;
  state.lastGroundedAt = state.elapsed;
  state.boostQueuedAt = -10;
  ballVisual.squash = Math.max(ballVisual.squash, landing.kind === "jump" || powerBounce ? 0.95 : 0.62);
  createBurst(ballBody.position, landing.kind === "jump" || powerBounce ? 0x47e6cf : 0x9b8cff);
}

function updateShiftCoins(delta) {
  const ball = reusable.ballPosition.set(ballBody.position.x, ballBody.position.y, state.shiftPlaneZ);
  for (const coin of shiftCoins) {
    if (coin.collected) {
      continue;
    }
    coin.mesh.rotation.z += delta * 3.3;
    coin.mesh.position.y = coin.baseY + Math.sin(state.elapsed * 4.2 + coin.phase) * 0.08;
    if (coin.mesh.position.distanceTo(ball) < 0.72) {
      coin.collected = true;
      coin.mesh.visible = false;
      state.shiftCoins += 1;
      state.shiftBonus += 85 * state.multiplier;
      createBurst(coin.mesh.position, 0x47e6cf);
    }
  }
}

function updateShiftPlatforms(delta) {
  for (const platform of shiftPlatforms) {
    platform.velocityX = 0;
    platform.velocityY = 0;

    if (platform.moveAmplitude) {
      const previousX = platform.x;
      const previousY = platform.y;
      const wave = Math.sin(state.elapsed * platform.moveSpeed + platform.movePhase);
      platform.x = platform.baseX + wave * platform.moveAmplitude;
      platform.y = platform.baseY + Math.cos(state.elapsed * platform.moveSpeed + platform.movePhase) * platform.moveLift;
      platform.velocityX = (platform.x - previousX) / Math.max(delta, 1 / 120);
      platform.velocityY = (platform.y - previousY) / Math.max(delta, 1 / 120);
    }

    if (platform.vanishInterval) {
      const cycle = (state.elapsed + platform.vanishOffset) % platform.vanishInterval;
      platform.vanished = cycle > platform.vanishInterval * 0.64;
    }

    platform.active = !platform.vanished;
    platform.group.visible = platform.active;
    platform.group.position.set(platform.x, platform.y, platform.z);
    if (platform.body) {
      platform.body.position.set(platform.x, platform.y, platform.z);
      setBodyCollisionEnabled(platform.body, platform.active);
    }
  }
}

function updateShiftHazards(delta) {
  for (const hazard of shiftHazards) {
    hazard.group.rotation.z += delta * 1.5;
    const hit =
      Math.abs(ballBody.position.x - hazard.x) <= hazard.width / 2 &&
      Math.abs(ballBody.position.y - hazard.y) <= hazard.height / 2;
    if (hit) {
      createBurst(ballBody.position, 0xff4668);
      exitShiftMode("hit");
      break;
    }
  }
}

function updateShiftGates(delta) {
  const ball = reusable.ballPosition.set(ballBody.position.x, ballBody.position.y, state.shiftPlaneZ);
  for (const gate of shiftGates) {
    gate.group.rotation.z += delta * 1.3;
    const inside =
      Math.abs(ball.x - gate.x) <= gate.width / 2 &&
      Math.abs(ball.y - gate.y) <= gate.height / 2;
    if (inside) {
      exitShiftMode("complete");
      return;
    }
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
    if (!platform.group.visible) {
      continue;
    }

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
    removeBodyIfPresent(item.body);
    disposeObject(item.group);
  });
  removeBehind(pickups, cutoff, (item) => {
    scene.remove(item.mesh);
    disposeObject(item.mesh);
  });
  removeBehind(shiftOrbs, cutoff, (item) => {
    scene.remove(item.group);
    disposeObject(item.group);
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

function updateShiftOrbs(delta) {
  if (state.elapsed < state.shiftCooldownUntil) {
    return;
  }

  const ball = reusable.ballPosition.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
  for (const orb of shiftOrbs) {
    if (orb.collected) {
      continue;
    }
    orb.group.rotation.y += delta * 1.8;
    orb.group.rotation.z -= delta * 0.72;
    orb.group.position.y = orb.baseY + Math.sin(state.elapsed * 3.5 + orb.phase) * 0.16;
    const dx = Math.abs(orb.group.position.x - ball.x);
    const dy = Math.abs(orb.group.position.y - ball.y);
    const dz = Math.abs(orb.group.position.z - ball.z);
    if (dx < 1.08 && dz < 1.18 && dy < 1.8) {
      orb.collected = true;
      orb.group.visible = false;
      enterShiftMode(orb.group.position);
      break;
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
  const smooth = state.elapsed < state.cameraSnapUntil ? 1 : 1 - Math.pow(0.000001, delta);
  if (state.dimension === "shift2d") {
    reusable.cameraTarget.set(
      ballMesh.position.x + 3.1,
      Math.max(3.4, ballMesh.position.y + 2.2),
      state.shiftPlaneZ + 16.5,
    );
    camera.position.lerp(reusable.cameraTarget, smooth);

    reusable.lookTarget.set(
      ballMesh.position.x + 3.5,
      Math.max(1.25, ballMesh.position.y + 0.45),
      state.shiftPlaneZ,
    );
    camera.lookAt(reusable.lookTarget);
    return;
  }

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
  const z = state.nextSegmentZ;
  const x = lane * LANE_WIDTH;
  const kind = choosePlatformKind(index);
  const width = kind === "glass" ? 2.82 : 3.78;
  const depth = kind === "boost" ? 5.08 : 4.72;

  createPlatform(x, z, width, depth, kind, index);

  if (index === 2 || index === 5 || (index > 8 && index % 15 === 9)) {
    createShiftOrb(x, z - 0.35);
  }

  if (index > 2 && random() < 0.74) {
    createPickup(x + (random() - 0.5) * 1.2, z + (random() - 0.5) * 1.8);
  }

  if (index > 10 && kind !== "boost" && random() < 0.2) {
    createHazard(x + (random() - 0.5) * 1.05, z + (random() - 0.5) * 1.7);
  }

  state.segmentIndex += 1;
  state.nextSegmentZ = z - SEGMENT_GAP;
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

  const platform = { group, body, x, z, width, depth, height, kind, index };
  platforms.push(platform);
  return platform;
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

function createShiftOrb(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 1.24, z);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), materials.shiftOrb);
  core.castShadow = true;
  group.add(core);

  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 12, 42), materials.shiftCoin);
  ringA.rotation.x = Math.PI / 2;
  group.add(ringA);

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.025, 12, 42), materials.shiftOrb);
  ringB.rotation.y = Math.PI / 2;
  group.add(ringB);

  scene.add(group);
  shiftOrbs.push({
    group,
    x,
    z,
    baseY: group.position.y,
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

function enterShiftMode(origin) {
  if (state.dimension !== "3d") {
    return;
  }

  state.shiftCoins = 0;
  state.shiftEntryZ = ballBody.position.z;
  state.shiftPlaneZ = ballBody.position.z;
  state.shiftEndsAt = state.elapsed + SHIFT_DURATION;
  state.shiftFinishX = 36.4;
  state.ignoreLandingUntil = state.elapsed + 0.12;

  setTrackVisible(false);
  clearShiftStage();
  createShiftStage();
  shiftRoot.visible = true;
  state.dimension = "shift2d";

  ballBody.position.set(-7.8, 2.7, state.shiftPlaneZ);
  ballBody.previousPosition.copy(ballBody.position);
  ballBody.interpolatedPosition.copy(ballBody.position);
  ballBody.velocity.set(0, 5.8, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  state.previousBallY = ballBody.position.y;
  state.lastBounceAt = state.elapsed;
  state.lastGroundedAt = state.elapsed - 1;
  state.boostQueuedAt = -10;
  ballVisual.squash = 0.9;
  createBurst(origin, 0x9b8cff);
}

function exitShiftMode(reason) {
  if (state.dimension !== "shift2d") {
    return;
  }

  const success = reason === "complete";
  const failed = !success;
  if (failed && SHIFT_FAILURE_BEHAVIOR === "gameover") {
    shiftRoot.visible = false;
    clearShiftStage();
    setTrackVisible(true);
    state.dimension = "3d";
    endGame(reason === "hit" ? "hit" : "fall");
    return;
  }

  const advance = success ? 42 : 24;
  const bonus = success ? 420 + state.shiftCoins * 110 : 0;
  state.shiftBonus += bonus;
  state.multiplier = success ? 2 : 1;
  state.multiplierEndsAt = success ? state.elapsed + 9 : 0;
  state.shiftResumeZ = state.shiftEntryZ - advance;
  state.shiftCooldownUntil = state.elapsed + 4.5;
  state.currentLane = 0;

  shiftRoot.visible = false;
  clearShiftStage();
  const reentry = createReentryRunway(state.shiftResumeZ);
  setTrackVisible(true);
  state.dimension = "3d";

  const reentryX = reentry ? reentry.x : 0;
  const reentryZ = reentry ? reentry.spawnZ || reentry.z : state.shiftResumeZ;
  const reentryTop = reentry ? reentry.height / 2 : 0.17;
  state.currentLane = reentry ? Math.round(reentry.x / LANE_WIDTH) : 0;
  const safeY = reentryTop + BALL_RADIUS + 0.08;

  ballBody.position.set(reentryX, safeY, reentryZ);
  ballBody.previousPosition.copy(ballBody.position);
  ballBody.interpolatedPosition.copy(ballBody.position);
  ballBody.initPosition.copy(ballBody.position);
  ballBody.velocity.set(0, success ? 8.8 : 6.2, -Math.max(BASE_SPEED, Math.abs(state.speed), success ? 9.2 : 0));
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.quaternion.set(0, 0, 0, 1);
  ballBody.wakeUp();
  state.previousBallY = safeY;
  state.ignoreLandingUntil = state.elapsed + SHIFT_REENTRY_IGNORE;
  state.lastBounceAt = state.elapsed + SHIFT_REENTRY_IGNORE;
  state.lastGroundedAt = state.elapsed - 1;
  state.boostQueuedAt = -10;
  state.cameraSnapUntil = state.elapsed + 0.18;
  ballVisual.squash = success ? 0.85 : 0.35;
  syncBall();
  snapCameraToBall();
  createBurst(ballBody.position, success ? 0x47e6cf : 0xff6b6b);
  updateTrack();
}

function createReentryRunway(centerZ) {
  const count = 3;
  clearReentryCorridor(centerZ, count);

  const depth = count * SEGMENT_GAP + 1.6;
  const z = centerZ - ((count - 1) * SEGMENT_GAP) / 2;
  const platform = createPlatform(0, z, 4.5, depth, "normal", 9000);
  platform.spawnZ = centerZ + 0.95;
  platform.frontZ = z + depth / 2;
  platform.tailZ = z - depth / 2;
  state.nextSegmentZ = Math.min(state.nextSegmentZ, platform.tailZ - SEGMENT_GAP * 0.72);
  state.farthestZ = Math.min(state.farthestZ, platform.tailZ);
  return platform;
}

function clearReentryCorridor(centerZ, count) {
  const maxZ = centerZ + SEGMENT_GAP * 1.1;
  const minZ = centerZ - count * SEGMENT_GAP - SEGMENT_GAP * 0.9;

  removeOverlappingZ(platforms, minZ, maxZ, (item) => ({
    min: item.z - item.depth / 2,
    max: item.z + item.depth / 2,
  }), (item) => {
    scene.remove(item.group);
    removeBodyIfPresent(item.body);
    disposeObject(item.group);
  });
  removeInZRange(pickups, minZ, maxZ, (item) => {
    scene.remove(item.mesh);
    disposeObject(item.mesh);
  });
  removeInZRange(shiftOrbs, minZ, maxZ, (item) => {
    scene.remove(item.group);
    disposeObject(item.group);
  });
  removeInZRange(hazards, minZ, maxZ, (item) => {
    scene.remove(item.group);
    disposeObject(item.group);
  });
}

function createShiftStage() {
  const z = state.shiftPlaneZ;
  const profile = Math.floor(random() * 3);
  const layouts = [
    [
      { x: -8.1, y: 0, width: 5.9, kind: "normal" },
      { x: -2.7, y: 0.88, width: 3.4, kind: "normal" },
      { x: 1.85, y: 1.92, width: 2.85, kind: "jump" },
      { x: 6.2, y: 1.18, width: 3.05, kind: "moving", moveAmplitude: 1.35, moveLift: 0.18, moveSpeed: 1.1 },
      { x: 10.9, y: 2.5, width: 2.75, kind: "vanish", vanishInterval: 3.2 },
      { x: 15.2, y: 1.16, width: 3.35, kind: "normal" },
      { x: 19.25, y: 2.58, width: 2.8, kind: "jump" },
      { x: 23.85, y: 1.7, width: 3.25, kind: "moving", moveAmplitude: 1.15, moveLift: 0.32, moveSpeed: 1.35 },
      { x: 28.4, y: 2.82, width: 2.6, kind: "vanish", vanishInterval: 2.8 },
      { x: 33.15, y: 1.25, width: 4.6, kind: "normal" },
    ],
    [
      { x: -8.1, y: 0, width: 5.9, kind: "normal" },
      { x: -3.1, y: 1.24, width: 3.0, kind: "jump" },
      { x: 1.3, y: 0.54, width: 3.45, kind: "moving", moveAmplitude: 1.2, moveLift: 0.2, moveSpeed: 1.2 },
      { x: 5.6, y: 1.75, width: 2.85, kind: "normal" },
      { x: 9.8, y: 2.85, width: 2.65, kind: "vanish", vanishInterval: 3.0 },
      { x: 14.35, y: 1.58, width: 3.1, kind: "moving", moveAmplitude: 1.35, moveLift: 0.24, moveSpeed: 1.4 },
      { x: 18.6, y: 2.7, width: 2.65, kind: "jump" },
      { x: 23.1, y: 1.42, width: 3.0, kind: "vanish", vanishInterval: 2.9 },
      { x: 27.6, y: 2.5, width: 2.9, kind: "moving", moveAmplitude: 1.05, moveLift: 0.28, moveSpeed: 1.1 },
      { x: 32.55, y: 1.15, width: 4.4, kind: "normal" },
    ],
    [
      { x: -8.1, y: 0, width: 5.9, kind: "normal" },
      { x: -2.35, y: 0.55, width: 2.95, kind: "moving", moveAmplitude: 1.15, moveLift: 0.18, moveSpeed: 1.3 },
      { x: 2.15, y: 1.74, width: 2.7, kind: "vanish", vanishInterval: 3.25 },
      { x: 6.5, y: 0.85, width: 3.1, kind: "jump" },
      { x: 10.8, y: 2.05, width: 2.85, kind: "moving", moveAmplitude: 1.25, moveLift: 0.34, moveSpeed: 1.25 },
      { x: 15.4, y: 2.94, width: 2.55, kind: "normal" },
      { x: 19.7, y: 1.7, width: 2.9, kind: "vanish", vanishInterval: 2.85 },
      { x: 24.35, y: 2.75, width: 2.7, kind: "jump" },
      { x: 28.8, y: 1.55, width: 3.15, kind: "moving", moveAmplitude: 1.2, moveLift: 0.22, moveSpeed: 1.45 },
      { x: 33.35, y: 2.35, width: 4.25, kind: "normal" },
    ],
  ][profile];

  const layout = layouts.map((item, index) => ({
    ...item,
    x: index === 0 ? item.x : item.x + (random() - 0.5) * 0.58,
    y: index === 0 ? item.y : THREE.MathUtils.clamp(item.y + (random() - 0.5) * 0.42, 0.45, 3.05),
    width: THREE.MathUtils.clamp(item.width + (random() - 0.5) * 0.34, 2.45, 6.05),
    moveAmplitude: item.moveAmplitude ? item.moveAmplitude + (random() - 0.5) * 0.36 : 0,
    moveLift: item.moveLift ? item.moveLift + (random() - 0.5) * 0.1 : 0,
    moveSpeed: item.moveSpeed ? item.moveSpeed + (random() - 0.5) * 0.28 : 1,
    movePhase: random() * Math.PI * 2,
    vanishInterval: item.vanishInterval ? item.vanishInterval + (random() - 0.5) * 0.42 : 0,
    vanishOffset: random() * 2.1,
  }));

  for (const item of layout) {
    createShiftPlatform(item.x, item.y, z, item.width, item.kind, item);
    if (random() < 0.86 || item.kind === "jump") {
      createShiftCoin(item.x + (random() - 0.5) * Math.max(0.3, item.width * 0.35), item.y + 1.05 + random() * 0.42, z);
    }
  }

  const bonusCoinCount = 3 + Math.floor(random() * 3);
  for (let i = 0; i < bonusCoinCount; i += 1) {
    const anchor = layout[2 + Math.floor(random() * (layout.length - 4))];
    createShiftCoin(anchor.x + (random() - 0.5) * 1.4, anchor.y + 1.72 + random() * 0.9, z);
  }

  const hazardSlots = [
    { x: layout[3].x + 1.8, y: layout[3].y - 0.52 },
    { x: layout[5].x + 1.65, y: layout[5].y - 0.38 },
    { x: layout[7].x + 1.7, y: layout[7].y - 0.36 },
    { x: layout[8].x + 1.95, y: layout[8].y - 0.48 },
  ].sort(() => random() - 0.5);
  const hazardCount = 2 + Math.floor(random() * 2);
  for (let i = 0; i < hazardCount; i += 1) {
    const hazard = hazardSlots[i];
    createShiftHazard(hazard.x + (random() - 0.5) * 0.42, THREE.MathUtils.clamp(hazard.y, 0.24, 2.25), z);
  }

  const lastPlatform = layout[layout.length - 1];
  state.shiftFinishX = lastPlatform.x + lastPlatform.width / 2 + 2.0 + random() * 1.2;
  createShiftGate(state.shiftFinishX, lastPlatform.y + 1.12, z);
}

function createShiftPlatform(x, y, z, width, kind, options = {}) {
  const height = 0.32;
  const geometry = new THREE.BoxGeometry(width, height, SHIFT_PLANE_DEPTH);
  const platformMaterial = kind === "jump" ? materials.boost : kind === "vanish" ? materials.glass : materials.shiftPlatform;
  const mesh = new THREE.Mesh(geometry, platformMaterial);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), materials.edge);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.add(mesh);
  group.add(edge);

  if (kind === "jump") {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.64, SHIFT_PLANE_DEPTH * 0.72), materials.pad);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = height / 2 + 0.012;
    group.add(pad);
  }

  shiftRoot.add(group);

  const body = new CANNON.Body({
    mass: 0,
    material: physicsMaterials.platform,
    shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, SHIFT_PLANE_DEPTH / 2)),
  });
  body.position.set(x, y, z);
  body.collisionResponse = false;
  body.userData = {
    type: "shiftPlatform",
    kind,
    height,
  };
  world.addBody(body);

  shiftPlatforms.push({
    group,
    mesh,
    edge,
    body,
    x,
    y,
    z,
    baseX: x,
    baseY: y,
    width,
    height,
    kind,
    active: true,
    vanished: false,
    velocityX: 0,
    velocityY: 0,
    moveAmplitude: options.moveAmplitude || 0,
    moveLift: options.moveLift || 0,
    moveSpeed: options.moveSpeed || 1,
    movePhase: options.movePhase || random() * Math.PI * 2,
    vanishInterval: options.vanishInterval || 0,
    vanishOffset: options.vanishOffset || 0,
  });
}

function createShiftCoin(x, y, z) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.052, 12, 32), materials.shiftCoin);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  shiftRoot.add(mesh);
  shiftCoins.push({
    mesh,
    x,
    y,
    z,
    baseY: y,
    phase: random() * Math.PI * 2,
    collected: false,
  });
}

function createShiftHazard(x, y, z) {
  const width = 0.54;
  const height = 0.58;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, 0.12), materials.dangerZone);
  base.position.y = -height * 0.48;
  group.add(base);

  for (let i = 0; i < 3; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.62, 4), materials.hazard);
    spike.position.x = (i - 1) * 0.24;
    spike.rotation.z = Math.PI;
    spike.castShadow = true;
    group.add(spike);
  }

  shiftRoot.add(group);
  shiftHazards.push({ group, x, y, z, width, height });
}

function createShiftGate(x, y, z) {
  const gate = new THREE.Group();
  gate.position.set(x, y, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.065, 16, 48), materials.shiftOrb);
  gate.add(ring);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), materials.shiftCoin);
  gate.add(core);
  shiftRoot.add(gate);
  shiftGates.push({ group: gate, x, y, z, width: 1.65, height: 2.2 });
}

function clearShiftStage() {
  for (const platform of shiftPlatforms) {
    shiftRoot.remove(platform.group);
    removeBodyIfPresent(platform.body);
    disposeObject(platform.group);
  }
  shiftPlatforms.length = 0;

  for (const coin of shiftCoins) {
    shiftRoot.remove(coin.mesh);
    coin.mesh.geometry.dispose();
  }
  shiftCoins.length = 0;

  for (const hazard of shiftHazards) {
    shiftRoot.remove(hazard.group);
    disposeObject(hazard.group);
  }
  shiftHazards.length = 0;

  for (const gate of shiftGates) {
    shiftRoot.remove(gate.group);
    disposeObject(gate.group);
  }
  shiftGates.length = 0;

  for (const child of [...shiftRoot.children]) {
    shiftRoot.remove(child);
    disposeObject(child);
  }
}

function setTrackVisible(visible) {
  for (const platform of platforms) {
    platform.group.visible = visible;
    setBodyCollisionEnabled(platform.body, visible);
  }
  for (const pickup of pickups) {
    pickup.mesh.visible = visible && !pickup.collected;
  }
  for (const orb of shiftOrbs) {
    orb.group.visible = visible && !orb.collected;
  }
  for (const hazard of hazards) {
    hazard.group.visible = visible;
  }
}

function setBodyCollisionEnabled(body, enabled) {
  if (!body) {
    return;
  }

  if (body.savedCollisionFilterMask === undefined) {
    body.savedCollisionFilterMask = body.collisionFilterMask;
    body.savedCollisionFilterGroup = body.collisionFilterGroup;
    body.savedCollisionResponse = body.collisionResponse;
  }

  if (enabled) {
    body.collisionFilterMask = body.savedCollisionFilterMask;
    body.collisionFilterGroup = body.savedCollisionFilterGroup;
    body.collisionResponse = body.savedCollisionResponse;
    body.wakeUp();
    return;
  }

  body.collisionFilterMask = 0;
  body.collisionFilterGroup = 0;
  body.collisionResponse = false;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.sleep();
}

function removeBodyIfPresent(body) {
  if (body && world.bodies.includes(body)) {
    world.removeBody(body);
  }
}

function snapCameraToBall() {
  reusable.cameraTarget.set(
    ballMesh.position.x * 0.52,
    Math.max(4.2, ballMesh.position.y + 5.6),
    ballMesh.position.z + 10.7,
  );
  camera.position.copy(reusable.cameraTarget);
  reusable.lookTarget.set(
    ballMesh.position.x * 0.34,
    Math.max(0.9, ballMesh.position.y + 0.5),
    ballMesh.position.z - 9.8,
  );
  camera.lookAt(reusable.lookTarget);
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
  state.dimension = "3d";
  state.shiftCoins = 0;
  state.shiftBonus = 0;
  state.multiplier = 1;
  state.multiplierEndsAt = 0;
  state.shiftEndsAt = 0;
  state.shiftEntryZ = 0;
  state.shiftPlaneZ = 0;
  state.shiftResumeZ = 0;
  state.shiftFinishX = 0;
  state.shiftCooldownUntil = 0;
  state.ignoreLandingUntil = 0;
  state.nextSegmentZ = START_Z;
  state.cameraSnapUntil = 0;
  state.rings = 0;
  state.score = 0;
  state.distance = 0;
  state.speed = BASE_SPEED;
  ballVisual.roll.identity();
  ballVisual.squash = 0;

  ballBody.position.set(0, 1.62, START_Z + 0.4);
  ballBody.previousPosition.copy(ballBody.position);
  ballBody.interpolatedPosition.copy(ballBody.position);
  ballBody.initPosition.copy(ballBody.position);
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
    removeBodyIfPresent(platform.body);
    disposeObject(platform.group);
  }
  platforms.length = 0;

  for (const pickup of pickups) {
    scene.remove(pickup.mesh);
    disposeObject(pickup.mesh);
  }
  pickups.length = 0;

  for (const orb of shiftOrbs) {
    scene.remove(orb.group);
    disposeObject(orb.group);
  }
  shiftOrbs.length = 0;

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
  clearShiftStage();
  shiftRoot.visible = false;
}

function removeBehind(list, cutoff, remove) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].z > cutoff) {
      remove(list[i]);
      list.splice(i, 1);
    }
  }
}

function removeInZRange(list, minZ, maxZ, remove) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].z >= minZ && list[i].z <= maxZ) {
      remove(list[i]);
      list.splice(i, 1);
    }
  }
}

function removeOverlappingZ(list, minZ, maxZ, getBounds, remove) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const bounds = getBounds(list[i]);
    if (bounds.min <= maxZ && bounds.max >= minZ) {
      remove(list[i]);
      list.splice(i, 1);
    }
  }
}

async function startGame() {
  if (state.mode === "paused") {
    setMode("playing");
    return;
  }

  if (state.mode === "playing" || state.mode === "countdown") {
    return;
  }

  const token = state.countdownToken + 1;
  state.countdownToken = token;
  resetGame();

  setMode("countdown");
  await runStartCountdown(token);

  if (state.countdownToken !== token || state.mode !== "countdown") {
    return;
  }

  setMode("playing");
}

function togglePause() {
  if (state.mode === "playing") {
    setMode("paused");
  } else if (state.mode === "paused") {
    setMode("playing");
  }
}

function endCurrentGame() {
  if (!["playing", "paused", "countdown"].includes(state.mode)) {
    return;
  }

  state.countdownToken += 1;
  endGame("quit", true);
}

function setMode(mode) {
  state.mode = mode;
  ui.pauseButton.disabled = mode === "ready" || mode === "gameover" || mode === "countdown";
  ui.endButton.disabled = mode === "ready" || mode === "gameover";
  ui.pauseButton.innerHTML = mode === "paused" ? '<span aria-hidden="true">&gt;</span>' : '<span aria-hidden="true">||</span>';
  ui.pauseButton.setAttribute("aria-label", mode === "paused" ? "resume" : "pause");
  ui.pauseButton.title = mode === "paused" ? "resume" : "pause";

  if (mode !== "countdown") {
    hideCountdown();
  }

  if (mode === "playing" || mode === "countdown") {
    ui.overlay.classList.remove("open");
    return;
  }

  ui.overlay.classList.add("open");
  if (mode === "ready") {
    ui.overlayEyebrow.textContent = "3D ARCADE";
    ui.overlayTitle.textContent = "Sky Bounce";
    ui.overlayText.textContent = "\uc55e\ub4a4 \uc18d\ub3c4\ub97c \uc870\uc808\ud558\uba70 \ub9c1\uc744 \ub178\ub9ac\uc138\uc694.";
    ui.startButton.textContent = "\ud50c\ub808\uc774";
  }
  if (mode === "paused") {
    ui.overlayEyebrow.textContent = "PAUSED";
    ui.overlayTitle.textContent = "\uc77c\uc2dc \uc815\uc9c0";
    ui.overlayText.textContent = `\uc810\uc218 ${formatScore(state.score)} \u00b7 \ub9c1 ${state.rings}`;
    ui.startButton.textContent = "\uacc4\uc18d";
  }
}

async function runStartCountdown(token) {
  ui.countdown.classList.add("open");

  for (const label of ["3", "2", "1"]) {
    if (state.countdownToken !== token || state.mode !== "countdown") {
      return;
    }

    ui.countdownNumber.textContent = label;
    ui.countdownNumber.classList.remove("tick");
    void ui.countdownNumber.offsetWidth;
    ui.countdownNumber.classList.add("tick");
    await wait(720);
  }
}

function hideCountdown() {
  ui.countdown.classList.remove("open");
  ui.countdownNumber.classList.remove("tick");
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function endGame(reason, force = false) {
  if (!force && state.mode !== "playing") {
    return;
  }

  state.best = Math.max(state.best, state.score);
  writeBestScore(state.best);
  updateHud();

  setMode("gameover");
  ui.overlayEyebrow.textContent = reason === "hit" ? "CRASH" : reason === "quit" ? "END" : "FALL";
  ui.overlayTitle.textContent = reason === "hit" ? "\ucda9\ub3cc" : reason === "quit" ? "\uc885\ub8cc" : "\ub099\ud558";
  ui.overlayText.textContent = `\uc810\uc218 ${formatScore(state.score)} \u00b7 \ub9c1 ${state.rings}`;
  ui.startButton.textContent = "\ub2e4\uc2dc";
}

function updateHud() {
  state.score = Math.floor(state.distance * 12 + state.rings * 125 + state.shiftBonus);
  const displaySpeed = Math.abs(state.speed) < 0.5 ? 0 : Math.round(state.speed);
  const remainingShift = Math.max(0, Math.ceil(state.shiftEndsAt - state.elapsed));
  ui.score.textContent = formatScore(state.score);
  ui.best.textContent = formatScore(Math.max(state.best, state.score));
  ui.rings.textContent = state.dimension === "shift2d" ? String(state.shiftCoins) : String(state.rings);
  ui.speed.textContent = state.dimension === "shift2d" ? `${remainingShift}s` : `${displaySpeed}`;

  ui.dimensionBanner.classList.toggle("is-shift", state.dimension === "shift2d");
  if (state.dimension === "shift2d") {
    ui.dimensionBanner.textContent = `2D SHIFT \u00b7 ${state.shiftCoins}`;
  } else if (state.multiplier > 1) {
    ui.dimensionBanner.textContent = `3D RUN \u00b7 x${state.multiplier}`;
  } else {
    ui.dimensionBanner.textContent = "3D RUN";
  }
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
