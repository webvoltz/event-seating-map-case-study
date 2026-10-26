// Excerpt: src/utils/seatStatus.ts
//
// One pure function decides what a seat shows. Precedence is explicit and tested:
// sold > held by someone else > selected by me > reserved > available.

import type { EffectiveSeatStatus, HoldMap, ISeat } from '../interfaces/venue.interfaces';

export interface SeatStatusOverlays {
  soldSeats: ReadonlySet<string>;
  holds: HoldMap;
  selectedSeats: ReadonlySet<string>;
  now: number;
  simulationSeeded: boolean;
}

export function resolveSeatStatus(
  seat: Pick<ISeat, 'id' | 'status'>,
  { soldSeats, holds, selectedSeats, now, simulationSeeded }: SeatStatusOverlays,
): EffectiveSeatStatus {
  if (seat.status === 'sold' || soldSeats.has(seat.id)) return 'sold';

  // Checked before `selected`: after a reload, a persisted selection that another
  // tab already claimed must not render as "mine" before reconciliation runs.
  const hold = holds.get(seat.id);
  if (hold && hold.expiresAt > now) return 'held';

  if (selectedSeats.has(seat.id)) return 'selected';
  if (seat.status === 'reserved') return 'reserved';

  // The JSON `held` flag is a seeding instruction, not a live fact. Once live
  // holds are seeded, trusting it would make a lapsed hold stick forever.
  if (seat.status === 'held' && !simulationSeeded) return 'held';

  return 'available';
}

export function isSeatSelectable(status: EffectiveSeatStatus): boolean {
  return status === 'available' || status === 'selected';
}
