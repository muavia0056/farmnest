import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform,
} from 'react-native';

interface InvestorHeaderProps {
  title: string;
  navigation: any;
  rightComponent?: React.ReactNode;
  notifCount?: number;
}

const InvestorHeader = ({ title, navigation, rightComponent, notifCount }: InvestorHeaderProps) => (
  <>
    <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
    <View style={styles.header}>
      <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.openDrawer()} activeOpacity={0.7}>
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  menuBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  hamburger: { gap: 5, alignItems: 'flex-start' },
  hamburgerLine: { height: 2.5, width: 26, backgroundColor: '#1B1B1B', borderRadius: 2 },
  menuBadge: {
    position: 'absolute', top: 6, right: 4, backgroundColor: '#E53935',
    borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  menuBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  titleRow: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#1B1B1B', letterSpacing: 0.3 },
  titleUnderline: { height: 3, width: 30, backgroundColor: '#6A1B9A', borderRadius: 2, marginTop: 3 },
  rightSlot: { minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
});

export default InvestorHeader;
