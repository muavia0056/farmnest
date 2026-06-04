import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Animated, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';
import {loginUserFromFirebase, loginMainAdminToFirebase} from '../../services/firebaseAuthService';
import firebaseAuth from '../../firebase/auth';
import {setLoginInProgress} from '../../navigation/AuthBootstrap';
import { generateResetCode, sendVerificationCodeEmail } from '../../services/EmailService';

const LoginScreen = ({ navigation, route }: any) => {
  const { users, setCurrentUser } = useApp();
  const { t, isUrdu } = useLanguage();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const logoAnim  = useRef(new Animated.Value(0)).current;

  const registeredName = route?.params?.registeredName || '';
  const regMsg         = route?.params?.message        || '';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
    ]).start();

    if (regMsg) {
      setSuccessMsg(regMsg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    const e: any = {};
    if (!identifier.trim()) { e.identifier = t('identifierRequired'); }
    if (!password.trim())   { e.password   = t('passwordRequired'); }
    setErrors(e);
    if (Object.keys(e).length) { shake(); return; }

    setIsLoading(true);
    setLoadingMessage(isUrdu ? 'لاگ ان ہو رہا ہے...' : 'Signing in...');
    setLoginInProgress(true);

    try {
      const id = identifier.trim().toLowerCase();
      const pw = password.trim();

      // ── Main admin shortcut ──────────────────────────────────────────────
      if ((id === 'muavia@gmail.com' || id === 'muavia') && pw === 'muavia') {
        setLoadingMessage(isUrdu ? 'ایڈمن ڈیش بورڈ لوڈ ہو رہا ہے...' : 'Loading Admin Dashboard...');
        await loginMainAdminToFirebase('muavia@gmail.com', 'muavia');
        // Find main admin by email (covers both local constant and Firestore doc)
        const mainAdmin = users.find(
          u => u.email?.toLowerCase() === 'muavia@gmail.com' || u.id === 'main-admin-001'
        ) || null;
        setCurrentUser(mainAdmin);
        setIsLoading(false);
        navigation.reset({ index: 0, routes: [{ name: 'MainAdminDashboard' }] });
        setLoginInProgress(false);
        return;
      }

      setLoadingMessage(isUrdu ? 'اکاؤنٹ کی تصدیق ہو رہی ہے...' : 'Verifying account...');
      const result = await loginUserFromFirebase(identifier, password);
      const firebaseProfile: any = result.profile || {};

      const loggedInUser = {
        id:            firebaseProfile.uid           || result.uid,
        firstName:     firebaseProfile.firstName     || '',
        lastName:      firebaseProfile.lastName      || '',
        email:         firebaseProfile.email         || identifier.trim().toLowerCase(),
        phone:         firebaseProfile.phone         || '',
        city:          firebaseProfile.city          || '',
        address:       firebaseProfile.address       || '',
        cnic:          firebaseProfile.cnic          || '',
        password:      '',
        role:          firebaseProfile.role          || 'Buyer',
        profilePic:    firebaseProfile.profilePic    || '',
        cnicFront:     firebaseProfile.cnicFront     || '',
        cnicBack:      firebaseProfile.cnicBack      || '',
        accountStatus: firebaseProfile.accountStatus || 'Pending',
        rating:        firebaseProfile.rating        || 0,
        reviews:       firebaseProfile.reviews       || [],
        registeredAt:  firebaseProfile.registeredAt  || Date.now(),
        penalties:     firebaseProfile.penalties     || 0,
        isMainAdmin:   firebaseProfile.isMainAdmin   || false,
        isSimpleAdmin: firebaseProfile.isSimpleAdmin || false,
      };

      // ── Email verification gate ─────────────────────────────────────────────────
      if (firebaseProfile.emailVerified === false) {
        setLoadingMessage(isUrdu ? 'تصدیقی کوڈ بھیجا جا رہا ہے...' : 'Sending verification code...');
        const verifyCode    = generateResetCode();
        const verifyExpiry  = Date.now() + 5 * 60 * 1000;
        const userEmail     = loggedInUser.email.trim().toLowerCase();
        const userFirstName = loggedInUser.firstName || 'User';

        try {
          await sendVerificationCodeEmail(userEmail, verifyCode, userFirstName);
        } catch (mailErr) {
          console.warn('[Login] Resend verification email failed:', mailErr);
        }

        setIsLoading(false);
        setLoginInProgress(false);
        navigation.navigate('EmailVerification', {
          email:       userEmail,
          firstName:   userFirstName,
          code:        verifyCode,
          expiry:      verifyExpiry,
          fromLogin:   true,
          userProfile: loggedInUser,
          password:    pw,
          uid:         result.uid,
        });
        return;
      }

      setLoadingMessage(isUrdu ? 'ڈیش بورڈ لوڈ ہو رہا ہے...' : 'Loading dashboard...');

      if (loggedInUser.accountStatus === 'Rejected') {
        setCurrentUser(loggedInUser);
        setIsLoading(false);
        if (loggedInUser.role === 'Farmer')   { navigation.reset({ index: 0, routes: [{ name: 'FarmerDashboard' }] }); }
        else if (loggedInUser.role === 'Buyer')    { navigation.reset({ index: 0, routes: [{ name: 'BuyerDashboard' }] }); }
        else if (loggedInUser.role === 'Investor') { navigation.reset({ index: 0, routes: [{ name: 'InvestorDashboard' }] }); }
        else if (loggedInUser.role === 'Admin')    { navigation.reset({ index: 0, routes: [{ name: 'SimpleAdminDashboard' }] }); }
        setLoginInProgress(false);
        return;
      }

      if (loggedInUser.accountStatus === 'Suspended') {
        setCurrentUser(loggedInUser);
        setIsLoading(false);
        navigation.reset({ index: 0, routes: [{ name: 'Suspended' }] });
        setLoginInProgress(false);
        return;
      }

      if (loggedInUser.accountStatus === 'Pending') {
        setCurrentUser(loggedInUser);
        setIsLoading(false);
        navigation.reset({ index: 0, routes: [{ name: 'AccountPending' }] });
        setLoginInProgress(false);
        return;
      }

      setCurrentUser(loggedInUser);
      setIsLoading(false);

      if (loggedInUser.role === 'Farmer')        { navigation.reset({ index: 0, routes: [{ name: 'FarmerDashboard' }] }); }
      else if (loggedInUser.role === 'Buyer')    { navigation.reset({ index: 0, routes: [{ name: 'BuyerDashboard' }] }); }
      else if (loggedInUser.role === 'Investor') { navigation.reset({ index: 0, routes: [{ name: 'InvestorDashboard' }] }); }
      else if (loggedInUser.role === 'Admin')    { navigation.reset({ index: 0, routes: [{ name: 'SimpleAdminDashboard' }] }); }
      else {
        await firebaseAuth.signOut().catch(() => {});
        setLoginInProgress(false);
        Alert.alert('Login Error', 'Your account role is not recognized. Please contact support.');
        return;
      }

      setLoginInProgress(false);

    } catch (error: any) {
      setIsLoading(false);
      setLoginInProgress(false);

      // FIXED: Properly redirect suspended users to Suspended screen
      if (error.code === 'auth/account-suspended') {
        const suspendedProfile = error.profile;
        if (suspendedProfile) {
          const suspendedUser = {
            id:            suspendedProfile.uid           || '',
            firstName:     suspendedProfile.firstName     || '',
            lastName:      suspendedProfile.lastName      || '',
            email:         suspendedProfile.email         || identifier.trim().toLowerCase(),
            phone:         suspendedProfile.phone         || '',
            city:          suspendedProfile.city          || '',
            address:       suspendedProfile.address       || '',
            cnic:          suspendedProfile.cnic          || '',
            password:      '',
            role:          suspendedProfile.role          || 'Buyer',
            profilePic:    suspendedProfile.profilePic    || '',
            cnicFront:     suspendedProfile.cnicFront     || '',
            cnicBack:      suspendedProfile.cnicBack      || '',
            accountStatus: 'Suspended' as const,
            rating:        suspendedProfile.rating        || 0,
            reviews:       suspendedProfile.reviews       || [],
            registeredAt:  suspendedProfile.registeredAt  || Date.now(),
            penalties:     suspendedProfile.penalties     || 0,
            isMainAdmin:   suspendedProfile.isMainAdmin   || false,
            isSimpleAdmin: suspendedProfile.isSimpleAdmin || false,
          };
          setCurrentUser(suspendedUser);
          // Navigate first, THEN release the loginInProgress flag so that
          // AuthBootstrap's onAuthStateChanged(null) (triggered by the signOut
          // inside loginUserFromFirebase) cannot redirect back to Login before
          // the Suspended screen is in place. The Suspended screen is also
          // listed in AuthBootstrap's HANDS_OFF_SCREENS for extra safety.
          navigation.reset({ index: 0, routes: [{ name: 'Suspended' }] });
          setTimeout(() => { setLoginInProgress(false); }, 500);
          return;
        }
        // Fallback: show error if profile wasn't included
        setErrors({
          general: isUrdu
            ? '🚫 آپ کا اکاؤنٹ معطل کر دیا گیا ہے۔ مزید معلومات کے لیے سپورٹ سے رابطہ کریں۔'
            : '🚫 Your account has been suspended. Please contact support for more information.',
        });
        shake();
        return;
      }

      let message = 'Login failed. Please try again.';
      if (error.code === 'auth/old-email-disabled') {
        message = 'This email address has been changed and can no longer be used to log in. Please use your new email address.';
      } else if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password'     ||
        error.code === 'auth/user-not-found'
      ) {
        message = 'Invalid email or password. Please check your credentials and try again.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address format.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many failed attempts. Please wait a moment and try again.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your internet connection and try again.';
      } else if (error.message === 'USER_PROFILE_NOT_FOUND') {
        message = 'Account setup incomplete. Please contact support.';
      }

      Alert.alert('Login Error', message);
      console.warn('[LoginScreen] login error:', error?.code || error?.message);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />

      {/* Loading Overlay Modal */}
      <Modal
        visible={isLoading}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingIconContainer}>
              <Text style={styles.loadingIcon}>🌿</Text>
            </View>
            <ActivityIndicator size="large" color="#2E7D32" style={styles.loadingSpinner} />
            <Text style={styles.loadingTitle}>Farm Nest</Text>
            <Text style={styles.loadingMessage}>{loadingMessage}</Text>
            <View style={styles.loadingDots}>
              <Animated.View style={[styles.loadingDot, styles.loadingDot1]} />
              <Animated.View style={[styles.loadingDot, styles.loadingDot2]} />
              <Animated.View style={[styles.loadingDot, styles.loadingDot3]} />
            </View>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Language Toggle */}
          <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>
            <LanguageToggle accentColor="#2E7D32" />
          </View>

          {/* Logo section */}
          <Animated.View style={[styles.logoSection, {
            opacity: logoAnim,
            transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          }]}>
            <View style={styles.logoIconWrap}>
              <Text style={styles.logoIcon}>🌿</Text>
            </View>
            <Text style={styles.logoText}>
              Farm <Text style={styles.logoTextAccent}>Nest</Text>
            </Text>
            <Text style={styles.logoTagline}>{t('signInToAccount')}</Text>
          </Animated.View>

          {/* Welcome */}
          <Animated.View style={[styles.welcomeSection, { opacity: fadeAnim }]}>
            <Text style={[styles.welcomeText, isUrdu && styles.rtlText]}>
              {t('welcomeBack')}{registeredName ? `, ${registeredName}` : ''}
            </Text>
            <Text style={[styles.welcomeSub, isUrdu && styles.rtlText]}>{t('signInToAccount')}</Text>
          </Animated.View>

          {/* Success banner */}
          {successMsg ? (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>✅ {successMsg}</Text>
            </View>
          ) : null}

          {/* Form */}
          <Animated.View style={[styles.formCard, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>

            {/* General error banner */}
            {errors.general ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>⚠️ {errors.general}</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, isUrdu && styles.rtlText]}>{t('emailPhoneCnic')}</Text>
            <TextInput
              style={[styles.input, errors.identifier && styles.inputErr]}
              placeholder={t('enterEmailPhoneCnic')}
              placeholderTextColor="#9E9E9E"
              value={identifier}
              onChangeText={v => { setIdentifier(v); setErrors((e: any) => ({ ...e, identifier: '', general: '' })); }}
              autoCapitalize="none"
              keyboardType="email-address"
              textAlign={isUrdu ? 'right' : 'left'}
              editable={!isLoading}
            />
            {errors.identifier
              ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.identifier}</Text>
              : null}

            <Text style={[styles.fieldLabel, isUrdu && styles.rtlText]}>{t('password')}</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput, errors.password && styles.inputErr]}
                placeholder={t('enterPassword')}
                placeholderTextColor="#9E9E9E"
                value={password}
                onChangeText={v => { setPassword(v); setErrors((e: any) => ({ ...e, password: '', general: '' })); }}
                secureTextEntry={!showPassword}
                textAlign={isUrdu ? 'right' : 'left'}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
                disabled={isLoading}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password
              ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.password}</Text>
              : null}

            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={isLoading}>
              <Text style={styles.loginBtnText}>{isLoading ? (isUrdu ? 'براہ کرم انتظار کریں...' : 'Please wait...') : t('signIn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}
              disabled={isLoading}>
              <Text style={[styles.forgotBtnText, isLoading && styles.disabledText]}>{t('forgotPassword')}</Text>
            </TouchableOpacity>

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>{t('dontHaveAccount')}</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Registration')}
                activeOpacity={0.7}
                disabled={isLoading}>
                <Text style={[styles.registerLink, isLoading && styles.disabledText]}>{t('createAccount')}</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent:  { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  logoSection:    { alignItems: 'center', marginBottom: 28 },
  logoIconWrap:   {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: '#C8E6C9',
  },
  logoIcon:       { fontSize: 40 },
  logoText:       { fontSize: 36, fontWeight: '900', color: '#1B1B1B', letterSpacing: 1 },
  logoTextAccent: { color: '#2E7D32' },
  logoTagline:    { fontSize: 13, color: '#757575', fontWeight: '500', marginTop: 4 },
  welcomeSection: { alignItems: 'center', marginBottom: 24 },
  welcomeText:    { fontSize: 26, fontWeight: '800', color: '#1B1B1B', textAlign: 'center', marginBottom: 6, writingDirection: 'ltr' },
  rtlText:        { textAlign: 'right', writingDirection: 'rtl' },
  welcomeSub:     { fontSize: 14, color: '#757575', fontWeight: '400' },
  successBanner:  {
    backgroundColor: 'rgba(46,125,50,0.9)', borderRadius: 14, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(46,125,50,0.6)',
  },
  successBannerText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 18,
  },
  errorBanner:     {
    backgroundColor: '#FFEBEE', borderRadius: 12, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#EF9A9A',
  },
  errorBannerText: { color: '#C62828', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  fieldLabel:      { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 14 },
  input: {
    backgroundColor: '#F9F9F9', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1B1B1B',
  },
  inputErr:      { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt:        { color: '#E53935', fontSize: 12, marginTop: 5, fontWeight: '500' },
  passwordWrap:  { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeBtn:        { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  eyeIcon:       { fontSize: 20 },
  loginBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 9,
  },
  loginBtnDisabled: {
    backgroundColor: '#81C784',
    shadowOpacity: 0.2,
  },
  loginBtnText:    { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  forgotBtn:       { alignItems: 'center', marginTop: 14 },
  forgotBtnText:   { color: '#2E7D32', fontSize: 13, fontWeight: '700' },
  disabledText:    { color: '#9E9E9E' },
  registerRow:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  registerPrompt:  { fontSize: 14, color: '#757575', fontWeight: '400' },
  registerLink:    { fontSize: 14, color: '#2E7D32', fontWeight: '800' },
  // Loading overlay styles
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  loadingIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#C8E6C9',
  },
  loadingIcon: {
    fontSize: 36,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2E7D32',
    marginBottom: 8,
  },
  loadingMessage: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  loadingDot1: {
    opacity: 0.3,
  },
  loadingDot2: {
    opacity: 0.6,
  },
  loadingDot3: {
    opacity: 1,
  },
});

export default LoginScreen;
