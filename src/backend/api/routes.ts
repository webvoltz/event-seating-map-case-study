// Reference design: HTTP surface (Fastify + Zod).
//
// Everything a client sends is validated before it reaches a service.
// The cart token lives in an httpOnly, signed, SameSite cookie: the browser
// never sees it, and another site can't spend it.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAX_SEATS_PER_CART } from '../holds/holdService';
import { rateLimit } from './rateLimit';

const SeatIds = z
  .array(z.string().regex(/^SEAT-\d{1,6}$/))
  .min(1)
  .max(MAX_SEATS_PER_CART)
  .refine((ids) => new Set(ids).size === ids.length, 'duplicate seat ids');

const HoldBody = z.object({ seatIds: SeatIds });
const CheckoutBody = z.object({
  seatIds: SeatIds,
  idempotencyKey: z.string().uuid(),
});
const EventParams = z.object({ eventId: z.string().uuid() });

export async function seatRoutes(app: FastifyInstance) {
  // Snapshot for first paint and for resync after a sequence gap.
  // Cached at the edge for one second: thousands of viewers, one origin hit.
  app.get('/events/:eventId/seats', async (req, reply) => {
    const { eventId } = EventParams.parse(req.params);
    const snapshot = await app.inventory.snapshot(eventId); // { seq, sold[], held[] }
    reply.header('cache-control', 'public, max-age=1, stale-while-revalidate=2');
    return snapshot;
  });

  app.post(
    '/events/:eventId/holds',
    // Per cart and per IP. Holding seats is cheap for a bot and costly for real buyers.
    { preHandler: rateLimit({ perCart: '20/min', perIp: '60/min' }) },
    async (req, reply) => {
      const { eventId } = EventParams.parse(req.params);
      const { seatIds } = HoldBody.parse(req.body);
      await app.inventory.assertOnSale(eventId);

      const token = req.cartToken(eventId); // from the signed cookie, created on first hold
      const result = await app.holds.acquire(eventId, token, seatIds);

      if (!result.ok && result.reason === 'seats_taken') {
        return reply.code(409).send({ error: 'seats_taken', seatIds: result.seatIds });
      }
      if (!result.ok) return reply.code(422).send({ error: 'cart_limit', max: MAX_SEATS_PER_CART });
      return result; // { expiresAt, serverNow }
    },
  );

  app.delete('/events/:eventId/holds', async (req) => {
    const { eventId } = EventParams.parse(req.params);
    const { seatIds } = HoldBody.parse(req.body);
    return { released: await app.holds.release(eventId, req.cartToken(eventId), seatIds) };
  });

  app.post(
    '/events/:eventId/checkout',
    { preHandler: [app.requireCustomer, rateLimit({ perCustomer: '5/min' })] },
    async (req, reply) => {
      const { eventId } = EventParams.parse(req.params);
      const body = CheckoutBody.parse(req.body);
      try {
        return await app.checkout.checkout({
          eventId,
          customerId: req.customer.id,
          cartToken: req.cartToken(eventId),
          seatIds: body.seatIds,
          idempotencyKey: body.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'SeatsUnavailableError') {
          return reply.code(409).send({ error: 'seats_taken' });
        }
        throw err;
      }
    },
  );

  // Raw body is required to verify the provider signature. Unsigned or stale
  // requests are rejected before any database work.
  app.post('/webhooks/payments', { config: { rawBody: true } }, async (req, reply) => {
    const event = app.payments.verifyWebhook(req.rawBody, req.headers['x-signature']);
    if (event.type === 'payment.succeeded') await app.checkout.markPaid(event.paymentIntentId);
    return reply.code(204).send();
  });
}
