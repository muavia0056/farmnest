/**
 * Farmnest Firebase Cloud Functions
 * ─────────────────────────────────────────────────────────────────────────────
 * sendPushOnNotification
 *
 * Trigger: Fires every time a new document is created in the `notifications`
 *          collection — i.e. whenever AppContext.addNotification() is called
 *          for any Farmer, Buyer, or Investor.
 *
 * Flow:
 *   1. Read the new notification document (userId, en, ur fields).
 *   2. Look up the target user's Firestore document to get their fcmToken.
 *   3. If a token exists, send an FCM push notification via the Admin SDK.
 *   4. On success, mark the notification document with `pushSent: true`.
 *
 * All roles (Farmer, Buyer, Investor) are handled automatically — there is no
 * role-specific logic needed here because the `userId` in the notification doc
 * already points to the correct recipient regardless of role.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

// Initialise the Admin SDK (uses the default service account automatically
// when deployed to Firebase — no explicit credential needed).
admin.initializeApp();

const db = admin.firestore();
const fcm = admin.messaging();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send an FCM push to a single device token
// ─────────────────────────────────────────────────────────────────────────────
async function sendFCMPush(
  token: string,
  title: string,
  body: string,
  notifId: string
): Promise<void> {
  const message: admin.messaging.Message = {
    token,
    notification: {
      title,
      body,
    },
    android: {
      // HIGH priority ensures the notification wakes the device immediately
      priority: "high",
      notification: {
        // Use the app's launcher icon as the notification icon
        icon: "ic_launcher",
        // Farmnest green colour for the notification LED / accent
        color: "#2E7D32",
        channelId: "farmnest_default",
        sound: "default",
      },
    },
    data: {
      // Extra payload so the app can identify the notification on tap
      notificationId: notifId,
      click_action: "FLUTTER_NOTIFICATION_CLICK", // kept for compatibility
    },
  };

  await fcm.send(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function: sendPushOnNotification
// ─────────────────────────────────────────────────────────────────────────────
export const sendPushOnNotification = onDocumentCreated(
  {
    document: "notifications/{notificationId}",
    // Deploy to a region close to your users (Asia South = Mumbai, closest to Pakistan)
    region: "asia-south1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("[sendPushOnNotification] No data in event, skipping.");
      return;
    }

    const data = snap.data();
    const notifId = event.params.notificationId;

    // ── 1. Extract fields ──────────────────────────────────────────────────
    const userId: string = data.userId || "";
    const enMessage: string = data.en || "";
    const urMessage: string = data.ur || "";

    if (!userId) {
      console.warn(`[sendPushOnNotification] Notification ${notifId} has no userId, skipping.`);
      return;
    }

    // Skip admin notifications — admins don't have fcmTokens in regular user docs
    // and the Main Admin is a hardcoded user (not in Firestore users collection).
    if (userId === "main-admin-001") {
      console.log("[sendPushOnNotification] Skipping admin notification.");
      return;
    }

    // ── 2. Look up the target user's FCM token ──────────────────────────────
    let fcmToken: string | null = null;
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        console.warn(`[sendPushOnNotification] User doc not found for uid: ${userId}`);
        return;
      }
      fcmToken = userDoc.data()?.fcmToken || null;
    } catch (err) {
      console.error("[sendPushOnNotification] Error fetching user doc:", err);
      return;
    }

    if (!fcmToken) {
      console.log(
        `[sendPushOnNotification] User ${userId} has no fcmToken yet — ` +
        "they will receive the in-app notification only (push skipped)."
      );
      return;
    }

    // ── 3. Build the notification title and body ────────────────────────────
    // Use the English message as the push notification text.
    // Strip leading emoji for cleaner title extraction.
    const rawTitle = enMessage.length > 60
      ? enMessage.substring(0, 60).trimEnd() + "…"
      : enMessage;

    // Show a short title + full body for longer messages
    let pushTitle = "Farmnest";
    let pushBody = enMessage;

    // If the message starts with an emoji indicator, use it as a category title
    if (enMessage.startsWith("🎉") || enMessage.startsWith("✅")) {
      pushTitle = "Farmnest 🎉";
    } else if (enMessage.startsWith("⚠️")) {
      pushTitle = "Farmnest ⚠️";
    } else if (enMessage.startsWith("🚫")) {
      pushTitle = "Farmnest 🚫";
    } else if (enMessage.startsWith("💬") || enMessage.toLowerCase().includes("message")) {
      pushTitle = "New Message";
    } else if (enMessage.toLowerCase().includes("bid")) {
      pushTitle = "Bid Update";
    } else if (enMessage.toLowerCase().includes("invest")) {
      pushTitle = "Investment Update";
    } else if (enMessage.toLowerCase().includes("order")) {
      pushTitle = "Order Update";
    } else if (enMessage.toLowerCase().includes("payment")) {
      pushTitle = "Payment Update";
    }

    // Truncate body to 200 chars for the notification tray
    if (pushBody.length > 200) {
      pushBody = pushBody.substring(0, 197) + "…";
    }

    // ── 4. Send the push ────────────────────────────────────────────────────
    try {
      await sendFCMPush(fcmToken, pushTitle, pushBody, notifId);
      console.log(
        `[sendPushOnNotification] Push sent to user ${userId} (notif ${notifId})`
      );

      // Mark as push-sent so we know the push was delivered
      await snap.ref.update({ pushSent: true, pushSentAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (err: any) {
      // If the token is invalid / expired, clean it up from Firestore
      if (
        err.code === "messaging/invalid-registration-token" ||
        err.code === "messaging/registration-token-not-registered"
      ) {
        console.warn(
          `[sendPushOnNotification] Invalid FCM token for user ${userId} — removing from Firestore.`
        );
        await db.collection("users").doc(userId).update({ fcmToken: admin.firestore.FieldValue.delete() });
      } else {
        console.error("[sendPushOnNotification] FCM send error:", err);
      }
    }
  }
);
