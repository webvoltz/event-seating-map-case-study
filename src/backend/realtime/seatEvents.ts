// Reference design: live seat updates over WebSocket.
//
// Every state change gets a per-event sequence number from Redis (INCR).
// Clients track the last seq they applied. A gap means a missed message, and
// the client pulls a fresh snapshot instead of drifting out of sync. This is the
// server-side version of the demo's "full-set replacement self-heals" rule.

import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';

export interface SeatDelta {
  seq: number;
  status: 'held' | 'released' | 'sold';
  seatIds: string[];
  expiresAt?: number;
}

const channel = (eventId: string) => `seats:${eventId}`;

export async function publishSeatDelta(redis: Redis, eventId: string, delta: SeatDelta) {
  await redis.publish(channel(eventId), JSON.stringify(delta));
}

// One gateway per app node. Each node subscribes once per event and fans out
// to its own sockets, so Redis sends one message per node, not per buyer.
export class SeatGateway {
  private rooms = new Map<string, Set<WebSocket>>();
  private pending = new Map<string, SeatDelta[]>();

  // During an on-sale spike thousands of holds land per second. Batching per
  // room every 100 ms turns that into ten frames a second per socket.
  private static readonly FLUSH_MS = 100;
  // A socket that can't keep up is dropped, not buffered without limit.
  // The client reconnects and resyncs from a snapshot.
  private static readonly MAX_BUFFERED_BYTES = 1_000_000;

  constructor(private readonly sub: Redis) {
    sub.on('message', (ch: string, raw: string) => {
      const eventId = ch.slice('seats:'.length);
      const queue = this.pending.get(eventId) ?? [];
      queue.push(JSON.parse(raw) as SeatDelta);
      this.pending.set(eventId, queue);
    });
    setInterval(() => this.flush(), SeatGateway.FLUSH_MS).unref();
  }

  async join(eventId: string, socket: WebSocket, lastSeq: number | null, currentSeq: number) {
    let room = this.rooms.get(eventId);
    if (!room) {
      room = new Set();
      this.rooms.set(eventId, room);
      await this.sub.subscribe(channel(eventId));
    }
    room.add(socket);
    socket.on('close', () => void this.leave(eventId, socket));

    // Too far behind to replay: tell the client to fetch GET /events/:id/seats.
    if (lastSeq === null || lastSeq < currentSeq) {
      socket.send(JSON.stringify({ type: 'resync', seq: currentSeq }));
    }
  }

  private flush() {
    for (const [eventId, deltas] of this.pending) {
      if (deltas.length === 0) continue;
      this.pending.set(eventId, []);
      deltas.sort((a, b) => a.seq - b.seq);
      const frame = JSON.stringify({ type: 'deltas', deltas });

      for (const socket of this.rooms.get(eventId) ?? []) {
        if (socket.bufferedAmount > SeatGateway.MAX_BUFFERED_BYTES) {
          socket.close(4008, 'resync');
          continue;
        }
        socket.send(frame);
      }
    }
  }

  private async leave(eventId: string, socket: WebSocket) {
    const room = this.rooms.get(eventId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.rooms.delete(eventId);
      await this.sub.unsubscribe(channel(eventId));
    }
  }
}
