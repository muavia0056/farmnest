import React, { useState, useRef, useCallback } from 'react';
import LivenessDetectionModal from '../../components/LivenessDetectionModal';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Animated,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';
import {registerUserInFirebase, setRegistrationInProgress} from '../../services/firebaseAuthService';
import { generateResetCode, sendVerificationCodeEmail } from '../../services/EmailService';

const { width } = Dimensions.get('window');

type Role = 'Farmer' | 'Buyer' | 'Investor' | 'Admin';

const RegisterScreen = ({ navigation }: any) => {
  const { setLastRegisteredName } = useApp();
  const { t, isUrdu } = useLanguage();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [cnic, setCnic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('Farmer');
  const [cnicFrontImage, setCnicFrontImage] = useState<string | null>(null);
  const [cnicBackImage, setCnicBackImage] = useState<string | null>(null);
  const [livenessVideoUri, setLivenessVideoUri] = useState<string | null>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!firstName.trim()) newErrors.firstName = t('firstNameRequired');
    if (!lastName.trim()) newErrors.lastName = t('lastNameRequired');

    if (!email.trim()) {
      newErrors.email = t('emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('validEmail');
    }

    if (!phone.trim()) {
      newErrors.phone = t('phoneRequired');
    } else if (!/^\d+$/.test(phone)) {
      newErrors.phone = t('phoneNumbersOnly');
    } else if (phone.trim().length !== 11) {
      newErrors.phone = t('phoneMust11Digits');
    }

    if (!city.trim()) newErrors.city = t('cityRequired');
    if (!address.trim()) newErrors.address = t('addressRequired');

    // CNIC number required for ALL roles including Admin
    if (!cnic.trim()) {
      newErrors.cnic = t('cnicRequired');
    } else if (!/^\d+$/.test(cnic)) {
      newErrors.cnic = t('cnicNumbersOnly');
    } else if (cnic.trim().length !== 13) {
      newErrors.cnic = t('cnicMust13Digits');
    }

    // CNIC images required for ALL roles including Admin
    if (!cnicFrontImage) newErrors.cnicFront = t('cnicFrontRequired');
    if (!cnicBackImage) newErrors.cnicBack = t('cnicBackRequired');

    if (!livenessVideoUri) newErrors.selfie = isUrdu ? 'لائیونس ویریفیکیشن ضروری ہے' : 'Liveness verification is required';

    if (!password.trim()) {
      newErrors.password = t('passwordRequired2');
    } else if (password.length < 6) {
      newErrors.password = t('passwordMinLength');
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = t('confirmPasswordRequired');
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = t('passwordsDontMatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const pickCnicImage = async (side: 'front' | 'back') => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets && result.assets[0]) {
      if (side === 'front') setCnicFrontImage(result.assets[0].uri || null);
      else setCnicBackImage(result.assets[0].uri || null);
    }
  };

  const handleLivenessSuccess = useCallback((videoUri: string) => {
    setLivenessVideoUri(videoUri);
    setShowLiveness(false);
    setErrors(e => ({ ...e, selfie: '' }));
  }, []);

  const handleRegister = async () => {
  if (!validate()) {
    shakeError();
    return;
  }

  try {
    setLoading(true);

    const { uid: newUid } = await registerUserInFirebase({
      firstName,
      lastName,
      email,
      password,
      phone,
      role,
      city,
      address,
      cnic,
      // Pass local image URIs so they get uploaded to Firebase Storage
      cnicFrontUri:     cnicFrontImage,
      cnicBackUri:      cnicBackImage,
      livenessVideoUri: livenessVideoUri,
    });

    setLastRegisteredName(`${firstName.trim()} ${lastName.trim()}`);

    // ── Generate & send email-verification code ───────────────────────────
    const verifyCode   = generateResetCode();
    const verifyExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

    try {
      await sendVerificationCodeEmail(
        email.trim().toLowerCase(),
        verifyCode,
        firstName.trim(),
      );
    } catch (mailErr) {
      // Non-fatal: if email fails, still navigate so user can request a resend
      console.warn('[Registration] Verification email failed:', mailErr);
    }

    setLoading(false);

    // Navigate to the email verification screen.
    // IMPORTANT: setRegistrationInProgress(false) is called AFTER navigation.replace
    // so that the async onAuthStateChanged(null) callback (triggered by the signOut
    // inside registerUserInFirebase) still sees the flag = true and stays silent.
    // AuthBootstrap's HANDS_OFF_SCREENS guard provides a second layer of protection.
    navigation.replace('EmailVerification', {
      email:     email.trim().toLowerCase(),
      firstName: firstName.trim(),
      code:      verifyCode,
      expiry:    verifyExpiry,
      uid:       newUid,
      password:  password.trim(),
    });
    setRegistrationInProgress(false); // ← cleared AFTER navigation
  } catch (error: any) {
    setLoading(false);

    // Show the actual error code so we can diagnose the issue
    const errCode = error?.code || error?.message || String(error);
    let message = `Registration failed (${errCode}). Please try again.`;

    if (error.code === 'auth/email-already-in-use') {
      message = 'This email is already registered.';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Invalid email address.';
    } else if (error.code === 'auth/weak-password') {
      message = 'Password should be at least 6 characters.';
    } else if (
      error.code === 'permission-denied' ||
      error.code === 'firestore/permission-denied'
    ) {
      message =
        'Firestore rules blocked the request. Please check Firestore Rules.';
    } else if (error.code === 'storage/unauthorized') {
      message =
        'Image upload was blocked. Please check Firebase Storage rules.';
    }

    Alert.alert('Registration Error', message);
    console.log('Registration error:', error);
  }
};

  const roles: Role[] = ['Farmer', 'Buyer', 'Investor', 'Admin'];

  const roleColors: Record<Role, string> = {
    Farmer: '#2E7D32',
    Buyer: '#1565C0',
    Investor: '#6A1B9A',
    Admin: '#BF360C',
  };

  const renderError = (field: string) =>
    errors[field] ? (
      <Text style={styles.errorText}>⚠ {errors[field]}</Text>
    ) : null;

  return (
    <View style={styles.outerContainer}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Language Toggle */}
          <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>
            <LanguageToggle accentColor="#2E7D32" />
          </View>

          <Animated.View
            style={[
              styles.headerSection,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}>
            <View style={styles.logoIconWrap}>
              <Text style={styles.logoIcon}>🌿</Text>
            </View>
            <Text style={styles.logoText}>Farm <Text style={styles.logoTextAccent}>Nest</Text></Text>
            <Text style={styles.logoTagline}>{t('joinCommunity')}</Text>
            <Text style={[styles.screenTitle, isUrdu && styles.rtlText]}>{t('createAccountTitle')}</Text>
            <Text style={[styles.screenSubtitle, isUrdu && styles.rtlText]}>{t('joinCommunity')}</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formCard,
              { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] },
            ]}>

            {/* Role Selector */}
            <Text style={[styles.sectionLabel, isUrdu && styles.rtlText]}>{t('selectRole')}</Text>
            <View style={styles.roleContainer}>
              {roles.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleBtn,
                    role === r && {
                      backgroundColor: roleColors[r],
                      borderColor: roleColors[r],
                    },
                  ]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.roleBtnText,
                      role === r && styles.roleBtnTextActive,
                    ]}>
                    {r === 'Farmer' ? '🌾' : r === 'Buyer' ? '🛒' : r === 'Investor' ? '💼' : '🛡️'} {r === 'Farmer' ? t('farmerRole') : r === 'Buyer' ? t('buyerRole') : r === 'Investor' ? t('investorRole') : t('adminRole')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* First Name */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('firstName')}</Text>
            <TextInput
              style={[styles.input, errors.firstName ? styles.inputError : null]}
              placeholder={t('enterFirstName')}
              placeholderTextColor="#9E9E9E"
              value={firstName}
              onChangeText={v => { setFirstName(v); setErrors(e => ({ ...e, firstName: '' })); }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('firstName')}

            {/* Last Name */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('lastName')}</Text>
            <TextInput
              style={[styles.input, errors.lastName ? styles.inputError : null]}
              placeholder={t('enterLastName')}
              placeholderTextColor="#9E9E9E"
              value={lastName}
              onChangeText={v => { setLastName(v); setErrors(e => ({ ...e, lastName: '' })); }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('lastName')}

            {/* Email */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('emailAddress')}</Text>
            <TextInput
              style={[styles.input, errors.email ? styles.inputError : null]}
              placeholder={t('enterEmail')}
              placeholderTextColor="#9E9E9E"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={v => { setEmail(v); setErrors(e => ({ ...e, email: '' })); }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('email')}

            {/* Phone */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('phoneNumber')}</Text>
            <TextInput
              style={[styles.input, errors.phone ? styles.inputError : null]}
              placeholder={t('enterPhone')}
              placeholderTextColor="#9E9E9E"
              keyboardType="numeric"
              value={phone}
              onChangeText={v => {
                if (/^\d*$/.test(v)) {
                  setPhone(v);
                  setErrors(e => ({ ...e, phone: '' }));
                } else {
                  setErrors(e => ({ ...e, phone: t('phoneNumbersOnly') }));
                }
              }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('phone')}

            {/* City */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('city')}</Text>
            <TextInput
              style={[styles.input, errors.city ? styles.inputError : null]}
              placeholder={t('enterCity')}
              placeholderTextColor="#9E9E9E"
              value={city}
              onChangeText={v => { setCity(v); setErrors(e => ({ ...e, city: '' })); }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('city')}

            {/* Address */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('completeAddress')}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, errors.address ? styles.inputError : null]}
              placeholder={t('enterAddress')}
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={3}
              value={address}
              onChangeText={v => { setAddress(v); setErrors(e => ({ ...e, address: '' })); }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('address')}

            {/* CNIC Number — shown for ALL roles including Admin */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('cnicNumber')}</Text>
            <TextInput
              style={[styles.input, errors.cnic ? styles.inputError : null]}
              placeholder={t('enterCnic')}
              placeholderTextColor="#9E9E9E"
              keyboardType="numeric"
              value={cnic}
              onChangeText={v => {
                if (/^\d*$/.test(v)) {
                  setCnic(v);
                  setErrors(e => ({ ...e, cnic: '' }));
                } else {
                  setErrors(e => ({ ...e, cnic: t('cnicMustNumbers') }));
                }
              }}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {renderError('cnic')}

            {/* CNIC Images — shown for ALL roles including Admin */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('cnicFrontImage')}</Text>
            <TouchableOpacity
              style={[styles.imagePicker, errors.cnicFront ? styles.imagePickerError : null]}
              onPress={() => pickCnicImage('front')}
              activeOpacity={0.8}>
              {cnicFrontImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: cnicFrontImage }} style={styles.imagePreview} />
                  <View style={styles.imageOverlay}>
                    <Text style={styles.imageOverlayText}>{t('frontImageSelected')}</Text>
                    <Text style={styles.imageChangeTxt}>{t('tapToChange')}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.imagePickerInner}>
                  <Text style={styles.imagePickerIcon}>📷</Text>
                  <Text style={styles.imagePickerText}>{t('uploadFrontCnic')}</Text>
                  <Text style={styles.imagePickerSub}>{t('tapSelectGallery')}</Text>
                </View>
              )}
            </TouchableOpacity>
            {renderError('cnicFront')}

            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('cnicBackImage')}</Text>
            <TouchableOpacity
              style={[styles.imagePicker, errors.cnicBack ? styles.imagePickerError : null]}
              onPress={() => pickCnicImage('back')}
              activeOpacity={0.8}>
              {cnicBackImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: cnicBackImage }} style={styles.imagePreview} />
                  <View style={styles.imageOverlay}>
                    <Text style={styles.imageOverlayText}>{t('backImageSelected')}</Text>
                    <Text style={styles.imageChangeTxt}>{t('tapToChange')}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.imagePickerInner}>
                  <Text style={styles.imagePickerIcon}>📷</Text>
                  <Text style={styles.imagePickerText}>{t('uploadBackCnic')}</Text>
                  <Text style={styles.imagePickerSub}>{t('tapSelectGallery')}</Text>
                </View>
              )}
            </TouchableOpacity>
            {renderError('cnicBack')}

            {/* ── Liveness Detection ── */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>
              {isUrdu ? 'لائیو ویریفیکیشن' : 'Live Identity Verification'}
            </Text>
            <TouchableOpacity
              style={[
                styles.livenessPicker,
                errors.selfie ? styles.imagePickerError : null,
                livenessVideoUri ? styles.livenessPickerDone : null,
              ]}
              onPress={() => setShowLiveness(true)}
              activeOpacity={0.85}>
              {livenessVideoUri ? (
                <View style={styles.livenessSuccessInner}>
                  <Text style={styles.livenessSuccessIcon}>✅</Text>
                  <Text style={styles.livenessSuccessTitle}>
                    {isUrdu ? 'لائیونس ویریفیکیشن مکمل' : 'Liveness Verified!'}
                  </Text>
                  <Text style={styles.livenessSuccessSub}>
                    {isUrdu ? 'دوبارہ ریکارڈ کرنے کے لیے ٹیپ کریں' : 'Tap to re-record'}
                  </Text>
                </View>
              ) : (
                <View style={styles.imagePickerInner}>
                  <Text style={styles.imagePickerIcon}>🎥</Text>
                  <Text style={styles.imagePickerText}>
                    {isUrdu ? 'لائیو ویریفیکیشن شروع کریں' : 'Start Live Verification'}
                  </Text>
                  <Text style={styles.imagePickerSub}>
                    {isUrdu
                      ? 'AI فراڈ سے بچاؤ کے لیے ضروری'
                      : 'Required to prevent AI identity fraud'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {renderError('selfie')}

            {/* Password */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('password')}</Text>
            <View style={[styles.passwordContainer, errors.password ? styles.inputError : null]}>
              <TextInput
                style={[styles.passwordInput, isUrdu && styles.rtlInput]}
                placeholder={t('enterPassword')}
                placeholderTextColor="#9E9E9E"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={v => { setPassword(v); setErrors(e => ({ ...e, password: '' })); }}
                textAlign={isUrdu ? 'right' : 'left'}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {renderError('password')}

            {/* Confirm Password */}
            <Text style={[styles.inputLabel, isUrdu && styles.rtlText]}>{t('confirmPassword')}</Text>
            <View style={[styles.passwordContainer, errors.confirmPassword ? styles.inputError : null]}>
              <TextInput
                style={[styles.passwordInput, isUrdu && styles.rtlInput]}
                placeholder={t('reEnterPassword')}
                placeholderTextColor="#9E9E9E"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); setErrors(e => ({ ...e, confirmPassword: '' })); }}
                textAlign={isUrdu ? 'right' : 'left'}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Text style={styles.eyeIcon}>{showConfirmPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {renderError('confirmPassword')}

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleRegister}
              activeOpacity={0.85}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.registerBtnText}>{t('createAccountBtn')}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginLinkRow}>
              <Text style={styles.loginLinkText}>{t('alreadyHaveAccount')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLinkBtn}>{t('signInLink')}</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Liveness overlay — OUTSIDE ScrollView so it covers full screen ── */}
      <LivenessDetectionModal
        visible={showLiveness}
        isUrdu={isUrdu}
        onClose={() => setShowLiveness(false)}
        onSuccess={handleLivenessSuccess}
      />

    </View>
  );
};

