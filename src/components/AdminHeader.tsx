import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, Dimensions,
} from 'react-native';

interface AdminHeaderProps {
  title: string;
  navigation?: any;
  showMenu?: boolean;
  rightComponent?: React.ReactNode;
  notifCount?: number;
}

const AdminHeader = ({ title, navigation, showMenu = true, rightComponent, notifCount }: AdminHeaderProps) => (
  <>
    <StatusBar backgroundColor="#1A1A2E" barStyle="light-content" />
    <View style={styles.header}>
      {showMenu ? (
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation?.openDrawer()} activeOpacity={0.7}>
          <View style={styles.hamburger}>
            <View style={styles.hamburgerLine} />
            <View style={[styles.hamburgerLine, { width: 22 }]} />
            <View style={[styles.hamburgerLine, { width: 16 }]} />
          </View>
          {notifCount && notifCount > 0 ? (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.titleUnderline} />
      </View>
      <View style={styles.rightSlot}>
        {rightComponent || <View style={{ width: 44 }} />}
      </View>
    </View>
  </>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  menuBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  hamburger: { gap: 5, alignItems: 'flex-start' },
  hamburgerLine: { height: 2.5, width: 26, backgroundColor: '#FFFFFF', borderRadius: 2 },
  menuBadge: {
    position: 'absolute', top: 6, right: 4, backgroundColor: '#FF6B35',
    borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  menuBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  titleRow: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  titleUnderline: { height: 3, width: 30, backgroundColor: '#FF6B35', borderRadius: 2, marginTop: 3 },
  rightSlot: { width: 44, alignItems: 'flex-end' },
});

export default AdminHeader;
