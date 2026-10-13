import { STALE_MS, type MapMember } from '@/features/group/groupMap';
import {
  batteryText,
  groupCountLabel,
  groupRows,
  isLowBattery,
  leaveText,
  locationText,
  type GroupRowsInput,
} from '@/features/group/groupList';

const T = Date.parse('2026-10-12T10:00:00+08:00');
const at = (id: string, over: Partial<MapMember> = {}): MapMember => ({
  id,
  name: id,
  isMe: false,
  lat: 5.41,
  lng: 100.33,
  battery: 80,
  seenAt: T - 60_000,
  ...over,
});

function input(over: Partial<GroupRowsInput> = {}): GroupRowsInput {
  return {
    members: [
      { id: 'm1', display_name: 'Aisha' },
      { id: 'm2', display_name: 'Ravi' },
      { id: 'm3', display_name: 'Mei' },
    ],
    meId: 'm2',
    organiserId: 'm1',
    placed: [],
    closed: new Set(),
    demo: false,
    time: T,
    ...over,
  };
}

describe('groupRows', () => {
  it('lists members in join order with You and Organiser tags', () => {
    const rows = groupRows(input());
    expect(rows.map((r) => r.name)).toEqual(['Aisha', 'Ravi', 'Mei']);
    expect(rows.map((r) => [r.isMe, r.organiser])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it('never carries anyone’s preferences', () => {
    const keys = Object.keys(groupRows(input())[0]).sort();
    expect(keys).toEqual(['battery', 'color', 'demo', 'id', 'isMe', 'location', 'name', 'organiser']);
  });

  it('gives each member their location state and battery', () => {
    const rows = groupRows(
      input({
        placed: [
          at('m1', { battery: 12 }),
          at('m2', { isMe: true, seenAt: T - 10 * 60_000 }),
          at('m3', { seenAt: T - STALE_MS - 1 }),
        ],
      }),
    );
    expect(rows[0].location).toEqual({ kind: 'sharing' });
    expect(rows[0].battery).toBe(12);
    // My own position is never "last seen".
    expect(rows[1].location).toEqual({ kind: 'sharing' });
    expect(rows[2].location).toEqual({ kind: 'last-seen', at: T - STALE_MS - 1 });
  });

  it('shows location off without a position, and Done for today over everything', () => {
    const rows = groupRows(input({ placed: [at('m1')], closed: new Set(['m1']) }));
    expect(rows[0].location).toEqual({ kind: 'done' });
    expect(rows[1].location).toEqual({ kind: 'off' });
  });

  it('adds the demo replay’s made-up members in Demo mode, with their fake status', () => {
    const placed = [
      at('m2', { isMe: true }),
      at('demo-mei', { name: 'Mei (demo)', battery: 13, seenAt: T - 5 * 60_000 }),
      at('demo-sam', { name: 'Sam (demo)', done: true }),
    ];
    const rows = groupRows(input({ placed, demo: true }));
    expect(rows.map((r) => r.name)).toEqual(['Aisha', 'Ravi', 'Mei', 'Mei (demo)', 'Sam (demo)']);
    const [mei, sam] = rows.slice(3);
    expect(mei).toMatchObject({ demo: true, organiser: false, isMe: false, battery: 13 });
    expect(mei.location.kind).toBe('last-seen');
    expect(sam.location).toEqual({ kind: 'done' });
    // Not in Demo mode: only the real members.
    expect(groupRows(input({ placed }))).toHaveLength(3);
  });

  it('finds my demo position when the replay calls me "me"', () => {
    const rows = groupRows(input({ placed: [at('me', { isMe: true, battery: 55 })], demo: true }));
    expect(rows[1]).toMatchObject({ isMe: true, battery: 55, location: { kind: 'sharing' } });
    expect(rows).toHaveLength(3);
  });
});

describe('texts', () => {
  it('says where each member is', () => {
    expect(locationText({ kind: 'sharing' })).toBe('Sharing location');
    expect(locationText({ kind: 'off' })).toBe('Location off');
    expect(locationText({ kind: 'done' })).toBe('Done for today');
    expect(locationText({ kind: 'last-seen', at: new Date(2026, 9, 12, 14, 20).getTime() })).toBe('Last seen 14:20');
  });

  it('shows battery and flags it below 15%', () => {
    expect(batteryText(84)).toBe('84%');
    expect(batteryText(null)).toBeNull();
    expect(isLowBattery(14)).toBe(true);
    expect(isLowBattery(15)).toBe(false);
    expect(isLowBattery(null)).toBe(false);
  });

  it('describes the group size', () => {
    expect(groupCountLabel([{ demo: false }])).toBe('Just you');
    expect(groupCountLabel([{ demo: false }, { demo: false }, { demo: true }])).toBe('2 members · 1 demo');
  });

  it('warns the last member that leaving deletes the trip', () => {
    expect(leaveText(true)).toBe("You're the last member. Leaving will delete this trip.");
    expect(leaveText(false)).not.toMatch(/delete/);
  });
});

describe('groupRows on a demo trip', () => {
  const madeUp = [{ id: 'm9', display_name: 'Aisha (demo)' }];

  it('lists the made-up member after the real ones, marked Demo, location off', () => {
    const rows = groupRows(input({ madeUp }));
    expect(rows.map((r) => r.name)).toEqual(['Aisha', 'Ravi', 'Mei', 'Aisha (demo)']);
    expect(rows[3]).toMatchObject({ demo: true, isMe: false, organiser: false, battery: null, location: { kind: 'off' } });
    expect(groupCountLabel(rows)).toBe('3 members · 1 demo');
  });

  it('shows them once in Demo mode, where the replay already walks them', () => {
    const placed = [at('m2', { isMe: true }), at('demo-aisha', { name: 'Aisha (demo)', battery: 70 })];
    const rows = groupRows(input({ madeUp, placed, demo: true }));
    expect(rows.filter((r) => r.name === 'Aisha (demo)')).toEqual([expect.objectContaining({ id: 'demo-aisha', battery: 70 })]);
  });
});
