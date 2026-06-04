import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Animated, Alert, Platform,
  RefreshControl, BackHandler, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';
import LanguageToggle from '../../components/LanguageToggle';
import ImageViewer from '../../components/ImageViewer';
import {updateCurrentUserProfileInFirebase} from '../../services/firebaseAuthService';
import firebaseAuth from '../../firebase/auth';
import {logoutFromFirebaseSession} from '../../services/sessionService';

const InvestorProfileScreen = ({ navigation }: any) => {
  const { currentUser, setCurrentUser, users, setUsers, clearAppSessionState } = useApp();
  const { t, isUrdu } = useLanguage();

  const [editMode, setEditMode] = useState(false);
  const [firstName, setFirstName] = useState(currentUser?.firstName || '');
  const [lastName, setLastName] = useState(currentUser?.lastName || '');
  const [city, setCity] = useState(currentUser?.city || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [pendingProfilePic, setPendingProfilePic] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const viewerVisibleRef = useRef(viewerVisible);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
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

  const showToast = () => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const pickPic = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    if (result.assets && result.assets[0]?.uri) {
      setPendingProfilePic(result.assets![0].uri);
    }
  };

  const handleUpdate = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !city.trim() || !address.trim()) {
      Alert.alert('Error', t('allFieldsRequired')); return;
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

      const upd = {
        ...currentUser!,
        ...updatedProfile,
        id: updatedProfile?.uid || currentUser?.id,
        password: '',
      };
      setCurrentUser(upd);
      setUsers(prev => prev.map(u => u.id === currentUser?.id ? upd : u));
      setEditMode(false); setPassword(''); setCurrentPassword('');
      setShowCurrentPw(false); setShowNewPw(false);
      setPendingProfilePic(null);
      setUpdateLoading(false);
      showToast();
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
      console.warn('[InvestorProfile] update error:', error?.code || error?.message);
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
            console.warn('[InvestorProfile] logout error:', error);
          }
        },
      },
    ]);
  };

  const getInit = () => `${(currentUser?.firstName || 'I')[0]}${(currentUser?.lastName || 'I')[0]}`.toUpperCase();

  return (
    <View style={styles.container}>
      <InvestorHeader title={t('profile')} navigation={navigation} />

      {/* ── Language Toggle – top right of profile ── */}
      <View style={styles.langToggleContainer}>
        <LanguageToggle accentColor="#6A1B9A" />
      </View>

      {currentUser?.profilePic ? (
        <ImageViewer
          visible={viewerVisible}
          images={[currentUser.profilePic]}
          initialIndex={0}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastAnim }]}>
          <Text style={styles.toastText}>✅ {t('updateSuccess')}</Text>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6A1B9A']} tintColor="#6A1B9A" />
        }>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pendingProfilePic ? () => {} : (currentUser?.profilePic ? () => setViewerVisible(true) : pickPic)} activeOpacity={0.8}>
            {pendingProfilePic ? (
              <Image source={{ uri: pendingProfilePic }} style={styles.avatar} />
            ) : currentUser?.profilePic ? (
              <Image source={{ uri: currentUser.profilePic }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPH}><Text style={styles.avatarInit}>{getInit()}</Text></View>
            )}
            <View style={styles.avatarEditBadge} pointerEvents="none"><Text style={{ fontSize: 14 }}>📷</Text></View>
          </TouchableOpacity>
          {editMode && (
            <TouchableOpacity onPress={pickPic} activeOpacity={0.75}>
              <Text style={styles.uploadProfileImageLink}>Upload Profile Image</Text>
            </TouchableOpacity>
          )}

          <Text selectable style={styles.name}>{currentUser?.firstName} {currentUser?.lastName}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}><Text selectable style={styles.roleBadgeText}>{t('investor')}</Text></View>
            <View style={[styles.statusBadge, {
              backgroundColor: currentUser?.accountStatus === 'Approved' ? '#EDE7F6' : '#FFF8E1',
            }]}>
              <View style={[styles.statusDot, {
                backgroundColor: currentUser?.accountStatus === 'Approved' ? '#6A1B9A' : '#F9A825',
              }]} />
              <Text selectable style={[styles.statusText, {
                color: currentUser?.accountStatus === 'Approved' ? '#6A1B9A' : '#F9A825',
              }]}>
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

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text selectable style={[styles.infoTitle, isUrdu && styles.rtlText]}>{t('personalInformation')}</Text>
            {!editMode && (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditMode(true)} activeOpacity={0.8}>
                <Text style={styles.editBtnText}>{t('edit')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Account Number */}
          <View style={styles.row}>
            <Text style={styles.rowIcon}>🪪</Text>
            <View style={{ flex: 1 }}>
              <Text selectable style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('accountNumber')}</Text>
              <Text selectable style={[styles.rowValue, isUrdu && styles.rtlText]}>{currentUser?.cnic || '—'}</Text>
            </View>
          </View>

          {/* Email — read-only */}
          <View style={styles.row}>
            <Text style={styles.rowIcon}>📧</Text>
            <View style={{ flex: 1 }}>
              <Text selectable style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('email')}</Text>
              <Text selectable style={[styles.rowValue, isUrdu && styles.rtlText]}>{currentUser?.email || '—'}</Text>
            </View>
          </View>

          {/* Phone */}
          <View style={styles.row}>
            <Text style={styles.rowIcon}>📱</Text>
            <View style={{ flex: 1 }}>
              <Text selectable style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('phone')}</Text>
              {editMode ? (
                <TextInput style={[styles.editInput, isUrdu && styles.rtlInput]} value={phone}
                  onChangeText={setPhone} placeholderTextColor="#9E9E9E" keyboardType="numeric"
                  textAlign={isUrdu ? 'right' : 'left'} />
              ) : (
                <Text selectable style={[styles.rowValue, isUrdu && styles.rtlText]}>{currentUser?.phone || '—'}</Text>
              )}
            </View>
          </View>

          {/* City */}
          <View style={styles.row}>
            <Text style={styles.rowIcon}>🏙️</Text>
            <View style={{ flex: 1 }}>
              <Text selectable style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('cityLabel')}</Text>
              {editMode ? (
                <TextInput style={[styles.editInput, isUrdu && styles.rtlInput]} value={city}
                  onChangeText={setCity} placeholderTextColor="#9E9E9E"
                  textAlign={isUrdu ? 'right' : 'left'} />
              ) : (
                <Text selectable style={[styles.rowValue, isUrdu && styles.rtlText]}>{currentUser?.city || '—'}</Text>
              )}
            </View>
          </View>

          {/* Address */}
          <View style={styles.row}>
            <Text style={styles.rowIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text selectable style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('address')}</Text>
              {editMode ? (
                <TextInput style={[styles.editInput, styles.editMulti, isUrdu && styles.rtlInput]}
                  value={address} onChangeText={setAddress} multiline numberOfLines={3}
                  textAlignVertical="top" placeholderTextColor="#9E9E9E"
                  textAlign={isUrdu ? 'right' : 'left'} />
              ) : (
                <Text selectable style={[styles.rowValue, isUrdu && styles.rtlText]}>{currentUser?.address || '—'}</Text>
              )}
            </View>
          </View>

          {editMode && (
            <>
              {/* First Name */}
              <View style={styles.row}>
                <Text style={styles.rowIcon}>👤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('firstName')}</Text>
                  <TextInput style={[styles.editInput, isUrdu && styles.rtlInput]} value={firstName}
                    onChangeText={setFirstName} placeholderTextColor="#9E9E9E"
                    textAlign={isUrdu ? 'right' : 'left'} />
                </View>
              </View>
              {/* Last Name */}
              <View style={styles.row}>
                <Text style={styles.rowIcon}>👤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('lastName')}</Text>
                  <TextInput style={[styles.editInput, isUrdu && styles.rtlInput]} value={lastName}
                    onChangeText={setLastName} placeholderTextColor="#9E9E9E"
                    textAlign={isUrdu ? 'right' : 'left'} />
                </View>
              </View>
              {/* Current Password */}
              <View style={styles.row}>
                <Text style={styles.rowIcon}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isUrdu && styles.rtlText]}>
                    {isUrdu ? 'موجودہ پاس ورڈ (پاس ورڈ تبدیل کرنے کے لیے)' : 'Current Password (required to change password)'}
                  </Text>
                  <View style={styles.pwRow}>
                    <TextInput style={[styles.editInput, styles.pwInput, isUrdu && styles.rtlInput]} value={currentPassword}
                      onChangeText={setCurrentPassword} secureTextEntry={!showCurrentPw}
                      placeholder={isUrdu ? 'موجودہ پاس ورڈ درج کریں' : 'Enter current password'}
                      placeholderTextColor="#9E9E9E" textAlign={isUrdu ? 'right' : 'left'} />
                    <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.eyeBtn}>
                      <Text style={styles.eyeIcon}>{showCurrentPw ? '👁️' : '👁'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {/* New Password */}
              <View style={styles.row}>
                <Text style={styles.rowIcon}>🔑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isUrdu && styles.rtlText]}>{t('newPassword')}</Text>
                  <View style={styles.pwRow}>
                    <TextInput style={[styles.editInput, styles.pwInput, isUrdu && styles.rtlInput]} value={password}
                      onChangeText={setPassword} secureTextEntry={!showNewPw} placeholder={t('enterNewPassword')}
                      placeholderTextColor="#9E9E9E" textAlign={isUrdu ? 'right' : 'left'} />
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditMode(false); setPassword(''); setCurrentPassword(''); setShowCurrentPw(false); setShowNewPw(false); setPendingProfilePic(null); }} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={styles.logoutBtnText}>{t('logout')}</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
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
  toast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999, backgroundColor: '#2E7D32',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#6A1B9A' },
  avatarPH: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#CE93D8',
  },
  avatarInit: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: -4, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  name: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  uploadProfileImageLink: { fontSize: 13, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline', marginTop: 6, marginBottom: 4 },
  roleBadge: { backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  roleBadgeText: { fontSize: 13, fontWeight: '700', color: '#6A1B9A' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, gap: 5,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  infoTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B' },
  editBtn: {
    backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 7, borderWidth: 1.5, borderColor: '#CE93D8',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#6A1B9A' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 12,
  },
  rowIcon: { fontSize: 20, marginTop: 2 },
  rowLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 4 },
  rowValue: { fontSize: 15, color: '#1B1B1B', fontWeight: '600', lineHeight: 22 },
  editInput: {
    backgroundColor: '#F9F9F9', borderRadius: 10, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1B1B1B',
  },
  editMulti: { height: 70, textAlignVertical: 'top', paddingTop: 10 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pwInput: { flex: 1 },
  eyeBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  eyeIcon: { fontSize: 18 },
  updateBtn: {
    backgroundColor: '#6A1B9A', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20,
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  updateBtnDisabled: { backgroundColor: '#CE93D8' },
  updateBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 13,
    alignItems: 'center', marginTop: 10, borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  cancelBtnText: { color: '#555555', fontSize: 15, fontWeight: '600' },
  logoutBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A',
  },
  logoutBtnText: { color: '#C62828', fontSize: 16, fontWeight: '800' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
});

export default InvestorProfileScreen;
