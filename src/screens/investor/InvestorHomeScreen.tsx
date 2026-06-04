import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, Animated, ScrollView, Dimensions, Platform, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';

const { width } = Dimensions.get('window');

// ── Toast ──────────────────────────────────────────────────────────────────
const Toast = ({ message, visible, color = '#6A1B9A' }: { message: string; visible: boolean; color?: string }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.delay(2400),
        Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { backgroundColor: color, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

// ── Post card gallery (horizontal ScrollView is fine here — not nested inside another) ──
const SwipeGallery = ({ images, galleryWidth, onImagePress }: { images: string[]; galleryWidth?: number; onImagePress?: (idx: number) => void }) => {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const imgWidth = galleryWidth || width - 28;
  if (!images.length) return (
    <View style={[styles.galleryPlaceholder, { width: imgWidth }]}>
      <Text style={{ fontSize: 48 }}>🌍</Text>
    </View>
  );
  return (
    <View style={[styles.galleryWrap, { height: 210 }]}>
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / imgWidth))}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.92} onPress={() => onImagePress?.(i)}>
            <Image source={{ uri }} style={{ width: imgWidth, height: 210 }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && idx > 0 && (
        <TouchableOpacity style={[styles.galleryArrow, styles.galleryArrowLeft]}
          onPress={() => { const n = idx - 1; scrollRef.current?.scrollTo({ x: n * imgWidth, animated: true }); setIdx(n); }}>
          <Text style={styles.galleryArrowText}>‹</Text>
        </TouchableOpacity>
      )}
      {images.length > 1 && idx < images.length - 1 && (
        <TouchableOpacity style={[styles.galleryArrow, styles.galleryArrowRight]}
          onPress={() => { const n = idx + 1; scrollRef.current?.scrollTo({ x: n * imgWidth, animated: true }); setIdx(n); }}>
          <Text style={styles.galleryArrowText}>›</Text>
        </TouchableOpacity>
      )}
      {images.length > 1 && (
        <View style={styles.galleryCounter}>
          <Text style={styles.galleryCounterText}>{idx + 1}/{images.length}</Text>
        </View>
      )}
    </View>
  );
};

