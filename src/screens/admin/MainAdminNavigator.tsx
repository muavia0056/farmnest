import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Dimensions,
} from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useApp } from '../../context/AppContext';

import AdminStatsScreen from './AdminStatsScreen';
import AdminPendingUsersScreen from './AdminPendingUsersScreen';
import AdminComplaintsScreen from './AdminComplaintsScreen';
import AdminRemoveUserScreen from './AdminRemoveUserScreen';
import AdminPendingAdminsScreen from './AdminPendingAdminsScreen';
import AdminPostsScreen from './AdminPostsScreen';
import AdminProfileScreen from './AdminProfileScreen';
import AdminUserListScreen from './AdminUserListScreen';
import AdminMessagesScreen from './AdminMessagesScreen';
import AdminReactivateScreen from './AdminReactivateScreen';
import AdminCancelOrderScreen from './AdminCancelOrderScreen';
import AdminInvestmentOrderScreen from './AdminInvestmentOrderScreen';

const { width } = Dimensions.get('window');
const Drawer = createDrawerNavigator();

const MAIN_ADMIN_MENUS = [
  { name: 'AdminStats',              label: 'Stats',                icon: '📊', component: AdminStatsScreen },
  { name: 'AdminPendingUsers',       label: 'Pending Users',        icon: '⏳', component: AdminPendingUsersScreen },
  { name: 'AdminUserList',           label: 'User List',            icon: '👥', component: AdminUserListScreen },
  { name: 'AdminComplaints',         label: 'Complaints',           icon: '📩', component: AdminComplaintsScreen },
  { name: 'AdminMessages',           label: 'Messages',             icon: '💬', component: AdminMessagesScreen },
  { name: 'AdminInvestmentOrders',   label: 'Investment Orders',    icon: '💼', component: AdminInvestmentOrderScreen },
  { name: 'AdminRemoveUser',         label: 'Remove User',          icon: '🗑️', component: AdminRemoveUserScreen },
  { name: 'AdminReactivate',         label: 'Reactivate Account',   icon: '🔄', component: AdminReactivateScreen },
  { name: 'AdminCancelOrder',        label: 'Cancel Order',         icon: '🚫', component: AdminCancelOrderScreen },
  { name: 'AdminPendingAdmins',      label: 'Pending Admins',       icon: '🔐', component: AdminPendingAdminsScreen },
  { name: 'AdminPosts',              label: 'Manage Posts',         icon: '📋', component: AdminPostsScreen },
  { name: 'AdminProfile',            label: 'Profile',              icon: '👤', component: AdminProfileScreen },
];



