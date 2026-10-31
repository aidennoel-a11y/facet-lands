import { Euler, Vector3 } from 'three';

/**
 * First-person controls with two modes.
 *
 * Fly:  free camera. WASD / arrows move where you look, Space / E up,
 *       Ctrl / Q down, Shift fast, mouse wheel changes cruising speed.
 * Walk: you're a person on the ground. WASD moves along the ground, Space
 *       jumps, Shift sprints, C / Ctrl crouches (slower, lower, quieter). Gravity pulls you down, slopes that are too
 *       steep can't be climbed, tree trunks block you. In deep water (the
 *       sea, lakes, rivers and ponds) you swim: you float with your head
 *       above the surface; Space swims up, Ctrl / Q / C dives, and under
 *       the water you swim the way you look. A river's current carries you
 *       downstream; swim to a low bank and you climb out.
 *
 * Both: drag (mouse or touch) to look; auto-move walks/flies forward on its own.
 *
 * Caves: underground, the cave floor is the ground, the roof stops jumps,
 * and the rock walls block you like any too-steep slope.
 *
 * `world` supplies what the controls need to know about the terrain:
 *   groundAt(x, feetY, z)      { height, inCave, ceiling }: the surface you'd
 *                              stand on from feet height feetY (terrain or
 *                              cave floor)
 *   seaLevel                   water surface height
 *   waterAt(x, z)              { level, fx, fz, speed }: the water's surface
 *                              there (sea, lake, river or pond) and its
 *                              current, or null (optional)
 *   collide(position, radius)  pushes position out of solid things (optional)
 */
export class PlayerControls {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;

    this.mode = 'fly';
    this.noclip = false; // (testing: flying through the ground and rock, nothing solid)
    this.autoMove = false;
    this.lookSensitivity = 0.0035;

    // Fly
    this.flySpeed = 60; // m/s
    this.flyBoost = 4;
    this.flyClearance = 4;

    // Walk
    this.standingEye = 1.7;
    this.crouchingEye = 1.05;
    this.eyeHeight = 1.7;
    this.crouch = false; // keeping low (C / Ctrl while walking)
    this.speedFactor = 1; // slowed (pushing through leaves, say): set from outside
    this.burden = 1; // slowed by what you carry: set from outside
    this.noSprint = false; // too worn out or weighed down to run
    this.noJump = false; // stuck fast (in tar, say): set from outside
    this.vehicle = null; // (dt, input) => void: something you're riding (a raft) moves you instead
    this.frozen = false; // not moving at all (a menu's open, or you're dead)
    this.jumps = 0; // jumps since last asked (see takeJumps)
    this.onLand = null; // (speed m/s) => void: you've come down from a fall
    this.moving = false;
    this.sprinting = false;
    this.radius = 0.35;
    this.walkSpeed = 5;
    this.sprintSpeed = 10;
    this.swimSpeed = 2.5;
    this.jumpSpeed = 7.5;
    this.gravity = 22;
    this.maxFallSpeed = 55;
    this.maxClimb = 1.1; // steepest slope (rise over run) you can walk up
    this.swimDepth = 1.3; // water deeper than this and you float

    this.velocityY = 0;
    this.push = { x: 0, z: 0 }; // (a shove from outside, m/s: a tornado's wind, being thrown: see launch)
    this.grounded = false;
    this.swimming = false;
    this.locked = false; // the mouse held in the middle of the screen (pointer lock)
    this.mouseLock = true; // whether a click takes hold of it (see setMouseLock)
    this.underwater = false; // your eyes are under the surface

