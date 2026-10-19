// How the repo's WGSL ocean sits inside Three.js. Architecture doc §3.3.
// 'A' — compute nodes. WGSL bodies via wgslFn, workgroup memory, storage textures.
// 'B' — one GPUDevice shared with WebGPURenderer, original pipelines unchanged.
//
// The spike in src/render/spike.ts is what earns 'A': a workgroup array, a barrier,
// a wgslFn body, and a storage texture on a quad. The FFT itself is still in js/wgsl.
export type OceanIntegration = 'A' | 'B';

export const OCEAN_INTEGRATION: OceanIntegration = 'A';
