import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  TouchableOpacity, Image, Platform, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';

const { width } = Dimensions.get('window');

const StatCard = ({
  icon, title, value, subtitle, color, bgColor,
}: {
  icon: string; title: string; value: number | string;
  subtitle?: string; color: string; bgColor: string;
}) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <View style={[styles.statIconWrap, { backgroundColor: bgColor }]}>
      <Text style={styles.statIcon}>{icon}</Text>
    </View>
    <View style={styles.statInfo}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle ? <Text style={styles.statSubtitle}>{subtitle}</Text> : null}
    </View>
  </View>
);

// ── Gallery identical to BuyerHomeScreen ─────────────────────────────────────
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
    <View>
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
          <TouchableOpacity
            key={i}
            activeOpacity={0.92}
            onPress={() => onImagePress?.(i)}>
            <Image
              source={{ uri }}
              style={{ width: galleryWidth, height: 210 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.galleryIndicatorRow}>
          <Text style={styles.galleryIndicatorText}>
            {activeIdx + 1}/{images.length}
          </Text>
        </View>
      )}
    </View>
  );
};

const AdminStatsScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { users, cropPosts, fundingPosts } = useApp();

  const [selectedWinnerPost, setSelectedWinnerPost] = useState<any>(null);
  const [selectedWinnerBid, setSelectedWinnerBid] = useState<any>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [modalView, setModalView] = useState<'crop' | 'buyer'>('crop');

  // ── ImageViewer state ─────────────────────────────────────────────────────
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showWinnerModalRef = useRef(showWinnerModal);
  const viewerVisibleRef   = useRef(viewerVisible);
  useEffect(() => { showWinnerModalRef.current = showWinnerModal; }, [showWinnerModal]);
  useEffect(() => { viewerVisibleRef.current   = viewerVisible;   }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)   { setViewerVisible(false);   return true; }
        if (showWinnerModalRef.current) { setShowWinnerModal(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // User stats
  const allUsers = users.filter(u => u.role !== 'Admin' && u.id !== 'main-admin-001');
  const pendingUsers = allUsers.filter(u => u.accountStatus === 'Pending').length;
  const approvedUsers = allUsers.filter(u => u.accountStatus === 'Approved').length;
  const rejectedUsers = allUsers.filter(u => u.accountStatus === 'Rejected').length;

  const farmers = allUsers.filter(u => u.role === 'Farmer').length;
  const buyers = allUsers.filter(u => u.role === 'Buyer').length;
  const investors = allUsers.filter(u => u.role === 'Investor').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const registeredToday = allUsers.filter(u => {
    const t = new Date(u.registeredAt || 0);
    t.setHours(0, 0, 0, 0);
    return t.getTime() === today.getTime();
  }).length;

  const activeCropPosts = cropPosts.filter(p => p.status === 'Active').length;
  const soldOutCropPosts = cropPosts.filter(p => p.status === 'SoldOut').length;
  const activeLandPosts = fundingPosts.filter(p => p.status === 'Active').length;

  const bidWinners = cropPosts.filter(p => {
    const expired = Date.now() > (p.bidEndTimestamp || 0);
    const active = (p.bids || []).filter((b: any) => !b.cancelled);
    return expired && active.length > 0;
  }).length;

  const confirmedPayments = cropPosts.reduce((total, p) => {
    const confirmed = (p.bids || []).filter((b: any) => b.paymentConfirmed).length;
    return total + confirmed;
  }, 0);

  const sectionData = [
    {
      title: '👥 Users Overview',
      cards: [
        { icon: '👥', title: 'Total Users', value: allUsers.length, color: '#1565C0', bgColor: '#E3F2FD' },
        { icon: '📅', title: 'Registered Today', value: registeredToday, color: '#2E7D32', bgColor: '#E8F5E9' },
        { icon: '⏳', title: 'Pending Approval', value: pendingUsers, color: '#F9A825', bgColor: '#FFF8E1' },
        { icon: '✅', title: 'Approved', value: approvedUsers, color: '#2E7D32', bgColor: '#E8F5E9' },
        { icon: '❌', title: 'Rejected', value: rejectedUsers, color: '#E53935', bgColor: '#FFEBEE' },
      ],
    },
    {
      title: '🧑‍🤝‍🧑 By Role',
      cards: [
        { icon: '🌾', title: 'Farmers', value: farmers, color: '#2E7D32', bgColor: '#E8F5E9' },
        { icon: '🛒', title: 'Buyers', value: buyers, color: '#1565C0', bgColor: '#E3F2FD' },
        { icon: '💼', title: 'Investors', value: investors, color: '#6A1B9A', bgColor: '#EDE7F6' },
      ],
    },
    {
      title: '📋 Posts & Sales',
      cards: [
        { icon: '🌾', title: 'Active Crop Posts', value: activeCropPosts, color: '#2E7D32', bgColor: '#E8F5E9' },
        { icon: '💤', title: 'Sold Out Crops', value: soldOutCropPosts, color: '#757575', bgColor: '#F5F5F5' },
        { icon: '🌍', title: 'Active Land Posts', value: activeLandPosts, color: '#6A1B9A', bgColor: '#EDE7F6' },
        { icon: '🏆', title: 'Bid Winners', value: bidWinners, color: '#F9A825', bgColor: '#FFF8E1' },
        { icon: '💳', title: 'Confirmed Payments', value: confirmedPayments, color: '#FF6B35', bgColor: '#FFF3EE' },
      ],
    },
  ];

  const winnerPosts = cropPosts.filter(p => {
    const expired = Date.now() > (p.bidEndTimestamp || 0);
    const active = (p.bids || []).filter((b: any) => !b.cancelled);
    return expired && active.length > 0;
  });

  const openCropDetails = (post: any, winner: any) => {
    setSelectedWinnerPost(post);
    setSelectedWinnerBid(winner);
    setModalView('crop');
    setShowWinnerModal(true);
  };

  const winnerUser = selectedWinnerBid
    ? users.find((u: any) => u.id === selectedWinnerBid.bidderId)
    : null;

  const farmerUser = selectedWinnerPost
    ? users.find((u: any) => u.id === selectedWinnerPost.farmerId)
    : null;

  return (
    <View style={styles.container}>
      {/* ── Full-screen ImageViewer ── */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* ── Full-screen detail panel ── */}
      {showWinnerModal && (
        <View style={[styles.detailPanel, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowWinnerModal(false)}>
              <Text style={styles.modalBackTxt}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>
              {modalView === 'crop' ? 'Crop Details' : 'Buyer Profile'}
            </Text>
            <View style={{ width: 70 }} />
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, modalView === 'crop' && styles.tabActive]}
              onPress={() => setModalView('crop')}>
              <Text style={[styles.tabText, modalView === 'crop' && styles.tabTextActive]}>🌾 Crop Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, modalView === 'buyer' && styles.tabActive]}
              onPress={() => setModalView('buyer')}>
              <Text style={[styles.tabText, modalView === 'buyer' && styles.tabTextActive]}>🛒 Buyer Profile</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {selectedWinnerPost && selectedWinnerBid && (
              <>
                {modalView === 'crop' && (
                  <>
                    {/* ── Farmer Profile (shown first) ── */}
                    <View style={styles.infoCard}>
                      <Text style={styles.cnicSectionTitle}>🌾 Farmer Profile</Text>
                      {farmerUser?.profilePic && (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => openImageViewer([farmerUser.profilePic!], 0)}
                          style={styles.profileImageWrap}>
                          <Image source={{ uri: farmerUser.profilePic }} style={styles.profileImageThumb} />
                          <Text style={styles.profileImageHint}>Tap to enlarge</Text>
                        </TouchableOpacity>
                      )}
                      {[
                        { icon: '👤', label: 'Name', value: farmerUser ? `${farmerUser.firstName} ${farmerUser.lastName}` : selectedWinnerPost.farmerName },
                        { icon: '📱', label: 'Phone', value: farmerUser?.phone },
                        { icon: '🏙️', label: 'City', value: farmerUser?.city },
                        { icon: '🪪', label: 'Account Number (CNIC)', value: (farmerUser as any)?.cnic || '—' },
                      ].map(row => (
                        <View key={row.label} style={styles.infoRow}>
                          <Text style={styles.infoIcon}>{row.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoLabel}>{row.label}</Text>
                            <Text style={styles.infoValue}>{row.value || '—'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* ── Gallery ── */}
                    {(selectedWinnerPost.images || []).length > 0 && (
                      <View style={styles.galleryWrap}>
                        <ImageGallery
                          images={selectedWinnerPost.images}
                          onImagePress={idx =>
                            openImageViewer(selectedWinnerPost.images, idx)
                          }
                        />
                      </View>
                    )}

                    {/* ── Crop Details ── */}
                    <View style={styles.infoCard}>
                      <Text style={styles.cropDetailTitle}>{selectedWinnerPost.cropTitle}</Text>
                      {selectedWinnerPost.description ? (
                        <Text style={styles.cropDescription}>{selectedWinnerPost.description}</Text>
                      ) : null}
                      {[
                        { icon: '🏙️', label: 'City', value: selectedWinnerPost.city },
                        { icon: '📍', label: 'Address', value: selectedWinnerPost.address },
                        { icon: '💰', label: 'Base Price', value: `PKR ${selectedWinnerPost.basePrice}` },
                      ].map(row => (
                        <View key={row.label} style={styles.infoRow}>
                          <Text style={styles.infoIcon}>{row.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoLabel}>{row.label}</Text>
                            <Text style={styles.infoValue}>{row.value || '—'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View style={[styles.infoCard, { borderLeftWidth: 4, borderLeftColor: '#F9A825' }]}>
                      <Text style={styles.cnicSectionTitle}>🏆 Winning Bid</Text>
                      {[
                        { icon: '🛒', label: 'Winner', value: selectedWinnerBid.bidderName },
                        { icon: '💵', label: 'Bid Amount', value: `PKR ${selectedWinnerBid.amount}` },
                      ].map(row => (
                        <View key={row.label} style={styles.infoRow}>
                          <Text style={styles.infoIcon}>{row.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoLabel}>{row.label}</Text>
                            <Text style={styles.infoValue}>{row.value || '—'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {modalView === 'buyer' && (
                  <>
                    <View style={styles.infoCard}>
                      <Text style={styles.cnicSectionTitle}>🛒 Buyer Details</Text>
                      {winnerUser?.profilePic && (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => openImageViewer([winnerUser.profilePic!], 0)}
                          style={styles.profileImageWrap}>
                          <Image source={{ uri: winnerUser.profilePic }} style={styles.profileImageThumb} />
                          <Text style={styles.profileImageHint}>Tap to enlarge</Text>
                        </TouchableOpacity>
                      )}
                      {[
                        { icon: '👤', label: 'Name', value: winnerUser ? `${winnerUser.firstName} ${winnerUser.lastName}` : selectedWinnerBid.bidderName },
                        { icon: '📧', label: 'Email', value: winnerUser?.email },
                        { icon: '📱', label: 'Phone', value: winnerUser?.phone },
                        { icon: '🏙️', label: 'City', value: winnerUser?.city },
                        { icon: '📍', label: 'Address', value: winnerUser?.address },
                        { icon: '🪪', label: 'Account Number (CNIC)', value: (winnerUser as any)?.cnic || '—' },
                        { icon: '⚠️', label: 'Penalties', value: winnerUser?.penalties !== undefined ? String(winnerUser.penalties) : '0' },
                        { icon: '✅', label: 'Account Status', value: winnerUser?.accountStatus },
                      ].map(row => (
                        <View key={row.label} style={styles.infoRow}>
                          <Text style={styles.infoIcon}>{row.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoLabel}>{row.label}</Text>
                            <Text style={styles.infoValue}>{row.value || '—'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.infoCard, { borderLeftWidth: 4, borderLeftColor: '#F9A825' }]}>
                      <Text style={styles.cnicSectionTitle}>🏆 Bid Info</Text>
                      {[
                        { icon: '💵', label: 'Bid Amount', value: `PKR ${selectedWinnerBid.amount}` },
                        { icon: '🌾', label: 'Crop', value: selectedWinnerPost.cropTitle },
                      ].map(row => (
                        <View key={row.label} style={styles.infoRow}>
                          <Text style={styles.infoIcon}>{row.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoLabel}>{row.label}</Text>
                            <Text style={styles.infoValue}>{row.value || '—'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      <AdminHeader title="Dashboard Stats" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.banner}>
          <Text style={styles.bannerEmoji}>📊</Text>
          <View>
            <Text style={styles.bannerTitle}>Admin Dashboard</Text>
            <Text style={styles.bannerSub}>Real-time platform overview</Text>
          </View>
        </View>

        {sectionData.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.cardsGrid}>
              {section.cards.map(card => (
                <StatCard key={card.title} {...card} />
              ))}
            </View>
          </View>
        ))}

        {/* Recent Bid Winners */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Recent Bid Winners</Text>
          {winnerPosts.slice(0, 5).map(post => {
            const active = (post.bids || []).filter((b: any) => !b.cancelled);
            const winner = active.reduce((max: any, b: any) => b.amount > max.amount ? b : max, active[0]);
            return (
              <TouchableOpacity
                key={post.id}
                style={styles.winnerRow}
                onPress={() => openCropDetails(post, winner)}
                activeOpacity={0.8}>
                {post.images?.[0] ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openImageViewer(post.images, 0)}>
                    <Image source={{ uri: post.images[0] }} style={styles.winnerThumb} resizeMode="cover" />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.winnerEmoji}>🏆</Text>
                )}
                <View style={styles.winnerInfo}>
                  <Text style={styles.winnerCrop}>{post.cropTitle}</Text>
                  <Text style={styles.winnerName}>{winner.bidderName}</Text>
                </View>
                <View style={styles.winnerArrowWrap}>
                  <Text style={styles.winnerArrow}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {winnerPosts.length === 0 && (
            <Text style={styles.noDataText}>No completed auctions yet.</Text>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1A1A2E', borderRadius: 18, padding: 18, marginBottom: 20,
    shadowColor: '#1A1A2E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  bannerEmoji: { fontSize: 38 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  cardsGrid: { gap: 10 },
  statCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderLeftWidth: 5, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  statIconWrap: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  statIcon: { fontSize: 24 },
  statInfo: { flex: 1 },
  statTitle: { fontSize: 13, color: '#757575', fontWeight: '600', marginBottom: 3 },
  statValue: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  statSubtitle: { fontSize: 12, color: '#9E9E9E', fontWeight: '500', marginTop: 2 },
  winnerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  winnerThumb: { width: 48, height: 48, borderRadius: 10 },
  winnerEmoji: { fontSize: 22 },
  winnerInfo: { flex: 1 },
  winnerCrop: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 2 },
  winnerName: { fontSize: 12, color: '#757575', fontWeight: '500' },
  winnerArrowWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  winnerArrow: { fontSize: 20, color: '#1565C0', fontWeight: '800', marginTop: -1 },
  tabRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#1565C0' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9E9E9E' },
  tabTextActive: { color: '#1565C0', fontWeight: '800' },
  noDataText: { fontSize: 13, color: '#9E9E9E', textAlign: 'center', paddingVertical: 16 },
  detailPanel: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#F4F6F9', zIndex: 999, flex: 1,
  },
  detailScroll: { flex: 1 },
  detailScrollContent: { padding: 16, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A2E', paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16,
  },
  modalBackBtn: { padding: 4 },
  modalBackTxt: { fontSize: 15, color: '#FF6B35', fontWeight: '700' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
  cnicSectionTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  cropDetailTitle: { fontSize: 20, fontWeight: '900', color: '#1B1B1B', marginBottom: 6 },
  cropDescription: { fontSize: 14, color: '#555555', lineHeight: 22, marginBottom: 12 },
  galleryWrap: { marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  galleryPlaceholder: {
    height: 210, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
    borderRadius: 16, marginBottom: 16,
  },
  galleryIndicatorRow: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  galleryIndicatorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  profileImageWrap: { alignItems: 'center', marginBottom: 14 },
  profileImageThumb: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#FF6B35' },
  profileImageHint: { fontSize: 11, color: '#9E9E9E', marginTop: 4 },
});

export default AdminStatsScreen;
