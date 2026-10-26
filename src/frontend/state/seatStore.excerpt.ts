// Excerpt: src/store/seatStore.ts
// Trimmed for the case study. "..." marks omitted code.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage } from 'zustand/middleware';
import { SELECTION_HOLD_MS, pruneHolds } from '../utils/holdProtocol';

export const MAX_SELECTABLE_SEATS = 8;

// A Set gives O(1) has/add/delete while selecting, but JSON can't store a Set.
// The storage adapter converts Set <-> array at the edge, so the store keeps Sets
// and localStorage only ever sees arrays. Old or malformed data falls back to empty.
const venueStorage: PersistStorage<PersistedVenueState> = {
  getItem: (name) => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    const parsed: unknown = JSON.parse(str);
    if (!isPersistedStorageValue(parsed)) return null;
    const { state, version } = parsed;
    return {
      state: {
        selectedSeats: new Set(state.selectedSeats ?? []),
        soldSeats: new Set(state.soldSeats ?? []),
        bookings: state.bookings ?? [],
        selectionExpiresAt:
          typeof state.selectionExpiresAt === 'number' ? state.selectionExpiresAt : null,
      },
      ...(version !== undefined && { version }),
    };
  },
  setItem: (name, value) => {
    localStorage.setItem(
      name,
      JSON.stringify({
        state: {
          ...value.state,
          selectedSeats: Array.from(value.state.selectedSeats),
          soldSeats: Array.from(value.state.soldSeats),
        },
        version: value.version,
      }),
    );
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const useVenueStore = create<VenueState>()(
  persist(
    (set) => ({
      // ...

      toggleSeat: (seatId) =>
        set((state) => {
          const now = Date.now();
          const liveHold = state.holds.get(seatId);
          if (liveHold && liveHold.expiresAt > now) {
            return { feedback: { type: 'error', message: 'That seat was just taken.' } };
          }

          const next = new Set(state.selectedSeats);
          if (next.has(seatId)) next.delete(seatId);
          else if (next.size >= MAX_SELECTABLE_SEATS) {
            return { feedback: { type: 'error', message: `You can select a maximum of 8 seats.` } };
          } else next.add(seatId);

          return {
            selectedSeats: next,
            // Anchored to when the cart opened. Adding seats doesn't extend the hold.
            selectionExpiresAt:
              next.size === 0 ? null : (state.selectionExpiresAt ?? now + SELECTION_HOLD_MS),
          };
        }),

      // The deadline is re-checked inside the same synchronous set(),
      // so payment can't slip past an expiry timer that fires at the same moment.
      confirmPurchase: (total) => {
        let result: Booking | null = null;
        set((state) => {
          if (state.selectionExpiresAt !== null && state.selectionExpiresAt <= Date.now()) {
            return {
              selectedSeats: new Set(),
              selectionExpiresAt: null,
              feedback: { type: 'error', message: 'Your hold expired before payment completed.' },
            };
          }
          // ... create booking, move seats to soldSeats
        });
        return result;
      },

      // Returns {} when nothing lapsed. Zustand skips the update, so a routine
      // timer tick costs zero re-renders across the mounted seats.
      runExpiry: (now) =>
        set((state) => {
          const prunedHolds = pruneHolds(state.holds, now);
          const selectionExpired =
            state.selectionExpiresAt !== null && state.selectionExpiresAt <= now;

          if (prunedHolds === state.holds && !selectionExpired) return {};

          return {
            ...(prunedHolds !== state.holds && { holds: prunedHolds }),
            ...(selectionExpired && {
              selectedSeats: new Set<string>(),
              selectionExpiresAt: null,
              feedback: { type: 'info', message: 'Your seat hold expired.' },
            }),
          };
        }),
    }),
    {
      name: 'venue-storage',
      storage: venueStorage,
      // Holds are live shared state owned by the hold protocol.
      // Persisting them too would give two sources of truth.
      partialize: (s) => ({
        selectedSeats: s.selectedSeats,
        soldSeats: s.soldSeats,
        bookings: s.bookings,
        selectionExpiresAt: s.selectionExpiresAt,
      }),
    },
  ),
);
