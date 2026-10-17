// Sailboat motion, camera basis, and the procedural hull.
//
// One heading frame, shared with the camera in main.js:
//   yaw 0 looks down world -Z, positive yaw turns toward +X.
//   forward = (sin yaw, 0, -cos yaw)
//   right    = (-forward.z, 0, forward.x) = (cos yaw, 0, sin yaw)
// The mesh bow is local -Z. boatAxes() is the only place that turns a yaw into
// the basis the shader multiplies. Positive pitch raises the bow. Positive roll
// raises the starboard side (local +X).

const TAU = Math.PI * 2;

export function cameraAxes(yaw, pitch, o) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  o.fx = cp * sy; o.fy = sp; o.fz = -cp * cy;
  o.rx = cy; o.ry = 0; o.rz = sy;
  // view up = right × forward
  o.ux = o.ry * o.fz - o.rz * o.fy;
  o.uy = o.rz * o.fx - o.rx * o.fz;
  o.uz = o.rx * o.fy - o.ry * o.fx;
}

export function headingXZ(yaw, o) {
  o.fx = Math.sin(yaw);
  o.fz = -Math.cos(yaw);
  o.rx = -o.fz;
  o.rz = o.fx;
}

// Local +X, +Y, +Z as 9 floats. Local +Z is astern, so the bow (local -Z) points along forward.
export function boatAxes(yaw, pitch, roll, o) {
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ffx = fx * cp, ffy = sp, ffz = fz * cp;
  const rx = -fz, rz = fx;
  const ux = -rz * ffy;
  const uy = rz * ffx - rx * ffz;
  const uz = rx * ffy;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  o[0] = rx * cr + ux * sr;
  o[1] = uy * sr;
  o[2] = rz * cr + uz * sr;
  o[3] = ux * cr - rx * sr;
  o[4] = uy * cr;
  o[5] = uz * cr - rz * sr;
  o[6] = -ffx;
  o[7] = -ffy;
  o[8] = -ffz;
}

// Wave samples are heights at bow, stern, port, starboard. Wind XZ is the
// direction the wind blows toward, the same vector the spectrum uses.
const seaHdg = { fx: 0, fz: 0, rx: 0, rz: 0 };
export function seaPose(bowH, sternH, portH, starH, windX, windZ, yaw, length, beam, out) {
  headingXZ(yaw, seaHdg);
  out.pitch = Math.atan2(bowH - sternH, length);
  const lateral = windX * seaHdg.rx + windZ * seaHdg.rz;
  // Wind blowing toward starboard heels the boat onto that side.
  out.roll = Math.atan2(starH - portH, beam) - lateral * 0.22;
}

export function windVector(deg, out) {
  const r = deg * Math.PI / 180;
  out.x = Math.cos(r);
  out.z = Math.sin(r);
}

// Click ray against the mean sea (y = 0). ndcX/ndcY are -1..1, y up.
// aspect is the projection aspect (render width / height), matching writeFrame.
export function waterHit(cam, ndcX, ndcY, aspect) {
  const a = { fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };
  cameraAxes(cam.yaw, cam.pitch, a);
  const tanY = Math.tan(cam.fovY * 0.5);
  const tanX = tanY * aspect;
  let dx = a.fx + ndcX * a.rx * tanX + ndcY * a.ux * tanY;
  let dy = a.fy + ndcX * a.ry * tanX + ndcY * a.uy * tanY;
  let dz = a.fz + ndcX * a.rz * tanX + ndcY * a.uz * tanY;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  if (dy >= -0.02) return null;
  const t = -cam.y / dy;
  if (!(t > 0) || t > 2000) return null;
  return { x: cam.x + dx * t, z: cam.z + dz * t };
}

// Yaw that looks from the origin toward (dx, dz), in the same frame as headingXZ.
export function yawToward(dx, dz) {
  return Math.atan2(dx, -dz);
}

// Yaw and pitch that look along (dx, dy, dz). Pitch is negative when looking down.
export function lookYawPitch(dx, dy, dz, out) {
  out.yaw = yawToward(dx, dz);
  out.pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-6);
}

const chaseHdg = { fx: 0, fz: 0, rx: 0, rz: 0 };

