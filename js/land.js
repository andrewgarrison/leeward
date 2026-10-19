// First Light and Tallyrock. One height function, in metres, y up.
// Open water is DEEP. The beach, the lee lagoon, and the reef are the same field,
// so the mesh, the water shader's depth map, and the hull all agree.
//
// +Z is outward, toward the escape and toward Tallyrock. The windward beach faces -Z.
// The lagoon opens downwind, on the +Z shore, with a reef across its mouth and a channel.

export const DEEP = -48;
// A hull grounds where the seabed rises above this. The reef crests do. The channel does not.
export const KEEL = -0.85;

export const FIRST = { x: 0, z: 0 };
// Off the island's eastern shoulder, far enough to be a voyage and near enough to read as land.
export const TALLY = { x: 1680, z: 1120 };
// Opening anchorage, off the windward beach, bow toward the island.
export const ANCHOR = { x: -36, z: -470, yaw: 2.85 };

const APRON_RX = 400;
const APRON_RZ = 285;

function warp(x, z) {
  return [
    x + Math.sin(z * 0.012) * 26 + Math.sin(x * 0.005 + 1.7) * 12,
    z + Math.cos(x * 0.010) * 20 + Math.sin(z * 0.006) * 9,
  ];
}

function ell(x, z, rx, rz) {
  return Math.hypot(x / rx, z / rz);
}

function fall(t) {
  const u = Math.max(0, 1 - t);
  return u * u * (3 - 2 * u);
}

function shoreface(outer) {
  // outer 1 is the apron waterline. A sandy shelf, then the drop into deep water.
  const u = Math.min(1, Math.max(0, (outer - 1) / 0.55));
  if (u < 0.34) return -5 * (u / 0.34);
  return -5 + (DEEP + 5) * ((u - 0.34) / 0.66);
}

function firstLight(x, z) {
  const w = warp(x - FIRST.x, z - FIRST.z);
  const X = w[0];
  const Z = w[1];
  if (ell(X, Z, 860, 740) > 1) return DEEP;

  let h = fall(ell(X, Z + 15, 280, 190)) ** 1.15 * 24;
  h += fall(ell(X - 80, Z + 50, 100, 78)) ** 1.1 * 11;
  // Low ridges so the canopy is not a single dome.
  const ridge = Math.max(0, Math.sin(X * 0.031 + 0.6) * Math.sin(Z * 0.027));
  h += ridge * fall(ell(X, Z + 10, 220, 150)) * 3.2;

  const apronT = ell(X, Z, APRON_RX, APRON_RZ);
  h = Math.max(h, fall(apronT) ** 0.85 * 3.1);
  if (apronT > 1) h = shoreface(apronT);

  // Lee lagoon. Dug after the shoreface so the mouth stays open to the sea.
  const lag = ell(X - 8, Z - 195, 145, 108);
  if (lag < 1.2) h -= Math.max(0, 1 - lag) ** 0.65 * 7.2;

  // Reef across the lagoon mouth, with a couple of heads that break the surface.
  const along = Math.abs(X) / 190;
  const across = Math.abs(Z - 325) / 22;
  if (along < 1 && across < 1 && h < 0.6) {
    const crest = Math.sqrt(Math.max(0, 1 - along)) * Math.max(0, 1 - across);
    h = Math.max(h, -1.45 + crest * 1.05);
    const head = Math.sin(X * 0.047) * Math.sin(Z * 0.039);
    if (along > 0.25 && along < 0.8 && head > 0.72) h = Math.max(h, 0.45);
  }

  // Channel through the middle of the bar.
  const ch = Math.exp(-(X * X) / (32 * 32)) * Math.exp(-((Z - 325) * (Z - 325)) / (42 * 42));
  h -= ch * 2.6;

  return Math.max(DEEP, h);
}

function tallyRock(x, z) {
  const dx = x - TALLY.x;
  const dz = z - TALLY.z;
  if (ell(dx, dz, 260, 230) > 1) return DEEP;
  let h = fall(ell(dx, dz, 72, 58)) ** 0.42 * 64;
  h = Math.max(h, fall(ell(dx, dz, 120, 100)) ** 1.35 * 6);
  const outer = ell(dx, dz, 120, 100);
  if (outer > 1) h = shoreface(1 + (outer - 1) * 0.85);
  return Math.max(DEEP, h);
}

export function seabed(x, z) {
  return Math.max(firstLight(x, z), tallyRock(x, z));
}

export function grounds(x, z) {
  return seabed(x, z) > KEEL;
}

// Walk from the boat back toward `from` until the hull would float.
export function offshorePoint(x, z, fromX, fromZ) {
  if (!grounds(x, z)) return { x, z };
  for (let i = 1; i <= 32; i++) {
    const t = i / 32;
    const px = x + (fromX - x) * t;
    const pz = z + (fromZ - z) * t;
    if (!grounds(px, pz)) return { x: px, z: pz };
  }
  return null;
}

function f16bits(val) {
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  f[0] = val;
  const x = u[0];
  const sign = (x >>> 16) & 0x8000;
  const mant = (x & 0x7fffff) >>> 13;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  if ((x & 0x7fffffff) < 0x33800000) return sign; // too small for f16
  if (exp <= 0) {
    if (exp < -10) return sign;
    const m = (mant | 0x400) >>> (1 - exp);
    return sign | m;
  }
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | (mant & 0x3ff);
}

