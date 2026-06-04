import React, { useEffect, useRef } from 'react';
import db from '../firebase/firestore';
import { useApp } from '../context/AppContext';

/**
 * CropBootstrap — mounts once at the app root and keeps `cropPosts` in
 * AppContext in sync with the Firestore `cropPosts` collection in real time.
 *
 * Key design decisions:
 *  - Full field mapping (no shallow `...doc.data()` spread) so every field
 *    is guaranteed to have a safe default and Firestore Timestamps are
 *    converted to milliseconds before being stored in context.
 *  - `createdAtMillis` is the sort key (written as a plain number at post
 *    creation time) so ordering is reliable even before server Timestamps
 *    are committed.
 *  - On snapshot error the listener tears itself down and retries after
 *    3 seconds — handles transient auth / permission blips gracefully.
 */
const CropBootstrap = () => {
  const { setCropPosts } = useApp();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const startListener = () => {
    // Tear down any existing listener first
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const unsubscribe = db
      .collection('cropPosts')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const posts = snapshot.docs.map(doc => {
            const d = doc.data();

            // Safely convert a Firestore Timestamp or plain number to millis
            const toMillis = (val: any): number => {
              if (!val) return Date.now();
              if (typeof val === 'number') return val;
              if (typeof val.toMillis === 'function') return val.toMillis();
              return Date.now();
            };

            return {
              id:                   doc.id,
              farmerId:             d.farmerId             ?? '',
              farmerName:           d.farmerName           ?? '',
              farmerProfilePic:     d.farmerProfilePic     ?? null,
              farmerRating:         d.farmerRating         ?? 0,
              images:               Array.isArray(d.images) ? d.images : [],
              cropTitle:            d.cropTitle            ?? '',
              description:          d.description          ?? '',
              city:                 d.city                 ?? '',
              address:              d.address              ?? '',
              paymentMethod:        d.paymentMethod        ?? '',
              paymentAccountNumber: d.paymentAccountNumber ?? '',
              paymentName:          d.paymentName          ?? '',
              bidEndDay:            d.bidEndDay            ?? '',
              bidEndHour:           d.bidEndHour           ?? '',
              bidEndMinute:         d.bidEndMinute         ?? '',
              basePrice:            d.basePrice            ?? '0',
              bids:                 Array.isArray(d.bids) ? d.bids : [],
              status:               d.status               ?? 'Active',
              // Prefer the plain numeric field; fall back to converting the Timestamp
              createdAt:            d.createdAtMillis      ?? toMillis(d.createdAt),
              bidEndTimestamp:      d.bidEndTimestamp      ?? 0,
              liveLocation:         d.liveLocation         ?? null,
              auctionNotified:      d.auctionNotified      ?? false,
            };
          });

          setCropPosts(posts as any);
        },
        error => {
          console.warn('[CropBootstrap] Firestore snapshot error:', error.message);
          // Retry after a short delay — handles transient auth-change errors
          setTimeout(() => {
            startListener();
          }, 3000);
        },
      );

    unsubscribeRef.current = unsubscribe;
  };

  useEffect(() => {
    startListener();
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default CropBootstrap;