// Camera position for a chase rig. orbit 0 is directly astern. Positive orbit
// swings the camera to its own right. out receives x and z; y is left alone.
export function chasePosition(boatX, boatZ, boatYaw, orbit, distance, out) {
  headingXZ(boatYaw - orbit, chaseHdg);
  out.x = boatX - chaseHdg.fx * distance;
  out.z = boatZ - chaseHdg.fz * distance;
}

const stepHdg = { fx: 0, fz: 0, rx: 0, rz: 0 };
const TURN_RATE = 0.65; // rad/s
const ARRIVE = 2.4;

// Sail toward boat.tx/tz. Speed falls off upwind but never stalls completely,
// and is capped by the turn radius so the boat reaches the point instead of orbiting it.
export function stepBoat(boat, dt, windX, windZ) {
  if (!boat.hasTarget) return 0;
  const dx = boat.tx - boat.x;
  const dz = boat.tz - boat.z;
  const dist = Math.hypot(dx, dz);
  let err = yawToward(dx, dz) - boat.yaw;
  if (err > Math.PI) err -= TAU;
  else if (err < -Math.PI) err += TAU;
  if (dist < ARRIVE && Math.abs(err) < 0.6) {
    boat.x = boat.tx;
    boat.z = boat.tz;
    boat.hasTarget = 0;
    return 0;
  }
  const maxTurn = TURN_RATE * dt;
  boat.yaw += Math.max(-maxTurn, Math.min(maxTurn, err));
  if (boat.yaw > Math.PI) boat.yaw -= TAU;
  else if (boat.yaw < -Math.PI) boat.yaw += TAU;
  headingXZ(boat.yaw, stepHdg);
  const align = stepHdg.fx * windX + stepHdg.fz * windZ;
  let speed = 6.4 * (0.34 + 0.66 * (align * 0.5 + 0.5));
  if (Math.abs(err) > 0.9 && dist < 18) speed = 0;
  else speed = Math.min(speed, Math.max(1.1, dist * TURN_RATE * 0.9));
  speed *= Math.min(1, dist / 8);
  const step = Math.min(speed * dt, dist);
  boat.x += stepHdg.fx * step;
  boat.z += stepHdg.fz * step;
  return speed;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE = [0.80, 0.78, 0.74];
const RED = [0.40, 0.055, 0.045];
const DECK = [0.46, 0.31, 0.18];
const WOOD = [0.36, 0.24, 0.14];
const SAIL = [0.90, 0.88, 0.80];
const DARK = [0.07, 0.075, 0.08];
const WINDOW = [0.12, 0.16, 0.20];
const MARKER = [1.0, 0.52, 0.16];

// color.w: 0 hull, 1+billow sail, 3 water marker.
export function buildSailboat() {
  const data = [];
  const indices = [];
  const tags = [];
  let bowTip = null;

  function emit(p, n, color, billow) {
    const i = data.length / 10;
    data.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2], billow);
    return i;
  }
  function addTri(a, b, c, color, ba, bb, bc, hint, tag) {
    const ab = sub(b, a), ac = sub(c, a);
    let n = cross(ab, ac);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-8) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    let pa = a, pb = b, pc = c, wA = ba, wB = bb, wC = bc;
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      pb = c; pc = b; wB = bc; wC = bb;
      n = [-n[0], -n[1], -n[2]];
    }
    const ia = emit(pa, n, color, wA);
    emit(pb, n, color, wB);
    emit(pc, n, color, wC);
    indices.push(ia, ia + 1, ia + 2);
    if (tag) tags.push({ tag, n });
  }
  function addQuad(a, b, c, d, color, billow, hint, tag) {
    addTri(a, b, c, color, billow, billow, billow, hint, tag);
    addTri(a, c, d, color, billow, billow, billow, hint, null);
  }
  function addBox(cx, cy, cz, hx, hy, hz, color) {
    const p = (x, y, z) => [cx + x * hx, cy + y * hy, cz + z * hz];
    addQuad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), color, 0, [1, 0, 0]);
    addQuad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), color, 0, [-1, 0, 0]);
    addQuad(p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), color, 0, [0, 1, 0]);
    addQuad(p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1), p(-1, -1, -1), color, 0, [0, -1, 0]);
    addQuad(p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), p(1, -1, 1), color, 0, [0, 0, 1]);
    addQuad(p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1), p(-1, -1, -1), color, 0, [0, 0, -1]);
  }

  // z is bow-negative. Each ring is keel, up the starboard side, across the deck, down port.
  function ring(z, beam, keel, deck) {
    return [
      [0, keel, z],
      [beam * 0.40, keel * 0.42, z],
      [beam * 0.88, -0.18, z],
      [beam, -0.02, z],
      [beam * 0.96, 0.22, z],
      [beam * 0.82, deck * 0.72, z],
      [beam * 0.70, deck, z],
      [0, deck + 0.025, z],
      [-beam * 0.70, deck, z],
      [-beam * 0.82, deck * 0.72, z],
      [-beam * 0.96, 0.22, z],
      [-beam, -0.02, z],
      [-beam * 0.88, -0.18, z],
      [-beam * 0.40, keel * 0.42, z],
    ];
  }
  const stations = [
    [-4.15, 0.28, -0.16, 0.42],
    [-3.15, 0.78, -0.55, 0.64],
    [-1.70, 1.18, -0.88, 0.74],
    [-0.10, 1.30, -0.96, 0.76],
    [1.55, 1.26, -0.84, 0.72],
    [3.05, 1.05, -0.48, 0.62],
    [4.15, 0.84, -0.12, 0.54],
  ];
  const rings = stations.map((s) => ring(s[0], s[1], s[2], s[3]));
  const edgeColor = (i) => (i <= 2 || i >= 11 ? RED : (i >= 6 && i <= 8 ? DECK : WHITE));
  const edgeHint = (p, q) => {
    const x = (p[0] + q[0]) * 0.5;
    const y = (p[1] + q[1]) * 0.5;
    if (y > 0.45 && Math.abs(x) < 0.7) return [x * 0.15, 1, 0];
    if (y < -0.2) return [x, -0.85, 0];
    return [Math.sign(x || 1), 0.2, 0];
  };

  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let tag = null;
      if (s === 3 && i === 4) tag = 'starboard';
      if (s === 3 && i === 6) tag = 'deck';
      if (s === 3 && i === 0) tag = 'bottom';
      addQuad(A[i], B[i], B[j], A[j], edgeColor(i), 0, edgeHint(A[i], A[j]), tag);
    }
  }

  bowTip = [0, 0.32, -4.72];
  for (let i = 0; i < rings[0].length; i++) {
    const j = (i + 1) % rings[0].length;
    const h = edgeHint(rings[0][i], rings[0][j]);
    h[2] -= 1.2;
    // i === 7 is the deck centerline, so this cap faces out the bow rather than off to one side.
    addTri(bowTip, rings[0][j], rings[0][i], edgeColor(i), 0, 0, 0, h, i === 7 ? 'bow' : null);
  }
  const stern = rings[rings.length - 1];
  const sternC = [0, 0.22, 4.42];
  for (let i = 0; i < stern.length; i++) {
    const j = (i + 1) % stern.length;
    const h = edgeHint(stern[i], stern[j]);
    h[2] += 1.2;
    addTri(sternC, stern[i], stern[j], i > 2 && i < 11 ? WHITE : RED, 0, 0, 0, h, i === 7 ? 'transom' : null);
  }

  // Cabin, spars, keel, rudder. Sizes are half-extents.
  addBox(0, 1.08, 0.85, 0.40, 0.30, 0.78, WOOD);
  addBox(0.415, 1.12, 0.70, 0.012, 0.10, 0.26, WINDOW);
  addBox(-0.415, 1.12, 0.70, 0.012, 0.10, 0.26, WINDOW);
  addBox(0, 4.45, -0.40, 0.045, 3.72, 0.055, WOOD);          // mast, foot on the cabin
  addBox(0.08, 1.18, 1.05, 0.03, 0.028, 1.55, WOOD);         // boom, aft of the mast
  addBox(0, -1.28, 0.15, 0.04, 0.42, 0.62, DARK);            // keel fin
  addBox(0, -1.68, 0.20, 0.11, 0.09, 0.36, DARK);            // bulb
  addBox(0, -0.28, 4.05, 0.025, 0.48, 0.16, DARK);           // rudder

  function addSail(head, tack, clew, cols, rows) {
    const grid = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const luff = lerp(tack, head, t);
      const leach = lerp(clew, head, t);
      const row = [];
      for (let c = 0; c <= cols; c++) {
        const s = c / cols;
        const p = lerp(luff, leach, s);
        const camber = Math.sin(s * Math.PI) * (0.28 + 0.22 * (1 - t));
        p[0] += camber;
        row.push({ p, w: 1 + Math.sin(s * Math.PI) });
      }
      grid.push(row);
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c], e = grid[r + 1][c + 1];
        const hint = [1, 0.15, 0];
        addTri(a.p, b.p, e.p, SAIL, a.w, b.w, e.w, hint, null);
        addTri(a.p, e.p, d.p, SAIL, a.w, e.w, d.w, hint, null);
      }
    }
  }
  addSail([0, 7.85, -0.40], [0, 1.28, -0.40], [0.12, 1.22, 2.55], 4, 7); // main
  addSail([0, 6.3, -0.40], [0, 0.78, -4.35], [0.08, 1.05, -1.15], 3, 6);  // jib

  const boatCount = indices.length;

  // Waypoint ring in unit XZ. The shader scales it and plants it on the waves.
  const seg = 40;
  const inner = 0.58;
  const base = data.length / 10;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    emit([c * inner, 0, s * inner], [0, 1, 0], MARKER, 3);
    emit([c, 0, s], [0, 1, 0], MARKER, 3);
  }
  const markerStart = indices.length;
  for (let i = 0; i < seg; i++) {
    const v = base + i * 2;
    // CCW from above (+Y)
    indices.push(v, v + 2, v + 1);
    indices.push(v + 1, v + 2, v + 3);
  }
  // Normal of the first ring triangle, built the same way as the indices above.
  const i0 = base;
  const p0 = [data[i0 * 10], data[i0 * 10 + 1], data[i0 * 10 + 2]];
  const p1 = [data[(i0 + 1) * 10], data[(i0 + 1) * 10 + 1], data[(i0 + 1) * 10 + 2]];
  const p2 = [data[(i0 + 2) * 10], data[(i0 + 2) * 10 + 1], data[(i0 + 2) * 10 + 2]];
  // indices are v, v+2, v+1 so the triangle is p0, p2, p1
  const mn = cross(sub(p2, p0), sub(p1, p0));
  tags.push({ tag: 'marker', n: mn });

  if (indices.length > 65535) throw new Error('sailboat index overflow');
  return {
    vertices: new Float32Array(data),
    indices: new Uint16Array(indices),
    boatCount,
    markerStart,
    markerCount: indices.length - markerStart,
    tags,
    bowTip,
  };
}

