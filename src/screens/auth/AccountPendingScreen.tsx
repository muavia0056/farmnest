import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import FarmNestLogo from '../../components/FarmNestLogo';
import { useApp } from '../../context/AppContext';
import firebaseAuth from '../../firebase/auth';

const AccountPendingScreen = ({ navigation }: any) => {
  const { setCurrentUser } = useApp();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <FarmNestLogo size="medium" />

        <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.iconEmoji}>⏳</Text>
        </Animated.View>

        <Text style={styles.title}>Account Pending</Text>
        <Text style={styles.subtitle}>
          Your account is currently under review.{'\n'}
          Please wait for approval before you can access the app.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Once approved by the admin, you will have full access. This usually takes a short time.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => {
            try { await firebaseAuth.signOut(); } catch (_) {}
            setCurrentUser(null);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          }}
          activeOpacity={0.85}>
          <Text style={styles.logoutBtnText}>← Back to Login</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  content: { alignItems: 'center', width: '100%' },
  iconContainer: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: '#FFF8E1',
    justifyContent: 'center', alignItems: 'center', marginTop: 32, marginBottom: 24,
    shadowColor: '#F9A825', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  iconEmoji: { fontSize: 50 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#757575', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  infoBox: {
    flexDirection: 'row', backgroundColor: '#E8F5E9', borderRadius: 14,
    padding: 16, alignItems: 'flex-start', width: '100%', marginBottom: 32,
  },
  infoIcon: { fontSize: 18, marginRight: 10, marginTop: 1 },
  infoText: { flex: 1, fontSize: 14, color: '#2E7D32', lineHeight: 22, fontWeight: '500' },
  logoutBtn: {
    backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 15,
    paddingHorizontal: 40, borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  logoutBtnText: { color: '#333333', fontSize: 15, fontWeight: '700' },
});

export default AccountPendingScreen;
