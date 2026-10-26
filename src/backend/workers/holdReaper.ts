// Reference design: background workers.
//
// Redis TTLs expire holds on their own, but nobody is told. Keyspace
// notifications are fire-and-forget and lost on reconnect, so they can't drive
// a live map. The reaper reads the expiry ZSET instead: every hold is in it
// until someone has broadcast its release.

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { publishSeatDelta } from '../realtime/seatEvents';

// Removes only seats whose hold key is really gone. A seat re-held after the
// ZRANGEBYSCORE read has a newer score and a live key, so it is skipped.
const REAP = `
  local expiryKey, seqKey = KEYS[1], KEYS[2]
  local now = tonumber(ARGV[1])
  local reaped = {}
  for i = 3, #KEYS do
    local seatId = ARGV[i - 1]
    local score = redis.call('ZSCORE', expiryKey, seatId)
    if score and tonumber(score) <= now and redis.call('EXISTS', KEYS[i]) == 0 then
      redis.call('ZREM', expiryKey, seatId)
      reaped[#reaped + 1] = seatId
    end
  end
  if #reaped == 0 then return {0} end
  table.insert(reaped, 1, redis.call('INCR', seqKey))
  return reaped
`;

export async function reapExpiredHolds(redis: Redis, eventId: string) {
  const expiryKey = `{evt:${eventId}}:expiry`;
  const now = Date.now();
  const due = await redis.zrangebyscore(expiryKey, '-inf', now, 'LIMIT', 0, 500);
  if (due.length === 0) return;

  const reply = (await redis.eval(
    REAP,
    2 + due.length,
    expiryKey,
    `{evt:${eventId}}:seq`,
    ...due.map((id) => `{evt:${eventId}}:hold:${id}`),
    now,
    ...due,
  )) as [number, ...string[]];

  const [seq, ...released] = reply;
  if (released.length > 0) {
    await publishSeatDelta(redis, eventId, { seq, status: 'released', seatIds: released });
  }
}

// Unpaid orders past their window give their seats back.
// SKIP LOCKED lets several workers run side by side: each claims a different
// batch instead of queueing behind the same rows.
export async function expireUnpaidOrders(db: Pool) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; event_id: string; seat_ids: string[] }>(`
      with due as (
        select id from orders
         where status = 'pending_payment' and expires_at < now()
         order by expires_at
         limit 200
         for update skip locked
      ),
      expired as (
        update orders o set status = 'expired'
          from due where o.id = due.id
        returning o.id, o.event_id
      ),
      freed as (
        delete from tickets t using expired e
         where t.order_id = e.id
        returning t.order_id, t.event_id, t.seat_id
      )
      select order_id as id, event_id, array_agg(seat_id) as seat_ids
        from freed group by order_id, event_id
    `);

    for (const r of rows) {
      await client.query(
        `insert into seat_outbox (event_id, seat_ids, status) values ($1, $2, 'released')`,
        [r.event_id, r.seat_ids],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
