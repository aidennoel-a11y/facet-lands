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
      if (e.code === 'Space' && this.mode === 'walk' && this.grounded && !this.swimming) {
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
    if (this.mode === 'fly') this.#updateFly(dt);
    else if (this.vehicle) {
      this.swimming = false;
      this.crouch = false;
      this.vehicle(dt, this.#input());
    } else this.#updateWalk(dt);
  }

  #input() {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') || this.autoMove ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      strafe: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      up: (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyQ') || k.has('KeyC') ? 1 : 0),
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
    const floor = ground.inCave ? ground.stand + 0.4 : ground.swim ? ground.height + 1 : ground.stand + this.flyClearance;
    const water = ground.swim ? this.#water(pos.x, pos.z) : null;
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

  // The water's surface at (x, z) (and its current), or null.
  #water(x, z) {
    if (this.world.waterAt) return this.world.waterAt(x, z);
    return { level: this.world.seaLevel, fx: 0, fz: 0, speed: 0 };
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
    this.world.collide?.(pos, this.radius);

    // Vertical: gravity, landing, and sticking to the ground going downhill.
    const feetNow = pos.y - this.eyeHeight;
    const ground = this.#ground(pos.x, feetNow, pos.z);
    const floor = ground.stand;
    this.swimming = false;
    const wasGrounded = this.grounded;
    this.velocityY = Math.max(-this.maxFallSpeed, this.velocityY - this.gravity * dt);
    let feet = feetNow + this.velocityY * dt;

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
   * Swimming: along the way you look under the water (level at the
   * surface, where your head stays above it), Space up and Ctrl / Q / C
   * down; floating back up to the surface when you stop; carried along by
   * a river's current; never down through the bottom; out onto a bank low
   * enough to reach.
   */
  #updateSwim(dt, input, water, under) {
    const pos = this.camera.position;
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = this.swimSpeed * (fast ? 1.7 : 1);
    const yaw = this.euler.y, pitch = this.euler.x;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const float = water.level + 0.3; // (eyes just above the surface)
    const atSurface = pos.y > water.level - 0.4;
    // Looking down, swimming forward takes you down; up, back up (no higher than floating).
    const tilt = atSurface && pitch > 0 ? 0 : Math.sin(pitch);
    const level = Math.cos(atSurface && pitch > 0 ? 0 : pitch);
    let mx = (fx * input.forward * level - fz * input.strafe) * speed;
    let mz = (fz * input.forward * level + fx * input.strafe) * speed;
    let vy = (input.up + tilt * input.forward) * speed;
    // Floating back up, unless diving.
    if (input.up === 0 && !(input.forward && tilt < -0.1)) vy += Math.max(-1, Math.min(1.2, (float - pos.y) * 1.5));
    // The current.
    mx += (water.fx ?? 0) * (water.speed ?? 0) * 0.7;
    mz += (water.fz ?? 0) * (water.speed ?? 0) * 0.7;
    const dx = mx * dt, dz = mz * dt;
    if (dx || dz) {
      const next = this.world.groundAt(pos.x + dx, pos.y - this.eyeHeight, pos.z + dz);
      // (Rock or a bank rising above your head: no further; a low bank: climb out onto it.)
      if (next.height < pos.y - 0.2 || next.inCave) {
        pos.x += dx;
        pos.z += dz;
        if (next.height > pos.y - this.eyeHeight) pos.y = next.height + this.eyeHeight;
      }
    }
    this.world.collide?.(pos, this.radius);
    pos.y = Math.min(float + 0.05, pos.y + vy * dt);
    // Never down through the bottom.
    const floor = this.world.groundAt(pos.x, pos.y - this.eyeHeight, pos.z).height + 0.45;
    if (pos.y < floor) pos.y = floor;
    this.velocityY = 0;
    this.underwater = pos.y < water.level - 0.05;
  }

  /**
   * Moves sideways if the spot is somewhere you could be: not a wall of
   * rock (ground far above your feet), not a slope too steep to climb, and
   * with enough headroom in a cave.
   */
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
    pos.x += dx;
    pos.z += dz;
    return true;
  }
}
