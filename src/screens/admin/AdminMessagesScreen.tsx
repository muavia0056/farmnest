import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  Image, Modal, ScrollView, Platform, Alert, Animated,
  PermissionsAndroid, KeyboardAvoidingView, BackHandler, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useApp } from '../../context/AppContext';
import AdminHeader from '../../components/AdminHeader';
import ImageViewer from '../../components/ImageViewer';
import {
  sendTextMessageToFirebase,
  markConversationAsReadInFirebase,
  deleteMessageFromFirebase,
  sendImageMessageToFirebase,
  sendAudioMessageToFirebase,
} from '../../services/firebaseMessageService';

const roleColor = (role: string) =>
  role === 'Farmer' ? '#2E7D32' : role === 'Buyer' ? '#1565C0' : role === 'Investor' ? '#6A1B9A' : '#FF6B35';
const roleBg = (role: string) =>
  role === 'Farmer' ? '#E8F5E9' : role === 'Buyer' ? '#E3F2FD' : role === 'Investor' ? '#EDE7F6' : '#FFF3EE';
const roleIcon = (role: string) =>
  role === 'Farmer' ? '🌾' : role === 'Buyer' ? '🛒' : role === 'Investor' ? '💼' : '👑';

const AdminMessagesScreen = ({ navigation }: any) => {
  const { users, currentUser, messages, setMessages, blockUser, unblockUser, isBlocked } = useApp();
  const [searchText, setSearchText] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [chatText, setChatText] = useState('');
  const [showMenuModal, setShowMenuModal] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const openProfileImageViewer = (uri: string) => { setViewerImages([uri]); setViewerVisible(true); };

  const showProfileModalRef = useRef(showProfileModal);
  const showChatModalRef    = useRef(showChatModal);
  const viewerVisibleRef    = useRef(viewerVisible);
  useEffect(() => { showProfileModalRef.current = showProfileModal; }, [showProfileModal]);
  useEffect(() => { showChatModalRef.current    = showChatModal;    }, [showChatModal]);
  useEffect(() => { viewerVisibleRef.current    = viewerVisible;    }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)    { setViewerVisible(false);    return true; }
        if (showProfileModalRef.current) { setShowProfileModal(false); return true; }
        if (showChatModalRef.current)    { setShowChatModal(false);    return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const playingAudioIdRef = useRef<string | null>(null);
  const audioRecorderPlayerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const audioPlayerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const waveAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const selectedUserRef = useRef<any>(null);
  const chatScrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(false);

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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

  const stopPlayback = useCallback(async () => {
    try { await audioPlayerRef.current.stopPlayer(); } catch {}
    audioPlayerRef.current.removePlayBackListener();
    const prevId = playingAudioIdRef.current;
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    if (prevId) setPlaybackProgress(prev => ({ ...prev, [prevId]: 0 }));
  }, []);

  const togglePlayAudio = useCallback(async (msgId: string, uri: string) => {
    if (playingAudioIdRef.current === msgId) { await stopPlayback(); return; }
    if (playingAudioIdRef.current) await stopPlayback();
    if (isRecordingRef.current) return;
    playingAudioIdRef.current = msgId;
    setPlayingAudioId(msgId);
    await audioPlayerRef.current.startPlayer(uri);
    audioPlayerRef.current.addPlayBackListener(e => {
      const progress = e.currentPosition / (e.duration || 1);
      setPlaybackProgress(prev => ({ ...prev, [msgId]: progress }));
      if (e.currentPosition >= e.duration && e.duration > 0) { stopPlayback(); }
    });
  }, [stopPlayback]);

  const deleteMessage = (msgId: string) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Optimistic local remove first so it disappears immediately
          setMessages((prev: any[]) => prev.filter((m: any) => m.id !== msgId));
          try { await deleteMessageFromFirebase(msgId); } catch (e) {
            console.log('Admin deleteMessage Firebase error:', e);
          }
        },
      },
    ]);
  };

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission', message: 'Farmnest needs microphone access.',
        buttonPositive: 'Allow', buttonNegative: 'Deny',
      });
    }
  }, []);

  // FIXED: Safe helper to get current user ID
  const currentUserId = currentUser?.id ?? '';

  const handleMicPress = useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    setIsRecording(false);
    stopWave();
    let uri = '';
    try { uri = await audioRecorderPlayerRef.current.stopRecorder(); } catch {}
    audioRecorderPlayerRef.current.removeRecordBackListener();
    if (!uri || uri.startsWith('Already')) uri = '';
    if (uri && !uri.startsWith('file://') && !uri.startsWith('http')) uri = 'file://' + uri;
    const duration = recordSecondsRef.current;
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    // FIXED: Safe null check
    if (!currentUser || !selectedUserRef.current) return;
    if (isBlocked(selectedUserRef.current.id, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }
    if (duration >= 1 && uri && selectedUserRef.current) {
      setLoading(true);
      try {
        // FIXED: Use Firebase service to upload audio to Cloudinary and persist to Firestore
        await sendAudioMessageToFirebase({
          senderDisplayId: currentUser.id,
          receiverId: selectedUserRef.current.id,
          senderName: `${currentUser.firstName} ${currentUser.lastName}`,
          senderRole: currentUser.role,
          audioUri: uri,
          audioDuration: duration,
        });
        setLoading(false);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (error: any) {
        setLoading(false);
        let message = 'Failed to send voice message. Please try again.';
        if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
          message = 'Cloudinary configuration is missing.';
        } else if (error.message === 'CLOUDINARY_AUDIO_UPLOAD_FAILED') {
          message = 'Audio upload failed. Please try again.';
        }
        Alert.alert('Voice Message Error', message);
        console.log('Admin handleMicPress error:', error);
      }
    }
  }, [stopWave, currentUser, isBlocked]);

  const handleMicLongPress = useCallback(async () => {
    if (isRecordingRef.current) return;
    let hasPermission = true;
    if (Platform.OS === 'android') {
      const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (!status) {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone Permission', message: 'Farmnest needs microphone access.',
          buttonPositive: 'Allow', buttonNegative: 'Deny',
        });
        hasPermission = res === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    if (!hasPermission) { Alert.alert('Permission Denied', 'Please allow microphone access in Settings.'); return; }
    try { await audioPlayerRef.current.stopPlayer(); } catch {}
    audioPlayerRef.current.removePlayBackListener();
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    audioRecorderPlayerRef.current.removeRecordBackListener();
    audioRecorderPlayerRef.current = new AudioRecorderPlayer();
    const arp = audioRecorderPlayerRef.current;
    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    const filePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/voice_${Date.now()}.mp4`;
    try { await arp.startRecorder(filePath); }
    catch (err: any) {
      console.warn('[AdminMessages] startRecorder error:', err);
      Alert.alert('Error', 'Could not start recording. Please restart the app and try again.');
      return;
    }
    isRecordingRef.current = true;
    setIsRecording(true);
    startWave();
    timerRef.current = setInterval(() => { recordSecondsRef.current += 1; setRecordSeconds(recordSecondsRef.current); }, 1000);
  }, [startWave]);

  const cancelRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    setIsRecording(false);
    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    stopWave();
    try { await audioRecorderPlayerRef.current.stopRecorder(); } catch {}
    audioRecorderPlayerRef.current.removeRecordBackListener();
  }, [stopWave]);

  const isMainAdmin = currentUser?.id === 'main-admin-001';

  const hasConversationWithAdmin = (userId: string) =>
    messages.some(m =>
      (m.senderId === userId && m.receiverId === currentUserId) ||
      (m.senderId === currentUserId && m.receiverId === userId),
    );

  const eligibleUsers = users.filter(u => {
    if (u.id === currentUserId) return false;
    if (u.id === 'main-admin-001' && !isMainAdmin) return false;
    if (u.accountStatus === 'Suspended' && isMainAdmin && hasConversationWithAdmin(u.id)) return true;
    if (u.accountStatus !== 'Approved') return false;
    if (isMainAdmin) return ['Farmer', 'Buyer', 'Investor', 'Admin'].includes(u.role);
    return ['Farmer', 'Buyer', 'Investor'].includes(u.role);
  }).filter(u =>
    searchText === '' ||
    (u.cnic || '').includes(searchText) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchText.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  // FIXED: Safe null check in getConversation
  const getConversation = (userId: string) =>
    messages
      .filter(m =>
        ((m.senderId === currentUserId && m.receiverId === userId) ||
         (m.senderId === userId && m.receiverId === currentUserId)) &&
        (currentUserId ? !isBlocked(currentUserId, m.senderId) : true)
      )
      .sort((a, b) => a.timestamp - b.timestamp);

  const openChatWithUser = async (user: any) => {
    setSelectedUser(user);
    selectedUserRef.current = user;
    setShowChatModal(true);
    setMessages(prev =>
      prev.map(m =>
        m.senderId === user.id && m.receiverId === currentUserId ? { ...m, read: true } : m
      )
    );
    try {
      if (currentUserId) await markConversationAsReadInFirebase(currentUserId, user.id);
    } catch (e) { console.log('Admin openChat read error:', e); }
  };

  const sendMessage = async () => {
    if (!chatText.trim() || !selectedUser || !currentUser) return;
    // FIXED: Safe null check
    if (isBlocked(selectedUser.id, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }
    const msgText = chatText.trim();
    setChatText('');
    // Send directly to Firestore — the real-time listener delivers it back
    // to the UI almost instantly (local Firestore cache), so no optimistic
    // update is needed. Optimistic updates caused the flicker because the
    // admin snapshot listener would overwrite state, creating a visible
    // appear/disappear/appear cycle.
    try {
      await sendTextMessageToFirebase({
        senderDisplayId: currentUser.id,
        receiverId: selectedUser.id,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        senderRole: currentUser.role,
        text: msgText,
      });
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      console.log('Admin sendMessage Firebase error:', e);
      // On failure, restore the text so the user can retry
      setChatText(msgText);
    }
  };

  const openProfile = (user: any) => { setProfileUser(user); setShowProfileModal(true); };

  const sendImageMsg = async () => {
    if (!selectedUser || !currentUser) return;
    // FIXED: Safe null check
    if (isBlocked(selectedUser.id, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }
    try {
      setLoading(true);
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      const pickedUri = result.assets?.[0]?.uri;
      if (!pickedUri) {
        setLoading(false);
        return;
      }
      // FIXED: Use Firebase service to upload image to Cloudinary and persist to Firestore
      await sendImageMessageToFirebase({
        senderDisplayId: currentUser.id,
        receiverId: selectedUser.id,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderRole: currentUser.role,
        imageUri: pickedUri,
      });
      setLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      setLoading(false);
      let message = 'Failed to send image message. Please try again.';
      if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_UPLOAD_FAILED') {
        message = 'Image upload failed. Please try again.';
      }
      Alert.alert('Image Message Error', message);
      console.log('Admin sendImageMsg error:', error);
    }
  };

  const conversation = selectedUser ? getConversation(selectedUser.id) : [];

  // FIXED: Show loading if currentUser is not ready yet
  if (!currentUser) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={{ marginTop: 16, color: '#757575' }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageViewer visible={viewerVisible} images={viewerImages} initialIndex={0} onClose={() => setViewerVisible(false)} />
      <AdminHeader title="Messages" navigation={navigation} />

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Account Number, name or email..."
          placeholderTextColor="#9E9E9E"
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {eligibleUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySubtitle}>Search by account number, name or email to find users.</Text>
        </View>
      ) : (
        <FlatList
          data={eligibleUsers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const lastMsg = messages
              .filter(m =>
                (m.senderId === currentUserId && m.receiverId === item.id) ||
                (m.senderId === item.id && m.receiverId === currentUserId)
              )
              .sort((a, b) => b.timestamp - a.timestamp)[0];
            return (
              <TouchableOpacity style={styles.userCard} onPress={() => openChatWithUser(item)} activeOpacity={0.85}>
                <TouchableOpacity onPress={() => openProfile(item)} activeOpacity={0.8}>
                  {item.profilePic ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openProfileImageViewer(item.profilePic)}>
                      <Image source={{ uri: item.profilePic }} style={styles.userAvatar} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.userAvatarPH, { backgroundColor: roleColor(item.role) }]}>
                      <Text style={styles.userAvatarInit}>{item.firstName?.[0]}{item.lastName?.[0]}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.userInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text selectable style={styles.userName}>{item.firstName} {item.lastName}</Text>
                    {item.accountStatus === 'Suspended' && (
                      <View style={styles.suspendedBadge}><Text style={styles.suspendedBadgeText}>🚫 Suspended</Text></View>
                    )}
                    {/* FIXED: Safe null check */}
                    {currentUserId && isBlocked(currentUserId, item.id) && (
                      <View style={styles.blockedBadge}><Text style={styles.blockedBadgeText}>🚫 Blocked</Text></View>
                    )}
                  </View>
                  <Text selectable style={styles.userRole}>{roleIcon(item.role)} {item.role}</Text>
                  {lastMsg && (
                    <Text selectable style={styles.lastMsg} numberOfLines={1}>
                      {lastMsg.senderId === currentUserId ? 'You: ' : ''}{lastMsg.audio ? '🎤 Voice message' : lastMsg.text || '📷 Image'}
                    </Text>
                  )}
                </View>
                <View style={[styles.rolePill, { backgroundColor: roleBg(item.role) }]}>
                  <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>{item.role}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Chat Modal */}
      <Modal visible={showChatModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowChatModal(false)}>
        <View style={styles.chatContainer}>
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setShowChatModal(false)} style={styles.chatBackBtn}>
              <Text style={styles.chatBackTxt}>← Back</Text>
            </TouchableOpacity>
            {selectedUser && (
              <TouchableOpacity style={styles.chatUserInfo} onPress={() => openProfile(selectedUser)} activeOpacity={0.8}>
                {selectedUser.profilePic ? (
                  <Image source={{ uri: selectedUser.profilePic }} style={styles.chatAvatar} />
                ) : (
                  <View style={[styles.chatAvatarPH, { backgroundColor: roleColor(selectedUser.role) }]}>
                    <Text style={styles.chatAvatarInit}>{selectedUser.firstName?.[0]}{selectedUser.lastName?.[0]}</Text>
                  </View>
                )}
                <View>
                  <Text selectable style={styles.chatName}>{selectedUser.firstName} {selectedUser.lastName}</Text>
                  <Text style={styles.chatRole}>{roleIcon(selectedUser.role)} {selectedUser.role} · Tap for profile</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenuModal(true)} activeOpacity={0.7}>
              <Text style={styles.menuBtnText}>⋮</Text>
            </TouchableOpacity>
          </View>

          <Modal visible={showMenuModal} transparent animationType="fade" onRequestClose={() => setShowMenuModal(false)}>
            <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenuModal(false)}>
              <View style={styles.menuSheet}>
                <Text style={styles.menuSheetTitle}>{selectedUser?.firstName} {selectedUser?.lastName}</Text>
                <TouchableOpacity style={styles.menuItem} activeOpacity={0.75}
                  onPress={() => {
                    setShowMenuModal(false);
                    // FIXED: Safe null check
                    if (!currentUserId || !selectedUser?.id) return;
                    const blocked = isBlocked(currentUserId, selectedUser.id);
                    Alert.alert(
                      blocked ? 'Unblock User' : 'Block User',
                      blocked
                        ? `Are you sure you want to unblock ${selectedUser?.firstName}? They will be able to send you messages again.`
                        : `Are you sure you want to block ${selectedUser?.firstName}? You will no longer receive messages from them.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: blocked ? 'Unblock' : 'Block',
                          style: blocked ? 'default' : 'destructive',
                          onPress: () => {
                            if (!currentUserId || !selectedUser?.id) return;
                            if (blocked) unblockUser(currentUserId, selectedUser.id);
                            else blockUser(currentUserId, selectedUser.id);
                          },
                        },
                      ]
                    );
                  }}>
                  <Text style={[
                    styles.menuItemText,
                    // FIXED: Safe null check
                    (currentUserId && selectedUser?.id && isBlocked(currentUserId, selectedUser.id)) ? styles.menuItemUnblock : styles.menuItemBlock,
                  ]}>
                    {(currentUserId && selectedUser?.id && isBlocked(currentUserId, selectedUser.id)) ? '🔓 Unblock User' : '🚫 Block User'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, styles.menuItemCancel]} onPress={() => setShowMenuModal(false)} activeOpacity={0.75}>
                  <Text style={styles.menuItemCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          <ScrollView ref={chatScrollRef} contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}>
            {conversation.length === 0 ? (
              <View style={styles.noChatBox}><Text style={styles.noChatText}>No messages yet. Say hello! 👋</Text></View>
            ) : (
              conversation.map(msg => {
                const isMine = msg.senderId === currentUserId;
                const isPlaying = playingAudioId === msg.id;
                return (
                  <TouchableOpacity key={msg.id} activeOpacity={1} onLongPress={() => deleteMessage(msg.id)}
                    style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
                    <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
                      {msg.audio ? (
                        <TouchableOpacity style={styles.audioBubble} onPress={() => togglePlayAudio(msg.id, msg.audio!)} activeOpacity={0.7}>
                          <View style={[styles.audioPlayBtn, isMine ? styles.audioPlayBtnMine : styles.audioPlayBtnTheirs]}>
                            <Text style={[styles.audioPlayIcon, isMine ? styles.audioPlayIconMine : styles.audioPlayIconTheirs]}>{isPlaying ? '⏸' : '▶'}</Text>
                          </View>
                          <View style={styles.audioWaveContainer}>
                            {[0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.75, 0.45, 0.9, 0.55].map((h, idx) => {
                              const progress = playbackProgress[msg.id] ?? 0;
                              const filled = isPlaying && (idx / 10) <= progress;
                              return <View key={idx} style={[styles.audioWaveBar, { height: 18 * h },
                                filled ? (isMine ? styles.audioWaveBarMineFilled : styles.audioWaveBarTheirsFilled)
                                       : (isMine ? styles.audioWaveBarMine : styles.audioWaveBarTheirs)]} />;
                            })}
                          </View>
                          <Text style={[styles.audioDuration, isMine ? styles.audioDurationMine : styles.audioDurationTheirs]}>
                            {formatDuration(msg.audioDuration ?? 0)}
                          </Text>
                        </TouchableOpacity>
                      ) : msg.image ? (
                        <TouchableOpacity activeOpacity={0.85} onPress={() => { setViewerImages([msg.image!]); setViewerVisible(true); }}>
                          <Image source={{ uri: msg.image }} style={styles.bubbleImage} />
                        </TouchableOpacity>
                      ) : (
                        <Text selectable style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>{msg.text}</Text>
                      )}
                      <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {isRecording && (
              <View style={styles.recordingBar}>
                <View style={styles.recordingLeft}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTimer}>{formatDuration(recordSeconds)}</Text>
                  <View style={styles.recordingWave}>
                    {waveAnims.map((anim, i) => <Animated.View key={i} style={[styles.recordingWaveBar, { transform: [{ scaleY: anim }] }]} />)}
                  </View>
                </View>
                <TouchableOpacity onPress={cancelRecording} activeOpacity={0.7} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>✕ Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.chatInputRow}>
              {!isRecording && (
                <TouchableOpacity style={[styles.plusBtn, loading && styles.plusBtnDisabled]} onPress={sendImageMsg} disabled={loading} activeOpacity={0.75}>
                  {loading ? (
                    <ActivityIndicator size="small" color="#1A1A2E" />
                  ) : (
                    <Text style={styles.plusBtnText}>＋</Text>
                  )}
                </TouchableOpacity>
              )}
              {!isRecording && (
                <TextInput style={styles.chatInput} placeholder="Type a message..." placeholderTextColor="#9E9E9E"
                  value={chatText} onChangeText={setChatText} multiline />
              )}
              {isRecording && <View style={{ flex: 1 }} />}
              {chatText.trim() ? (
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} activeOpacity={0.85}>
                  <Text style={styles.sendBtnText}>➤</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.micBtnWrap, styles.micBtn, isRecording && styles.micBtnActive]}
                  onPress={handleMicPress} onLongPress={handleMicLongPress} delayLongPress={200} activeOpacity={0.7}>
                  <Text style={styles.micBtnIcon}>🎤</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Profile Modal */}
      <Modal visible={showProfileModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.profileModalContainer}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => setShowProfileModal(false)} style={styles.chatBackBtn}>
              <Text style={styles.chatBackTxt}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.profileModalTitle}>User Profile</Text>
            <View style={{ width: 70 }} />
          </View>
          <ScrollView contentContainerStyle={styles.profileScroll} showsVerticalScrollIndicator={false}>
            {profileUser && (
              <>
                <View style={styles.profileAvatarSection}>
                  {profileUser.profilePic ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openProfileImageViewer(profileUser.profilePic)}>
                      <Image source={{ uri: profileUser.profilePic }} style={styles.profileAvatar} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.profileAvatarPH, { backgroundColor: roleColor(profileUser.role) }]}>
                      <Text style={styles.profileAvatarInit}>{profileUser.firstName?.[0]}{profileUser.lastName?.[0]}</Text>
                    </View>
                  )}
                  <Text selectable style={styles.profileName}>{profileUser.firstName} {profileUser.lastName}</Text>
                  <View style={[styles.rolePill, { backgroundColor: roleBg(profileUser.role) }]}>
                    <Text style={[styles.rolePillText, { color: roleColor(profileUser.role) }]}>{roleIcon(profileUser.role)} {profileUser.role}</Text>
                  </View>
                  {(profileUser.penalties || 0) > 0 && (
                    <View style={styles.penaltyBadge}><Text style={styles.penaltyText}>⚠️ Penalties: {profileUser.penalties}/3</Text></View>
                  )}
                </View>
                <View style={styles.infoCard}>
                  {[
                    { icon: '🪪', label: 'CNIC', value: profileUser.cnic },
                    { icon: '📧', label: 'Email', value: profileUser.email },
                    { icon: '📱', label: 'Phone', value: profileUser.phone },
                    { icon: '🏙️', label: 'City', value: profileUser.city },
                    { icon: '📍', label: 'Address', value: profileUser.address },
                  ].map(row => (
                    <View key={row.label} style={styles.infoRow}>
                      <Text style={styles.infoIcon}>{row.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text selectable style={styles.infoLabel}>{row.label}</Text>
                        <Text selectable style={styles.infoValue}>{row.value || '—'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderWidth: 1.5, borderColor: '#E8E8E8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  searchIcon: { fontSize: 18 },
  searchInput: { flex: 1, fontSize: 15, color: '#1B1B1B', paddingVertical: 0 },
  searchClear: { fontSize: 16, color: '#9E9E9E', paddingHorizontal: 4 },
  listContent: { paddingHorizontal: 14, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  userAvatar: { width: 50, height: 50, borderRadius: 25 },
  userAvatarPH: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  userAvatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 2 },
  userRole: { fontSize: 12, color: '#555555', fontWeight: '500', marginBottom: 2 },
  lastMsg: { fontSize: 12, color: '#9E9E9E', fontWeight: '400' },
  suspendedBadge: { backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  suspendedBadgeText: { fontSize: 10, fontWeight: '700', color: '#C62828' },
  blockedBadge: { backgroundColor: '#FFF3E0', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  blockedBadgeText: { fontSize: 10, fontWeight: '700', color: '#E65100' },
  rolePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  rolePillText: { fontSize: 11, fontWeight: '700' },
  chatContainer: { flex: 1, backgroundColor: '#F4F6F9' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A2E', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 14, gap: 10 },
  menuBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { fontSize: 22, color: '#FFFFFF', fontWeight: '700', lineHeight: 26 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 20 },
  menuSheetTitle: { fontSize: 14, color: '#9E9E9E', fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  menuItem: { paddingVertical: 16, borderRadius: 14, backgroundColor: '#F8F9FA', marginBottom: 10, alignItems: 'center' },
  menuItemText: { fontSize: 16, fontWeight: '700' },
  menuItemBlock: { color: '#E53935' },
  menuItemUnblock: { color: '#FF6B35' },
  menuItemCancel: { backgroundColor: '#EEEEEE' },
  menuItemCancelText: { fontSize: 15, fontWeight: '600', color: '#555555' },
  chatBackBtn: { padding: 4 },
  chatBackTxt: { fontSize: 15, color: '#FF6B35', fontWeight: '700' },
  chatUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20 },
  chatAvatarPH: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  chatAvatarInit: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  chatName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  chatRole: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  chatScroll: { padding: 14, paddingBottom: 20 },
  noChatBox: { alignItems: 'center', paddingTop: 60 },
  noChatText: { fontSize: 15, color: '#9E9E9E', fontWeight: '500' },
  msgRow: { marginBottom: 10 },
  msgRowMine: { alignItems: 'flex-end' },
  msgRowTheirs: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '78%', borderRadius: 18, padding: 12, paddingBottom: 6 },
  msgBubbleMine: { backgroundColor: '#1A1A2E', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextMine: { color: '#FFFFFF' },
  msgTextTheirs: { color: '#1B1B1B' },
  msgTime: { fontSize: 10, marginTop: 4 },
  msgTimeMine: { color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  msgTimeTheirs: { color: '#9E9E9E' },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  plusBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  plusBtnDisabled: { backgroundColor: '#E0E0E0' },
  plusBtnText: { fontSize: 22, color: '#1A1A2E', fontWeight: '700', lineHeight: 26 },
  chatInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1B1B1B', maxHeight: 120, borderWidth: 1, borderColor: '#E8E8E8' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1A1A2E', justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  micBtnWrap: { justifyContent: 'center', alignItems: 'center' },
  micBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  micBtnActive: { backgroundColor: '#E53935' },
  micBtnIcon: { fontSize: 20 },
  recordingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  recordingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  recordingTimer: { fontSize: 14, fontWeight: '700', color: '#E53935', minWidth: 40 },
  recordingWave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  recordingWaveBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#FF6B35' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF0F0', borderRadius: 16 },
  cancelBtnText: { fontSize: 13, color: '#E53935', fontWeight: '700' },
  audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  audioPlayBtnTheirs: { backgroundColor: '#F0F0F0' },
  audioPlayIcon: { fontSize: 14 },
  audioPlayIconMine: { color: '#FFFFFF' },
  audioPlayIconTheirs: { color: '#1A1A2E' },
  audioWaveContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  audioWaveBarMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  audioWaveBarTheirs: { backgroundColor: 'rgba(26,26,46,0.35)' },
  audioWaveBarMineFilled: { backgroundColor: 'rgba(255,255,255,1)' },
  audioWaveBarTheirsFilled: { backgroundColor: '#1A1A2E' },
  audioDuration: { fontSize: 11, fontWeight: '600', minWidth: 32 },
  audioDurationMine: { color: 'rgba(255,255,255,0.7)' },
  audioDurationTheirs: { color: '#9E9E9E' },
  bubbleImage: { width: 200, height: 150, borderRadius: 12, resizeMode: 'cover' },
  profileModalContainer: { flex: 1, backgroundColor: '#F4F6F9' },
  profileModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A2E', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 16, paddingHorizontal: 16 },
  profileModalTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  profileScroll: { padding: 16 },
  profileAvatarSection: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#FF6B35', marginBottom: 12 },
  profileAvatarPH: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,107,53,0.3)', marginBottom: 12 },
  profileAvatarInit: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  penaltyBadge: { backgroundColor: '#FFEBEE', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 },
  penaltyText: { fontSize: 13, fontWeight: '700', color: '#C62828' },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
});

export default AdminMessagesScreen;
