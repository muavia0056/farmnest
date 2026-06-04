import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, ScrollView, Platform, Dimensions, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import { deleteCropPostInFirebase } from '../../services/firebaseCropService';
import { deleteFundingPostInFirebase } from '../../services/firebaseFundingService';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const { width } = Dimensions.get('window');

const Toast = ({ message, visible, color = '#E53935' }: { message: string; visible: boolean; color?: string }) => {
  if (!visible) return null;
  return (
    <View style={[styles.toast, { backgroundColor: color }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

// ── Gallery identical to BuyerHomeScreen ──────────────────────────────────────
const ImageGallery = ({
  images,
  onImagePress,
}: {
  images: string[];
  onImagePress?: (idx: number) => void;
}) => {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const galleryWidth = width - 32;
  if (!images || !images.length)
    return (
      <View style={styles.galleryPlaceholder}>
        <Text style={{ fontSize: 40 }}>🌾</Text>
      </View>
    );
  return (
    <View style={{ marginBottom: 16 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e =>
          setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))
        }
        style={{ width: galleryWidth, height: 210 }}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.92} onPress={() => onImagePress?.(i)}>
            <Image source={{ uri }} style={{ width: galleryWidth, height: 210 }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.galleryIndicatorRow}>
          <Text style={styles.galleryIndicatorText}>{activeIdx + 1}/{images.length}</Text>
        </View>
      )}
    </View>
  );
};

