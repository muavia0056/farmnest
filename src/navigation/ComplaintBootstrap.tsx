import React, {useEffect} from 'react';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {useApp} from '../context/AppContext';

// The hardcoded main admin email — must match AppContext MAIN_ADMIN
const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';

const ComplaintBootstrap = () => {
  const {setComplaints, currentUser} = useApp();

  useEffect(() => {
    let unsubscribeComplaints: (() => void) | undefined;

    const unsubscribeAuth = firebaseAuth.onAuthStateChanged(async user => {
      if (unsubscribeComplaints) {
        unsubscribeComplaints();
        unsubscribeComplaints = undefined;
      }

      if (!user) {
        setComplaints([]);
        return;
      }

      // Determine role: first check AppContext currentUser (covers hardcoded main admin),
      // then fall back to Firestore document lookup for regular users.
      let role = currentUser?.role || '';

      if (!role) {
        // currentUser not yet set — look up Firestore
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          role = userDoc.data()?.role || '';
        } catch (e) {
          console.log('ComplaintBootstrap role lookup error:', e);
        }
      }

      // Extra safety: if the signed-in Firebase Auth email matches the main admin, treat as Admin
      if (!role && user.email === MAIN_ADMIN_EMAIL) {
        role = 'Admin';
      }

      const mapComplaint = (doc: any) => {
        const d = doc.data() || {};
        return {
          id:             doc.id,
          userId:         d.userId         || '',
          userName:       d.userName        || 'User',
          userRole:       d.userRole        || '',
          userProfilePic: d.userProfilePic  || null,
          problemTitle:   d.problemTitle    || 'No Title',
          problemDetail:  d.problemDetail   || '',
          screenshots:    Array.isArray(d.screenshots) ? d.screenshots : [],
          status:         d.status          || 'Open',
          adminReply:     d.adminReply      || '',
          createdAtMillis: d.createdAtMillis ?? 0,
          createdAt:      d.createdAt       || null,
          viewedByAdmin:  d.viewedByAdmin   ?? false,
        };
      };

      if (role === 'Admin') {
        unsubscribeComplaints = db
          .collection('complaints')
          .orderBy('createdAtMillis', 'desc')
          .onSnapshot(
            snapshot => {
              const firebaseComplaints = snapshot.docs.map(mapComplaint);
              setComplaints(firebaseComplaints);
            },
            error => {
              console.log('ComplaintBootstrap admin error:', error);
            },
          );
      } else {
        // Regular user — only load their own complaints
        unsubscribeComplaints = db
          .collection('complaints')
          .where('userId', '==', user.uid)
          .orderBy('createdAtMillis', 'desc')
          .onSnapshot(
            snapshot => {
              const firebaseComplaints = snapshot.docs.map(mapComplaint);
              setComplaints(firebaseComplaints);
            },
            error => {
              console.log('ComplaintBootstrap user error:', error);
            },
          );
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeComplaints) {
        unsubscribeComplaints();
      }
    };
  // Re-run when currentUser changes so that once AppContext resolves the user,
  // we can upgrade from a no-role state to the correct Admin/user listener.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setComplaints, currentUser?.role]);

  return null;
};

export default ComplaintBootstrap;
