/**
 * oneSignalService.ts — REST API MODE
 * Sends push notifications via OneSignal REST API using FCM tokens.
 * Works for Farmer, Buyer, Investor regardless of app state.
 */

import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

const ONESIGNAL_APP_ID = '711e0a46-e98f-43f1-8c41-59ac618d922d';
const ONESIGNAL_REST_API_KEY =
  'os_v2_app_oepaurxjr5b7ddcblgwgddmsfw5y5cn74bfuidfzchi37edijrf7wjsmg663btlsdaagni6xzakqf4aw5jw2ffz65nwd4ty54bcddcq';

const ONESIGNAL_API = 'https://onesignal.com/api/v1';

let _currentPlayerId: string | null = null;
let _currentUid: string | null = null;

export function initOneSignalSDK(): void {
  console.log('[OneSignal] REST API mode active');
}

// ─────────────────────────────────────────────────────────────────────────────
// Register device — called after login
// ─────────────────────────────────────────────────────────────────────────────
export async function loginOneSignal(farmnestUserId: string): Promise<void> {
  if (!farmnestUserId || farmnestUserId === 'main-admin-001') return;

  // REMOVED the early-exit guard "_currentUid === farmnestUserId && _currentPlayerId"
  // because after a fresh install / app update, the PlayerId must be re-registered
  // even if the UID is the same. Without re-registration, no Player ID is stored in
  // Firestore and all targeted push notifications are silently dropped (0 recipients).

  try {
    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      console.warn('[OneSignal] ❌ No FCM token available — cannot register device');
      return;
    }

    console.log('[OneSignal] Registering device for uid:', farmnestUserId);
    console.log('[OneSignal] FCM token (first 20 chars):', fcmToken.substring(0, 20) + '...');

    const response = await fetch(`${ONESIGNAL_API}/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        device_type: 1,           // 1 = Android
        identifier: fcmToken,     // FCM push token
        external_user_id: farmnestUserId,
        notification_types: 1,    // 1 = subscribed
        test_type: 0,
      }),
    });

    const result = await response.json();
    console.log('[OneSignal] Registration response:', JSON.stringify(result));

    if (result.id) {
      _currentPlayerId = result.id;
      _currentUid = farmnestUserId;
      console.log('[OneSignal] ✅ Device registered! Player ID:', result.id);

      // Save Player ID to Firestore so sendOneSignalPush can target this device
      await firestore().collection('users').doc(farmnestUserId).update({
        oneSignalPlayerId: result.id,
        fcmToken: fcmToken,
        oneSignalUpdatedAt: firestore.FieldValue.serverTimestamp(),
      });
      console.log('[OneSignal] ✅ Player ID saved to Firestore.');
    } else {
      console.warn('[OneSignal] ❌ Registration failed. Response:', JSON.stringify(result));
    }
  } catch (e) {
    console.warn('[OneSignal] loginOneSignal error:', e);
  }
}

export function logoutOneSignal(): void {
  _currentPlayerId = null;
  _currentUid = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send push notification
// ─────────────────────────────────────────────────────────────────────────────
export async function sendOneSignalPush(
  targetUserId: string,
  enMessage: string,
): Promise<void> {
  if (!targetUserId || targetUserId === 'main-admin-001') return;

  let title = 'Farmnest 🌾';
  const msg = enMessage.toLowerCase();
  if (enMessage.startsWith('✅') || msg.includes('approved'))          title = '✅ Account Approved';
  else if (enMessage.startsWith('⛔') || msg.includes('suspend'))      title = '⛔ Account Suspended';
  else if (enMessage.startsWith('❌') || msg.includes('rejected'))     title = '❌ Account Rejected';
  else if (enMessage.startsWith('🎉') || msg.includes('reactivated')) title = '🎉 Account Reactivated';
  else if (enMessage.startsWith('⚠️') || msg.includes('penalty'))     title = '⚠️ Penalty Notice';
  else if (msg.includes('bid'))    title = '🌾 Bid Update';
  else if (msg.includes('invest')) title = '💰 Investment Update';
  else if (msg.includes('order'))  title = '📦 Order Update';
  else if (msg.includes('payment')) title = '💳 Payment Update';
  else if (msg.includes('message')) title = '💬 New Message';

  const body = enMessage.length > 200 ? enMessage.substring(0, 197) + '…' : enMessage;

  // Get Player ID from Firestore
  let playerIdFromFirestore: string | null = null;
  try {
    const userDoc = await firestore().collection('users').doc(targetUserId).get();
    if (userDoc.exists) {
      playerIdFromFirestore = userDoc.data()?.oneSignalPlayerId || null;
    }
    console.log('[OneSignal] Target Player ID from Firestore:', playerIdFromFirestore);
  } catch (e) {
    console.warn('[OneSignal] Firestore fetch error:', e);
  }

  const payload: any = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: title },
    contents: { en: body },

    // Channel ID must match what MainApplication.kt creates
    android_channel_id: 'farmnest_notifications',

    // App icon as large icon
    android_large_icon: 'ic_launcher',

    // Farmnest green accent
    android_accent_color: 'FF2E7D32',

    // CRITICAL: priority 10 = high priority = heads-up notification like WhatsApp
    priority: 10,

    // Show on lock screen
    android_visibility: 1,

    // Badge
    android_badge_type: 'Increase',
    android_badge_count: 1,

    // Sound
    android_sound: 'default',

    data: { farmnestUserId: targetUserId },
  };

  if (playerIdFromFirestore) {
    // Target by specific Player ID (most reliable)
    payload.include_player_ids = [playerIdFromFirestore];
    console.log('[OneSignal] Sending to player_id:', playerIdFromFirestore);
  } else {
    // Fallback: target by external_user_id (the Farmnest UID)
    payload.include_external_user_ids = [targetUserId];
    console.log('[OneSignal] No player_id found — sending to external_user_id:', targetUserId);
  }

  try {
    const response = await fetch(`${ONESIGNAL_API}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[OneSignal] Notification response:', JSON.stringify(result));

    if (result.errors) {
      console.warn('[OneSignal] ❌ Errors:', JSON.stringify(result.errors));
    } else if (result.recipients === 0) {
      console.warn(
        '[OneSignal] ⚠️ 0 recipients — device may not be registered yet.',
        'Make sure the user has logged in and notification permission was granted.',
      );
    } else {
      console.log(`[OneSignal] ✅ Delivered to ${result.recipients} recipient(s)`);
    }
  } catch (e) {
    console.warn('[OneSignal] fetch error:', e);
  }
}

export { loginOneSignal as initOneSignal };
