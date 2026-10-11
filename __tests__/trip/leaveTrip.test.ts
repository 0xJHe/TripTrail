const mockList = jest.fn();
const mockRemove = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ list: mockList, remove: mockRemove }) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { leaveTrip } from '@/features/trip/api';

beforeEach(() => {
  mockList.mockReset();
  mockRemove.mockReset().mockResolvedValue({ data: [], error: null });
  mockRpc.mockReset().mockResolvedValue({ data: 'left', error: null });
});

describe('leaveTrip', () => {
  it('removes only my pin photos, then leaves', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'm1-1700-abc.jpg' }, { name: 'm10-1700-xyz.jpg' }], error: null });
    await expect(leaveTrip('t1', 'm1', false)).resolves.toBe('left');
    expect(mockList).toHaveBeenCalledWith('t1', { limit: 1000, search: 'm1-' });
    expect(mockRemove).toHaveBeenCalledWith(['t1/m1-1700-abc.jpg']);
    expect(mockRpc).toHaveBeenCalledWith('leave_trip', { p_trip: 't1' });
    expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
  });

  it('the last member removes every photo in the trip and deletes it', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'm1-1.jpg' }, { name: 'm2-2.jpg' }], error: null });
    mockRpc.mockResolvedValue({ data: 'deleted', error: null });
    await expect(leaveTrip('t1', 'm1', true)).resolves.toBe('deleted');
    expect(mockList).toHaveBeenCalledWith('t1', { limit: 1000 });
    expect(mockRemove).toHaveBeenCalledWith(['t1/m1-1.jpg', 't1/m2-2.jpg']);
  });

  it('skips storage when there are no photos', async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    await leaveTrip('t1', 'm1', false);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('stays in the trip when the photos or the leave fail', async () => {
    mockList.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(leaveTrip('t1', 'm1', false)).rejects.toThrow('offline');
    expect(mockRpc).not.toHaveBeenCalled();

    mockList.mockResolvedValue({ data: [], error: null });
    mockRpc.mockResolvedValue({ data: null, error: new Error('Not a member of this trip') });
    await expect(leaveTrip('t1', 'm1', false)).rejects.toThrow('Not a member');
  });
});