// ── Home Screen ────────────────────────────────────────────────────────────
const InvestorHomeScreen = ({ navigation }: any) => {
  const { currentUser, fundingPosts, users } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [hasShownPending, setHasShownPending] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toastMsg] = useState('');
  const [toastVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // "See more" expanded state per post
  const [expandedPosts, setExpandedPosts] = useState<{ [id: string]: boolean }>({});
  const toggleExpanded = (id: string) => setExpandedPosts(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const viewerVisibleRef = useRef(viewerVisible);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
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
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  useEffect(() => {
    if (isPending && !hasShownPending) { setShowPendingModal(true); setHasShownPending(true); }
  }, []);

  // Support both Firestore 'Open' status and old local 'Active' status
  const activePosts = fundingPosts.filter((p: any) =>
    (p.status === 'Open' || p.status === 'Active') &&
    (searchText === '' ||
      (p.title || p.landTitle)?.toLowerCase().includes(searchText.toLowerCase()) ||
      p.city?.toLowerCase().includes(searchText.toLowerCase()))
  );

  const openDetail = (post: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    // Navigate to a real screen — no Modal, scroll works perfectly
    navigation.navigate('InvestorPostDetail', { postId: post.id });
  };

  const renderCard = ({ item }: { item: any }) => {
    const farmer = users.find((u: any) => u.id === item.farmerId);
    const farmerReviews = farmer?.reviews || [];
    const farmerAvg = farmerReviews.length
      ? farmerReviews.reduce((s: number, r: any) => s + r.rating, 0) / farmerReviews.length
      : 0;

    return (
      <View style={styles.postCard}>
        {item.images && item.images.length > 0 ? (
          <SwipeGallery images={item.images} galleryWidth={width - 28} onImagePress={(idx) => openImageViewer(item.images, idx)} />
        ) : (
          <View style={styles.postImagePlaceholder}><Text style={{ fontSize: 48 }}>🌍</Text></View>
        )}

        <View style={styles.postHeader}>
          <View style={styles.postHeaderLeft}>
            <Text style={[styles.postTitle, isUrdu && styles.rtlText]} numberOfLines={2}>{item.title || item.landTitle}</Text>
            <Text style={styles.postCity}>📍 {item.city}</Text>
          </View>
          {item.landSize && (
            <View style={styles.postHeaderRight}>
              <Text style={styles.postSizeLabel}>{isUrdu ? 'زمین کا رقبہ' : 'Land Size'}</Text>
              <Text style={styles.postSizeVal}>{item.landSize}</Text>
            </View>
          )}
        </View>

        {item.description ? (() => {
          const isExpanded = !!expandedPosts[item.id];
          const desc = item.description || '';
          const PREVIEW_CHARS = 120;
          const isLong = desc.length > PREVIEW_CHARS;
          return (
            <View style={{ paddingHorizontal: 14, marginBottom: 10 }}>
              <Text style={[styles.postDesc, isUrdu && styles.rtlText]}>
                {isExpanded || !isLong ? desc : desc.slice(0, PREVIEW_CHARS).trimEnd() + '...'}
              </Text>
              {isLong && (
                <TouchableOpacity onPress={() => toggleExpanded(item.id)} activeOpacity={0.7}>
                  <Text style={styles.seeMoreText}>{isExpanded ? (isUrdu ? 'کم دیکھیں' : 'See less') : (isUrdu ? 'مزید دیکھیں' : 'See more')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })() : null}

        <View style={styles.farmerRow}>
          {farmer?.profilePic ? (
            <Image source={{ uri: farmer.profilePic }} style={styles.farmerAvatar} />
          ) : (
            <View style={styles.farmerAvatarPH}>
              <Text style={styles.farmerAvatarInit}>{farmer?.firstName?.[0]}{farmer?.lastName?.[0]}</Text>
            </View>
          )}
          <View style={styles.farmerInfo}>
            <Text style={styles.farmerName}>{farmer?.firstName} {farmer?.lastName}</Text>
            <Text style={styles.farmerCity}>{farmer?.city || ''}</Text>
          </View>
          <View style={styles.farmerStarsWrap}>
            {[1, 2, 3, 4, 5].map(s => (
              <Text key={s} style={{ fontSize: 12, color: s <= Math.round(farmerAvg) ? '#F9A825' : '#E0E0E0' }}>★</Text>
            ))}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.moreInfoBtn} onPress={() => openDetail(item)} activeOpacity={0.85}>
            <Text style={styles.moreInfoBtnText}>🔍 {t('moreInfo')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <InvestorHeader title={t('investorHome')} navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} />
      <AccountPendingModal visible={showPendingModal} onClose={() => setShowPendingModal(false)} role="Investor" />

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {isPending && (
        <TouchableOpacity style={styles.lockedBanner} onPress={() => setShowPendingModal(true)} activeOpacity={0.85}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={[styles.lockedText, isUrdu && styles.rtlText]}>{t('accountPending')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, isUrdu && styles.rtlInput]}
          placeholder={t('searchLandCity')}
          placeholderTextColor="#9E9E9E"
          value={searchText}
          onChangeText={setSearchText}
          textAlign={isUrdu ? 'right' : 'left'}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.7}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Always-visible refresh button */}
      <View style={styles.refreshBarRow}>
        <TouchableOpacity style={styles.refreshBarBtn} onPress={onRefresh} activeOpacity={0.75}>
          <Text style={styles.refreshBarBtnText}>↻ {isUrdu ? 'تازہ کریں' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {activePosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌍</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>
            {searchText ? t('noResultsFoundLabel') : t('noLandListingsLabel')}
          </Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>
            {searchText ? `${t('noResultsFoundLabel')}: "${searchText}"` : t('farmersWillListSoon')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={activePosts}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderCard}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  toast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80, left: 20, right: 20, zIndex: 999,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    margin: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    borderWidth: 1.5, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  searchIcon: { fontSize: 18 },
  searchInput: { flex: 1, fontSize: 15, color: '#1B1B1B', paddingVertical: 0 },
  searchClear: { fontSize: 16, color: '#9E9E9E', paddingHorizontal: 4 },
  listContent: { paddingHorizontal: 14, paddingBottom: 30 },
  postCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, marginBottom: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 7,
  },
  postImagePlaceholder: {
    width: '100%', height: 210, backgroundColor: '#EDE7F6',
    justifyContent: 'center', alignItems: 'center',
  },
  postHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 14, paddingBottom: 6,
  },
  postHeaderLeft: { flex: 1, paddingRight: 10 },
  postHeaderRight: { alignItems: 'flex-end' },
  postTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  postCity: { fontSize: 13, color: '#757575', fontWeight: '500' },
  postSizeLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },
  postSizeVal: { fontSize: 15, fontWeight: '800', color: '#6A1B9A' },
  postDesc: { fontSize: 13, color: '#555555', lineHeight: 20 },
  seeMoreText: { fontSize: 13, color: '#6A1B9A', fontWeight: '700', marginTop: 4 },
  farmerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9F5FF', paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EDE7F6',
  },
  farmerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#6A1B9A' },
  farmerAvatarPH: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center',
  },
  farmerAvatarInit: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  farmerInfo: { flex: 1 },
  farmerName: { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  farmerCity: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
  farmerStarsWrap: { flexDirection: 'row', gap: 1 },
  actionsContainer: { paddingHorizontal: 14, paddingBottom: 14 },
  moreInfoBtn: {
    backgroundColor: '#6A1B9A', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  moreInfoBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  lockedBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1',
    marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#FFE082',
  },
  lockedIcon: { fontSize: 16, marginRight: 8 },
  lockedText: { fontSize: 13, fontWeight: '600', color: '#F57F17', flex: 1 },
  galleryWrap: { position: 'relative', overflow: 'hidden' },
  galleryPlaceholder: { height: 210, backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center' },
  galleryArrow: {
    position: 'absolute', top: '50%', marginTop: -25,
    width: 44, height: 50, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  galleryArrowLeft: { left: 12 },
  galleryArrowRight: { right: 12 },
  galleryArrowText: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  galleryCounter: {
    position: 'absolute', bottom: 10, right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  galleryCounterText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  refreshBarRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 6 },
  refreshBarBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#CE93D8' },
  refreshBarBtnText: { fontSize: 13, fontWeight: '800', color: '#6A1B9A' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
});

export default InvestorHomeScreen;
