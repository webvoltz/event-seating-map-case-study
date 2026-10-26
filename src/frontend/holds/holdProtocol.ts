// Excerpt: src/utils/holdProtocol.ts
// The cross-tab hold protocol as pure functions. No timers, no I/O,
// so every rule here is unit-tested directly.

import type { HoldMap, HoldMessage, SeatHold, WireHold } from '../interfaces/venue.interfaces';

export const SELECTION_HOLD_MS = 5 * 60_000;
export const CLOCK_SKEW_TOLERANCE_MS = 2_000;
// Versioned so a protocol change can't cross-talk with an old, unreloaded tab.
export const HOLD_CHANNEL_NAME = 'venue-holds-v1';

// Every inbound message is untrusted until it passes this guard.
export function isHoldMessage(data: unknown): data is HoldMessage {
  if (typeof data !== 'object' || data === null) return false;
  if (!('type' in data) || !('from' in data) || !('sentAt' in data)) return false;
  if (typeof data.type !== 'string' || typeof data.from !== 'string') return false;
  if (typeof data.sentAt !== 'number') return false;

  switch (data.type) {
    case 'hello':
      return 'ownedSeatIds' in data && isStringArray(data.ownedSeatIds);
    case 'hold':
      return (
        'seatIds' in data &&
        'expiresAt' in data &&
        isStringArray(data.seatIds) &&
        typeof data.expiresAt === 'number'
      );
    // ... 'state', 'sold', 'goodbye'
    default:
      return false;
  }
}

// Tabs share one machine clock, so skew is usually zero. When it isn't
// (a sleeping laptop, a throttled tab), shift the expiry instead of trusting it.
export function translateExpiry(expiresAt: number, sentAt: number, receivedAt: number): number {
  const skew = receivedAt - sentAt;
  if (Math.abs(skew) <= CLOCK_SKEW_TOLERANCE_MS) return expiresAt;
  return expiresAt + skew;
}

// Returns the SAME Map when nothing lapsed. The store relies on reference
// equality to skip a re-render, and a toBe() test locks that in.
export function pruneHolds(holds: HoldMap, now: number): HoldMap {
  let changed = false;
  const next = new Map<string, SeatHold>();
  for (const [seatId, hold] of holds) {
    if (hold.expiresAt > now) next.set(seatId, hold);
    else changed = true;
  }
  return changed ? next : holds;
}

export interface PeerHoldResult {
  holds: HoldMap;
  lostSeatIds: string[];
  mustRepost: boolean;
}

// A 'hold' message carries the sender's ENTIRE current claim. It replaces
// whatever we had for that sender, so a dropped message heals on the next one.
//
// Two tabs claiming the same seat at the same instant: the lower session id
// wins. Every tab applies the same rule to the same inputs, so they all agree
// without a coordinator.
export function ingestPeerHold(
  holds: HoldMap,
  selectedSeats: ReadonlySet<string>,
  mySessionId: string,
  message: { from: string; seatIds: readonly string[]; expiresAt: number },
): PeerHoldResult {
  if (message.from === mySessionId) return { holds, lostSeatIds: [], mustRepost: false };

  const next = new Map(holds);
  for (const [seatId, hold] of next) {
    if (hold.owner === message.from) next.delete(seatId);
  }

  const lostSeatIds: string[] = [];
  let mustRepost = false;

  for (const seatId of message.seatIds) {
    if (selectedSeats.has(seatId)) {
      if (message.from < mySessionId) {
        next.set(seatId, { seatId, owner: message.from, expiresAt: message.expiresAt });
        lostSeatIds.push(seatId); // we lose: release it and tell the user
      } else {
        mustRepost = true; // we win: re-announce so the other tab backs off
      }
    } else {
      next.set(seatId, { seatId, owner: message.from, expiresAt: message.expiresAt });
    }
  }

  return { holds: next, lostSeatIds, mustRepost };
}

// A join-time 'state' snapshot is authoritative: a tab that opens late
// adopts what existing tabs already hold, with no tie-break.
export function adoptRemoteState(
  selectedSeats: ReadonlySet<string>,
  mySessionId: string,
  snapshot: readonly WireHold[],
): { holds: HoldMap; lostSeatIds: string[] } {
  const next = new Map<string, SeatHold>();
  const lostSeatIds: string[] = [];
  for (const wire of snapshot) {
    if (wire.owner === mySessionId) continue;
    next.set(wire.seatId, { seatId: wire.seatId, owner: wire.owner, expiresAt: wire.expiresAt });
    if (selectedSeats.has(wire.seatId)) lostSeatIds.push(wire.seatId);
  }
  return { holds: next, lostSeatIds };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
