import firestore from '@react-native-firebase/firestore';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {
  uploadAudioToCloudinary,
  uploadImageToCloudinary,
} from './cloudinaryService';
import {ensureMainAdminSession} from './sessionService';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Firestore rules require `senderId == request.auth.uid` on create.
// So we always store the Firebase Auth UID as senderId.
// The admin's AppContext id ('main-admin-001') is a local alias; we pass
// senderDisplayId separately so the UI can still filter conversations correctly.
// ─────────────────────────────────────────────────────────────────────────────

type SendTextMessageInput = {
  // The AppContext user id — used for UI conversation filtering
  senderDisplayId?: string;
  receiverId: string;
  senderName: string;
  senderRole: string;
  text: string;
};

type SendImageMessageInput = {
  senderDisplayId?: string;
  receiverId: string;
  senderName: string;
  senderRole: string;
  imageUri: string;
};

type SendAudioMessageInput = {
  senderDisplayId?: string;
  receiverId: string;
  senderName: string;
  senderRole: string;
  audioUri: string;
  audioDuration?: number;
};

// Helper: returns the Firebase Auth UID (required for Firestore rules).
// For Main Admin, auto-signs in if session expired. Throws if still unauthenticated.
const requireAuthUid = async (): Promise<string> => {
  let uid = firebaseAuth.currentUser?.uid;
  if (!uid) {
    // Try to re-establish admin session (handles session expiry)
    await ensureMainAdminSession();
    uid = firebaseAuth.currentUser?.uid;
  }
  if (!uid) throw new Error('NO_AUTH_USER');
  return uid;
};

export const sendTextMessageToFirebase = async (
  input: SendTextMessageInput,
) => {
  const authUid = await requireAuthUid();

  // senderDisplayId is the AppContext id (e.g. 'main-admin-001' for Main Admin).
  // If not provided, fall back to the auth UID.
  const displayId = input.senderDisplayId ?? authUid;

  const docRef = db.collection('messages').doc();

  await docRef.set({
    id: docRef.id,
    // Store the auth UID so Firestore rules pass
    senderId: authUid,
    // Also store the display id so the UI (which filters by AppContext id) works
    senderDisplayId: displayId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    receiverId: input.receiverId,
    text: input.text.trim(),
    image: '',
    audio: '',
    audioDuration: 0,
    timestamp: Date.now(),
    read: false,
    // Use only a numeric millis timestamp for ordering.
    // firestore.FieldValue.serverTimestamp() causes TWO snapshot events
    // (local pending write + server confirmation) which produces the
    // visible message flicker on the admin screen.
    createdAtMillis: Date.now(),
  });

  return docRef.id;
};

export const sendImageMessageToFirebase = async (
  input: SendImageMessageInput,
) => {
  const authUid = await requireAuthUid();
  const displayId = input.senderDisplayId ?? authUid;

  const uploadedImage = await uploadImageToCloudinary(input.imageUri);
  const docRef = db.collection('messages').doc();

  await docRef.set({
    id: docRef.id,
    senderId: authUid,
    senderDisplayId: displayId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    receiverId: input.receiverId,
    text: '',
    image: uploadedImage,
    audio: '',
    audioDuration: 0,
    timestamp: Date.now(),
    read: false,
    createdAtMillis: Date.now(),
  });

  return docRef.id;
};

export const sendAudioMessageToFirebase = async (
  input: SendAudioMessageInput,
) => {
  const authUid = await requireAuthUid();
  const displayId = input.senderDisplayId ?? authUid;

  const uploadedAudio = await uploadAudioToCloudinary(input.audioUri);
  const docRef = db.collection('messages').doc();

  await docRef.set({
    id: docRef.id,
    senderId: authUid,
    senderDisplayId: displayId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    receiverId: input.receiverId,
    text: '',
    image: '',
    audio: uploadedAudio,
    audioDuration: Number(input.audioDuration || 0),
    timestamp: Date.now(),
    read: false,
    createdAtMillis: Date.now(),
  });

  return docRef.id;
};

export const markConversationAsReadInFirebase = async (
  currentUserId: string,
  partnerId: string,
) => {
  try {
    const authUid = firebaseAuth.currentUser?.uid;
    if (!authUid) return;

    // Query messages where partner sent to current user (unread)
    // We match on both authUid and displayId to cover both admin and regular users
    const snapshot = await db
      .collection('messages')
      .where('receiverId', '==', currentUserId)
      .where('read', '==', false)
      .get();

    const toMark = snapshot.docs.filter(doc => {
      const d = doc.data();
      return d.senderId === partnerId || d.senderDisplayId === partnerId;
    });

    if (toMark.length === 0) return;

    const batch = db.batch();
    toMark.forEach(doc => batch.update(doc.ref, {read: true}));
    await batch.commit();
  } catch (e) {
    console.log('markConversationAsReadInFirebase error (non-fatal):', e);
  }
};

export const deleteMessageFromFirebase = async (messageId: string) => {
  try {
    await db.collection('messages').doc(messageId).delete();
  } catch (e) {
    console.log('deleteMessageFromFirebase error (non-fatal):', e);
  }
};
