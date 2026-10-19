import { describe, expect, it } from 'vitest';
import { SEA_DEFAULTS, launchFromSearch, seaFromSearch } from '../src/core/params';
import { OCEAN_INTEGRATION } from '../src/ocean/integration';

describe('sea params', () => {
  it('starts from the ocean page defaults', () => {
    const sea = seaFromSearch('');
    expect(sea.windSpeed).toBe(SEA_DEFAULTS.windSpeed);
    expect(sea.sunElev).toBe(2.6);
    expect(sea.swellHs).toBe(1.8);
  });

  it('applies numeric URL knobs and ignores junk', () => {
    const sea = seaFromSearch('?windSpeed=12&sunElev=8&choppy=nope');
    expect(sea.windSpeed).toBe(12);
    expect(sea.sunElev).toBe(8);
    expect(sea.choppy).toBe(SEA_DEFAULTS.choppy);
  });

  it('reads ui, seed, and the test flag', () => {
    const on = launchFromSearch('?seed=first-light&test=1');
    expect(on.ui).toBe(true);
    expect(on.seed).toBe('first-light');
    expect(on.test).toBe(true);
    expect(launchFromSearch('?ui=0').ui).toBe(false);
    expect(launchFromSearch('').seed).toBeNull();
    expect(launchFromSearch('?test=0').test).toBe(false);
  });
});

describe('ocean integration', () => {
  it('has chosen a path', () => {
    expect(OCEAN_INTEGRATION === 'A' || OCEAN_INTEGRATION === 'B').toBe(true);
  });
});
