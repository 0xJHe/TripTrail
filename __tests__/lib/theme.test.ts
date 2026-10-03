import { colors, formatMoney } from '@/lib/theme';

describe('theme', () => {
  it('has the design token colours', () => {
    expect(colors.navy).toBe('#14284F');
    expect(colors.teal).toBe('#00A38F');
  });

  it('formats money with ~ for estimates', () => {
    expect(formatMoney(16, true)).toBe('~RM 16');
    expect(formatMoney(120)).toBe('RM 120');
  });
});
