import { Euler, Vector3 } from 'three';

/**
 * First-person controls with two modes.
 *
 * Fly:  free camera. WASD / arrows move where you look, Space / E up,
 *       Ctrl / Q down, Shift fast, mouse wheel changes cruising speed.
 * Walk: you're a person on the ground. WASD moves along the ground, Space
 *       jumps, Shift sprints. Gravity pulls you down, slopes that are too
 *       steep can't be climbed, tree trunks block you, and deep water makes
 *       you swim (float, slower).
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
 *   collide(position, radius)  pushes position out of solid things (optional)
 */
export class PlayerControls {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;

    this.mode = 'fly';
    this.autoMove = false;
    this.lookSensitivity = 0.0035;

    // Fly
    this.flySpeed = 60; // m/s
    this.flyBoost = 4;
    this.flyClearance = 4;

    // Walk
    this.eyeHeight = 1.7;
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
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.euler.y -= dx * this.lookSensitivity;
      this.euler.x -= dy * this.lookSensitivity;
      this.euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
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
      this.keys.add(e.code);
      if (e.code === 'Space' && this.mode === 'walk' && this.grounded && !this.swimming) {
        this.velocityY = this.jumpSpeed;
        this.grounded = false;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.velocityY = 0;
    this.grounded = false; // switching to walk from the sky means a fall
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
    return fast ? this.sprintSpeed : this.walkSpeed;
  }

  update(dt) {
    if (this.mode === 'fly') this.#updateFly(dt);
    else this.#updateWalk(dt);
  }

  #input() {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') || this.autoMove ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      strafe: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      up: (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyQ') ? 1 : 0),
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
      this.camera.position.add(m);
    }

    const pos = this.camera.position;
    const ground = this.#ground(pos.x, pos.y - this.eyeHeight, pos.z);
    const floor = ground.stand + (ground.inCave ? 0.4 : this.flyClearance);
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
    const deepWater = !g.inCave && g.height < this.world.seaLevel - this.swimDepth;
    return {
      stand: deepWater ? this.world.seaLevel - this.swimDepth : g.height,
      inCave: g.inCave,
      ceiling: g.ceiling,
      swim: deepWater,
    };
  }

  #updateWalk(dt) {
    const pos = this.camera.position;
    const input = this.#input();

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
    this.swimming = ground.swim;
    const wasGrounded = this.grounded;
    this.velocityY = Math.max(-this.maxFallSpeed, this.velocityY - this.gravity * dt);
    let feet = feetNow + this.velocityY * dt;

    if (feet <= floor || (wasGrounded && this.velocityY <= 0 && feet - floor < 0.6)) {
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
    if (this.grounded && !here.swim && rise > 0 && rise / Math.hypot(dx, dz) > this.maxClimb) return false;
    pos.x += dx;
    pos.z += dz;
    return true;
  }
}
