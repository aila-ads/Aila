import { describe, expect, it } from 'vitest';
import { deviceLabel } from '../../../packages/auth/src/device';

describe('deviceLabel', () => {
  it('names the browser and system', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(
      deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toBe('Firefox on macOS');
  });

  it('returns null for unknown or missing user agents', () => {
    expect(deviceLabel('node')).toBeNull();
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel('')).toBeNull();
  });
});
