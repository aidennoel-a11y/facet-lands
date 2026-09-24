import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';

const DROPS = 7000;

/**
 * Rain: streaks falling through a box around the camera. Each drop is a
 * short line whose position is worked out on the GPU from the time, so the
 * whole shower costs one draw call and no per-frame updates. Drops are fixed
 * in the world (the box just wraps around you), fall at slightly different
 * speeds, and slant with the wind. Lighter rain shows fewer of them.
 */
export class Rain {
  constructor(scene) {
    const seeds = new Float32Array(DROPS * 2 * 4);
    for (let i = 0; i < DROPS; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random(), w = Math.random();
      seeds.set([x, y, z, w], i * 8);
      seeds.set([x, y, z, w], i * 8 + 4);
    }
    const ends = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) ends[i * 2 + 1] = 1;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(DROPS * 2 * 3), 3));
    geometry.setAttribute('drop', new BufferAttribute(seeds, 4));
    geometry.setAttribute('tail', new BufferAttribute(ends, 1));

    this.uniforms = {
      time: { value: 0 },
      centre: { value: new Vector3() },
      box: { value: new Vector3(80, 48, 80) },
      fall: { value: new Vector3(0, -22, 0) },
      amount: { value: 0 },
      colour: { value: new Color(0xb8c4d2) },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float time;
        uniform vec3 centre;
        uniform vec3 box;
        uniform vec3 fall;
        uniform float amount;
        attribute vec4 drop;
        attribute float tail;
        varying float vAlpha;
        void main() {
          // Each drop falls at its own speed; the box wraps around the camera.
          vec3 velocity = fall * (0.85 + 0.3 * drop.w);
          vec3 corner = centre - box * 0.5;
          vec3 p = mod(drop.xyz * box + velocity * time - corner, box) + corner;
          p -= normalize(velocity) * tail * (0.9 + 0.5 * drop.w);
          // Lighter rain: fewer drops.
          vAlpha = step(drop.w, amount) * (1.0 - 0.6 * tail);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.0) discard;
          gl_FragColor = vec4(colour, 0.42 * vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new LineSegments(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * @param time    seconds
   * @param focus   camera position
   * @param amount  0..1
   * @param wind    { x, z } drift of the clouds (m/s), and its strength 0..1
   * @param light   sky colour to tint the drops with
   */
  update(time, focus, amount, wind, strength, light) {
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    const u = this.uniforms;
    u.time.value = time;
    u.centre.value.copy(focus);
    u.amount.value = amount;
    const gust = 0.6 + 1.6 * strength;
    u.fall.value.set(wind.x * gust, -22, wind.z * gust);
    u.colour.value.set(0xb8c4d2).lerp(light, 0.35);
  }
}

/**
 * Lightning in a storm: every few seconds (more often the fiercer the
 * storm), a strike somewhere around you. A jagged, forking bolt runs from
 * the clouds to the ground and flickers two or three times, lighting up the
 * sky and land (`dayNight.flash`), brighter the closer it is. The thunder
 * follows at the speed of sound: a sharp crack for a close strike, a long
 * low rumble for a distant one.
 */
export class Lightning {
  constructor(scene) {
    this.scene = scene;
    this.material = new MeshBasicMaterial({
      color: 0xeef3ff,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.bolt = null;
    this.wait = 6;
    this.strike = null; // { age, pulses: [start times], power }
    this.pending = []; // thunder on its way: { at, distance }
    this.time = 0;
  }

  /** A jagged bolt with a few forks, as a flat ribbon (drawn facing the camera). */
  #boltGeometry(height) {
    const positions = [];
    const ribbon = (points, width) => {
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, ay] = points[i], [bx, by] = points[i + 1];
        const w0 = width * (1 - (i / points.length) * 0.5), w1 = width * (1 - ((i + 1) / points.length) * 0.5);
        positions.push(ax - w0, ay, 0, bx - w1, by, 0, bx + w1, by, 0, ax - w0, ay, 0, bx + w1, by, 0, ax + w0, ay, 0);
      }
    };
    const path = (x, y, length, steps, spread) => {
      const pts = [[x, y]];
      for (let i = 1; i <= steps; i++) {
        x += (Math.random() - 0.5) * spread;
        y -= length / steps;
        pts.push([x, y]);
      }
      return pts;
    };
    const main = path(0, height, height, 26, 22);
    ribbon(main, 3.2);
    ribbon(main, 9); // faint glow around it (drawn additively, so it just brightens)
    for (let f = 0; f < 3; f++) {
      const from = main[3 + Math.floor(Math.random() * 12)];
      ribbon(path(from[0], from[1], height * (0.15 + Math.random() * 0.25), 7, 18), 1.6);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    return g;
  }

  /**
   * @param dt        seconds
   * @param storm     0..1
   * @param camera    the camera (bolts face it)
   * @param dayNight  gets the flash
   * @param ground    (x, z) => ground height
   * @param sound     plays the thunder (or null)
   * @param sheltered underground: no bolts or flashes
   */
  update(dt, storm, camera, dayNight, ground, sound, sheltered) {
    this.time += dt;
    // Thunder arriving.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.time >= this.pending[i].at) {
        sound?.thunder(this.pending[i].distance, sheltered);
        this.pending.splice(i, 1);
      }
    }

    if (!this.strike) {
      this.wait -= dt * storm;
      if (storm > 0.3 && this.wait <= 0) this.#start(camera, ground);
    }

    let flash = 0;
    if (this.strike) {
      const s = this.strike;
      s.age += dt;
      for (const t of s.pulses) {
        const a = s.age - t;
        if (a >= 0 && a < 0.16) flash = Math.max(flash, (1 - a / 0.16) * s.power);
      }
      if (this.bolt) this.bolt.visible = flash > 0.08 && !sheltered;
      if (s.age > 0.9) this.#end();
    }
    dayNight.flash = sheltered ? 0 : flash;
  }

  #start(camera, ground) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 250 + Math.random() * 1300;
    const x = camera.position.x + Math.cos(angle) * distance;
    const z = camera.position.z + Math.sin(angle) * distance;
    const base = ground(x, z);
    const top = Math.max(base + 220, 320); // from inside the cloud deck
    this.bolt = new Mesh(this.#boltGeometry(top - base), this.material);
    this.bolt.position.set(x, base, z);
    // Face the camera (turning about the vertical only).
    this.bolt.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
    this.bolt.frustumCulled = false;
    this.bolt.renderOrder = 4;
    this.scene.add(this.bolt);
    const power = 0.45 + 0.55 * (1 - (distance - 250) / 1300);
    this.strike = { age: 0, pulses: [0, 0.12 + Math.random() * 0.1, 0.3 + Math.random() * 0.25].slice(0, 2 + Math.floor(Math.random() * 2)), power };
    this.pending.push({ at: this.time + distance / 343, distance });
    this.wait = 3 + Math.random() * 12;
  }

  #end() {
    if (this.bolt) {
      this.scene.remove(this.bolt);
      this.bolt.geometry.dispose();
      this.bolt = null;
    }
    this.strike = null;
  }
}
