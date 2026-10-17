// Sailboat and the click waypoint. The hull is rigid in the boat basis uploaded
// from JS (boatAxes). The waypoint ring is planted on the displaced surface.
import { FRAME_WGSL, ATMO_CORE_WGSL, CASCADES } from './common.js';

const DISP_FN = /* wgsl */ `
fn dispAt(xz: vec2f) -> vec3f {
  var d = vec3f(0.0);
  for (var c = 0u; c < ${CASCADES}u; c++) {
    d += textureSampleLevel(dispTex, sampR, xz * F.cascInvL[c >> 2u][c & 3u], c, 0.0).xyz;
  }
  return d;
}
`;

export const OBJECTS = FRAME_WGSL + ATMO_CORE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var envCube: texture_cube<f32>;
@group(0) @binding(3) var sampC: sampler;
@group(0) @binding(4) var dispTex: texture_2d_array<f32>;
@group(0) @binding(5) var sampR: sampler;
@group(0) @binding(6) var<uniform> O: Obj;

struct Obj {
  axX: vec4f,     // world image of local +X (starboard)
  axY: vec4f,
  axZ: vec4f,     // world image of local +Z (astern). The bow is -axZ.
  pos: vec4f,     // waterline origin, world metres
  marker: vec4f,  // xy = world xz, z = radius, w unused
};

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) rel: vec3f,
  @location(1) nrm: vec3f,
  @location(2) col: vec3f,
  @location(3) kind: f32,  // 0 hull, 1 sail, 2 marker
};

` + DISP_FN + /* wgsl */ `
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) col: vec4f) -> VO {
  var world: vec3f;
  var nrm: vec3f;
  var kind = 0.0;
  if (col.w > 2.5) {
    let goal = O.marker.xy + p.xz * O.marker.z;
    var x0 = goal;
    for (var i = 0; i < 3; i++) { x0 = goal - dispAt(x0).xz; }
    let d = dispAt(x0);
    world = vec3f(goal.x, d.y + 0.28, goal.y);
    nrm = vec3f(0.0, 1.0, 0.0);
    kind = 2.0;
  } else {
    var lp = p;
    if (col.w > 0.5) {
      // Sail cloth pushes to leeward. Wind vector matches the wave spectrum.
      let wind = vec3f(F.windP[0].x, 0.0, F.windP[0].y);
      let lee = dot(wind, O.axX.xyz);
      let billow = col.w - 1.0;
      let flutter = 0.06 * sin(F.camPos.w * 1.5 + p.y * 0.31);
      lp.x += billow * (lee * 0.55 + flutter);
      kind = 1.0;
    }
    world = O.pos.xyz + O.axX.xyz * lp.x + O.axY.xyz * lp.y + O.axZ.xyz * lp.z;
    nrm = O.axX.xyz * n.x + O.axY.xyz * n.y + O.axZ.xyz * n.z;
  }
  var o: VO;
  o.rel = world - F.camPos.xyz;
  o.pos = F.viewProj * vec4f(o.rel, 1.0);
  o.nrm = nrm;
  o.col = col.rgb;
  o.kind = kind;
  return o;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let dist = length(in.rel);
  let V = -in.rel / max(dist, 1e-4);          // toward the camera
  let N = normalize(in.nrm);
  let Ld = F.sunDir.xyz;
  let sunE = textureSampleLevel(transLUT, sampC, transRMuToUV(RG + F.atmo.y, Ld.y), 0.0).rgb * F.sunDir.w;
  if (in.kind > 1.5) {
    let mark = in.col * (0.85 + dot(sunE, vec3f(0.02)));
    return vec4f(mark, 1.0);
  }
  let amb = textureSampleLevel(envCube, sampC, N, 5.0).rgb;
  let ndl = clamp(dot(N, Ld) * 0.65 + 0.35, 0.0, 1.0);
  var col = in.col * (amb * 0.95 + sunE * ndl * 0.18);
  let R = reflect(-V, N);
  let rough = select(1.6, 4.2, in.kind > 0.5);
  let spec = textureSampleLevel(envCube, sampC, R, rough).rgb;
  let fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  col += spec * fres * select(0.28, 0.06, in.kind > 0.5);
  // Sails pass a little sunset light when seen from behind.
  if (in.kind > 0.5) {
    col += in.col * sunE * clamp(-dot(N, Ld), 0.0, 1.0) * 0.07;
  }
  let viewDir = -V;
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist);
  let fogDir = normalize(vec3f(viewDir.x, 0.02, viewDir.z));
  let fogCol = textureSampleLevel(envCube, sampC, fogDir, 1.0).rgb;
  col = col * T + fogCol * (1.0 - T);
  return vec4f(col, 1.0);
}
`;

// Five wave heights: center, bow, stern, port, starboard. Same inversion as the camera probe.
export const BOAT_PROBE = FRAME_WGSL + /* wgsl */ `
struct ProbeIn { p: array<vec4f, 5> };
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var dispTex: texture_2d_array<f32>;
@group(0) @binding(2) var sampR: sampler;
@group(0) @binding(3) var<uniform> pin: ProbeIn;
@group(0) @binding(4) var<storage, read_write> outH: array<f32, 8>;
` + DISP_FN + /* wgsl */ `
@compute @workgroup_size(1)
fn main() {
  for (var i = 0u; i < 5u; i++) {
    let goal = pin.p[i].xz;
    var x0 = goal;
    for (var k = 0; k < 4; k++) {
      x0 = goal - dispAt(x0).xz;
    }
    outH[i] = dispAt(x0).y;
  }
}
`;
