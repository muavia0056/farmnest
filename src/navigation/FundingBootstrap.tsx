import React, { useEffect, useRef } from 'react';
import db from '../firebase/firestore';
import { useApp } from '../context/AppContext';

/**
 * FundingBootstrap — mounts once at the app root and keeps `fundingPosts` in
 * AppContext in sync with the Firestore `fundingPosts` collection in real time.
 *
 * Mirrors CropBootstrap exactly:
 *  - Full field-by-field mapping (no shallow `...doc.data()` spread) so every
 *    field has a safe default and Firestore Timestamps are converted to millis.
 *  - `createdAtMillis` is the sort key for reliable ordering.
 *  - On snapshot error the listener tears down and retries after 3 seconds.
 */
const FundingBootstrap = () => {
  const { setFundingPosts } = useApp();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const startListener = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const unsubscribe = db
      .collection('fundingPosts')
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
              // Firestore field is 'title'; older local posts may have used 'landTitle'
              title:                d.title                ?? d.landTitle ?? '',
              landTitle:            d.title                ?? d.landTitle ?? '',
              description:          d.description          ?? '',
              city:                 d.city                 ?? '',
              address:              d.address              ?? '',
              targetAmount:         d.targetAmount         ?? 0,
              investedAmount:       d.investedAmount       ?? 0,
              paymentMethod:        d.paymentMethod        ?? '',
              paymentAccountNumber: d.paymentAccountNumber ?? '',
              paymentName:          d.paymentName          ?? '',
              images:               Array.isArray(d.images) ? d.images : [],
              investors:            Array.isArray(d.investors) ? d.investors : [],
              // Support both 'Open' (Firestore) and 'Active' (legacy local)
              status:               d.status               ?? 'Open',
              createdAt:            d.createdAtMillis      ?? toMillis(d.createdAt),
              liveLocation:         d.liveLocation         ?? null,
            };
          });

          setFundingPosts(posts as any);
        },
        error => {
          console.warn('[FundingBootstrap] Firestore snapshot error:', error.message);
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

export default FundingBootstrap;
