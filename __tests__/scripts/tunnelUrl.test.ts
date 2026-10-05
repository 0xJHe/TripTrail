// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findTunnelUrl } = require('../../scripts/tunnel-url') as { findTunnelUrl: (text: string) => string | null };

describe('findTunnelUrl', () => {
  it("finds the quick tunnel address in cloudflared's output", () => {
    const log = [
      '2026-10-06T10:00:00Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account,',
      '2026-10-06T10:00:00Z INF +--------------------------------------------------------------------------------------------+',
      '2026-10-06T10:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
      '2026-10-06T10:00:00Z INF |  https://apple-river-orange-cloud.trycloudflare.com                                         |',
    ].join('\n');
    expect(findTunnelUrl(log)).toBe('https://apple-river-orange-cloud.trycloudflare.com');
  });

  it('ignores other Cloudflare links', () => {
    expect(findTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...')).toBeNull();
    expect(findTunnelUrl('see https://developers.cloudflare.com/cloudflare-one/')).toBeNull();
  });
});
