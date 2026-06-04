import firestore from '@react-native-firebase/firestore';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {uploadMultipleImagesToCloudinary} from './cloudinaryService';
import {addNotificationToFirebase} from './firebaseNotificationService';
import {ensureMainAdminSession} from './sessionService';

type CreateComplaintInput = {
  userId: string;
  userName: string;
  userRole: string;
  userProfilePic?: string;
  problemTitle: string;
  problemDetail: string;
  screenshots?: string[];
};

export const createComplaintInFirebase = async (
  input: CreateComplaintInput,
) => {
  const authUser = firebaseAuth.currentUser;

  if (!authUser) {
    throw new Error('NO_AUTH_USER');
  }

  if (authUser.uid !== input.userId) {
    throw new Error('INVALID_COMPLAINT_USER');
  }

  const uploadedScreenshots = await uploadMultipleImagesToCloudinary(
    input.screenshots || [],
  );

  const docRef = db.collection('complaints').doc();

  await docRef.set({
    id: docRef.id,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    userProfilePic: input.userProfilePic || '',
    problemTitle: input.problemTitle.trim(),
    problemDetail: input.problemDetail.trim(),
    screenshots: uploadedScreenshots,
    status: 'Open',
    adminReply: '',
    viewedByAdmin: false,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
};

export const updateComplaintStatusInFirebase = async (
  complaintId: string,
  status: 'Open' | 'In Progress' | 'Resolved' | 'Rejected',
  adminReply?: string,
) => {
  // Only call ensureMainAdminSession for the Main Admin.
  // Simple Admins are already signed into Firebase Auth as themselves —
  // calling ensureMainAdminSession would sign them out and break their session.
  const currentAuthUser = firebaseAuth.currentUser;
  const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';
  const isMainAdmin =
    (currentAuthUser?.email || '').toLowerCase() === MAIN_ADMIN_EMAIL;

  if (isMainAdmin || !currentAuthUser) {
    // Main Admin: ensure Firebase Auth session is active
    await ensureMainAdminSession();
  }
  // Simple Admin: already signed in, no session refresh needed

  await db.collection('complaints').doc(complaintId).update({
    status,
    adminReply: adminReply?.trim() || '',
    viewedByAdmin: true,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Notify the complaint owner about the status change
  try {
    const complaintDoc = await db.collection('complaints').doc(complaintId).get();
    const complaintData = complaintDoc.data();
    const userId = complaintData?.userId || '';
    if (userId) {
    let enMsg = '';
    let urMsg = '';
    if (status === 'Resolved') {
    enMsg = adminReply?.trim()
      ? `✅ Your complaint has been resolved. Admin reply: ${adminReply.trim()}`
        : '✅ Your complaint has been resolved by the admin.';
    urMsg = adminReply?.trim()
      ? `✅ آپ کی شکایت حل ہو گئی ہے۔ ایڈمن کا جواب: ${adminReply.trim()}`
        : '✅ آپ کی شکایت ایڈمن نے حل کر دی ہے۔';
    } else if (status === 'Rejected') {
    enMsg = adminReply?.trim()
        ? `❌ Your complaint has been rejected. Admin reply: ${adminReply.trim()}`
        : '❌ Your complaint has been rejected by the admin.';
    urMsg = adminReply?.trim()
        ? `❌ آپ کی شکایت مسترد کر دی گئی ہے۔ ایڈمن کا جواب: ${adminReply.trim()}`
          : '❌ آپ کی شکایت ایڈمن نے مسترد کر دی ہے۔';
        } else if (status === 'In Progress') {
          enMsg = adminReply?.trim()
            ? `🔄 Your complaint is now being reviewed. Admin note: ${adminReply.trim()}`
            : '🔄 Your complaint is now being reviewed by the admin.';
          urMsg = adminReply?.trim()
            ? `🔄 آپ کی شکایت زیر غور ہے۔ ایڈمن نوٹ: ${adminReply.trim()}`
            : '🔄 آپ کی شکایت ایڈمن کے زیر غور ہے۔';
        }
        if (enMsg) {
          await addNotificationToFirebase(userId, {en: enMsg, ur: urMsg});
        }
      }
  } catch (notifErr) {
    console.log('updateComplaintStatusInFirebase notification error (non-fatal):', notifErr);
  }
};

export const markComplaintViewedInFirebase = async (complaintId: string) => {
  // Only refresh session for Main Admin; Simple Admins are already authenticated
  const currentAuthUser = firebaseAuth.currentUser;
  const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';
  const isMainAdmin =
    (currentAuthUser?.email || '').toLowerCase() === MAIN_ADMIN_EMAIL;

  if (isMainAdmin || !currentAuthUser) {
    await ensureMainAdminSession();
  }

  await db.collection('complaints').doc(complaintId).update({
    viewedByAdmin: true,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};
