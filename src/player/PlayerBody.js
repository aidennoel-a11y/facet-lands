import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

/**
 * A simple low-poly person that stands where the walking player is.
 *
 * You never see the body itself: it's in first person and its material
 * writes neither colour nor depth. It still renders into the shadow map,
 * so when you look down you see your own shadow walk, swing its arms and
 * jump with you.
 */
export class PlayerBody {
  constructor(scene) {
    const invisible = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const part = (w, h, d, x, y, z) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d).translate(0, -h / 2, 0), invisible);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };

    this.group = new Group();
    this.group.name = 'player body';
    // Pivots sit at hips / shoulders so limbs swing naturally.
    this.legL = part(0.17, 0.85, 0.2, -0.11, 0.87, 0);
    this.legR = part(0.17, 0.85, 0.2, 0.11, 0.87, 0);
    this.armL = part(0.12, 0.7, 0.14, -0.31, 1.47, 0);
    this.armR = part(0.12, 0.7, 0.14, 0.31, 1.47, 0);
    this.group.add(
      this.legL,
      this.legR,
      this.armL,
      this.armR,
      part(0.46, 0.62, 0.26, 0, 1.5, 0), // torso
      part(0.26, 0.28, 0.26, 0, 1.82, 0), // head
    );
    this.group.visible = false;
    scene.add(this.group);

    this.phase = 0;
    this._last = null;
  }

  /**
   * @param controls  PlayerControls (walk mode shows the body)
   * @param dt        seconds since last frame
   */
  update(controls, dt) {
    const walking = controls.mode === 'walk';
    this.group.visible = walking;
    if (!walking) {
      this._last = null;
      return;
    }

    const cam = controls.camera.position;
    const feet = cam.y - controls.eyeHeight;
    // Stand slightly behind the eye so the shadow's head is under your view.
    const yaw = controls.euler.y;
    this.group.position.set(cam.x + Math.sin(yaw) * 0.12, feet, cam.z + Math.cos(yaw) * 0.12);
    this.group.rotation.y = yaw;

    // Swing limbs by distance actually travelled on the ground.
    let moved = 0;
    if (this._last) moved = Math.hypot(cam.x - this._last.x, cam.z - this._last.z);
    this._last = { x: cam.x, z: cam.z };
    const speed = dt > 0 ? moved / dt : 0;
    this.phase += moved * 2.4;
    const amount = controls.grounded ? Math.min(1, speed / 4) : 0.35;
    const swing = Math.sin(this.phase) * 0.7 * amount;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
  }
}
