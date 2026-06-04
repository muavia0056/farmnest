import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, ScrollView, Platform, Dimensions, BackHandler, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import {
  updateComplaintStatusInFirebase,
  markComplaintViewedInFirebase,
} from '../../services/firebaseComplaintService';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const roleColor = (role: string) =>
  role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : role === 'Investor' ? '#6A1B9A' : '#FF6B35';
const roleBg = (role: string) =>
  role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : role === 'Investor' ? '#EDE7F6' : '#FFF3EE';
const roleIcon = (role: string) =>
  role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : role === 'Investor' ? '💼' : '👑';

const AdminComplaintsScreen = ({ navigation }: any) => {
  const { complaints, setComplaints, currentUser, users } = useApp();
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<any>(null);
  const [replyText] = useState('');

  // ── ImageViewer ─────────────────────────────────────────────
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openImageViewer = (imgs: string[], idx = 0) => {
    setViewerImages(imgs); setViewerIndex(idx); setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showModalRef        = useRef(showModal);
  const showProfileModalRef = useRef(showProfileModal);
  const viewerVisibleRef    = useRef(viewerVisible);
  useEffect(() => { showModalRef.current        = showModal;        }, [showModal]);
  useEffect(() => { showProfileModalRef.current = showProfileModal; }, [showProfileModal]);
  useEffect(() => { viewerVisibleRef.current    = viewerVisible;    }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)    { setViewerVisible(false);    return true; }
        if (showProfileModalRef.current) { setShowProfileModal(false); return true; }
        if (showModalRef.current)        { setShowModal(false);        return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const sorted = [...complaints].sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));

  // Count complaints not yet viewed by admin
  const unviewedCount = sorted.filter(c => !c.viewedByAdmin).length;

  const formatTime = (ts: any) => {
    if (!ts) return '';
    // Firestore Timestamp object
    if (ts?.toDate) return ts.toDate().toLocaleString();
    // Millis number
    if (typeof ts === 'number') return new Date(ts).toLocaleString();
    return '';
  };

  const openComplaint = async (complaint: any) => {
    setSelectedComplaint(complaint);
    setShowModal(true);

    if (!complaint.viewedByAdmin) {
      // FIX: Optimistically update local context state immediately so the
      // red badge number drops at once, without waiting for the Firestore
      // real-time listener to fire a new snapshot.
      setComplaints((prev: any[]) =>
        prev.map((c: any) =>
          c.id === complaint.id ? { ...c, viewedByAdmin: true } : c,
        ),
      );
      try {
        await markComplaintViewedInFirebase(complaint.id);
      } catch (error) {
        console.log('Mark complaint viewed error:', error);
        // If the Firebase call fails, roll back the optimistic update
        setComplaints((prev: any[]) =>
          prev.map((c: any) =>
            c.id === complaint.id ? { ...c, viewedByAdmin: false } : c,
          ),
        );
      }
    }
  };

  const openUserProfile = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setSelectedProfileUser(user);
      setShowProfileModal(true);
    }
  };

  const handleUpdateComplaintStatus = async (
    complaintId: string,
    status: 'Open' | 'In Progress' | 'Resolved' | 'Rejected',
    adminReply: string = '',
  ) => {
    try {
      await updateComplaintStatusInFirebase(complaintId, status, adminReply);
      Alert.alert('Success', 'Complaint status updated successfully.');
      setShowModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update complaint status.');
      console.log('Admin complaint status update error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
      <AdminHeader title="Complaints" navigation={navigation} />

      {sorted.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No Complaints</Text>
          <Text style={styles.emptySubtitle}>No complaints have been submitted yet.</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const viewed = !!item.viewedByAdmin;
            return (
              <TouchableOpacity
                style={[styles.complaintCard, !viewed && styles.complaintCardUnread]}
                onPress={() => openComplaint(item)}
                activeOpacity={0.85}>
                {(() => {
                  const complaintUser = users.find(u => u.id === item.userId);
                  return complaintUser?.profilePic ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([complaintUser.profilePic!])}>
                      <Image source={{ uri: complaintUser.profilePic }} style={styles.userAvatar} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.userAvatarPH, { backgroundColor: roleColor(item.userRole) }]}>
                      <Text style={styles.userAvatarInit}>{item.userName?.[0] || '?'}</Text>
                    </View>
                  );
                })()}
                <View style={styles.complaintInfo}>
                  <View style={styles.complaintTopRow}>
                    <Text style={styles.complaintTitle} numberOfLines={1}>{item.problemTitle}</Text>
                    <View style={[styles.rolePill, { backgroundColor: roleBg(item.userRole) }]}>
                      <Text style={[styles.rolePillText, { color: roleColor(item.userRole) }]}>
                        {roleIcon(item.userRole)} {item.userRole}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.complaintUser}>{item.userName}</Text>
                  <Text style={styles.complaintTime}>{formatTime(item.createdAt || item.createdAtMillis)}</Text>
                  {item.status ? (
                    <View style={[styles.statusPill, { backgroundColor: item.status === 'Resolved' ? '#E8F5E9' : item.status === 'Rejected' ? '#FFEBEE' : item.status === 'In Progress' ? '#FFF8E1' : '#E3F2FD' }]}>
                      <Text style={[styles.statusPillText, { color: item.status === 'Resolved' ? '#2E7D32' : item.status === 'Rejected' ? '#C62828' : item.status === 'In Progress' ? '#F57F17' : '#1565C0' }]}>{item.status}</Text>
                    </View>
                  ) : null}
                </View>
                {!viewed && (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadDotText}>NEW</Text>
                  </View>
                )}
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Complaint Detail Modal */}
      <Modal visible={showModal} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.modalBackTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Complaint Details</Text>
              <View style={{ width: 70 }} />
            </View>

          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={true}
            bounces={true}
            overScrollMode="always"
            keyboardShouldPersistTaps="handled">
            {selectedComplaint && (
              <>
                {/* Clickable User Info */}
                <TouchableOpacity
                  style={styles.userInfoCard}
                  onPress={() => openUserProfile(selectedComplaint.userId)}
                  activeOpacity={0.8}>
                  {(() => {
                    const complaintUser = users.find(u => u.id === selectedComplaint.userId);
                    return complaintUser?.profilePic ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([complaintUser.profilePic!])}>
                        <Image source={{ uri: complaintUser.profilePic }} style={styles.modalAvatar} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.modalAvatarPH, { backgroundColor: roleColor(selectedComplaint.userRole) }]}>
                        <Text style={styles.modalAvatarInit}>{selectedComplaint.userName?.[0] || '?'}</Text>
                      </View>
                    );
                  })()}
                  <View style={styles.modalUserInfo}>
                    <Text selectable style={styles.modalUserName}>{selectedComplaint.userName}</Text>
                    <View style={[styles.rolePill, { backgroundColor: roleBg(selectedComplaint.userRole) }]}>
                      <Text style={[styles.rolePillText, { color: roleColor(selectedComplaint.userRole) }]}>
                        {roleIcon(selectedComplaint.userRole)} {selectedComplaint.userRole}
                      </Text>
                    </View>
                    <Text style={styles.modalTime}>{formatTime(selectedComplaint.createdAt || selectedComplaint.createdAtMillis)}</Text>
                    <Text style={styles.viewProfileLink}>Tap to view full profile →</Text>
                  </View>
                </TouchableOpacity>

                {/* Complaint Content */}
                <View style={styles.complaintDetailCard}>
                  <Text style={styles.detailLabel}>Problem Title</Text>
                  <Text selectable style={styles.detailTitle}>{selectedComplaint.problemTitle}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text selectable style={styles.detailBody}>{selectedComplaint.problemDetail}</Text>
                </View>

                {/* Screenshots */}
                {selectedComplaint.screenshots?.length > 0 && (
                  <View style={styles.screenshotsCard}>
                    <Text style={styles.screenshotsTitle}>📷 Screenshots ({selectedComplaint.screenshots.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.screenshotsScroll}>
                      {selectedComplaint.screenshots.map((uri: string, i: number) => (
                        <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => openImageViewer(selectedComplaint.screenshots, i)}>
                          <Image source={{ uri }} style={styles.screenshot} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Status Update Buttons */}
                <View style={styles.actionCard}>
                  <Text style={styles.actionTitle}>Update Complaint Status</Text>
                  {selectedComplaint.adminReply ? (
                    <View style={styles.existingReplyBox}>
                      <Text style={styles.existingReplyLabel}>💬 Previous Reply:</Text>
                      <Text style={styles.adminReplyText}>{selectedComplaint.adminReply}</Text>
                    </View>
                  ) : null}
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#1565C0' }]}
                      onPress={() => handleUpdateComplaintStatus(selectedComplaint.id, 'In Progress', replyText)}
                      activeOpacity={0.85}>
                      <Text style={styles.actionBtnText}>🔄 In Progress</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2E7D32' }]}
                      onPress={() => handleUpdateComplaintStatus(selectedComplaint.id, 'Resolved', replyText)}
                      activeOpacity={0.85}>
                      <Text style={styles.actionBtnText}>✅ Resolve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#C62828' }]}
                      onPress={() => handleUpdateComplaintStatus(selectedComplaint.id, 'Rejected', replyText)}
                      activeOpacity={0.85}>
                      <Text style={styles.actionBtnText}>❌ Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Profile Modal */}
      <Modal visible={showProfileModal} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowProfileModal(false)}>
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
            {selectedProfileUser && (
              <>
                <View style={styles.profileAvatarSection}>
                  {selectedProfileUser.profilePic ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedProfileUser.profilePic!])}>
                      <Image source={{ uri: selectedProfileUser.profilePic }} style={styles.profileAvatar} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.profileAvatarPH, { backgroundColor: roleColor(selectedProfileUser.role) }]}>
                      <Text style={styles.profileAvatarInit}>
                        {(selectedProfileUser.firstName || '?')[0]}{(selectedProfileUser.lastName || '?')[0]}
                      </Text>
                    </View>
                  )}
                  <Text selectable style={styles.profileName}>{selectedProfileUser.firstName} {selectedProfileUser.lastName}</Text>
                  <View style={[styles.rolePill, { backgroundColor: roleBg(selectedProfileUser.role) }]}>
                    <Text style={[styles.rolePillText, { color: roleColor(selectedProfileUser.role) }]}>
                      {roleIcon(selectedProfileUser.role)} {selectedProfileUser.role}
                    </Text>
                  </View>
                  {(selectedProfileUser.penalties || 0) > 0 && (
                    <View style={styles.penaltyBadge}>
                      <Text style={styles.penaltyText}>⚠️ Penalties: {selectedProfileUser.penalties}/3</Text>
                    </View>
                  )}
                </View>

                <View style={styles.infoCard}>
                  {[
                    { icon: '🪪', label: 'CNIC', value: selectedProfileUser.cnic },
                    { icon: '📧', label: 'Email', value: selectedProfileUser.email },
                    { icon: '📱', label: 'Phone', value: selectedProfileUser.phone },
                    { icon: '🏙️', label: 'City', value: selectedProfileUser.city },
                    { icon: '📍', label: 'Address', value: selectedProfileUser.address },
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

                {/* Farmer Reviews */}
                {selectedProfileUser.role === 'Farmer' && (selectedProfileUser.reviews || []).length > 0 && (
                  <View style={styles.imagesSection}>
                    <Text style={styles.imagesSectionTitle}>⭐ Reviews</Text>
                    {(selectedProfileUser.reviews || []).map((rev: any) => (
                      <View key={rev.id} style={styles.reviewCard}>
                        <View style={styles.reviewTop}>
                          <Text style={styles.reviewerName}>{rev.reviewerName}</Text>
                          <Text>{'⭐'.repeat(rev.rating)}</Text>
                        </View>
                        <Text selectable style={styles.reviewTitle}>{rev.title}</Text>
                        <Text selectable style={styles.reviewDetail}>{rev.detail}</Text>
                      </View>
                    ))}
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  listContent: { padding: 14, paddingBottom: 30 },
  complaintCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  complaintCardUnread: { borderLeftWidth: 4, borderLeftColor: '#E53935' },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  userAvatarPH: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  userAvatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  complaintInfo: { flex: 1 },
  complaintTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  complaintTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#1B1B1B' },
  rolePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  rolePillText: { fontSize: 10, fontWeight: '700' },
  complaintUser: { fontSize: 12, color: '#555555', fontWeight: '500', marginBottom: 2 },
  complaintTime: { fontSize: 11, color: '#9E9E9E' },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  unreadDot: {
    backgroundColor: '#E53935', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
  },
  unreadDotText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  chevron: { fontSize: 22, color: '#BDBDBD', fontWeight: '700' },
  // Modal
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
  userInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  modalAvatar: { width: 60, height: 60, borderRadius: 30 },
  modalAvatarPH: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  modalAvatarInit: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  modalUserInfo: { flex: 1, gap: 4 },
  modalUserName: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  modalTime: { fontSize: 11, color: '#9E9E9E', fontWeight: '500', marginTop: 3 },
  viewProfileLink: { fontSize: 12, color: '#1565C0', fontWeight: '700', marginTop: 4 },
  complaintDetailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#9E9E9E', marginBottom: 6 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },
  detailBody: { fontSize: 15, color: '#444444', lineHeight: 24 },
  screenshotsCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  screenshotsTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  screenshotsScroll: { flexDirection: 'row' },
  screenshot: { width: 160, height: 120, borderRadius: 12, marginRight: 12 },
  // Action card
  actionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  actionTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  existingReplyBox: {
    backgroundColor: '#F0F7FF', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#BBDEFB',
  },
  existingReplyLabel: { fontSize: 11, fontWeight: '700', color: '#1565C0', marginBottom: 4 },
  adminReplyText: { fontSize: 13, color: '#555555', fontStyle: 'italic' },
  replyLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8 },
  replyInput: {
    backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1B1B1B',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 14,
  },
  actionButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: { flex: 1, minWidth: 90, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  // Profile modal
  profileAvatarSection: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#FF6B35', marginBottom: 12 },
  profileAvatarPH: {
    width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,107,53,0.3)', marginBottom: 12,
  },
  profileAvatarInit: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
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
  cnicImage: { width: '100%', height: 110, borderRadius: 12, marginBottom: 6 },
  cnicImageLabel: { fontSize: 12, fontWeight: '600', color: '#555555' },
  imgPlaceholder: {
    height: 110, backgroundColor: '#F5F5F5', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  noImgTxt: { fontSize: 11, color: '#9E9E9E' },
  reviewCard: {
    backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewerName: { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  reviewTitle: { fontSize: 14, fontWeight: '700', color: '#333333', marginBottom: 3 },
  reviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20 },
  downloadBtn: {
    backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  downloadBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default AdminComplaintsScreen;