function f16ToNumber(bits) {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exp = (bits >>> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (mant / 1024);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

// Two height maps the water shader samples. Texel rows run +Z. Widths are multiples
// of 128 so a tightly packed r16float row is 256-byte aligned.
export function landMaps() {
  return [
    { name: 'first', x0: -800, z0: -800, size: 1600, res: 640 },
    { name: 'tally', x0: TALLY.x - 300, z0: TALLY.z - 300, size: 640, res: 256 },
  ];
}

export function fillLandMap(map) {
  const { x0, z0, size, res } = map;
  const step = size / res;
  const out = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) {
    const z = z0 + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const x = x0 + (i + 0.5) * step;
      out[j * res + i] = f16bits(seabed(x, z));
    }
  }
  return out;
}

function pushGrid(data, indices, x0, z0, x1, z1, step, minH) {
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) h[j * nx + i] = seabed(x0 + i * step, z0 + j * step);
  }
  const vid = new Int32Array(nx * nz);
  vid.fill(-1);
  const use = (i, j) => {
    const k = j * nx + i;
    if (vid[k] >= 0) return vid[k];
    const x = x0 + i * step;
    const z = z0 + j * step;
    const y = h[k];
    const e = 2;
    const dhdx = (seabed(x + e, z) - seabed(x - e, z)) / (2 * e);
    const dhdz = (seabed(x, z + e) - seabed(x, z - e)) / (2 * e);
    let nxn = -dhdx, nyn = 1, nzn = -dhdz;
    const len = Math.hypot(nxn, nyn, nzn) || 1;
    const id = data.length / 6;
    data.push(x, y, z, nxn / len, nyn / len, nzn / len);
    vid[k] = id;
    return id;
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const h00 = h[j * nx + i];
      const h10 = h[j * nx + i + 1];
      const h01 = h[(j + 1) * nx + i];
      const h11 = h[(j + 1) * nx + i + 1];
      if (h00 < minH && h10 < minH && h01 < minH && h11 < minH) continue;
      const a = use(i, j);
      const b = use(i, j + 1);
      const c = use(i + 1, j + 1);
      const d = use(i + 1, j);
      // p00, p01, p11 and p00, p11, p10. Upward when viewed from +Y.
      indices.push(a, b, c, a, c, d);
    }
  }
}

export function buildLandMesh() {
  const data = [];
  const indices = [];
  pushGrid(data, indices, -760, -700, 760, 780, 2.5, -3.2);
  pushGrid(data, indices, TALLY.x - 240, TALLY.z - 220, TALLY.x + 240, TALLY.z + 220, 3, -3.2);
  if (indices.length < 3) throw new Error('land mesh is empty');
  return {
    vertices: new Float32Array(data),
    indices: new Uint32Array(indices),
    indexCount: indices.length,
  };
}

export function selfTestLand() {
  const fail = (m) => { throw new Error('land self-test: ' + m); };
  if (f16ToNumber(f16bits(-48)) !== -48) fail('f16 -48');
  if (Math.abs(f16ToNumber(f16bits(0.5)) - 0.5) > 0.01) fail('f16 0.5');
  if (!(seabed(0, -4000) < -30)) fail('open water should be deep');
  if (!(seabed(0, 0) > 18)) fail('First Light peak, got ' + seabed(0, 0));

  let shoreZ = null;
  for (let z = -500; z < -50; z += 2) {
    if (seabed(0, z) > 0.4) { shoreZ = z; break; }
  }
  if (shoreZ == null || shoreZ > -180) fail('windward beach missing, shoreZ ' + shoreZ);

  let lagoon = 0;
  for (let z = 80; z <= 280; z += 8) {
    for (let x = -80; x <= 80; x += 8) lagoon = Math.min(lagoon, seabed(x, z));
  }
  if (!(lagoon < -3)) fail('lagoon should be a few metres deep, got ' + lagoon);

  let crest = -99;
  let channel = 0;
  for (let z = 280; z <= 420; z += 4) {
    channel = Math.min(channel, seabed(0, z));
    for (const x of [90, 120, 150]) crest = Math.max(crest, seabed(x, z));
  }
  if (!(crest > KEEL && crest < 1.2)) fail('reef crest, got ' + crest);
  if (!(channel < KEEL - 0.8)) fail('channel should float a hull, got ' + channel);

  if (!(seabed(TALLY.x, TALLY.z) > 40)) fail('Tallyrock peak');
  if (!(seabed(TALLY.x + 800, TALLY.z) < -30)) fail('water beside Tallyrock');

  for (const map of landMaps()) {
    const mid = map.size * 0.5;
    const corners = [
      [map.x0 + 2, map.z0 + 2],
      [map.x0 + map.size - 2, map.z0 + 2],
      [map.x0 + 2, map.z0 + map.size - 2],
      [map.x0 + map.size - 2, map.z0 + map.size - 2],
      [map.x0 + mid, map.z0 + 2],
      [map.x0 + mid, map.z0 + map.size - 2],
      [map.x0 + 2, map.z0 + mid],
      [map.x0 + map.size - 2, map.z0 + mid],
    ];
    for (const [x, z] of corners) {
      if (!(seabed(x, z) < -30)) fail(map.name + ' map border is not deep water at ' + x + ',' + z);
    }
    if ((map.res * 2) % 256 !== 0) fail(map.name + ' row bytes are not 256-aligned');
  }

  const mesh = buildLandMesh();
  if (mesh.indexCount % 3 !== 0) fail('indices');
  const n = mesh.vertices;
  const len = Math.hypot(n[3], n[4], n[5]);
  if (Math.abs(len - 1) > 1e-3) fail('normal');
}
