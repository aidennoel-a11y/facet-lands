import { CircleGeometry, DirectionalLight, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Remote } from '../net/Multiplayer.js';

/**
 * The Character page's picture of you: your figure as the world draws it,
 * standing in a little light of its own, breathing, looking about. Drag it
 * round. A renderer of its own, let go of by
 * `dispose` when the page closes.
 */
export function characterPreview(canvas, look) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  scene.add(new HemisphereLight(0xdfe6f0, 0x4a3e2e, 1.1));
  const sun = new DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(2.5, 4, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.01;
  scene.add(sun);
  const rim = new DirectionalLight(0x9ab8ff, 0.9);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const floor = new Mesh(new CircleGeometry(0.95, 48).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: 0x3a4a2e }));
  floor.receiveShadow = true;
  scene.add(floor);

  let fig = null, yaw = 0.5, view = 'full', t = 0, frame = 0, last = performance.now();
  const cam = { y: 1.05, dist: 4.0, look: 0.98 };
  const want = () => (view === 'face' ? { y: 1.68, dist: 1.75, look: 1.56 } : { y: 1.05, dist: 4.0, look: 0.98 });

  function setLook(l) {
    if (fig) (scene.remove(fig.root), fig.root.traverse((o) => o.geometry?.dispose()));
    fig = new Remote(scene, { id: 'preview', name: '', colour: '#c8965a', look: l });
    fig.tag.visible = false;
    fig.root.visible = true;
  }
  setLook(look);

  // (Drag to turn it.)
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, yaw };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
  });
  const up = () => (drag = null);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function tick(now) {
    // (Its page closed, or the menu hidden: let go of it, never drawing behind the game.)
    if (!canvas.isConnected || !canvas.offsetParent) return dispose();
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const g = want(), k = Math.min(1, dt * 5);
    for (const key of ['y', 'dist', 'look']) cam[key] += (g[key] - cam[key]) * k;
    camera.position.set(0, cam.y, cam.dist);
    camera.lookAt(0, cam.look, 0);
    if (fig) {
      // Standing easy: breathing, the arms hanging loose, now and then a look about.
      const s = fig.frame.scale.y;
      fig.root.rotation.y = yaw;
      fig.body.position.y = 0.92 + Math.sin(t * 1.6) * 0.006;
      fig.body.rotation.set(0, 0, Math.sin(t * 0.37) * 0.015);
      fig.head.rotation.set(Math.sin(t * 0.5) * 0.06 - 0.03, Math.sin(t * 0.23) * 0.45 * Math.max(0, Math.sin(t * 0.13 + 1)), 0);
      fig.arms.forEach((a, n) => a.rotation.set(Math.sin(t * 1.6 + n) * 0.03, 0, (n ? -1 : 1) * (0.07 + Math.sin(t * 1.6) * 0.012)));
      fig.forearms.forEach((f) => f.rotation.set(-0.18, 0, 0));
      fig.legs.forEach((l, n) => l.rotation.set(0, 0, (n ? -1 : 1) * 0.03));
      fig.shins.forEach((sh) => sh.rotation.set(0, 0, 0));
      floor.scale.setScalar(s);
    }
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(tick);

  let gone = false;
  function dispose() {
    if (gone) return;
    gone = true;
    cancelAnimationFrame(frame);
    scene.traverse((o) => o.geometry?.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return {
    setLook,
    setView: (v) => (view = v),
    dispose,
  };
}
