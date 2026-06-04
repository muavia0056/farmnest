import React, {useEffect} from 'react';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {useApp} from '../context/AppContext';

const NotificationBootstrap = () => {
  const {setNotifications} = useApp();

  useEffect(() => {
    let unsubscribeNotifications: (() => void) | undefined;

    const unsubscribeAuth = firebaseAuth.onAuthStateChanged(user => {
      if (unsubscribeNotifications) {
        unsubscribeNotifications();
        unsubscribeNotifications = undefined;
      }

      if (!user) {
        setNotifications([]);
        return;
      }

      unsubscribeNotifications = db
        .collection('notifications')
        .where('userId', '==', user.uid)
        .orderBy('createdAtMillis', 'desc')
        .onSnapshot(
          snapshot => {
            const firebaseNotifications = snapshot.docs.map(doc => {
              const data = doc.data() as any;
              return {
                id: doc.id,
                userId: data.userId,
                // Firestore stores en/ur as top-level fields;
                // reconstruct the nested message object the UI expects.
                message: {
                  en: data.en || '',
                  ur: data.ur || '',
                },
                timestamp: data.createdAtMillis || Date.now(),
                read: data.read ?? false,
              };
            });

            setNotifications(firebaseNotifications);
          },
          error => {
            console.log('NotificationBootstrap Firestore error:', error);
          },
        );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifications) {
        unsubscribeNotifications();
      }
    };
  }, [setNotifications]);

  return null;
};

export default NotificationBootstrap;