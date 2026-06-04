import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, ScrollView, Platform, Dimensions, BackHandler, TextInput, Alert, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ImageViewer from '../../components/ImageViewer';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CNIC_IMG_WIDTH = Math.floor((SCREEN_WIDTH - 32 - 32 - 12) / 2);

import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
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

const AdminPendingAdminsScreen = ({ navigation }: any) => {
  const { users } = useApp();
  const [selectedAdmin, setSelectedAdmin] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const showModalRef     = useRef(showModal);
  const viewerVisibleRef = useRef(viewerVisible);
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

  const pendingAdmins = users.filter(u =>
    u.role === 'Admin' &&
    u.id !== 'main-admin-001' &&
    u.accountStatus === 'Pending'
  );

  const handleApprove = async (admin: any) => {
    try {
      await approveUserInFirebase(admin.id);
      showToast(`✅ ${admin.firstName} ${admin.lastName} has been approved as Admin.`);
      setSelectedAdmin(null);
      setShowModal(false);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to approve admin.');
      console.log('Approve admin error code:', error?.code);
      console.log('Approve admin error message:', error?.message);
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
      setSelectedAdmin(null);
      setShowModal(false);
      showToast(`❌ ${user.firstName} ${user.lastName}'s account rejected.`, '#E53935');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to reject user.');
      console.log('Reject admin error code:', error?.code);
      console.log('Reject admin error message:', error?.message);
    }
  };

  const formatTime = (ts: number) =>
    ts ? new Date(ts).toLocaleString() : 'N/A';

  return (
    <View style={styles.container}>
      <AdminHeader title="Pending Admins" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      {pendingAdmins.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔐</Text>
          <Text style={styles.emptyTitle}>No Pending Admins</Text>
          <Text style={styles.emptySubtitle}>No admin registration requests at this time.</Text>
        </View>
      ) : (
        <FlatList
          data={pendingAdmins}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.adminCard}
              onPress={() => { setSelectedAdmin(item); setShowModal(true); }}
              activeOpacity={0.85}>
              {item.profilePic ? (
                <Image source={{ uri: item.profilePic }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPH}>
                  <Text style={styles.avatarInit}>{item.firstName[0]}{item.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.adminInfo}>
                <Text style={styles.adminName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.adminEmail}>📧 {item.email}</Text>
                <Text style={styles.adminCnic}>🪪 {item.cnic || 'N/A'}</Text>
                <Text style={styles.adminTime}>Registered: {formatTime(item.registeredAt)}</Text>
              </View>
              <View style={styles.adminRight}>
                <View style={styles.adminRoleBadge}>
                  <Text style={styles.adminRoleBadgeText}>👑 Admin</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>⏳ Pending</Text>
                </View>
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

      <Modal visible={showModal} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => { setShowModal(false); setShowRejectReason(false); setRejectReason(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => { setShowModal(false); setShowRejectReason(false); setRejectReason(''); }}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Admin Request</Text>
              <View style={{ width: 70 }} />
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={true}
              bounces={true}
              overScrollMode="always"
              keyboardShouldPersistTaps="handled">
              {selectedAdmin && (
                <>
                  <View style={styles.modalAvatarSection}>
                    {selectedAdmin.profilePic ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedAdmin.profilePic], 0)}>
                        <Image source={{ uri: selectedAdmin.profilePic }} style={styles.modalAvatar} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.modalAvatarPH}>
                        <Text style={styles.modalAvatarInit}>{selectedAdmin.firstName[0]}{selectedAdmin.lastName[0]}</Text>
                      </View>
                    )}
                    <Text style={styles.modalName}>{selectedAdmin.firstName} {selectedAdmin.lastName}</Text>
                    <View style={styles.adminRoleBadge}>
                      <Text style={styles.adminRoleBadgeText}>👑 Simple Admin</Text>
                    </View>
                  </View>

                  <View style={styles.infoCard}>
                    {[
                      { icon: '🪪', label: 'CNIC / Account Number', value: selectedAdmin.cnic },
                      { icon: '📧', label: 'Email', value: selectedAdmin.email },
                      { icon: '📱', label: 'Phone', value: selectedAdmin.phone },
                      { icon: '🏙️', label: 'City', value: selectedAdmin.city },
                      { icon: '📍', label: 'Address', value: selectedAdmin.address },
                      { icon: '📅', label: 'Registered At', value: formatTime(selectedAdmin.registeredAt) },
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

                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesSectionTitle}>🪪 CNIC Images</Text>
                    <View style={styles.cnicImagesRow}>
                      {selectedAdmin.cnicFront ? (
                        <TouchableOpacity
                          style={styles.cnicImageWrap}
                          activeOpacity={0.85}
                          onPress={() => {
                            const imgs = [selectedAdmin.cnicFront, selectedAdmin.cnicBack].filter(Boolean);
                            openImageViewer(imgs, 0);
                          }}>
                          <Image source={{ uri: selectedAdmin.cnicFront }} style={[styles.cnicImage, { width: CNIC_IMG_WIDTH }]} resizeMode="cover" />
                          <Text style={styles.cnicImageLabel}>Front Side</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.cnicImageWrap, styles.cnicImagePlaceholder, { width: CNIC_IMG_WIDTH }]}>
                          <Text style={styles.noImageText}>No Front Image</Text>
                        </View>
                      )}
                      {selectedAdmin.cnicBack ? (
                        <TouchableOpacity
                          style={styles.cnicImageWrap}
                          activeOpacity={0.85}
                          onPress={() => {
                            const imgs = [selectedAdmin.cnicFront, selectedAdmin.cnicBack].filter(Boolean);
                            openImageViewer(imgs, selectedAdmin.cnicFront ? 1 : 0);
                          }}>
                          <Image source={{ uri: selectedAdmin.cnicBack }} style={[styles.cnicImage, { width: CNIC_IMG_WIDTH }]} resizeMode="cover" />
                          <Text style={styles.cnicImageLabel}>Back Side</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.cnicImageWrap, styles.cnicImagePlaceholder, { width: CNIC_IMG_WIDTH }]}>
                          <Text style={styles.noImageText}>No Back Image</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesSectionTitle}>🎥 Liveness Verification Video</Text>
                    {selectedAdmin.livenessVideo ? (
                      <View style={styles.livenessBox}>
                        <View style={styles.livenessIconRow}>
                          <Text style={styles.livenessVideoIcon}>🎬</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.livenessVideoTitle}>Live Video Captured ✅</Text>
                            <Text style={styles.livenessVideoSub} numberOfLines={3}>
                              {selectedAdmin.livenessVideo}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                        style={styles.livenessPlayBtn}
                        activeOpacity={0.85}
                        onPress={() => {
                        const url = selectedAdmin.livenessVideo;
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
                            ✅ Admin recorded a 30-second live verification video.{`\n`}
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
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(selectedAdmin)} activeOpacity={0.85}>
                      <Text style={styles.approveBtnText}>✅ Approve Admin</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={handleRejectPress} activeOpacity={0.85}>
                      <Text style={styles.rejectBtnText}>❌ Reject Admin</Text>
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
                      <TouchableOpacity style={styles.rejectSubmitBtn} onPress={() => handleRejectSubmit(selectedAdmin)} activeOpacity={0.85}>
                        <Text style={styles.rejectSubmitBtnText}>📤 Submit Rejection</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectCancelBtn} onPress={() => setShowRejectReason(false)} activeOpacity={0.8}>
                        <Text style={styles.rejectCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
              <View style={{ height: 60 }} />
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
  listContent: { padding: 14, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  adminCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPH: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FF6B35', justifyContent: 'center', alignItems: 'center' },
  avatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  adminInfo: { flex: 1 },
  adminName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 3 },
  adminEmail: { fontSize: 12, color: '#555555', fontWeight: '500', marginBottom: 2 },
  adminCnic: { fontSize: 12, color: '#555555', fontWeight: '500', marginBottom: 2 },
  adminTime: { fontSize: 11, color: '#9E9E9E' },
  adminRight: { alignItems: 'flex-end', gap: 6 },
  adminRoleBadge: { backgroundColor: '#FFF3EE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  adminRoleBadgeText: { fontSize: 11, fontWeight: '700', color: '#FF6B35' },
  pendingBadge: { backgroundColor: '#FFF8E1', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#F9A825' },
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
  modalAvatarSection: { alignItems: 'center', marginBottom: 20 },
  modalAvatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#FF6B35', marginBottom: 12 },
  modalAvatarPH: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#FF6B35',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,107,53,0.4)', marginBottom: 12,
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
  actionBtns: { gap: 12 },
  approveBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rejectBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A',
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
});

export default AdminPendingAdminsScreen;
