import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, Modal, Animated, KeyboardAvoidingView,
  Platform, Dimensions, ScrollView, PermissionsAndroid, Alert, NativeModules, BackHandler, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';
import {
  sendTextMessageToFirebase,
  markConversationAsReadInFirebase,
  deleteMessageFromFirebase,
  sendImageMessageToFirebase,
  sendAudioMessageToFirebase,
} from '../../services/firebaseMessageService';

const { width, height: screenHeight } = Dimensions.get('window');

const formatDuration = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const FarmerMessagesScreen = ({ navigation, route }: any) => {
  const { currentUser, messages, setMessages, users, blockUser, unblockUser, isBlocked } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  // ── Conversation list state ──────────────────────────────────────────────
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [showChatModal, setShowChatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalKey, setProfileModalKey] = useState(0);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [showMenuModal, setShowMenuModal] = useState(false);

  // Image viewer for chat images
  const [chatImageViewerVisible, setChatImageViewerVisible] = useState(false);
  const [chatImageViewerUri, setChatImageViewerUri] = useState<string>('');

  // ── Android hardware back button — single handler using refs to avoid stale closures ─
  const showChatModalRef    = useRef(showChatModal);
  const showProfileModalRef = useRef(showProfileModal);
  useEffect(() => { showChatModalRef.current    = showChatModal;    }, [showChatModal]);
  useEffect(() => { showProfileModalRef.current = showProfileModal; }, [showProfileModal]);

  const openChatRef = useRef<(id: string) => void>(() => {});

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        if (showProfileModalRef.current) { setShowProfileModal(false); return true; }
        if (showChatModalRef.current)    { setShowChatModal(false);    return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);

      // Auto-open chat if navigated with openChatWithUserId param
      const targetUserId = route?.params?.openChatWithUserId;
      if (targetUserId) {
        setTimeout(() => {
          openChatRef.current(targetUserId);
          navigation.setParams({ openChatWithUserId: undefined });
        }, 300);
      }

      return () => sub.remove();
    }, [navigation, route?.params?.openChatWithUserId])
  );

  // ── Playback state ───────────────────────────────────────────────────────
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const playingAudioIdRef = useRef<string | null>(null);

  // ── Voice recording state ──────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);

  const recorderRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const playerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  /** @deprecated use recorderRef / playerRef directly */
  const arPlayerRef = recorderRef; // kept so existing refs compile
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const activeChatUserIdRef = useRef<string | null>(null);

  // wave animations
  const waveAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const micScaleAnim = useRef(new Animated.Value(1)).current;

  const flatListRef = useRef<FlatList>(null);

  // keep activeChatUserIdRef in sync
  useEffect(() => { activeChatUserIdRef.current = activeChatUserId; }, [activeChatUserId]);

  // ── Pre-warm microphone permission on mount ──────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission',
        message: 'Farmnest needs microphone access to send voice messages.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
    }
  }, []);

  // ── Wave helpers ─────────────────────────────────────────────────────────
  const startWave = useCallback(() => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [waveAnims]);

  const stopWave = useCallback(() => {
    waveAnims.forEach(a => { a.stopAnimation(); a.setValue(0.3); });
  }, [waveAnims]);

  // ── Stop recording and send (tap while recording) ───────────────────────
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
        const path = await recorderRef.current.startRecorder();
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
        console.log('Farmer start recording error:', error);
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
      const resultPath = await recorderRef.current.stopRecorder();
      recorderRef.current.removeRecordBackListener();

      const finalPath = resultPath || '';
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
      console.log('Farmer handleMicPress error:', error);
    }
  }, [activeChatUserId, currentUser, micScaleAnim, startWave, stopWave]);

  // ── Start recording on long press ────────────────────────────────────────
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
      console.warn('[FarmerMessages] startRecorder error:', err);
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

  // ── Cancel recording ─────────────────────────────────────────────────────
  const cancelRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    setIsRecording(false);
    recordSecsRef.current = 0;
    setRecordSecs(0);
    stopWave();
    Animated.spring(micScaleAnim, { toValue: 1, useNativeDriver: true }).start();
    try { await arPlayerRef.current.stopRecorder(); } catch {}
    arPlayerRef.current.removeRecordBackListener();
  }, [stopWave, micScaleAnim]);

  // ── Playback ─────────────────────────────────────────────────────────────
  const stopPlayback = useCallback(async () => {
    try { await playerRef.current.stopPlayer(); } catch {}
    playerRef.current.removePlayBackListener();
    const prevId = playingAudioIdRef.current;
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    if (prevId) setPlaybackProgress(prev => ({ ...prev, [prevId]: 0 }));
  }, []);

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

  useEffect(() => {
    if (!showChatModal) stopPlayback();
  }, [showChatModal, stopPlayback]);

  // ── Chat helpers ─────────────────────────────────────────────────────────
  // Show ALL conversations (both sent and received), including blocked users so they can be unblocked
  const currentUserId = currentUser?.id ?? '';
  const allRelatedMessages = messages.filter(
    m => m.senderId === currentUserId || m.receiverId === currentUserId
  );
  const partnerIds = Array.from(new Set(
    allRelatedMessages.map(m => m.senderId === currentUserId ? m.receiverId : m.senderId)
  ));
  const conversations = partnerIds.map(partnerId => {
    const partnerMessages = allRelatedMessages.filter(
      m => (m.senderId === currentUserId && m.receiverId === partnerId) ||
           (m.senderId === partnerId && m.receiverId === currentUserId)
    );
    const lastMsg = partnerMessages[partnerMessages.length - 1];
    const sender = users.find(u => u.id === partnerId);
    const blocked = isBlocked(currentUserId, partnerId);
    // Only count incoming unread from this partner
    const unread = blocked ? 0 : partnerMessages.filter(m => m.senderId === partnerId && !m.read).length;
    return { senderId: partnerId, sender, lastMsg, unread, blocked };
  }).filter(c => c.sender);

  const isAdminUser = (user: any) => user?.role === 'Admin';

  const openChat = async (senderId: string) => {
    if (isPending) { setShowPendingModal(true); return; }
    setActiveChatUserId(senderId);
    activeChatUserIdRef.current = senderId;
    setShowChatModal(true);
    setMessages(prev =>
      prev.map(m =>
        m.senderId === senderId && m.receiverId === currentUser?.id ? { ...m, read: true } : m
      )
    );
    try {
      if (currentUser?.id) {
        await markConversationAsReadInFirebase(currentUser.id, senderId);
      }
    } catch (error) {
      console.log('Farmer openChat read update error:', error);
    }
  };

  // Keep ref in sync so useFocusEffect can call it before render
  openChatRef.current = openChat;

  const sendMessage = async () => {
    if (!chatText.trim() || !activeChatUserId || !currentUser) return;
    // Block enforcement: receiver has blocked this sender
    if (isBlocked(activeChatUserId, currentUser!.id)) {
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
      console.log('Farmer sendMessage error:', error);
    }
  };

  const [loading, setLoading] = useState(false);

  const sendImageMsg = async () => {
    if (!activeChatUserId || !currentUser) {
      Alert.alert('Error', 'Please open a chat first.');
      return;
    }
    if (isBlocked(activeChatUserId, currentUser!.id)) {
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
      console.log('Farmer sendImageMsg error:', error);
    }
  };

  const deleteMessage = (msgId: string) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
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

  const activeSender = users.find(u => u.id === activeChatUserId);
  // FIXED: Don't hide messages from blocked users — blocking only prevents NEW messages
  // Messages remain visible so the conversation history is preserved
  const chatMessages = messages.filter(
    m =>
      (m.senderId === currentUserId && m.receiverId === activeChatUserId) ||
      (m.senderId === activeChatUserId && m.receiverId === currentUserId)
  ).sort((a, b) => a.timestamp - b.timestamp);

  const totalUnread = messages.filter(m => m.receiverId === currentUserId && !m.read).length;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const openProfileVisit = (user: any) => { setProfileUser(user); setProfileModalKey(k => k + 1); setShowProfileModal(true); };

  return (
    <View style={styles.container}>
      <FarmerHeader
        title={t('messages')}
        navigation={navigation}
        notifCount={totalUnread}
      />

      <AccountPendingModal
        visible={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        role="Farmer"
      />

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{t('noMessagesYet')}</Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{t('noMessagesSubtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.senderId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.conversationCard} onPress={() => openChat(item.senderId)} activeOpacity={0.8}>
              {item.sender?.profilePic ? (
                <Image source={{ uri: item.sender.profilePic }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: item.sender?.role === 'Buyer' ? '#1565C0' : '#6A1B9A' }]}>
                  <Text style={styles.avatarInitials}>{item.sender?.firstName[0]}{item.sender?.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.convInfo}>
                <View style={styles.convTopRow}>
                  <Text selectable style={styles.convName}>{item.sender?.firstName} {item.sender?.lastName}</Text>
                  <Text style={styles.convTime}>{item.lastMsg ? formatTime(item.lastMsg.timestamp) : ''}</Text>
                </View>
                <View style={styles.convBottomRow}>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>
                      {item.sender?.role === 'Admin' ? '👑 Admin' : item.sender?.role === 'Buyer' ? `🛒 ${t('buyerRole')}` : `💼 ${t('investorRole')}`}
                    </Text>
                  </View>
                  <Text selectable style={styles.convPreview} numberOfLines={1}>
                    {item.lastMsg?.audio ? '🎤 Voice message' : item.lastMsg?.text || '📷 Image'}
                  </Text>
                </View>
                <Text selectable style={[styles.convSentBy, isUrdu && styles.rtlText]}>
                  {item.sender?.firstName} | {item.sender?.role === 'Admin' ? 'Admin' : item.sender?.role === 'Buyer' ? t('buyerRole') : t('investorRole')} {t('sendSentBy')}
                </Text>
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

      {/* Chat Image Viewer */}
      <ImageViewer
        visible={chatImageViewerVisible}
        images={chatImageViewerUri ? [chatImageViewerUri] : []}
        initialIndex={0}
        onClose={() => setChatImageViewerVisible(false)}
      />

      {/* CHAT MODAL */}
      <Modal visible={showChatModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowChatModal(false)}>
        <View style={styles.chatModal}>
          <View style={styles.chatHeader}>
            <TouchableOpacity style={styles.chatBackBtn} onPress={() => setShowChatModal(false)}>
              <Text style={styles.chatBackIcon}>←</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => activeSender && !isAdminUser(activeSender) && openProfileVisit(activeSender)} activeOpacity={0.8} style={styles.chatHeaderTouchable}>
              {activeSender?.profilePic ? (
                <Image source={{ uri: activeSender.profilePic }} style={styles.chatAvatar} />
              ) : (
                <View style={[styles.chatAvatarPlaceholder, { backgroundColor: activeSender?.role === 'Buyer' ? '#1565C0' : '#6A1B9A' }]}>
                  <Text style={styles.chatAvatarInitials}>{activeSender?.firstName[0]}{activeSender?.lastName[0]}</Text>
                </View>
              )}
              <View style={styles.chatHeaderInfo}>
                <Text selectable style={styles.chatHeaderName}>{activeSender?.firstName} {activeSender?.lastName}</Text>
                <Text style={styles.chatHeaderRole}>
                  {activeSender?.role === 'Admin' ? '👑 Admin' : activeSender?.role === 'Buyer' ? `🛒 ${t('buyerRole')}` : `💼 ${t('investorRole')}`}{!isAdminUser(activeSender) ? ' · Tap to visit profile' : ''}
                </Text>
              </View>
            </TouchableOpacity>
            {!isAdminUser(activeSender) && (
              <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenuModal(true)} activeOpacity={0.7}>
                <Text style={styles.menuBtnText}>⋮</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Block/Unblock Menu Modal */}
          <Modal visible={showMenuModal} transparent animationType="fade" onRequestClose={() => setShowMenuModal(false)}>
            <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenuModal(false)}>
              <View style={styles.menuSheet}>
                <Text style={styles.menuSheetTitle}>{activeSender?.firstName} {activeSender?.lastName}</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.75}
                  onPress={() => {
                    setShowMenuModal(false);
                    const blocked = isBlocked(currentUser?.id ?? '', activeChatUserId ?? '');
                    Alert.alert(
                      blocked ? 'Unblock User' : 'Block User',
                      blocked
                        ? `Are you sure you want to unblock ${activeSender?.firstName}? They will be able to send you messages again.`
                        : `Are you sure you want to block ${activeSender?.firstName}? You will no longer receive messages from them.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: blocked ? 'Unblock' : 'Block',
                          style: blocked ? 'default' : 'destructive',
                          onPress: () => {
                            if (blocked) unblockUser(currentUser?.id ?? '', activeChatUserId ?? '');
                            else blockUser(currentUser?.id ?? '', activeChatUserId ?? '');
                          },
                        },
                      ]
                    );
                  }}>
                  <Text style={[
                    styles.menuItemText,
                    isBlocked(currentUser?.id ?? '', activeChatUserId ?? '') ? styles.menuItemUnblock : styles.menuItemBlock,
                  ]}>
                    {isBlocked(currentUser?.id ?? '', activeChatUserId ?? '') ? '🔓 Unblock User' : '🚫 Block User'}
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
              const isMine = item.senderId === currentUser?.id;
              const isPlaying = playingAudioId === item.id;
              return (
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
                            const filled = isPlaying && (idx / 10) <= progress;
                            return (
                              <View key={idx} style={[
                                styles.audioWaveBar, { height: 18 * h },
                                filled
                                  ? (isMine ? styles.audioWaveBarMineFilled : styles.audioWaveBarTheirsFilled)
                                  : (isMine ? styles.audioWaveBarMine : styles.audioWaveBarTheirs),
                              ]} />
                            );
                          })}
                        </View>
                        <Text style={[styles.audioDuration, isMine ? styles.audioDurationMine : styles.audioDurationTheirs]}>
                          {formatDuration(item.audioDuration ?? 0)}
                        </Text>
                      </TouchableOpacity>
                    ) : item.image ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => { setChatImageViewerUri(item.image!); setChatImageViewerVisible(true); }}>
                        <Image source={{ uri: item.image }} style={styles.bubbleImage} />
                      </TouchableOpacity>
                    ) : (
                      <Text selectable style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>{item.text}</Text>
                    )}
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                      {formatTime(item.timestamp)}
                    </Text>
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
                  <Text style={styles.cancelBtnText}>✕ Cancel</Text>
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
                  style={styles.chatInput}
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
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} activeOpacity={0.8}>
                  <Text style={styles.sendBtnText}>➤</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.micBtn, isRecording && styles.micBtnActive]}
                  onPress={handleMicPress}
                  onLongPress={handleMicLongPress}
                  delayLongPress={200}
                  activeOpacity={0.7}
                >
                  <Text style={styles.micBtnIcon}>🎤</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* PROFILE VISIT MODAL — kept outside Chat Modal so it gets its own full-screen layer */}
      <Modal visible={showProfileModal} animationType="slide" statusBarTranslucent onRequestClose={() => { setShowProfileModal(false); }}>
        <View style={styles.profileModal}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => { setShowProfileModal(false); }} style={styles.profileModalBack}>
              <Text style={styles.profileModalBackText}>{t('backArrow')}</Text>
            </TouchableOpacity>
            <Text style={styles.profileModalTitle}>{profileUser?.role === 'Buyer' ? t('buyerProfile') : t('farmerProfileTitle')}</Text>
            <View style={{ width: 60 }} />
          </View>
          {profileUser && (
            <ScrollView
              key={profileModalKey}
              style={styles.profileModalScrollView}
              contentContainerStyle={styles.profileModalScroll}
              showsVerticalScrollIndicator={true}
              bounces={true}
              alwaysBounceVertical={true}
              scrollEventThrottle={16}
            >
              <View style={styles.profileModalAvatarSection}>
                {profileUser.profilePic ? (
                  <Image source={{ uri: profileUser.profilePic }} style={styles.profileModalAvatar} />
                ) : (
                  <View style={[styles.profileModalAvatarPH, { backgroundColor: profileUser.role === 'Buyer' ? '#1565C0' : '#6A1B9A' }]}>
                    <Text style={styles.profileModalAvatarInit}>{profileUser.firstName[0]}{profileUser.lastName[0]}</Text>
                  </View>
                )}
                <Text selectable style={styles.profileModalName}>{profileUser.firstName} {profileUser.lastName}</Text>
                <View style={[styles.profileModalRolePill, { backgroundColor: profileUser.role === 'Buyer' ? '#E3F2FD' : '#EDE7F6' }]}>
                  <Text style={[styles.profileModalRolePillText, { color: profileUser.role === 'Buyer' ? '#1565C0' : '#6A1B9A' }]}>
                    {profileUser.role === 'Buyer' ? `🛒 ${t('buyerRole')}` : `💼 ${t('investorRole')}`}
                  </Text>
                </View>
              </View>
              <View style={styles.profileModalInfoCard}>
                {[
                  { icon: '🏧', label: t('infoAccountNumber'), value: profileUser.cnic },
                  { icon: '📧', label: t('infoEmail'), value: profileUser.email },
                  { icon: '📱', label: t('infoPhone'), value: profileUser.phone },
                  { icon: '🏙️', label: t('infoCity'), value: profileUser.city },
                  { icon: '📍', label: t('infoAddress'), value: profileUser.address },
                ].map(row => (
                  <View key={row.label} style={styles.profileModalInfoRow}>
                    <Text style={styles.profileModalInfoIcon}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text selectable style={[styles.profileModalInfoLabel, isUrdu && styles.rtlText]}>{row.label}</Text>
                      <Text selectable style={[styles.profileModalInfoValue, isUrdu && styles.rtlText]}>{row.value || '—'}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {profileUser.role === 'Buyer' && (profileUser.penalties ?? 0) > 0 && (
                <View style={styles.profileModalPenaltyCard}>
                  <Text style={[styles.profileModalPenaltyTitle, isUrdu && styles.rtlText]}>{t('penaltyStatus')}</Text>
                  <View style={styles.penaltyBarWrap}>
                    {[1, 2, 3].map(n => (
                      <View
                        key={n}
                        style={[
                          styles.penaltyDot,
                          (profileUser.penalties ?? 0) >= n ? styles.penaltyDotActive : styles.penaltyDotInactive,
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.profileModalPenaltyCount, isUrdu && styles.rtlText]}>
                    {profileUser.penalties}/3 {t('penaltiesReceived')}
                  </Text>
                  {(profileUser.penalties ?? 0) >= 3 && (
                    <Text style={[styles.profileModalPenaltyWarn, isUrdu && styles.rtlText]}>
                      {t('penaltyAccountSuspendWarning')}
                    </Text>
                  )}
                </View>
              )}
              <View style={{ height: 60 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  listContent: { padding: 14 },
  conversationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarPlaceholder: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  convName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  convTime: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rolePill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  convPreview: { flex: 1, fontSize: 12, color: '#757575' },
  convSentBy: { fontSize: 12, color: '#2E7D32', fontWeight: '600', fontStyle: 'italic' },
  unreadBadge: { backgroundColor: '#E53935', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  blockedBadge: { backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  blockedBadgeText: { color: '#C62828', fontSize: 10, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  chatModal: { flex: 1, backgroundColor: '#F0F4F0' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 14, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 4 },
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
  chatAvatarPlaceholder: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  chatAvatarInitials: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  chatHeaderTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 16, fontWeight: '800', color: '#1B1B1B' },
  chatHeaderRole: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  chatMessages: { padding: 16, paddingBottom: 10 },
  bubbleWrap: { flexDirection: 'row', marginBottom: 10 },
  bubbleWrapRight: { justifyContent: 'flex-end' },
  bubbleWrapLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: width * 0.72, borderRadius: 18, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bubbleMine: { backgroundColor: '#2E7D32', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: '#1B1B1B' },
  bubbleImage: { width: 200, height: 150, borderRadius: 12, resizeMode: 'cover' },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: '#A5D6A7', textAlign: 'right' },
  bubbleTimeTheirs: { color: '#9E9E9E', textAlign: 'left' },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, gap: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  plusBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  plusBtnText: { fontSize: 22, color: '#2E7D32', fontWeight: '700', lineHeight: 26 },
  chatInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1B1B1B', maxHeight: 120, borderWidth: 1, borderColor: '#E8E8E8' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  recordingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E8F5E9' },
  recordingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  recordingTimer: { fontSize: 14, fontWeight: '700', color: '#E53935', minWidth: 40 },
  recordingWave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  recordingWaveBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#2E7D32' },
  slideToCancelText: { fontSize: 13, color: '#9E9E9E', fontWeight: '500' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF0F0', borderRadius: 16 },
  cancelBtnText: { fontSize: 13, color: '#E53935', fontWeight: '700' },
  micBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  micBtnActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  micBtnIcon: { fontSize: 20 },
  audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  audioPlayBtnTheirs: { backgroundColor: '#E8F5E9' },
  audioPlayIcon: { fontSize: 14 },
  audioPlayIconMine: { color: '#FFFFFF' },
  audioPlayIconTheirs: { color: '#2E7D32' },
  audioWaveContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  audioWaveBarMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  audioWaveBarTheirs: { backgroundColor: 'rgba(46,125,50,0.35)' },
  audioWaveBarMineFilled: { backgroundColor: 'rgba(255,255,255,1)' },
  audioWaveBarTheirsFilled: { backgroundColor: '#2E7D32' },
  audioDuration: { fontSize: 11, fontWeight: '600', minWidth: 32 },
  audioDurationMine: { color: '#A5D6A7' },
  audioDurationTheirs: { color: '#9E9E9E' },
  profileModal: { flex: 1, backgroundColor: '#F8F9FA' },
  profileModalScrollView: { flex: 1, height: screenHeight },
  profileModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  profileModalBack: { padding: 6 },
  profileModalBackText: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  profileModalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  profileModalScroll: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  profileModalAvatarSection: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 },
  profileModalAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32', marginBottom: 12 },
  profileModalAvatarPH: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  profileModalAvatarInit: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  profileModalName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  profileModalRolePill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  profileModalRolePillText: { fontSize: 13, fontWeight: '700' },
  profileModalInfoCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  profileModalInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  profileModalInfoIcon: { fontSize: 20, marginTop: 2 },
  profileModalInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  profileModalInfoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
  profileModalPenaltyCard: { backgroundColor: '#FFF8E1', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#FFE082' },
  profileModalPenaltyTitle: { fontSize: 16, fontWeight: '800', color: '#E65100', marginBottom: 12 },
  penaltyBarWrap: { flexDirection: 'row', gap: 10, marginBottom: 10, justifyContent: 'center' },
  penaltyDot: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  penaltyDotActive: { backgroundColor: '#E53935' },
  penaltyDotInactive: { backgroundColor: '#EEEEEE', borderWidth: 1.5, borderColor: '#BDBDBD' },
  profileModalPenaltyCount: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#BF360C', marginBottom: 4 },
  profileModalPenaltyWarn: { textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#C62828', marginTop: 6, lineHeight: 20 },
});

export default FarmerMessagesScreen;