    this.euler = new Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(camera.quaternion);
    this.keys = new Set();
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };

    this._forward = new Vector3();
    this._right = new Vector3();
    this._move = new Vector3();

    this.#bind();
  }

  #bind() {
    const dom = this.dom;
    // Click to hold the mouse in the middle of the screen (Esc lets go):
    // then moving it looks about. Where the browser won't hold it, drag to look.
    const turn = (dx, dy) => {
      this.euler.y -= dx * this.lookSensitivity;
      this.euler.x -= dy * this.lookSensitivity;
      this.euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    };
    dom.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      if (e.button === 0 && dom.requestPointerLock && !this.lockFailed && this.mouseLock) {
        try {
          const p = dom.requestPointerLock();
          p?.catch?.(() => (this.lockFailed = true));
        } catch {
          this.lockFailed = true;
        }
      }
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // (Not while the mouse is being taken hold of.)
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      this.dragging = false;
    });
    document.addEventListener('pointerlockerror', () => (this.lockFailed = true));
    document.addEventListener('mousemove', (e) => {
      if (this.locked) turn(e.movementX, e.movementY);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.locked) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      turn(dx, dy);
    });
    const stop = () => (this.dragging = false);
    dom.addEventListener('pointerup', stop);
    dom.addEventListener('pointercancel', stop);
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.mode !== 'fly') return;
        this.flySpeed = Math.min(600, Math.max(10, this.flySpeed * (e.deltaY > 0 ? 0.9 : 1.1)));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.code === 'Space') e.preventDefault(); // don't toggle focused checkboxes
      if (this.frozen) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && this.mode === 'walk' && this.grounded && !this.swimming && !this.noJump && !this.#onSteep()) {
        this.velocityY = this.jumpSpeed * (this.crouch ? 0.8 : 1);
        this.grounded = false;
        this.jumps++;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Whether clicking takes hold of the mouse (else you drag to look). */
  setMouseLock(on) {
    this.mouseLock = on;
    if (!on && document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.velocityY = 0;
    this.grounded = false; // switching to walk from the sky means a fall
    this.softLanding = mode === 'walk'; // (…but that first drop to the ground never hurts: starting a game, arriving)
  }

  lookAt(target) {
    this.camera.lookAt(target);
    this.euler.setFromQuaternion(this.camera.quaternion);
  }

  /** Speed you'd move at right now if you pressed forward, in m/s. */
  get currentSpeed() {
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.mode === 'fly') return this.flySpeed * (fast ? this.flyBoost : 1);
    if (this.swimming) return this.swimSpeed;
    if (this.crouch) return this.walkSpeed * 0.45 * this.speedFactor * this.burden;
    return (fast && !this.noSprint ? this.sprintSpeed : this.walkSpeed) * this.speedFactor * this.burden;
  }

  /** How many times you've jumped since last asked. */
  takeJumps() {
    const n = this.jumps;
    this.jumps = 0;
    return n;
  }

  update(dt) {
    if (this.frozen) this.keys.clear();
    this.#swimTilt(dt);
    if (this.mode === 'fly') this.#updateFly(dt);
    else if (this.vehicle) {
      this.swimming = false;
      this.crouch = false;
      this.vehicle(dt, this.#input());
    } else this.#updateWalk(dt);
  }

  /**
   * Swimming, the view leans with you: banking over as you swim off to the
   * side (or slanting across), dipping a little as you go down and lifting
   * as you come up, and rolling gently to each stroke. Only the view: where
   * you look and aim is as the mouse has it.
   */
  #swimTilt(dt) {
    const v = this.swimVel ?? { x: 0, y: 0, z: 0 };
    const on = this.swimming && this.mode === 'walk';
    const input = on ? this.#input() : { forward: 0, strafe: 0 };
    const speed = Math.hypot(v.x, v.z);
    const stroke = (this.strokePhase = (this.strokePhase ?? 0) + dt * (1.2 + speed * 0.9));
    const roll = on ? -input.strafe * 0.13 * (input.forward ? 0.8 : 1) + Math.sin(stroke) * 0.025 * Math.min(1, speed / 1.5) : 0;
    const dip = on ? Math.max(-0.12, Math.min(0.12, -v.y * 0.05)) : 0;
    const k = Math.min(1, dt * 4);
    this.tiltRoll = (this.tiltRoll ?? 0) + (roll - (this.tiltRoll ?? 0)) * k;
    this.tiltDip = (this.tiltDip ?? 0) + (dip - (this.tiltDip ?? 0)) * k;
    if (Math.abs(this.tiltRoll) < 1e-4 && Math.abs(this.tiltDip) < 1e-4 && !this.tilted) return;
    this.tilted = Math.abs(this.tiltRoll) > 1e-4 || Math.abs(this.tiltDip) > 1e-4;
    (this._tilt ??= new Euler(0, 0, 0, 'YXZ')).set(Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.euler.x + this.tiltDip)), this.euler.y, this.tiltRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(this._tilt);
  }

  #input() {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') || this.autoMove ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      strafe: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      up: (k.has('Space') ? 1 : 0) - (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') ? 1 : 0), // (Q and E: picking up and the inventory)
    };
  }

  #updateFly(dt) {
    const input = this.#input();
    const f = this._forward;
    const r = this._right;
    const m = this._move.set(0, 0, 0);

    this.camera.getWorldDirection(f);
    r.crossVectors(f, this.camera.up).normalize();
    m.addScaledVector(f, input.forward).addScaledVector(r, input.strafe);
    m.y += input.up;

    if (m.lengthSq() > 0) {
      m.normalize().multiplyScalar(this.currentSpeed * dt);
      const p0 = this.camera.position;
      // (Underground, flying, the rock walls still stop you: unless no clip.)
      if (!this.noclip && (m.x || m.z)) {
        const feet = p0.y - this.eyeHeight, here = this.#ground(p0.x, feet, p0.z);
        // (Under the water, a rock face ahead stops you, as in a cave: you
        // don't jump up onto its top.)
        const wet = this.#water(p0.x, p0.z);
        if (!here.inCave && wet && p0.y < wet.level - 0.2) {
          const len = Math.hypot(m.x, m.z), ax = p0.x + m.x + (m.x / len) * 0.5, az = p0.z + m.z + (m.z / len) * 0.5;
          const ahead = this.world.groundAt(ax, feet, az);
          if (!ahead.inCave && ahead.height > p0.y + Math.max(0, m.y) - 0.45 && ahead.height < wet.level) (m.x = 0), (m.z = 0);
        }
        if (here.inCave) {
          const len = Math.hypot(m.x, m.z), reach = this.radius + 0.35;
          const ahead = this.#ground(p0.x + m.x + (m.x / len) * reach, feet, p0.z + m.z + (m.z / len) * reach);
          if (ahead.stand > feet + 1.2 || (ahead.inCave && ahead.ceiling < p0.y + 0.1)) (m.x = 0), (m.z = 0);
        }
      }
      this.camera.position.add(m);
    }

    const pos = this.camera.position;
    if (this.noclip) {
      this.underwater = false;
      return;
    }
    const ground = this.#ground(pos.x, pos.y - this.eyeHeight, pos.z);
    // (Down into the water, if you like, to near its bottom.)
    // (Under the water, however shallow: down to near the bottom, not held up over it.)
    const wet = !ground.inCave ? this.#water(pos.x, pos.z) : null, under = !!wet && ground.height < wet.level && pos.y < wet.level + this.flyClearance;
    const floor = ground.inCave ? ground.stand + 0.4 : ground.swim || under ? this.#bedAround(pos.x, pos.y, pos.z, ground.height) + 0.9 : ground.stand + this.flyClearance;
    const water = ground.swim || under ? wet : null;
    this.underwater = water !== null && pos.y < water.level - 0.05;
    if (pos.y < floor) pos.y = floor;
    if (ground.inCave && pos.y > ground.ceiling - 0.2) pos.y = Math.max(floor, ground.ceiling - 0.2);
  }

  /**
   * What's under your feet at (x, feetY, z):
   *   stand    height your feet rest at (floating at the surface in deep water)
   *   inCave   standing on a cave floor
   *   ceiling  the cave roof above you (Infinity outside)
   *   swim     deep water under you
   */
  #ground(x, feetY, z) {
    const g = this.world.groundAt(x, feetY, z);
    const water = this.#water(x, z);
    const deepWater = (!g.inCave || !!water?.cave) && water !== null && g.height < water.level - this.swimDepth;
    return {
      height: g.height,
      stand: deepWater ? water.level - this.swimDepth : g.height,
      inCave: g.inCave,
      ceiling: g.ceiling,
      swim: deepWater,
    };
  }

  /**
   * The sea bed round you, an arm's length each way (not only straight
   * below: on a steep, rough bed, the rock beside you is nearer than that
   * under you, and your eyes mustn't go into it). Rock sloping up below
   * your eyes lifts you over it; rock standing up beside you higher than
   * that is a wall: it pushes you off it sideways, never up it.
   */
  #bedAround(x, eyeY, z, here) {
    let top = here, px = 0, pz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const g = this.world.groundAt(x + c * 0.7, eyeY - this.eyeHeight, z + s * 0.7);
      if (g.inCave || !Number.isFinite(g.height)) continue;
      if (g.height < eyeY - 0.45) top = Math.max(top, g.height - 0.25); // (a little less: it's beside you, not under)
      else (px -= c), (pz -= s);
    }
    const n = Math.hypot(px, pz);
    if (n > 0) {
      const pos = this.camera.position;
      pos.x += (px / n) * 0.06;
      pos.z += (pz / n) * 0.06;
    }
    return top;
  }

  // The water's surface at (x, z) (and its current), or null.
  #water(x, z) {
    if (this.world.waterAt) return this.world.waterAt(x, z);
    return { level: this.world.seaLevel, fx: 0, fz: 0, speed: 0 };
  }

  /** Thrown: up at `vy`, along (vx, vz) (m/s); landing hard hurts (see onLand). */
  launch(vx, vy, vz) {
    if (this.mode !== 'walk' || this.vehicle) return;
    this.velocityY = Math.max(this.velocityY, vy);
    this.push.x = vx;
    this.push.z = vz;
    this.grounded = false;
    this.softLanding = false;
  }

  /** Blown on (m/s, horizontal): adds to the shove, which the ground's friction takes away. */
  blow(vx, vz, dt) {
    this.push.x += vx * dt;
    this.push.z += vz * dt;
  }

  #updateWalk(dt) {
    const pos = this.camera.position;
    const input = this.#input();
    // Crouching (not in the water): your eyes sink, and you go slowly.
    const k = this.keys;
    this.crouch = !this.swimming && (k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight'));
    const feet0 = pos.y - this.eyeHeight;
    this.eyeHeight += ((this.crouch ? this.crouchingEye : this.standingEye) - this.eyeHeight) * Math.min(1, dt * 10);
    pos.y = feet0 + this.eyeHeight;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');
    this.moving = input.forward !== 0 || input.strafe !== 0;
    this.sprinting = this.moving && fast && !this.crouch && !this.swimming && !this.noSprint;
    // In deep water, swimming.
    const water = this.#water(pos.x, pos.z);
    const under = this.world.groundAt(pos.x, pos.y - this.eyeHeight, pos.z);
    const deep = water !== null && (!under.inCave || !!water.cave) && water.level - under.height > this.swimDepth; // (and the lakes and rivers underground)
    this.underwater = water !== null && pos.y < water.level - 0.05;
    if (deep && pos.y - this.eyeHeight < water.level - 0.25) {
      this.swimming = true;
      this.grounded = false;
      this.#updateSwim(dt, input, water, under);
      return;
    }

    // Horizontal: move along the ground in the direction you face (ignoring pitch).
    const yaw = this.euler.y;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let mx = fx * input.forward - fz * input.strafe;
    let mz = fz * input.forward + fx * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const step = (this.currentSpeed * dt) / len;
      mx *= step;
      mz *= step;
      // Try the full move, then slide along each axis if it's blocked.
      if (!this.#tryMove(mx, mz) && !this.#tryMove(mx, 0)) this.#tryMove(0, mz);
    }
    // (Shoved by something: blown along, or thrown through the air.)
    if (Math.abs(this.push.x) + Math.abs(this.push.z) > 0.05) {
      const px = this.push.x * dt, pz = this.push.z * dt;
      if (!this.#tryMove(px, pz) && !this.#tryMove(px, 0)) this.#tryMove(0, pz);
      const drag = Math.exp(-dt * (this.grounded ? 6 : 0.4));
      this.push.x *= drag;
      this.push.z *= drag;
    }
    this.world.collide?.(pos, this.radius);

    // Vertical: gravity, landing, and sticking to the ground going downhill.
    const feetNow = pos.y - this.eyeHeight;
    const ground = this.#ground(pos.x, feetNow, pos.z);
    const floor = ground.stand;
    this.swimming = false;
    const wasGrounded = this.grounded;
    // Gliding (a glider carried, Space held as you fall from somewhere high):
    // a slow sink, carried on the way you look; down gently.
    const glide = this.canGlide && !wasGrounded && this.keys.has('Space') && this.velocityY < -1.5 && feetNow - floor > 1.2;
    if (glide) {
      const yaw = this.euler.y, pitch = Math.max(-0.6, Math.min(0.3, this.euler.x)), speed = 11 - 6 * pitch; // (nose down: faster, sinking faster)
      this.velocityY += (-(2.2 - 3 * pitch) - this.velocityY) * Math.min(1, dt * 3);
      this.push.x += (-Math.sin(yaw) * speed - this.push.x) * Math.min(1, dt * 2);
      this.push.z += (-Math.cos(yaw) * speed - this.push.z) * Math.min(1, dt * 2);
      this.softLanding = true;
    } else this.velocityY = Math.max(-this.maxFallSpeed, this.velocityY - this.gravity * dt);
    this.gliding = glide;
    let feet = feetNow + this.velocityY * dt;

    // Falling into deep water from a height: in you go, plunging on under
    // the surface with the speed you had, the water slowing you over a few
    // metres (see #updateSwim), not stopped dead at it.
    if (ground.swim && !wasGrounded && this.velocityY < -3 && feet <= floor) {
      const v = (this.swimVel ??= { x: 0, y: 0, z: 0 });
      v.y = this.velocityY * 0.8;
      v.x = this.push.x * 0.5;
      v.z = this.push.z * 0.5;
      pos.y = feet + this.eyeHeight;
      this.velocityY = 0;
      this.softLanding = false;
      this.swimming = true;
      this.grounded = false;
      return;
    }

    if (feet <= floor || (wasGrounded && this.velocityY <= 0 && feet - floor < 0.6)) {
      if (!wasGrounded && this.velocityY < -8 && !this.softLanding) this.onLand?.(-this.velocityY);
      this.softLanding = false;
      feet = floor;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    // Bump your head on the cave roof.
    if (ground.inCave && feet + this.eyeHeight > ground.ceiling - 0.15) {
      feet = Math.max(floor, ground.ceiling - 0.15 - this.eyeHeight);
      this.velocityY = Math.min(this.velocityY, 0);
    }
    pos.y = feet + this.eyeHeight;
  }

  /**
   * Swimming, as in Minecraft: in the water you sink, slowly, unless you
   * swim; Space swims you up (and keeps you bobbing at the surface), C /
   * Ctrl down; forward and to the sides you swim level, unhurried; Shift
   * and forward, a fast crawl the way you look, diving or rising with it;
   * down on the bottom you stand and walk along it. The water holds you
   * back: you speed up and slow down gently, you drift on a moment when
   * you stop. Carried along by a river's current; out onto a bank low
   * enough to reach.
   */
  #updateSwim(dt, input, water, under) {
    const pos = this.camera.position;
    const v = (this.swimVel ??= { x: 0, y: 0, z: 0 });
    const fast = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && input.forward > 0;
    const yaw = this.euler.y, pitch = this.euler.x;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // (The surface as it is just now, riding the waves: the eyes kept just above it.)
    const surf = this.world.surfaceAt?.(pos.x, pos.z, water) ?? water.level;
    const float = surf + 0.4;
    const atSurface = pos.y > surf - 0.5;
    this.swimSprint = fast;
    // What you're swimming for: level, at an easy pace; or a sprint, along where you look.
    let tx, ty, tz;
    if (fast) {
      const sp = this.swimSpeed * 2.1, up = atSurface && pitch > 0 ? 0 : Math.sin(pitch), lv = Math.cos(atSurface && pitch > 0 ? 0 : pitch);
      tx = (fx * lv * input.forward - fz * input.strafe * 0.5) * sp;
      tz = (fz * lv * input.forward + fx * input.strafe * 0.5) * sp;
      ty = up * sp + input.up * this.swimSpeed;
    } else {
      const sp = this.swimSpeed * 0.8;
      tx = (fx * input.forward - fz * input.strafe) * sp;
      tz = (fz * input.forward + fx * input.strafe) * sp;
      // (Space up, C down; nothing: sinking slowly; held at the top, bobbing.)
      ty = input.up > 0 ? (atSurface ? (float - pos.y) * 4 + Math.sin(performance.now() * 0.004) * 0.15 : this.swimSpeed * 0.9) : input.up < 0 ? -this.swimSpeed * 0.9 : -0.55;
    }
    // (The water's drag: eased towards it, quicker to slow down than to speed up.)
    const ease = (cur, want) => cur + (want - cur) * Math.min(1, dt * (Math.abs(want) > Math.abs(cur) ? 3.5 : 2.5));
    v.x = ease(v.x, tx);
    v.z = ease(v.z, tz);
    v.y = ease(v.y, ty);
    // The current.
    const dx = (v.x + (water.fx ?? 0) * (water.speed ?? 0) * 0.7) * dt, dz = (v.z + (water.fz ?? 0) * (water.speed ?? 0) * 0.7) * dt;
    if (dx || dz) {
      const next = this.world.groundAt(pos.x + dx, pos.y - this.eyeHeight, pos.z + dz);
      const under = next.height < water.level - 0.3;
      // Under the water, the bed rising ahead (a ridge, a rock, the slope up
      // to the shore): over it if it's no more than a step up from your
      // feet; rock standing higher stops you. At the surface, a low bank:
      // climb out onto it; one above your head: no further.
      const feet = pos.y - this.eyeHeight;
      if (next.inCave || (under ? next.height < Math.max(feet + 0.9, pos.y - 0.45) : next.height < pos.y - 0.2)) {
        pos.x += dx;
        pos.z += dz;
        if (!under && next.height > pos.y - this.eyeHeight) pos.y = next.height + this.eyeHeight;
      } else (v.x *= 0.3), (v.z *= 0.3);
    }
    this.world.collide?.(pos, this.radius);
    pos.y = Math.min(float + 0.05, pos.y + v.y * dt);
    if (pos.y >= float + 0.04 && v.y > 0) v.y = 0;
    // Down on the bottom: standing on it, walking along it.
    const below = this.world.groundAt(pos.x, pos.y - this.eyeHeight, pos.z);
    const stand = (below.inCave ? below.height : this.#bedAround(pos.x, pos.y, pos.z, below.height)) + this.eyeHeight * 0.92;
    if (pos.y < stand) {
      // (Eased up a rise underfoot, not jolted; never into it.)
      pos.y = Math.max(stand - 0.35, pos.y + (stand - pos.y) * Math.min(1, dt * 12));
      if (v.y < 0) v.y = 0;
    }
    this.onBottom = pos.y <= stand + 0.05;
    // Never the eyes right at the surface, the view cut in two by it: just
    // under it or just over it, whichever way you're going (or nearer).
    const gap = pos.y - surf, clear = 0.34;
    // (Standing on the bottom too high up for under it: over it.)
    if (Math.abs(gap) < clear) pos.y = surf + ((v.y > 0.05 ? true : v.y < -0.05 ? false : gap >= 0) || surf - clear < stand - 0.01 ? clear : -clear);
    this.velocityY = v.y;
    this.underwater = pos.y < surf - 0.05;
  }

  /**
   * Moves sideways if the spot is somewhere you could be: not a wall of
   * rock (ground far above your feet), not a slope too steep to climb, and
   * with enough headroom in a cave.
   */
  /**
   * Standing on land steeper than you could walk up (a cliff face you've
   * landed on): no jumping from there, or you'd hop your way up the cliff.
   * (The land's own slope, not the rocks and logs and floors on it, which
   * you can still jump up onto.)
   */
  #onSteep() {
    const at = this.world.terrainAt;
    if (!at || this.underground) return false;
    const p = this.camera.position, d = 0.6;
    const gx = Math.abs(at(p.x + d, p.z) - at(p.x - d, p.z)) / (2 * d), gz = Math.abs(at(p.x, p.z + d) - at(p.x, p.z - d)) / (2 * d);
    const feet = p.y - this.eyeHeight, here = at(p.x, p.z);
    if (!(Math.abs(feet - here) < 0.5)) return false; // (not on the land itself: on a rock, a floor, in a cave)
    return Math.hypot(gx, gz) > this.maxClimb;
  }

  #tryMove(dx, dz) {
    const pos = this.camera.position;
    const feet = pos.y - this.eyeHeight;
    const here = this.#ground(pos.x, feet, pos.z);
    const there = this.#ground(pos.x + dx, feet, pos.z + dz);
    const rise = there.stand - here.stand;
    if (!there.swim && there.stand > feet + 1.2) return false; // a wall
    if (there.inCave && there.ceiling - there.stand < this.eyeHeight + 0.25) return false; // too low
    // In a cave, look a little further ahead too (your body's width, and a
    // little for the rough rock), so you stop at the wall rather than
    // with your face in it.
    if (here.inCave || there.inCave) {
      const len = Math.hypot(dx, dz) || 1, reach = this.radius + 0.35;
      const ax = pos.x + dx + (dx / len) * reach, az = pos.z + dz + (dz / len) * reach;
      const ahead = this.#ground(ax, feet, az);
      if (!ahead.swim && ahead.stand > feet + 1.2) return false;
      if (ahead.inCave && ahead.ceiling < feet + this.eyeHeight + 0.1) return false; // (rock at head height)
    }
    if (this.grounded && !here.swim && rise > 0 && rise / Math.hypot(dx, dz) > this.maxClimb) return false;
    // (Up what's steeper than walking takes: with climbing picks, see Game.)
    this.climbingSteep = rise > 0 && rise / Math.hypot(dx, dz) > 1.1;
    pos.x += dx;
    pos.z += dz;
    return true;
  }
}
