/**
 * fcmService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Cloud Messaging + OneSignal bootstrap for Farmnest.
 *
 * The in-app Toast banner has been REMOVED.
 * All notifications now appear as real Android system tray notifications
 * via OneSignal — exactly like WhatsApp, Gmail, and other apps.
 * This applies whether the app is open, in background, or fully closed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform, PermissionsAndroid } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { loginOneSignal, logoutOneSignal } from './oneSignalService';

let unsubOnMessage: (() => void) | null = null;
let unsubTokenRefresh: (() => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Request notification permission (Android 13+)
// IMPORTANT: Must be called AFTER the activity is fully ready (use a delay).
// Calling PermissionsAndroid.request() too early in the app lifecycle can cause
// the permission dialog to silently not appear on some Android devices.
// ─────────────────────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      // Check current status
      const currentStatus = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      console.log('[FCM] POST_NOTIFICATIONS current status (true=granted):', currentStatus);

      if (!currentStatus) {
        console.log('[FCM] Requesting POST_NOTIFICATIONS permission...');

        // Small delay to ensure the activity window is fully rendered before
        // showing the permission dialog. Without this, the dialog can silently
        // fail to appear on some Android 13 devices.
        await new Promise(resolve => setTimeout(resolve, 1000));

        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Allow Notifications',
            message:
              'Farmnest needs notification permission to alert you about bids, orders, investments, and account activity.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );

        console.log('[FCM] POST_NOTIFICATIONS request result:', result);

        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('[FCM] ✅ POST_NOTIFICATIONS granted by user');
        } else if (result === PermissionsAndroid.RESULTS.DENIED) {
          console.warn(
            '[FCM] ❌ POST_NOTIFICATIONS DENIED by user.',
            'Notifications will NOT appear. User must enable from Settings → Apps → Farm Nest → Notifications.',
          );
          return false;
        } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          console.warn(
            '[FCM] ❌ POST_NOTIFICATIONS permanently blocked.',
            'User must go to Settings → Apps → Farm Nest → Notifications → Enable manually.',
          );
          return false;
        }
      } else {
        console.log('[FCM] ✅ POST_NOTIFICATIONS already granted');
      }
    }

    // Request FCM-level authorization (required by @react-native-firebase/messaging)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    console.log(
      '[FCM] Firebase messaging auth status:', authStatus,
      '| enabled:', enabled,
    );

    if (!enabled) {
      console.warn('[FCM] ❌ Firebase messaging permission not granted. Status:', authStatus);
    }
    return enabled;
  }

  // iOS
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save FCM token to Firestore
// ─────────────────────────────────────────────────────────────────────────────
async function saveTokenToFirestore(uid: string, token: string) {
  try {
    await firestore().collection('users').doc(uid).update({
      fcmToken: token,
      fcmTokenUpdatedAt: firestore.FieldValue.serverTimestamp(),
    });
    console.log('[FCM] ✅ FCM token saved to Firestore for uid:', uid);
  } catch (e) {
    console.warn('[FCM] Token save to Firestore failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap FCM + OneSignal — called after user logs in via onAuthStateChanged
// ─────────────────────────────────────────────────────────────────────────────
export async function bootstrapFCM(uid: string): Promise<void> {
  if (unsubOnMessage) { unsubOnMessage(); unsubOnMessage = null; }
  if (unsubTokenRefresh) { unsubTokenRefresh(); unsubTokenRefresh = null; }

  // Skip the main admin — they don't receive push notifications
  if (!uid || uid === 'main-admin-001') {
    console.log('[FCM] Skipping FCM bootstrap for main admin');
    return;
  }

  console.log('[FCM] bootstrapFCM started for uid:', uid);

  const permitted = await requestNotificationPermission();
  if (!permitted) {
    console.warn(
      '[FCM] ❌ Notification permission DENIED. Push notifications will not work.',
      '\n    → FIX: On phone, go to Settings → Apps → Farm Nest → Notifications → Enable all',
    );
    return;
  }

  console.log('[FCM] ✅ Notification permission confirmed — getting FCM token...');

  // Get and save FCM token
  try {
    const token = await messaging().getToken();
    if (token) {
      console.log('[FCM] FCM token received (first 30 chars):', token.substring(0, 30) + '...');
      await saveTokenToFirestore(uid, token);
    } else {
      console.warn('[FCM] ⚠️ messaging().getToken() returned null/undefined');
    }
  } catch (e) {
    console.warn('[FCM] getToken() error:', e);
  }

  // Listen for FCM token refresh
  unsubTokenRefresh = messaging().onTokenRefresh(async newToken => {
    console.log('[FCM] Token refreshed — updating Firestore and re-registering with OneSignal');
    await saveTokenToFirestore(uid, newToken);
    await loginOneSignal(uid);
  });

  // Foreground message handler — display is handled by OneSignal
  unsubOnMessage = messaging().onMessage(async () => {
    console.log('[FCM] Foreground FCM message received — OneSignal handles display');
  });

  messaging().getInitialNotification().then(msg => {
    if (msg) console.log('[FCM] App opened from quit state via notification tap');
  });

  messaging().onNotificationOpenedApp(() => {
    console.log('[FCM] App opened from background via notification tap');
  });

  // Register this device with OneSignal using the FCM token
  console.log('[FCM] Calling loginOneSignal for uid:', uid);
  try {
    await loginOneSignal(uid);
  } catch (e) {
    console.warn('[FCM] loginOneSignal error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Release listeners on logout
// ─────────────────────────────────────────────────────────────────────────────
export function releaseFCMListeners(): void {
  if (unsubOnMessage) { unsubOnMessage(); unsubOnMessage = null; }
  if (unsubTokenRefresh) { unsubTokenRefresh(); unsubTokenRefresh = null; }
  logoutOneSignal();
  console.log('[FCM] Listeners released on logout');
}

// ─────────────────────────────────────────────────────────────────────────────
// Background handler — registered in index.js before React tree mounts
// ─────────────────────────────────────────────────────────────────────────────
export async function backgroundMessageHandler(): Promise<void> {
  console.log('[FCM] Background FCM message received — OneSignal handles display');
}
