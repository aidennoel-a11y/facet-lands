/**
 * What you get better at, and what you've done.
 *
 * Skills grow with use, each to level 10: the more you do a thing, the
 * better at it you are (see Game for what each one does for you).
 * Achievements: the milestones of a life in the wild, each once.
 */
export const SKILLS = [
  { id: 'archery', name: 'Archery', what: 'Truer shots (less sway on the move), arrows fly faster', how: 'Shoot, and hit' },
  { id: 'woodcutting', name: 'Woodcutting', what: 'Fewer blows to fell a tree', how: 'Chop' },
  { id: 'mining', name: 'Mining', what: 'Fewer blows to break rock and ore', how: 'Break rock' },
  { id: 'sneaking', name: 'Sneaking', what: 'Crouched, the animals notice you later', how: 'Creep up on animals, crouched' },
  { id: 'tracking', name: 'Tracking', what: 'Read older tracks, from further off', how: 'Crouch and read the tracks on the ground' },
  { id: 'fishing', name: 'Fishing', what: 'Bites come sooner', how: 'Catch fish' },
  { id: 'crafting', name: 'Crafting', what: 'Mending at the repair bench costs less', how: 'Make and mend things' },
];

// (Points to reach each level: 10, 30, 60, 100 ... a little more each time.)
const need = (level) => 10 * (level * (level + 1)) / 2;
export const MAX_LEVEL = 10;

export const ACHIEVEMENTS = [
  { id: 'fire', name: 'Spark', what: 'Light a campfire' },
  { id: 'shelter', name: 'A roof overhead', what: 'Build a lean-to or a roof' },
  { id: 'week', name: 'Seven days', what: 'Survive a week' },
  { id: 'month', name: 'Thirty days', what: 'Survive thirty days' },
  { id: 'year', name: 'A turn of the seasons', what: 'Survive a whole year' },
  { id: 'hunt', name: 'Hunter', what: 'Bring down an animal' },
  { id: 'biggame', name: 'Big game', what: 'Bring down a bear, a moose or a bison' },
  { id: 'fish10', name: 'Angler', what: 'Catch ten fish' },
  { id: 'iron', name: 'Iron age', what: 'Smelt an iron bar' },
  { id: 'steel', name: 'Steel', what: 'Smelt a steel bar' },
  { id: 'stonehouse', name: 'Stone house', what: 'Build eight walls of stone' },
  { id: 'bridge', name: 'Bridge builder', what: 'Build a bridge' },
  { id: 'horse', name: 'Horse whisperer', what: 'Tame a wild horse' },
  { id: 'flock', name: 'Shepherd', what: 'Tame a sheep, a turkey or a duck' },
  { id: 'harvest', name: 'Farmer', what: 'Harvest a crop you sowed' },
  { id: 'salt', name: 'Salt of the earth', what: 'Gather salt' },
  { id: 'honey', name: 'Sweet tooth', what: 'Take wild honey' },
  { id: 'eggs', name: 'Egg hunt', what: 'Take eggs from a nest or a hen-house' },
  { id: 'ruin', name: 'Explorer', what: 'Find an old ruin' },
  { id: 'wreck', name: 'Beachcomber', what: 'Open a shipwreck\'s sea chest' },
  { id: 'cave', name: 'Into the dark', what: 'Go deep underground' },
  { id: 'hotspring', name: 'Hot soak', what: 'Warm up in a hot spring' },
  { id: 'boss', name: 'Beast slayer', what: 'Bring down one of the great beasts' },
  { id: 'skill5', name: 'Seasoned', what: 'Reach level 5 in a skill' },
  { id: 'skill10', name: 'Master', what: 'Reach level 10 in a skill' },
  { id: 'mine', name: 'The old workings', what: 'Find an abandoned mine' },
  { id: 'lm_elderTree', name: 'The Elder Tree', what: 'Find the oldest tree in the forest' },
  { id: 'lm_stoneArch', name: 'The Stone Arch', what: 'Find the great arch of red rock' },
  { id: 'lm_crystalLake', name: 'Crystal Lake', what: 'Find the lake ringed with crystals' },
  { id: 'lm_cascades', name: 'The Cascades', what: 'Find the lake that spills down a hillside, pool to pool' },
  { id: 'lm_standingStones', name: 'The Standing Stones', what: 'Find the ring of old stones' },
  { id: 'lm_sunkenForest', name: 'The Sunken Forest', what: 'Find the drowned forest' },
  { id: 'lm_petrifiedLog', name: 'The Petrified Log', what: 'Find the tree turned to stone' },
  { id: 'lm_boneField', name: 'The Bone Field', what: 'Find the bones of something enormous' },
  { id: 'lm_hotPools', name: 'The Hot Pools', what: 'Find the steaming pools on white terraces' },
  { id: 'lm_greatSinkhole', name: 'The Great Sinkhole', what: 'Find where the ground fell away' },
  { id: 'landmarks', name: 'Wayfarer', what: 'Find all ten kinds of landmark' },
  { id: 'keep', name: 'The end of the long road', what: 'Set every trophy in the altar of the Lost Keep' },
];

export class Progress {
  constructor() {
    this.reset();
  }

  reset() {
    this.xp = Object.fromEntries(SKILLS.map((s) => [s.id, 0]));
    this.done = new Map(); // achievement id -> the day of this life it was done
    this.counts = {}; // (for the ones that want several: fish caught, stone walls)
  }

  level(id) {
    const xp = this.xp[id] ?? 0;
    let l = 0;
    while (l < MAX_LEVEL && xp >= need(l + 1)) l++;
    return l;
  }

  /** How far to the next level (0..1). */
  toNext(id) {
    const l = this.level(id);
    if (l >= MAX_LEVEL) return 1;
    const a = need(l), b = need(l + 1);
    return ((this.xp[id] ?? 0) - a) / (b - a);
  }

  /** Points in a skill: returns the new level if it went up, else 0. */
  add(id, n) {
    if (!(id in this.xp)) return 0;
    const before = this.level(id);
    this.xp[id] += n;
    const after = this.level(id);
    return after > before ? after : 0;
  }

  /** Counts one more of `what`: returns the new count. */
  count(what, n = 1) {
    return (this.counts[what] = (this.counts[what] ?? 0) + n);
  }

  /** Done (if not already): returns the achievement if it's new. */
  achieve(id, day = 0) {
    if (this.done.has(id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    this.done.set(id, Math.floor(day) + 1);
    return a;
  }

  toJSON() {
    return { xp: this.xp, done: [...this.done], counts: this.counts };
  }

  load(data) {
    this.reset();
    if (!data) return;
    for (const s of SKILLS) if (Number.isFinite(data.xp?.[s.id])) this.xp[s.id] = data.xp[s.id];
    this.done = new Map(Array.isArray(data.done) ? data.done : []);
    this.counts = { ...(data.counts ?? {}) };
  }
}
