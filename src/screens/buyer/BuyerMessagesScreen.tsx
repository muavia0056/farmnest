import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions,
  Animated, PermissionsAndroid, ScrollView, Alert, NativeModules, BackHandler, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import BuyerHeader from '../../components/BuyerHeader';
import ImageViewer from '../../components/ImageViewer';
import {
  sendTextMessageToFirebase,
  markConversationAsReadInFirebase,
  deleteMessageFromFirebase,
  sendImageMessageToFirebase,
  sendAudioMessageToFirebase,
} from '../../services/firebaseMessageService';
const { width } = Dimensions.get('window');

const formatDuration = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const BuyerMessagesScreen = ({ navigation, route }: any) => {
  const { currentUser, messages, setMessages, users, cropPosts, blockUser, unblockUser, isBlocked } = useApp();
  const { t, isUrdu } = useLanguage();

  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [showChatModal, setShowChatModal] = useState(false);
  const [showFarmerList, setShowFarmerList] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalOpenCount, setProfileModalOpenCount] = useState(0);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Image viewer for profile pictures
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

  const openProfileImageViewer = (uri: string) => {
    setViewerImages([uri]);
    setViewerVisible(true);
  };

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const showReviewsModalRef = useRef(showReviewsModal);
  const showProfileModalRef = useRef(showProfileModal);
  const showChatModalRef    = useRef(showChatModal);
  const showFarmerListRef   = useRef(showFarmerList);
  const viewerVisibleRef    = useRef(viewerVisible);
  useEffect(() => { showReviewsModalRef.current = showReviewsModal; }, [showReviewsModal]);
  useEffect(() => { showProfileModalRef.current = showProfileModal; }, [showProfileModal]);
  useEffect(() => { showChatModalRef.current    = showChatModal;    }, [showChatModal]);
  useEffect(() => { showFarmerListRef.current   = showFarmerList;   }, [showFarmerList]);
  useEffect(() => { viewerVisibleRef.current    = viewerVisible;    }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)    { setViewerVisible(false);   return true; }
        if (showReviewsModalRef.current) { setShowReviewsModal(false); return true; }
        if (showProfileModalRef.current) { setShowProfileModal(false); setShowReviewsModal(false); return true; }
        if (showChatModalRef.current)    { setShowChatModal(false);    return true; }
        if (showFarmerListRef.current)   { setShowFarmerList(false);   return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // ── Voice recording state — all live directly in the component ──────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const playingAudioIdRef = useRef<string | null>(null);

  const recorderRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const playerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const arPlayerRef = recorderRef; // legacy alias
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = useRef(0);
  const recordedPathRef = useRef<string>('');
  const isRecordingRef = useRef(false);
  const activeChatUserIdRef = useRef<string | null>(null);
  const waveAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const micScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => { activeChatUserIdRef.current = activeChatUserId; }, [activeChatUserId]);

  // Pre-warm mic permission
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission',
        message: 'Farmnest needs microphone access to send voice messages.',
        buttonPositive: 'Allow', buttonNegative: 'Deny',
      });
    }
  }, []);

  const startWave = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 80),
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ])).start();
    });
  }, [waveAnims]);

  const stopWave = useCallback(() => {
    waveAnims.forEach(a => { a.stopAnimation(); a.setValue(0.3); });
  }, [waveAnims]);

  // Stop recording and send (tap while recording)
  const handleMicPress = useCallback(async () => {
    if (!activeChatUserId || !currentUser) {
      Alert.alert('Error', 'Please open a chat first.');
      return;
    }

    if (!isRecordingRef.current) {
      const granted = Platform.OS === 'android'
        ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
            title: 'Microphone Permission',
            message: 'Farmnest needs microphone access to send voice messages.',
            buttonPositive: 'Allow', buttonNegative: 'Deny',
          })
        : 'granted';
      if (granted !== PermissionsAndroid.RESULTS.GRANTED && granted !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone permission is required to send voice messages.');
        return;
      }

      try {
        const path = await arPlayerRef.current.startRecorder();
        recordedPathRef.current = path;
        isRecordingRef.current = true;
        setIsRecording(true);

        stopWave();
        startWave();

        timerRef.current = setInterval(() => {
          recordSecsRef.current += 1;
          setRecordSecs(recordSecsRef.current);
        }, 1000);

        Animated.spring(micScaleAnim, {toValue: 1.15, useNativeDriver: true}).start();
      } catch (error) {
        Alert.alert('Recorder Error', 'Failed to start recording.');
        console.log('Buyer start recording error:', error);
      }
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    isRecordingRef.current = false;
    setIsRecording(false);
    stopWave();
    Animated.spring(micScaleAnim, {toValue: 1, useNativeDriver: true}).start();

    try {
      const resultPath = await arPlayerRef.current.stopRecorder();
      arPlayerRef.current.removeRecordBackListener();

      const finalPath = resultPath || recordedPathRef.current || '';
      const finalDuration = recordSecsRef.current;

      recordSecsRef.current = 0;
      setRecordSecs(0);

      if (!finalPath) {
        Alert.alert('Recorder Error', 'No audio recording found.');
        return;
      }

      setLoading(true);

      await sendAudioMessageToFirebase({
        receiverId: activeChatUserId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderRole: currentUser.role,
        audioUri: finalPath,
        audioDuration: finalDuration,
      });

      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to send voice message. Please try again.';

      if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_AUDIO_UPLOAD_FAILED') {
        message = 'Audio upload failed. Please try again.';
      }

      Alert.alert('Voice Message Error', message);
      console.log('Buyer handleMicPress error:', error);
    }
  }, [activeChatUserId, currentUser, micScaleAnim, startWave, stopWave]);

  // Start recording on long press
  const handleMicLongPress = useCallback(async () => {
    if (isRecordingRef.current) return; // already recording
    let hasPermission = true;
    if (Platform.OS === 'android') {
      const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (!status) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone Permission',
          message: 'Farmnest needs microphone access to send voice messages.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        });
        hasPermission = result === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Please allow microphone access in Settings to send voice messages.');
      return;
    }

    // Stop any lingering playback before recording.
    try { await playerRef.current.stopPlayer(); } catch {}
    playerRef.current.removePlayBackListener();
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);

    recorderRef.current.removeRecordBackListener();
    recorderRef.current = new AudioRecorderPlayer();
    const arp = recorderRef.current;

    recordSecsRef.current = 0;
    setRecordSecs(0);

    // Unique path per recording so every voice message plays independently.
    const filePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/voice_${Date.now()}.mp4`;
    try {
      await arp.startRecorder(filePath);
    } catch (err: any) {
      console.warn('[BuyerMessages] startRecorder error:', err);
      Alert.alert('Error', 'Could not start recording. Please restart the app and try again.');
      return;
    }

    isRecordingRef.current = true;
    setIsRecording(true);
    startWave();
    Animated.spring(micScaleAnim, { toValue: 1.4, useNativeDriver: true }).start();

    timerRef.current = setInterval(() => {
      recordSecsRef.current += 1;
      setRecordSecs(recordSecsRef.current);
    }, 1000);
  }, [startWave, micScaleAnim]);

  const cancelRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    setIsRecording(false);
    recordSecsRef.current = 0;
    setRecordSecs(0);
    stopWave();
    Animated.spring(micScaleAnim, { toValue: 1, useNativeDriver: true }).start();
    try { await recorderRef.current.stopRecorder(); } catch {}
    recorderRef.current.removeRecordBackListener();
  }, [stopWave, micScaleAnim]);

  // Stop playback cleanly
  const stopPlayback = useCallback(async () => {
    try { await playerRef.current.stopPlayer(); } catch {}
    playerRef.current.removePlayBackListener();
    const prevId = playingAudioIdRef.current;
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    if (prevId) setPlaybackProgress(prev => ({ ...prev, [prevId]: 0 }));
  }, []);

  // Play / pause toggle
  const togglePlayAudio = useCallback(async (msgId: string, uri: string) => {
    if (playingAudioIdRef.current === msgId) { await stopPlayback(); return; }
    if (playingAudioIdRef.current) await stopPlayback();
    // Do not start playback while recording
    if (isRecordingRef.current) return;
    playingAudioIdRef.current = msgId;
    setPlayingAudioId(msgId);
    await playerRef.current.startPlayer(uri);
    playerRef.current.addPlayBackListener(e => {
      const progress = e.currentPosition / (e.duration || 1);
      setPlaybackProgress(prev => ({ ...prev, [msgId]: progress }));
      if (e.currentPosition >= e.duration && e.duration > 0) stopPlayback();
    });
  }, [stopPlayback]);

  // Stop playback when modal closes
  useEffect(() => {
    if (!showChatModal) stopPlayback();
  }, [showChatModal, stopPlayback]);

  // Sync activeChatUserIdRef
  useEffect(() => { activeChatUserIdRef.current = activeChatUserId; }, [activeChatUserId]);

  // All farmers who have active crops
  const farmersWithCrops = Array.from(
    new Set(cropPosts.filter(p => p.status === 'Active').map(p => p.farmerId))
  ).map(id => users.find(u => u.id === id)).filter(Boolean);

  // Safe helper to get current user ID
  const currentUserId = currentUser?.id ?? '';

  // Existing conversations — include blocked users so they can be unblocked
  const incomingMessages = messages.filter(
    m => m.receiverId === currentUserId
  );
  const outgoingMessages = messages.filter(m => m.senderId === currentUserId);
  const allChatPartnerIds = Array.from(new Set([
    ...incomingMessages.map(m => m.senderId),
    ...outgoingMessages.map(m => m.receiverId),
  ]));
  const conversations = allChatPartnerIds.map(partnerId => {
    const allMsgs = messages.filter(m =>
      (m.senderId === currentUserId && m.receiverId === partnerId) ||
      (m.senderId === partnerId && m.receiverId === currentUserId)
    ).sort((a, b) => b.timestamp - a.timestamp);
    const lastMsg = allMsgs[0];
    const partner = users.find(u => u.id === partnerId);
    // FIXED: Use safe currentUserId instead of currentUser!.id
    const blocked = currentUserId ? isBlocked(currentUserId, partnerId) : false;
    const unread = blocked ? 0 : messages.filter(
      m => m.senderId === partnerId && m.receiverId === currentUserId && !m.read
    ).length;
    return { partnerId, partner, lastMsg, unread, blocked };
  }).filter(c => c.partner);

  const isAdminUser = (user: any) => user?.role === 'Admin';

  const openChat = async (userId: string) => {
   setActiveChatUserId(userId);
  activeChatUserIdRef.current = userId;
  setShowChatModal(true);

  setMessages(prev =>
    prev.map(m =>
      m.senderId === userId && m.receiverId === currentUserId
        ? {...m, read: true}
        : m,
    ),
  );

  try {
    if (currentUserId) {
      await markConversationAsReadInFirebase(currentUserId, userId);
    }
  } catch (error) {
    console.log('Farmer openChat read update error:', error);
  }
  };

  // Sync ref whenever state changes
  useEffect(() => { activeChatUserIdRef.current = activeChatUserId; }, [activeChatUserId]);

  // Auto-open chat if navigated with openChatWithUserId param
  useEffect(() => {
    const targetUserId = route?.params?.openChatWithUserId;
    if (targetUserId) {
      openChat(targetUserId);
      navigation.setParams({ openChatWithUserId: undefined });
    }
  }, [route?.params?.openChatWithUserId]);

  const sendMessage = async () => {
    if (!chatText.trim() || !activeChatUserId || !currentUser) return;
    if (isBlocked(activeChatUserId, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }
    const msgText = chatText.trim();
    setChatText('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      await sendTextMessageToFirebase({
        receiverId: activeChatUserId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        senderRole: currentUser.role,
        text: msgText,
      });
    } catch (error) {
      Alert.alert('Message Error', 'Failed to send message.');
      console.log('Buyer sendMessage error:', error);
    }
  };

  const [loading, setLoading] = useState(false);

  const sendImageMsg = async () => {
    if (!activeChatUserId || !currentUser) {
      Alert.alert('Error', 'Please open a chat first.');
      return;
    }
    // FIXED: Safe check using currentUser.id instead of currentUser!.id
    if (isBlocked(activeChatUserId, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }

    try {
      setLoading(true);

      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      const pickedUri = result.assets?.[0]?.uri;

      if (!pickedUri) {
        setLoading(false);
        return;
      }

      await sendImageMessageToFirebase({
        receiverId: activeChatUserId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderRole: currentUser.role,
        imageUri: pickedUri,
      });

      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to send image message. Please try again.';

      if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_UPLOAD_FAILED') {
        message = 'Image upload failed. Please try again.';
      }

      Alert.alert('Image Message Error', message);
      console.log('Buyer sendImageMsg error:', error);
    }
  };

  // FIX: delete a message by id
  const deleteMessage = (msgId: string) => {
    Alert.alert(t('deleteMessageTitle'), t('deleteMessageConfirm'), [
    {text: t('cancelLabel2'), style: 'cancel'},
    {
      text: t('deleteLabel2'),
      style: 'destructive',
      onPress: async () => {
        try {
          await deleteMessageFromFirebase(msgId);
        } catch (error) {
          Alert.alert('Delete Error', 'Failed to delete message.');
          console.log('Farmer deleteMessage error:', error);
        }
      },
    },
  ]);
  };

  const activePartner = users.find(u => u.id === activeChatUserId);
  // FIXED: Don't hide messages from blocked users — blocking only prevents NEW messages
  const chatMessages = messages.filter(m =>
    (m.senderId === currentUserId && m.receiverId === activeChatUserId) ||
    (m.senderId === activeChatUserId && m.receiverId === currentUserId)
  ).sort((a, b) => a.timestamp - b.timestamp);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const totalUnread = messages.filter(m => m.receiverId === currentUserId && !m.read).length;

  const openProfileVisit = (user: any) => {
    setProfileUser(user);
    setProfileModalOpenCount(c => c + 1);
    setShowProfileModal(true);
  };

  const StarRating = ({ rating, size = 18 }: { rating: number; size?: number }) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Text key={s} style={{ fontSize: size, color: s <= rating ? '#F9A825' : '#E0E0E0' }}>★</Text>
      ))}
    </View>
  );

  // FIXED: Show loading if currentUser is not ready yet
  if (!currentUser) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={{ marginTop: 16, color: '#757575' }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BuyerHeader
        title={t('messages')}
        navigation={navigation}
        notifCount={totalUnread}
      />

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noMessages')}</Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('tapToMessageFarmer')}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.partnerId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convCard} onPress={() => openChat(item.partnerId)} activeOpacity={0.8}>
              {item.partner?.profilePic ? (
                <Image source={{ uri: item.partner.profilePic }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{item.partner?.firstName[0]}{item.partner?.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.convInfo}>
                <View style={styles.convTopRow}>
                  <Text selectable style={[styles.convName, isUrdu && styles.rtlText]}>{item.partner?.firstName} {item.partner?.lastName}</Text>
                  <Text style={styles.convTime}>{item.lastMsg ? formatTime(item.lastMsg.timestamp) : ''}</Text>
                </View>
                <View style={styles.convBottom}>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>
                      {item.partner?.role === 'Admin' ? '👑 Admin' : `🌾 ${t('farmerRole')}`}
                    </Text>
                  </View>
                  <Text selectable style={styles.convPreview} numberOfLines={1}>
                    {item.lastMsg?.audio ? t('voiceMessagePreview') : item.lastMsg?.text || t('imagePreview')}
                  </Text>
                </View>
              </View>
              {item.blocked ? (
                <View style={styles.blockedBadge}>
                  <Text style={styles.blockedBadgeText}>🚫 Blocked</Text>
                </View>
              ) : item.unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Farmer picker modal */}
      <Modal visible={showFarmerList} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowFarmerList(false)}>
        <View style={styles.farmerListOverlay}>
          <View style={styles.farmerListCard}>
            <View style={styles.farmerListHeader}>
              <Text style={[styles.farmerListTitle, isUrdu && styles.rtlText]}>{t('messageAFarmer')}</Text>
              <TouchableOpacity onPress={() => setShowFarmerList(false)} style={styles.farmerListClose}>
                <Text style={styles.farmerListCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            {farmersWithCrops.length === 0 ? (
              <Text style={[styles.noFarmersText, isUrdu && styles.rtlText]}>{t('noFarmersWithCrops')}</Text>
            ) : (
              <FlatList
                data={farmersWithCrops}
                keyExtractor={item => (item as any).id}
                renderItem={({ item }) => {
                  const farmer = item as any;
                  return (
                    <TouchableOpacity style={styles.farmerListItem} onPress={() => openChat(farmer.id)} activeOpacity={0.8}>
                      {farmer.profilePic ? (
                        <Image source={{ uri: farmer.profilePic }} style={styles.farmerListAvatar} />
                      ) : (
                        <View style={styles.farmerListAvatarPlaceholder}>
                          <Text style={styles.farmerListAvatarInit}>{farmer.firstName[0]}{farmer.lastName[0]}</Text>
                        </View>
                      )}
                      <View style={styles.farmerListInfo}>
                        <Text selectable style={[styles.farmerListName, isUrdu && styles.rtlText]}>{farmer.firstName} {farmer.lastName}</Text>
                        <Text selectable style={[styles.farmerListCity, isUrdu && styles.rtlText]}>📍 {farmer.city}</Text>
                      </View>
                      <Text style={styles.farmerListArrow}>›</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Global image viewer — accessible from chat header and profile modal */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={0}
        onClose={() => setViewerVisible(false)}
      />

      {/* PROFILE VISIT MODAL — at root level so it is NOT nested inside Chat Modal (fixes Android scroll) */}
      <Modal visible={showProfileModal} animationType="slide" statusBarTranslucent onRequestClose={() => { setShowProfileModal(false); setShowReviewsModal(false); }}>
        <View style={styles.profileModal}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => { setShowProfileModal(false); setShowReviewsModal(false); }} style={styles.profileModalBack}>
              <Text style={[styles.profileModalBackText, isUrdu && styles.rtlText]}>{t('backLabel')}</Text>
            </TouchableOpacity>
            <Text style={styles.profileModalTitle}>{t('farmerProfileTitle')}</Text>
            <View style={{ width: 60 }} />
          </View>
          {profileUser && (
            <ScrollView
              key={`buyer-profile-${profileUser?.id}-${profileModalOpenCount}`}
              style={{ flex: 1 }}
              contentContainerStyle={styles.profileModalScroll}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              bounces={true}
            >
              <View style={styles.profileModalAvatarSection}>
                {profileUser.profilePic ? (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openProfileImageViewer(profileUser.profilePic)}>
                    <Image source={{ uri: profileUser.profilePic }} style={styles.profileModalAvatar} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.profileModalAvatarPH}>
                    <Text style={styles.profileModalAvatarInit}>{profileUser.firstName[0]}{profileUser.lastName[0]}</Text>
                  </View>
                )}
                <Text selectable style={styles.profileModalName}>{profileUser.firstName} {profileUser.lastName}</Text>
                {(() => {
                  const reviews = profileUser.reviews || [];
                  const avg = reviews.length ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
                  return (
                    <>
                      <StarRating rating={Math.round(avg)} size={20} />
                      <Text style={styles.profileModalRatingCount}>({reviews.length} {t('reviewsCountLabel')})</Text>
                      {reviews.length > 0 && (
                        <TouchableOpacity onPress={() => setShowReviewsModal(true)} activeOpacity={0.75}>
                          <Text style={styles.profileModalSeeReviews}>{t('seeAllReviews')}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
                <View style={styles.profileModalRolePill}>
                  <Text style={styles.profileModalRolePillText}>🌾 {t('farmerRoleLabel')}</Text>
                </View>
              </View>
              <View style={styles.profileModalInfoCard}>
                {[
                  { icon: '🏧', labelKey: 'infoAccountNumber', value: profileUser.cnic },
                  { icon: '📧', labelKey: 'infoEmail', value: profileUser.email },
                  { icon: '📱', labelKey: 'infoPhone', value: profileUser.phone },
                  { icon: '🏙️', labelKey: 'infoCity', value: profileUser.city },
                  { icon: '📍', labelKey: 'infoAddress', value: profileUser.address },
                ].map(row => (
                  <View key={row.labelKey} style={styles.profileModalInfoRow}>
                    <Text style={styles.profileModalInfoIcon}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text selectable style={styles.profileModalInfoLabel}>{t(row.labelKey)}</Text>
                      <Text selectable style={styles.profileModalInfoValue}>{row.value || '—'}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* REVIEWS MODAL — also at root level */}
      <Modal visible={showReviewsModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowReviewsModal(false)}>
        <View style={styles.profileModal}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => setShowReviewsModal(false)} style={styles.profileModalBack}>
              <Text style={[styles.profileModalBackText, isUrdu && styles.rtlText]}>{t('backLabel')}</Text>
            </TouchableOpacity>
            <Text style={styles.profileModalTitle}>⭐ {t('reviewsReceived')} ({(profileUser?.reviews || []).length})</Text>
            <View style={{ width: 60 }} />
          </View>
          <FlatList
            data={profileUser?.reviews || []}
            keyExtractor={(_: any, idx: number) => String(idx)}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>⭐</Text>
                <Text style={{ fontSize: 16, color: '#9E9E9E' }}>{t('noReviewsYet')}</Text>
              </View>
            }
            renderItem={({ item: review }: { item: any }) => (
              <View style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <StarRating rating={review.rating} size={16} />
                  <Text selectable style={styles.reviewTitleText}>{review.title}</Text>
                </View>
                <Text selectable style={styles.reviewDetail}>{review.detail}</Text>
                <Text selectable style={styles.reviewerName}>— {review.reviewerName}</Text>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Chat Modal */}
      <Modal visible={showChatModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowChatModal(false)}>
        <View style={styles.chatModal}>
          <View style={styles.chatHeader}>
            <TouchableOpacity style={styles.chatBackBtn} onPress={() => setShowChatModal(false)}>
              <Text style={styles.chatBackIcon}>←</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => activePartner && !isAdminUser(activePartner) && openProfileVisit(activePartner)} activeOpacity={0.8} style={styles.chatHeaderTouchable}>
              {activePartner?.profilePic ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => activePartner?.profilePic && openProfileImageViewer(activePartner.profilePic)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Image source={{ uri: activePartner.profilePic }} style={styles.chatAvatar} />
                </TouchableOpacity>
              ) : (
                <View style={styles.chatAvatarPlaceholder}>
                  <Text style={styles.chatAvatarInitials}>{activePartner?.firstName?.[0]}{activePartner?.lastName?.[0]}</Text>
                </View>
              )}
              <View style={styles.chatHeaderInfo}>
                <Text selectable style={styles.chatHeaderName}>{activePartner?.firstName} {activePartner?.lastName}</Text>
                <Text style={styles.chatHeaderRole}>
                  {activePartner?.role === 'Admin' ? '👑 Admin' : `🌾 ${t('farmerRole')}`}{!isAdminUser(activePartner) ? ` · ${t('tapToVisitProfile')}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
            {!isAdminUser(activePartner) && (
              <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenuModal(true)} activeOpacity={0.7}>
                <Text style={styles.menuBtnText}>⋮</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Block/Unblock Menu Modal */}
          <Modal visible={showMenuModal} transparent animationType="fade" onRequestClose={() => setShowMenuModal(false)}>
            <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenuModal(false)}>
              <View style={styles.menuSheet}>
                <Text style={styles.menuSheetTitle}>{activePartner?.firstName} {activePartner?.lastName}</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.75}
                  onPress={() => {
                    setShowMenuModal(false);
                    // FIXED: Safe null check for currentUserId and activeChatUserId
                    if (!currentUserId || !activeChatUserId) return;
                    const blocked = isBlocked(currentUserId, activeChatUserId);
                    Alert.alert(
                      blocked ? 'Unblock User' : 'Block User',
                      blocked
                        ? `Are you sure you want to unblock ${activePartner?.firstName}? They will be able to send you messages again.`
                        : `Are you sure you want to block ${activePartner?.firstName}? You will no longer receive messages from them.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: blocked ? 'Unblock' : 'Block',
                          style: blocked ? 'default' : 'destructive',
                          onPress: () => {
                            if (!currentUserId || !activeChatUserId) return;
                            if (blocked) unblockUser(currentUserId, activeChatUserId);
                            else blockUser(currentUserId, activeChatUserId);
                          },
                        },
                      ]
                    );
                  }}>
                  <Text style={[
                    styles.menuItemText,
                    // FIXED: Safe null check
                    (currentUserId && activeChatUserId && isBlocked(currentUserId, activeChatUserId)) ? styles.menuItemUnblock : styles.menuItemBlock,
                  ]}>
                    {(currentUserId && activeChatUserId && isBlocked(currentUserId, activeChatUserId)) ? '🔓 Unblock User' : '🚫 Block User'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, styles.menuItemCancel]} onPress={() => setShowMenuModal(false)} activeOpacity={0.75}>
                  <Text style={styles.menuItemCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          <FlatList
            ref={flatListRef}
            data={chatMessages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.chatMessages}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isMine = item.senderId === currentUserId;
              const isPlaying = playingAudioId === item.id;
              return (
                // FIX: long-press any bubble to get delete option
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={() => deleteMessage(item.id)}
                  style={[styles.bubbleWrap, isMine ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {item.audio ? (
                      <TouchableOpacity
                        style={styles.audioBubble}
                        onPress={() => togglePlayAudio(item.id, item.audio!)}
                        activeOpacity={0.7}>
                        <View style={[styles.audioPlayBtn, isMine ? styles.audioPlayBtnMine : styles.audioPlayBtnTheirs]}>
                          <Text style={[styles.audioPlayIcon, isMine ? styles.audioPlayIconMine : styles.audioPlayIconTheirs]}>{isPlaying ? '⏸' : '▶'}</Text>
                        </View>
                        <View style={styles.audioWaveContainer}>
                          {[0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.75, 0.45, 0.9, 0.55].map((h, idx) => {
                            const progress = playbackProgress[item.id] ?? 0;
                            const barPos = idx / 10;
                            const filled = isPlaying && barPos <= progress;
                            return (
                              <View
                                key={idx}
                                style={[
                                  styles.audioWaveBar,
                                  { height: 18 * h },
                                  filled
                                    ? (isMine ? styles.audioWaveBarMineFilled : styles.audioWaveBarTheirsFilled)
                                    : (isMine ? styles.audioWaveBarMine : styles.audioWaveBarTheirs),
                                ]}
                              />
                            );
                          })}
                        </View>
                        <Text style={[styles.audioDuration, isMine ? styles.audioDurationMine : styles.audioDurationTheirs]}>
                          {formatDuration(item.audioDuration ?? 0)}
                        </Text>
                      </TouchableOpacity>
                    ) : item.image ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => { setViewerImages([item.image!]); setViewerVisible(true); }}>
                        <Image source={{ uri: item.image }} style={styles.bubbleImage} />
                      </TouchableOpacity>
                    ) : (
                      <Text selectable style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>{item.text}</Text>
                    )}
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>{formatTime(item.timestamp)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {isRecording && (
              <View style={styles.recordingBar}>
                <View style={styles.recordingLeft}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTimer}>{formatDuration(recordSecs)}</Text>
                  <View style={styles.recordingWave}>
                    {waveAnims.map((anim, i) => (
                      <Animated.View key={i} style={[styles.recordingWaveBar, { transform: [{ scaleY: anim }] }]} />
                    ))}
                  </View>
                </View>
                <TouchableOpacity onPress={cancelRecording} activeOpacity={0.7} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>{t('cancelRecordingBtn')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.chatInputBar}>
              {!isRecording && (
                <TouchableOpacity style={styles.plusBtn} onPress={sendImageMsg} activeOpacity={0.75}>
                  <Text style={styles.plusBtnText}>＋</Text>
                </TouchableOpacity>
              )}
              {!isRecording && (
                <TextInput
                  style={[styles.chatInput, isUrdu && styles.rtlInput]}
                  placeholder={t('typeMessage')}
                  placeholderTextColor="#9E9E9E"
                  value={chatText}
                  onChangeText={setChatText}
                  multiline
                  textAlign={isUrdu ? 'right' : 'left'}
                />
              )}
              {isRecording && <View style={{ flex: 1 }} />}
              {chatText.trim() ? (
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={sendMessage}
                  activeOpacity={0.8}>
                  <Text style={styles.sendBtnText}>➤</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.micBtn, isRecording && styles.micBtnActive]}
                  onPress={handleMicPress}
                  onLongPress={handleMicLongPress}
                  delayLongPress={200}
                  activeOpacity={0.7}>
                  <Text style={styles.micBtnIcon}>🎤</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  newMsgBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  newMsgBtnText: { fontSize: 18 },
  listContent: { padding: 14 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  convCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 14, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarPlaceholder: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  convTime: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
  convBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  convPreview: { flex: 1, fontSize: 12, color: '#757575' },
  unreadBadge: {
    backgroundColor: '#E53935', borderRadius: 12, minWidth: 22, height: 22,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  blockedBadge: { backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  blockedBadgeText: { color: '#C62828', fontSize: 10, fontWeight: '700' },
  farmerListOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  farmerListCard: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, maxHeight: '75%',
  },
  farmerListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  farmerListTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  farmerListClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  farmerListCloseTxt: { fontSize: 15, color: '#555555', fontWeight: '700' },
  noFarmersText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center', paddingVertical: 20 },
  farmerListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  farmerListAvatar: { width: 46, height: 46, borderRadius: 23 },
  farmerListAvatarPlaceholder: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center',
  },
  farmerListAvatarInit: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  farmerListInfo: { flex: 1 },
  farmerListName: { fontSize: 15, fontWeight: '700', color: '#1B1B1B' },
  farmerListCity: { fontSize: 12, color: '#9E9E9E', fontWeight: '500' },
  farmerListArrow: { fontSize: 22, color: '#C8C8C8', fontWeight: '700' },
  chatModal: { flex: 1, backgroundColor: '#F0F4F0' },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 14, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 4,
  },
  menuBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { fontSize: 22, color: '#1B1B1B', fontWeight: '700', lineHeight: 26 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 20 },
  menuSheetTitle: { fontSize: 14, color: '#9E9E9E', fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  menuItem: { paddingVertical: 16, borderRadius: 14, backgroundColor: '#F8F9FA', marginBottom: 10, alignItems: 'center' },
  menuItemText: { fontSize: 16, fontWeight: '700' },
  menuItemBlock: { color: '#E53935' },
  menuItemUnblock: { color: '#2E7D32' },
  menuItemCancel: { backgroundColor: '#EEEEEE' },
  menuItemCancelText: { fontSize: 15, fontWeight: '600', color: '#555555' },
  chatBackBtn: { padding: 8 },
  chatBackIcon: { fontSize: 22, color: '#1B1B1B', fontWeight: '700' },
  chatAvatar: { width: 42, height: 42, borderRadius: 21 },
  chatAvatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
  chatAvatarInitials: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 16, fontWeight: '800', color: '#1B1B1B' },
  chatHeaderRole: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  chatMessages: { padding: 16, paddingBottom: 10 },
  bubbleWrap: { flexDirection: 'row', marginBottom: 10 },
  bubbleWrapRight: { justifyContent: 'flex-end' },
  bubbleWrapLeft: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: width * 0.72, borderRadius: 18, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  bubbleMine: { backgroundColor: '#1565C0', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: '#1B1B1B' },
  bubbleImage: { width: 200, height: 150, borderRadius: 12, resizeMode: 'cover' },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: '#90CAF9', textAlign: 'right' },
  bubbleTimeTheirs: { color: '#9E9E9E' },
  chatInputBar: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, gap: 10,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  plusBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  plusBtnText: { fontSize: 22, color: '#1565C0', fontWeight: '700', lineHeight: 26 },
  chatInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1B1B1B',
    maxHeight: 120, borderWidth: 1, borderColor: '#E8E8E8',
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#BBDEFB' },
  sendBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
  // ── Voice recording bar ──
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E3F2FD',
  },
  recordingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  recordingTimer: { fontSize: 14, fontWeight: '700', color: '#E53935', minWidth: 40 },
  recordingWave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  recordingWaveBar: {
    width: 3, height: 18, borderRadius: 2, backgroundColor: '#1565C0',
  },
  slideToCancelText: { fontSize: 13, color: '#9E9E9E', fontWeight: '500' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF0F0', borderRadius: 16 },
  cancelBtnText: { fontSize: 13, color: '#E53935', fontWeight: '700' },
  // ── Mic button ──
  micBtnWrap: { justifyContent: 'center', alignItems: 'center' },
  micBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  micBtnActive: { backgroundColor: '#E53935' },
  micBtnIcon: { fontSize: 20 },
  // ── Audio bubble ──
  audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioPlayBtn: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  audioPlayBtnTheirs: { backgroundColor: '#E3F2FD' },
  audioPlayIcon: { fontSize: 14 },
  audioPlayIconMine: { color: '#FFFFFF' },
  audioPlayIconTheirs: { color: '#1565C0' },
  audioWaveContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  audioWaveBarMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  audioWaveBarTheirs: { backgroundColor: 'rgba(21,101,192,0.35)' },
  audioWaveBarMineFilled: { backgroundColor: 'rgba(255,255,255,1)' },
  audioWaveBarTheirsFilled: { backgroundColor: '#1565C0' },
  audioDuration: { fontSize: 11, fontWeight: '600', minWidth: 32 },
  audioDurationMine: { color: '#90CAF9' },
  audioDurationTheirs: { color: '#9E9E9E' },
  chatHeaderTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // ── Profile Modal ──
  profileModal: { flex: 1, backgroundColor: '#F8F9FA', height: '100%' },
  profileModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  profileModalBack: { padding: 6 },
  profileModalBackText: { fontSize: 15, color: '#1565C0', fontWeight: '700' },
  profileModalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  profileModalScroll: { padding: 16, paddingBottom: 80 },
  profileModalAvatarSection: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 },
  profileModalAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32', marginBottom: 12 },
  profileModalAvatarPH: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  profileModalAvatarInit: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  profileModalName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  profileModalRatingCount: { fontSize: 13, color: '#9E9E9E', fontWeight: '500', marginTop: 4, marginBottom: 6 },
  profileModalSeeReviews: { fontSize: 13, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline', marginBottom: 12 },
  profileModalRolePill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  profileModalRolePillText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  profileModalInfoCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  profileModalInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  profileModalInfoIcon: { fontSize: 20, marginTop: 2 },
  profileModalInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  profileModalInfoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
  reviewItem: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reviewTitleText: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', flex: 1 },
  reviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20, marginBottom: 6 },
  reviewerName: { fontSize: 12, color: '#2E7D32', fontWeight: '600', fontStyle: 'italic' },
});

export default BuyerMessagesScreen;
