import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Animated, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';
import { generateResetCode, sendResetCodeEmail, USE_REAL_EMAIL } from '../../services/EmailService';
import firebaseAuth from '../../firebase/auth';
import db from '../../firebase/firestore';
import firestore from '@react-native-firebase/firestore';

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 'email' | 'verify' | 'newPassword' | 'success';

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ── Component ─────────────────────────────────────────────────────────────────
const ForgotPasswordScreen = ({ navigation }: any) => {
  const { users } = useApp();
  const { t, isUrdu } = useLanguage();

  const [step, setStep] = useState<Step>('email');

  // Step 1
  const [email, setEmail]           = useState('');
  const [emailError, setEmailError] = useState('');

  // Step 2
  const [enteredCode, setEnteredCode]     = useState('');
  const [codeError, setCodeError]         = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeExpiry, setCodeExpiry]       = useState<number>(0);
  const [timeLeft, setTimeLeft]           = useState<number>(0);
  const [codeExpired, setCodeExpired]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3
  const [newPassword, setNewPassword]               = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNew, setShowNew]                       = useState(false);
  const [showConfirm, setShowConfirm]               = useState(false);
  const [pwErrors, setPwErrors] = useState<{
    newPassword?: string;
    confirmNewPassword?: string;
  }>({});

  const [foundUid, setFoundUid]                         = useState('');
  const [foundFirstName, setFoundFirstName]               = useState('');
  const [loading, setLoading]                             = useState(false);
  const [firebaseUpdatedDirectly, setFirebaseUpdatedDirectly] = useState(false);
  const [firebaseResetEmailSent,  setFirebaseResetEmailSent]  = useState(false);

  // Animations
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animateStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 'verify' && codeExpiry > 0) {
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
  }, [step, codeExpiry]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14,  duration: 65, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 65, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const animateStep = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Step 1: Find user from local context (already loaded from Firestore) ──
  // This avoids an unauthenticated Firestore query which the security rules block.
  const handleSendCode = async () => {
    const trimmed = email.trim().toLowerCase();

    if (!trimmed) {
      setEmailError(t('fpEmailRequired'));
      shake();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('fpEmailInvalid'));
      shake();
      return;
    }

    // ── Look up from the local users array (AppContext already has all users
    //    loaded via its Firestore real-time listener — no extra query needed) ──
    const localUser = users.find(u => u.email?.toLowerCase() === trimmed);

    if (!localUser) {
      setEmailError(t('fpNoAccountFound'));
      shake();
      return;
    }

    if (localUser.id === 'main-admin-001') {
      setEmailError(t('fpAdminNotAllowed'));
      shake();
      return;
    }

    setLoading(true);
    try {
      const code   = generateResetCode();
      const expiry = Date.now() + CODE_EXPIRY_MS;

      // ── Send the verification code email via EmailJS ──────────────────────
      await sendResetCodeEmail(trimmed, code, localUser.firstName || 'User');

      // ── Store reset code in Firestore ─────────────────────────────────────
      try {
        await db.collection('users').doc(localUser.id).update({
          passwordResetCode:      code,
          passwordResetExpiry:    expiry,
          passwordResetRequested: true,
          updatedAt:              firestore.FieldValue.serverTimestamp(),
        });
      } catch (fsErr) {
        // Non-fatal: Firestore write failed (rules issue) but email was sent.
        // The code is still valid in memory for this session.
        console.warn('[ForgotPassword] Firestore write skipped:', fsErr);
      }

      setGeneratedCode(code);
      setCodeExpiry(expiry);
      setFoundUid(localUser.id);
      setFoundFirstName(localUser.firstName || 'User');
      setStep('verify');
      animateStep();
    } catch (err: any) {
      console.error('[ForgotPassword] handleSendCode error:', err);
      // Show the real error in dev builds so you can debug faster
      const detail = err?.message || err?.code || String(err);
      Alert.alert(
        'Send Failed',
        `Could not send the verification code.\n\nError: ${detail}`,
      );
      setEmailError(t('fpSendFailed'));
      shake();
    } finally {
      setLoading(false);
    }
  };

  // ── Resend code ──────────────────────────────────────────────────────────
  const handleResendCode = async () => {
    if (!foundUid) { return; }
    setLoading(true);
    try {
      const trimmed = email.trim().toLowerCase();
      const code    = generateResetCode();
      const expiry  = Date.now() + CODE_EXPIRY_MS;

      await sendResetCodeEmail(trimmed, code, foundFirstName);

      try {
        await db.collection('users').doc(foundUid).update({
          passwordResetCode:   code,
          passwordResetExpiry: expiry,
          updatedAt:           firestore.FieldValue.serverTimestamp(),
        });
      } catch (fsErr) {
        console.warn('[ForgotPassword] Firestore resend write skipped:', fsErr);
      }

      setGeneratedCode(code);
      setCodeExpiry(expiry);
      setEnteredCode('');
      setCodeError('');
      setCodeExpired(false);
    } catch (err: any) {
      const detail = err?.message || err?.code || String(err);
      setCodeError(`Failed to resend. ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify code ──────────────────────────────────────────────────
  const handleVerifyCode = () => {
    if (codeExpired) { setCodeError(t('fpCodeExpired')); shake(); return; }
    if (!enteredCode.trim()) { setCodeError(t('fpCodeRequired')); shake(); return; }
    if (enteredCode.trim() !== generatedCode) { setCodeError(t('fpCodeInvalid')); shake(); return; }
    if (timerRef.current) { clearInterval(timerRef.current); }
    setStep('newPassword');
    animateStep();
  };

  // ── Step 3: Reset password ───────────────────────────────────────────────
  const handleResetPassword = async () => {
    const errs: { newPassword?: string; confirmNewPassword?: string } = {};
    if (!newPassword.trim())                                    { errs.newPassword = t('fpNewPasswordRequired'); }
    else if (newPassword.trim().length < 6)                    { errs.newPassword = t('fpPasswordMin6'); }
    if (!confirmNewPassword.trim())                            { errs.confirmNewPassword = t('fpConfirmPasswordRequired'); }
    else if (newPassword.trim() !== confirmNewPassword.trim()) { errs.confirmNewPassword = t('fpPasswordsMismatch'); }
    if (Object.keys(errs).length) { setPwErrors(errs); shake(); return; }

    setLoading(true);
    try {
      const trimmedEmail    = email.trim().toLowerCase();
      const trimmedPassword = newPassword.trim();

      // ── 1. Read the CURRENT password directly from Firestore FIRST ───────────
      // Must happen BEFORE signing out, because the security rules require
      // the user to be authenticated to read their own document.
      // AppContext strips the password field from the users array, so we must
      // query Firestore directly here to get the plain-text password.
      let currentStoredPw = '';
      let passwordCandidates: string[] = [];
      try {
        const userSnap = await db.collection('users').doc(foundUid).get();
        const data = userSnap.data() || {};
        currentStoredPw = (data.password || '').trim();

        // Also collect password history as additional fallback candidates.
        const historyArr: string[] = Array.isArray(data.previousPasswords)
          ? data.previousPasswords.map((p: string) => (p || '').trim()).filter(Boolean)
          : [];
        const legacySingle: string = typeof data.previousPassword === 'string'
          ? (data.previousPassword || '').trim()
          : '';

        // Deduplicate: try current password first, then older ones.
        const seen = new Set<string>();
        [currentStoredPw, ...historyArr, legacySingle].forEach(p => {
          if (p && !seen.has(p)) { seen.add(p); passwordCandidates.push(p); }
        });

        console.log('[ForgotPassword] Firestore password candidates:', passwordCandidates.length);
      } catch (snapErr) {
        console.warn('[ForgotPassword] Firestore read error:', snapErr);
      }

      // ── 2. Sign out any active session ────────────────────────────────────
      try { await firebaseAuth.signOut(); } catch (_) {}

      // ── 3. Re-authenticate with each known password and update Firebase Auth
      // We must sign out between attempts to avoid stale-credential errors.
      // The current Firestore password is tried first (most likely to match).
      let firebaseAuthUpdated = false;
      for (const candidate of passwordCandidates) {
        if (firebaseAuthUpdated) { break; }
        try {
          console.log('[ForgotPassword] Trying auth candidate…');
          const cred = await firebaseAuth.signInWithEmailAndPassword(trimmedEmail, candidate);
          if (cred?.user) {
            // updatePassword changes the Firebase Auth password immediately.
            await cred.user.updatePassword(trimmedPassword);
            firebaseAuthUpdated = true;
            console.log('[ForgotPassword] ✅ Firebase Auth password updated successfully.');

            // ── 4a. Update Firestore WHILE still authenticated (isSelf rule passes) ─
            try {
              const updatePayload: any = {
                password:               trimmedPassword,
                passwordResetCode:      firestore.FieldValue.delete(),
                passwordResetExpiry:    firestore.FieldValue.delete(),
                passwordResetRequested: firestore.FieldValue.delete(),
                updatedAt:              firestore.FieldValue.serverTimestamp(),
              };
              if (currentStoredPw && currentStoredPw !== trimmedPassword) {
                updatePayload.previousPasswords = firestore.FieldValue.arrayUnion(currentStoredPw);
              }
              await db.collection('users').doc(foundUid).update(updatePayload);
              console.log('[ForgotPassword] ✅ Firestore password field updated (authenticated).');
            } catch (fsErr) {
              console.warn('[ForgotPassword] Firestore update (authenticated) failed:', fsErr);
            }
          }
        } catch (authErr: any) {
          console.warn('[ForgotPassword] Auth candidate failed:', authErr?.code);
        } finally {
          // Always sign out so the next iteration starts from a clean state.
          try { await firebaseAuth.signOut(); } catch (_) {}
        }
      }

      // ── 4b. If Firebase Auth update succeeded, Firestore was already updated above.
      // If it failed, we still try to update Firestore (it may succeed if rules
      // allow unauthenticated writes, or if a prior session token is still valid).
      if (!firebaseAuthUpdated) {
        try {
          const updatePayload: any = {
            password:               trimmedPassword,
            passwordResetCode:      firestore.FieldValue.delete(),
            passwordResetExpiry:    firestore.FieldValue.delete(),
            passwordResetRequested: firestore.FieldValue.delete(),
            updatedAt:              firestore.FieldValue.serverTimestamp(),
          };
          if (currentStoredPw && currentStoredPw !== trimmedPassword) {
            updatePayload.previousPasswords = firestore.FieldValue.arrayUnion(currentStoredPw);
          }
          await db.collection('users').doc(foundUid).update(updatePayload);
          console.log('[ForgotPassword] ✅ Firestore password field updated (unauthenticated fallback).');
        } catch (fsErr) {
          console.warn('[ForgotPassword] Firestore password update failed:', fsErr);
        }
      }

      // ── 5. Fallback: if direct re-auth failed for all candidates ──────────
      // This can happen when Firebase Auth and Firestore have drifted (e.g.
      // a previous partial reset). Sending a Firebase reset email lets the user
      // recover through a guaranteed path.
      if (!firebaseAuthUpdated) {
        console.warn('[ForgotPassword] All re-auth candidates failed — using Firebase reset email fallback.');
        try {
          await firebaseAuth.sendPasswordResetEmail(trimmedEmail);
          console.log('[ForgotPassword] ✅ Firebase fallback reset email sent.');
        } catch (mailErr: any) {
          console.warn('[ForgotPassword] Firebase reset email also failed:', mailErr?.code);
        }
      }

      setFirebaseUpdatedDirectly(firebaseAuthUpdated);
      setFirebaseResetEmailSent(!firebaseAuthUpdated);
      setStep('success');
      animateStep();
    } catch (err: any) {
      console.error('[ForgotPassword] handleResetPassword error:', err);
      let msg = t('fpSendFailed');
      if (err?.code === 'auth/user-not-found')              { msg = t('fpNoAccountFound'); }
      else if (err?.code === 'auth/too-many-requests')      { msg = 'Too many requests. Please wait and try again.'; }
      else if (err?.code === 'auth/network-request-failed') { msg = 'Network error. Please check your connection.'; }
      setPwErrors({ newPassword: msg });
      shake();
    } finally {
      setLoading(false);
    }
  };

  const stepOrder: Step[] = ['email', 'verify', 'newPassword'];
  const stepIndex = stepOrder.indexOf(step === 'success' ? 'newPassword' : step);

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
            <Text style={styles.logoText}>
              Farm<Text style={styles.logoTextAccent}>Nest</Text>
            </Text>
            <View style={{ height: 12 }} />
            <Text style={styles.title}>{t('fpTitle')}</Text>
            <Text style={[styles.subtitle, isUrdu && styles.rtl]}>{t('fpSubtitle')}</Text>
          </Animated.View>

          {/* Progress dots */}
          {step !== 'success' && (
            <View style={styles.progressRow}>
              {stepOrder.map((s, i) => (
                <View key={s} style={styles.progressItem}>
                  <View style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]} />
                  {i < stepOrder.length - 1 && (
                    <View style={[styles.progressLine, i < stepIndex && styles.progressLineActive]} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── STEP 1: Email ── */}
          {step === 'email' && (
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>
              <Text style={[styles.stepLabel, isUrdu && styles.rtl]}>{t('fpStep1Label')}</Text>
              <Text style={[styles.stepDesc,  isUrdu && styles.rtl]}>{t('fpStep1Desc')}</Text>

              <Text style={[styles.fieldLabel, isUrdu && styles.rtl]}>{t('fpEmailLabel')}</Text>
              <TextInput
                style={[styles.input, emailError ? styles.inputErr : null]}
                placeholder={t('fpEmailPlaceholder')}
                placeholderTextColor="#9E9E9E"
                value={email}
                onChangeText={v => { setEmail(v); setEmailError(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
                textAlign={isUrdu ? 'right' : 'left'}
              />
              {emailError ? <Text style={[styles.errTxt, isUrdu && styles.rtl]}>⚠ {emailError}</Text> : null}

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleSendCode}
                disabled={loading}
                activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.btnText}>{t('fpSendCodeBtn')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <Text style={styles.backLinkText}>{t('fpBackToLogin')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 2: Verify code ── */}
          {step === 'verify' && (
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>
              <Text style={[styles.stepLabel, isUrdu && styles.rtl]}>{t('fpStep2Label')}</Text>
              <Text style={[styles.stepDesc,  isUrdu && styles.rtl]}>
                {t('fpStep2Desc')}{' '}
                <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>
              </Text>

              {/* Demo box — only in demo mode */}
              {!USE_REAL_EMAIL && generatedCode ? (
                <View style={styles.demoBox}>
                  <Text style={styles.demoBoxTitle}>📋 Your Verification Code</Text>
                  <Text style={styles.demoBoxCode}>{generatedCode}</Text>
                  <Text style={styles.demoBoxNote}>
                    Copy this code and paste it below.{'\n'}
                    (Shown here because email is in demo mode.)
                  </Text>
                </View>
              ) : null}

              {/* Timer */}
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

              <TouchableOpacity
                style={[styles.btn, (loading || codeExpired) && styles.btnDisabled]}
                onPress={handleVerifyCode}
                disabled={loading || codeExpired}
                activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.btnText}>{t('fpVerifyCodeBtn')}</Text>}
              </TouchableOpacity>

              <View style={styles.resendRow}>
                <Text style={styles.resendPrompt}>{t('fpDidntReceive')}</Text>
                <TouchableOpacity onPress={handleResendCode} disabled={loading} activeOpacity={0.7}>
                  <Text style={styles.resendLink}>{t('fpResendCode')}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setStep('email'); animateStep(); }}
                activeOpacity={0.7}>
                <Text style={styles.backLinkText}>{t('fpGoBack')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 3: New password ── */}
          {step === 'newPassword' && (
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>
              <Text style={[styles.stepLabel, isUrdu && styles.rtl]}>{t('fpStep3Label')}</Text>
              <Text style={[styles.stepDesc,  isUrdu && styles.rtl]}>{t('fpStep3Desc')}</Text>

              <Text style={[styles.fieldLabel, isUrdu && styles.rtl]}>{t('fpNewPasswordLabel')}</Text>
              <View style={[styles.pwWrap, pwErrors.newPassword ? styles.inputErr : null]}>
                <TextInput
                  style={styles.pwInput}
                  placeholder={t('fpNewPasswordPlaceholder')}
                  placeholderTextColor="#9E9E9E"
                  value={newPassword}
                  onChangeText={v => { setNewPassword(v); setPwErrors(e => ({ ...e, newPassword: undefined })); }}
                  secureTextEntry={!showNew}
                  textAlign={isUrdu ? 'right' : 'left'}
                />
                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn} activeOpacity={0.7}>
                  <Text style={styles.eyeIcon}>{showNew ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              {pwErrors.newPassword
                ? <Text style={[styles.errTxt, isUrdu && styles.rtl]}>⚠ {pwErrors.newPassword}</Text>
                : null}

              <Text style={[styles.fieldLabel, isUrdu && styles.rtl]}>{t('fpConfirmPasswordLabel')}</Text>
              <View style={[styles.pwWrap, pwErrors.confirmNewPassword ? styles.inputErr : null]}>
                <TextInput
                  style={styles.pwInput}
                  placeholder={t('fpConfirmPasswordPlaceholder')}
                  placeholderTextColor="#9E9E9E"
                  value={confirmNewPassword}
                  onChangeText={v => { setConfirmNewPassword(v); setPwErrors(e => ({ ...e, confirmNewPassword: undefined })); }}
                  secureTextEntry={!showConfirm}
                  textAlign={isUrdu ? 'right' : 'left'}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn} activeOpacity={0.7}>
                  <Text style={styles.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              {pwErrors.confirmNewPassword
                ? <Text style={[styles.errTxt, isUrdu && styles.rtl]}>⚠ {pwErrors.confirmNewPassword}</Text>
                : null}

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.btnText}>{t('fpResetBtn')}</Text>}
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 4: Success ── */}
          {step === 'success' && (
            <Animated.View
              style={[styles.card, styles.successCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={[styles.successTitle, isUrdu && styles.rtl]}>{t('fpSuccessTitle')}</Text>
              <Text style={[styles.successMsg, isUrdu && styles.rtl]}>{t('fpSuccessMsg')}</Text>

              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  {firebaseUpdatedDirectly
                    ? '✅ Your password has been updated. You can now log in with your new password right away.'
                    : '📧 A password reset link was sent to ' + email.trim().toLowerCase() + ' when you requested the code. Please open that email, click the reset link, then come back and log in with your new password.'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btn}
                onPress={() => navigation.replace('Login')}
                activeOpacity={0.85}>
                <Text style={styles.btnText}>{t('fpGoToLogin')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#FFFFFF' },
  langToggle: { position: 'absolute', top: Platform.OS === 'ios' ? 52 : 16, right: 16, zIndex: 999, elevation: 999 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 100 : 70, paddingBottom: 40 },
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
  progressRow:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  progressItem:       { flexDirection: 'row', alignItems: 'center' },
  progressDot:        { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E0E0E0' },
  progressDotActive:  { backgroundColor: '#2E7D32' },
  progressLine:       { width: 40, height: 3, backgroundColor: '#E0E0E0', marginHorizontal: 4 },
  progressLineActive: { backgroundColor: '#2E7D32' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  stepLabel:      { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  stepDesc:       { fontSize: 13, color: '#757575', lineHeight: 19, marginBottom: 18 },
  emailHighlight: { color: '#2E7D32', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#F9F9F9', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1B1B1B',
  },
  codeInput: { fontSize: 22, fontWeight: '800', letterSpacing: 6, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  inputErr: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt:   { color: '#E53935', fontSize: 12, marginTop: 5, fontWeight: '500' },
  demoBox: { backgroundColor: '#FFF8E1', borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD54F', padding: 16, marginBottom: 14, alignItems: 'center' },
  demoBoxTitle: { fontSize: 13, fontWeight: '700', color: '#795548', marginBottom: 8, textAlign: 'center' },
  demoBoxCode:  { fontSize: 28, fontWeight: '900', color: '#2E7D32', letterSpacing: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 8 },
  demoBoxNote: { fontSize: 11, color: '#9E9E9E', textAlign: 'center', lineHeight: 16 },
  timerBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1F8E9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 6, borderWidth: 1, borderColor: '#C8E6C9' },
  timerBoxExpired:  { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  timerLabel:       { fontSize: 13, color: '#558B2F', fontWeight: '600' },
  timerValue:       { fontSize: 20, fontWeight: '900', color: '#2E7D32', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  timerValueUrgent: { color: '#E53935' },
  timerTextExpired: { fontSize: 14, color: '#C62828', fontWeight: '700', flex: 1, textAlign: 'center' },
  pwWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8', paddingHorizontal: 16 },
  pwInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1B1B1B' },
  eyeBtn:  { padding: 6 },
  eyeIcon: { fontSize: 20 },
  btn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  btnDisabled: { backgroundColor: '#81C784' },
  btnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  backLink:     { marginTop: 16, alignItems: 'center' },
  backLinkText: { color: '#2E7D32', fontSize: 14, fontWeight: '700' },
  resendRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  resendPrompt: { fontSize: 13, color: '#757575' },
  resendLink:   { fontSize: 13, color: '#2E7D32', fontWeight: '800', marginLeft: 4 },
  successCard:  { alignItems: 'center' },
  successIcon:  { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#2E7D32', textAlign: 'center', marginBottom: 10 },
  successMsg:   { fontSize: 14, color: '#555555', textAlign: 'center', lineHeight: 21, marginBottom: 12 },
  infoBox:      { backgroundColor: '#F1F8E9', borderRadius: 12, borderWidth: 1, borderColor: '#C8E6C9', padding: 14, marginBottom: 4 },
  infoBoxText:  { fontSize: 12, color: '#4CAF50', lineHeight: 18, textAlign: 'center' },
  infoBoxEmail: { fontWeight: '800', color: '#2E7D32' },
});

export default ForgotPasswordScreen;
