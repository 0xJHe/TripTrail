// Design tokens — see CLAUDE.md "Design tokens" and design/prototype.html.

export const colors = {
  navy: '#14284F', // headers, all "Now" blocks (white text on navy)
  navyMid: '#1D4B7A', // header gradient middle
  navyTeal: '#0F6E6A', // header gradient end
  teal: '#00A38F', // every primary action button
  tealDark: '#008C7A', // teal text on light backgrounds
  tealTint: '#E3F6F2',
  red: '#D64545', // problem (running late)
  green: '#2E9E5B', // good news (running early, cost change 0)
  amber: '#E39B21', // worth knowing (far member, low battery)
  amberText: '#C77E0A',
  blue: '#3B7DD8', // weather (rain)
  white: '#FFFFFF',
  background: '#F5F7FA',
  card: '#FFFFFF',
  chip: '#EEF1F5', // ghost chip / muted fill
  text: '#1B2433',
  textMuted: '#6B7588',
  textOnNavy: '#B7C5DF', // subtitles on navy
  border: '#E3E7EE',
  disabled: '#C5CBD4',
  backdrop: '#DFE3EA',
} as const;

/** Avatar colours, given out in join order. */
export const avatarColors = ['#00A38F', '#14284F', '#8A63C9', '#E58A3A', '#3B7DD8', '#D64545', '#2E9E5B', '#C77E0A'];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  small: 12,
  body: 14,
  title: 17,
  heading: 24,
} as const;

/** Loaded in app/_layout.tsx from @expo-google-fonts/inter. */
export const fontFamily = {
  regular: 'Inter',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extrabold: 'Inter-ExtraBold',
  mono: 'monospace',
} as const;

export const radius = {
  card: 16,
  button: 14,
  field: 12,
  pill: 999,
} as const;

export const button = {
  minHeight: 48,
} as const;

/** Soft card shadow from the prototype (--sh). */
export const shadow = {
  shadowColor: '#142850',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const currency = 'RM';

/** Money label. Estimates get a "~" prefix, e.g. ~RM 16. */
export function formatMoney(amount: number, isEstimate = false): string {
  const rounded = Math.round(amount);
  return `${isEstimate ? '~' : ''}${currency} ${rounded}`;
}

export const theme = { colors, spacing, fontSize, fontFamily, radius, button, shadow, currency };
export type Theme = typeof theme;
