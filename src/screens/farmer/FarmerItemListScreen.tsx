import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, Animated, Alert, ScrollView,
  ActivityIndicator, Platform, BackHandler, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';
import {
  updateCropPostInFirebase,
  deleteCropPostInFirebase,
} from '../../services/firebaseCropService';
import {
  updateFundingPostInFirebase,
  deleteFundingPostInFirebase,
} from '../../services/firebaseFundingService';

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

const FarmerItemListScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, fundingPosts, addNotification, markCropPostDeleted, markFundingPostDeleted } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'crop' | 'land'>('crop');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editBidDay, setEditBidDay] = useState('');
  const [editBidHour, setEditBidHour] = useState('');
  const [editBidMinute, setEditBidMinute] = useState('');
  const [editTargetAmount, setEditTargetAmount] = useState('');

  // Image viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  // ── Android hardware back button — single handler using refs to avoid stale closures ─
  const viewerVisibleRef = useRef(viewerVisible);
  const showEditModalRef = useRef(showEditModal);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);
  useEffect(() => { showEditModalRef.current = showEditModal; }, [showEditModal]);

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
        if (showEditModalRef.current) { setShowEditModal(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs); setViewerIndex(idx); setViewerVisible(true);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const myCropPosts = cropPosts
    .filter(p => p.farmerId === currentUser?.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const myFundingPosts = fundingPosts.filter(p => p.farmerId === currentUser?.id);

  const handleDelete = (postId: string, type: 'crop' | 'land') => {
    if (isPending) { setShowPendingModal(true); return; }
    Alert.alert(
      t('deletePost'),
      type === 'crop' ? t('deleteConfirmCrop') : t('deleteConfirmLand'),
      [
        { text: t('cancelLabel'), style: 'cancel' },
        {
          text: t('deleteLabel'),
          style: 'destructive',
          onPress: async () => {
            if (type === 'crop') {
              // Guard: prevent the Firestore snapshot from restoring the post
              // when ensureMainAdminSession triggers onAuthStateChanged.
              markCropPostDeleted(postId);
              showToast(t('cropDeleteSuccess'));
              try {
                await deleteCropPostInFirebase(postId);
              } catch (e) {
                console.warn('Delete crop from Firestore failed:', e);
              }
            } else {
              markFundingPostDeleted(postId);
              showToast(t('landDeleteSuccess'));
              try {
                await deleteFundingPostInFirebase(postId);
              } catch (e) {
                console.warn('Delete land from Firestore failed:', e);
              }
            }
          },
        },
      ]
    );
  };

  const handleSaleOut = (postId: string, type: 'crop' | 'land') => {
    if (isPending) { setShowPendingModal(true); return; }
    if (type === 'crop') {
      updateCropPostInFirebase(postId, { status: 'SoldOut' }).catch(e =>
        console.warn('SaleOut Firestore update failed:', e),
      );
    } else {
      updateFundingPostInFirebase(postId, { status: 'SoldOut' }).catch(e =>
        console.warn('Land SaleOut Firestore update failed:', e),
      );
    }
    showToast(t('cropSaleSuccess'));
  };

  const openEditCrop = (post: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    setEditingPost({ ...post, type: 'crop' });
    setEditTitle(post.cropTitle);
    setEditDescription(post.description);
    setEditCity(post.city);
    setEditAddress(post.address);
    setEditImages([...post.images]);
    setEditBidDay(post.bidEndDay || '');
    setEditBidHour(post.bidEndHour || '');
    setEditBidMinute(post.bidEndMinute || '');
    setShowEditModal(true);
  };

  const openEditLand = (post: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    setEditingPost({ ...post, type: 'land' });
    setEditTitle(post.landTitle);
    setEditDescription(post.description);
    setEditCity(post.city);
    setEditAddress(post.address);
    setEditImages([...post.images]);
    setEditTargetAmount(post.targetAmount ? String(post.targetAmount) : '');
    setShowEditModal(true);
  };

  const handleAddEditImage = async () => {
    if (editImages.length >= 3) { Alert.alert(t('maxImagesAllowed')); return; }
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    if (result.assets && result.assets[0]?.uri) {
      setEditImages(prev => [...prev, result.assets![0].uri!]);
    }
  };

  const handleSaveEdit = async () => {
    setEditLoading(true);
    try {
      if (editingPost?.type === 'crop') {
        const days = parseInt(editBidDay || '0');
        const hours = parseInt(editBidHour || '0');
        const mins = parseInt(editBidMinute || '0');
        const newEndTimestamp = Date.now() + (days * 86400000) + (hours * 3600000) + (mins * 60000);
        await updateCropPostInFirebase(editingPost.id, {
          cropTitle: editTitle,
          description: editDescription,
          city: editCity,
          address: editAddress,
          images: editImages,
          bidEndDay: editBidDay,
          bidEndHour: editBidHour,
          bidEndMinute: editBidMinute,
          bidEndTimestamp: newEndTimestamp,
          bids: [],
          auctionNotified: false,
          status: 'Active',
        });
      } else {
        await updateFundingPostInFirebase(editingPost.id, {
          title: editTitle,
          description: editDescription,
          city: editCity,
          address: editAddress,
          images: editImages,
          targetAmount: editTargetAmount ? parseFloat(editTargetAmount) : null,
        });
      }
      setEditLoading(false);
      setShowEditModal(false);
      showToast(t('editSuccess'));
    } catch (e) {
      setEditLoading(false);
      Alert.alert('Update Failed', 'Could not update the listing. Please try again.');
      console.warn('handleSaveEdit error:', e);
    }
  };

  const renderCropItem = ({ item }: { item: any }) => (
    <Animated.View style={styles.postCard}>
      <View style={styles.postRow}>
        {item.images[0] ? (
          <TouchableOpacity onPress={() => openImageViewer(item.images, 0)} activeOpacity={0.85}>
            <Image source={{ uri: item.images[0] }} style={styles.postImage} />
          </TouchableOpacity>
        ) : (
          <View style={styles.postImagePlaceholder}>
            <Text style={{ fontSize: 28 }}>🌾</Text>
          </View>
        )}
        <View style={styles.postInfo}>
          <Text style={[styles.postTitle, isUrdu && styles.rtlText]} numberOfLines={2}>{item.cropTitle}</Text>
          <Text style={styles.postPrice}>PKR {item.basePrice}</Text>
          <Text style={styles.postCity}>📍 {item.city}</Text>
          {item.status === 'SoldOut' && (
            <Text style={styles.soldOutTag}>{t('cropSoldOut')}</Text>
          )}
        </View>
      </View>

      <View style={styles.actionBtnRow}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditCrop(item)} activeOpacity={0.8}>
          <Text style={styles.editBtnText}>{t('editBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, 'crop')} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>{t('deleteBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saleOutBtn, item.status === 'SoldOut' && styles.saleOutBtnDone]}
          onPress={() => handleSaleOut(item.id, 'crop')}
          disabled={item.status === 'SoldOut'}
          activeOpacity={0.8}>
          <Text style={styles.saleOutBtnText}>
            {item.status === 'SoldOut' ? t('soldBtn') : t('saleOutBtn')}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderLandItem = ({ item }: { item: any }) => (
    <Animated.View style={styles.postCard}>
      <View style={styles.postRow}>
        {item.images[0] ? (
          <TouchableOpacity onPress={() => openImageViewer(item.images, 0)} activeOpacity={0.85}>
            <Image source={{ uri: item.images[0] }} style={styles.postImage} />
          </TouchableOpacity>
        ) : (
          <View style={styles.postImagePlaceholder}>
            <Text style={{ fontSize: 28 }}>🌍</Text>
          </View>
        )}
        <View style={styles.postInfo}>
          <Text style={[styles.postTitle, isUrdu && styles.rtlText]} numberOfLines={2}>{item.landTitle}</Text>
          <Text style={styles.postCity}>📍 {item.city}</Text>
          {item.status === 'SoldOut' && (
            <Text style={styles.soldOutTag}>{t('landSoldOut')}</Text>
          )}
        </View>
      </View>

      <View style={styles.actionBtnRow}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditLand(item)} activeOpacity={0.8}>
          <Text style={styles.editBtnText}>{t('editBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, 'land')} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>{t('deleteBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saleOutBtn, item.status === 'SoldOut' && styles.saleOutBtnDone]}
          onPress={() => handleSaleOut(item.id, 'land')}
          disabled={item.status === 'SoldOut'}
          activeOpacity={0.8}>
          <Text style={styles.saleOutBtnText}>
            {item.status === 'SoldOut' ? t('soldBtn') : t('saleOutBtn')}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const currentList = activeTab === 'crop' ? myCropPosts : myFundingPosts;
  const isEmpty = currentList.length === 0;

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('itemList')} navigation={navigation} />
      <GreenToast message={toastMsg} visible={toastVisible} />
      <AccountPendingModal visible={showPendingModal} onClose={() => setShowPendingModal(false)} role="Farmer" />

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* TABS */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'crop' && styles.tabBtnActive]}
          onPress={() => setActiveTab('crop')} activeOpacity={0.8}>
          <Text style={[styles.tabBtnText, activeTab === 'crop' && styles.tabBtnTextActive]}>
            🌾 {t('crops')} ({myCropPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'land' && styles.tabBtnActive]}
          onPress={() => setActiveTab('land')} activeOpacity={0.8}>
          <Text style={[styles.tabBtnText, activeTab === 'land' && styles.tabBtnTextActive]}>
            🌍 {t('land')} ({myFundingPosts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>{activeTab === 'crop' ? '🌾' : '🌍'}</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>
            {activeTab === 'crop' ? t('noCropsListed') : t('noLandListed')}
          </Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>
            {activeTab === 'crop' ? t('goToDashboard') : t('goToFunding')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={activeTab === 'crop' ? renderCropItem : renderLandItem}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {/* EDIT MODAL */}
      <Modal visible={showEditModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.editModal}>
          <View style={styles.editModalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.editModalBack}>
              <Text style={styles.editModalBackText}>{t('cancelEditListing')}</Text>
            </TouchableOpacity>
            <Text style={styles.editModalTitle}>{t('editListing')}</Text>
            <View style={{ width: 70 }} />
          </View>

          <ScrollView contentContainerStyle={styles.editModalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>{t('images')}</Text>
            <View style={styles.editImagesRow}>
              {editImages.map((uri, idx) => (
                <View key={idx} style={styles.editImageWrap}>
                  <Image source={{ uri }} style={styles.editImageThumb} />
                  <TouchableOpacity
                    style={styles.editImageRemove}
                    onPress={() => setEditImages(prev => prev.filter((_, i) => i !== idx))}>
                    <Text style={styles.editImageRemoveTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {editImages.length < 3 && (
                <TouchableOpacity style={styles.editAddImage} onPress={handleAddEditImage} activeOpacity={0.75}>
                  <Text style={styles.editAddImageIcon}>+</Text>
                  <Text style={styles.editAddImageText}>{t('add')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>{t('titleLabel')}</Text>
            <TextInput
              style={[styles.editInput, isUrdu && styles.rtlInput]}
              value={editTitle}
              onChangeText={v => { if (v.length <= 50) setEditTitle(v); }}
              placeholderTextColor="#9E9E9E"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={50}
            />
            <View style={styles.charCountRow}>
              <View />
              <Text style={[styles.charCount, editTitle.length >= 50 && styles.charCountLimit]}>{editTitle.length}/50</Text>
            </View>

            <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>{t('description')}</Text>
            <TextInput
              style={[styles.editInput, styles.editMultiInput, isUrdu && styles.rtlInput]}
              value={editDescription}
              onChangeText={v => { if (v.length <= 400) setEditDescription(v); }}
              multiline numberOfLines={4}
              textAlignVertical="top"
              placeholderTextColor="#9E9E9E"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={400}
            />
            <View style={styles.charCountRow}>
              <View />
              <Text style={[styles.charCount, editDescription.length >= 400 && styles.charCountLimit]}>{editDescription.length}/400</Text>
            </View>

            <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>{t('cityField')}</Text>
            <TextInput
              style={[styles.editInput, isUrdu && styles.rtlInput]}
              value={editCity}
              onChangeText={v => { if (v.length <= 30) setEditCity(v); }}
              placeholderTextColor="#9E9E9E"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={30}
            />
            <View style={styles.charCountRow}>
              <View />
              <Text style={[styles.charCount, editCity.length >= 30 && styles.charCountLimit]}>{editCity.length}/30</Text>
            </View>

            <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>{t('addressField')}</Text>
            <TextInput
              style={[styles.editInput, styles.editMultiInput, isUrdu && styles.rtlInput]}
              value={editAddress}
              onChangeText={v => { if (v.length <= 400) setEditAddress(v); }}
              multiline numberOfLines={3}
              textAlignVertical="top"
              placeholderTextColor="#9E9E9E"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={400}
            />
            <View style={styles.charCountRow}>
              <View />
              <Text style={[styles.charCount, editAddress.length >= 400 && styles.charCountLimit]}>{editAddress.length}/400</Text>
            </View>

            {/* Target Amount — shown only for land/funding posts */}
            {editingPost?.type === 'land' && (
              <>
                <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>Target Amount (PKR)</Text>
                <TextInput
                  style={[styles.editInput, isUrdu && styles.rtlInput]}
                  value={editTargetAmount}
                  onChangeText={v => setEditTargetAmount(v.replace(/[^0-9.]/g, ''))}
                  placeholder="e.g. 15000"
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numeric"
                  textAlign={isUrdu ? 'right' : 'left'}
                />
              </>
            )}

            {/* Bid Time Extension — shown only for crop posts */}
            {editingPost?.type === 'crop' && (
              <>
                <Text style={[styles.editLabel, isUrdu && styles.rtlText]}>
                  {t('bidEndTime') || 'Extend Bid Time'}
                </Text>
                <Text style={styles.bidTimeHint}>
                  Set a new bid duration to restart/extend bidding from now.
                </Text>
                <View style={styles.bidTimeRow}>
                  {[
                    { val: editBidDay, set: setEditBidDay, ph: 'Days' },
                    { val: editBidHour, set: setEditBidHour, ph: 'Hours' },
                    { val: editBidMinute, set: setEditBidMinute, ph: 'Mins' },
                  ].map((field, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <Text style={styles.bidTimeSep}>:</Text>}
                      <View style={styles.bidTimeField}>
                        <TextInput
                          style={styles.bidTimeInput}
                          placeholder={field.ph}
                          placeholderTextColor="#9E9E9E"
                          keyboardType="numeric"
                          value={field.val}
                          onChangeText={field.set}
                          maxLength={i === 0 ? 3 : 2}
                        />
                        <Text style={styles.bidTimeLabel}>{field.ph}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.saveEditBtn, editLoading && styles.saveEditBtnDisabled]}
              onPress={handleSaveEdit}
              disabled={editLoading}
              activeOpacity={0.85}>
              {editLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveEditBtnText}>{t('updateListing')}</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
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
  tabBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0, gap: 6,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent', borderRadius: 0,
  },
  tabBtnActive: { borderBottomColor: '#2E7D32' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#9E9E9E' },
  tabBtnTextActive: { color: '#2E7D32', fontWeight: '800' },
  listContent: { padding: 14 },
  postCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14,
    marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  postRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  postImage: { width: 80, height: 80, borderRadius: 14, resizeMode: 'cover' },
  postImagePlaceholder: {
    width: 80, height: 80, borderRadius: 14,
    backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
  },
  postInfo: { flex: 1 },
  postTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 5 },
  postPrice: { fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 3 },
  postCity: { fontSize: 12, color: '#757575', fontWeight: '500' },
  soldOutTag: { fontSize: 13, color: '#C62828', fontWeight: '800', marginTop: 4 },
  actionBtnRow: { flexDirection: 'row', gap: 8 },
  editBtn: {
    flex: 1, backgroundColor: '#E3F2FD', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#90CAF9',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  deleteBtn: {
    flex: 1, backgroundColor: '#FFEBEE', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#C62828' },
  saleOutBtn: {
    flex: 1, backgroundColor: '#F3E5F5', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#CE93D8',
  },
  saleOutBtnDone: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  saleOutBtnText: { fontSize: 13, fontWeight: '700', color: '#6A1B9A' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
  editModal: { flex: 1, backgroundColor: '#FFFFFF' },
  editModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  editModalBack: { padding: 6 },
  editModalBackText: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  editModalTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  editModalContent: { padding: 20 },
  editLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 7, marginTop: 14 },
  editImagesRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  editImageWrap: { width: 80, height: 80, borderRadius: 12, position: 'relative' },
  editImageThumb: { width: 80, height: 80, borderRadius: 12 },
  editImageRemove: {
    position: 'absolute', top: -7, right: -7,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  editImageRemoveTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  editAddImage: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: 2, borderColor: '#2E7D32', borderStyle: 'dashed',
    backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
  },
  editAddImageIcon: { fontSize: 22, color: '#2E7D32' },
  editAddImageText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  editInput: {
    backgroundColor: '#F9F9F9', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1B1B1B',
  },
  editMultiInput: { height: 90, textAlignVertical: 'top', paddingTop: 13 },
  saveEditBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginTop: 28,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 9,
  },
  saveEditBtnDisabled: { backgroundColor: '#81C784' },
  saveEditBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  bidTimeHint: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 10, fontStyle: 'italic' },
  bidTimeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bidTimeField: { flex: 1, alignItems: 'center' },
  bidTimeInput: {
    width: '100%', textAlign: 'center', backgroundColor: '#F9F9F9',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingVertical: 13, fontSize: 16, fontWeight: '700', color: '#1B1B1B',
  },
  bidTimeLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginTop: 4 },
  bidTimeSep: { fontSize: 22, fontWeight: '700', color: '#2E7D32', paddingBottom: 18 },
  charCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  charCount: { fontSize: 11, color: '#9E9E9E', fontWeight: '500', textAlign: 'right' },
  charCountLimit: { color: '#E53935', fontWeight: '700' },
});

export default FarmerItemListScreen;
