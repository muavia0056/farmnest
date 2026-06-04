import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, Modal, Animated, Platform, BackHandler, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import { reactivateUserInFirebase } from '../../services/firebaseModerationService';

const Toast = ({ message, visible, color = '#2E7D32' }: { message: string; visible: boolean; color?: string }) => {
  if (!visible) return null;
  return (
    <View style={[styles.toast, { backgroundColor: color }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

const AdminReactivateScreen = ({ navigation }: any) => {
  const { users, currentUser } = useApp();
  const [searchText, setSearchText] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');
  const [loading, setLoading] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  };

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

  const showToast = (msg: string, color = '#2E7D32') => {
    setToastMsg(msg); setToastColor(color); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  // Show Rejected or Suspended users (all 4 types) except main admin
  const inactiveUsers = users.filter(u => {
    if (u.id === 'main-admin-001') return false;
    if (!['Rejected', 'Suspended'].includes(u.accountStatus)) return false;
    if (searchText === '') return true;
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchText.toLowerCase()) ||
      (u.cnic || '').includes(searchText) ||
      (u.email || '').toLowerCase().includes(searchText.toLowerCase())
    );
  });

  const handleReactivate = async (user: any) => {
    setLoading(user.id);
    try {
      await reactivateUserInFirebase(user.id);
      showToast(`✅ ${user.firstName} ${user.lastName}'s account reactivated!`);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to reactivate user. Please try again.');
      console.warn('[AdminReactivate] error:', error?.code || error?.message);
    } finally {
      setLoading(null);
    }
  };

  const roleColor = (role: string) =>
    role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : role === 'Investor' ? '#6A1B9A' : '#FF6B35';
  const roleBg = (role: string) =>
    role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : role === 'Investor' ? '#EDE7F6' : '#FFF3EE';
  const roleIcon = (role: string) =>
    role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : role === 'Investor' ? '💼' : '👑';

  const statusColor = (status: string) => status === 'Rejected' ? '#E53935' : '#F9A825';
  const statusBg = (status: string) => status === 'Rejected' ? '#FFEBEE' : '#FFF8E1';

  return (
    <View style={styles.container}>
      <AdminHeader title="Reactivate Account" navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          🔄 Reactivate rejected or suspended accounts for all 4 account types.
          Penalties will be reset upon reactivation.
        </Text>
      </View>

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

      {inactiveUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyTitle}>No Inactive Accounts</Text>
          <Text style={styles.emptySubtitle}>No rejected or suspended accounts found.</Text>
        </View>
      ) : (
        <FlatList
          data={inactiveUsers}
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
                <Text style={styles.userEmail}>📧 {item.email}</Text>
                <View style={styles.badgesRow}>
                  <View style={[styles.rolePill, { backgroundColor: roleBg(item.role) }]}>
                    <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>
                      {roleIcon(item.role)} {item.role}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusBg(item.accountStatus) }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(item.accountStatus) }]}>
                      {item.accountStatus === 'Rejected' ? '❌' : '🚫'} {item.accountStatus}
                    </Text>
                  </View>
                </View>
                {(item.penalties || 0) > 0 && (
                  <Text style={styles.penaltyText}>⚠️ Had {item.penalties} penalt{item.penalties === 1 ? 'y' : 'ies'}</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.reactivateBtn, loading === item.id && styles.reactivateBtnDisabled]}
                onPress={() => handleReactivate(item)}
                activeOpacity={0.85}
                disabled={loading === item.id}>
                <Text style={styles.reactivateBtnText}>{loading === item.id ? '⏳' : '🔄'}</Text>
                <Text style={styles.reactivateBtnLabel}>{loading === item.id ? 'Wait...' : 'Reactivate'}</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  infoBanner: {
    backgroundColor: '#E8F5E9', margin: 14, marginBottom: 0,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#A5D6A7',
  },
  infoBannerText: { fontSize: 13, color: '#2E7D32', fontWeight: '600', lineHeight: 20 },
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
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPH: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  userEmail: { fontSize: 11, color: '#757575', fontWeight: '500' },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  rolePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  rolePillText: { fontSize: 10, fontWeight: '700' },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  penaltyText: { fontSize: 11, color: '#E53935', fontWeight: '600' },
  reactivateBtn: {
    alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#A5D6A7',
  },
  reactivateBtnDisabled: {
    backgroundColor: '#F5F5F5', borderColor: '#E0E0E0',
  },
  reactivateBtnText: { fontSize: 20 },
  reactivateBtnLabel: { fontSize: 10, fontWeight: '700', color: '#2E7D32', marginTop: 2 },
});

export default AdminReactivateScreen;
