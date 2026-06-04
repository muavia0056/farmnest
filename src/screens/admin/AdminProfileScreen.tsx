import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  RefreshControl, Alert,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import {logoutFromFirebaseSession} from '../../services/sessionService';

const AdminProfileScreen = ({ navigation }: any) => {
  const { setCurrentUser, clearAppSessionState } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // Clear local state first
          clearAppSessionState();
          // Sign out from Firebase and navigate to Login
          // logoutFromFirebaseSession handles errors internally and always navigates
          await logoutFromFirebaseSession();
        },
      },
    ]);
  };

  const infoRows = [
    { icon: '👤', label: 'Full Name', value: 'Muhammad Muavia' },
    { icon: '📧', label: 'Email', value: 'muavia@gmail.com' },
    { icon: '🏙️', label: 'City', value: 'RYK (Rahim Yar Khan)' },
    { icon: '📍', label: 'Address', value: 'Airport Road, RYK' },
    { icon: '👑', label: 'Role', value: 'Main Admin' },
    { icon: '🔐', label: 'Access Level', value: 'Full Access — All Menus' },
  ];

  return (
    <View style={styles.container}>
      <AdminHeader title="Admin Profile" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF6B35']} tintColor="#FF6B35" />
        }>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarPH}>
              <Text style={styles.avatarInit}>MM</Text>
            </View>
            <View style={styles.crownBadge}>
              <Text style={styles.crownEmoji}>👑</Text>
            </View>
          </View>
          <Text selectable style={styles.name}>Muhammad Muavia</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>👑 Main Admin</Text>
          </View>
          <View style={styles.accessBadge}>
            <Text style={styles.accessBadgeText}>🔓 Full Platform Access</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Account Information</Text>
          {infoRows.map(row => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoIcon}>{row.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text selectable style={styles.infoLabel}>{row.label}</Text>
                <Text selectable style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Capabilities Card */}
        <View style={styles.capCard}>
          <Text style={styles.capTitle}>🛠️ Admin Capabilities</Text>
          {[
            '📊 View platform stats & sales',
            '⏳ Approve or reject user accounts',
            '📩 View all user complaints',
            '🗑️ Remove any user account',
            '🔐 Manage simple admin accounts',
            '📋 Remove farmer posts',
          ].map((item, i) => (
            <View key={i} style={styles.capRow}>
              <Text selectable style={styles.capText}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={styles.logoutBtnText}>🚪 Logout</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#1A1A2E', borderRadius: 24, padding: 28,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#1A1A2E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 10,
  },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatarPH: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: '#FF6B35',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,107,53,0.4)',
  },
  avatarInit: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  crownBadge: {
    position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#1A1A2E',
  },
  crownEmoji: { fontSize: 16 },
  name: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  roleBadge: {
    backgroundColor: '#FF6B35', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
  },
  roleBadgeText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  accessBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  accessBadgeText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 14 },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
  capCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  capTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  capRow: {
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F9F9F9',
  },
  capText: { fontSize: 14, color: '#444444', fontWeight: '500' },
  logoutBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  logoutBtnText: { color: '#C62828', fontSize: 16, fontWeight: '800' },
});

export default AdminProfileScreen;
