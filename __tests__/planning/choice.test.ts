import { agreedOption, choiceLine, choosersByOption, leadingChoice } from '@/features/planning/choice';

const m = (id: string, chosen: string | null) => ({ id, chosen_option_id: chosen });
const names = [
  { id: 'penang', name: 'Penang Food Trail' },
  { id: 'melaka', name: 'Melaka' },
];

describe('everyone chose the same trip', () => {
  it('is the trip when every member chose it', () => {
    expect(agreedOption([m('a', 'penang'), m('b', 'penang'), m('c', 'penang')])).toBe('penang');
  });

  it('is null while someone chose a different trip', () => {
    expect(agreedOption([m('a', 'penang'), m('b', 'melaka'), m('c', 'penang')])).toBeNull();
  });

  it('is null while someone has not chosen', () => {
    expect(agreedOption([m('a', 'penang'), m('b', null)])).toBeNull();
    expect(agreedOption([m('a', null), m('b', null)])).toBeNull();
  });

  it('is enough for a solo trip to choose once', () => {
    expect(agreedOption([m('a', 'melaka')])).toBe('melaka');
    expect(agreedOption([m('a', null)])).toBeNull();
  });

  it('is null with no members', () => {
    expect(agreedOption([])).toBeNull();
  });
});

describe('who chose what', () => {
  const members = [m('a', 'penang'), m('b', 'melaka'), m('c', 'penang'), m('d', null)];

  it('groups members by the trip they chose', () => {
    const map = choosersByOption(members);
    expect(map.get('penang')).toEqual(['a', 'c']);
    expect(map.get('melaka')).toEqual(['b']);
  });

  it('finds the leading trip', () => {
    expect(leadingChoice(members, ['melaka', 'penang'])).toEqual({ optionId: 'penang', count: 2 });
    expect(leadingChoice([m('a', null)], ['penang'])).toBeNull();
  });

  it('writes the line shown on the Results screen', () => {
    expect(choiceLine([...members.slice(0, 3), m('d', 'penang')], names)).toBe('3 of 4 chose Penang Food Trail');
    expect(choiceLine([m('a', null), m('b', null)], names)).toBe('Nobody has chosen yet');
    expect(choiceLine([m('a', 'melaka')], names)).toBe('You chose Melaka');
  });
});
