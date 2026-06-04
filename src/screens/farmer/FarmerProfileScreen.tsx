import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Animated, Platform, Alert, Modal, FlatList,
  RefreshControl, BackHandler, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import LanguageToggle from '../../components/LanguageToggle';
import ImageViewer from '../../components/ImageViewer';
import {updateCurrentUserProfileInFirebase} from '../../services/firebaseAuthService';
import firebaseAuth from '../../firebase/auth';
import {logoutFromFirebaseSession} from '../../services/sessionService';
const StarRating = ({ rating, size = 20 }: { rating: number; size?: number }) => (
  <View style={{ flexDirection: 'row', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <Text key={s} style={{ fontSize: size, color: s <= rating ? '#F9A825' : '#E0E0E0' }}>★</Text>
    ))}
  </View>
);

const FarmerProfileScreen = ({ navigation }: any) => {
  const { currentUser, setCurrentUser, users, setUsers, clearAppSessionState } = useApp();
  const { t, isUrdu } = useLanguage();

  const [editMode, setEditMode] = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [firstName, setFirstName] = useState(currentUser?.firstName || '');
  const [lastName, setLastName] = useState(currentUser?.lastName || '');
  const [city, setCity] = useState(currentUser?.city || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pendingProfilePic, setPendingProfilePic] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);

  const toastAnim = useRef(new Animated.Value(0)).current;

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const viewerVisibleRef    = useRef(viewerVisible);
  const showReviewsModalRef = useRef(showReviewsModal);
  useEffect(() => { viewerVisibleRef.current    = viewerVisible;    }, [viewerVisible]);
  useEffect(() => { showReviewsModalRef.current = showReviewsModal; }, [showReviewsModal]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)    { setViewerVisible(false);    return true; }
        if (showReviewsModalRef.current) { setShowReviewsModal(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const pickProfilePic = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    if (result.assets && result.assets[0]?.uri) {
      setPendingProfilePic(result.assets![0].uri);
    }
  };

  const openProfilePicViewer = () => {
    if (currentUser?.profilePic) {
      setViewerVisible(true);
    }
  };

  const handleUpdate = async () => {
  if (
    !firstName.trim() ||
    !lastName.trim() ||
    !city.trim() ||
    !phone.trim() ||
    !address.trim()
  ) {
    Alert.alert('Error', t('errorFillFields'));
    return;
  }

  const proceedWithUpdate = async () => {
    setUpdateLoading(true);
    try {
      const updatedProfile: any = await updateCurrentUserProfileInFirebase({
      firstName,
      lastName,
      phone,
      city,
      address,
      profilePic: pendingProfilePic || currentUser?.profilePic || '',
      currentPassword,
      newPassword: password,
      uid: currentUser?.id || currentUser?.uid,
    });

    const updated = {
    ...currentUser!,
    ...updatedProfile,
    id: updatedProfile?.uid || currentUser?.id,
    password: '',
      };

    setCurrentUser(updated);
    setUsers(prev => prev.map(u => (u.id === currentUser?.id ? updated : u)));
    setEditMode(false);
    setPassword('');
    setCurrentPassword('');
    setShowCurrentPw(false);
    setShowNewPw(false);
    setPendingProfilePic(null);
    setUpdateLoading(false);
    showToast(t('updateSuccess'));
  } catch (error: any) {
    setUpdateLoading(false);
    let message = 'Profile update failed. Please try again.';

    if (error.code === 'auth/email-already-in-use') {
      message = 'This email is already used by another account.';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Invalid email address.';
    } else if (error.code === 'auth/weak-password') {
      message = 'Password should be at least 6 characters.';
    } else if (error.code === 'auth/current-password-required') {
      message = 'Please enter your current password to set a new password.';
    } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      message = 'Current password is incorrect. Please try again.';
    } else if (error.code === 'auth/requires-recent-login') {
      message = 'For security, please logout and log back in, then try again.';
    }

    Alert.alert('Update Error', message);
    console.warn('[FarmerProfile] update error:', error?.code || error?.message);
  }
  };

  proceedWithUpdate();
};

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            clearAppSessionState();
            await logoutFromFirebaseSession();
          } catch (error) {
            Alert.alert('Logout Error', 'Failed to logout. Please try again.');
            console.warn('[FarmerProfile] logout error:', error);
          }
        },
      },
    ]);
  };

  const avgRating = currentUser?.reviews?.length
    ? currentUser.reviews.reduce((s: number, r: any) => s + r.rating, 0) / currentUser.reviews.length
    : 0;

  const getInitials = () =>
    `${(currentUser?.firstName || 'U')[0]}${(currentUser?.lastName || 'U')[0]}`.toUpperCase();

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('profile')} navigation={navigation} />

      {/* ── Language Toggle – top right of profile ── */}
      <View style={styles.langToggleContainer}>
        <LanguageToggle accentColor="#2E7D32" />
      </View>

      {/* Full-screen profile pic viewer */}
      {currentUser?.profilePic ? (
        <ImageViewer
          visible={viewerVisible}
          images={[currentUser.profilePic]}
          initialIndex={0}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}

      {toastVisible && (
        <Animated.View style={[styles.greenToast, { opacity: toastAnim }]}>
          <Text style={styles.greenToastText}>✅ {toastMsg}</Text>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2E7D32']}
            tintColor="#2E7D32"
          />
        }>

        {/* Profile Header Card */}
        <View style={styles.profileHeaderCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pendingProfilePic ? () => {} : (currentUser?.profilePic ? openProfilePicViewer : pickProfilePic)} activeOpacity={0.8}>
            {pendingProfilePic ? (
              <Image source={{ uri: pendingProfilePic }} style={styles.avatar} />
            ) : currentUser?.profilePic ? (
              <Image source={{ uri: currentUser.profilePic }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{getInitials()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeTxt}>📷</Text>
            </View>
          </TouchableOpacity>

          {editMode && (
            <TouchableOpacity onPress={pickProfilePic} activeOpacity={0.75}>
              <Text style={styles.uploadProfileImageLink}>Upload Profile Image</Text>
            </TouchableOpacity>
          )}

          <Text selectable style={styles.profileName}>
            {currentUser?.firstName} {currentUser?.lastName}
          </Text>

          <StarRating rating={Math.round(avgRating)} size={22} />
          <Text selectable style={styles.ratingCount}>
            ({currentUser?.reviews?.length || 0} {t('reviews')})
          </Text>
          {(currentUser?.reviews?.length || 0) > 0 && (
            <TouchableOpacity onPress={() => setShowReviewsModal(true)} activeOpacity={0.75}>
              <Text style={styles.seeAllReviewsLink}>{isUrdu ? 'تمام جائزے دیکھیں' : 'See All Reviews'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text selectable style={styles.roleBadgeText}>{t('farmer')}</Text>
            </View>
            <View style={[
              styles.statusBadge,
              { backgroundColor: currentUser?.accountStatus === 'Approved' ? '#E8F5E9' : '#FFF8E1' }
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: currentUser?.accountStatus === 'Approved' ? '#2E7D32' : '#F9A825' }
              ]} />
              <Text selectable style={[
                styles.statusBadgeText,
                { color: currentUser?.accountStatus === 'Approved' ? '#2E7D32' : '#F9A825' }
              ]}>
                {t('accountStatus')} {isUrdu
                  ? (currentUser?.accountStatus === 'Approved' ? 'منظور ہے'
                    : currentUser?.accountStatus === 'Pending' ? 'زیر التواء'
                    : currentUser?.accountStatus === 'Rejected' ? 'مسترد'
                    : currentUser?.accountStatus === 'Suspended' ? 'معطل'
                    : currentUser?.accountStatus)
                  : currentUser?.accountStatus}
              </Text>
            </View>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Text selectable style={[styles.infoCardTitle, isUrdu && styles.rtlText]}>{t('personalInformation')}</Text>
            {!editMode && (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditMode(true)} activeOpacity={0.8}>
                <Text style={styles.editBtnText}>{t('edit')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Account Number */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🪪</Text>
            <View style={styles.infoContent}>
              <Text selectable style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('accountNumber')}</Text>
              <Text selectable style={[styles.infoValue, isUrdu && styles.rtlText]}>{currentUser?.cnic || '—'}</Text>
            </View>
          </View>

          {/* Email — read-only, not editable */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📧</Text>
            <View style={styles.infoContent}>
              <Text selectable style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('email')}</Text>
              <Text selectable style={[styles.infoValue, isUrdu && styles.rtlText]}>{currentUser?.email}</Text>
            </View>
          </View>

          {/* Phone */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📱</Text>
            <View style={styles.infoContent}>
              <Text selectable style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('phone')}</Text>
              {editMode ? (
                <TextInput
                  style={[styles.infoEditInput, isUrdu && styles.rtlInput]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numeric"
                  textAlign={isUrdu ? 'right' : 'left'}
                />
              ) : (
                <Text selectable style={[styles.infoValue, isUrdu && styles.rtlText]}>{currentUser?.phone}</Text>
              )}
            </View>
          </View>

          {/* City */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🏙️</Text>
            <View style={styles.infoContent}>
              <Text selectable style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('cityLabel')}</Text>
              {editMode ? (
                <TextInput
                  style={[styles.infoEditInput, isUrdu && styles.rtlInput]}
                  value={city}
                  onChangeText={setCity}
                  placeholderTextColor="#9E9E9E"
                  textAlign={isUrdu ? 'right' : 'left'}
                />
              ) : (
                <Text selectable style={[styles.infoValue, isUrdu && styles.rtlText]}>{currentUser?.city}</Text>
              )}
            </View>
          </View>

          {/* Address */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <View style={styles.infoContent}>
              <Text selectable style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('address')}</Text>
              {editMode ? (
                <TextInput
                  style={[styles.infoEditInput, styles.infoEditMulti, isUrdu && styles.rtlInput]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholderTextColor="#9E9E9E"
                  textAlign={isUrdu ? 'right' : 'left'}
                />
              ) : (
                <Text selectable style={[styles.infoValue, isUrdu && styles.rtlText]}>{currentUser?.address}</Text>
              )}
            </View>
          </View>

          {editMode && (
            <>
              {/* First Name */}
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>👤</Text>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('firstName')}</Text>
                  <TextInput
                    style={[styles.infoEditInput, isUrdu && styles.rtlInput]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholderTextColor="#9E9E9E"
                    textAlign={isUrdu ? 'right' : 'left'}
                  />
                </View>
              </View>
              {/* Last Name */}
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>👤</Text>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('lastName')}</Text>
                  <TextInput
                    style={[styles.infoEditInput, isUrdu && styles.rtlInput]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholderTextColor="#9E9E9E"
                    textAlign={isUrdu ? 'right' : 'left'}
                  />
                </View>
              </View>
              {/* Current Password */}
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🔒</Text>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, isUrdu && styles.rtlText]}>
                    {isUrdu ? 'موجودہ پاس ورڈ (پاس ورڈ تبدیل کرنے کے لیے)' : 'Current Password (required to change password)'}
                  </Text>
                  <View style={styles.pwRow}>
                    <TextInput
                      style={[styles.infoEditInput, styles.pwInput, isUrdu && styles.rtlInput]}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry={!showCurrentPw}
                      placeholder={isUrdu ? 'موجودہ پاس ورڈ درج کریں' : 'Enter current password'}
                      placeholderTextColor="#9E9E9E"
                      textAlign={isUrdu ? 'right' : 'left'}
                    />
                    <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.eyeBtn}>
                      <Text style={styles.eyeIcon}>{showCurrentPw ? '👁️' : '👁'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {/* New Password */}
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🔑</Text>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, isUrdu && styles.rtlText]}>{t('newPassword')}</Text>
                  <View style={styles.pwRow}>
                    <TextInput
                      style={[styles.infoEditInput, styles.pwInput, isUrdu && styles.rtlInput]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showNewPw}
                      placeholder={t('enterNewPassword')}
                      placeholderTextColor="#9E9E9E"
                      textAlign={isUrdu ? 'right' : 'left'}
                    />
                    <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.eyeBtn}>
                      <Text style={styles.eyeIcon}>{showNewPw ? '👁️' : '👁'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={[styles.updateBtn, updateLoading && styles.updateBtnDisabled]} onPress={handleUpdate} disabled={updateLoading} activeOpacity={0.85}>
                {updateLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.updateBtnText}>{t('updateProfile')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelEditBtn}
                onPress={() => { setEditMode(false); setPassword(''); setCurrentPassword(''); setShowCurrentPw(false); setShowNewPw(false); setPendingProfilePic(null); }}
                activeOpacity={0.8}>
                <Text style={styles.cancelEditBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={styles.logoutBtnText}>{t('logout')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reviews Modal — at root level so onRequestClose works correctly */}
      <Modal visible={showReviewsModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowReviewsModal(false)}>
        <View style={styles.reviewsModal}>
          <View style={styles.reviewsModalHeader}>
            <TouchableOpacity onPress={() => setShowReviewsModal(false)} style={styles.reviewsModalBack}>
              <Text style={styles.reviewsModalBackText}>{isUrdu ? '→ واپس' : '← Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.reviewsModalTitle}>⭐ {isUrdu ? 'جائزے' : 'Reviews'} ({currentUser?.reviews?.length || 0})</Text>
            <View style={{ width: 60 }} />
          </View>
          <FlatList
            data={currentUser?.reviews || []}
            keyExtractor={(_, idx) => String(idx)}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={(
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>⭐</Text>
                <Text style={{ fontSize: 16, color: '#9E9E9E' }}>{isUrdu ? 'ابھی کوئی جائزہ نہیں' : 'No reviews yet'}</Text>
              </View>
            )}
            renderItem={({ item: review }: { item: any }) => (
              <View style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <StarRating rating={review.rating} size={16} />
                  <Text selectable style={[styles.reviewTitleText, isUrdu && styles.rtlText]}>{review.title}</Text>
                </View>
                <Text selectable style={[styles.reviewDetail, isUrdu && styles.rtlText]}>{review.detail}</Text>
                <Text selectable style={styles.reviewerName}>— {review.reviewerName}</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  langToggleContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 14,
    right: 16,
    zIndex: 100,
  },
  greenToast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999,
    backgroundColor: '#2E7D32', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
  },
  greenToastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileHeaderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#81C784',
  },
  avatarInitials: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: -4,
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  avatarEditBadgeTxt: { fontSize: 14 },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  ratingCount: { fontSize: 13, color: '#9E9E9E', fontWeight: '500', marginTop: 4, marginBottom: 6 },
  uploadProfileImageLink: { fontSize: 13, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline', marginTop: 6, marginBottom: 4 },
  seeAllReviewsLink: { fontSize: 13, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  roleBadgeText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  infoCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  infoCardTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B' },
  editBtn: {
    backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: '#C8E6C9',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 12,
  },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 4 },
  infoValue: { fontSize: 15, color: '#1B1B1B', fontWeight: '600', lineHeight: 22 },
  infoEditInput: {
    backgroundColor: '#F9F9F9', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1B1B1B',
  },
  infoEditMulti: { height: 70, textAlignVertical: 'top', paddingTop: 10 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pwInput: { flex: 1 },
  eyeBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  eyeIcon: { fontSize: 18 },
  updateBtn: {
    backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  updateBtnDisabled: { backgroundColor: '#81C784' },
  updateBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelEditBtn: {
    backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10,
    borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  cancelEditBtnText: { color: '#555555', fontSize: 15, fontWeight: '600' },
  reviewsModal: { flex: 1, backgroundColor: '#F8F9FA' },
  reviewsModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 14, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  reviewsModalBack: { padding: 6 },
  reviewsModalBackText: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  reviewsModalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  reviewItem: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reviewTitleText: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', flex: 1 },
  reviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20, marginBottom: 6 },
  reviewerName: { fontSize: 12, color: '#2E7D32', fontWeight: '600', fontStyle: 'italic' },
  logoutBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  logoutBtnText: { color: '#C62828', fontSize: 16, fontWeight: '800' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
});

export default FarmerProfileScreen;
