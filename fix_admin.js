/**
 * fix_admin.js  —  Run ONCE from your project folder:
 *
 *   cd "E:\App Project\Farmnest"
 *   npm install firebase
 *   node fix_admin.js
 *
 * This creates/patches the Main Admin Firestore doc with role:'Admin'
 * so that the isAdmin() security rule always resolves correctly.
 */

const { initializeApp }                       = require('firebase/app');
const { getAuth, signInWithEmailAndPassword,
        createUserWithEmailAndPassword }       = require('firebase/auth');
const { getFirestore, doc, getDoc,
        setDoc, updateDoc }                   = require('firebase/firestore');

// ── Firebase config (from google-services.json) ────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyDMXzITCjqeuEAOD6nDiCEWxScp2U2Um2Q',
  authDomain:        'farm-nest-fyp.firebaseapp.com',
  projectId:         'farm-nest-fyp',
  storageBucket:     'farm-nest-fyp.firebasestorage.app',
  messagingSenderId: '484769811887',
  appId:             '1:484769811887:android:430f1a4e0d3d717b14b35a',
};

const ADMIN_EMAIL = 'muavia@gmail.com';
const ADMIN_PW    = 'muavia';

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   FarmNest Admin Fix Script          ║');
  console.log('╚══════════════════════════════════════╝\n');

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // ── Step 1: Get admin Firebase Auth UID ───────────────────────────────────
  let uid = null;
  console.log('Step 1: Signing into Firebase Auth...');
  try {
    const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PW);
    uid = cred.user.uid;
    console.log('  ✅ Signed in. UID:', uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password') {
      console.log('  Account not found — creating Firebase Auth account...');
      try {
        const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PW);
        uid = cred.user.uid;
        console.log('  ✅ Created auth account. UID:', uid);
      } catch (createErr) {
        console.error('  ❌ Could not create account:', createErr.code, createErr.message);
        process.exit(1);
      }
    } else {
      console.error('  ❌ Sign-in error:', err.code, err.message);
      process.exit(1);
    }
  }

  // ── Step 2: Create or patch Firestore doc ─────────────────────────────────
  console.log('\nStep 2: Checking Firestore users/' + uid + '...');
  try {
    const docRef = doc(db, 'users', uid);
    const snap   = await getDoc(docRef);

    if (!snap.exists()) {
      console.log('  Document missing — creating now...');
      await setDoc(docRef, {
        uid,
        firstName:      'Muhammad',
        lastName:       'Muavia',
        fullName:       'Muhammad Muavia',
        email:          ADMIN_EMAIL,
        phone:          '03001234567',
        role:           'Admin',
        city:           'RYK',
        address:        'Airport Road',
        cnic:           '',
        profilePic:     '',
        cnicFront:      '',
        cnicBack:       '',
        password:       ADMIN_PW,
        accountStatus:  'Approved',
        emailVerified:  true,
        isMainAdmin:    true,
        isSimpleAdmin:  false,
        rating:         0,
        penalties:      0,
        createdAtMillis: Date.now(),
      });
      console.log('  ✅ Admin Firestore document CREATED successfully!');
    } else {
      const data  = snap.data();
      const patch = {};
      if (data.role          !== 'Admin')    patch.role          = 'Admin';
      if (data.accountStatus !== 'Approved') patch.accountStatus = 'Approved';
      if (data.isMainAdmin   !== true)       patch.isMainAdmin   = true;
      if (data.emailVerified !== true)       patch.emailVerified = true;

      if (Object.keys(patch).length > 0) {
        console.log('  Document found — patching:', JSON.stringify(patch));
        await updateDoc(docRef, patch);
        console.log('  ✅ Admin Firestore document PATCHED successfully!');
      } else {
        console.log('  ✅ Admin Firestore document already correct — no changes needed.');
      }
    }
  } catch (fsErr) {
    console.error('\n  ❌ Firestore write FAILED:', fsErr.code, fsErr.message);
    console.log('\n  ⚠️  This means Firestore rules are blocking the write.');
    console.log('  You MUST deploy the updated rules first. Run:');
    console.log('\n    firebase deploy --only firestore:rules\n');
    console.log('  Then run this script again.\n');
    process.exit(1);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  ✅ DONE! Now run these commands:                ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('\n  1. Deploy rules (REQUIRED):');
  console.log('     firebase deploy --only firestore:rules,firestore:indexes\n');
  console.log('  2. Rebuild the app:');
  console.log('     npx react-native run-android\n');
  process.exit(0);
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
