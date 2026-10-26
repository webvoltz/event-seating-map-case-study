// Excerpt: src/utils/holdProtocol.test.ts and holdChannel.realTransport.test.ts
// The protocol is pure, so its rules are tested directly, including the
// performance guarantee.

describe('pruneHolds', () => {
  // toBe, not toEqual. If a refactor starts returning a fresh Map on every tick,
  // all 1,500 mounted seats would re-render every second. This test catches it.
  it('returns the identical map reference when nothing has lapsed', () => {
    const holds = holdMap({ seatId: 'S1', owner: 'peer', expiresAt: 10_000 });
    expect(pruneHolds(holds, 5_000)).toBe(holds);
  });

  it('treats expiresAt === now as lapsed (strict > for "still held")', () => {
    const holds = holdMap({ seatId: 'S1', owner: 'peer', expiresAt: 5_000 });
    expect(pruneHolds(holds, 5_000).size).toBe(0);
  });
});

describe('ingestPeerHold', () => {
  it('replaces the full set of a peer’s previous holds rather than merging them', () => {
    const existing = holdMap(
      { seatId: 'S1', owner: 'peer', expiresAt: 1_000 },
      { seatId: 'S2', owner: 'peer', expiresAt: 1_000 },
    );
    const result = ingestPeerHold(existing, new Set(), 'me', {
      from: 'peer',
      seatIds: ['S2', 'S3'],
      expiresAt: 9_000,
    });
    expect(Array.from(result.holds.keys()).sort()).toEqual(['S2', 'S3']);
  });
});

describe('isHoldMessage', () => {
  // Messages from other buyers are untrusted input. Malformed shapes are dropped.
  it.each([
    null,
    { type: 'bogus', from: 'a', sentAt: 1 },
    { type: 'hold', from: 'a', sentAt: 1, seatIds: [1, 2], expiresAt: 1 },
    { type: 'hold', from: 'a', sentAt: 1, seatIds: [], expiresAt: 'not-a-number' },
  ])('rejects %o', (payload) => {
    expect(isHoldMessage(payload)).toBe(false);
  });
});

// @vitest-environment node
// jsdom has no BroadcastChannel; Node does. This file proves delivery over the
// real transport, not only the in-memory fake the other tests use.
it('a hold posted by one buyer is received by another, live', async () => {
  const receivedByB: HoldMessage[] = [];
  const buyerB = createHoldChannel('buyer-b', (msg) => receivedByB.push(msg));
  const buyerA = createHoldChannel('buyer-a', () => undefined);

  buyerA.post({ type: 'hold', from: 'buyer-a', sentAt: Date.now(), seatIds: ['SEAT-1'], expiresAt });
  await new Promise((r) => setTimeout(r, 20));

  expect(receivedByB).toHaveLength(1);
});
