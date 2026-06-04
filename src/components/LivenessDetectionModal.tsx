/**
 * LivenessDetectionModal.tsx — FarmNest Liveness Verification
 *
 * Rendered as a full-screen absolute overlay (NOT a Modal).
 * This fixes the Android Modal gesture conflict that blocks ScrollView.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STATUS_BAR_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

interface Props {
  visible: boolean;
  isUrdu?: boolean;
  onClose: () => void;
  onSuccess: (videoUri: string) => void;
}

type Step = 'instructions' | 'recording' | 'preview';

const ACTIONS_EN = [
  { icon: '⬆️', label: 'Move your head UP' },
  { icon: '⬇️', label: 'Move your head DOWN' },
  { icon: '⬅️', label: 'Turn your head LEFT' },
  { icon: '➡️', label: 'Turn your head RIGHT' },
  { icon: '😊', label: 'Smile naturally' },
  { icon: '👁️', label: 'Blink your eyes twice' },
];

const ACTIONS_UR = [
  { icon: '⬆️', label: 'سر اوپر کریں' },
  { icon: '⬇️', label: 'سر نیچے کریں' },
  { icon: '⬅️', label: 'سر بائیں موڑیں' },
  { icon: '➡️', label: 'سر دائیں موڑیں' },
  { icon: '😊', label: 'قدرتی مسکراہٹ دیں' },
  { icon: '👁️', label: 'آنکھیں دو بار جھپکائیں' },
];

const LivenessDetectionModal: React.FC<Props> = ({
  visible,
  isUrdu = false,
  onClose,
  onSuccess,
}) => {
  const [step, setStep]           = useState<Step>('instructions');
  const [videoUri, setVideoUri]   = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const actions = isUrdu ? ACTIONS_UR : ACTIONS_EN;

  const reset = useCallback(() => {
    setStep('instructions');
    setVideoUri(null);
    setIsOpening(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const openCamera = useCallback(async () => {
    setIsOpening(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: isUrdu ? 'کیمرہ اجازت' : 'Camera Permission',
            message: isUrdu
              ? 'FarmNest کو لائیونس ویریفیکیشن کے لیے کیمرہ کی ضرورت ہے'
              : 'FarmNest needs camera access for liveness verification.',
            buttonPositive: isUrdu ? 'اجازت دیں' : 'Allow',
            buttonNegative: isUrdu ? 'انکار' : 'Deny',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            isUrdu ? 'اجازت نہیں ملی' : 'Permission Denied',
            isUrdu
              ? 'کیمرہ کی اجازت ضروری ہے۔ سیٹنگز میں جا کر اجازت دیں۔'
              : 'Camera permission is required. Please allow it in Settings.',
          );
          setIsOpening(false);
          return;
        }
      }

      setIsOpening(false);
      setStep('recording');

      const result = await launchCamera({
        mediaType: 'video',
        cameraType: 'front',
        videoQuality: 'medium',
        durationLimit: 30,
        saveToPhotos: false,
      });

      if (result.didCancel) { setStep('instructions'); return; }

      if (result.errorCode) {
        Alert.alert(
          isUrdu ? 'کیمرہ خرابی' : 'Camera Error',
          result.errorMessage || (isUrdu ? 'دوبارہ کوشش کریں' : 'Please try again.'),
        );
        setStep('instructions');
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(
          isUrdu ? 'خرابی' : 'Error',
          isUrdu ? 'ویڈیو نہیں ملی، دوبارہ کوشش کریں' : 'No video captured. Please try again.',
        );
        setStep('instructions');
        return;
      }

      setVideoUri(asset.uri);
      setStep('preview');
    } catch (err: any) {
      console.warn('[LivenessDetection] Camera error:', err);
      Alert.alert(
        isUrdu ? 'خرابی' : 'Error',
        isUrdu ? 'کیمرہ نہیں کھل سکا' : 'Could not open camera. Please try again.',
      );
      setIsOpening(false);
      setStep('instructions');
    }
  }, [isUrdu]);

  const handleSubmit = useCallback(() => {
    if (!videoUri) return;
    onSuccess(videoUri);
    reset();
  }, [videoUri, onSuccess, reset]);

  // Not visible — render nothing
  if (!visible) return null;

  // ── Shared topbar ─────────────────────────────────────────────────────────
  const renderTopBar = (title: string) => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
        <Text style={styles.closeBtnTxt}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // ── STEP 1: Instructions ──────────────────────────────────────────────────
  const renderInstructions = () => (
    <>
      {renderTopBar(isUrdu ? '🔐 لائیو تصدیق' : '🔐 Live Verification')}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        overScrollMode="always"
        keyboardShouldPersistTaps="handled">

        <Text style={styles.heroIcon}>🎥</Text>
        <Text style={styles.mainTitle}>
          {isUrdu ? 'لائیو شناخت کی تصدیق' : 'Live Identity Verification'}
        </Text>
        <Text style={styles.subtitle}>
          {isUrdu
            ? 'کیمرہ کھلنے کے بعد نیچے دی گئی تمام حرکات خود کریں۔ ویڈیو 30 سیکنڈ کی ہونی چاہیے۔'
            : 'After the camera opens, perform all the actions listed below yourself. The video must be 30 seconds long.'}
        </Text>

        {/* Warning */}
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            {isUrdu
              ? 'اگر ویڈیو 30 سیکنڈ سے کم ہوئی یا تمام حرکات نہ کی گئیں تو آپ کی درخواست مسترد کر دی جائے گی۔'
              : 'If the video is less than 30 seconds or all actions are not performed, your application will be REJECTED.'}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>
            {isUrdu ? '📋 یہ 6 حرکات کریں:' : '📋 Perform these 6 actions:'}
          </Text>
          {actions.map((action, idx) => (
            <View key={idx} style={styles.actionRow}>
              <View style={styles.actionNumWrap}>
                <Text style={styles.actionNum}>{idx + 1}</Text>
              </View>
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </View>
          ))}
        </View>

        {/* Tips */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>
            {isUrdu ? '💡 اہم ہدایات:' : '💡 Important Tips:'}
          </Text>
          {(isUrdu
            ? ['اچھی روشنی میں بیٹھیں', 'کیمرہ کے سامنے چہرہ رکھیں', 'ہر حرکت آہستہ اور واضح طور پر کریں', '30 سیکنڈ تک ریکارڈ کریں پھر رکیں']
            : ['Sit in good lighting', 'Keep your face in front of the camera', 'Perform each action slowly and clearly', 'Record for 30 seconds then stop']
          ).map((tip, i) => (
            <Text key={i} style={styles.tipItem}>• {tip}</Text>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isOpening && styles.btnDisabled]}
          onPress={openCamera}
          activeOpacity={0.88}
          disabled={isOpening}>
          {isOpening
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.primaryBtnTxt}>{isUrdu ? '📹  کیمرہ کھولیں' : '📹  Start Camera'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelLink} onPress={handleClose} activeOpacity={0.7}>
          <Text style={styles.cancelLinkTxt}>{isUrdu ? 'منسوخ کریں' : 'Cancel'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </>
  );

  // ── STEP 2: Recording ─────────────────────────────────────────────────────
  const renderRecording = () => (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color="#00C853" />
      <Text style={styles.recordingTxt}>
        {isUrdu ? 'کیمرہ کھل رہا ہے…' : 'Camera is opening…'}
      </Text>
      <Text style={styles.recordingHint}>
        {isUrdu ? 'تمام 6 حرکات کریں اور 30 سیکنڈ بعد رکیں' : 'Perform all 6 actions and stop after 30 seconds'}
      </Text>
    </View>
  );

  // ── STEP 3: Preview / Submit ──────────────────────────────────────────────
  const renderPreview = () => (
    <>
      {renderTopBar(isUrdu ? '✅ ویڈیو تیار ہے' : '✅ Video Ready')}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        overScrollMode="always"
        keyboardShouldPersistTaps="handled">

        <Text style={styles.heroIcon}>✅</Text>
        <Text style={styles.mainTitle}>
          {isUrdu ? 'ویڈیو کامیابی سے ریکارڈ ہوگئی!' : 'Video Recorded Successfully!'}
        </Text>
        <Text style={styles.subtitle}>
          {isUrdu
            ? 'آپ کی لائیو ویڈیو تیار ہے۔ جمع کرنے کے لیے Submit بٹن دبائیں۔'
            : 'Your liveness video is ready. Tap Submit to upload it for admin review.'}
        </Text>

        <View style={styles.videoInfoCard}>
          <Text style={styles.videoInfoIcon}>🎬</Text>
          <View style={styles.videoInfoTextWrap}>
            <Text style={styles.videoInfoTitle}>{isUrdu ? 'لائیونس ویڈیو' : 'Liveness Video'}</Text>
            <Text style={styles.videoInfoSub} numberOfLines={2}>
              {videoUri?.split('/').pop() || 'liveness_video.mp4'}
            </Text>
            <Text style={styles.videoInfoStatus}>{isUrdu ? '✅ ریکارڈنگ مکمل' : '✅ Recording complete'}</Text>
          </View>
        </View>

        <View style={styles.nextStepsBox}>
          <Text style={styles.nextStepsTitle}>{isUrdu ? '📤 آگے کیا ہوگا:' : '📤 What happens next:'}</Text>
          {(isUrdu
            ? ['ویڈیو Cloudinary پر اپلوڈ ہوگی', 'ایڈمن آپ کی ویڈیو دیکھ کر تصدیق کرے گا', 'تصدیق کے بعد آپ کا اکاؤنٹ فعال ہوگا']
            : ['Video will be uploaded to secure cloud storage', 'Admin will review your liveness video', 'Your account will be activated after approval']
          ).map((s, i) => (
            <Text key={i} style={styles.nextStepItem}>{i + 1}. {s}</Text>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} activeOpacity={0.88}>
          <Text style={styles.primaryBtnTxt}>{isUrdu ? '📤  جمع کریں (Submit)' : '📤  Submit Video'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { setVideoUri(null); setStep('instructions'); }}
          activeOpacity={0.8}>
          <Text style={styles.secondaryBtnTxt}>{isUrdu ? '🔄  دوبارہ ریکارڈ کریں' : '🔄  Re-record Video'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelLink} onPress={handleClose} activeOpacity={0.7}>
          <Text style={styles.cancelLinkTxt}>{isUrdu ? 'منسوخ کریں' : 'Cancel'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </>
  );

  // ── Full-screen overlay (replaces Modal entirely) ─────────────────────────
  return (
    <View style={styles.overlay}>
      <StatusBar backgroundColor="#0A0F1E" barStyle="light-content" />
      {step === 'instructions' && renderInstructions()}
      {step === 'recording'    && renderRecording()}
      {step === 'preview'      && renderPreview()}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Full-screen absolute overlay — no Modal, no gesture conflicts
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#0A0F1E',
    flexDirection: 'column',
  },

  // Fixed topbar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: STATUS_BAR_H + 8,
    paddingBottom: 14,
    backgroundColor: '#0A0F1E',
    borderBottomWidth: 1,
    borderBottomColor: '#1A2035',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A2035',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  topBarTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: 8,
  },

  // ScrollView takes ALL remaining height after topBar
  scroller: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 60,
  },

  heroIcon: { fontSize: 60, marginBottom: 16, textAlign: 'center' },
  mainTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 29,
  },
  subtitle: {
    fontSize: 14,
    color: '#8899BB',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },

  warningBox: {
    width: '100%',
    backgroundColor: '#2A1A00',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#FF8C00',
  },
  warningIcon: { fontSize: 20 },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#FFAA44',
    fontWeight: '700',
    lineHeight: 20,
  },

  actionsCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E2D4A',
  },
  actionsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  actionNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionNum: { color: '#000000', fontSize: 13, fontWeight: '900' },
  actionIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  actionLabel: { fontSize: 14, color: '#CCDDFF', fontWeight: '600', flex: 1 },

  tipsBox: {
    width: '100%',
    backgroundColor: '#0D1F12',
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#1A4A2A',
  },
  tipsTitle: { fontSize: 14, fontWeight: '800', color: '#00C853', marginBottom: 8 },
  tipItem: { fontSize: 13, color: '#88BBAA', lineHeight: 22, fontWeight: '500' },

  primaryBtn: {
    width: '100%',
    backgroundColor: '#00C853',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 8,
    shadowColor: '#00C853',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnTxt: { color: '#000000', fontSize: 16, fontWeight: '900' },

  secondaryBtn: {
    width: '100%',
    backgroundColor: '#1A2035',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#2A3A55',
  },
  secondaryBtnTxt: { color: '#8899BB', fontSize: 15, fontWeight: '700' },

  cancelLink: { paddingVertical: 14 },
  cancelLinkTxt: { fontSize: 14, color: '#445566', fontWeight: '600' },

  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#0A0F1E',
  },
  recordingTxt: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  recordingHint: {
    fontSize: 14,
    color: '#8899BB',
    textAlign: 'center',
    lineHeight: 22,
  },

  videoInfoCard: {
    width: '100%',
    backgroundColor: '#0D1A2E',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#00C853',
  },
  videoInfoIcon: { fontSize: 38 },
  videoInfoTextWrap: { flex: 1 },
  videoInfoTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  videoInfoSub: { fontSize: 11, color: '#556688', marginBottom: 4, lineHeight: 15 },
  videoInfoStatus: { fontSize: 13, color: '#00C853', fontWeight: '700' },

  nextStepsBox: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1E2D4A',
  },
  nextStepsTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  nextStepItem: { fontSize: 13, color: '#8899BB', lineHeight: 22, fontWeight: '500' },
});

export default LivenessDetectionModal;
