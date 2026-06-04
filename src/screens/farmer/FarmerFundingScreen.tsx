import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform, Dimensions, Switch, Alert, Linking,
  PermissionsAndroid, RefreshControl, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';
import { createFundingPostInFirebase } from '../../services/firebaseFundingService';

const { width } = Dimensions.get('window');

const GreenToast = ({ message, visible }: { message: string; visible: boolean }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.greenToast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Text style={styles.greenToastText}>✅ {message}</Text>
    </Animated.View>
  );
};

const FarmerFundingScreen = ({ navigation }: any) => {
  const { currentUser, fundingPosts, getDailyPostCount, incrementDailyPostCount } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [landTitle, setLandTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [liveLocationEnabled, setLiveLocationEnabled] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationAddress, setLocationAddress] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  // Daily limit modal
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [resetDateStr, setResetDateStr] = useState('');

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisible) { setViewerVisible(false); return true; }
        // No modal open — slide the drawer in from the left
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [viewerVisible, navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  const formFadeAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Compute time remaining until midnight for the limit modal
  const computeResetInfo = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const diffMs = tomorrow.getTime() - now.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    const diffS = Math.floor((diffMs % 60000) / 1000);
    setTimeUntilReset(`${String(diffH).padStart(2, '0')}:${String(diffM).padStart(2, '0')}:${String(diffS).padStart(2, '0')}`);
    const tomorrowDate = `${tomorrow.getDate().toString().padStart(2, '0')}/${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}/${tomorrow.getFullYear()}`;
    setResetDateStr(tomorrowDate);
  };

  useEffect(() => {
    Animated.timing(formFadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const shakeForm = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const pickImage = async () => {
    if (images.length >= 3) return;
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    if (result.assets && result.assets[0]?.uri) {
      setImages(prev => [...prev, result.assets![0].uri!]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    const newErr: { [key: string]: string } = {};
    if (images.length === 0) newErr.images = t('pleaseUploadLandImage');
    if (!landTitle.trim()) newErr.landTitle = t('landTitleRequired');
    if (!description.trim()) newErr.description = t('descriptionRequired');
    if (!city.trim()) newErr.city = t('cityRequired2');
    if (!address.trim()) newErr.address = t('addressRequired2');
    if (!targetAmount.trim() || isNaN(Number(targetAmount)) || Number(targetAmount) <= 0)
      newErr.targetAmount = isUrdu ? 'ہدف رقم درج کریں' : 'Please enter a valid target amount';
    setErrors(newErr);
    return Object.keys(newErr).length === 0;
  };

  // Reverse geocode lat/lng to a human-readable city + partial address
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'Farmnest/1.0' } },
      );
      const data = await res.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.county || '';
      const road = a.road || a.suburb || a.neighbourhood || '';
      if (city && road) return `${road}, ${city}`;
      if (city) return city;
      if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
    } catch { /* ignore, fall back to nothing */ }
    return '';
  };

  const handleToggleLocation = async (value: boolean) => {
    if (!value) {
      setLiveLocationEnabled(false);
      setCurrentLocation(null);
      setLocationAddress('');
      return;
    }
    setLocationLoading(true);
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'FarmNest needs your location to share with investors on Google Maps.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'Allow',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setLocationLoading(false);
        Alert.alert(
          'Permission Denied',
          'Location permission is required. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      // Inner helper — try once with given accuracy setting
      const tryGetPosition = (highAccuracy: boolean): Promise<{ latitude: number; longitude: number }> =>
        new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            reject,
            { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 12000 : 20000, maximumAge: 30000 },
          );
        });

      let coords: { latitude: number; longitude: number };
      try {
        // First attempt: high accuracy (GPS)
        coords = await tryGetPosition(true);
      } catch {
        // Second attempt: network / cell-tower location (never fails if permission granted)
        try {
          coords = await tryGetPosition(false);
        } catch {
          setLocationLoading(false);
          Alert.alert(
            'Location Error',
            'Could not get your location. Please make sure Location Services are enabled in your phone settings and try again.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
      }

      setCurrentLocation({ ...coords, timestamp: Date.now() });
      setLiveLocationEnabled(true);

      // Reverse geocode in background — update caption once done
      reverseGeocode(coords.latitude, coords.longitude).then(addr => {
        setLocationAddress(addr);
      });

      setLocationLoading(false);
      showToast(t('locationCapturedToast'));
    } catch (err) {
      setLocationLoading(false);
      Alert.alert('Location Error', 'An unexpected error occurred while requesting location.');
    }
  };

  const handleSubmit = async () => {
    if (isPending) { setShowPendingModal(true); return; }
    // Daily post limit check (shared across Dashboard + Funding)
    if (currentUser && getDailyPostCount(currentUser.id) >= 3) {
      computeResetInfo();
      setLimitModalVisible(true);
      return;
    }
    if (!validate()) { shakeForm(); return; }

    try {
      setLoading(true);

      await createFundingPostInFirebase({
        farmerId: currentUser!.id,
        farmerName: `${currentUser!.firstName} ${currentUser!.lastName}`.trim(),
        farmerProfilePic: currentUser!.profilePic || '',
        title: landTitle,
        description,
        city,
        address,
        targetAmount: targetAmount.trim(),
        images: images,
        liveLocation: liveLocationEnabled && currentLocation ? currentLocation : null,
      });

      if (currentUser) incrementDailyPostCount(currentUser.id);
      setLoading(false);
      showToast(t('landListedSuccess'));
      setImages([]);
      setLandTitle('');
      setDescription('');
      setCity('');
      setAddress('');
      setTargetAmount('');
      setErrors({});
      setLiveLocationEnabled(false);
      setCurrentLocation(null);
      setLocationAddress('');
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to create funding post. Please try again.';

      if (error.message === 'NO_AUTH_USER') {
        message = 'Please login again.';
      } else if (error.message === 'INVALID_FARMER_ID') {
        message = 'Invalid farmer account detected.';
      } else if (error.message === 'CLOUDINARY_UPLOAD_FAILED') {
        message = 'Image upload failed. Please try again.';
      } else if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_NETWORK_ERROR') {
        message = 'Network error during image upload. Check your internet connection.';
      } else if (error.message === 'CLOUDINARY_TIMEOUT') {
        message = 'Image upload timed out. Please try again.';
      } else if (error.message === 'NO_IMAGE_URI') {
        message = 'No image selected.';
      } else if (error.message) {
        message = `Error: ${error.message}`;
      }

      Alert.alert('Funding Post Error', message);
      console.log('Farmer funding create error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('funding')} navigation={navigation} />
      <GreenToast message={toastMsg} visible={toastVisible} />
      <AccountPendingModal visible={showPendingModal} onClose={() => setShowPendingModal(false)} role="Farmer" />

      {/* Daily limit reached modal */}
      {limitModalVisible && (
        <View style={styles.limitOverlay}>
          <View style={styles.limitModal}>
            <Text style={styles.limitModalEmoji}>🚫</Text>
            <Text style={[styles.limitModalTitle, isUrdu && styles.rtlText]}>{t('dailyLimitReachedTitle')}</Text>
            <Text style={[styles.limitModalBody, isUrdu && styles.rtlText]}>
              {t('dailyLimitReachedBody')}{`\n`}{t('dailyLimitResetOn')}{`\n`}
              <Text style={styles.limitModalHighlight}>{resetDateStr}</Text>
              {`\n`}{t('dailyLimitTimeRemaining')}{`\n`}
              <Text style={styles.limitModalTimer}>{timeUntilReset}</Text>
            </Text>
            <TouchableOpacity style={styles.limitModalBtn} onPress={() => setLimitModalVisible(false)}>
              <Text style={styles.limitModalBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1B5E20']}
              tintColor="#1B5E20"
            />
          }>

          {/* Daily limit info banner */}
          <View style={styles.dailyLimitBanner}>
            <Text style={[styles.dailyLimitBannerText, isUrdu && styles.rtlText]}>📋 {t('dailyLimitInfo')}</Text>
            {currentUser && (
              <Text style={[styles.dailyLimitCountText, isUrdu && styles.rtlText]}>
                {t('postsToday')} {getDailyPostCount(currentUser.id)} / 3
              </Text>
            )}
          </View>

          {isPending && (
            <TouchableOpacity style={styles.lockedBanner} onPress={() => setShowPendingModal(true)}>
              <Text style={styles.lockedIcon}>🔒</Text>
              <Text style={[styles.lockedText, isUrdu && styles.rtlText]}>{t('accountPending')}</Text>
            </TouchableOpacity>
          )}

          <Animated.View style={[styles.formCard, { opacity: formFadeAnim, transform: [{ translateX: shakeAnim }] }]}>
            {/* Images */}
            <Text style={[styles.sectionTitle, isUrdu && styles.rtlText]}>{t('landImages')}</Text>
            <View style={styles.imagesRow}>
              {images.map((uri, idx) => (
                <View key={idx} style={styles.imageThumbWrap}>
                  <TouchableOpacity onPress={() => openImageViewer(images, idx)} activeOpacity={0.85}>
                    <Image source={{ uri }} style={styles.imageThumb} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => removeImage(idx)}>
                    <Text style={styles.imageRemoveTxt}>✕</Text>
                  </TouchableOpacity>
                  <View style={styles.imageIndexBadge}>
                    <Text style={styles.imageIndexTxt}>{idx + 1}</Text>
                  </View>
                </View>
              ))}
              {images.length < 3 && (
                <TouchableOpacity style={styles.addImageBtn} onPress={pickImage} disabled={isPending} activeOpacity={0.75}>
                  <Text style={styles.addImageIcon}>+</Text>
                  <Text style={styles.addImageText}>{t('addPhoto')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {errors.images ? <Text style={styles.errTxt}>⚠ {errors.images}</Text> : null}

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('landAreaTitle')}</Text>
            <TextInput
              style={[styles.input, errors.landTitle ? styles.inputErr : null, isUrdu && styles.rtlInput]}
              placeholder={t('enterLandTitle')}
              placeholderTextColor="#9E9E9E"
              value={landTitle}
              onChangeText={t2 => { if (t2.length <= 50) { setLandTitle(t2); setErrors(e => ({ ...e, landTitle: '' })); } }}
              editable={!isPending}
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={50}
            />
            <View style={styles.charCountRow}>
              {errors.landTitle ? <Text style={styles.errTxt}>⚠ {errors.landTitle}</Text> : <View />}
              <Text style={[styles.charCount, landTitle.length >= 50 && styles.charCountLimit]}>{landTitle.length}/50</Text>
            </View>

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('description')}</Text>
            <TextInput
              style={[styles.input, styles.multiInput, errors.description ? styles.inputErr : null, isUrdu && styles.rtlInput]}
              placeholder={t('describeLand')}
              placeholderTextColor="#9E9E9E"
              multiline numberOfLines={4}
              value={description}
              onChangeText={t2 => { if (t2.length <= 400) { setDescription(t2); setErrors(e => ({ ...e, description: '' })); } }}
              editable={!isPending}
              textAlignVertical="top"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={400}
            />
            <View style={styles.charCountRow}>
              {errors.description ? <Text style={styles.errTxt}>⚠ {errors.description}</Text> : <View />}
              <Text style={[styles.charCount, description.length >= 400 && styles.charCountLimit]}>{description.length}/400</Text>
            </View>

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('cityLabel')}</Text>
            <TextInput
              style={[styles.input, errors.city ? styles.inputErr : null, isUrdu && styles.rtlInput]}
              placeholder={t('enterCityLabel')}
              placeholderTextColor="#9E9E9E"
              value={city}
              onChangeText={t2 => { if (t2.length <= 30) { setCity(t2); setErrors(e => ({ ...e, city: '' })); } }}
              editable={!isPending}
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={30}
            />
            <View style={styles.charCountRow}>
              {errors.city ? <Text style={styles.errTxt}>⚠ {errors.city}</Text> : <View />}
              <Text style={[styles.charCount, city.length >= 30 && styles.charCountLimit]}>{city.length}/30</Text>
            </View>

            {/* Target Amount */}
            <Text style={[styles.label, isUrdu && styles.rtlText]}>
              {isUrdu ? 'ہدف رقم (PKR)' : 'Funding Target (PKR)'}
            </Text>
            <TextInput
              style={[styles.input, errors.targetAmount ? styles.inputErr : null, isUrdu && styles.rtlInput]}
              placeholder={isUrdu ? 'مثلاً: 500000' : 'e.g. 500000'}
              placeholderTextColor="#9E9E9E"
              keyboardType="numeric"
              value={targetAmount}
              onChangeText={v => { setTargetAmount(v); setErrors(e => ({ ...e, targetAmount: '' })); }}
              editable={!isPending}
              textAlign={isUrdu ? 'right' : 'left'}
            />
            {errors.targetAmount ? <Text style={styles.errTxt}>⚠ {errors.targetAmount}</Text> : null}

            <Text style={[styles.label, isUrdu && styles.rtlText]}>{t('completeAddress')}</Text>
            <TextInput
              style={[styles.input, styles.multiInput, errors.address ? styles.inputErr : null, isUrdu && styles.rtlInput]}
              placeholder={t('enterCompleteAddressLabel')}
              placeholderTextColor="#9E9E9E"
              multiline numberOfLines={3}
              value={address}
              onChangeText={t2 => { if (t2.length <= 400) { setAddress(t2); setErrors(e => ({ ...e, address: '' })); } }}
              editable={!isPending}
              textAlignVertical="top"
              textAlign={isUrdu ? 'right' : 'left'}
              maxLength={400}
            />
            <View style={styles.charCountRow}>
              {errors.address ? <Text style={styles.errTxt}>⚠ {errors.address}</Text> : <View />}
              <Text style={[styles.charCount, address.length >= 400 && styles.charCountLimit]}>{address.length}/400</Text>
            </View>

            {/* LIVE LOCATION TOGGLE */}
            <View style={styles.locationCard}>
              <View style={styles.locationCardLeft}>
                <Text style={[styles.locationCardTitle, isUrdu && styles.rtlText]}>{t('shareLiveLocation')}</Text>
                <Text style={[styles.locationCardSub, isUrdu && styles.rtlText]}>
                  {liveLocationEnabled && currentLocation
                    ? locationAddress
                      ? `${t('locationCaptured')}: ${locationAddress}`
                      : t('locationCaptured')
                    : t('investorsWillSeeLocation')}
                </Text>
              </View>
              {locationLoading ? (
                <ActivityIndicator color="#1B5E20" size="small" />
              ) : (
                <Switch
                  value={liveLocationEnabled}
                  onValueChange={handleToggleLocation}
                  trackColor={{ false: '#E0E0E0', true: '#A5D6A7' }}
                  thumbColor={liveLocationEnabled ? '#1B5E20' : '#BDBDBD'}
                  disabled={isPending}
                />
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, (isPending || loading) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isPending || loading}
              activeOpacity={0.85}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isPending ? t('accountPendingBtn') : t('submitLandListing')}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  greenToast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999,
    backgroundColor: '#2E7D32', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
  },
  greenToastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  bannerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1B5E20', borderRadius: 18,
    padding: 18, marginBottom: 16, gap: 14,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  bannerEmoji: { fontSize: 36 },
  bannerTextCol: { flex: 1 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  bannerSub: { fontSize: 13, color: '#A5D6A7', fontWeight: '500' },
  lockedBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', borderRadius: 12,
    padding: 14, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#FFE082', gap: 10,
  },
  lockedIcon: { fontSize: 20 },
  lockedText: { flex: 1, fontSize: 13, color: '#F57F17', fontWeight: '600' },
  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 5, marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 14 },
  imagesRow: { flexDirection: 'row', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  imageThumbWrap: { width: 90, height: 90, borderRadius: 12, position: 'relative', overflow: 'visible' },
  imageThumb: { width: 90, height: 90, borderRadius: 12 },
  imageRemoveBtn: {
    position: 'absolute', top: -8, right: -8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  imageRemoveTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  imageIndexBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    width: 20, height: 20, justifyContent: 'center', alignItems: 'center',
  },
  imageIndexTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  addImageBtn: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 2, borderColor: '#1B5E20', borderStyle: 'dashed',
    backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
  },
  addImageIcon: { fontSize: 26, color: '#1B5E20' },
  addImageText: { fontSize: 11, color: '#1B5E20', fontWeight: '600', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 7, marginTop: 16 },
  input: {
    backgroundColor: '#F9F9F9', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1B1B1B',
  },
  multiInput: { height: 90, textAlignVertical: 'top', paddingTop: 13 },
  inputErr: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
  locationCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F8E9', borderRadius: 14,
    padding: 14, marginTop: 20,
    borderWidth: 1.5, borderColor: '#C8E6C9', gap: 12,
  },
  locationCardLeft: { flex: 1 },
  locationCardTitle: { fontSize: 14, fontWeight: '800', color: '#1B5E20', marginBottom: 4 },
  locationCardSub: { fontSize: 12, color: '#555555', lineHeight: 18 },
  submitBtn: {
    backgroundColor: '#1B5E20', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginTop: 24,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 9,
  },
  submitBtnDisabled: { backgroundColor: '#9E9E9E' },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  dailyLimitBanner: { backgroundColor: '#E8F5E9', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: '#A5D6A7', flexDirection: 'column', gap: 4 },
  dailyLimitBannerText: { fontSize: 13, color: '#1B5E20', fontWeight: '700', textAlign: 'center' },
  dailyLimitCountText: { fontSize: 12, color: '#2E7D32', fontWeight: '600', textAlign: 'center' },
  limitOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9999, justifyContent: 'center', alignItems: 'center' },
  limitModal: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, marginHorizontal: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 16 },
  limitModalEmoji: { fontSize: 48, marginBottom: 12 },
  limitModalTitle: { fontSize: 20, fontWeight: '800', color: '#C62828', marginBottom: 12, textAlign: 'center' },
  limitModalBody: { fontSize: 14, color: '#333333', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  limitModalHighlight: { fontWeight: '700', color: '#1B5E20' },
  limitModalTimer: { fontSize: 22, fontWeight: '900', color: '#C62828', letterSpacing: 2 },
  limitModalBtn: { backgroundColor: '#1B5E20', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
  limitModalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  myPostsSection: { marginTop: 8 },
  myPostsTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  myPostCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  myPostRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  myPostImage: { width: 70, height: 70, borderRadius: 12, resizeMode: 'cover' },
  myPostImagePlaceholder: {
    width: 70, height: 70, borderRadius: 12,
    backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center',
  },
  myPostInfo: { flex: 1 },
  myPostTitle: { fontSize: 14, fontWeight: '700', color: '#1B1B1B', marginBottom: 4 },
  myPostCity: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 6 },
  myPostStatus: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  myPostStatusText: { fontSize: 11, fontWeight: '700' },
  charCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  charCount: { fontSize: 11, color: '#9E9E9E', fontWeight: '500', textAlign: 'right' },
  charCountLimit: { color: '#E53935', fontWeight: '700' },
});

export default FarmerFundingScreen;
