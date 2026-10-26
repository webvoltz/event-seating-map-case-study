// Reference design: the hold service that wraps the Lua scripts.

import { readFileSync } from 'node:fs';
import type { Redis } from 'ioredis';
import { publishSeatDelta } from '../realtime/seatEvents';

export const HOLD_TTL_MS = 5 * 60_000;
export const MAX_SEATS_PER_CART = 8;

const ACQUIRE = readFileSync(new URL('./acquire_hold.lua', import.meta.url), 'utf8');
const RELEASE = readFileSync(new URL('./release_hold.lua', import.meta.url), 'utf8');

// Hash tag keeps every key for one event in one cluster slot.
const k = (eventId: string) => ({
  sold: `{evt:${eventId}}:sold`,
  cart: (token: string) => `{evt:${eventId}}:cart:${token}`,
  expiry: `{evt:${eventId}}:expiry`,
  seq: `{evt:${eventId}}:seq`,
  hold: (seatId: string) => `{evt:${eventId}}:hold:${seatId}`,
});

export type HoldResult =
  | { ok: true; expiresAt: number; serverNow: number }
  | { ok: false; reason: 'seats_taken'; seatIds: string[] }
  | { ok: false; reason: 'cart_limit' };

export class HoldService {
  constructor(private readonly redis: Redis) {
    // Scripts are cached server-side; EVALSHA sends a 40-byte hash, not the script body.
    redis.defineCommand('acquireHold', { lua: ACQUIRE });
    redis.defineCommand('releaseHold', { lua: RELEASE });
  }

  async acquire(eventId: string, token: string, seatIds: readonly string[]): Promise<HoldResult> {
    const keys = k(eventId);
    // Sorted so two requests for overlapping blocks always touch keys in the same order.
    const seats = [...new Set(seatIds)].sort();

    const reply = (await (this.redis as RedisWithScripts).acquireHold(
      4 + seats.length,
      keys.sold, keys.cart(token), keys.expiry, keys.seq,
      ...seats.map(keys.hold),
      token, HOLD_TTL_MS, MAX_SEATS_PER_CART,
      ...seats,
    )) as [number, ...(string | number)[]];

    const [status, ...rest] = reply;
    if (status === -1) return { ok: false, reason: 'cart_limit' };
    if (status === 0) return { ok: false, reason: 'seats_taken', seatIds: rest.map(String) };

    const [expiresAt, seq] = rest.map(Number);
    await publishSeatDelta(this.redis, eventId, { seq, status: 'held', seatIds: seats, expiresAt });
    // The client gets the server's clock too, so its countdown can correct for skew.
    return { ok: true, expiresAt, serverNow: Date.now() };
  }

  async release(eventId: string, token: string, seatIds: readonly string[]): Promise<string[]> {
    const keys = k(eventId);
    const reply = (await (this.redis as RedisWithScripts).releaseHold(
      3 + seatIds.length,
      keys.cart(token), keys.expiry, keys.seq,
      ...seatIds.map(keys.hold),
      token,
      ...seatIds,
    )) as [number, ...string[]];

    const [seq, ...released] = reply;
    if (released.length > 0) {
      await publishSeatDelta(this.redis, eventId, { seq, status: 'released', seatIds: released });
    }
    return released;
  }

  // Called at checkout: confirms the cart still owns every seat and stretches the
  // hold to cover the payment window, so the seats can't lapse mid-payment.
  async confirmForCheckout(
    eventId: string,
    token: string,
    seatIds: readonly string[],
    paymentWindowMs: number,
  ): Promise<{ ok: true } | { ok: false; missing: string[] }> {
    const keys = k(eventId);
    const owners = await this.redis.mget(...seatIds.map(keys.hold));
    const missing = seatIds.filter((_, i) => owners[i] !== token);
    if (missing.length > 0) return { ok: false, missing };

    const tx = this.redis.multi();
    for (const id of seatIds) tx.pexpire(keys.hold(id), paymentWindowMs);
    tx.pexpire(keys.cart(token), paymentWindowMs);
    await tx.exec();
    // A hold that lapsed between MGET and PEXPIRE is caught by Postgres anyway:
    // the ticket insert is the final arbiter, not this check.
    return { ok: true };
  }
}

type RedisWithScripts = Redis & {
  acquireHold: (...args: (string | number)[]) => Promise<unknown>;
  releaseHold: (...args: (string | number)[]) => Promise<unknown>;
};
