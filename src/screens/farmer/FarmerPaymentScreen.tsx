import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, Animated, ScrollView, Platform,
  ActivityIndicator, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import { updateCropPostInFirebase } from '../../services/firebaseCropService';

const GreenToast = ({ message, visible }: { message: string; visible: boolean }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.greenToast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Text style={styles.greenToastText}>✅ {message}</Text>
    </Animated.View>
  );
};

const FarmerPaymentScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, users, addNotification } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Hardware back button handler — single handler using refs to avoid stale closures ─
  const showPendingModalRef = useRef(showPendingModal);
  const showPaymentModalRef = useRef(showPaymentModal);
  useEffect(() => { showPendingModalRef.current = showPendingModal; }, [showPendingModal]);
  useEffect(() => { showPaymentModalRef.current = showPaymentModal; }, [showPaymentModal]);

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        if (showPendingModalRef.current)  { setShowPendingModal(false);  return true; }
        if (showPaymentModalRef.current)  { setShowPaymentModal(false);  return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const confirmedPayments: any[] = [];
  cropPosts
    .filter(p => p.farmerId === currentUser?.id)
    .forEach(post => {
      const activeBids = post.bids?.filter(
        (b: any) => !b.cancelled && b.paymentConfirmed && !b.deliveryConfirmed
      ) || [];
      activeBids.forEach((bid: any) => {
        const buyer = users.find(u => u.id === bid.bidderId);
        if (buyer) confirmedPayments.push({ post, bid, buyer });
      });
    });

  const openPaymentDetail = (item: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    setSelectedPayment(item);
    setDeliveryDays('');
    setShowPaymentModal(true);
  };

  const handleConfirmDelivery = () => {
    if (!deliveryDays.trim()) { showToast(t('enterDeliveryDaysToast')); return; }
    setConfirmLoading(true);
    setTimeout(() => {
      // Notify buyer
      addNotification(selectedPayment.buyer.id, {
        en: `🎉 Your order "${selectedPayment.post.cropTitle}" has been confirmed for delivery! Estimated delivery: ${deliveryDays} days.`,
        ur: `🎉 آپ کا آرڈر "${selectedPayment.post.cropTitle}" ڈیلیوری کے لیے تصدیق ہوگیا! متوقع ڈیلیوری: ${deliveryDays} دن۔`,
      });
      // Mark bid as deliveryConfirmed in Firestore so it disappears from the Payment list
      const updatedBids = selectedPayment.post.bids.map((b: any) =>
        b.id === selectedPayment.bid.id ? { ...b, deliveryConfirmed: true } : b
      );
      updateCropPostInFirebase(selectedPayment.post.id, { bids: updatedBids } as any).catch((e: any) =>
        console.warn('deliveryConfirmed update failed:', e)
      );
      setConfirmLoading(false);
      setShowPaymentModal(false);
      showToast(t('deliveryConfirmed'));
    }, 1000);
  };

  const handleCancelOrder = async () => {
    if (!selectedPayment) return;
    try {
      // Clear selectedBidderId — farmer must pick another buyer from See All Bidding
      await updateCropPostInFirebase(selectedPayment.post.id, {
        selectedBidderId: null as any,
        selectedBidderNotifiedAt: null as any,
      } as any);

      // Notify the buyer their order was cancelled by the farmer
      addNotification(selectedPayment.buyer.id, {
        en: `❌ The farmer has cancelled your order for "${selectedPayment.post.cropTitle}". The farmer will select another buyer.`,
        ur: `❌ کسان نے آپ کا "${selectedPayment.post.cropTitle}" کا آرڈر منسوخ کردیا۔ کسان دوسرا خریدار منتخب کرے گا۔`,
      });
    } catch (e) {
      console.warn('handleCancelOrder error:', e);
    }
    setShowPaymentModal(false);
    showToast(t('orderCancelledToast'));
  };

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('payment')} navigation={navigation} />
      <GreenToast message={toastMsg} visible={toastVisible} />
      <AccountPendingModal visible={showPendingModal} onClose={() => setShowPendingModal(false)} role="Farmer" />

      {confirmedPayments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💳</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noPaymentsYet')}</Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('paymentsSubtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={confirmedPayments}
          keyExtractor={(item, idx) => `${item.post.id}-${item.bid.id}-${idx}`}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.paymentCard}
              onPress={() => openPaymentDetail(item)}
              activeOpacity={0.85}>
              <View style={styles.paymentCardRow}>
                {item.buyer.profilePic ? (
                  <Image source={{ uri: item.buyer.profilePic }} style={styles.buyerAvatar} />
                ) : (
                  <View style={styles.buyerAvatarPlaceholder}>
                    <Text style={styles.buyerAvatarInit}>
                      {item.buyer.firstName[0]}{item.buyer.lastName[0]}
                    </Text>
                  </View>
                )}
                <View style={styles.paymentInfo}>
                  <Text style={styles.buyerName}>{item.buyer.firstName} {item.buyer.lastName}</Text>
                  <Text style={styles.cropName}>{item.post.cropTitle}</Text>
                  <Text style={styles.bidAmount}>PKR {item.bid.amount?.toLocaleString()}</Text>
                </View>
                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>{t('paid')}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Payment Detail Modal ── */}
      <Modal visible={showPaymentModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowPaymentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowPaymentModal(false)}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {selectedPayment && (
                <>
                  <Text style={[styles.modalTitle, isUrdu && styles.rtlText]}>{t('paymentDetails')}</Text>

                  {/* Buyer Info */}
                  <View style={styles.paymentDetailBuyerRow}>
                    {selectedPayment.buyer.profilePic ? (
                      <Image source={{ uri: selectedPayment.buyer.profilePic }} style={styles.buyerAvatarMed} />
                    ) : (
                      <View style={styles.buyerAvatarMedPlaceholder}>
                        <Text style={styles.buyerAvatarMedInit}>
                          {selectedPayment.buyer.firstName[0]}{selectedPayment.buyer.lastName[0]}
                        </Text>
                      </View>
                    )}
                    <View style={styles.paymentDetailBuyerInfo}>
                      <Text style={styles.paymentDetailBuyerName}>
                        {selectedPayment.buyer.firstName} {selectedPayment.buyer.lastName}
                      </Text>
                      <Text style={styles.paymentDetailRole}>🛒 {t('buyerRole')}</Text>
                    </View>
                  </View>

                  {/* Buyer Confirm Data */}
                  {selectedPayment.bid.confirmPayData && (
                    <View style={styles.confirmPayDataBox}>
                      <Text style={[styles.confirmPayDataTitle, isUrdu && styles.rtlText]}>{t('buyerConfirmDetails')}</Text>
                      {[
                        { label: t('fullName'), value: selectedPayment.bid.confirmPayData.fullName },
                        { label: t('phoneLabel'), value: selectedPayment.bid.confirmPayData.phone },
                        { label: t('cityFieldLabel'), value: selectedPayment.bid.confirmPayData.city },
                        { label: t('addressFieldLabel'), value: selectedPayment.bid.confirmPayData.address },
                      ].map(row => (
                        <View key={row.label} style={styles.dataRow}>
                          <Text style={[styles.dataLabel, isUrdu && styles.rtlText]}>{row.label}</Text>
                          <Text style={[styles.dataValue, isUrdu && styles.rtlText]}>{row.value || '—'}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Bid Amount */}
                  <View style={styles.amountBox}>
                    <Text style={styles.amountLabel}>{isUrdu ? 'جیتنے کی بولی کی رقم' : 'Winning Bid Amount'}</Text>
                    <Text style={styles.amountValue}>PKR {selectedPayment.bid.amount?.toLocaleString()}</Text>
                  </View>

                  {/* Payment info note */}
                  <View style={styles.paymentNoteBox}>
                    <Text style={[styles.paymentNoteText, isUrdu && styles.rtlText]}>
                      {isUrdu
                        ? '💳 خریدار نے Farm Nest ایڈمن اکاؤنٹ میں ادائیگی بھیج دی ہے۔ رقم 7 دن بعد آپ کو جاری ہوگی۔ ہولڈ کی مدت کے بعد ادائیگی حاصل کرنے کے لیے ایڈمن سے رابطہ کریں۔'
                        : "💳 The buyer has sent the payment to Farm Nest Admin's account. The amount will be released to you after 7 days. Contact Admin to receive the payment after the hold period."}
                    </Text>
                  </View>

                  {/* Delivery Days */}
                  <Text style={[styles.sectionLabel, isUrdu && styles.rtlText]}>{t('deliveryTimeDays')}</Text>
                  <View style={styles.deliveryInputRow}>
                    <TextInput
                      style={styles.deliveryInput}
                      placeholder={t('enterDeliveryDays')}
                      placeholderTextColor="#9E9E9E"
                      keyboardType="numeric"
                      value={deliveryDays}
                      onChangeText={setDeliveryDays}
                      textAlign={isUrdu ? 'right' : 'left'}
                    />
                    <Text style={styles.deliveryInputSuffix}>{t('daysLabel')}</Text>
                  </View>
                </>
              )}
            </ScrollView>

            {/* Action Buttons — outside ScrollView, inside safe bottom container */}
            {selectedPayment && (
              <View style={styles.actionBtnsContainer}>
                <View style={styles.actionBtnsRow}>
                  <TouchableOpacity style={styles.cancelOrderBtn} onPress={handleCancelOrder} activeOpacity={0.85}>
                    <Text style={styles.cancelOrderBtnText}>{t('cancelOrder')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmDeliveryBtn, confirmLoading && { opacity: 0.7 }]}
                    onPress={handleConfirmDelivery}
                    disabled={confirmLoading}
                    activeOpacity={0.85}>
                    {confirmLoading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.confirmDeliveryBtnText}>{t('confirmDelivery')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  greenToast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999,
    backgroundColor: '#2E7D32', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
  },
  greenToastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  paymentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  paymentCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buyerAvatar: { width: 52, height: 52, borderRadius: 26 },
  buyerAvatarPlaceholder: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  buyerAvatarInit: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  paymentInfo: { flex: 1 },
  buyerName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  cropName: { fontSize: 13, color: '#555555', fontWeight: '500', marginVertical: 2 },
  bidAmount: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  paidBadge: {
    backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  paidBadgeText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  paymentModal: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 0, maxHeight: '92%',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 20,
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  modalCloseTxt: { fontSize: 16, color: '#555555', fontWeight: '700' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 20, marginTop: 10 },
  paymentDetailBuyerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  buyerAvatarMed: { width: 54, height: 54, borderRadius: 27 },
  buyerAvatarMedPlaceholder: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#1565C0',
    justifyContent: 'center', alignItems: 'center',
  },
  buyerAvatarMedInit: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  paymentDetailBuyerInfo: { flex: 1 },
  paymentDetailBuyerName: { fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  paymentDetailRole: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  confirmPayDataBox: {
    backgroundColor: '#F9F9F9', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  confirmPayDataTitle: { fontSize: 14, fontWeight: '800', color: '#2E7D32', marginBottom: 12 },
  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  dataLabel: { fontSize: 13, color: '#9E9E9E', fontWeight: '600' },
  dataValue: { fontSize: 13, color: '#1B1B1B', fontWeight: '700', flex: 1, textAlign: 'right' },
  amountBox: {
    backgroundColor: '#E8F5E9', borderRadius: 14, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#C8E6C9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  amountLabel: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  amountValue: { fontSize: 17, fontWeight: '900', color: '#2E7D32' },
  paymentNoteBox: {
    backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#FFE082',
  },
  paymentNoteText: { fontSize: 13, color: '#E65100', lineHeight: 20, fontWeight: '500' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#333333', marginBottom: 10, marginTop: 16 },
  deliveryInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9F9F9', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E8E8E8', overflow: 'hidden',
  },
  deliveryInput: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontWeight: '700', color: '#1B1B1B',
  },
  deliveryInputSuffix: {
    paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#2E7D32',
    borderLeftWidth: 1.5, borderLeftColor: '#E8E8E8', paddingVertical: 13,
  },
  actionBtnsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 0 },
  actionBtnsContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: Platform.OS === 'android' ? 60 : 44,
    backgroundColor: '#FFFFFF',
  },
  cancelOrderBtn: {
    flex: 1, backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  cancelOrderBtnText: { fontSize: 14, fontWeight: '800', color: '#C62828' },
  confirmDeliveryBtn: {
    flex: 1, backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  confirmDeliveryBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
});

export default FarmerPaymentScreen;
