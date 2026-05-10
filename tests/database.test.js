// Unit tests for db functions whose value lies in the SQL sequence itself —
// e.g. transactions like mergeTunes. These tests mock the `pg` module directly
// so we can observe the BEGIN/COMMIT envelope and the per-step queries.
//
// Route-level tests (tests/tunes.test.js) mock the db module wholesale and
// can't reach this layer, so transaction logic was previously uncovered.

jest.mock('pg', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() };
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve(mockClient)),
  };
  return {
    Pool: jest.fn(() => mockPool),
    __mockPool: mockPool,
    __mockClient: mockClient,
  };
});

const pg = require('pg');
const mockPool = pg.__mockPool;
const mockClient = pg.__mockClient;
const db = require('../db/database');

// Driver for tests: each handler matches a SQL pattern and returns canned
// rows or runs a side-effect. Calls fall through in declaration order.
function setupQueries(handlers) {
  mockClient.query.mockImplementation(async (sql, params = []) => {
    const handler = handlers.find(h => h.match.test(sql));
    if (!handler) throw new Error(`Unexpected client.query: ${sql}`);
    const out = typeof handler.respond === 'function' ? handler.respond(params) : handler.respond;
    return out || { rows: [] };
  });
}

describe('mergeTunes', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockClear();
    mockPool.query.mockReset();
    mockPool.connect.mockClear();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it('sums counts and updates the primary', async () => {
    // Phase 6 of design/PerInstrumentStatus.md removed the learning_status
    // best-of from mergeTunes — that column is no longer written. The only
    // tune-level column the merge updates now is count.
    const tunes = [
      { id: 1, count: 3 },
      { id: 2, count: 5 },
      { id: 3, count: 1 },
    ];
    let updateParams = null;
    setupQueries([
      { match: /^BEGIN$/, respond: {} },
      { match: /SELECT \* FROM tunes WHERE id = ANY/, respond: { rows: tunes } },
      { match: /^UPDATE tunes SET count/, respond: (params) => { updateParams = params; return {}; } },
      { match: /SELECT set_id FROM set_tunes WHERE tune_id/, respond: { rows: [] } },
      { match: /^DELETE FROM tunes WHERE id/, respond: {} },
      { match: /^COMMIT$/, respond: {} },
    ]);
    // Two pool.query calls happen inside mergeTunes' final getTuneById:
    //   1. SELECT t.*, EXISTS(...) FROM tunes ...        → return the row
    //   2. SELECT ... FROM class JOIN class_tunes ...    → return [] (no classes)
    mockPool.query.mockImplementation((sql) => {
      if (/class_tunes/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{ id: 1, count: 9 }] });
    });

    const result = await db.mergeTunes(1, [2, 3], 99);

    expect(updateParams[0]).toBe(9);   // total count
    expect(updateParams[1]).toBe(1);   // primary id
    expect(updateParams[2]).toBe(99);  // user id
    expect(result).toMatchObject({ id: 1, count: 9 });
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('redirects a set_tunes row when the primary is not yet in that set', async () => {
    const tunes = [
      { id: 1, learning_status: 'Memorized', count: 2 },
      { id: 2, learning_status: 'Learning', count: 1 },
    ];
    let redirect = null;
    setupQueries([
      { match: /^BEGIN$/, respond: {} },
      { match: /SELECT \* FROM tunes WHERE id = ANY/, respond: { rows: tunes } },
      { match: /^UPDATE tunes SET count/, respond: {} },
      { match: /SELECT set_id FROM set_tunes WHERE tune_id/, respond: { rows: [{ set_id: 10 }] } },
      // primary is NOT yet a member of set 10
      { match: /^SELECT id FROM set_tunes WHERE set_id/, respond: { rows: [] } },
      { match: /^UPDATE set_tunes SET tune_id/, respond: (params) => { redirect = params; return {}; } },
      { match: /^DELETE FROM tunes WHERE id/, respond: {} },
      { match: /^COMMIT$/, respond: {} },
    ]);
    mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

    await db.mergeTunes(1, [2], 99);
    // UPDATE set_tunes SET tune_id = $1 WHERE set_id = $2 AND tune_id = $3
    expect(redirect).toEqual([1, 10, 2]);
  });

  it('deletes the duplicate set_tunes row when the primary is already in that set', async () => {
    const tunes = [
      { id: 1, learning_status: 'Memorized', count: 2 },
      { id: 2, learning_status: 'Learning', count: 1 },
    ];
    let deleteParams = null;
    let updateAttempted = false;
    setupQueries([
      { match: /^BEGIN$/, respond: {} },
      { match: /SELECT \* FROM tunes WHERE id = ANY/, respond: { rows: tunes } },
      { match: /^UPDATE tunes SET count/, respond: {} },
      { match: /SELECT set_id FROM set_tunes WHERE tune_id/, respond: { rows: [{ set_id: 10 }] } },
      // primary IS already a member of set 10
      { match: /^SELECT id FROM set_tunes WHERE set_id/, respond: { rows: [{ id: 555 }] } },
      { match: /^UPDATE set_tunes SET tune_id/, respond: () => { updateAttempted = true; return {}; } },
      { match: /^DELETE FROM set_tunes WHERE set_id/, respond: (params) => { deleteParams = params; return {}; } },
      { match: /^DELETE FROM tunes WHERE id/, respond: {} },
      { match: /^COMMIT$/, respond: {} },
    ]);
    mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

    await db.mergeTunes(1, [2], 99);
    expect(updateAttempted).toBe(false);     // no redirect when primary already in set
    expect(deleteParams).toEqual([10, 2]);   // duplicate set membership row removed
  });

  it('rolls back and returns null when not all requested tunes belong to the user', async () => {
    let rolledBack = false;
    let committed = false;
    setupQueries([
      { match: /^BEGIN$/, respond: {} },
      // requested 3 ids but only 1 row comes back → ownership mismatch
      { match: /SELECT \* FROM tunes WHERE id = ANY/, respond: { rows: [{ id: 1 }] } },
      { match: /^ROLLBACK$/, respond: () => { rolledBack = true; return {}; } },
      { match: /^COMMIT$/, respond: () => { committed = true; return {}; } },
    ]);

    const result = await db.mergeTunes(1, [2, 3], 99);
    expect(result).toBeNull();
    expect(rolledBack).toBe(true);
    expect(committed).toBe(false);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
