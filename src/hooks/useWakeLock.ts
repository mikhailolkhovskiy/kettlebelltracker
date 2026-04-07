import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function requestWakeLock() {
      if ('wakeLock' in navigator && enabled) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock is active');
        } catch (err) {
          // Gracefully handle permission errors or unsupported environments
          if ((err as Error).name === 'NotAllowedError') {
            console.warn('Wake Lock disallowed by permissions policy. Screen may dim during workout.');
          } else {
            console.error(`Wake Lock error: ${(err as Error).message}`);
          }
        }
      } else if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }

    requestWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, [enabled]);
}