const styles = StyleSheet.create({
  logoIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: '#C8E6C9',
  },
  logoIcon: { fontSize: 40 },
  logoText: { fontSize: 36, fontWeight: '900', color: '#1B1B1B', letterSpacing: 1 },
  logoTextAccent: { color: '#2E7D32' },
  logoTagline: { fontSize: 13, color: '#757575', fontWeight: '500', marginTop: 4, marginBottom: 4 },
  outerContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20 },
  headerSection: { alignItems: 'center', paddingVertical: 24 },
  screenTitle: { fontSize: 26, fontWeight: '800', color: '#1B1B1B', marginTop: 14, letterSpacing: 0.5 },
  screenSubtitle: { fontSize: 14, color: '#757575', marginTop: 4, fontWeight: '400' },
  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08,
    shadowRadius: 16, elevation: 6, borderWidth: 1, borderColor: '#F1F1F1',
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#1B1B1B', marginBottom: 12, marginTop: 4 },
  roleContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  roleBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50,
    borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA',
    marginRight: 8, marginBottom: 8,
  },
  roleBtnText: { fontSize: 13, fontWeight: '600', color: '#555555' },
  roleBtnTextActive: { color: '#FFFFFF' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#333333', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E8E8E8', paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#1B1B1B',
  },
  multilineInput: { height: 90, textAlignVertical: 'top', paddingTop: 14 },
  inputError: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errorText: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  imagePicker: {
    backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E8E8E8', borderStyle: 'dashed', overflow: 'hidden',
    minHeight: 110, justifyContent: 'center', alignItems: 'center',
  },
  imagePickerError: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  imagePickerInner: { alignItems: 'center', paddingVertical: 20 },
  imagePickerIcon: { fontSize: 30, marginBottom: 8 },
  imagePickerText: { fontSize: 14, fontWeight: '600', color: '#2E7D32' },
  imagePickerSub: { fontSize: 12, color: '#9E9E9E', marginTop: 3 },
  imagePreviewContainer: { width: '100%', height: 140, position: 'relative' },
  imagePreview: { width: '100%', height: 140, resizeMode: 'cover' },
  selfiePreviewContainer: { width: '100%', height: 160, position: 'relative' },
  selfiePreview: { width: '100%', height: 160, resizeMode: 'cover' },
  // Liveness picker styles
  livenessPicker: {
    backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 2,
    borderColor: '#E8E8E8', borderStyle: 'dashed', overflow: 'hidden',
    minHeight: 120, justifyContent: 'center', alignItems: 'center',
  },
  livenessPickerDone: {
    borderStyle: 'solid', borderColor: '#2E7D32', backgroundColor: '#F1F8F1',
  },
  livenessSuccessInner: { alignItems: 'center', paddingVertical: 20 },
  livenessSuccessIcon: { fontSize: 38, marginBottom: 8 },
  livenessSuccessTitle: { fontSize: 15, fontWeight: '800', color: '#2E7D32', marginBottom: 4 },
  livenessSuccessSub: { fontSize: 12, color: '#757575', fontWeight: '500' },
  imageOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 8, alignItems: 'center',
  },
  imageOverlayText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  imageChangeTxt: { color: '#CCCCCC', fontSize: 11 },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8', paddingHorizontal: 16,
  },
  passwordInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1B1B1B' },
  eyeBtn: { padding: 6 },
  eyeIcon: { fontSize: 20 },
  registerBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28, shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  registerBtnDisabled: { backgroundColor: '#81C784' },
  registerBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  loginLinkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, marginBottom: 6 },
  loginLinkText: { color: '#757575', fontSize: 14 },
  loginLinkBtn: { color: '#2E7D32', fontSize: 14, fontWeight: '700' },
  bottomPad: { height: 40 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
});

export default RegisterScreen;
