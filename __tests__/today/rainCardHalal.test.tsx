import { render, screen } from '@testing-library/react-native';

import { HALAL_TAG, JAKIM_LINK } from '@/features/planning/halal';
import type { Stop } from '@/features/planning/types';
import { RainCard } from '@/features/today/components/RainCard';
import type { RainState } from '@/features/today/hooks/useRainAlert';
import type { RainOption } from '@/supabase/functions/_shared/nearby';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const option = (name: string, halalNote: boolean): RainOption => ({
  placeId: name,
  name,
  kind: 'Restaurant',
  category: 'food',
  distanceM: 300,
  walkMin: 4,
  ride: false,
  price: 15,
  halalNote,
  mustHave: null,
  lat: 5.4164,
  lng: 100.3327,
});

const rain = (options: RainOption[]) =>
  ({
    alert: { options },
    stop: { id: 's1', name: 'Armenian Street murals' } as Stop,
    minutes: 40,
    note: null,
    go: jest.fn(),
    keep: jest.fn(),
    deciding: null,
  }) as unknown as RainState;

describe('RainCard halal labels', () => {
  it('a food place when someone chose halal: the grey tag only, no JAKIM link', async () => {
    await render(<RainCard rain={rain([option('Nasi Kandar Line Clear', true)])} />);
    expect(screen.getByText(HALAL_TAG)).toBeTruthy();
    expect(screen.queryByText(JAKIM_LINK)).toBeNull();
  });

  it('nobody chose halal: nothing extra', async () => {
    await render(<RainCard rain={rain([option('Nasi Kandar Line Clear', false)])} />);
    expect(screen.queryByText(HALAL_TAG)).toBeNull();
    expect(screen.queryByText(JAKIM_LINK)).toBeNull();
  });
});
