import firebaseAuth from '../firebase/auth';
import {navigationRef} from '../navigation/AppNavigator';
import db from '../firebase/firestore';
import firestore from '@react-native-firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Flag to suppress AuthBootstrap while ensureMainAdminSession is running.
// Stays TRUE for the entire duration: sign-in + Firestore doc check/create.
// ─────────────────────────────────────────────────────────────────────────────
let _adminSessionRefreshInProgress = false;
export const setAdminSessionRefreshInProgress = (v: boolean) => { _adminSessionRefreshInProgress = v; };
export const getAdminSessionRefreshInProgress = () => _adminSessionRefreshInProgress;

const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';
const MAIN_ADMIN_PW    = 'muavia';

// ─────────────────────────────────────────────────────────────────────────────
// Ensures the Main Admin is signed into Firebase Auth AND has a valid
// Firestore document with role:'Admin'.
// ─────────────────────────────────────────────────────────────────────────────
export const ensureMainAdminSession = async (): Promise<boolean> => {
  // ── If already signed in as main admin, just verify the Firestore doc ──────
  const currentUser = firebaseAuth.currentUser;
  if (currentUser && (currentUser.email || '').toLowerCase() === MAIN_ADMIN_EMAIL) {
    // Already authenticated — just make sure the doc is correct
    await _ensureAdminFirestoreDoc(currentUser.uid);
    return true;
  }

  // ── Need to sign in — suppress AuthBootstrap for the whole operation —————
  _adminSessionRefreshInProgress = true;
  try {
    await firebaseAuth.signInWithEmailAndPassword(MAIN_ADMIN_EMAIL, MAIN_ADMIN_PW);
    const uid = firebaseAuth.currentUser?.uid;
    if (uid) {
      await _ensureAdminFirestoreDoc(uid);
    }
    return true;
  } catch (err: any) {
    console.warn('[ensureMainAdminSession] sign-in failed:', err?.code, err?.message);
    return false;
  } finally {
    // Always clear the flag — AFTER all async work is done
    _adminSessionRefreshInProgress = false;
  }
};

// Helper: makes sure the admin Firestore doc has role:'Admin'
const _ensureAdminFirestoreDoc = async (uid: string): Promise<void> => {
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      await db.collection('users').doc(uid).set({
        uid,
        firstName: 'Muhammad',
        lastName: 'Muavia',
        fullName: 'Muhammad Muavia',
        email: MAIN_ADMIN_EMAIL,
        phone: '03001234567',
        role: 'Admin',
        city: 'RYK',
        address: 'Airport Road',
        cnic: '',
        profilePic: '',
        cnicFront: '',
        cnicBack: '',
        password: MAIN_ADMIN_PW,
        accountStatus: 'Approved',
        emailVerified: true,
        isMainAdmin: true,
        isSimpleAdmin: false,
        rating: 0,
        penalties: 0,
        createdAt: firestore.FieldValue.serverTimestamp(),
        createdAtMillis: Date.now(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      console.log('[ensureAdminFirestoreDoc] Created admin doc for uid:', uid);
    } else {
      const data = snap.data() || {};
      const patch: any = {};
      if (data.role !== 'Admin')             patch.role = 'Admin';
      if (data.accountStatus !== 'Approved') patch.accountStatus = 'Approved';
      if (data.isMainAdmin !== true)         patch.isMainAdmin = true;
      if (data.emailVerified !== true)       patch.emailVerified = true;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(uid).update(patch);
        console.log('[ensureAdminFirestoreDoc] Patched admin doc:', patch);
      }
    }
  } catch (e: any) {
    console.warn('[ensureAdminFirestoreDoc] error:', e?.code, e?.message);
  }
};

export const logoutFromFirebaseSession = async () => {
  try {
    await firebaseAuth.signOut();
  } catch (error) {
    console.warn('[logoutFromFirebaseSession] signOut error (non-fatal):', error);
  }
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
  }
};

export const isUserLoggedIn = (): boolean => !!firebaseAuth.currentUser;
export const getCurrentUserId = (): string | null => firebaseAuth.currentUser?.uid || null;
