/**
 * firebaseNotificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all Firestore notification operations for Farmnest.
 *
 * IMPORTANT: addNotificationToFirebase() now AUTOMATICALLY sends a OneSignal
 * push notification to the recipient's phone in addition to writing the
 * in-app notification to Firestore. This means every notification that appears
 * in the in-app notification screen (for Farmer, Buyer, Investor) will also be
 * delivered as a real push notification to their mobile device — even when
 * the app is closed or in the background.
 *
 * No manual triggering is needed anywhere. All existing addNotification()
 * calls throughout the app work automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import firestore from '@react-native-firebase/firestore';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import { sendOneSignalPush } from './oneSignalService';

// ── Dedup guard: tracks notification keys currently being written.
// Key format: `userId|en`. Prevents a second concurrent call (e.g. from
// AuctionBootstrap racing with handleSelectBuyer) from sending a duplicate
// push and writing a duplicate Firestore doc.
const inFlightKeys = new Set<string>();

type NotificationMessage = {
  en: string;
  ur: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Add a notification to Firestore AND send a push to the recipient's phone.
// This is the single function called by AppContext.addNotification() for every
// notification in the entire app — account approvals, bid wins, investment
// updates, penalties, order status changes, etc.
// ─────────────────────────────────────────────────────────────────────────────
export const addNotificationToFirebase = async (
  userId: string,
  message: NotificationMessage,
) => {
  // If no user is signed in, skip silently — NEVER call ensureMainAdminSession()
  // here because it signs out the current Buyer/Investor and signs in as Admin,
  // which corrupts the Firebase Auth session mid-flow and causes the concurrent
  // farmerRef.update() (reviews/rating) to be rejected with a permissions error,
  // surfacing as "Could not submit review."
  if (!firebaseAuth.currentUser) {
    console.warn(
      '[addNotificationToFirebase] No auth user — skipping notification silently.',
    );
    return null;
  }

  // ── Dedup guard: block concurrent calls with the same userId+message.
  // This stops AuctionBootstrap ticks and handleSelectBuyer from both writing
  // the same notification to Firestore within milliseconds of each other.
  const dedupeKey = `${userId}|${message.en}`;
  if (inFlightKeys.has(dedupeKey)) {
    console.log('[addNotificationToFirebase] Duplicate suppressed:', dedupeKey.substring(0, 60));
    return null;
  }
  inFlightKeys.add(dedupeKey);
  // Release the lock after 30 s so genuine repeated notifications (e.g. a
  // second penalty) can still be sent after a reasonable cooldown.
  setTimeout(() => inFlightKeys.delete(dedupeKey), 30_000);

  // ── 1. Write to Firestore (in-app notification) ───────────────────────────
  const docRef = db.collection('notifications').doc();

  await docRef.set({
    id: docRef.id,
    userId,
    en: message.en,
    ur: message.ur,
    read: false,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
  });

  // ── 2. Send OneSignal push to the recipient's device ────────────────────
  // Fire-and-forget: push failure must never block or break the in-app flow.
  sendOneSignalPush(userId, message.en).catch(e =>
    console.warn('[addNotificationToFirebase] OneSignal push failed silently:', e),
  );

  return docRef.id;
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark a single notification as read in Firestore
// ─────────────────────────────────────────────────────────────────────────────
export const markNotificationAsReadInFirebase = async (
  notificationId: string,
) => {
  // Skip local optimistic IDs — they don't exist in Firestore yet
  if (notificationId.startsWith('local_')) return;

  const authUser = firebaseAuth.currentUser;
  if (!authUser) throw new Error('NO_AUTH_USER');

  await db.collection('notifications').doc(notificationId).update({
    read: true,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark ALL unread notifications as read for a given user
// ─────────────────────────────────────────────────────────────────────────────
export const markAllNotificationsAsReadInFirebase = async (
  userId: string,
) => {
  const authUser = firebaseAuth.currentUser;
  if (!authUser) return;

  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('read', '==', false)
    .get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { read: true });
  });
  await batch.commit();
};

// ─────────────────────────────────────────────────────────────────────────────
// Delete a notification from Firestore
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNotificationInFirebase = async (
  notificationId: string,
) => {
  if (notificationId.startsWith('local_')) return;

  const authUser = firebaseAuth.currentUser;
  if (!authUser) return;

  await db.collection('notifications').doc(notificationId).delete();
};
