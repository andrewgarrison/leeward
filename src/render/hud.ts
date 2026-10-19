import { SEA_SLIDERS, launchFromSearch, type Launch, type SeaParams } from '../core/params';

export function readLaunch(): Launch {
  return launchFromSearch(location.search);
}

export function mountHud(launch: Launch, onChange: (sea: SeaParams) => void): void {
  const hud = document.getElementById('hud');
  const panel = document.getElementById('panel');
  if (!hud || !panel) return;
  if (!launch.ui) {
    hud.style.display = 'none';
    panel.classList.add('hidden');
  }
  const sea = launch.sea;
  for (const slider of SEA_SLIDERS) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = slider.label;
    const val = document.createElement('output');
    val.textContent = String(sea[slider.key]);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(slider.min);
    inp.max = String(slider.max);
    inp.step = String(slider.step);
    inp.value = String(sea[slider.key]);
    inp.addEventListener('input', () => {
      sea[slider.key] = Number(inp.value);
      val.textContent = inp.value;
      onChange(sea);
    });
    row.append(name, inp, val);
    panel.append(row);
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') panel.classList.toggle('hidden');
  });
}

export function setStatus(fps: string, boat?: string): void {
  const fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.textContent = fps;
  if (boat != null) {
    const boatEl = document.getElementById('boat');
    if (boatEl) boatEl.textContent = boat;
  }
}

export function showError(message: string): void {
  const el = document.getElementById('err');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = message;
}
