// Option A spike. One compute pass with the three things the FFT needs from Three:
// workgroup shared memory, a barrier, and a raw WGSL body (wgslFn), writing a storage
// texture that a quad samples. This is not the ocean. It is the proof the port can host it.
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { float, Fn, instanceIndex, texture, textureStore, time, uniform, uvec2, vec4, wgslFn, workgroupArray, workgroupBarrier } from 'three/tsl';
import type { SeaParams } from '../core/params';

const SIZE = 128;

// Same complex multiply the FFT butterflies use, kept as WGSL on purpose.
// R is this lane's x, G is the neighbor lane's x, B is this lane's y plus the
// twiddle. The last lane of each workgroup wraps to lane 0, so G drops there.
const mixPair = wgslFn(`
  fn mixPair(a: vec4f, b: vec4f, ang: f32) -> vec4f {
    let w = vec2f(cos(ang), sin(ang));
    let tw = vec2f(b.x * w.x - b.y * w.y, b.x * w.y + b.y * w.x);
    return vec4f(a.x, b.x, a.y * 0.85 + abs(tw.x) * 0.15, 1.0);
  }
`);

export type Spike = {
  setSea: (sea: SeaParams) => void;
  frame: () => void;
  ready: boolean;
};

export async function mountSpike(canvas: HTMLCanvasElement, sea: SeaParams): Promise<Spike> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false });
  const fit = () => renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  fit();
  await renderer.init();

  const storage = new THREE.StorageTexture(SIZE, SIZE);
  // Linear, no mips. Nearest makes Three treat the texture as unfilterable.
  storage.magFilter = THREE.LinearFilter;
  storage.minFilter = THREE.LinearFilter;
  storage.generateMipmaps = false;
  (storage as THREE.StorageTexture & { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = false;
  const gain = uniform(sea.exposure);

  // r186's WorkgroupInfoNode.d.ts omits element(); the runtime method is there.
  // .div() on a uint is integer division, so the coordinate has to be a float first.
  type Shared = { element(index: unknown): Node };
  const compute = Fn(() => {
    const x = instanceIndex.mod(SIZE);
    const y = instanceIndex.div(SIZE);
    const shared = workgroupArray('vec4', 64) as unknown as Shared;
    const lane = instanceIndex.mod(64);
    const base = vec4(float(x).div(SIZE), float(y).div(SIZE), 0, 1);
    shared.element(lane).assign(base);
    workgroupBarrier();
    const neighbor = shared.element(lane.add(1).mod(64));
    const mixed = mixPair({ a: base, b: neighbor, ang: time });
    textureStore(storage, uvec2(x, y), mixed).toWriteOnly();
  })().compute(SIZE * SIZE);

  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = texture(storage).mul(gain);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5);
  camera.position.z = 1;
  scene.background = new THREE.Color(0x071015);

  addEventListener('resize', fit);

  return {
    ready: true,
    setSea(next) {
      gain.value = next.exposure;
    },
    frame() {
      renderer.compute(compute);
      renderer.render(scene, camera);
    },
  };
}
