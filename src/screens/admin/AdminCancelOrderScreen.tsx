import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, ScrollView, Platform, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import { updateCropPostInFirebase } from '../../services/firebaseCropService';
import { adminApproveOrderInFirebase } from '../../services/firebaseOrderService';
import db from '../../firebase/firestore';

const Toast = ({ message, visible, color = '#2E7D32' }: { message: string; visible: boolean; color?: string }) => {
  if (!visible) return null;
  return (
    <View style={[styles.toast, { backgroundColor: color }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

const AdminCancelOrderScreen = ({ navigation }: any) => {
  const { cropPosts, users, addNotification, addPenaltyToBuyer, setUsers } = useApp();
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPenaltyInfo, setShowPenaltyInfo] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [approveOrder, setApproveOrder] = useState<any>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Track post IDs processed this session so button disappears immediately
  const [processedPostIds, setProcessedPostIds] = useState<Set<string>>(new Set());
  const markProcessed = (postId: string) => setProcessedPostIds(prev => new Set([...prev, postId]));

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showConfirmRef      = useRef(showConfirm);
  const showApproveRef      = useRef(showApproveConfirm);
  const showPenaltyInfoRef  = useRef(showPenaltyInfo);
  const viewerVisibleRef    = useRef(viewerVisible);
  useEffect(() => { showConfirmRef.current     = showConfirm;       }, [showConfirm]);
  useEffect(() => { showApproveRef.current     = showApproveConfirm;}, [showApproveConfirm]);
  useEffect(() => { showPenaltyInfoRef.current = showPenaltyInfo;   }, [showPenaltyInfo]);
  useEffect(() => { viewerVisibleRef.current   = viewerVisible;     }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)   { setViewerVisible(false);    return true; }
        if (showPenaltyInfoRef.current) { setShowPenaltyInfo(false);  return true; }
        if (showApproveRef.current)     { setShowApproveConfirm(false); return true; }
        if (showConfirmRef.current)     { setShowConfirm(false);      return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const showToast = (msg: string, color = '#2E7D32') => {
    setToastMsg(msg); setToastColor(color); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  // Gather all active orders: posts where auction ended and there is a
  // selected buyer (farmer-chosen) OR a highest bidder (auto-winner).
  // Always use the farmer's explicit selectedBidderId as the active buyer
  // when set — this updates in real-time via the cropPosts onSnapshot.
  const activeOrders: any[] = [];
  cropPosts.forEach(post => {
    if (post.status === 'SoldOut') return;
    if (processedPostIds.has(post.id)) return;
    const activeBids = (post.bids || []).filter((b: any) => !b.cancelled);
    if (!activeBids.length) return;
    const auctionExpired = Date.now() > (post.bidEndTimestamp || 0);
    if (!auctionExpired) return;

    const selectedBidderId = (post as any).selectedBidderId;

    // Use farmer-selected buyer if set; otherwise fall back to highest bidder
    let activeBid: any = null;
    if (selectedBidderId) {
      activeBid = activeBids.find((b: any) => b.bidderId === selectedBidderId);
    }
    if (!activeBid) {
      // Auto-winner: highest bidder
      activeBid = activeBids.reduce(
        (mx: any, b: any) => b.amount > mx.amount ? b : mx,
        activeBids[0]
      );
      // Only show if AuctionBootstrap stamped wonTimestamp (auto-finalized)
      // OR farmer has explicitly selected someone
      if (!selectedBidderId && !((activeBid as any).wonTimestamp > 0)) return;
    }

    activeOrders.push({ post, bid: activeBid, selectedBidderId });
  });

  const getBuyer = (bidderId: string) => users.find(u => u.id === bidderId);
  const getFarmer = (farmerId: string) => users.find(u => u.id === farmerId);

  const handleCancel = async (order: any) => {
    const { post, bid } = order;
    const buyer = getBuyer(bid.bidderId);

    const days = parseInt(post.bidEndDay || '0', 10);
    const hours = parseInt(post.bidEndHour || '1', 10);
    const minutes = parseInt(post.bidEndMinute || '0', 10);
    const durationMs = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;

    // Clear all bid wonTimestamps and selectedBidderId so no buyer
    // sees an active order after admin cancels
    const clearedBids = (post.bids || []).map((b: any) => {
      const cleaned = { ...b };
      delete cleaned.wonTimestamp;
      cleaned.paymentConfirmed = false;
      return cleaned;
    });

    updateCropPostInFirebase(post.id, {
      bids: clearedBids,
      status: 'Active',
      bidEndTimestamp: Date.now() + durationMs,
      auctionNotified: false,
      selectedBidderId: null as any,
      selectedBidderNotifiedAt: null as any,
      orderId: null as any,
    } as any).catch(e => console.warn('handleCancel relist failed:', e));

    // Cancel the Firestore order doc so buyer order screen clears immediately
    const prevOrderId = (post as any).orderId;
    if (prevOrderId) {
      db.collection('orders').doc(prevOrderId).update({
        status: 'Cancelled',
        cancelledBy: 'admin',
      }).catch(e => console.warn('handleCancel order doc cancel failed:', e));
    }

    if (buyer) addPenaltyToBuyer(buyer.id);

    addNotification(bid.bidderId, {
      en: `⚠️ Admin has cancelled your order for "${post.cropTitle}". A penalty has been added. The item is back to bidding.`,
      ur: `⚠️ ایڈمن نے "${post.cropTitle}" کا آرڈر منسوخ کردیا۔ آپ کے اکاؤنٹ میں جرمانہ شامل کیا گیا۔ یہ آئٹم دوبارہ بولی میں چلا گیا۔`,
    });
    addNotification(post.farmerId, {
      en: `⚠️ The buyer did not send the payment for "${post.cropTitle}". Please select another buyer from "See All Bidding".`,
      ur: `⚠️ خریدار نے "${post.cropTitle}" کی ادائیگی نہیں بھیجی۔ براہ کرم "تمام بولیاں دیکھیں" سے دوسرا خریدار منتخب کریں۔`,
    });

    markProcessed(post.id);
    setShowConfirm(false);
    showToast('✅ Order cancelled. Penalty added to buyer. Post back to bidding.', '#E53935');
  };

  return (
    <View style={styles.container}>
      <AdminHeader title="Cancel Order" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      {activeOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📦</Text>
          <Text style={styles.emptyTitle}>No Orders Found</Text>
          <Text style={styles.emptySubtitle}>There are no completed auction orders to cancel.</Text>
        </View>
      ) : (
        <FlatList
          data={activeOrders}
          keyExtractor={(item, i) => `${item.post.id}-${i}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const buyer = getBuyer(item.bid.bidderId);
            const farmer = getFarmer(item.post.farmerId);
            return (
              <View style={styles.orderCard}>
                {item.post.images?.[0] ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openImageViewer(item.post.images, 0)}>
                    <Image source={{ uri: item.post.images[0] }} style={styles.orderThumb} resizeMode="cover" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.orderThumbPH}><Text style={{ fontSize: 22 }}>🌾</Text></View>
                )}
                <View style={styles.orderInfo}>
                  <Text style={styles.orderTitle} numberOfLines={1}>{item.post.cropTitle}</Text>
                  <Text style={styles.orderBuyer}>
                    🛒 {buyer ? `${buyer.firstName} ${buyer.lastName}` : item.bid.bidderName}
                  </Text>
                  <Text style={styles.orderFarmer}>
                    🌾 {farmer ? `${farmer.firstName} ${farmer.lastName}` : 'Unknown'}
                  </Text>
                  <Text style={styles.orderAmt}>PKR {item.bid.amount.toLocaleString()}</Text>
                  {item.bid.paymentConfirmed && (
                    <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>💳 Payment Sent</Text></View>
                  )}
                  {(buyer?.penalties || 0) > 0 && (
                    <Text style={styles.buyerPenalties}>⚠️ Buyer has {buyer?.penalties}/3 penalties</Text>
                  )}
                </View>
                  <View style={styles.orderActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => { setApproveOrder(item); setShowApproveConfirm(true); }}
                    activeOpacity={0.85}>
                    <Text style={styles.approveBtnText}>✅ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setSelectedOrder(item); setShowConfirm(true); }}
                    activeOpacity={0.85}>
                    <Text style={styles.cancelBtnText}>🚫 Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Full-screen Image Viewer */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Confirm Cancel Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>🚫</Text>
            <Text style={styles.confirmTitle}>Cancel Order?</Text>
            {selectedOrder && (
              <Text style={styles.confirmMsg}>
                Cancel the order for{' '}
                <Text style={{ fontWeight: '800' }}>{selectedOrder.post.cropTitle}</Text>?{'\n\n'}
                • Order goes back to bidding{'\n'}
                • Buyer receives a penalty{'\n'}
                • 3 penalties = account suspended
              </Text>
            )}
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.keepBtnText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => handleCancel(selectedOrder)}
                activeOpacity={0.85}>
                <Text style={styles.confirmCancelBtnText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Approve Confirm Modal */}
      <Modal visible={showApproveConfirm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowApproveConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>✅</Text>
            <Text style={styles.confirmTitle}>Approve Payment?</Text>
            {approveOrder && (
              <Text style={styles.confirmMsg}>
                Confirm that Farm Nest has received the payment for{' '}
                <Text style={{ fontWeight: '800' }}>{approveOrder.post.cropTitle}</Text>?{'\n\n'}The buyer will be notified.
              </Text>
            )}
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowApproveConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.keepBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.approveConfirmBtn}
                onPress={() => {
                  if (approveOrder) {
                    const { post, bid } = approveOrder;
                    // Find matching order document in Firestore
                    db.collection('orders')
                      .where('postId', '==', post.id)
                      .limit(1)
                      .get()
                      .then(async snap => {
                        if (!snap.empty) {
                          const orderId = snap.docs[0].id;
                          await adminApproveOrderInFirebase(
                            orderId,
                            post.farmerId,
                            bid.bidderId,
                            bid.amount,
                            post.cropTitle,
                          );
                        } else {
                          // No order doc yet — just mark post SoldOut
                          await updateCropPostInFirebase(post.id, { status: 'SoldOut' });
                          // Manually notify
                          addNotification(bid.bidderId, {
                            en: `✅ Farm Nest has received your payment for "${post.cropTitle}". Thank you!`,
                            ur: `✅ فارم نیسٹ کو "${post.cropTitle}" کی ادائیگی موصول ہوگئی۔ شکریہ!`,
                          });
                          addNotification(post.farmerId, {
                            en: `✅ The order for "${post.cropTitle}" has been approved. Payment received by Farm Nest.`,
                            ur: `✅ "${post.cropTitle}" کا آرڈر منظور ہوگیا۔`,
                          });
                        }
                      })
                      .catch(e => console.warn('Approve order lookup failed:', e));

                    // Immediately remove from list
                    markProcessed(post.id);
                    // Clear buyer penalties in Firestore and local state on successful payment
                    db.collection('users').doc(bid.bidderId).update({
                      penalties: 0,
                    }).catch((e: any) => console.warn('[AdminCancelOrder] clear penalties failed:', e));
                    setUsers((prev: any) => prev.map((u: any) =>
                      u.id === bid.bidderId ? { ...u, penalties: 0 } : u
                    ));
                    setShowApproveConfirm(false);
                    showToast('✅ Payment approved. Order completed!', '#2E7D32');
                  }
                }}
                activeOpacity={0.85}>
                <Text style={styles.approveConfirmBtnText}>Yes, Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Penalty Info Modal */}
      <Modal visible={showPenaltyInfo} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowPenaltyInfo(false)}>
        <View style={styles.overlay}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>⚠️ Penalty System</Text>
            <Text style={styles.infoCardBody}>
              If you have received a penalty, it means you either canceled an order after winning a bid or failed to send the payment to the Farmnest account within 24 hours.{'\n\n'}
              • 1st penalty: Warning{'\n'}
              • 2nd penalty: Warning{'\n'}
              • 3rd consecutive penalty: Account automatically suspended
            </Text>
            <TouchableOpacity style={styles.infoCloseBtn} onPress={() => setShowPenaltyInfo(false)} activeOpacity={0.85}>
              <Text style={styles.infoCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  toast: {
    position: 'absolute', top: 80, left: 20, right: 20, zIndex: 999,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  listContent: { padding: 14, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  orderCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  orderThumb: { width: 64, height: 64, borderRadius: 14 },
  orderThumbPH: {
    width: 64, height: 64, borderRadius: 14, backgroundColor: '#F1F8E9',
    justifyContent: 'center', alignItems: 'center',
  },
  orderInfo: { flex: 1, gap: 3 },
  orderTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B' },
  orderBuyer: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  orderFarmer: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  orderAmt: { fontSize: 13, fontWeight: '800', color: '#FF6B35' },
  paidBadge: { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  paidBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '700' },
  buyerPenalties: { fontSize: 11, color: '#E53935', fontWeight: '600' },
  orderActions: { flexDirection: 'column', gap: 6, alignItems: 'center' },
  approveBtn: {
    backgroundColor: '#E8F5E9', borderRadius: 12, paddingVertical: 8,
    paddingHorizontal: 10, borderWidth: 1.5, borderColor: '#A5D6A7', alignItems: 'center',
  },
  approveBtnText: { fontSize: 11, fontWeight: '800', color: '#2E7D32' },
  cancelBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 12, paddingVertical: 8,
    paddingHorizontal: 10, borderWidth: 1.5, borderColor: '#EF9A9A', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 11, fontWeight: '800', color: '#C62828' },
  approveConfirmBtn: {
    flex: 1, backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  approveConfirmBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 30,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 15,
  },
  confirmEmoji: { fontSize: 52, marginBottom: 14 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  confirmMsg: { fontSize: 14, color: '#555555', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  keepBtn: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  keepBtnText: { fontSize: 15, fontWeight: '700', color: '#555555' },
  confirmCancelBtn: {
    flex: 1, backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 15,
  },
  infoCardTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 16 },
  infoCardBody: { fontSize: 14, color: '#444444', lineHeight: 24, marginBottom: 24 },
  infoCloseBtn: {
    backgroundColor: '#1A1A2E', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  infoCloseBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

export default AdminCancelOrderScreen;
