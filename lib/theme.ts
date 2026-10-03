// Design tokens — see CLAUDE.md "Design tokens" and design/prototype.html.

export const colors = {
  navy: '#14284F', // headers, all "Now" blocks (white text on navy)
  teal: '#00A38F', // every primary action button
  red: '#D64545', // problem (running late)
  green: '#2E9E5B', // good news (running early, cost change 0)
  amber: '#E39B21', // worth knowing (far member, low battery)
  blue: '#3B7DD8', // weather (rain)
  white: '#FFFFFF',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1B2433',
  textMuted: '#6B7588',
  border: '#E3E7EE',
} as const;

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

export const fontFamily = {
  regular: 'Inter',
  medium: 'Inter-Medium',
  bold: 'Inter-Bold',
} as const;

export const radius = {
  card: 16,
  button: 12,
  pill: 999,
} as const;

export const button = {
  minHeight: 48,
} as const;

export const currency = 'RM';

/** Money label. Estimates get a "~" prefix, e.g. ~RM 16. */
export function formatMoney(amount: number, isEstimate = false): string {
  const rounded = Math.round(amount);
  return `${isEstimate ? '~' : ''}${currency} ${rounded}`;
}

export const theme = { colors, spacing, fontSize, fontFamily, radius, button, currency };
export type Theme = typeof theme;