const AdminPostsScreen = ({ navigation }: any) => {
  const { cropPosts, setCropPosts, fundingPosts, setFundingPosts, users, addNotification, markCropPostDeleted, markFundingPostDeleted } = useApp();
  const [activeTab, setActiveTab] = useState<'crops' | 'land'>('crops');
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [postType, setPostType] = useState<'crop' | 'land'>('crop');
  const [showDetail, setShowDetail] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#E53935');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const viewerVisibleRef = useRef(viewerVisible);
  const showConfirmRef   = useRef(showConfirm);
  const showDetailRef    = useRef(showDetail);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);
  useEffect(() => { showConfirmRef.current   = showConfirm;   }, [showConfirm]);
  useEffect(() => { showDetailRef.current    = showDetail;    }, [showDetail]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
        if (showConfirmRef.current)   { setShowConfirm(false);   return true; }
        if (showDetailRef.current)    { setShowDetail(false);    return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs); setViewerIndex(idx); setViewerVisible(true);
  };

  const showToast = (msg: string, color = '#2E7D32') => {
    setToastMsg(msg); setToastColor(color); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  };

  const handleRemoveCrop = async (post: any) => {
    // Register deletion so the Firestore snapshot never puts this post back
    markCropPostDeleted(post.id);
    // Optimistic update: remove from local state immediately
    setCropPosts((prev: any[]) => prev.filter((p: any) => p.id !== post.id));
    setShowConfirm(false);
    setShowDetail(false);
    showToast('✅ Crop post removed successfully.');
    try {
      await deleteCropPostInFirebase(post.id);
      addNotification(post.farmerId, {
        en: `🗑️ Admin has removed your crop post: "${post.cropTitle}"`,
        ur: `🗑️ ایڈمن نے آپ کی فصل کی پوسٹ حذف کر دی ہے: "${post.cropTitle}"`,
      });
    } catch (e: any) {
      console.warn('Admin delete crop failed:', e?.code, e?.message);
      showToast('❌ Failed to remove crop post. Please try again.', '#E53935');
    }
  };

  const handleRemoveLand = async (post: any) => {
    // Register deletion so the Firestore snapshot never puts this post back
    markFundingPostDeleted(post.id);
    // Optimistic update: remove from local state immediately
    setFundingPosts((prev: any[]) => prev.filter((p: any) => p.id !== post.id));
    setShowConfirm(false);
    setShowDetail(false);
    showToast('✅ Land post removed successfully.');
    try {
      await deleteFundingPostInFirebase(post.id);
      addNotification(post.farmerId, {
        en: `🗑️ Admin has removed your land post: "${post.title || post.landTitle}"`,
        ur: `🗑️ ایڈمن نے آپ کی زمین کی پوسٹ حذف کر دی ہے: "${post.title || post.landTitle}"`,
      });
    } catch (e: any) {
      console.warn('Admin delete land failed:', e?.code, e?.message);
      showToast('❌ Failed to remove land post. Please try again.', '#E53935');
    }
  };

  const openDetail = (post: any, type: 'crop' | 'land') => {
    setSelectedPost(post); setPostType(type);
    setShowDetail(true);
  };

  const getFarmerName = (farmerId: string) => {
    const f = users.find(u => u.id === farmerId);
    return f ? `${f.firstName} ${f.lastName}` : 'Unknown';
  };

  const formatTime = (ts: number) => ts ? new Date(ts).toLocaleDateString() : 'N/A';

  const renderCropCard = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.postCard} onPress={() => openDetail(item, 'crop')} activeOpacity={0.85}>
      {item.images?.[0] ? (
        <TouchableOpacity onPress={() => openImageViewer(item.images, 0)} activeOpacity={0.85}>
          <Image source={{ uri: item.images[0] }} style={styles.postThumb} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={styles.postThumbPH}><Text style={{ fontSize: 26 }}>🌾</Text></View>
      )}
      <View style={styles.postInfo}>
        <Text style={styles.postTitle} numberOfLines={1}>{item.cropTitle}</Text>
        <Text style={styles.postFarmer}>👨‍🌾 {getFarmerName(item.farmerId)}</Text>
        <Text style={styles.postCity}>📍 {item.city}</Text>
        <View style={[styles.statusPill, { backgroundColor: item.status === 'Active' ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={[styles.statusPillText, { color: item.status === 'Active' ? '#2E7D32' : '#E53935' }]}>
            {item.status === 'Active' ? '🟢 Active' : '🔴 ' + item.status}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => { setSelectedPost(item); setPostType('crop'); setShowConfirm(true); }}
        activeOpacity={0.8}>
        <Text style={styles.removeBtnText}>🗑️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderLandCard = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.postCard} onPress={() => openDetail(item, 'land')} activeOpacity={0.85}>
      {item.images?.[0] ? (
        <TouchableOpacity onPress={() => openImageViewer(item.images, 0)} activeOpacity={0.85}>
          <Image source={{ uri: item.images[0] }} style={styles.postThumb} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={styles.postThumbPH}><Text style={{ fontSize: 26 }}>🌍</Text></View>
      )}
      <View style={styles.postInfo}>
        <Text style={styles.postTitle} numberOfLines={1}>{item.title || item.landTitle}</Text>
        <Text style={styles.postFarmer}>👨‍🌾 {getFarmerName(item.farmerId)}</Text>
        <Text style={styles.postCity}>📍 {item.city}</Text>
        <View style={[styles.statusPill, { backgroundColor: item.status === 'Active' ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={[styles.statusPillText, { color: item.status === 'Active' ? '#2E7D32' : '#E53935' }]}>
            {item.status === 'Active' ? '🟢 Active' : '🔴 ' + item.status}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => { setSelectedPost(item); setPostType('land'); setShowConfirm(true); }}
        activeOpacity={0.8}>
        <Text style={styles.removeBtnText}>🗑️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AdminHeader title="Manage Posts" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'crops' && styles.tabActive]}
          onPress={() => setActiveTab('crops')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'crops' && styles.tabTextActive]}>
            🌾 Crop Posts ({cropPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'land' && styles.tabActive]}
          onPress={() => setActiveTab('land')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'land' && styles.tabTextActive]}>
            🌍 Land Posts ({fundingPosts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'crops' ? (
        cropPosts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🌾</Text>
            <Text style={styles.emptyTitle}>No Crop Posts</Text>
            <Text style={styles.emptySubtitle}>Farmers haven't listed any crops yet.</Text>
          </View>
        ) : (
          <FlatList
            data={cropPosts}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={renderCropCard}
          />
        )
      ) : (
        fundingPosts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🌍</Text>
            <Text style={styles.emptyTitle}>No Land Posts</Text>
            <Text style={styles.emptySubtitle}>Farmers haven't listed any land yet.</Text>
          </View>
        ) : (
          <FlatList
            data={fundingPosts}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={renderLandCard}
          />
        )
      )}

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowDetail(false)}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Post Details</Text>
              <View style={{ width: 70 }} />
            </View>
            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={true}
              bounces={true}
              overScrollMode="always"
              keyboardShouldPersistTaps="handled">
              {selectedPost && (
                <>
                  {/* ── Gallery (same as BuyerHomeScreen) ── */}
                  {selectedPost.images?.length > 0 && (
                    <View style={styles.galleryWrap}>
                      <ImageGallery
                        images={selectedPost.images}
                        onImagePress={idx => openImageViewer(selectedPost.images, idx)}
                      />
                    </View>
                  )}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailTitle}>
                      {postType === 'crop' ? selectedPost.cropTitle : (selectedPost.title || selectedPost.landTitle)}
                    </Text>
                    <Text style={styles.detailFarmer}>👨‍🌾 Farmer: {getFarmerName(selectedPost.farmerId)}</Text>
                    {(() => {
                      const farmer = users.find((u: any) => u.id === selectedPost.farmerId);
                      return farmer?.cnic ? (
                        <Text style={styles.detailFarmerCnic}>🪪 Account No: {farmer.cnic}</Text>
                      ) : null;
                    })()}
                    <Text style={styles.detailCity}>📍 {selectedPost.city}</Text>
                    {selectedPost.address && <Text style={styles.detailAddress}>🏠 {selectedPost.address}</Text>}
                    {selectedPost.description && (
                      <Text style={styles.detailDesc}>{selectedPost.description}</Text>
                    )}
                    {postType === 'crop' && (
                      <>
                        <Text style={styles.detailMeta}>💰 Base Price: PKR {selectedPost.basePrice?.toLocaleString()}</Text>
                        <Text style={styles.detailMeta}>🏷️ Bids: {(selectedPost.bids || []).length}</Text>
                      </>
                    )}
                    <Text style={styles.detailMeta}>
                      📅 Posted: {formatTime(selectedPost.timestamp || selectedPost.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removePostBtn}
                    onPress={() => setShowConfirm(true)}
                    activeOpacity={0.85}>
                    <Text style={styles.removePostBtnText}>🗑️ Remove This Post</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm Remove Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>⚠️</Text>
            <Text style={styles.confirmTitle}>Remove Post?</Text>
            <Text style={styles.confirmMsg}>
              This will remove the post permanently and notify the farmer. This cannot be undone.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmRemoveBtn}
                onPress={() => {
                  if (postType === 'crop') handleRemoveCrop(selectedPost);
                  else handleRemoveLand(selectedPost);
                }}
                activeOpacity={0.85}>
                <Text style={styles.confirmRemoveBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  tabs: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', marginHorizontal: 14,
    marginTop: 14, borderRadius: 14, padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: '#1A1A2E' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#9E9E9E' },
  tabTextActive: { color: '#FFFFFF' },
  listContent: { padding: 14, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  postCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  postThumb: { width: 70, height: 70, borderRadius: 12 },
  postThumbPH: {
    width: 70, height: 70, borderRadius: 12, backgroundColor: '#F0F0F0',
    justifyContent: 'center', alignItems: 'center',
  },
  postInfo: { flex: 1, gap: 3 },
  postTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B' },
  postFarmer: { fontSize: 12, color: '#555555', fontWeight: '500' },
  postCity: { fontSize: 11, color: '#9E9E9E' },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  removeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFEBEE',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EF9A9A',
  },
  removeBtnText: { fontSize: 18 },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: '#F4F6F9' },
  modalContainer: { height: SCREEN_HEIGHT, backgroundColor: '#F4F6F9', flex: 1 },
  modalScrollView: { flex: 1, height: '100%' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A2E', paddingTop: Platform.OS === 'ios' ? 50 : 44,
    paddingBottom: 16, paddingHorizontal: 16,
  },
  modalBackBtn: { padding: 4 },
  modalBackTxt: { fontSize: 15, color: '#FF6B35', fontWeight: '700' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  modalScroll: { padding: 16, paddingBottom: 60 },
  // Gallery
  galleryWrap: { borderRadius: 16, overflow: 'hidden' },
  galleryPlaceholder: {
    height: 210, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
    borderRadius: 16, marginBottom: 16,
  },
  galleryIndicatorRow: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  galleryIndicatorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  detailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4, gap: 6,
  },
  detailTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  detailFarmer: { fontSize: 13, color: '#555555', fontWeight: '600' },
  detailFarmerCnic: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  detailCity: { fontSize: 13, color: '#757575', fontWeight: '500' },
  detailAddress: { fontSize: 13, color: '#757575', fontWeight: '500' },
  detailDesc: { fontSize: 14, color: '#444444', lineHeight: 22, marginTop: 4 },
  detailMeta: { fontSize: 13, color: '#555555', fontWeight: '600' },
  removePostBtn: {
    backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  removePostBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
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
  confirmMsg: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#555555' },
  confirmRemoveBtn: {
    flex: 1, backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  confirmRemoveBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});

export default AdminPostsScreen;
