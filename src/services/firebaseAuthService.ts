import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {uploadImageToCloudinary, uploadVideoToCloudinary, uploadAudioToCloudinary, isRemoteUrl} from './cloudinaryService';

// ─────────────────────────────────────────────────────────────────────────────
// Flag to tell AuthBootstrap to stay silent during the registration flow.
// Set to true before createUserWithEmailAndPassword, false after signOut.
// ─────────────────────────────────────────────────────────────────────────────
let _registrationInProgress = false;
export const setRegistrationInProgress = (v: boolean) => { _registrationInProgress = v; };
export const getRegistrationInProgress = () => _registrationInProgress;

export type RegisterFirebaseInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: string;
  city?: string;
  address?: string;
  cnic?: string;
  cnicFrontUri?: string | null;
  cnicBackUri?: string | null;
  profilePicUri?: string | null;
  livenessVideoUri?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: uploads a local file URI to Cloudinary and returns the URL.
// Returns '' if the uri is falsy.
// FIXED: Now uses Cloudinary instead of Firebase Storage
// ─────────────────────────────────────────────────────────────────────────────
const uploadImageToCloudinaryHelper = async (
  localUri: string,
): Promise<string> => {
  if (!localUri) {
    return '';
  }
  try {
    const uploadedUrl = await uploadImageToCloudinary(localUri);
    return uploadedUrl;
  } catch (err) {
    console.warn('[uploadImageToCloudinaryHelper] Upload failed:', err);
    return '';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: ensures the main admin Firestore document exists.
// ─────────────────────────────────────────────────────────────────────────────
const ensureMainAdminFirestoreDoc = async (
  uid: string,
  cleanEmail: string,
  cleanPw: string,
): Promise<void> => {
  try {
    const docRef = db.collection('users').doc(uid);
    const snap   = await docRef.get();

    if (!snap.exists) {
      await docRef.set({
        uid,
        firstName:      'Muhammad',
        lastName:       'Muavia',
        fullName:       'Muhammad Muavia',
        email:          cleanEmail,
        phone:          '03001234567',
        role:           'Admin',
        city:           'RYK',
        address:        'Airport Road',
        cnic:           '',
        profilePic:     '',
        cnicFront:      '',
        cnicBack:       '',
        password:       cleanPw,
        accountStatus:  'Approved',
        emailVerified:  true,
        isMainAdmin:    true,
        isSimpleAdmin:  false,
        rating:         0,
        penalties:      0,
        previousEmails: [],
        createdAt:      firestore.FieldValue.serverTimestamp(),
        updatedAt:      firestore.FieldValue.serverTimestamp(),
      });
      console.log('[ensureMainAdminFirestoreDoc] Created missing Firestore doc for main admin');
    } else {
      const data = snap.data() || {};
      const needsUpdate: any = {};
      if (data.role !== 'Admin')              needsUpdate.role           = 'Admin';
      if (data.isMainAdmin !== true)          needsUpdate.isMainAdmin    = true;
      if (data.accountStatus !== 'Approved')  needsUpdate.accountStatus  = 'Approved';
      if (data.emailVerified !== true)        needsUpdate.emailVerified  = true;

      if (Object.keys(needsUpdate).length > 0) {
        needsUpdate.updatedAt = firestore.FieldValue.serverTimestamp();
        await docRef.update(needsUpdate);
        console.log('[ensureMainAdminFirestoreDoc] Patched main admin doc:', Object.keys(needsUpdate));
      }
    }
  } catch (err: any) {
    console.warn('[ensureMainAdminFirestoreDoc] Error:', err?.code, err?.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Register a new user
// FIXED: Now uses Cloudinary for image uploads
// ─────────────────────────────────────────────────────────────────────────────
export const registerUserInFirebase = async (
  input: RegisterFirebaseInput,
) => {
  const email    = input.email.trim().toLowerCase();
  const password = input.password;

  // Silence AuthBootstrap for the entire registration + signOut sequence
  _registrationInProgress = true;

  try {
    // ── Sign out any existing session first ──────────────────────────────
    try { await firebaseAuth.signOut(); } catch (_) {}

    const userCredential = await firebaseAuth.createUserWithEmailAndPassword(
      email,
      password,
    );
    const uid = userCredential.user.uid;

    let profilePicUrl = '';
    let cnicFrontUrl  = '';
    let cnicBackUrl   = '';
    let livenessVideoUrl = '';

    // Upload images to Cloudinary; upload liveness video via the video/upload endpoint
    try {
      const [cf, cb] = await Promise.all([
        input.cnicFrontUri  ? uploadImageToCloudinaryHelper(input.cnicFrontUri)  : Promise.resolve(''),
        input.cnicBackUri   ? uploadImageToCloudinaryHelper(input.cnicBackUri)   : Promise.resolve(''),
      ]);
      cnicFrontUrl = cf;
      cnicBackUrl  = cb;

      // Upload liveness video with correct video/* MIME type
      if (input.livenessVideoUri) {
        try {
          livenessVideoUrl = await uploadVideoToCloudinary(input.livenessVideoUri);
          console.log('[registerUserInFirebase] Liveness video uploaded:', livenessVideoUrl.substring(0, 60));
        } catch (vidErr) {
          console.warn('[registerUserInFirebase] Liveness video upload failed (non-fatal):', vidErr);
        }
      }
    } catch (imgErr) {
      console.warn('[registerUserInFirebase] Image upload error (non-fatal):', imgErr);
    }

    await db.collection('users').doc(uid).set({
      uid,
      firstName:      input.firstName.trim(),
      lastName:       input.lastName.trim(),
      fullName:       `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
      email,
      phone:          input.phone?.trim()   || '',
      role:           input.role,
      city:           input.city?.trim()    || '',
      address:        input.address?.trim() || '',
      cnic:           input.cnic?.trim()    || '',
      profilePic:     profilePicUrl,
      cnicFront:      cnicFrontUrl,
      cnicBack:       cnicBackUrl,
      livenessVideo:  livenessVideoUrl,
      password:       password,
      accountStatus:  'Pending',
      emailVerified:  false,
      isMainAdmin:    false,
      isSimpleAdmin:  false,
      rating:         0,
      penalties:      0,
      previousEmails: [],
      reviews:        [],
      createdAt:      firestore.FieldValue.serverTimestamp(),
      createdAtMillis: Date.now(),
      updatedAt:      firestore.FieldValue.serverTimestamp(),
    });

    await firebaseAuth.signOut();
    return { uid, email };

  } catch (err) {
    _registrationInProgress = false;
    throw err;
  }
};

// ── Helper: silently sync the login password to Firestore ───────────────────
const syncPasswordToFirestore = async (uid: string, password: string): Promise<void> => {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const existing = snap.data() || {};
    const oldPw = (existing.password || '').trim();
    const updatePayload: any = {
      password,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };
    if (oldPw && oldPw !== password) {
      updatePayload.previousPasswords = firestore.FieldValue.arrayUnion(oldPw);
    }
    await db.collection('users').doc(uid).update(updatePayload);
  } catch (_) {
    // Non-fatal — ignore silently
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Login user
// FIXED: Include user profile in suspended error for proper redirect
// ─────────────────────────────────────────────────────────────────────────────
export const loginUserFromFirebase = async (
  identifier: string,
  password: string,
) => {
  const cleanIdentifier = identifier.trim().toLowerCase();
  const cleanPassword   = password.trim();

  try { await firebaseAuth.signOut(); } catch (_) {}

  let loginEmail = cleanIdentifier;

  if (!cleanIdentifier.includes('@')) {
    const byPhone = await db
      .collection('users')
      .where('phone', '==', cleanIdentifier)
      .limit(1)
      .get();
    const byCnic = byPhone.empty
      ? await db
          .collection('users')
          .where('cnic', '==', cleanIdentifier)
          .limit(1)
          .get()
      : byPhone;

    if (byCnic.empty) {
      throw {code: 'auth/user-not-found'};
    }
    const docData = byCnic.docs[0].data();
    loginEmail = (docData.email || '').trim().toLowerCase();
    if (!loginEmail) {
      throw {code: 'auth/user-not-found'};
    }
  }

  let userCredential: any;
  try {
    userCredential = await firebaseAuth.signInWithEmailAndPassword(
      loginEmail,
      cleanPassword,
    );
  } catch (signInError: any) {
    throw signInError;
  }

  const uid = userCredential.user.uid;

  let userDoc: any;
  try {
    userDoc = await db.collection('users').doc(uid).get();
  } catch {
    try { await firebaseAuth.signOut(); } catch (_) {}
    throw new Error('USER_PROFILE_NOT_FOUND');
  }

  if (!userDoc.exists) {
    try { await firebaseAuth.signOut(); } catch (_) {}
    throw new Error('USER_PROFILE_NOT_FOUND');
  }

  const userData = userDoc.data() as any;
  const accountStatus = userData.accountStatus || 'Pending';

  // FIXED: Include profile in suspended error for proper redirect
  if (accountStatus === 'Suspended') {
    try { await firebaseAuth.signOut(); } catch (_) {}
    const error: any = new Error('Account suspended');
    error.code = 'auth/account-suspended';
    error.profile = userData; // Include profile for redirect
    throw error;
  }

  if (cleanIdentifier.includes('@')) {
    const previousEmails: string[] = userData.previousEmails || [];
    if (previousEmails.includes(cleanIdentifier)) {
      try { await firebaseAuth.signOut(); } catch (_) {}
      throw {code: 'auth/old-email-disabled'};
    }
  }

  syncPasswordToFirestore(uid, cleanPassword);

  return {
    uid,
    firebaseUser: userCredential.user,
    profile: userData,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Mark email as verified in Firestore
// The user is signed OUT at the time this runs (registration flow signs them
// out after creating the account). So we MUST sign them back in first,
// write emailVerified:true as themselves (isSelf rule passes), then sign out.
// This is the only reliable path — unauthenticated writes are blocked by rules.
// ─────────────────────────────────────────────────────────────────────────────
export const markEmailVerifiedInFirebase = async (
  email: string,
  password: string,
  uid: string,
): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();

  // ── Strategy 1: sign the user in with their own credentials, write, sign out
  // This always works because the isSelf() rule allows the user to update their
  // own document, and emailVerified is in the allowed fields list.
  if (cleanEmail && password) {
    try {
      // Make sure we start from a clean state
      try { await firebaseAuth.signOut(); } catch (_) {}

      await firebaseAuth.signInWithEmailAndPassword(cleanEmail, password);
      const currentUid = firebaseAuth.currentUser?.uid || uid;

      await db.collection('users').doc(currentUid).update({
        emailVerified: true,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      console.log('[markEmailVerified] authenticated write succeeded for uid:', currentUid);

      // Sign back out — the user must log in manually after verification
      try { await firebaseAuth.signOut(); } catch (_) {}
      return;
    } catch (authErr: any) {
      console.warn('[markEmailVerified] authenticated write failed:', authErr?.code, authErr?.message);
      // Fall through to uid-based attempt below
      try { await firebaseAuth.signOut(); } catch (_) {}
    }
  }

  // ── Strategy 2: if already signed in (uid matches), write directly
  if (uid && firebaseAuth.currentUser?.uid === uid) {
    try {
      await db.collection('users').doc(uid).update({
        emailVerified: true,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      console.log('[markEmailVerified] direct uid write succeeded:', uid);
      return;
    } catch (err: any) {
      console.warn('[markEmailVerified] direct uid write failed:', err?.code, err?.message);
    }
  }

  // ── Strategy 3: last resort — query by email (only works if rules allow it)
  try {
    const snap = await db
      .collection('users')
      .where('email', '==', cleanEmail)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({ emailVerified: true });
      console.log('[markEmailVerified] query-based write succeeded for:', cleanEmail);
    } else {
      console.warn('[markEmailVerified] no user doc found for email:', cleanEmail);
    }
  } catch (fallbackErr: any) {
    console.warn('[markEmailVerified] all strategies failed:', fallbackErr?.code, fallbackErr?.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update current user profile
// FIXED: Better error handling and Cloudinary image upload
// ─────────────────────────────────────────────────────────────────────────────
export const updateCurrentUserProfileInFirebase = async (input: {
  firstName: string;
  lastName: string;
  phone?: string;
  city?: string;
  address?: string;
  profilePic?: string;
  currentPassword?: string;
  newPassword?: string;
  uid?: string;
}) => {
  const targetUid = input.uid;
  if (!targetUid) {
    throw new Error('NO_AUTH_USER');
  }

  const passwordChanging =
    !!(input.newPassword && input.newPassword.trim().length >= 6);

  const existingDoc  = await db.collection('users').doc(targetUid).get();
  const existingData = existingDoc.data() || {};

  // If changing password, reauthenticate using EmailAuthProvider (no sign-out needed)
  if (passwordChanging) {
    if (!input.currentPassword || !input.currentPassword.trim()) {
      throw {code: 'auth/current-password-required'};
    }

    const currentUser = auth().currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('NO_AUTH_USER');
    }

    // Reauthenticate in-place — avoids sign-out/sign-in cycle that causes token issues
    const { EmailAuthProvider } = auth;
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      input.currentPassword.trim(),
    );
    try {
      await currentUser.reauthenticateWithCredential(credential);
    } catch (reauthErr: any) {
      throw reauthErr;
    }

    // Update password in Firebase Auth
    await currentUser.updatePassword(input.newPassword!.trim());
  }

  // Upload profile pic to Cloudinary if it's a local file
  let uploadedProfilePic = '';
  if (input.profilePic) {
    uploadedProfilePic = isRemoteUrl(input.profilePic)
      ? input.profilePic
      : await uploadImageToCloudinary(input.profilePic);
  }

  const firestoreUpdate: any = {
    firstName: input.firstName.trim(),
    lastName:  input.lastName.trim(),
    fullName:  `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
    phone:     input.phone?.trim()   || '',
    city:      input.city?.trim()    || '',
    address:   input.address?.trim() || '',
    ...(uploadedProfilePic ? {profilePic: uploadedProfilePic} : {}),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  // If password changed, update it in Firestore too
  if (passwordChanging && input.newPassword) {
    firestoreUpdate.password = input.newPassword.trim();
    const oldPw = existingData.password || '';
    if (oldPw) {
      firestoreUpdate.previousPasswords = firestore.FieldValue.arrayUnion(oldPw);
    }
  }

  await db.collection('users').doc(targetUid).update(firestoreUpdate);

  const updatedDoc = await db.collection('users').doc(targetUid).get();
  return updatedDoc.data();
};

// ─────────────────────────────────────────────────────────────────────────────
// Main admin login
// ─────────────────────────────────────────────────────────────────────────────
export const loginMainAdminToFirebase = async (
  email: string,
  password: string,
) => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPw    = password.trim();

  let signedInUid: string | null = null;

  try {
    const cred = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, cleanPw);
    signedInUid = cred.user.uid;
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') {
      try {
        const cred = await firebaseAuth.createUserWithEmailAndPassword(cleanEmail, cleanPw);
        signedInUid = cred.user.uid;
      } catch (createErr: any) {
        console.log('Main admin account creation failed:', createErr?.code);
        return;
      }
    } else {
      console.log('Main admin Firebase Auth sign-in failed:', error?.code);
      return;
    }
  }

  if (signedInUid) {
    await ensureMainAdminFirestoreDoc(signedInUid, cleanEmail, cleanPw);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update account status
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserAccountStatusInFirebase = async (
  userId: string,
  status: 'Pending' | 'Approved' | 'Rejected' | 'Suspended',
) => {
  await db.collection('users').doc(userId).update({
    accountStatus: status,
    updatedAt:     firestore.FieldValue.serverTimestamp(),
  });
};
