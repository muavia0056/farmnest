import firestore from '@react-native-firebase/firestore';
import db from '../firebase/firestore';
import {addNotificationToFirebase} from './firebaseNotificationService';
import {ensureMainAdminSession} from './sessionService';
import {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendAccountSuspendedEmail,
  sendAccountReactivatedEmail,
} from './AdminEmailService';

// Helper: fetch a user's email + firstName from Firestore for sending emails
const getUserEmailInfo = async (
  userId: string,
): Promise<{email: string; firstName: string}> => {
  try {
    const snap = await db.collection('users').doc(userId).get();
    const data = snap.data() || {};
    return {
      email:     data.email     || '',
      firstName: data.firstName || data.name || 'User',
    };
  } catch {
    return {email: '', firstName: 'User'};
  }
};

type ModerationStatus = 'Pending' | 'Approved' | 'Rejected' | 'Suspended';

// ─────────────────────────────────────────────────────────────────────────────
// Core update — writes directly to Firestore.
// Always ensures Main Admin session is active before writing so that
// isAdmin() in firestore.rules resolves correctly.
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserModerationInFirebase = async (input: {
  userId: string;
  status?: ModerationStatus;
  penalties?: number;
  moderationReason?: string;
}) => {
  // Guarantee admin is authenticated before writing
  const ok = await ensureMainAdminSession();
  if (!ok) throw new Error('ADMIN_AUTH_FAILED');

  const updateData: any = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (typeof input.status !== 'undefined') {
    updateData.accountStatus = input.status;
  }
  if (typeof input.penalties !== 'undefined') {
    updateData.penalties = input.penalties;
  }
  if (typeof input.moderationReason !== 'undefined') {
    updateData.moderationReason = input.moderationReason.trim();
  }

  await db.collection('users').doc(input.userId).update(updateData);
};

export const suspendUserInFirebase = async (
  userId: string,
  reason: string = '',
) => {
  const {email, firstName} = await getUserEmailInfo(userId);

  await updateUserModerationInFirebase({
    userId,
    status: 'Suspended',
    moderationReason: reason,
  });

  await addNotificationToFirebase(userId, {
    en: reason
      ? `⛔ Your account has been suspended. Reason: ${reason}`
      : '⛔ Your account has been suspended.',
    ur: reason
      ? `⛔ آپ کا اکاؤنٹ معطل کر دیا گیا ہے۔ وجہ: ${reason}`
      : '⛔ آپ کا اکاؤنٹ معطل کر دیا گیا ہے۔',
  });

  if (email) {
    sendAccountSuspendedEmail(email, firstName, reason).catch(e =>
      console.warn('Suspend email failed:', e),
    );
  }
};

export const rejectUserInFirebase = async (
  userId: string,
  reason: string = '',
) => {
  const {email, firstName} = await getUserEmailInfo(userId);

  await updateUserModerationInFirebase({
    userId,
    status: 'Rejected',
    moderationReason: reason,
  });

  await addNotificationToFirebase(userId, {
    en: reason
      ? `❌ Your account has been rejected. Reason: ${reason}`
      : '❌ Your account has been rejected.',
    ur: reason
      ? `❌ آپ کا اکاؤنٹ مسترد کر دیا گیا ہے۔ وجہ: ${reason}`
      : '❌ آپ کا اکاؤنٹ مسترد کر دیا گیا ہے۔',
  });

  if (email) {
    sendAccountRejectedEmail(email, firstName, reason).catch(e =>
      console.warn('Reject email failed:', e),
    );
  }
};

export const approveUserInFirebase = async (userId: string) => {
  const {email, firstName} = await getUserEmailInfo(userId);

  await updateUserModerationInFirebase({
    userId,
    status: 'Approved',
    moderationReason: '',
  });

  await addNotificationToFirebase(userId, {
    en: '✅ Your account has been approved.',
    ur: '✅ آپ کا اکاؤنٹ منظور ہو گیا ہے۔',
  });

  if (email) {
    sendAccountApprovedEmail(email, firstName).catch(e =>
      console.warn('Approve email failed:', e),
    );
  }
};

export const reactivateUserInFirebase = async (userId: string) => {
  const {email, firstName} = await getUserEmailInfo(userId);

  await updateUserModerationInFirebase({
    userId,
    status: 'Approved',
    penalties: 0,
    moderationReason: '',
  });

  await addNotificationToFirebase(userId, {
    en: '🎉 Your account has been reactivated. You can now log in.',
    ur: '🎉 آپ کا اکاؤنٹ دوبارہ فعال کر دیا گیا ہے۔ اب آپ لاگ ان کر سکتے ہیں۔',
  });

  if (email) {
    sendAccountReactivatedEmail(email, firstName).catch(e =>
      console.warn('Reactivate email failed:', e),
    );
  }
};

export const addPenaltyToUserInFirebase = async (
  userId: string,
  currentPenalties: number = 0,
  reason: string = '',
) => {
  const nextPenalties = Number(currentPenalties || 0) + 1;

  if (nextPenalties >= 3) {
    await updateUserModerationInFirebase({
      userId,
      status: 'Suspended',
      penalties: nextPenalties,
      moderationReason: reason || 'Suspended due to 3 penalties',
    });

    await addNotificationToFirebase(userId, {
      en: '🚫 Your account has been suspended due to 3 consecutive penalties.',
      ur: '🚫 آپ کا اکاؤنٹ 3 مسلسل جرمانوں کی وجہ سے معطل کر دیا گیا ہے۔',
    });
  } else {
    await updateUserModerationInFirebase({
      userId,
      penalties: nextPenalties,
      moderationReason: reason,
    });

    await addNotificationToFirebase(userId, {
      en: reason
        ? `⚠️ A penalty has been added to your account (${nextPenalties}/3). Reason: ${reason}`
        : `⚠️ A penalty has been added to your account (${nextPenalties}/3).`,
      ur: reason
        ? `⚠️ آپ کے اکاؤنٹ پر جرمانہ (${nextPenalties}/3) شامل کیا گیا ہے۔ وجہ: ${reason}`
        : `⚠️ آپ کے اکاؤنٹ پر جرمانہ (${nextPenalties}/3) شامل کیا گیا ہے۔`,
    });
  }

  return nextPenalties;
};

export const removePenaltyFromUserInFirebase = async (
  userId: string,
  currentPenalties: number = 0,
) => {
  const nextPenalties = Math.max(0, Number(currentPenalties || 0) - 1);
  await updateUserModerationInFirebase({userId, penalties: nextPenalties});
  return nextPenalties;
};

export const deleteUserFromFirebase = async (userId: string) => {
  await ensureMainAdminSession();
  await db.collection('users').doc(userId).delete();
};
