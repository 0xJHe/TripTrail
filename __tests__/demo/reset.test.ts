import { demoLeftovers } from '@/features/demo/reset';

const since = Date.parse('2026-10-12T00:00:00Z'); // the fake start time (Day 1's replay start)
const before = '2026-10-11T23:00:00Z';
const during = '2026-10-12T10:30:00Z';

describe('demoLeftovers (Reset)', () => {
  const pins = [
    { id: 'p1', member_id: 'me', created_at: during },
    { id: 'p2', member_id: 'me', created_at: before },
    { id: 'p3', member_id: 'other', created_at: during },
  ];
  const spends = [
    { id: 's1', member_id: 'me', stop_id: null, answered_at: during },
    { id: 's2', member_id: 'me', stop_id: null, answered_at: before },
    { id: 's3', member_id: 'me', stop_id: 'stop-1', answered_at: during },
    { id: 's4', member_id: 'other', stop_id: null, answered_at: during },
  ];

  it("removes this person's pins and extra spends made during the demo, nothing else", () => {
    const gone = demoLeftovers({ pins, spends, meId: 'me', since });
    expect(gone.pins.map((p) => p.id)).toEqual(['p1']);
    // Spend-check answers (with a stop) stay: they're ignored after the fake time anyway.
    expect(gone.spends.map((s) => s.id)).toEqual(['s1']);
  });

  it('counts a row made right at the start time', () => {
    const gone = demoLeftovers({ pins: [{ member_id: 'me', created_at: new Date(since).toISOString() }], spends: [], meId: 'me', since });
    expect(gone.pins).toHaveLength(1);
  });
});
