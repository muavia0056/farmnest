import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, Modal, Animated, Platform, BackHandler, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import {suspendUserInFirebase, deleteUserFromFirebase} from '../../services/firebaseModerationService';

const Toast = ({ message, visible }: { message: string; visible: boolean }) => {
  if (!visible) return null;
  return (
    <View style={styles.toast}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

const AdminRemoveUserScreen = ({ navigation }: any) => {
  const { users, currentUser } = useApp();
  const [searchText, setSearchText] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showConfirmRef   = useRef(showConfirm);
  const viewerVisibleRef = useRef(viewerVisible);
  useEffect(() => { showConfirmRef.current   = showConfirm;   }, [showConfirm]);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
        if (showConfirmRef.current)   { setShowConfirm(false);   return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const openConfirm = (user: any) => {
    setSelectedUser(user);
    setRemoveReason('');
    setShowConfirm(true);
    Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
  };

  const handleRemove = async () => {
    setShowConfirm(false);
    try {
      const reason = removeReason.trim();
      // First suspend the user (sends notification), then delete the Firestore doc
      await suspendUserInFirebase(selectedUser.id, reason);
      try {
        await deleteUserFromFirebase(selectedUser.id);
      } catch (delErr: any) {
        // If delete fails due to rules, the user is at least suspended
        console.warn('[AdminRemoveUser] delete error (user still suspended):', delErr?.code, delErr?.message);
      }
      showToast('✅ User has been removed successfully.');
    } catch (error: any) {
      showToast('❌ Failed to remove user. Please try again.');
      console.warn('[AdminRemoveUser] error:', error?.code, error?.message);
    }
  };

  const isMainAdmin = currentUser?.id === 'main-admin-001';

  // Main Admin: can remove Farmer/Buyer/Investor AND Simple Admins
  // Simple Admin: can only remove Farmer/Buyer/Investor
  const eligible = users.filter(u => {
    if (u.accountStatus !== 'Approved') return false;
    if (u.id === currentUser?.id) return false;
    if (u.id === 'main-admin-001') return false; // can never remove main admin

    const allowedRoles = isMainAdmin
      ? ['Farmer', 'Buyer', 'Investor', 'Admin']
      : ['Farmer', 'Buyer', 'Investor'];

    if (!allowedRoles.includes(u.role)) return false;

    if (searchText === '') return true;
    return (
      (u.cnic || '').includes(searchText) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchText.toLowerCase())
    );
  });

  const roleColor = (role: string) =>
    role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : role === 'Investor' ? '#6A1B9A' : '#FF6B35';
  const roleBg = (role: string) =>
    role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : role === 'Investor' ? '#EDE7F6' : '#FFF3EE';
  const roleIcon = (role: string) =>
    role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : role === 'Investor' ? '💼' : '👑';

  return (
    <View style={styles.container}>
      <AdminHeader title="Remove User" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} />

      {isMainAdmin && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            👑 As Main Admin, you can also remove Simple Admins.
          </Text>
        </View>
      )}

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or Account Number..."
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

      {eligible.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>👥</Text>
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySubtitle}>
            {searchText ? 'No match for that search.' : 'No approved users to show.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={eligible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              {item.profilePic ? (
                <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([item.profilePic], 0)}>
                  <Image source={{ uri: item.profilePic }} style={styles.avatar} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.avatarPH, { backgroundColor: roleColor(item.role) }]}>
                  <Text style={styles.avatarInit}>{item.firstName[0]}{item.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.userCnic}>🪪 {item.cnic || 'N/A'}</Text>
                <View style={[styles.rolePill, { backgroundColor: roleBg(item.role) }]}>
                  <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>
                    {roleIcon(item.role)} {item.role}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.removeBtn} onPress={() => openConfirm(item)} activeOpacity={0.85}>
                <Text style={styles.removeBtnText}>🗑️ Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Full-screen Image Viewer */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Confirm Remove Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.overlay}>
          <Animated.View style={[styles.confirmCard, { transform: [{ scale: scaleAnim }] }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.confirmEmoji}>⚠️</Text>
              <Text style={styles.confirmTitle}>Remove User?</Text>
              <Text style={styles.confirmMsg}>
                Are you sure you want to remove{'\n'}
                <Text style={{ fontWeight: '800' }}>
                  {selectedUser?.firstName} {selectedUser?.lastName}
                </Text>?{'\n\n'}
                Their account will be suspended immediately.
              </Text>
              <Text style={styles.reasonLabel}>✏️ Reason for Removal (optional)</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="Enter reason for removal..."
                placeholderTextColor="#BDBDBD"
                value={removeReason}
                onChangeText={setRemoveReason}
                multiline
                numberOfLines={3}
              />
              <View style={styles.confirmBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirm(false)} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Keep</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmRemoveBtn} onPress={handleRemove} activeOpacity={0.85}>
                  <Text style={styles.confirmRemoveBtnText}>Yes, Remove</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  infoBox: {
    backgroundColor: '#FFF8E1', margin: 14, marginBottom: 0,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FFD54F',
  },
  infoText: { fontSize: 13, color: '#E65100', fontWeight: '600' },
  toast: {
    position: 'absolute', top: 80, left: 20, right: 20, zIndex: 999,
    backgroundColor: '#2E7D32', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    margin: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    borderWidth: 1.5, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPH: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  userCnic: { fontSize: 12, color: '#555555', fontWeight: '500' },
  rolePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 11, fontWeight: '700' },
  removeBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 12, paddingVertical: 10,
    paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  removeBtnText: { fontSize: 13, fontWeight: '800', color: '#C62828' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 30,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%', maxHeight: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 15,
  },
  confirmEmoji: { fontSize: 52, marginBottom: 14 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  confirmMsg: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  reasonLabel: { fontSize: 13, fontWeight: '700', color: '#E65100', marginBottom: 8, textAlign: 'left' },
  reasonInput: {
    backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD54F',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1B1B1B',
    minHeight: 72, textAlignVertical: 'top', marginBottom: 20, width: '100%',
  },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#555555' },
  confirmRemoveBtn: {
    flex: 1, backgroundColor: '#E53935', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  confirmRemoveBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});

export default AdminRemoveUserScreen;
