import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, Platform, BackHandler, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import ImageViewer from '../../components/ImageViewer';
import { deleteCropPostInFirebase } from '../../services/firebaseCropService';
import { deleteFundingPostInFirebase } from '../../services/firebaseFundingService';

const FarmerHistoryScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, fundingPosts, users, orders } = useApp();
  const { t, isUrdu } = useLanguage();

  const [activeTab, setActiveTab] = useState<'crop' | 'land' | 'orders'>('crop');

  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);
  const [showBuyerModal, setShowBuyerModal] = useState(false);

  // Full-screen image viewer
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showImageViewer, setShowImageViewer] = useState(false);

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showImageViewerRef = useRef(showImageViewer);
  const showBuyerModalRef  = useRef(showBuyerModal);
  useEffect(() => { showImageViewerRef.current = showImageViewer; }, [showImageViewer]);
  useEffect(() => { showBuyerModalRef.current  = showBuyerModal;  }, [showBuyerModal]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (showImageViewerRef.current) { setShowImageViewer(false); return true; }
        if (showBuyerModalRef.current)  { setShowBuyerModal(false);  return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setShowImageViewer(true);
  };

  const myPosts = cropPosts.filter(p => p.farmerId === currentUser?.id);
  const myFundingPosts = fundingPosts.filter(p => p.farmerId === currentUser?.id);
  const farmerOrders = orders.filter(
    order => order.farmerId === currentUser?.id,
  );

  const getWinner = (post: any) => {
    const activeBids = post.bids?.filter((b: any) => !b.cancelled) || [];
    if (!activeBids.length) return null;
    return activeBids.reduce((max: any, b: any) => b.amount > max.amount ? b : max, activeBids[0]);
  };

  const openBuyerProfile = (bidderId: string) => {
    const buyer = users.find(u => u.id === bidderId);
    if (buyer) { setSelectedBuyer(buyer); setShowBuyerModal(true); }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });

  const deleteCropPost = (postId: string) => {
    Alert.alert(
      isUrdu ? 'فصل حذف کریں' : 'Delete Crop',
      isUrdu ? 'کیا آپ واقعی اس فصل کی پوسٹ کو تاریخ سے حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this crop post from history?',
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'حذف کریں' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCropPostInFirebase(postId);
            } catch (e) {
              console.warn('Delete crop from Firestore failed:', e);
            }
          },
        },
      ],
    );
  };

  const deleteLandPost = (postId: string) => {
    Alert.alert(
      isUrdu ? 'زمین حذف کریں' : 'Delete Land',
      isUrdu ? 'کیا آپ واقعی اس زمین کی پوسٹ کو تاریخ سے حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this land post from history?',
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'حذف کریں' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFundingPostInFirebase(postId);
            } catch (e) {
              console.warn('Delete land from Firestore failed:', e);
            }
          },
        },
      ],
    );
  };

  const renderCropItem = ({ item }: { item: any }) => {
    const winner = getWinner(item);
    const winnerUser = winner ? users.find(u => u.id === winner.bidderId) : null;
    return (
      <TouchableOpacity
        style={styles.historyCard}
        onPress={() => navigation.navigate('FarmerCropDetail', { postId: item.id })}
        onLongPress={() => deleteCropPost(item.id)}
        delayLongPress={400}
        activeOpacity={0.82}>
        <View style={styles.historyRow}>
          {item.images[0] ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openImageViewer(item.images, 0)}>
              <Image source={{ uri: item.images[0] }} style={styles.historyImage} />
            </TouchableOpacity>
          ) : (
            <View style={styles.historyImagePlaceholder}>
              <Text style={{ fontSize: 24 }}>🌾</Text>
            </View>
          )}
          <View style={styles.historyInfo}>
            <Text style={[styles.historyTitle, isUrdu && styles.rtlText]} numberOfLines={2}>{item.cropTitle}</Text>
            <Text style={styles.historyBase}>PKR {item.basePrice}</Text>
            <Text style={styles.historyCity}>📍 {item.city}</Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </View>
        {winner && winnerUser ? (
          <TouchableOpacity
            style={styles.winnerRow}
            onPress={() => openBuyerProfile(winner.bidderId)}
            activeOpacity={0.8}>
            {winnerUser.profilePic ? (
              <Image source={{ uri: winnerUser.profilePic }} style={styles.winnerAvatar} />
            ) : (
              <View style={styles.winnerAvatarPlaceholder}>
                <Text style={styles.winnerAvatarInit}>
                  {winnerUser.firstName[0]}{winnerUser.lastName[0]}
                </Text>
              </View>
            )}
            <View style={styles.winnerInfo}>
              <Text style={styles.winnerName}>🏆 {winnerUser.firstName} {winnerUser.lastName}</Text>
              <Text style={styles.winnerBid}>{t('wonAt')} PKR {winner.amount.toLocaleString()}</Text>
            </View>
            <Text style={styles.viewProfileArrow}>›</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.noInterestBadge}>
            <Text style={[styles.noInterestText, isUrdu && styles.rtlText]}>{t('noOneInterested')}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderLandItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.historyCard}
      onPress={() => navigation.navigate('FarmerLandDetail', { postId: item.id })}
      onLongPress={() => deleteLandPost(item.id)}
      delayLongPress={400}
      activeOpacity={0.82}>
      <View style={styles.historyRow}>
        {item.images[0] ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openImageViewer(item.images, 0)}>
            <Image source={{ uri: item.images[0] }} style={styles.historyImage} />
          </TouchableOpacity>
        ) : (
          <View style={styles.historyImagePlaceholder}>
            <Text style={{ fontSize: 24 }}>🌍</Text>
          </View>
        )}
        <View style={styles.historyInfo}>
          <Text style={[styles.historyTitle, isUrdu && styles.rtlText]} numberOfLines={2}>{item.landTitle}</Text>
          <Text style={styles.historyCity}>📍 {item.city}</Text>
          <View style={[
            styles.statusPill,
            { backgroundColor: item.status === 'Active' ? '#E8F5E9' : '#FFEBEE' },
          ]}>
            <Text style={[styles.statusPillText, { color: item.status === 'Active' ? '#2E7D32' : '#C62828' }]}>
              {item.status === 'Active' ? t('activeStatus') : t('soldOutStatus')}
            </Text>
          </View>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const renderOrderItem = ({ item }: { item: any }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyRow}>
        <View style={styles.historyImagePlaceholder}>
          <Text style={{ fontSize: 24 }}>📦</Text>
        </View>
        <View style={styles.historyInfo}>
          <Text style={[styles.historyTitle, isUrdu && styles.rtlText]} numberOfLines={2}>
            {item.cropTitle || 'Crop'}
          </Text>
          <Text style={styles.historyBase}>PKR {(item.bidAmount || 0).toLocaleString()}</Text>
          <Text style={styles.historyCity}>👤 {item.buyerName || 'Buyer'}</Text>
        </View>
        <View style={[
          styles.statusPill,
          { backgroundColor: (item.status || 'PendingPayment') === 'Active' ? '#E8F5E9' : '#E3F2FD' },
        ]}>
          <Text style={[styles.statusPillText, { color: (item.status || 'PendingPayment') === 'Active' ? '#2E7D32' : '#1565C0' }]}>
            {item.status || 'PendingPayment'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('history')} navigation={navigation} />

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'crop' && styles.tabBtnActive]}
          onPress={() => setActiveTab('crop')} activeOpacity={0.8}>
          <Text style={[styles.tabBtnText, activeTab === 'crop' && styles.tabBtnTextActive]}>
            🌾 {t('crops')} ({myPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'land' && styles.tabBtnActive]}
          onPress={() => setActiveTab('land')} activeOpacity={0.8}>
          <Text style={[styles.tabBtnText, activeTab === 'land' && styles.tabBtnTextActive]}>
            🌍 {t('land')} ({myFundingPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'orders' && styles.tabBtnActive]}
          onPress={() => setActiveTab('orders')} activeOpacity={0.8}>
          <Text style={[styles.tabBtnText, activeTab === 'orders' && styles.tabBtnTextActive]}>
            📦 Orders ({farmerOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'crop' ? (
        myPosts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📜</Text>
            <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noHistoryYet')}</Text>
            <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('historySubtitle')}</Text>
          </View>
        ) : (
          <FlatList
            data={myPosts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={renderCropItem}
          />
        )
      ) : activeTab === 'orders' ? (
        farmerOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>No Orders Yet</Text>
            <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>Orders from finalized auctions will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={farmerOrders}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={renderOrderItem}
          />
        )
      ) : (
        myFundingPosts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🌍</Text>
            <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noLandListed')}</Text>
            <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('goToFunding')}</Text>
          </View>
        ) : (
          <FlatList
            data={myFundingPosts}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={renderLandItem}
          />
        )
      )}

      {/* ── Full-screen Image Viewer ── */}
      <ImageViewer
        visible={showImageViewer}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setShowImageViewer(false)}
      />

      {/* ── Buyer Profile Modal ── */}
      <Modal visible={showBuyerModal} animationType="slide" transparent onRequestClose={() => setShowBuyerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.buyerModal}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowBuyerModal(false)}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            {selectedBuyer && (
              <>
                <View style={styles.buyerAvatarWrap}>
                  {selectedBuyer.profilePic ? (
                    <Image source={{ uri: selectedBuyer.profilePic }} style={styles.buyerAvatarLarge} />
                  ) : (
                    <View style={styles.buyerAvatarLargePlaceholder}>
                      <Text style={styles.buyerAvatarLargeInit}>
                        {selectedBuyer.firstName[0]}{selectedBuyer.lastName[0]}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.buyerModalName}>{selectedBuyer.firstName} {selectedBuyer.lastName}</Text>
                {[
                  { icon: '📱', label: t('phoneLabel'), value: selectedBuyer.phone },
                  { icon: '🏙️', label: t('cityFieldLabel'), value: selectedBuyer.city },
                  { icon: '📍', label: t('addressFieldLabel'), value: selectedBuyer.address },
                ].map(row => (
                  <View key={row.label} style={styles.buyerInfoRow}>
                    <Text style={styles.buyerInfoIcon}>{row.icon}</Text>
                    <View style={styles.buyerInfoContent}>
                      <Text style={[styles.buyerInfoLabel, isUrdu && styles.rtlText]}>{row.label}</Text>
                      <Text style={[styles.buyerInfoValue, isUrdu && styles.rtlText]}>{row.value || '—'}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0, gap: 6,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#2E7D32' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#9E9E9E' },
  tabBtnTextActive: { color: '#2E7D32', fontWeight: '800' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  historyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  historyRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'center' },
  historyImage: { width: 72, height: 72, borderRadius: 12, resizeMode: 'cover' },
  historyImagePlaceholder: {
    width: 72, height: 72, borderRadius: 12, backgroundColor: '#F1F8E9',
    justifyContent: 'center', alignItems: 'center',
  },
  historyInfo: { flex: 1 },
  historyTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  historyBase: { fontSize: 13, color: '#2E7D32', fontWeight: '600', marginBottom: 2 },
  historyCity: { fontSize: 12, color: '#757575', fontWeight: '500' },
  cardArrow: { fontSize: 24, color: '#BDBDBD', fontWeight: '700' },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  winnerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F8E9', borderRadius: 14, padding: 12, gap: 10,
  },
  winnerAvatar: { width: 42, height: 42, borderRadius: 21 },
  winnerAvatarPlaceholder: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center',
  },
  winnerAvatarInit: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  winnerInfo: { flex: 1 },
  winnerName: { fontSize: 14, fontWeight: '800', color: '#1B1B1B' },
  winnerBid: { fontSize: 13, color: '#2E7D32', fontWeight: '600' },
  viewProfileArrow: { fontSize: 22, color: '#2E7D32', fontWeight: '700' },
  noInterestBadge: {
    backgroundColor: '#FFF8E1', borderRadius: 10, paddingVertical: 8,
    paddingHorizontal: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#FFE082',
  },
  noInterestText: { fontSize: 13, fontWeight: '700', color: '#F57F17' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  buyerModal: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, minHeight: 400,
  },
  modalClose: {
    position: 'absolute', top: 16, right: 20,
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  modalCloseTxt: { fontSize: 16, color: '#555555', fontWeight: '700' },
  buyerAvatarWrap: { alignItems: 'center', marginBottom: 14, marginTop: 10 },
  buyerAvatarLarge: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#2E7D32' },
  buyerAvatarLargePlaceholder: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center',
  },
  buyerAvatarLargeInit: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  buyerModalName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', textAlign: 'center', marginBottom: 20 },
  buyerInfoRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 12,
  },
  buyerInfoIcon: { fontSize: 22 },
  buyerInfoContent: { flex: 1 },
  buyerInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 2 },
  buyerInfoValue: { fontSize: 15, fontWeight: '700', color: '#1B1B1B' },
});

export default FarmerHistoryScreen;
