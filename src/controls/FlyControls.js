import { Euler, Vector3 } from 'three';

/**
 * Free-flying camera.
 *  - Drag (mouse or touch) to look around.
 *  - WASD / arrow keys to move, Space / E up, Ctrl / Q down, Shift to go fast.
 *  - Mouse wheel changes cruising speed.
 *  - Auto-fly glides forward on its own (handy on phones and for demos).
 * The camera never dips below the ground.
 */
export class FlyControls {
  constructor(camera, domElement, getGroundHeight) {
    this.camera = camera;
    this.dom = domElement;
    this.getGroundHeight = getGroundHeight;

    this.speed = 60; // m/s
    this.boost = 4;
    this.lookSensitivity = 0.0035;
    this.minClearance = 4;
    this.autoFly = false;

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
        this.speed = Math.min(600, Math.max(10, this.speed * (e.deltaY > 0 ? 0.9 : 1.1)));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  lookAt(target) {
    this.camera.lookAt(target);
    this.euler.setFromQuaternion(this.camera.quaternion);
  }

  update(dt) {
    const k = this.keys;
    const f = this._forward;
    const r = this._right;
    const m = this._move.set(0, 0, 0);

    this.camera.getWorldDirection(f);
    r.crossVectors(f, this.camera.up).normalize();

    if (k.has('KeyW') || k.has('ArrowUp') || this.autoFly) m.add(f);
    if (k.has('KeyS') || k.has('ArrowDown')) m.sub(f);
    if (k.has('KeyD') || k.has('ArrowRight')) m.add(r);
    if (k.has('KeyA') || k.has('ArrowLeft')) m.sub(r);
    if (k.has('Space') || k.has('KeyE')) m.y += 1;
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyQ')) m.y -= 1;

    if (m.lengthSq() > 0) {
      const fast = k.has('ShiftLeft') || k.has('ShiftRight');
      m.normalize().multiplyScalar(this.speed * (fast ? this.boost : 1) * dt);
      this.camera.position.add(m);
    }

    const pos = this.camera.position;
    const ground = this.getGroundHeight(pos.x, pos.z) + this.minClearance;
    if (pos.y < ground) pos.y = ground;
  }
}
