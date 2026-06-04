import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Animated, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform, BackHandler, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import { createComplaintInFirebase } from '../../services/firebaseComplaintService';

const FarmerComplainScreen = ({ navigation }: any) => {
  const { currentUser } = useApp();
  const { t, isUrdu } = useLanguage();

  const [problemTitle, setProblemTitle] = useState('');
  const [problemDetail, setProblemDetail] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Hardware back button handler ──────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (showSuccess) { setShowSuccess(false); return true; }
        // No modal open — slide the drawer in from the left
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [showSuccess, navigation])
  );

  const shakeForm = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const pickScreenshot = async () => {
    if (screenshots.length >= 3) return;
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets && result.assets[0]?.uri) setScreenshots(prev => [...prev, result.assets![0].uri!]);
  };

  const handleSubmit = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'Please login again.');
      return;
    }

    if (!problemTitle.trim() || !problemDetail.trim()) {
      const newErr: { [key: string]: string } = {};
      if (!problemTitle.trim()) newErr.problemTitle = t('problemTitleRequired');
      if (!problemDetail.trim()) newErr.problemDetail = t('problemDetailRequired');
      setErrors(newErr);
      shakeForm();
      return;
    }

    try {
      setLoading(true);

      await createComplaintInFirebase({
        userId: currentUser.id,
        userName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        userRole: currentUser.role,
        userProfilePic: currentUser.profilePic || '',
        problemTitle,
        problemDetail,
        screenshots: typeof screenshots !== 'undefined' ? screenshots : [],
      });

      setLoading(false);
      setProblemTitle('');
      setProblemDetail('');
      setScreenshots([]);
      setErrors({});
      setShowSuccess(true);
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to submit complaint. Please try again.';

      if (error.message === 'NO_AUTH_USER') {
        message = 'Please login again.';
      } else if (error.message === 'INVALID_COMPLAINT_USER') {
        message = 'Invalid user account detected.';
      } else if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_UPLOAD_FAILED') {
        message = 'Image upload failed. Please try again.';
      }

      Alert.alert('Complaint Error', message);
      console.log('Farmer complaint error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('complain')} navigation={navigation} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={styles.banner}>
            <Text style={styles.bannerEmoji}>⚠️</Text>
            <View style={styles.bannerTextCol}>
              <Text style={[styles.bannerTitle, isUrdu && styles.rtlText]}>{t('submitComplaint')}</Text>
              <Text style={[styles.bannerSub, isUrdu && styles.rtlText]}>{t('forwardToAdmin')}</Text>
            </View>
          </View>

          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('problemTitle')}</Text>
            <TextInput style={[styles.input, errors.problemTitle ? styles.inputErr : null]} placeholder={t('problemTitlePlaceholder')} placeholderTextColor="#9E9E9E" textAlign={isUrdu ? 'right' : 'left'} value={problemTitle} onChangeText={v => { setProblemTitle(v); setErrors(e => ({ ...e, problemTitle: '' })); }} />
            {errors.problemTitle ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.problemTitle}</Text> : null}

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('describeProblem')}</Text>
            <TextInput style={[styles.input, styles.multiInput, errors.problemDetail ? styles.inputErr : null]} placeholder={t('describeProblemPlaceholder')} placeholderTextColor="#9E9E9E" multiline numberOfLines={5} textAlign={isUrdu ? 'right' : 'left'} value={problemDetail} onChangeText={v => { setProblemDetail(v); setErrors(e => ({ ...e, problemDetail: '' })); }} textAlignVertical="top" />
            {errors.problemDetail ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.problemDetail}</Text> : null}

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('uploadScreenshots')}</Text>
            <Text style={[styles.screenshotHint, isUrdu && styles.rtlText]}>{t('screenshotHint')}</Text>
            <View style={styles.screenshotsRow}>
              {screenshots.map((uri, idx) => (
                <View key={idx} style={styles.screenshotWrap}>
                  <Image source={{ uri }} style={styles.screenshotThumb} />
                  <TouchableOpacity style={styles.screenshotRemove} onPress={() => setScreenshots(prev => prev.filter((_, i) => i !== idx))}>
                    <Text style={styles.screenshotRemoveTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {screenshots.length < 3 && (
                <TouchableOpacity style={styles.addScreenshotBtn} onPress={pickScreenshot} activeOpacity={0.75}>
                  <Text style={styles.addScreenshotIcon}>📷</Text>
                  <Text style={[styles.addScreenshotText, isUrdu && styles.rtlText]}>{screenshots.length === 0 ? t('addScreenshot') : `Add #${screenshots.length + 1}`}</Text>
                </TouchableOpacity>
              )}
            </View>
            {errors.screenshots ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.screenshots}</Text> : null}

            <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{t('submitComplaintBtn')}</Text>}
            </TouchableOpacity>
          </Animated.View>
          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSuccess} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✅</Text>
            <Text selectable style={[styles.successTitle, isUrdu && styles.rtlText]}>{t('complaintSubmitted')}</Text>
            <Text selectable style={[styles.successMsg, isUrdu && styles.rtlText]}>{t('complaintSubmittedMsg')}</Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => setShowSuccess(false)} activeOpacity={0.85}>
              <Text style={styles.successBtnText}>{t('okay')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E65100', borderRadius: 18, padding: 18, marginBottom: 16, gap: 14, shadowColor: '#E65100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  bannerEmoji: { fontSize: 34 },
  bannerTextCol: { flex: 1 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  bannerSub: { fontSize: 13, color: '#FFCCBC', fontWeight: '500' },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5 },
  label: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 7, marginTop: 14 },
  screenshotHint: { fontSize: 12, color: '#9E9E9E', marginBottom: 10, lineHeight: 18 },
  input: { backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8', paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1B1B1B' },
  multiInput: { height: 110, textAlignVertical: 'top', paddingTop: 13 },
  inputErr: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  screenshotsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  screenshotWrap: { width: 90, height: 90, borderRadius: 12, position: 'relative', overflow: 'visible' },
  screenshotThumb: { width: 90, height: 90, borderRadius: 12 },
  screenshotRemove: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  screenshotRemoveTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  addScreenshotBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 2, borderColor: '#E65100', borderStyle: 'dashed', backgroundColor: '#FBE9E7', justifyContent: 'center', alignItems: 'center' },
  addScreenshotIcon: { fontSize: 26 },
  addScreenshotText: { fontSize: 10, color: '#E65100', fontWeight: '600', marginTop: 3 },
  submitBtn: { backgroundColor: '#E65100', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24, shadowColor: '#E65100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 9 },
  submitBtnDisabled: { backgroundColor: '#FFAB91' },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  successCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 30, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  successMsg: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 23, marginBottom: 26 },
  successBtn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  successBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});

export default FarmerComplainScreen;
