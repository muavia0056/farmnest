import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, Modal, ScrollView, Platform, Dimensions, SafeAreaView,
  BackHandler, Alert, Linking,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
// modal has 16px padding on each side, imagesSection has 16px padding each side
// cnicImagesRow has gap:12, so each image = (SCREEN_WIDTH - 32 - 32 - 12) / 2
const CNIC_IMG_WIDTH = Math.floor((SCREEN_WIDTH - 32 - 32 - 12) / 2);

import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import db from '../../firebase/firestore';
import {
  approveUserInFirebase,
  rejectUserInFirebase,
} from '../../services/firebaseModerationService';


const SCREEN_HEIGHT = Dimensions.get('window').height;

const Toast = ({ message, visible, color = '#2E7D32' }: { message: string; visible: boolean; color?: string }) => {
  if (!visible) return null;
  return (
    <View style={[styles.toast, { backgroundColor: color }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

const AdminPendingUsersScreen = ({ navigation }: any) => {
  const { users, currentUser } = useApp();
  const [searchText, setSearchText] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // ── ImageViewer ───────────────────────────────────────────
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openImageViewer = (imgs: string[], idx = 0) => {
    setViewerImages(imgs); setViewerIndex(idx); setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showModalRef      = useRef(showModal);
  const viewerVisibleRef  = useRef(viewerVisible);
  useEffect(() => { showModalRef.current     = showModal;     }, [showModal]);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
        if (showModalRef.current)     { setShowModal(false);     return true; }
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

  const pendingUsers = users.filter(u =>
    u.accountStatus === 'Pending' &&
    ['Farmer', 'Buyer', 'Investor'].includes(u.role) &&
    (searchText === '' ||
      (u.cnic || '').toLowerCase().includes(searchText.toLowerCase()) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchText.toLowerCase()))
  );

  const getAdminPassword = async (): Promise<string> => {
    try {
      if (!currentUser?.id) return '';
      // Try direct UID lookup first (works for Simple Admins)
      const snap = await db.collection('users').doc(currentUser.id).get();
      if (snap.exists) {
        return (snap.data() as any)?.password || '';
      }
      // Fallback: query by email (needed for Main Admin whose context id is
      // 'main-admin-001' but Firestore doc uses Firebase Auth UID)
      if (currentUser?.email) {
        const q = await db.collection('users')
          .where('email', '==', currentUser.email.trim().toLowerCase())
          .limit(1)
          .get();
        if (!q.empty) {
          return (q.docs[0].data() as any)?.password || '';
        }
      }
      return '';
    } catch {
      return '';
    }
  };

  const handleApprove = async (user: any) => {
    try {
      await approveUserInFirebase(user.id);
      showToast(`✅ ${user.firstName} ${user.lastName}'s account approved!`);
      setSelectedUser(null);
      setShowModal(false);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to approve user.');
      console.log('Approve user error code:', error?.code);
      console.log('Approve user error message:', error?.message);
    }
  };

  const handleRejectPress = () => {
    setShowRejectReason(true);
    setRejectReason('');
  };

  const handleRejectSubmit = async (user: any) => {
  try {
    const reason = rejectReason.trim();
    await rejectUserInFirebase(user.id, reason);
    setRejectReason('');
    setSelectedUser(null);
    setShowModal(false);
    showToast(`❌ ${user.firstName} ${user.lastName}'s account rejected.`, '#E53935');
  } catch (error: any) {
    Alert.alert('Error', 'Failed to reject user.');
    console.log('Reject user error code:', error?.code);
    console.log('Reject user error message:', error?.message);
  }
};

  const roleColor = (role: string) =>
    role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : '#6A1B9A';
  const roleBg = (role: string) =>
    role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : '#EDE7F6';
  const roleIcon = (role: string) =>
    role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : '💼';

  return (
    <View style={styles.container}>
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
      <AdminHeader title="Pending Users" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or CNIC..."
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

      {pendingUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyTitle}>No Pending Users</Text>
          <Text style={styles.emptySubtitle}>All accounts are reviewed.</Text>
        </View>
      ) : (
        <FlatList
          data={pendingUsers}
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
                <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.userCnic}>🪪 {item.cnic || 'N/A'}</Text>
                <Text style={styles.userCity}>📍 {item.city}</Text>
              </View>
              <View style={styles.userRight}>
                <View style={[styles.rolePill, { backgroundColor: roleBg(item.role) }]}>
                  <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>
                    {roleIcon(item.role)} {item.role}
                  </Text>
                </View>
                <View style={styles.pendingPill}>
                  <Text style={styles.pendingPillText}>⏳ Pending</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* User Detail Modal — scrollable with all 3 images */}
      <Modal visible={showModal} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => { setShowModal(false); setShowRejectReason(false); setRejectReason(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => { setShowModal(false); setShowRejectReason(false); setRejectReason(''); }}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>User Details</Text>
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
                <View style={styles.modalAvatarSection}>
                  {selectedUser.profilePic ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedUser.profilePic!])}>
                      <Image source={{ uri: selectedUser.profilePic }} style={styles.modalAvatar} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.modalAvatarPH, { backgroundColor: roleColor(selectedUser.role) }]}>
                      <Text style={styles.modalAvatarInit}>{selectedUser.firstName[0]}{selectedUser.lastName[0]}</Text>
                    </View>
                  )}
                  <Text style={styles.modalName}>{selectedUser.firstName} {selectedUser.lastName}</Text>
                  <View style={[styles.rolePill, { backgroundColor: roleBg(selectedUser.role) }]}>
                    <Text style={[styles.rolePillText, { color: roleColor(selectedUser.role) }]}>
                      {roleIcon(selectedUser.role)} {selectedUser.role}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  {[
                    { icon: '🪪', label: 'CNIC / Account Number', value: selectedUser.cnic },
                    { icon: '📧', label: 'Email', value: selectedUser.email },
                    { icon: '📱', label: 'Phone', value: selectedUser.phone },
                    { icon: '🏙️', label: 'City', value: selectedUser.city },
                    { icon: '📍', label: 'Address', value: selectedUser.address },
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

                {/* CNIC Front & Back Images */}
                <View style={styles.imagesSection}>
                  <Text style={styles.imagesSectionTitle}>🪪 CNIC Images</Text>
                  <View style={styles.cnicImagesRow}>
                    {selectedUser.cnicFront ? (
                      <View style={styles.cnicImageWrap}>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedUser.cnicFront!])}>
                          <Image
                            source={{ uri: selectedUser.cnicFront }}
                            style={[styles.cnicImage, { width: CNIC_IMG_WIDTH }]}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                        <Text style={styles.cnicImageLabel}>Front Side</Text>
                      </View>
                    ) : (
                      <View style={[styles.cnicImageWrap, styles.cnicImagePlaceholder, { width: CNIC_IMG_WIDTH }]}>
                        <Text style={styles.noImageText}>No Front Image</Text>
                      </View>
                    )}
                    {selectedUser.cnicBack ? (
                      <View style={styles.cnicImageWrap}>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedUser.cnicBack!])}>
                          <Image
                            source={{ uri: selectedUser.cnicBack }}
                            style={[styles.cnicImage, { width: CNIC_IMG_WIDTH }]}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                        <Text style={styles.cnicImageLabel}>Back Side</Text>
                      </View>
                    ) : (
                      <View style={[styles.cnicImageWrap, styles.cnicImagePlaceholder, { width: CNIC_IMG_WIDTH }]}>
                        <Text style={styles.noImageText}>No Back Image</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Liveness Verification Video */}
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
                      onPress={() => {
                      const url = selectedUser.livenessVideo;
                      if (!url || !url.startsWith('http')) {
                      Alert.alert(
                      'Video Not Available',
                      'The liveness video URL is not available. The video upload may have failed during registration. Ask the user to re-register.',
                      );
                      return;
                        }
                            Linking.openURL(url).catch(() =>
                              Alert.alert('Error', 'Could not open the video.'),
                            );
                          }}>
                        <Text style={styles.livenessPlayBtnTxt}>▶  Open Video in Browser</Text>
                      </TouchableOpacity>
                      <View style={styles.livenessInfoBox}>
                        <Text style={styles.livenessInfoTxt}>
                          ✅ User recorded a 30-second live verification video.{`\n`}
                          Tap above to watch and verify the actions were performed.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.livenessBox, { alignItems: 'center', paddingVertical: 24 }]}>
                      <Text style={{ fontSize: 32, marginBottom: 8 }}>⚠️</Text>
                      <Text style={styles.noImageText}>No liveness video uploaded</Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionBtns}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(selectedUser)} activeOpacity={0.85}>
                    <Text style={styles.approveBtnText}>✅ Approve Account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={handleRejectPress} activeOpacity={0.85}>
                    <Text style={styles.rejectBtnText}>❌ Reject Account</Text>
                  </TouchableOpacity>
                </View>

                {showRejectReason && (
                  <View style={styles.rejectReasonBox}>
                    <Text style={styles.rejectReasonLabel}>✏️ Reason for Rejection (optional)</Text>
                    <TextInput
                      style={styles.rejectReasonInput}
                      placeholder="Enter reason for rejection..."
                      placeholderTextColor="#BDBDBD"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      multiline
                      numberOfLines={3}
                    />
                    <TouchableOpacity
                      style={styles.rejectSubmitBtn}
                      onPress={() => handleRejectSubmit(selectedUser)}
                      activeOpacity={0.85}>
                      <Text style={styles.rejectSubmitBtnText}>📤 Submit Rejection</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectCancelBtn}
                      onPress={() => setShowRejectReason(false)}
                      activeOpacity={0.8}>
                      <Text style={styles.rejectCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
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
  toast: {
    position: 'absolute', top: 80, left: 20, right: 20, zIndex: 999,
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
  userName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 3 },
  userCnic: { fontSize: 12, color: '#555555', fontWeight: '500', marginBottom: 2 },
  userCity: { fontSize: 12, color: '#9E9E9E', fontWeight: '500' },
  userRight: { alignItems: 'flex-end', gap: 6 },
  rolePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  rolePillText: { fontSize: 11, fontWeight: '700' },
  pendingPill: { backgroundColor: '#FFF8E1', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pendingPillText: { fontSize: 11, fontWeight: '700', color: '#F9A825' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },
  modalContainer: {
    height: SCREEN_HEIGHT,
    backgroundColor: '#F4F6F9',
    flex: 1,
  },
  modalScrollView: {
    flex: 1,
    height: '100%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A2E', paddingTop: Platform.OS === 'ios' ? 50 : 44,
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
  // Images
  imagesSection: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  imagesSectionTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  cnicImagesRow: { flexDirection: 'row', gap: 12 },
  cnicImageWrap: { alignItems: 'center' },
  cnicImage: { height: 120, borderRadius: 12, marginBottom: 6 },
  cnicImageLabel: { fontSize: 12, fontWeight: '600', color: '#555555' },
  cnicImagePlaceholder: {
    height: 120, backgroundColor: '#F5F5F5', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  selfieImage: { height: 200, borderRadius: 14 },
  selfieImagePlaceholder: {
    height: 120, backgroundColor: '#F5F5F5',
    borderRadius: 14, justifyContent: 'center', alignItems: 'center',
  },
  noImageText: { fontSize: 12, color: '#9E9E9E', fontWeight: '500' },
  // Liveness video styles
  livenessBox: {
    backgroundColor: '#F0F7FF', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#BBDEFB', minHeight: 80,
    justifyContent: 'center', alignItems: 'center',
  },
  livenessIconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, width: '100%' },
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
  actionBtns: { gap: 12 },
  approveBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rejectBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  rejectBtnText: { color: '#C62828', fontSize: 16, fontWeight: '800' },
  rejectReasonBox: {
    backgroundColor: '#FFF8E1', borderRadius: 16, padding: 16, marginTop: 12,
    borderWidth: 1.5, borderColor: '#FFD54F',
  },
  rejectReasonLabel: { fontSize: 14, fontWeight: '700', color: '#E65100', marginBottom: 10 },
  rejectReasonInput: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD54F',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1B1B1B',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 12,
  },
  rejectSubmitBtn: {
    backgroundColor: '#E53935', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8,
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  rejectSubmitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  rejectCancelBtn: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#BDBDBD', backgroundColor: '#F5F5F5',
  },
  rejectCancelBtnText: { color: '#555555', fontSize: 14, fontWeight: '700' },
});

export default AdminPendingUsersScreen;
