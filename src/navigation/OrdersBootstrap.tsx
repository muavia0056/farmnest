import React, {useEffect} from 'react';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {useApp} from '../context/AppContext';

const OrdersBootstrap = () => {
  const {setOrders} = useApp();

  useEffect(() => {
    let unsubscribeOrders: (() => void) | undefined;

    const unsubscribeAuth = firebaseAuth.onAuthStateChanged(async user => {
      if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = undefined;
      }

      if (!user) {
        setOrders([]);
        return;
      }

      const userDoc = await db.collection('users').doc(user.uid).get();
      const role = userDoc.data()?.role || '';

      const mapOrder = (doc: any) => {
        const d = doc.data() || {};
        return {
          id:               doc.id,
          postId:           d.postId           || '',
          cropTitle:        d.cropTitle        || 'Crop',
          farmerId:         d.farmerId         || '',
          farmerName:       d.farmerName       || 'Farmer',
          buyerId:          d.buyerId          || '',
          buyerName:        d.buyerName        || 'Buyer',
          bidAmount:        Number(d.bidAmount  || 0),
          status:           d.status           || 'PendingPayment',
          paymentConfirmed: d.paymentConfirmed  ?? false,
          createdAtMillis:  d.createdAtMillis   ?? 0,
          cancelledBy:      d.cancelledBy       || null,
        };
      };

      if (role === 'Admin') {
        unsubscribeOrders = db
          .collection('orders')
          .orderBy('createdAtMillis', 'desc')
          .onSnapshot(
            snapshot => {
              const firebaseOrders = snapshot.docs.map(mapOrder);
              setOrders(firebaseOrders);
            },
            error => {
              console.log('OrdersBootstrap admin error:', error);
            },
          );
        return;
      }

      if (role === 'Farmer') {
        unsubscribeOrders = db
          .collection('orders')
          .where('farmerId', '==', user.uid)
          .orderBy('createdAtMillis', 'desc')
          .onSnapshot(
            snapshot => {
              const firebaseOrders = snapshot.docs.map(mapOrder);
              setOrders(firebaseOrders);
            },
            error => {
              console.log('OrdersBootstrap farmer error:', error);
            },
          );
        return;
      }

      unsubscribeOrders = db
        .collection('orders')
        .where('buyerId', '==', user.uid)
        .orderBy('createdAtMillis', 'desc')
        .onSnapshot(
          snapshot => {
            const firebaseOrders = snapshot.docs.map(mapOrder);
            setOrders(firebaseOrders);
          },
          error => {
            console.log('OrdersBootstrap buyer error:', error);
          },
        );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeOrders) {
        unsubscribeOrders();
      }
    };
  }, [setOrders]);

  return null;
};

export default OrdersBootstrap;
