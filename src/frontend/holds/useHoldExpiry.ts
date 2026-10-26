// Excerpt: src/hooks/useHoldExpiry.ts
//
// One setTimeout for the soonest deadline, never a polling interval.
// Hundreds of seeded holds still cost one timer, re-armed only when state changes.

import { useEffect } from 'react';
import { useVenueStore } from '../store/seatStore';
import { EXPIRY_SLACK_MS, nextDeadline } from '../utils/holdProtocol';

export function useHoldExpiry(): void {
  useEffect(() => {
    let timeoutId = 0;

    const scheduleNext = () => {
      window.clearTimeout(timeoutId);
      const { holds, selectionExpiresAt } = useVenueStore.getState();
      const deadline = nextDeadline(holds, selectionExpiresAt);
      if (deadline === null) return;

      const delay = Math.max(0, deadline - Date.now()) + EXPIRY_SLACK_MS;
      timeoutId = window.setTimeout(() => {
        useVenueStore.getState().runExpiry(Date.now());
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    const unsubscribe = useVenueStore.subscribe(scheduleNext);

    // Browsers throttle timers on background pages. Catch up the moment the page is visible.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        useVenueStore.getState().runExpiry(Date.now());
        scheduleNext();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
