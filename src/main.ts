import './style.css';
import { OCEAN_INTEGRATION } from './ocean/integration';
import { mountHud, readLaunch, setStatus, showError } from './render/hud';
import { mountSpike } from './render/spike';

const launch = readLaunch();
const canvas = document.getElementById('c');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('missing canvas');
}

async function boot(): Promise<void> {
  let frames = 0;
  let last = performance.now();
  const spike = await mountSpike(canvas as HTMLCanvasElement, launch.sea);
  mountHud(launch, (sea) => spike.setSea(sea));
  setStatus('client ready', `path ${OCEAN_INTEGRATION} · compute spike`);

  const loop = (now: number) => {
    spike.frame();
    frames++;
    if (now - last > 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      setStatus(`${fps} fps`, `path ${OCEAN_INTEGRATION} · compute spike`);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  showError(message);
  setStatus('failed');
});
