import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Animated, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';
import { createComplaintInFirebase } from '../../services/firebaseComplaintService';

const InvestorComplainScreen = ({ navigation }: any) => {
  const { currentUser } = useApp();
  const { t, isUrdu } = useLanguage();
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDetail, setProblemDetail] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showSuccessRef = useRef(showSuccess);
  useEffect(() => { showSuccessRef.current = showSuccess; }, [showSuccess]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (showSuccessRef.current) { setShowSuccess(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const shake = () => { Animated.sequence([Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }), Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }), Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true })]).start(); };
  const pickScreenshot = async () => { if (screenshots.length >= 3) return; const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 }); if (res.assets && res.assets[0]?.uri) setScreenshots(p => [...p, res.assets![0].uri!]); };

  const handleSubmit = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'Please login again.');
      return;
    }

    if (!problemTitle.trim() || !problemDetail.trim()) {
      const e: any = {};
      if (!problemTitle.trim()) e.problemTitle = t('problemTitleRequired');
      if (!problemDetail.trim()) e.problemDetail = t('problemDetailRequired');
      setErrors(e);
      shake();
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
      console.log('Investor complaint error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <InvestorHeader title={t('complain')} navigation={navigation} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.banner}>
            <Text style={styles.bannerEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, isUrdu && styles.rtlText]}>{t('submitComplaint')}</Text>
              <Text style={[styles.bannerSub, isUrdu && styles.rtlText]}>{t('forwardToAdmin')}</Text>
            </View>
          </View>
          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('problemTitle')}</Text>
            <TextInput style={[styles.input, errors.problemTitle && styles.inputErr]} placeholder={t('problemTitlePlaceholder')} placeholderTextColor="#9E9E9E" textAlign={isUrdu ? 'right' : 'left'} value={problemTitle} onChangeText={v => { setProblemTitle(v); setErrors((e: any) => ({ ...e, problemTitle: '' })); }} />
            {errors.problemTitle ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.problemTitle}</Text> : null}
            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('describeProblem')}</Text>
            <TextInput style={[styles.input, styles.multiInput, errors.problemDetail && styles.inputErr]} placeholder={t('describeProblemPlaceholder')} placeholderTextColor="#9E9E9E" multiline numberOfLines={5} textAlign={isUrdu ? 'right' : 'left'} value={problemDetail} onChangeText={v => { setProblemDetail(v); setErrors((e: any) => ({ ...e, problemDetail: '' })); }} textAlignVertical="top" />
            {errors.problemDetail ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.problemDetail}</Text> : null}
            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('uploadScreenshots')}</Text>
            <Text style={[styles.labelSub, isUrdu && styles.rtlText]}>{t('screenshotHint')}</Text>
            <View style={styles.screenshotsRow}>
              {screenshots.map((uri, idx) => (<View key={idx} style={styles.ssWrap}><Image source={{ uri }} style={styles.ssThumb} /><TouchableOpacity style={styles.ssRemove} onPress={() => setScreenshots(p => p.filter((_, i) => i !== idx))}><Text style={styles.ssRemoveTxt}>✕</Text></TouchableOpacity></View>))}
              {screenshots.length < 3 && (<TouchableOpacity style={styles.addSsBtn} onPress={pickScreenshot} activeOpacity={0.75}><Text style={styles.addSsIcon}>📷</Text><Text style={[styles.addSsText, isUrdu && styles.rtlText]}>{t('addScreenshot')}</Text></TouchableOpacity>)}
            </View>
            {errors.screenshots ? <Text style={[styles.errTxt, isUrdu && styles.rtlText]}>⚠ {errors.screenshots}</Text> : null}
            <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{t('submitComplaintBtn')}</Text>}
            </TouchableOpacity>
          </Animated.View>
          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showSuccess} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSuccess(false)}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={[styles.successTitle, isUrdu && styles.rtlText]}>{t('complaintSubmitted')}</Text>
            <Text style={[styles.successMsg, isUrdu && styles.rtlText]}>{t('complaintSubmittedMsg')}</Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => setShowSuccess(false)} activeOpacity={0.85}><Text style={styles.successBtnText}>{t('okay')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6A1B9A', borderRadius: 18, padding: 18, marginBottom: 16, gap: 14, shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  bannerEmoji: { fontSize: 34 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  bannerSub: { fontSize: 13, color: '#CE93D8', fontWeight: '500' },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5 },
  label: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 4, marginTop: 14 },
  labelSub: { fontSize: 11, color: '#9E9E9E', marginBottom: 8 },
  input: { backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8', paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1B1B1B' },
  multiInput: { height: 110, textAlignVertical: 'top', paddingTop: 13 },
  inputErr: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  screenshotsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  ssWrap: { width: 90, height: 90, borderRadius: 12, position: 'relative', overflow: 'visible' },
  ssThumb: { width: 90, height: 90, borderRadius: 12 },
  ssRemove: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  ssRemoveTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  addSsBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 2, borderColor: '#6A1B9A', borderStyle: 'dashed', backgroundColor: '#F9F5FF', justifyContent: 'center', alignItems: 'center' },
  addSsIcon: { fontSize: 26 },
  addSsText: { fontSize: 10, color: '#6A1B9A', fontWeight: '600', marginTop: 3 },
  submitBtn: { backgroundColor: '#6A1B9A', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24, shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 9 },
  submitBtnDisabled: { backgroundColor: '#CE93D8' },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  successCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 30, alignItems: 'center', width: '100%' },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  successMsg: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 23, marginBottom: 26 },
  successBtn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  successBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});

export default InvestorComplainScreen;