export function selfTestBoat() {
  const fail = (m) => { throw new Error('boat self-test: ' + m); };
  const axes = { fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };
  cameraAxes(0, 0, axes);
  if (Math.abs(axes.fz + 1) > 1e-6 || Math.abs(axes.rx - 1) > 1e-6 || Math.abs(axes.uy - 1) > 1e-6) {
    fail('yaw 0 camera basis');
  }
  const o = new Float32Array(9);
  boatAxes(0, 0, 0, o);
  if (Math.abs(o[0] - 1) > 1e-6 || Math.abs(o[4] - 1) > 1e-6 || Math.abs(o[8] - 1) > 1e-6) fail('identity boat axes');
  boatAxes(0, 0.25, 0, o);
  const bowY = -4 * o[7];
  if (!(bowY > 0.5)) fail('positive pitch should raise the bow, got ' + bowY);
  boatAxes(0, 0, 0.3, o);
  if (!(o[1] > 0.1)) fail('positive roll should raise starboard');
  boatAxes(Math.PI / 2, 0, 0, o);
  // bow world direction = -localZ = -o[6..8]. At yaw 90° that is +X.
  if (!(-o[6] > 0.9 && Math.abs(o[8]) < 1e-5)) fail('yaw 90 bow should face +X');

  const pose = { pitch: 0, roll: 0 };
  seaPose(1, 0, 0, 0, 0, 0, 0, 6.8, 2.1, pose);
  if (!(pose.pitch > 0)) fail('higher bow sample should pitch bow up');
  seaPose(0, 0, 0, 1, 0, 0, 0, 6.8, 2.1, pose);
  if (!(pose.roll > 0)) fail('higher starboard sample should roll starboard up');
  seaPose(0, 0, 0, 0, 1, 0, 0, 6.8, 2.1, pose);
  if (!(pose.roll < 0)) fail('wind toward starboard should heel onto starboard');
  boatAxes(0, 0, pose.roll, o);
  if (!(o[1] < 0)) fail('that heel should drop local +X');

  const cam = { x: 0, y: 8, z: 0, yaw: 0, pitch: -0.4, fovY: 1 };
  const hit = waterHit(cam, 0, 0, 1);
  if (!hit || !(hit.z < -5) || Math.abs(hit.x) > 0.05) fail('center click should hit water ahead, got ' + JSON.stringify(hit));
  const right = waterHit(cam, 0.6, 0, 1);
  if (!right || !(right.x > 1)) fail('right-of-center click should land at +X');
  cam.pitch = 0.4;
  if (waterHit(cam, 0, 0, 1) !== null) fail('looking up should miss the water');

  const boat = { x: 0, z: 0, yaw: 0, hasTarget: 1, tx: 0, tz: -80 };
  for (let i = 0; i < 90; i++) stepBoat(boat, 1 / 30, 0, -1);
  if (!(boat.z < -8) || Math.abs(boat.x) > 1.5) fail('downwind run should move toward -Z, at ' + boat.x + ',' + boat.z);
  const behind = { x: 0, z: 0 };
  chasePosition(0, 0, 0, 0, 10, behind);
  if (Math.abs(behind.x) > 1e-6 || Math.abs(behind.z - 10) > 1e-6) fail('orbit 0 should sit astern, on +Z');
  chasePosition(0, 0, 0, 0.7, 10, behind);
  if (!(behind.x > 2)) fail('positive orbit should move the camera to +X');
  const look = { yaw: 0, pitch: 0 };
  lookYawPitch(-behind.x, 0, -behind.z, look);
  cameraAxes(look.yaw, look.pitch, axes);
  const lookLen = Math.hypot(-behind.x, -behind.z);
  if (Math.abs(axes.fx - (-behind.x / lookLen)) > 1e-5 || Math.abs(axes.fz - (-behind.z / lookLen)) > 1e-5) {
    fail('chase look should point at the boat');
  }
  lookYawPitch(0, -2, -10, look);
  if (!(look.yaw === 0 && look.pitch < 0)) fail('looking down -Z should be yaw 0 and a negative pitch');

  const boat2 = { x: 0, z: 0, yaw: 0, hasTarget: 1, tx: 60, tz: 0 };
  for (let i = 0; i < 600; i++) stepBoat(boat2, 1 / 30, 1, 0);
  const left = Math.hypot(boat2.tx - boat2.x, boat2.tz - boat2.z);
  if (left > 3) fail('should arrive at a beam target, remaining ' + left.toFixed(2));
  if (boat2.hasTarget) fail('arrival should clear the waypoint');

  const mesh = buildSailboat();
  const tag = (name) => mesh.tags.find((t) => t.tag === name);
  const star = tag('starboard'), deck = tag('deck'), bottom = tag('bottom'), bow = tag('bow'), transom = tag('transom'), marker = tag('marker');
  if (!star || !(star.n[0] > 0.4)) fail('starboard face should point +X ' + (star && star.n));
  if (!deck || !(deck.n[1] > 0.5)) fail('deck should point up ' + (deck && deck.n));
  if (!bottom || !(bottom.n[1] < -0.2)) fail('bottom should point down ' + (bottom && bottom.n));
  if (!bow || !(bow.n[2] < -0.2)) fail('bow cap should point -Z ' + (bow && bow.n));
  if (!transom || !(transom.n[2] > 0.2)) fail('transom should point +Z ' + (transom && transom.n));
  if (!marker || !(marker.n[1] > 0)) fail('marker ring should face up');
  if (!(mesh.bowTip[2] < -4)) fail('bow tip');
  if (mesh.boatCount < 100 || mesh.markerCount < 6) fail('mesh is empty');
}
