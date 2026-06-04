import React, {useEffect} from 'react';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {useApp} from '../context/AppContext';
import {navigationRef} from './AppNavigator';
import {getRegistrationInProgress} from '../services/firebaseAuthService';
import {getAdminSessionRefreshInProgress} from '../services/sessionService';

// ── Login-in-progress flag ──────────────────────────────────────────────────
// Set this to true in LoginScreen before calling Firebase Auth so that
// AuthBootstrap stays completely silent during the active login flow.
// LoginScreen is fully responsible for navigation when this is true.
let _loginInProgress = false;
export const setLoginInProgress = (v: boolean) => { _loginInProgress = v; };

// ── Helper: screens where AuthBootstrap must never interfere ────────────────
// EmailVerification owns its own navigation entirely. Any auth-state change
// that fires while the user is on this screen (e.g. signOut after registration,
// or a live Firestore snapshot) must be ignored so the user can complete
// verification without being kicked back to Login.
// Suspended is included because LoginScreen signs the user out before navigating
// there — we must not let the resulting onAuthStateChanged(null) redirect back
// to Login and undo the navigation.
const HANDS_OFF_SCREENS = ['EmailVerification', 'Suspended'];

const isHandsOffScreen = (): boolean => {
  try {
    const route = navigationRef.getCurrentRoute()?.name ?? '';
    return HANDS_OFF_SCREENS.includes(route);
  } catch {
    return false;
  }
};

const AuthBootstrap = () => {
  const {setCurrentUser} = useApp();

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const goToRoute = (name: string) => {
      const tryNavigate = () => {
        if (navigationRef.isReady()) {
          navigationRef.reset({
            index: 0,
            routes: [{name}],
          });
        } else {
          setTimeout(tryNavigate, 200);
        }
      };
      tryNavigate();
    };

    const unsubscribeAuth = firebaseAuth.onAuthStateChanged(user => {
      // ── Guard 1: active login or registration flow owns navigation ──────
      if (_loginInProgress || getRegistrationInProgress() || getAdminSessionRefreshInProgress()) return;

      // ── Guard 2: EmailVerification screen owns its own navigation ────────
      // Do NOT interfere while the user is verifying their email.
      // The signOut that fires after registration and the Firestore snapshot
      // that fires with emailVerified:false must both be silenced here.
      if (isHandsOffScreen()) return;

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      if (!user) {
        setCurrentUser(null);
        goToRoute('Login');
        return;
      }

      // If this is the Main Admin signing into Firebase Auth, skip the
      // Firestore profile lookup entirely — he is managed in local state.
      // IMPORTANT: Only navigate to MainAdminDashboard if:
      //   1. We're NOT in a logout flow (getAdminSessionRefreshInProgress already
      //      handled above), AND
      //   2. We're not already on the Login screen (meaning user has logged out).
      const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';
      if ((user.email || '').toLowerCase() === MAIN_ADMIN_EMAIL) {
        const currentRoute = (() => {
          try { return navigationRef.getCurrentRoute()?.name ?? ''; } catch { return ''; }
        })();
        // Don't redirect to dashboard if we're on the Login screen
        // (this happens when ensureMainAdminSession fires after a logout)
        if (currentRoute && currentRoute !== 'Login') {
          goToRoute('MainAdminDashboard');
        }
        return;
      }

      unsubscribeProfile = db
        .collection('users')
        .doc(user.uid)
        .onSnapshot(
          snapshot => {
            // ── Guard 3: re-check hands-off screen inside the snapshot ─────
            // The snapshot fires asynchronously; the user may have navigated
            // to EmailVerification between when the listener was attached and
            // when this callback fires.
            if (isHandsOffScreen()) return;

            if (!snapshot.exists) {
              setCurrentUser(null);
              goToRoute('Login');
              return;
            }

            const firebaseProfile: any = snapshot.data() || {};
            const normalizedStatus = firebaseProfile.accountStatus || 'Pending';

            // ── Email verification gate ─────────────────────────────────────
            // If emailVerified is explicitly false, route back to Login so the
            // LoginScreen can redirect to EmailVerificationScreen.
            // (Only triggers if somehow a signed-in session has an unverified
            //  account — e.g. the user cleared app data mid-verification.)
            if (firebaseProfile.emailVerified === false) {
              goToRoute('Login');
              return;
            }

            const loggedInUser = {
              id:            firebaseProfile.uid           || user.uid,
              firstName:     firebaseProfile.firstName     || '',
              lastName:      firebaseProfile.lastName      || '',
              email:         firebaseProfile.email         || user.email || '',
              phone:         firebaseProfile.phone         || '',
              city:          firebaseProfile.city          || '',
              address:       firebaseProfile.address       || '',
              cnic:          firebaseProfile.cnic          || '',
              password:      '',
              role:          firebaseProfile.role          || 'Buyer',
              profilePic:    firebaseProfile.profilePic    || '',
              cnicFront:     firebaseProfile.cnicFront     || '',
              cnicBack:      firebaseProfile.cnicBack      || '',
              accountStatus: normalizedStatus,
              rating:        firebaseProfile.rating        || 0,
              reviews:       firebaseProfile.reviews       || [],
              registeredAt:  firebaseProfile.registeredAt  || Date.now(),
              penalties:     firebaseProfile.penalties     || 0,
              isMainAdmin:   firebaseProfile.isMainAdmin   || false,
              isSimpleAdmin: firebaseProfile.isSimpleAdmin || false,
            };

            if (loggedInUser.accountStatus === 'Suspended') {
              setCurrentUser(loggedInUser);
              goToRoute('Suspended');
              return;
            }

            if (loggedInUser.accountStatus === 'Rejected') {
              setCurrentUser(loggedInUser);
              if      (loggedInUser.role === 'Farmer')   { goToRoute('FarmerDashboard'); }
              else if (loggedInUser.role === 'Buyer')    { goToRoute('BuyerDashboard'); }
              else if (loggedInUser.role === 'Investor') { goToRoute('InvestorDashboard'); }
              else if (loggedInUser.role === 'Admin')    { goToRoute('SimpleAdminDashboard'); }
              else                                       { goToRoute('Login'); }
              return;
            }

            if (loggedInUser.accountStatus === 'Pending') {
              setCurrentUser(loggedInUser);
              goToRoute('AccountPending');
              return;
            }

            setCurrentUser(loggedInUser);
            if      (loggedInUser.role === 'Farmer')   { goToRoute('FarmerDashboard'); }
            else if (loggedInUser.role === 'Buyer')    { goToRoute('BuyerDashboard'); }
            else if (loggedInUser.role === 'Investor') { goToRoute('InvestorDashboard'); }
            else if (loggedInUser.role === 'Admin')    { goToRoute('SimpleAdminDashboard'); }
          },
          error => {
            console.warn('[AuthBootstrap] Firestore profile error:', error);
            setCurrentUser(null);
            goToRoute('Login');
          },
        );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [setCurrentUser]);

  return null;
};

export default AuthBootstrap;
