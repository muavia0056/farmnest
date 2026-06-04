import React, {useEffect} from 'react';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {useApp} from '../context/AppContext';

const MessageBootstrap = () => {
  const {setMessages} = useApp();

  useEffect(() => {
    let unsubscribeSent: (() => void) | undefined;
    let unsubscribeReceived: (() => void) | undefined;

    let sentMessages: any[] = [];
    let receivedMessages: any[] = [];

    const syncMergedMessages = () => {
      const mergedMap = new Map<string, any>();

      [...sentMessages, ...receivedMessages].forEach(msg => {
        mergedMap.set(msg.id, msg);
      });

      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
      );

      setMessages(merged);
    };

    const unsubscribeAuth = firebaseAuth.onAuthStateChanged(user => {
      if (unsubscribeSent) {
        unsubscribeSent();
        unsubscribeSent = undefined;
      }

      if (unsubscribeReceived) {
        unsubscribeReceived();
        unsubscribeReceived = undefined;
      }

      sentMessages = [];
      receivedMessages = [];
      setMessages([]);

      if (!user) {
        return;
      }

      const mapMessage = (doc: any) => {
        const d = doc.data() || {};
        return {
          id: doc.id,
          senderId:      d.senderId      || '',
          senderName:    d.senderName    || 'User',
          senderRole:    d.senderRole    || '',
          receiverId:    d.receiverId    || '',
          text:          d.text          || '',
          image:         d.image         || null,
          audio:         d.audio         || null,
          audioDuration: d.audioDuration ?? 0,
          timestamp:     d.timestamp     ?? d.createdAtMillis ?? Date.now(),
          read:          d.read          ?? false,
        };
      };

      unsubscribeSent = db
        .collection('messages')
        .where('senderId', '==', user.uid)
        .onSnapshot(
          snapshot => {
            sentMessages = snapshot.docs.map(mapMessage);
            syncMergedMessages();
          },
          error => {
            console.log('MessageBootstrap sent messages error:', error);
          },
        );

      unsubscribeReceived = db
        .collection('messages')
        .where('receiverId', '==', user.uid)
        .onSnapshot(
          snapshot => {
            receivedMessages = snapshot.docs.map(mapMessage);
            syncMergedMessages();
          },
          error => {
            console.log('MessageBootstrap received messages error:', error);
          },
        );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSent) unsubscribeSent();
      if (unsubscribeReceived) unsubscribeReceived();
    };
  }, [setMessages]);

  return null;
};

export default MessageBootstrap;