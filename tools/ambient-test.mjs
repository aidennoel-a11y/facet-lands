// The calls round about (birds, owls, bugs, frogs): two players standing
// together hear the same ones at the same moments.   node tools/ambient-test.mjs
globalThis.window = { addEventListener: () => {} };
const { Sound } = await import('../src/render/Sound.js');
const noop = () => {};
const param = () => ({ setTargetAtTime: noop, setValueAtTime: noop, value: 0 });
const bed = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (o[k] = k === 'pan' ? null : { gain: param(), frequency: param(), pan: param() })) });
const make = () => {
  const s = new Sound();
  // (Anything asked of the audio: a stand-in that does nothing.)
  const stub = () => new Proxy(function () {}, { get: (o, k) => (k === 'connect' ? () => stub() : k in o ? o[k] : (o[k] = stub())), apply: () => stub() });
  s.ctx = new Proxy({ currentTime: 0 }, { get: (o, k) => (k in o ? o[k] : () => stub()) });
  s.beds = new Proxy({}, { get: (o, k) => (o[k] ??= bed()) });
  s.cicadaDepth = s.insectDepth = { gain: param() };
  s.shore = null;
  s.next = { stream: 0 };
  s.heardSlot = {};
  s.nextBird = s.nextCricket = s.nextFrog = 0;
  s.heard = [];
  s.call = (n, pan) => s.heard.push(`${n}:${pan.toFixed(2)}`);
  return s;
};
const env = { woods: 0.8, jungle: 0.2, grass: 0.3, wetland: 0.5, day: 0.1, dawn: 0, dusk: 0.3, rain: 0, wind: 0.1, snowy: 0, high: 0, ocean: 0, lava: 0, desert: 0, cell: [3, 4], panTo: (a) => Math.sin(a) };
const A = make(), B = make();
let n = 0;
for (let T = 1000; T < 1120; T += 1 / 60) {
  A.ctx.currentTime = T - 1000;
  B.ctx.currentTime = T - 990; // (their audio started at different times)
  // (One computer slower: it skips a frame now and then.)
  A.ambience({ ...env, clock: T });
  if (++n % 3) B.ambience({ ...env, clock: T + 0.004 });
}
const same = A.heard.length > 10 && A.heard.join() === B.heard.join();
console.log(`${same ? 'PASS' : 'FAIL'}  the same calls for both: ${A.heard.length} / ${B.heard.length}`);
if (!same) console.log(A.heard.slice(0, 8), B.heard.slice(0, 8));
