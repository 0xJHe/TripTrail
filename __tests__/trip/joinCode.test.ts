import { looksLikeJoinCode, makeJoinCode, normalizeJoinCode } from '@/features/trip/joinCode';

describe('makeJoinCode', () => {
  it('uses a word from the trip name and 3 random characters', () => {
    const code = makeJoinCode('Holiday with the gang', () => 0);
    expect(code).toBe('gang-aaa');
    expect(looksLikeJoinCode(code)).toBe(true);
  });

  it('falls back to "trip" when the name has no usable word', () => {
    expect(makeJoinCode('!!', () => 0)).toBe('trip-aaa');
  });

  it('keeps codes short', () => {
    expect(makeJoinCode('Langkawiiiii', () => 0)).toBe('langka-aaa');
  });
});

describe('normalizeJoinCode', () => {
  it('ignores case and spaces', () => {
    expect(normalizeJoinCode('  GANG-7K2 ')).toBe('gang-7k2');
    expect(normalizeJoinCode('gang 7k2')).toBe('gang-7k2');
  });

  it('pulls the code out of a pasted invite link', () => {
    expect(normalizeJoinCode('exp://192.168.1.5:8081/--/j/gang-7k2')).toBe('gang-7k2');
    expect(normalizeJoinCode('triptrail://join?code=gang-7k2')).toBe('gang-7k2');
  });
});
