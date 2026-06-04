import firestore from '@react-native-firebase/firestore';
import db from '../firebase/firestore';
import {addNotificationToFirebase} from './firebaseNotificationService';

type BidItem = {
  id?: string;
  bidderId?: string;
  bidderName?: string;
  amount?: number;
  timestamp?: number;
  isWinningBid?: boolean;
};

const getHighestBid = (bids: BidItem[], basePrice: number) => {
  if (!Array.isArray(bids) || bids.length === 0) {
    return null;
  }

  const sorted = [...bids]
    .filter(b => Number(b.amount || 0) > Number(basePrice || 0))
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));

  return sorted.length > 0 ? sorted[0] : null;
};

export const finalizeExpiredAuctionsInFirebase = async () => {
  const now = Date.now();

  const snapshot = await db
    .collection('cropPosts')
    .where('status', '==', 'Active')
    .where('bidEndTimestamp', '<=', now)
    .get();

  for (const doc of snapshot.docs) {
    try {
      const postRef = doc.ref;
      const postData: any = doc.data() || {};

      // Guard: skip if already not Active (stale snapshot)
      if (postData.status !== 'Active') {
        continue;
      }

      const postId = postData.id || doc.id;
      const farmerId = postData.farmerId || '';
      const farmerName = postData.farmerName || '';
      const cropTitle = postData.cropTitle || '';
      const bids: BidItem[] = Array.isArray(postData.bids) ? postData.bids : [];
      const basePrice = Number(postData.basePrice || 0);

      // ── FIX: If farmer has already manually selected a buyer (selectedBidderId
      //         is set) OR any bid already has a wonTimestamp (farmer already
      //         picked someone), skip automatic finalization entirely.
      //         This prevents the 15-second loop from overwriting the farmer's
      //         manual buyer selection with the automatic highest-bid winner.
      const hasManualSelection = !!postData.selectedBidderId;
      const hasWonTimestamp = bids.some((b: any) => b.wonTimestamp && b.wonTimestamp > 0);
      if (hasManualSelection || hasWonTimestamp) {
        continue;
      }

      const highestBid = getHighestBid(bids, basePrice);

      // ── CASE 1: No valid winning bid → mark Expired, no order ─────────────
      if (!highestBid || !highestBid.bidderId) {
        await postRef.update({
          status: 'Expired',
          winningBidId: '',
          winningBidAmount: 0,
          winningBidderId: '',
          winningBidderName: '',
          finalizedAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      // ── CASE 2: Valid winning bid exists ───────────────────────────────────
      // Check for duplicate order OUTSIDE any transaction (plain async read)
      const orderQuery = await db
        .collection('orders')
        .where('postId', '==', postId)
        .limit(1)
        .get();

      if (!orderQuery.empty) {
        // Order already exists — just make sure the post is marked Sold
        await postRef.update({
          status: 'Sold',
          winningBidId: highestBid.id || '',
          winningBidAmount: Number(highestBid.amount || 0),
          winningBidderId: highestBid.bidderId || '',
          winningBidderName: highestBid.bidderName || '',
          finalizedAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      // ── CASE 3: No duplicate — create order and update post atomically ─────
      const orderRef = db.collection('orders').doc();

      const batch = db.batch();

      batch.set(orderRef, {
        id: orderRef.id,
        postId,
        cropTitle,
        farmerId,
        farmerName,
        buyerId: highestBid.bidderId || '',
        buyerName: highestBid.bidderName || '',
        bidAmount: Number(highestBid.amount || 0),
        status: 'PendingPayment',
        paymentConfirmed: false,
        viewedByFarmer: false, // ADDED: Track if farmer has viewed
        viewedByBuyer: false,  // ADDED: Track if buyer has viewed
        viewedByAdmin: false,  // ADDED: Track if admin has viewed
        createdAt: firestore.FieldValue.serverTimestamp(),
        createdAtMillis: Date.now(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      batch.update(postRef, {
        status: 'Sold',
        winningBidId: highestBid.id || '',
        winningBidAmount: Number(highestBid.amount || 0),
        winningBidderId: highestBid.bidderId || '',
        winningBidderName: highestBid.bidderName || '',
        orderId: orderRef.id,
        finalizedAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
        bids: bids.map((bid: BidItem) => ({
          ...bid,
          isWinningBid: (bid.id || '') === (highestBid.id || ''),
        })),
      });

      await batch.commit();
    } catch (err) {
      console.warn('[finalizeExpiredAuctions] error for doc', doc.id, err);
    }
  }
};

// ── Update order status in Firestore ─────────────────────────────────────────
export const updateOrderStatusInFirebase = async (
  orderId: string,
  status: 'PendingPayment' | 'PaymentSent' | 'Completed' | 'Cancelled',
  extra?: Record<string, any>,
) => {
  await db.collection('orders').doc(orderId).update({
    status,
    ...extra,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

// ── Mark order as viewed by specific role ─────────────────────────────────────
export const markOrderAsViewedInFirebase = async (
  orderId: string,
  role: 'farmer' | 'buyer' | 'admin',
) => {
  const updateData: any = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (role === 'farmer') {
    updateData.viewedByFarmer = true;
  } else if (role === 'buyer') {
    updateData.viewedByBuyer = true;
  } else if (role === 'admin') {
    updateData.viewedByAdmin = true;
  }

  try {
    await db.collection('orders').doc(orderId).update(updateData);
  } catch (e) {
    console.warn('[markOrderAsViewedInFirebase] error (non-fatal):', e);
  }
};

// ── Confirm order payment in Firestore ────────────────────────────────────────
export const confirmOrderPaymentInFirebase = async (
  orderId: string,
  confirmData?: Record<string, any>,
) => {
  await db.collection('orders').doc(orderId).update({
    status: 'PaymentSent',
    paymentConfirmed: true,
    confirmPayData: confirmData || {},
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

// ── Admin approves order payment (releases to farmer) ─────────────────────────
export const adminApproveOrderInFirebase = async (
  orderId: string,
  farmerId: string,
  buyerId: string,
  amount: number,
  cropTitle: string,
) => {
  // Update order status to Completed
  await db.collection('orders').doc(orderId).update({
    status: 'Completed',
    adminApproved: true,
    adminApprovedAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Create farmer payment record
  const paymentRef = db.collection('farmerPayments').doc();
  await paymentRef.set({
    id: paymentRef.id,
    orderId,
    farmerId,
    buyerId,
    amount,
    cropTitle,
    status: 'Pending', // Admin needs to release to farmer
    viewedByFarmer: false,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
  });

  // Notify farmer
  await addNotificationToFirebase(farmerId, {
    en: `💰 Payment of PKR ${amount.toLocaleString()} for "${cropTitle}" has been approved. Check your payments.`,
    ur: `💰 "${cropTitle}" کے لیے PKR ${amount.toLocaleString()} کی ادائیگی منظور ہو گئی ہے۔ اپنی ادائیگیاں چیک کریں۔`,
  });

  // Notify buyer
  await addNotificationToFirebase(buyerId, {
    en: `✅ Your order for "${cropTitle}" has been completed. Thank you!`,
    ur: `✅ "${cropTitle}" کے لیے آپ کا آرڈر مکمل ہو گیا ہے۔ شکریہ!`,
  });
};

// ── Admin rejects order payment ─────────────────────────────────────────────
export const adminRejectOrderInFirebase = async (
  orderId: string,
  buyerId: string,
  cropTitle: string,
  reason: string = '',
) => {
  await db.collection('orders').doc(orderId).update({
    status: 'PaymentRejected',
    adminRejected: true,
    adminRejectedAt: firestore.FieldValue.serverTimestamp(),
    rejectionReason: reason,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Notify buyer
  await addNotificationToFirebase(buyerId, {
    en: reason
      ? `❌ Your payment for "${cropTitle}" was rejected. Reason: ${reason}`
      : `❌ Your payment for "${cropTitle}" was rejected. Please contact support.`,
    ur: reason
      ? `❌ "${cropTitle}" کے لیے آپ کی ادائیگی مسترد کر دی گئی۔ وجہ: ${reason}`
      : `❌ "${cropTitle}" کے لیے آپ کی ادائیگی مسترد کر دی گئی۔ براہ کرم سپورٹ سے رابطہ کریں۔`,
  });
};

// ── Release farmer payment ────────────────────────────────────────────────────
export const releaseFarmerPaymentInFirebase = async (
  paymentId: string,
  farmerId: string,
  amount: number,
) => {
  await db.collection('farmerPayments').doc(paymentId).update({
    status: 'Released',
    releasedAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  await addNotificationToFirebase(farmerId, {
    en: `🎉 Payment of PKR ${amount.toLocaleString()} has been released to your account!`,
    ur: `🎉 PKR ${amount.toLocaleString()} کی ادائیگی آپ کے اکاؤنٹ میں جاری کر دی گئی ہے!`,
  });
};

// ── Mark farmer payment as viewed ─────────────────────────────────────────────
export const markFarmerPaymentAsViewedInFirebase = async (paymentId: string) => {
  try {
    await db.collection('farmerPayments').doc(paymentId).update({
      viewedByFarmer: true,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[markFarmerPaymentAsViewed] error (non-fatal):', e);
  }
};

export const createAuctionNotificationsForFinalizedPosts = async () => {
  const snapshot = await db
    .collection('cropPosts')
    .where('status', 'in', ['Sold', 'Expired'])
    .get();

  for (const doc of snapshot.docs) {
    const postRef = doc.ref;

    try {
      let shouldNotify = false;
      let cropTitle = 'Crop';
      let farmerId = '';
      let winningBidderId = '';
      let status = '';

      await db.runTransaction(async transaction => {
        const freshSnap = await transaction.get(postRef);
        if (!freshSnap.exists) return;

        const d: any = freshSnap.data() || {};

        // Already notified — skip.
        if (d.finalizationNotificationsCreated) return;

        // EXTRA GUARD: if the flag was set less than 60 s ago by another
        // writer (clock-skew safety), also skip.
        const flaggedAt: number =
          d.finalizationNotificationsCreatedAt?.toMillis?.() ||
          d.finalizationNotificationsCreatedAt ||
          0;
        if (flaggedAt && Date.now() - flaggedAt < 60_000) return;

        // Atomically claim the flag.
        transaction.update(postRef, {
          finalizationNotificationsCreated: true,
          finalizationNotificationsCreatedAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });

        shouldNotify = true;
        cropTitle = d.cropTitle || 'Crop';
        farmerId = d.farmerId || '';
        winningBidderId = d.winningBidderId || '';
        status = d.status || '';
      });

      if (!shouldNotify) continue;

      if (status === 'Sold') {
        if (farmerId) {
          await addNotificationToFirebase(farmerId, {
            en: `✅ Your crop "${cropTitle}" auction has ended and a winner has been selected.`,
            ur: `✅ آپ کی فصل "${cropTitle}" کی نیلامی ختم ہو گئی ہے اور ایک فاتح منتخب ہو گیا ہے۔`,
          });
        }
        if (winningBidderId) {
          await addNotificationToFirebase(winningBidderId, {
            en: `🎉 You won the bid for "${cropTitle}".`,
            ur: `🎉 آپ نے "${cropTitle}" کی بولی جیت لی ہے۔`,
          });
        }
      }

      if (status === 'Expired') {
        if (farmerId) {
          await addNotificationToFirebase(farmerId, {
            en: `⌛ Your crop "${cropTitle}" auction ended without a valid winning bid.`,
            ur: `⌛ آپ کی فصل "${cropTitle}" کی نیلامی بغیر کسی درست جیتنے والی بولی کے ختم ہو گئی۔`,
          });
        }
      }
    } catch (err) {
      console.warn('[createAuctionNotifications] error for doc', doc.id, err);
    }
  }
};
