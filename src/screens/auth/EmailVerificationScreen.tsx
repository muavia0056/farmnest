import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Animated, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';
import { generateResetCode, sendVerificationCodeEmail, USE_REAL_EMAIL } from '../../services/EmailService';
import db from '../../firebase/firestore';
import { markEmailVerifiedInFirebase } from '../../services/firebaseAuthService';
import { useApp } from '../../context/AppContext';
import { setLoginInProgress } from '../../navigation/AuthBootstrap';

// ── Constants ─────────────────────────────────────────────────────────────────
const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * EmailVerificationScreen
 *
 * Shown immediately after a new user successfully creates their account.
 * Navigation params expected:
 *   email      : string  – the email address that was registered
 *   firstName  : string  – user's first name (for personalisation)
 *   code       : string  – the 10-char code that was already sent
 *   expiry     : number  – Date.now() + 5 min at the time the code was sent
 */
const EmailVerificationScreen = ({ navigation, route }: any) => {
  const { t, isUrdu } = useLanguage();
  const { setCurrentUser } = useApp();

  // ── Params passed from RegistrationScreen ─────────────────────────────────
  const {
    email       = '',
    firstName   = 'User',
    code: initialCode    = '',
    expiry: initialExpiry = 0,
    fromLogin   = false,
    userProfile = null,
    password    = '',   // passed from LoginScreen or RegistrationScreen for authenticated write
    uid: paramUid = '', // passed from RegistrationScreen
  } = route?.params ?? {};

  // ── State ──────────────────────────────────────────────────────────────────
  const [enteredCode, setEnteredCode]     = useState('');
  const [codeError,   setCodeError]       = useState('');
  const [generatedCode, setGeneratedCode] = useState<string>(initialCode);
  const [codeExpiry,    setCodeExpiry]    = useState<number>(initialExpiry);
  const [timeLeft,      setTimeLeft]      = useState<number>(0);
  const [codeExpired,   setCodeExpired]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [verified,      setVerified]      = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animations ─────────────────────────────────────────────────────────────
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    animateIn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!verified && codeExpiry > 0) {
      if (timerRef.current) { clearInterval(timerRef.current); }
      setCodeExpired(false);
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((codeExpiry - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining === 0) {
          setCodeExpired(true);
          if (timerRef.current) { clearInterval(timerRef.current); }
        }
      }, 500);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); } };
  }, [codeExpiry, verified]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14,  duration: 65, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 65, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Resend Code ────────────────────────────────────────────────────────────
  const handleResendCode = async () => {
    setLoading(true);
    try {
      const newCode   = generateResetCode();
      const newExpiry = Date.now() + CODE_EXPIRY_MS;

      await sendVerificationCodeEmail(email.trim().toLowerCase(), newCode, firstName);

      setGeneratedCode(newCode);
      setCodeExpiry(newExpiry);
      setEnteredCode('');
      setCodeError('');
      setCodeExpired(false);
    } catch (err: any) {
      const detail = err?.message || err?.code || String(err);
      setCodeError(`${t('evResendFailed')} ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Verify Code ────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (codeExpired) { setCodeError(t('fpCodeExpired')); shake(); return; }
    if (!enteredCode.trim()) { setCodeError(t('fpCodeRequired')); shake(); return; }
    if (enteredCode.trim() !== generatedCode) { setCodeError(t('fpCodeInvalid')); shake(); return; }

    if (timerRef.current) { clearInterval(timerRef.current); }

    // ── Mark email as verified in Firestore ──────────────────────────────
    // We find the user by email address and flip the emailVerified flag.
    // This is a best-effort write; even if it fails the screen still shows
    // success so the user can proceed (login will re-check and redirect them
    // back here if the flag never got set).
    setLoading(true);
    try {
      // Use the authenticated write function — signs the user in briefly,
      // writes emailVerified:true, then signs out. This works regardless of
      // whether the unauthenticated-update Firestore rules have been deployed.
      const uid = userProfile?.id || paramUid || '';
      if (uid && password) {
        // We have uid + password: use authenticated write (works with existing rules)
        await markEmailVerifiedInFirebase(email.trim().toLowerCase(), password, uid);
      } else {
        // Fallback: unauthenticated write (works only after firestore.rules are deployed)
        const snap = await db
          .collection('users')
          .where('email', '==', email.trim().toLowerCase())
          .limit(1)
          .get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({ emailVerified: true });
          console.log('[EmailVerification] unauthenticated write succeeded for:', email.trim().toLowerCase());
        } else {
          console.warn('[EmailVerification] No user document found for email:', email.trim().toLowerCase());
        }
      }
    } catch (fsErr: any) {
      console.warn('[EmailVerification] Firestore update failed:', fsErr?.code, fsErr?.message);
    } finally {
      setLoading(false);
    }

    // ── If we came from Login, route directly to the correct screen ───────────
    if (fromLogin && userProfile) {
      setCurrentUser(userProfile);

      const role          = userProfile.role || '';
      const accountStatus = userProfile.accountStatus || 'Pending';

      // Release AuthBootstrap NOW — navigation.reset is about to take over.
      setLoginInProgress(false);

      if (accountStatus === 'Suspended') {
        navigation.reset({ index: 0, routes: [{ name: 'Suspended' }] });
      } else if (accountStatus === 'Pending') {
        // New registrations are always Pending until admin approves
        navigation.reset({ index: 0, routes: [{ name: 'AccountPending' }] });
      } else if (accountStatus === 'Rejected') {
        if      (role === 'Farmer')   { navigation.reset({ index: 0, routes: [{ name: 'FarmerDashboard' }] }); }
        else if (role === 'Buyer')    { navigation.reset({ index: 0, routes: [{ name: 'BuyerDashboard' }] }); }
        else if (role === 'Investor') { navigation.reset({ index: 0, routes: [{ name: 'InvestorDashboard' }] }); }
        else if (role === 'Admin')    { navigation.reset({ index: 0, routes: [{ name: 'SimpleAdminDashboard' }] }); }
        else                          { navigation.reset({ index: 0, routes: [{ name: 'AccountPending' }] }); }
      } else if (accountStatus === 'Approved') {
        if      (role === 'Farmer')   { navigation.reset({ index: 0, routes: [{ name: 'FarmerDashboard' }] }); }
        else if (role === 'Buyer')    { navigation.reset({ index: 0, routes: [{ name: 'BuyerDashboard' }] }); }
        else if (role === 'Investor') { navigation.reset({ index: 0, routes: [{ name: 'InvestorDashboard' }] }); }
        else if (role === 'Admin')    { navigation.reset({ index: 0, routes: [{ name: 'SimpleAdminDashboard' }] }); }
        else                          { setVerified(true); animateIn(); }
      } else {
        // Unknown status — go to AccountPending as safe default
        navigation.reset({ index: 0, routes: [{ name: 'AccountPending' }] });
      }
      return;
    }

    // ── Coming from Registration — show the success screen ────────────────
    setVerified(true);
    animateIn();
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (verified) {
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
        <View style={styles.langToggle}>
          <LanguageToggle accentColor="#2E7D32" />
        </View>
        <Animated.View style={[styles.successWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.logoIconWrap}>
            <Text style={styles.logoIcon}>🌿</Text>
          </View>
          <Text style={styles.logoText}>Farm<Text style={styles.logoTextAccent}>Nest</Text></Text>

          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={[styles.successTitle, isUrdu && styles.rtl]}>{t('evSuccessTitle')}</Text>
            <Text style={[styles.successMsg, isUrdu && styles.rtl]}>{t('evSuccessMsg')}</Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>{t('evSuccessInfo')}</Text>
            </View>

            <TouchableOpacity
              style={styles.btn}
              onPress={() => navigation.replace('Login', { showThanks: true })}
              activeOpacity={0.85}>
              <Text style={styles.btnText}>{t('evGoToLogin')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ── Verification form ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />

      <View style={styles.langToggle}>
        <LanguageToggle accentColor="#2E7D32" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.logoIconWrap}>
              <Text style={styles.logoIcon}>🌿</Text>
            </View>
            <Text style={styles.logoText}>Farm<Text style={styles.logoTextAccent}>Nest</Text></Text>
            <View style={{ height: 12 }} />
            <Text style={styles.title}>{t('evTitle')}</Text>
            <Text style={[styles.subtitle, isUrdu && styles.rtl]}>{t('evSubtitle')}</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>

            {/* Email highlight */}
            <Text style={[styles.stepDesc, isUrdu && styles.rtl]}>
              {t('evSentTo')}{' '}
              <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>
            </Text>

            {/* Demo code box — only shown when email is in demo/test mode */}
            {!USE_REAL_EMAIL && generatedCode ? (
              <View style={styles.demoBox}>
                <Text style={styles.demoBoxTitle}>📋 {t('evDemoTitle')}</Text>
                <Text style={styles.demoBoxCode}>{generatedCode}</Text>
                <Text style={styles.demoBoxNote}>{t('evDemoNote')}</Text>
              </View>
            ) : null}

            {/* Countdown timer */}
            <View style={[styles.timerBox, codeExpired && styles.timerBoxExpired]}>
              {codeExpired ? (
                <Text style={styles.timerTextExpired}>⛔ {t('fpCodeExpiredLabel')}</Text>
              ) : (
                <>
                  <Text style={styles.timerLabel}>⏱ {t('fpCodeExpiresIn')}</Text>
                  <Text style={[styles.timerValue, timeLeft <= 60 && styles.timerValueUrgent]}>
                    {formatTime(timeLeft)}
                  </Text>
                </>
              )}
            </View>

            {/* Code input */}
            <Text style={[styles.fieldLabel, isUrdu && styles.rtl]}>{t('fpCodeLabel')}</Text>
            <TextInput
              style={[styles.input, styles.codeInput, codeError ? styles.inputErr : null]}
              placeholder={t('fpCodePlaceholder')}
              placeholderTextColor="#9E9E9E"
              value={enteredCode}
              onChangeText={v => { setEnteredCode(v); setCodeError(''); }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              textAlign="center"
            />
            {codeError ? <Text style={[styles.errTxt, isUrdu && styles.rtl]}>⚠ {codeError}</Text> : null}

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.btn, (loading || codeExpired) && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={loading || codeExpired}
              activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.btnText}>{t('evVerifyBtn')}</Text>}
            </TouchableOpacity>

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendPrompt}>{t('fpDidntReceive')}</Text>
              <TouchableOpacity onPress={handleResendCode} disabled={loading} activeOpacity={0.7}>
                <Text style={styles.resendLink}>{t('fpResendCode')}</Text>
              </TouchableOpacity>
            </View>

            {/* Skip (only shown when coming from Registration, not from Login) */}
            {!fromLogin && (
              <TouchableOpacity
                style={styles.skipLink}
                onPress={() => navigation.replace('Login', { showThanks: true })}
                activeOpacity={0.7}>
                <Text style={styles.skipLinkText}>{t('evSkip')}</Text>
              </TouchableOpacity>
            )}

            {/* If from login, show a note explaining why they must verify */}
            {fromLogin && (
              <View style={styles.loginBlockNote}>
                <Text style={[styles.loginBlockNoteText, isUrdu && styles.rtl]}>
                  {t('evLoginBlockNote')}
                </Text>
              </View>
            )}

          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FFFFFF' },
  langToggle:   { position: 'absolute', top: Platform.OS === 'ios' ? 52 : 16, right: 16, zIndex: 999, elevation: 999 },
  scrollContent:{ flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 100 : 70, paddingBottom: 40 },

  // Header / logo
  header:        { alignItems: 'center', marginBottom: 28 },
  logoIconWrap:  {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: '#C8E6C9',
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  logoIcon:       { fontSize: 40 },
  logoText:       { fontSize: 36, fontWeight: '900', color: '#1B1B1B', letterSpacing: 1 },
  logoTextAccent: { color: '#2E7D32' },
  title:          { fontSize: 22, fontWeight: '800', color: '#1B1B1B', textAlign: 'center', marginBottom: 6 },
  subtitle:       { fontSize: 13, color: '#757575', textAlign: 'center', lineHeight: 20 },
  rtl:            { textAlign: 'right', writingDirection: 'rtl' },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  stepDesc:       { fontSize: 13, color: '#757575', lineHeight: 19, marginBottom: 18 },
  emailHighlight: { color: '#2E7D32', fontWeight: '700' },
  fieldLabel:     { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 12 },

  // Demo box
  demoBox:      { backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD54F', padding: 16, marginBottom: 14, alignItems: 'center' },
  demoBoxTitle: { fontSize: 13, fontWeight: '700', color: '#795548', marginBottom: 8, textAlign: 'center' },
  demoBoxCode:  { fontSize: 28, fontWeight: '900', color: '#2E7D32', letterSpacing: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 8 },
  demoBoxNote:  { fontSize: 11, color: '#9E9E9E', textAlign: 'center', lineHeight: 16 },

  // Timer
  timerBox:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1F8E9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 6, borderWidth: 1, borderColor: '#C8E6C9' },
  timerBoxExpired:  { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  timerLabel:       { fontSize: 13, color: '#558B2F', fontWeight: '600' },
  timerValue:       { fontSize: 20, fontWeight: '900', color: '#2E7D32', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  timerValueUrgent: { color: '#E53935' },
  timerTextExpired: { fontSize: 14, color: '#C62828', fontWeight: '700', flex: 1, textAlign: 'center' },

  // Input
  input: {
    backgroundColor: '#F9F9F9', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1B1B1B',
  },
  codeInput: { fontSize: 22, fontWeight: '800', letterSpacing: 6, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  inputErr:  { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt:    { color: '#E53935', fontSize: 12, marginTop: 5, fontWeight: '500' },

  // Button
  btn:        { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  btnDisabled:{ backgroundColor: '#81C784' },
  btnText:    { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },

  // Resend
  resendRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  resendPrompt: { fontSize: 13, color: '#757575' },
  resendLink:   { fontSize: 13, color: '#2E7D32', fontWeight: '800', marginLeft: 4 },

  // Skip
  skipLink:     { marginTop: 14, alignItems: 'center' },
  skipLinkText: { color: '#9E9E9E', fontSize: 13 },

  // Login-block note
  loginBlockNote:     { marginTop: 16, backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1, borderColor: '#FFD54F', padding: 14 },
  loginBlockNoteText: { fontSize: 12, color: '#795548', textAlign: 'center', lineHeight: 18 },

  // Success screen
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  successCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    borderWidth: 1, borderColor: '#F0F0F0', marginTop: 20,
  },
  successEmoji: { fontSize: 60, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#2E7D32', textAlign: 'center', marginBottom: 10 },
  successMsg:   { fontSize: 14, color: '#555555', textAlign: 'center', lineHeight: 21, marginBottom: 14 },
  infoBox:      { backgroundColor: '#F1F8E9', borderRadius: 12, borderWidth: 1, borderColor: '#C8E6C9', padding: 14, marginBottom: 20, width: '100%' },
  infoBoxText:  { fontSize: 12, color: '#4CAF50', lineHeight: 18, textAlign: 'center' },
});

export default EmailVerificationScreen;
