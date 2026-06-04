import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  ScrollView,
  BackHandler,
  ToastAndroid,
  Platform,
} from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation, DrawerActions, useNavigationState } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHomeScreen from './FarmerHomeScreen';
import FarmerFundingScreen from './FarmerFundingScreen';
import FarmerMessagesScreen from './FarmerMessagesScreen';
import FarmerItemListScreen from './FarmerItemListScreen';
import FarmerHistoryScreen from './FarmerHistoryScreen';
import FarmerPaymentScreen from './FarmerPaymentScreen';
import FarmerNotificationsScreen from './FarmerNotificationsScreen';
import FarmerProfileScreen from './FarmerProfileScreen';
import FarmerComplainScreen from './FarmerComplainScreen';

import FarmerInvestorsScreen from './FarmerInvestorsScreen';
import FarmerLandDetailScreen from './FarmerLandDetailScreen';
import FarmerCropDetailScreen from './FarmerCropDetailScreen';
import FarmerSeeAllBiddingScreen from './FarmerSeeAllBiddingScreen';

const { width } = Dimensions.get('window');
const Drawer = createDrawerNavigator();

// Static screen map
const SCREEN_ITEMS = [
  { name: 'FarmerHome',          labelKey: 'menuDashboard',     icon: '🏠', screen: FarmerHomeScreen },
  { name: 'FarmerFunding',       labelKey: 'menuFunding',       icon: '💰', screen: FarmerFundingScreen },
  { name: 'FarmerInvestors',     labelKey: 'menuFarmerFunding', icon: '🌾', screen: FarmerInvestorsScreen },
  { name: 'FarmerMessages',      labelKey: 'menuMessages',      icon: '💬', screen: FarmerMessagesScreen },
  { name: 'FarmerItemList',      labelKey: 'menuItemList',      icon: '📋', screen: FarmerItemListScreen },
  { name: 'FarmerHistory',       labelKey: 'menuHistory',       icon: '📜', screen: FarmerHistoryScreen },
  { name: 'FarmerPayment',       labelKey: 'menuPayment',       icon: '💳', screen: FarmerPaymentScreen },
  { name: 'FarmerNotifications', labelKey: 'menuNotifications', icon: '🔔', screen: FarmerNotificationsScreen },
  { name: 'FarmerProfile',       labelKey: 'menuProfile',       icon: '👤', screen: FarmerProfileScreen },
  { name: 'FarmerComplain',      labelKey: 'menuComplain',      icon: '⚠️',  screen: FarmerComplainScreen },
  { name: 'FarmerSeeAllBidding', labelKey: 'menuSeeAllBidding', icon: '🏷️', screen: FarmerSeeAllBiddingScreen },
];

