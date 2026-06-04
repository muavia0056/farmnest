import React, {useEffect, useRef} from 'react';
import {
  finalizeExpiredAuctionsInFirebase,
  createAuctionNotificationsForFinalizedPosts,
} from '../services/firebaseOrderService';

// Module-level flag: ensures only ONE AuctionBootstrap instance ever runs
// its interval at a time — even if the component remounts (e.g. on navigation).
let globalBootstrapRunning = false;

const AuctionBootstrap = () => {
  const isRunningRef = useRef(false); // prevents overlapping async ticks

  useEffect(() => {
    // Bail out if another instance is already running globally.
    if (globalBootstrapRunning) return;
    globalBootstrapRunning = true;

    let mounted = true;

    const runAuctionChecks = async () => {
      // Skip this tick if the previous one hasn’t finished yet.
      if (isRunningRef.current || !mounted) return;
      isRunningRef.current = true;

      try {
        await finalizeExpiredAuctionsInFirebase();
        await createAuctionNotificationsForFinalizedPosts();
      } catch (error) {
        console.log('AuctionBootstrap error:', error);
      } finally {
        isRunningRef.current = false;
      }
    };

    runAuctionChecks();
    const interval = setInterval(runAuctionChecks, 15000);

    return () => {
      mounted = false;
      globalBootstrapRunning = false;
      clearInterval(interval);
    };
  }, []);

  return null;
};

export default AuctionBootstrap;
