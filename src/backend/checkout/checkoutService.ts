// Reference design: checkout.
//
// Three layers, each covering a failure the one above can miss:
//   1. Idempotency key  - a retry or double click returns the same order.
//   2. Redis hold check - fast rejection when the cart no longer owns the seats.
//   3. Postgres unique  - the ticket insert is the final arbiter. If Redis lost a
//                          hold during a failover, the database still refuses a
//                          second sale.

import type { Pool, PoolClient } from 'pg';
import type { HoldService } from '../holds/holdService';
import type { PaymentProvider } from './payments';

const PAYMENT_WINDOW_MS = 10 * 60_000;
const UNIQUE_VIOLATION = '23505';

export interface CheckoutInput {
  eventId: string;
  customerId: string;
  cartToken: string;
  seatIds: string[];
  idempotencyKey: string;
}

export class CheckoutService {
  constructor(
    private readonly db: Pool,
    private readonly holds: HoldService,
    private readonly payments: PaymentProvider,
  ) {}

  async checkout(input: CheckoutInput) {
    const existing = await this.findByKey(input.customerId, input.idempotencyKey);
    if (existing) return existing;

    const held = await this.holds.confirmForCheckout(
      input.eventId, input.cartToken, input.seatIds, PAYMENT_WINDOW_MS,
    );
    if (!held.ok) throw new SeatsUnavailableError(held.missing);

    const order = await this.reserveInTransaction(input);

    // The order id doubles as the provider's idempotency key, so a retried call
    // here can't create a second charge either.
    const intent = await this.payments.createIntent({
      amountCents: order.total_cents,
      idempotencyKey: order.id,
      metadata: { orderId: order.id, eventId: input.eventId },
    });
    await this.db.query('update orders set payment_intent_id = $1 where id = $2', [
      intent.id, order.id,
    ]);

    return { orderId: order.id, clientSecret: intent.clientSecret, expiresAt: order.expires_at };
  }

  private async reserveInTransaction(input: CheckoutInput) {
    const client = await this.db.connect();
    try {
      await client.query('begin');

      // Price comes from the database. A client-sent total is never trusted.
      const { rows: priced } = await client.query<{ total: string; n: string }>(
        `select coalesce(sum(price_cents), 0) as total, count(*) as n
           from seats where event_id = $1 and seat_id = any($2::text[])`,
        [input.eventId, input.seatIds],
      );
      if (Number(priced[0]?.n) !== input.seatIds.length) throw new UnknownSeatError();

      // Two concurrent requests with the same key: one inserts, the other gets
      // no row back and returns the winner's order.
      const { rows } = await client.query(
        `insert into orders (event_id, customer_id, idempotency_key, status, total_cents, expires_at)
         values ($1, $2, $3, 'pending_payment', $4, now() + $5 * interval '1 millisecond')
         on conflict (customer_id, idempotency_key) do nothing
         returning *`,
        [input.eventId, input.customerId, input.idempotencyKey, priced[0]?.total, PAYMENT_WINDOW_MS],
      );
      const order = rows[0];
      if (!order) {
        await client.query('rollback');
        return this.findByKey(input.customerId, input.idempotencyKey, client);
      }

      // The line that makes a double sale impossible.
      await client.query(
        `insert into tickets (event_id, seat_id, order_id)
         select $1, unnest($2::text[]), $3`,
        [input.eventId, input.seatIds, order.id],
      );

      await client.query(
        `insert into seat_outbox (event_id, seat_ids, status) values ($1, $2, 'sold')`,
        [input.eventId, input.seatIds],
      );

      await client.query('commit');
      return order;
    } catch (err) {
      await client.query('rollback');
      if (isPgError(err) && err.code === UNIQUE_VIOLATION && err.table === 'tickets') {
        throw new SeatsUnavailableError(input.seatIds);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // Payment webhook (signature verified upstream). The conditional update makes
  // provider retries harmless: only the first delivery changes anything.
  async markPaid(paymentIntentId: string) {
    const { rows } = await this.db.query(
      `update orders set status = 'paid'
        where payment_intent_id = $1 and status = 'pending_payment'
        returning id`,
      [paymentIntentId],
    );
    if (rows.length === 0) {
      // Already paid (a retry), or the order expired before payment landed.
      // The second case goes to the refund queue, never silently dropped.
      await this.handleLatePayment(paymentIntentId);
    }
  }

  private async findByKey(customerId: string, key: string, client?: PoolClient) {
    const { rows } = await (client ?? this.db).query(
      'select * from orders where customer_id = $1 and idempotency_key = $2',
      [customerId, key],
    );
    return rows[0] ?? null;
  }

  private async handleLatePayment(_paymentIntentId: string) {
    // ... enqueue refund + notify customer
  }
}

export class SeatsUnavailableError extends Error {
  constructor(readonly seatIds: string[]) {
    super('One or more seats are no longer available');
  }
}
export class UnknownSeatError extends Error {}

function isPgError(e: unknown): e is { code: string; table?: string } {
  return typeof e === 'object' && e !== null && 'code' in e;
}
