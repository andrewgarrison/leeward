// Island terrain. Lit by the same sun, sky, and haze as the boat.
import { FRAME_WGSL, ATMO_CORE_WGSL } from './common.js';

export const TERRAIN = FRAME_WGSL + ATMO_CORE_WGSL + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var transLUT: texture_2d<f32>;
@group(0) @binding(2) var envCube: texture_cube<f32>;
@group(0) @binding(3) var sampC: sampler;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) rel: vec3f,
  @location(1) nrm: vec3f,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  o.rel = p - F.camPos.xyz;
  o.pos = F.viewProj * vec4f(o.rel, 1.0);
  o.nrm = n;
  return o;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let dist = length(in.rel);
  let V = -in.rel / max(dist, 1e-4);
  var N = normalize(in.nrm);
  let world = in.rel + F.camPos.xyz;
  let slope = 1.0 - N.y;
  let h = world.y;

  // Sand ripples, only on the flat beach, so the shore is not a smooth sheet.
  if (slope < 0.18 && h < 2.4 && h > -0.4) {
    let rx = sin(world.x * 0.71 + world.z * 0.18);
    let rz = sin(world.z * 0.63 - world.x * 0.11);
    N = normalize(N + vec3f(rx, 0.0, rz) * 0.07);
  }

  let sand = vec3f(0.55, 0.45, 0.31);
  let wet = vec3f(0.36, 0.32, 0.25);
  let scrub = vec3f(0.28, 0.30, 0.16);
  let canopy = vec3f(0.15, 0.21, 0.10);
  let rock = vec3f(0.36, 0.33, 0.30);
  let wetness = smoothstep(1.15, 0.0, h);
  var albedo = mix(sand, wet, wetness);
  // The treeline follows a ragged height, not a single contour.
  let clump = sin(world.x * 0.020 + 1.4) * sin(world.z * 0.017);
  let mottling = sin(world.x * 0.007 - world.z * 0.009) * 0.5 + 0.5;
  let edge = 1.35 + clump * 1.3;
  let veg = smoothstep(edge, edge + 3.2, h) * (1.0 - smoothstep(0.18, 0.5, slope));
  albedo = mix(albedo, mix(scrub, canopy, mottling), veg);
  albedo = mix(albedo, rock, smoothstep(0.26, 0.58, slope));
  let mote = sin(world.x * 0.43) * sin(world.z * 0.37);
  albedo *= 0.94 + 0.06 * mote;

  let Ld = F.sunDir.xyz;
  let sunE = textureSampleLevel(transLUT, sampC, transRMuToUV(RG + F.atmo.y, Ld.y), 0.0).rgb * F.sunDir.w;
  let amb = textureSampleLevel(envCube, sampC, N, 5.0).rgb;
  let ndl = clamp(dot(N, Ld) * 0.65 + 0.35, 0.0, 1.0);
  var col = albedo * (amb * 0.95 + sunE * ndl * 0.18);

  // Wet sand and rock take a little of the sky.
  let rough = mix(2.2, 5.5, clamp(slope * 1.4 + (1.0 - wetness) * 0.6, 0.0, 1.0));
  let R = reflect(-V, N);
  let spec = textureSampleLevel(envCube, sampC, R, rough).rgb;
  let fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  col += spec * fres * mix(0.22, 0.05, 1.0 - wetness) * (1.0 - veg);

  let viewDir = -V;
  let T = exp(-max(F.fogExt.rgb, vec3f(F.fogExt.w)) * dist);
  let fogDir = normalize(vec3f(viewDir.x, 0.02, viewDir.z));
  let fogCol = textureSampleLevel(envCube, sampC, fogDir, 1.0).rgb;
  col = col * T + fogCol * (1.0 - T);
  return vec4f(col, 1.0);
}
`;
