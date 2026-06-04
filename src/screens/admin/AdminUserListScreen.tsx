import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, Modal, ScrollView, Platform, Alert, Dimensions, BackHandler, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import RNBlobUtil from 'react-native-blob-util';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';

// ─── Minimal pure-JS ZIP builder ─────────────────────────────────────────────
const toBytes = (str: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
  return out;
};
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
const crc32 = (data: number[]): number => {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const buildZip = (files: { name: string; data: number[] }[]): string => {
  const localHeaders: number[][] = [];
  const centralDirs: number[][] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = toBytes(f.name);
    const crc = crc32(f.data);
    const sz = f.data.length;
    const lh = [
      ...toBytes('PK\x03\x04'),
      ...u16le(20), ...u16le(0), ...u16le(0),
      ...u16le(0), ...u16le(0),
      ...u32le(crc), ...u32le(sz), ...u32le(sz),
      ...u16le(nameBytes.length), ...u16le(0),
      ...nameBytes, ...f.data,
    ];
    localHeaders.push(lh);
    const cd = [
      ...toBytes('PK\x01\x02'),
      ...u16le(20), ...u16le(20),
      ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
      ...u32le(crc), ...u32le(sz), ...u32le(sz),
      ...u16le(nameBytes.length), ...u16le(0), ...u16le(0),
      ...u16le(0), ...u16le(0), ...u32le(0),
      ...u32le(offset), ...nameBytes,
    ];
    centralDirs.push(cd);
    offset += lh.length;
  }
  const cdStart = offset;
  const cdBytes = centralDirs.flat();
  const eocd = [
    ...toBytes('PK\x05\x06'), ...u16le(0), ...u16le(0),
    ...u16le(files.length), ...u16le(files.length),
    ...u32le(cdBytes.length), ...u32le(cdStart), ...u16le(0),
  ];
  const allBytes = [...localHeaders.flat(), ...cdBytes, ...eocd];
  let bin = '';
  for (const b of allBytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

// ─── Resolve image URI → base64 bytes ────────────────────────────────────────
const resolveImageBytes = async (uri: string | null | undefined): Promise<number[] | null> => {
  if (!uri) return null;
  try {
    if (uri.startsWith('data:')) {
      const b64 = uri.split(',')[1];
      if (!b64) return null;
      const bin = atob(b64);
      const bytes: number[] = [];
      for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      return bytes;
    }
    let path = uri;
    if (uri.startsWith('file://')) path = uri.replace('file://', '');
    if (path.startsWith('/') || /^[A-Za-z]:\\/.test(path)) {
      const b64 = await RNBlobUtil.fs.readFile(path, 'base64');
      const bin = atob(b64);
      const bytes: number[] = [];
      for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      return bytes;
    }
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      const res = await RNBlobUtil.fetch('GET', uri);
      const b64 = res.base64();
      const bin = atob(b64);
      const bytes: number[] = [];
      for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      return bytes;
    }
    const bin = atob(uri);
    const bytes: number[] = [];
    for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
    return bytes;
  } catch { return null; }
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

const roleColor = (role: string) =>
  role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : role === 'Investor' ? '#6A1B9A' : '#FF6B35';
const roleBg = (role: string) =>
  role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : role === 'Investor' ? '#EDE7F6' : '#FFF3EE';
const roleIcon = (role: string) =>
  role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : role === 'Investor' ? '💼' : '👑';

interface AdminUserListScreenProps {
  navigation: any;
  showAdmins?: boolean;
}

const AdminUserListScreen = ({ navigation, showAdmins = false }: AdminUserListScreenProps) => {
  const { users, currentUser } = useApp();
  const [searchText, setSearchText]         = useState('');
  const [selectedUser, setSelectedUser]     = useState<any>(null);
  const [showModal, setShowModal]           = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [downloading, setDownloading]       = useState(false);
  const [viewerVisible, setViewerVisible]   = useState(false);
  const [viewerImages, setViewerImages]     = useState<string[]>([]);
  const [viewerIndex, setViewerIndex]       = useState(0);

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images); setViewerIndex(index); setViewerVisible(true);
  };

  const showReviewsModalRef = useRef(showReviewsModal);
  const showModalRef        = useRef(showModal);
  const viewerVisibleRef    = useRef(viewerVisible);
  useEffect(() => { showReviewsModalRef.current = showReviewsModal; }, [showReviewsModal]);
  useEffect(() => { showModalRef.current        = showModal;        }, [showModal]);
  useEffect(() => { viewerVisibleRef.current    = viewerVisible;    }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)    { setViewerVisible(false);    return true; }
        if (showReviewsModalRef.current) { setShowReviewsModal(false); return true; }
        if (showModalRef.current)        { setShowModal(false);        return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const isMainAdmin = currentUser?.id === 'main-admin-001';

  const approvedUsers = users.filter(u => {
    if (u.accountStatus !== 'Approved') return false;
    if (u.id === 'main-admin-001') return false;
    if (isMainAdmin) return ['Farmer', 'Buyer', 'Investor', 'Admin'].includes(u.role);
    return ['Farmer', 'Buyer', 'Investor'].includes(u.role);
  }).filter(u =>
    searchText === '' ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchText.toLowerCase()) ||
    (u.cnic || '').includes(searchText) ||
    (u.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  // ── Download ZIP: info txt + CNIC images + liveness video URL ──────────────
  const handleDownload = async (user: any) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      const safeName = fullName.replace(/[^a-zA-Z0-9_ -]/g, '').trim();

      const registeredDate = user.registeredAt
        ? new Date(user.registeredAt).toLocaleString() : 'N/A';

      const infoText =
        `===== FarmNest User Data =====\n` +
        `Full Name      : ${fullName}\n` +
        `Role           : ${user.role}\n` +
        `Email          : ${user.email || 'N/A'}\n` +
        `Phone          : ${user.phone || 'N/A'}\n` +
        `City           : ${user.city || 'N/A'}\n` +
        `Address        : ${user.address || 'N/A'}\n` +
        `CNIC           : ${user.cnic || 'N/A'}\n` +
        `Account Status : ${user.accountStatus}\n` +
        `Penalties      : ${user.penalties || 0}/3\n` +
        `Rating         : ${user.rating || 0} / 5\n` +
        `Registered At  : ${registeredDate}\n` +
        `\n===== Documents (Cloudinary URLs) =====\n` +
        `CNIC Front     : ${user.cnicFront    || 'Not uploaded'}\n` +
        `CNIC Back      : ${user.cnicBack     || 'Not uploaded'}\n` +
        `Liveness Video : ${user.livenessVideo || 'Not uploaded'}\n` +
        `Profile Pic    : ${user.profilePic   || 'Not uploaded'}\n` +
        `==============================`;
      const infoBytes = toBytes(infoText);

      const [frontBytes, backBytes] = await Promise.all([
        resolveImageBytes(user.cnicFront),
        resolveImageBytes(user.cnicBack),
      ]);

      const zipFiles: { name: string; data: number[] }[] = [
        { name: `${safeName}_info.txt`, data: infoBytes },
      ];
      if (frontBytes) zipFiles.push({ name: 'cnic_front.jpg', data: frontBytes });
      if (backBytes)  zipFiles.push({ name: 'cnic_back.jpg',  data: backBytes });

      const zipBase64 = buildZip(zipFiles);
      const dirs      = RNBlobUtil.fs.dirs;
      const zipPath   = `${dirs.CacheDir}/${safeName}.zip`;
      await RNBlobUtil.fs.writeFile(zipPath, zipBase64, 'base64');
      await RNBlobUtil.android.actionViewIntent(zipPath, 'application/zip');
    } catch (err: any) {
      Alert.alert('Download Error', err.message || 'Could not save the ZIP file.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Open video URL in browser ─────────────────────────────────────────────
  const openVideoInBrowser = (url: string | null | undefined) => {
    if (!url || !url.startsWith('http')) {
      Alert.alert(
        'Video Not Available',
        'The liveness video URL is not available. This may mean the video upload failed during registration. The user needs to re-register.',
      );
      return;
    }
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open the video. Try copying the URL manually.'),
    );
  };

  return (
    <View style={styles.container}>
      <AdminHeader title="User List" navigation={navigation} />

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, CNIC or email..."
          placeholderTextColor="#9E9E9E"
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {approvedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>👥</Text>
          <Text style={styles.emptyTitle}>No Approved Users</Text>
          <Text style={styles.emptySubtitle}>Approved users will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={approvedUsers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userCard}
              onPress={() => { setSelectedUser(item); setShowModal(true); }}
              activeOpacity={0.85}>
              {item.profilePic ? (
                <Image source={{ uri: item.profilePic }} style={styles.userAvatar} />
              ) : (
                <View style={[styles.userAvatarPH, { backgroundColor: roleColor(item.role) }]}>
                  <Text style={styles.userAvatarInit}>{item.firstName[0]}{item.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.userInfo}>
                <Text selectable style={styles.userName}>{item.firstName} {item.lastName}</Text>
                <Text selectable style={styles.userSub}>📧 {item.email}</Text>
                <Text selectable style={styles.userSub}>📍 {item.city}</Text>
              </View>
              <View style={[styles.rolePill, { backgroundColor: roleBg(item.role) }]}>
                <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>
                  {roleIcon(item.role)} {item.role}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* ── User Profile Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>User Profile</Text>
              <View style={{ width: 70 }} />
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={true}
              bounces={true}
              overScrollMode="always"
              keyboardShouldPersistTaps="handled">
              {selectedUser && (
                <>
                  {/* Avatar */}
                  <View style={styles.modalAvatarSection}>
                    {selectedUser.profilePic ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedUser.profilePic], 0)}>
                        <Image source={{ uri: selectedUser.profilePic }} style={styles.modalAvatar} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.modalAvatarPH, { backgroundColor: roleColor(selectedUser.role) }]}>
                        <Text style={styles.modalAvatarInit}>
                          {selectedUser.firstName[0]}{selectedUser.lastName[0]}
                        </Text>
                      </View>
                    )}
                    <Text selectable style={styles.modalName}>{selectedUser.firstName} {selectedUser.lastName}</Text>
                    <View style={[styles.rolePill, { backgroundColor: roleBg(selectedUser.role) }]}>
                      <Text style={[styles.rolePillText, { color: roleColor(selectedUser.role) }]}>
                        {roleIcon(selectedUser.role)} {selectedUser.role}
                      </Text>
                    </View>
                    {selectedUser.role === 'Farmer' && (() => {
                      const reviews = selectedUser.reviews || [];
                      const avg = reviews.length > 0
                        ? (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length).toFixed(1)
                        : null;
                      return (
                        <View style={styles.farmerRatingRow}>
                          {avg !== null && <Text style={styles.farmerRatingText}>⭐ {avg} / 5</Text>}
                          {reviews.length > 0 && (
                            <TouchableOpacity onPress={() => setShowReviewsModal(true)} activeOpacity={0.8}>
                              <Text style={styles.viewReviewsLink}>View all reviews</Text>
                            </TouchableOpacity>
                          )}
                          {reviews.length === 0 && <Text style={styles.noReviewsText}>No reviews yet</Text>}
                        </View>
                      );
                    })()}
                    {(selectedUser.penalties || 0) > 0 && (
                      <View style={styles.penaltyBadge}>
                        <Text style={styles.penaltyText}>⚠️ Penalties: {selectedUser.penalties}/3</Text>
                      </View>
                    )}
                  </View>

                  {/* Info card */}
                  <View style={styles.infoCard}>
                    {[
                      { icon: '🪪', label: 'CNIC / Account Number', value: selectedUser.cnic },
                      { icon: '📧', label: 'Email',                  value: selectedUser.email },
                      { icon: '📱', label: 'Phone',                  value: selectedUser.phone },
                      { icon: '🏙️', label: 'City',                   value: selectedUser.city },
                      { icon: '📍', label: 'Address',                value: selectedUser.address },
                      { icon: '🔖', label: 'Account Status',         value: selectedUser.accountStatus },
                    ].map(row => (
                      <View key={row.label} style={styles.infoRow}>
                        <Text style={styles.infoIcon}>{row.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text selectable style={styles.infoLabel}>{row.label}</Text>
                          <Text selectable style={styles.infoValue}>{row.value || '—'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* CNIC Images */}
                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesSectionTitle}>🪪 CNIC Images</Text>
                    <View style={styles.cnicImagesRow}>
                      {selectedUser.cnicFront ? (
                        <TouchableOpacity
                          style={styles.cnicImageWrap}
                          activeOpacity={0.85}
                          onPress={() => {
                            const imgs = [selectedUser.cnicFront, selectedUser.cnicBack].filter(Boolean);
                            openImageViewer(imgs, 0);
                          }}>
                          <Image source={{ uri: selectedUser.cnicFront }} style={styles.cnicImage} resizeMode="cover" />
                          <Text style={styles.cnicImageLabel}>Front Side</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.cnicImageWrap, styles.imgPlaceholder]}>
                          <Text style={styles.noImgText}>No Front Image</Text>
                        </View>
                      )}
                      {selectedUser.cnicBack ? (
                        <TouchableOpacity
                          style={styles.cnicImageWrap}
                          activeOpacity={0.85}
                          onPress={() => {
                            const imgs = [selectedUser.cnicFront, selectedUser.cnicBack].filter(Boolean);
                            openImageViewer(imgs, selectedUser.cnicFront ? 1 : 0);
                          }}>
                          <Image source={{ uri: selectedUser.cnicBack }} style={styles.cnicImage} resizeMode="cover" />
                          <Text style={styles.cnicImageLabel}>Back Side</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.cnicImageWrap, styles.imgPlaceholder]}>
                          <Text style={styles.noImgText}>No Back Image</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* ── Liveness Verification Video (replaces Selfie) ──────── */}
                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesSectionTitle}>🎥 Liveness Verification Video</Text>
                    {selectedUser.livenessVideo ? (
                      <View style={styles.livenessBox}>
                        <View style={styles.livenessIconRow}>
                          <Text style={styles.livenessVideoIcon}>🎬</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.livenessVideoTitle}>Live Video Captured ✅</Text>
                            <Text style={styles.livenessVideoSub} numberOfLines={3}>
                              {selectedUser.livenessVideo}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.livenessPlayBtn}
                          activeOpacity={0.85}
                          onPress={() => openVideoInBrowser(selectedUser.livenessVideo)}>
                          <Text style={styles.livenessPlayBtnTxt}>▶  Open Video in Browser</Text>
                        </TouchableOpacity>
                        <View style={styles.livenessInfoBox}>
                          <Text style={styles.livenessInfoTxt}>
                            ✅ User recorded a 30-second live verification video.{'\n'}
                            Tap above to watch in browser.
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.livenessBox, { alignItems: 'center', paddingVertical: 24 }]}>
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>⚠️</Text>
                        <Text style={styles.noImgText}>No liveness video uploaded</Text>
                      </View>
                    )}
                  </View>

                  {/* Download Button */}
                  <TouchableOpacity
                    style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
                    onPress={() => handleDownload(selectedUser)}
                    activeOpacity={0.85}
                    disabled={downloading}>
                    <Text style={styles.downloadBtnText}>
                      {downloading ? '⏳ Preparing ZIP...' : '📥 Download Data'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Reviews Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={showReviewsModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowReviewsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowReviewsModal(false)}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>All Reviews</Text>
              <View style={{ width: 70 }} />
            </View>
            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={true}>
              {selectedUser && (selectedUser.reviews || []).length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>⭐</Text>
                  <Text style={styles.emptyTitle}>No Reviews Yet</Text>
                  <Text style={styles.emptySubtitle}>This farmer has not received any reviews.</Text>
                </View>
              ) : (
                (selectedUser?.reviews || []).map((rev: any) => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.reviewTop}>
                      <Text style={styles.reviewerName}>{rev.reviewerName}</Text>
                      <Text style={styles.reviewRating}>{'⭐'.repeat(rev.rating)} ({rev.rating}/5)</Text>
                    </View>
                    <Text selectable style={styles.reviewTitle}>{rev.title}</Text>
                    <Text selectable style={styles.reviewDetail}>{rev.detail}</Text>
                  </View>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  userAvatar: { width: 52, height: 52, borderRadius: 26 },
  userAvatarPH: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  userAvatarInit: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 2 },
  userSub: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 1 },
  rolePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  rolePillText: { fontSize: 11, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#F4F6F9' },
  modalContainer: { height: SCREEN_HEIGHT, backgroundColor: '#F4F6F9', flex: 1 },
  modalScrollView: { flex: 1, height: '100%' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A2E',
    paddingTop: Platform.OS === 'ios' ? 50 : 44,
    paddingBottom: 16, paddingHorizontal: 16,
  },
  modalBackBtn: { padding: 4 },
  modalBackTxt: { fontSize: 15, color: '#FF6B35', fontWeight: '700' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  modalScroll: { padding: 16, paddingBottom: 60 },
  modalAvatarSection: { alignItems: 'center', marginBottom: 20 },
  modalAvatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#FF6B35', marginBottom: 12 },
  modalAvatarPH: {
    width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,107,53,0.3)', marginBottom: 12,
  },
  modalAvatarInit: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  modalName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  penaltyBadge: { backgroundColor: '#FFEBEE', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 },
  penaltyText: { fontSize: 13, fontWeight: '700', color: '#C62828' },
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
  imagesSection: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  imagesSectionTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  cnicImagesRow: { flexDirection: 'row', gap: 12 },
  cnicImageWrap: { flex: 1, alignItems: 'center' },
  cnicImage: { width: '100%', height: 120, borderRadius: 12, marginBottom: 6 },
  cnicImageLabel: { fontSize: 12, fontWeight: '600', color: '#555555' },
  imgPlaceholder: {
    height: 120, backgroundColor: '#F5F5F5', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  noImgText: { fontSize: 12, color: '#9E9E9E', fontWeight: '500' },
  // Liveness video
  livenessBox: {
    backgroundColor: '#F0F7FF', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#BBDEFB',
    minHeight: 80, justifyContent: 'center', alignItems: 'center',
  },
  livenessIconRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, marginBottom: 14, width: '100%',
  },
  livenessVideoIcon: { fontSize: 36 },
  livenessVideoTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  livenessVideoSub: { fontSize: 11, color: '#555555', lineHeight: 16 },
  livenessPlayBtn: {
    width: '100%', backgroundColor: '#1565C0', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginBottom: 12,
  },
  livenessPlayBtnTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  livenessInfoBox: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#C8E6C9', width: '100%',
  },
  livenessInfoTxt: { fontSize: 12, color: '#2E7D32', lineHeight: 18, fontWeight: '600' },
  // Farmer rating
  farmerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
  farmerRatingText: { fontSize: 14, fontWeight: '700', color: '#F9A825' },
  viewReviewsLink: { fontSize: 13, fontWeight: '700', color: '#1565C0', textDecorationLine: 'underline' },
  noReviewsText: { fontSize: 13, color: '#9E9E9E', fontWeight: '500' },
  // Reviews
  reviewCard: {
    backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewerName: { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  reviewRating: { fontSize: 13 },
  reviewTitle: { fontSize: 14, fontWeight: '700', color: '#333333', marginBottom: 3 },
  reviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20 },
  // Download
  downloadBtn: {
    backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7, marginBottom: 12,
  },
  downloadBtnDisabled: { backgroundColor: '#78909C', shadowOpacity: 0.1 },
  downloadBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default AdminUserListScreen;
