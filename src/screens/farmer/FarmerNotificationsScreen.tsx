import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, Platform, BackHandler, StatusBar, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import {
  markNotificationAsReadInFirebase,
  markAllNotificationsAsReadInFirebase,
  deleteNotificationInFirebase,
} from '../../services/firebaseNotificationService';

const FarmerNotificationsScreen = ({ navigation }: any) => {
  const { currentUser, notifications, setNotifications } = useApp();
  const { t, isUrdu, language } = useLanguage();

  const [selectedNotif, setSelectedNotif] = useState<any>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showNotifModalRef = useRef(showNotifModal);
  useEffect(() => { showNotifModalRef.current = showNotifModal; }, [showNotifModal]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (showNotifModalRef.current) { setShowNotifModal(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const myNotifs = notifications
    .filter(n => n.userId === currentUser?.id)
    .sort((a, b) => b.timestamp - a.timestamp);

  const markAllRead = () => {
    setNotifications(prev =>
      prev.map(n => n.userId === currentUser?.id ? { ...n, read: true } : n),
    );
    // Persist to Firestore
    if (currentUser?.id) {
      markAllNotificationsAsReadInFirebase(currentUser.id).catch(e =>
        console.warn('[FarmerNotif] markAllRead Firestore error:', e)
      );
    }
  };

  const markOneRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Persist to Firestore
    markNotificationAsReadInFirebase(id).catch(e =>
      console.warn('[FarmerNotif] markOneRead Firestore error:', e)
    );
  };

  const deleteNotif = (id: string) => {
    Alert.alert(
      isUrdu ? 'اطلاع حذف کریں' : 'Delete Notification',
      isUrdu ? 'کیا آپ اس اطلاع کو حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this notification?',
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'حذف کریں' : 'Delete',
          style: 'destructive',
          onPress: () => {
            setNotifications(prev => prev.filter(n => n.id !== id));
            // Persist delete to Firestore
            deleteNotificationInFirebase(id).catch(e =>
              console.warn('[FarmerNotif] deleteNotif Firestore error:', e)
            );
          },
        },
      ],
    );
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  const getMsg = (message: any) => {
    if (typeof message === 'string') return message;
    return message?.[language] ?? message?.en ?? '';
  };

  const getIcon = (msg: string) => {
    if (msg.includes('approved') || msg.includes('منظور')) return '✅';
    if (msg.includes('bid') || msg.includes('بولی')) return '🏷️';
    if (msg.includes('payment') || msg.includes('ادائیگی')) return '💳';
    if (msg.includes('message') || msg.includes('پیغام')) return '💬';
    if (msg.includes('deliver') || msg.includes('ڈیلیوری')) return '📦';
    return '🔔';
  };

  const openNotif = (item: any) => {
    markOneRead(item.id);
    setSelectedNotif(item);
    setShowNotifModal(true);
  };

  return (
    <View style={styles.container}>
      <FarmerHeader
        title={t('notifications')}
        navigation={navigation}
        rightComponent={
          myNotifs.some(n => !n.read) ? (
            <TouchableOpacity style={styles.markReadBtn} onPress={markAllRead} activeOpacity={0.8}>
              <Text style={styles.markReadText} numberOfLines={1}>{t('allRead')}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {myNotifs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noNotifications')}</Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('notificationsSubtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={myNotifs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 14 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const msg = getMsg(item.message);
            return (
              <TouchableOpacity
                style={[styles.notifCard, !item.read && styles.notifCardUnread]}
                onPress={() => openNotif(item)}
                onLongPress={() => deleteNotif(item.id)}
                delayLongPress={400}
                activeOpacity={0.8}>
                <View style={styles.notifIconWrap}>
                  <Text style={styles.notifIcon}>{getIcon(msg)}</Text>
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifMessage, isUrdu && styles.rtlText]} numberOfLines={2}>{msg}</Text>
                  <Text style={styles.notifTime}>{formatTime(item.timestamp)}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Notification Detail Modal ── */}
      <Modal visible={showNotifModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowNotifModal(false)}>
        <View style={styles.detailModal}>
          <View style={styles.detailModalHeader}>
            <TouchableOpacity onPress={() => setShowNotifModal(false)} style={styles.detailModalBack}>
              <Text style={styles.detailModalBackText}>{isUrdu ? '→ واپس' : '← Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.detailModalTitle}>{isUrdu ? '🔔 اطلاع' : '🔔 Notification'}</Text>
            <View style={{ width: 60 }} />
          </View>

          {selectedNotif && (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={styles.detailIconCircle}>
                <Text style={styles.detailIconText}>{getIcon(getMsg(selectedNotif.message))}</Text>
              </View>

              <Text style={[styles.detailMessage, isUrdu && styles.rtlText]}>
                {getMsg(selectedNotif.message)}
              </Text>

              <View style={styles.detailTimeRow}>
                <Text style={styles.detailTimeLabel}>{isUrdu ? '🕐 موصول ہوئی' : '🕐 Received'}</Text>
                <Text style={styles.detailTimeValue}>{formatTime(selectedNotif.timestamp)}</Text>
              </View>

              <View style={[styles.readBadge, { backgroundColor: selectedNotif.read ? '#E8F5E9' : '#FFF8E1' }]}>
                <Text style={[styles.readBadgeText, { color: selectedNotif.read ? '#2E7D32' : '#F57F17' }]}>
                  {selectedNotif.read ? (isUrdu ? '✓ پڑھی گئی' : '✓ Read') : (isUrdu ? '● نہیں پڑھی' : '● Unread')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  setShowNotifModal(false);
                  setTimeout(() => deleteNotif(selectedNotif.id), 300);
                }}
                activeOpacity={0.8}>
                <Text style={styles.deleteBtnText}>{isUrdu ? '🗑️ اطلاع حذف کریں' : '🗑️ Delete Notification'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  markReadBtn: {
    backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6,
    borderWidth: 1, borderColor: '#C8E6C9',
  },
  markReadText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 14, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  notifCardUnread: { borderLeftWidth: 4, borderLeftColor: '#2E7D32', backgroundColor: '#F9FFF9' },
  notifIconWrap: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center',
  },
  notifIcon: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 14, color: '#1B1B1B', fontWeight: '500', lineHeight: 21, marginBottom: 5 },
  notifTime: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E7D32', marginTop: 6 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },

  // Detail Modal
  detailModal: { flex: 1, backgroundColor: '#FFFFFF' },
  detailModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  detailModalBack: { padding: 6 },
  detailModalBackText: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  detailModalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  detailContent: { padding: 24, alignItems: 'center' },
  detailIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24, marginTop: 10,
  },
  detailIconText: { fontSize: 36 },
  detailMessage: {
    fontSize: 17, fontWeight: '600', color: '#1B1B1B', lineHeight: 28,
    textAlign: 'center', marginBottom: 28, paddingHorizontal: 8,
  },
  detailTimeRow: {
    width: '100%', flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#F9F9F9', borderRadius: 14, padding: 16, marginBottom: 16,
  },
  detailTimeLabel: { fontSize: 13, color: '#9E9E9E', fontWeight: '600' },
  detailTimeValue: { fontSize: 13, color: '#1B1B1B', fontWeight: '700' },
  readBadge: {
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 24,
  },
  readBadgeText: { fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
    borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '800', color: '#C62828' },
});

export default FarmerNotificationsScreen;