const MainAdminDrawerContent = (props: any) => {
  const { currentUser, complaints, users } = useApp();
  const slideAnim = useRef(new Animated.Value(-width * 0.72)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, []);

  const adminId = 'main-admin-001';
  const unviewedComplaints = complaints.filter(c => !c.viewedByAdmin).length;
  const pendingUsersCount = users.filter(u =>
    u.accountStatus === 'Pending' && ['Farmer', 'Buyer', 'Investor'].includes(u.role)
  ).length;
  const pendingAdminsCount = users.filter(u =>
    u.role === 'Admin' && u.id !== 'main-admin' && u.accountStatus === 'Pending'
  ).length;
  const { investmentOrders } = useApp();
  const pendingInvestmentOrders = (investmentOrders || []).filter((o: any) => o.status === 'PaymentSent').length;

  return (
    <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
      {/* Header */}
      <View style={styles.drawerHeader}>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>👑 Main Admin</Text>
        </View>
        <View style={styles.drawerAvatarPH}>
          <Text style={styles.drawerAvatarInitials}>MA</Text>
        </View>
        <Text style={styles.drawerName}>Muhammad Muavia</Text>
        <Text style={styles.drawerEmail}>muavia@gmail.com</Text>
      </View>

      {/* Menu items */}
      <ScrollView style={styles.drawerMenuScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {MAIN_ADMIN_MENUS.map((item, index) => {
          const isActive = props.state.index === index;
          const badge = item.name === 'AdminComplaints' ? unviewedComplaints
            : item.name === 'AdminPendingUsers' ? pendingUsersCount
            : item.name === 'AdminPendingAdmins' ? pendingAdminsCount
            : item.name === 'AdminInvestmentOrders' ? pendingInvestmentOrders
            : 0;
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.drawerMenuItem, isActive && styles.drawerMenuItemActive]}
              onPress={() => props.navigation.navigate(item.name)}
              activeOpacity={0.75}>
              <View style={[styles.drawerMenuIconBox, isActive && styles.drawerMenuIconBoxActive]}>
                <Text style={styles.drawerMenuIcon}>{item.icon}</Text>
              </View>
              <Text style={[styles.drawerMenuLabel, isActive && styles.drawerMenuLabelActive]}>
                {item.label}
              </Text>
              {badge > 0 && (
                <View style={styles.drawerBadge}>
                  <Text style={styles.drawerBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
              {isActive && <View style={styles.drawerActiveIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.drawerFooter}>
        <View style={styles.drawerFooterLogo}>
          <Text style={styles.drawerFooterLogoIcon}>🌿</Text>
          <Text style={styles.drawerFooterLogoText}>Farm <Text style={{ color: '#FF6B35' }}>Nest</Text></Text>
        </View>
        <Text style={styles.drawerFooterVersion}>v1.0.0</Text>
      </View>
    </Animated.View>
  );
};

const MainAdminNavigator = () => {
  return (
    <Drawer.Navigator
      drawerContent={props => <MainAdminDrawerContent {...props} />}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        drawerStyle: { width: width * 0.72, backgroundColor: 'transparent' },
        overlayColor: 'rgba(0,0,0,0.5)',
        drawerType: 'slide',
        swipeEnabled: true,
        swipeEdgeWidth: 60,
      }}>
      {MAIN_ADMIN_MENUS.map(item => (
        <Drawer.Screen
          key={item.name}
          name={item.name}
          component={item.component}
        />
      ))}
    </Drawer.Navigator>
  );
};

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
  },
  drawerHeader: {
    backgroundColor: '#1A1A2E', paddingTop: 50, paddingBottom: 24, paddingHorizontal: 20, alignItems: 'center',
  },
  adminBadge: {
    backgroundColor: '#FF6B35', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 14,
  },
  adminBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  drawerAvatarPH: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FF6B35',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,107,53,0.4)', marginBottom: 10,
  },
  drawerAvatarInitials: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  drawerName: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  drawerEmail: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  drawerMenuScroll: { flex: 1, paddingTop: 10, paddingHorizontal: 12 },
  drawerMenuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 14, borderRadius: 14, marginBottom: 4, position: 'relative', gap: 12,
  },
  drawerMenuItemActive: { backgroundColor: '#FFF3EE' },
  drawerMenuIconBox: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center',
  },
  drawerMenuIconBoxActive: { backgroundColor: '#FFD5C5' },
  drawerMenuIcon: { fontSize: 18 },
  drawerMenuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#555555' },
  drawerMenuLabelActive: { color: '#FF6B35', fontWeight: '800' },
  drawerActiveIndicator: {
    width: 4, height: 30, borderRadius: 2, backgroundColor: '#FF6B35', position: 'absolute', right: 0,
  },
  drawerBadge: {
    backgroundColor: '#E53935', borderRadius: 12, minWidth: 22, height: 22,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  drawerBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  drawerFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  drawerFooterLogo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  drawerFooterLogoIcon: { fontSize: 18 },
  drawerFooterLogoText: { fontSize: 16, fontWeight: '900', color: '#1B1B1B' },
  drawerFooterVersion: { fontSize: 11, color: '#BDBDBD', fontWeight: '500' },
});

export default MainAdminNavigator;