const CustomDrawerContent = (props: any) => {
  const { currentUser, notifications, messages } = useApp();
  const { t, isUrdu } = useLanguage();
  const slideAnim = useRef(new Animated.Value(-width * 0.72)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      friction: 7,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const unreadMessages = messages.filter(
    m => m.receiverId === currentUser?.id && !m.read
  ).length;
  const unreadNotifs = notifications.filter(
    n => n.userId === currentUser?.id && !n.read
  ).length;

  const getInitials = () => {
    if (!currentUser) return '?';
    return `${currentUser.firstName[0]}${currentUser.lastName[0]}`.toUpperCase();
  };

  return (
    <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
      {/* HEADER */}
      <View style={styles.drawerHeader}>
        <View style={styles.drawerHeaderBg} />
        <View style={styles.drawerProfileRow}>
          {currentUser?.profilePic ? (
            <Image source={{ uri: currentUser.profilePic }} style={styles.drawerAvatar} />
          ) : (
            <View style={styles.drawerAvatarPlaceholder}>
              <Text style={styles.drawerAvatarInitials}>{getInitials()}</Text>
            </View>
          )}
          <View style={styles.drawerProfileInfo}>
            <Text style={styles.drawerProfileName} numberOfLines={1}>
              {currentUser?.firstName} {currentUser?.lastName}
            </Text>
            <View style={styles.drawerRoleBadge}>
              <Text style={styles.drawerRoleText}>{t('drawerFarmerRole')}</Text>
            </View>
            <View
              style={[
                styles.drawerStatusBadge,
                {
                  backgroundColor:
                    currentUser?.accountStatus === 'Approved' ? '#E8F5E9' : '#FFF8E1',
                },
              ]}>
              <View
                style={[
                  styles.drawerStatusDot,
                  {
                    backgroundColor:
                      currentUser?.accountStatus === 'Approved' ? '#2E7D32' : '#F9A825',
                  },
                ]}
              />
              <Text
                style={[
                  styles.drawerStatusText,
                  {
                    color:
                      currentUser?.accountStatus === 'Approved' ? '#2E7D32' : '#F9A825',
                  },
                ]}>
                {currentUser?.accountStatus}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* MENU ITEMS */}
      <ScrollView
        style={styles.drawerMenuScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}>
        {SCREEN_ITEMS.map((item, index) => {
          const isActive = props.state.index === index;
          const badge =
            item.name === 'FarmerMessages'
              ? unreadMessages
              : item.name === 'FarmerNotifications'
              ? unreadNotifs
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
              <Text style={[
                styles.drawerMenuLabel,
                isActive && styles.drawerMenuLabelActive,
                isUrdu && styles.rtlText,
              ]}>
                {t(item.labelKey)}
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

      {/* FOOTER */}
      <View style={styles.drawerFooter}>
        <View style={styles.drawerFooterLogo}>
          <Text style={styles.drawerFooterLogoIcon}>🌿</Text>
          <Text style={styles.drawerFooterLogoText}>
            Farm <Text style={{ color: '#2E7D32' }}>Nest</Text>
          </Text>
        </View>
        <Text style={styles.drawerFooterVersion}>v1.0.0</Text>
      </View>
    </Animated.View>
  );
};

const FarmerNavigator = () => {
  const navigation = useNavigation<any>();
  const backPressedOnce = useRef(false);

  useEffect(() => {
    const onBack = () => {
      // If drawer is open, close it first
      const state = navigation.getState?.();
      const drawerOpen = state?.history?.some?.((h: any) => h.type === 'drawer');
      if (drawerOpen) {
        navigation.dispatch(DrawerActions.closeDrawer());
        return true;
      }
      // Drawer is closed — double-press to exit
      if (backPressedOnce.current) {
        BackHandler.exitApp();
        return true;
      }
      backPressedOnce.current = true;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      setTimeout(() => { backPressedOnce.current = false; }, 2000);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigation]);

  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawerContent {...props} />}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        drawerStyle: { width: width * 0.72, backgroundColor: 'transparent' },
        overlayColor: 'rgba(0,0,0,0.45)',
        drawerType: 'slide',
        swipeEnabled: true,
        swipeEdgeWidth: 60,
      }}>
      {SCREEN_ITEMS.map(item => (
        <Drawer.Screen
          key={item.name}
          name={item.name}
          component={item.screen}
        />
      ))}
      <Drawer.Screen
        name="FarmerCropDetail"
        component={FarmerCropDetailScreen}
        options={{ swipeEnabled: false }}
      />
      <Drawer.Screen
        name="FarmerLandDetail"
        component={FarmerLandDetailScreen}
        options={{ swipeEnabled: false }}
      />
    </Drawer.Navigator>
  );
};

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  drawerHeader: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  drawerHeaderBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#F1F8E9',
  },
  drawerProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  drawerAvatar: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: '#2E7D32',
  },
  drawerAvatarPlaceholder: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#81C784',
  },
  drawerAvatarInitials: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  drawerProfileInfo: { flex: 1 },
  drawerProfileName: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 5 },
  drawerRoleBadge: {
    backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 10,
    paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 5,
  },
  drawerRoleText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  drawerStatusBadge: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', gap: 5,
  },
  drawerStatusDot: { width: 7, height: 7, borderRadius: 4 },
  drawerStatusText: { fontSize: 11, fontWeight: '700' },
  drawerMenuScroll: { flex: 1, paddingTop: 10, paddingHorizontal: 12 },
  drawerMenuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    paddingHorizontal: 14, borderRadius: 14, marginBottom: 4,
    position: 'relative', gap: 12,
  },
  drawerMenuItemActive: { backgroundColor: '#E8F5E9' },
  drawerMenuIconBox: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
  },
  drawerMenuIconBoxActive: { backgroundColor: '#C8E6C9' },
  drawerMenuIcon: { fontSize: 18 },
  drawerMenuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#555555' },
  drawerMenuLabelActive: { color: '#2E7D32', fontWeight: '800' },
  drawerActiveIndicator: {
    width: 4, height: 30, borderRadius: 2, backgroundColor: '#2E7D32',
    position: 'absolute', right: 0,
  },
  drawerBadge: {
    backgroundColor: '#E53935', borderRadius: 12, minWidth: 22, height: 22,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  drawerBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  drawerFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  drawerFooterLogo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  drawerFooterLogoIcon: { fontSize: 18 },
  drawerFooterLogoText: { fontSize: 16, fontWeight: '900', color: '#1B1B1B' },
  drawerFooterVersion: { fontSize: 11, color: '#BDBDBD', fontWeight: '500' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});

export default FarmerNavigator;
