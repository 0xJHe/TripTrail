import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { HalalLabels } from '@/features/planning/components/HalalLabels';
import { HALAL_TAG, JAKIM_LINK, halalLabels, inMalaysia, isFoodStop, jakimSearchUrl } from '@/features/planning/halal';

const at = (lat: number, lng: number) => ({ address: null, lat, lng });

describe('inMalaysia', () => {
  it('reads the saved address first', () => {
    expect(inMalaysia({ address: 'Lebuh Chulia, 10200 George Town, Pulau Pinang, Malaysia', lat: null, lng: null })).toBe(true);
    expect(inMalaysia({ address: 'Jalan Alor, Bukit Bintang, Kuala Lumpur', lat: null, lng: null })).toBe(true);
    expect(inMalaysia({ address: '1 Raffles Place, Singapore 048616', lat: 5.41, lng: 100.33 })).toBe(false);
    expect(inMalaysia({ address: 'Patong, Phuket, Thailand', lat: null, lng: null })).toBe(false);
  });

  it('falls back to the location', () => {
    expect(inMalaysia(at(5.4164, 100.3327))).toBe(true); // George Town
    expect(inMalaysia(at(3.1466, 101.6958))).toBe(true); // Kuala Lumpur
    expect(inMalaysia(at(6.35, 99.8))).toBe(true); // Langkawi
    expect(inMalaysia(at(1.4927, 103.7414))).toBe(true); // Johor Bahru
    expect(inMalaysia(at(1.5535, 110.3593))).toBe(true); // Kuching
    expect(inMalaysia(at(5.9804, 116.0735))).toBe(true); // Kota Kinabalu
    expect(inMalaysia(at(1.2834, 103.8607))).toBe(false); // Singapore
    expect(inMalaysia(at(7.0086, 100.4747))).toBe(false); // Hat Yai
    expect(inMalaysia(at(4.9031, 114.9398))).toBe(false); // Bandar Seri Begawan
    expect(inMalaysia(at(-8.65, 115.2167))).toBe(false); // Bali
    expect(inMalaysia(at(35.68, 139.76))).toBe(false); // Tokyo
  });

  it('no address and no location: not Malaysia', () => {
    expect(inMalaysia({ address: null, lat: null, lng: null })).toBe(false);
  });
});

describe('halalLabels', () => {
  const food = { category: 'food' as const, ...at(5.4164, 100.3327) };
  it('food stops in Malaysia: the tag and the JAKIM link when someone chose halal', () => {
    expect(halalLabels(food, true)).toEqual({ tag: true, jakim: true });
  });
  it('nobody chose halal: nothing extra, in Malaysia too', () => {
    expect(halalLabels(food, false)).toEqual({ tag: false, jakim: false });
    expect(halalLabels({ category: 'food', ...at(-8.65, 115.2167) }, false)).toEqual({ tag: false, jakim: false });
  });
  it('food stops outside Malaysia: tag only, no JAKIM', () => {
    expect(halalLabels({ category: 'food', ...at(-8.65, 115.2167) }, true)).toEqual({ tag: true, jakim: false });
  });
  it('other stops get nothing', () => {
    expect(halalLabels({ category: 'sight', ...at(5.4164, 100.3327) }, true)).toEqual({ tag: false, jakim: false });
    expect(isFoodStop({ category: null })).toBe(false);
  });
});

describe('jakimSearchUrl', () => {
  it("opens JAKIM's official food premises search with the name filled in", () => {
    const url = jakimSearchUrl(' Nasi Kandar Line Clear ');
    expect(url.startsWith('https://www.halal.gov.my/index.php?')).toBe(true);
    expect(url).toContain('category=PE');
    expect(url).toContain('cari=Nasi%20Kandar%20Line%20Clear');
  });
});

describe('HalalLabels', () => {
  const stop = { name: 'Line Clear', category: 'food' as const, ...at(5.4164, 100.3327) };
  it('shows the grey tag and the JAKIM link, which opens the search', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<HalalLabels stop={stop} needsHalal />);
    expect(screen.getByText(HALAL_TAG)).toBeTruthy();
    await fireEvent.press(screen.getByText(JAKIM_LINK));
    expect(open).toHaveBeenCalledWith(jakimSearchUrl('Line Clear'));
    open.mockRestore();
  });
  it('outside Malaysia: no JAKIM link', async () => {
    await render(<HalalLabels stop={{ ...stop, lat: -8.65, lng: 115.2167 }} needsHalal />);
    expect(screen.getByText(HALAL_TAG)).toBeTruthy();
    expect(screen.queryByText(JAKIM_LINK)).toBeNull();
  });
  it('reads "Check halal status →"', () => {
    expect(JAKIM_LINK).toBe('Check halal status →');
  });
  it('nobody chose halal: no tag and no link', async () => {
    await render(<HalalLabels stop={stop} needsHalal={false} />);
    expect(screen.queryByText(HALAL_TAG)).toBeNull();
    expect(screen.queryByText(JAKIM_LINK)).toBeNull();
  });
  it('not a food stop: nothing', async () => {
    await render(<HalalLabels stop={{ ...stop, category: 'sight' }} needsHalal />);
    expect(screen.queryByText(HALAL_TAG)).toBeNull();
    expect(screen.queryByText(JAKIM_LINK)).toBeNull();
  });
});
