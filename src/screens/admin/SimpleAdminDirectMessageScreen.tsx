import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, Platform, Image, Animated,
  PermissionsAndroid, KeyboardAvoidingView, Alert, Modal,
} from 'react-native';
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

const SimpleAdminDirectMessageScreen = ({ navigation }: any) => {
  const { currentUser, messages, setMessages, blockUser, unblockUser, isBlocked } = useApp();
  const MAIN_ADMIN_ID = 'main-admin-001';
  const [chatText, setChatText] = useState('');
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [chatImageViewerVisible, setChatImageViewerVisible] = useState(false);
  const [chatImageViewerUri, setChatImageViewerUri] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const playingAudioIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const micScale = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const chatScrollRef = useRef<ScrollView>(null);
  const recorderRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const playerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission', message: 'Farmnest needs microphone access.',
        buttonPositive: 'Allow', buttonNegative: 'Deny',
      });
    }
  }, []);

  // Mark conversation as read when screen opens
  useEffect(() => {
    if (!currentUser?.id) return;
    setMessages(prev =>
      prev.map(m =>
        m.senderId === MAIN_ADMIN_ID && m.receiverId === currentUser.id ? { ...m, read: true } : m
      )
    );
    markConversationAsReadInFirebase(currentUser.id, MAIN_ADMIN_ID).catch(e =>
      console.log('SimpleAdmin markAsRead error:', e)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

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
    if (isRecordingRef.current) return;
    playingAudioIdRef.current = msgId;
    setPlayingAudioId(msgId);
    await playerRef.current.startPlayer(uri);
    playerRef.current.addPlayBackListener(e => {
      const progress = e.currentPosition / (e.duration || 1);
      setPlaybackProgress(prev => ({ ...prev, [msgId]: progress }));
      if (e.currentPosition >= e.duration && e.duration > 0) { stopPlayback(); }
    });
  }, [stopPlayback]);

  const handleMicPress = useCallback(async () => {
    if (!currentUser) {
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
        await recorderRef.current.startRecorder();
        isRecordingRef.current = true;
        setIsRecording(true);

        stopWave();
        startWave();

        Animated.spring(micScale, {toValue: 1.15, useNativeDriver: true}).start();

        timerRef.current = setInterval(() => {
          recordSecondsRef.current += 1;
          setRecordSeconds(recordSecondsRef.current);
        }, 1000);
      } catch (error) {
        Alert.alert('Recorder Error', 'Failed to start recording.');
        console.log('Simple admin start recording error:', error);
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
    Animated.spring(micScale, {toValue: 1, useNativeDriver: true}).start();

    try {
      const resultPath = await recorderRef.current.stopRecorder();
      recorderRef.current.removeRecordBackListener();

      const finalPath = resultPath || '';
      const finalDuration = recordSecondsRef.current;

      recordSecondsRef.current = 0;
      setRecordSeconds(0);

      if (!finalPath) {
        Alert.alert('Recorder Error', 'No audio recording found.');
        return;
      }

      setLoading(true);

      await sendAudioMessageToFirebase({
        receiverId: MAIN_ADMIN_ID,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderRole: currentUser.role,
        audioUri: finalPath,
        audioDuration: finalDuration,
      });

      setLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({animated: true}), 100);
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to send voice message. Please try again.';

      if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_AUDIO_UPLOAD_FAILED') {
        message = 'Audio upload failed. Please try again.';
      }

      Alert.alert('Voice Message Error', message);
      console.log('Simple admin handleMicPress error:', error);
    }
  }, [currentUser, micScale, startWave, stopWave]);

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
    try { await playerRef.current.stopPlayer(); } catch {}
    playerRef.current.removePlayBackListener();
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    recorderRef.current.removeRecordBackListener();
    recorderRef.current = new AudioRecorderPlayer();
    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    const filePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/voice_${Date.now()}.mp4`;
    try { await recorderRef.current.startRecorder(filePath); }
    catch (err: any) {
      console.warn('[SimpleAdminDM] startRecorder error:', err);
      Alert.alert('Error', 'Could not start recording. Please restart the app and try again.');
      return;
    }
    isRecordingRef.current = true;
    setIsRecording(true);
    startWave();
    Animated.spring(micScale, { toValue: 1.35, useNativeDriver: true }).start();
    timerRef.current = setInterval(() => { recordSecondsRef.current += 1; setRecordSeconds(recordSecondsRef.current); }, 1000);
  }, [startWave, micScale]);

  const deleteMessage = (msgId: string) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Optimistic local remove first
          setMessages((prev: any[]) => prev.filter((m: any) => m.id !== msgId));
          try { await deleteMessageFromFirebase(msgId); } catch (e) {
            console.log('SimpleAdmin deleteMessage Firebase error:', e);
          }
        },
      },
    ]);
  };

  const conversation = messages
    .filter(m =>
      ((m.senderId === currentUser?.id && m.receiverId === MAIN_ADMIN_ID) ||
       (m.senderId === MAIN_ADMIN_ID && m.receiverId === currentUser?.id)) &&
      !isBlocked(currentUser?.id ?? '', m.senderId)
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const sendMessage = async () => {
    if (!chatText.trim() || !currentUser) return;
    if (isBlocked(MAIN_ADMIN_ID, currentUser.id)) {
      Alert.alert('Unable to Send', 'You cannot send messages to this user.');
      return;
    }
    const msgText = chatText.trim();
    const newMsg = {
      id: Date.now().toString(),
      senderId: currentUser.id,
      senderName: `${currentUser.firstName} ${currentUser.lastName}`,
      senderRole: currentUser.role,
      receiverId: MAIN_ADMIN_ID,
      text: msgText,
      timestamp: Date.now(),
      read: false,
    };
    // ── Optimistic update: message appears instantly ───────────────────────
    setMessages((prev: any[]) => [...prev, newMsg]);
    setChatText('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    // ── Best-effort Firestore persist ─────────────────────────────────────
    try {
      await sendTextMessageToFirebase({
        senderDisplayId: currentUser.id, // use AppContext id so Firestore matches what screens filter on
        receiverId: MAIN_ADMIN_ID,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        senderRole: currentUser.role,
        text: msgText,
      });
    } catch (e) {
      console.log('SimpleAdmin sendMessage Firebase error:', e);
    }
  };

  const [loading, setLoading] = useState(false);

  const sendImageMsg = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'Please open a chat first.');
      return;
    }
    if (isBlocked(MAIN_ADMIN_ID, currentUser.id)) {
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
        receiverId: MAIN_ADMIN_ID,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        senderRole: currentUser.role,
        imageUri: pickedUri,
      });

      setLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({animated: true}), 100);
    } catch (error: any) {
      setLoading(false);

      let message = 'Failed to send image message. Please try again.';

      if (error.message === 'CLOUDINARY_CONFIG_MISSING') {
        message = 'Cloudinary configuration is missing.';
      } else if (error.message === 'CLOUDINARY_UPLOAD_FAILED') {
        message = 'Image upload failed. Please try again.';
      }

      Alert.alert('Image Message Error', message);
      console.log('Simple admin sendImageMsg error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <AdminHeader title="Message Main Admin" navigation={navigation} />

      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>👑</Text>
        <View style={{ flex: 1 }}>
          <Text selectable style={styles.bannerTitle}>Muhammad Muavia</Text>
          <Text style={styles.bannerSub}>Main Admin · Direct Message</Text>
        </View>
      </View>

      <Modal visible={showMenuModal} transparent animationType="fade" onRequestClose={() => setShowMenuModal(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenuModal(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>Muhammad Muavia · Main Admin</Text>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.75}
              onPress={() => {
                setShowMenuModal(false);
                if (!currentUser) return;
                const blocked = isBlocked(currentUser.id, MAIN_ADMIN_ID);
                Alert.alert(
                  blocked ? 'Unblock Main Admin' : 'Block Main Admin',
                  blocked
                    ? 'Are you sure you want to unblock Main Admin? They will be able to send you messages again.'
                    : 'Are you sure you want to block Main Admin? You will no longer receive messages from them.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: blocked ? 'Unblock' : 'Block',
                      style: blocked ? 'default' : 'destructive',
                      onPress: () => {
                        if (!currentUser) return;
                        if (blocked) unblockUser(currentUser.id, MAIN_ADMIN_ID);
                        else blockUser(currentUser.id, MAIN_ADMIN_ID);
                      },
                    },
                  ]
                );
              }}>
              <Text style={[styles.menuItemText, currentUser && isBlocked(currentUser.id, MAIN_ADMIN_ID) ? styles.menuItemUnblock : styles.menuItemBlock]}>
                {currentUser && isBlocked(currentUser.id, MAIN_ADMIN_ID) ? '🔓 Unblock User' : '🚫 Block User'}
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
          <View style={styles.noChatBox}>
            <Text style={styles.noChatEmoji}>💬</Text>
            <Text style={styles.noChatText}>No messages yet. Send a message to Main Admin.</Text>
          </View>
        ) : (
          conversation.map(msg => {
            const isMine = msg.senderId === currentUser?.id;
            const isPlaying = playingAudioId === msg.id;
            return (
              <TouchableOpacity key={msg.id} activeOpacity={1} onLongPress={() => deleteMessage(msg.id)}
                style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
                <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
                  {msg.audio ? (
                    <TouchableOpacity style={styles.audioBubble} onPress={() => togglePlayAudio(msg.id, msg.audio!)} activeOpacity={0.7}>
                      <View style={[styles.audioPlayBtn, isMine ? styles.audioPlayBtnMine : styles.audioPlayBtnTheirs]}>
                        <Text style={styles.audioPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
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
                    <TouchableOpacity activeOpacity={0.85} onPress={() => { setChatImageViewerUri(msg.image!); setChatImageViewerVisible(true); }}>
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

      <ImageViewer visible={chatImageViewerVisible} images={chatImageViewerUri ? [chatImageViewerUri] : []} initialIndex={0} onClose={() => setChatImageViewerVisible(false)} />

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
            <TouchableOpacity onPress={async () => {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
              isRecordingRef.current = false;
              setIsRecording(false);
              stopWave();
              Animated.spring(micScale, { toValue: 1, useNativeDriver: true }).start();
              try { await recorderRef.current.stopRecorder(); } catch {}
              recorderRef.current.removeRecordBackListener();
              recordSecondsRef.current = 0;
              setRecordSeconds(0);
            }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>✕ Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          {!isRecording && (
            <TouchableOpacity style={styles.plusBtn} onPress={sendImageMsg} activeOpacity={0.75}>
              <Text style={styles.plusBtnText}>＋</Text>
            </TouchableOpacity>
          )}
          {!isRecording && (
            <TextInput style={styles.input} placeholder="Type a message to Main Admin..." placeholderTextColor="#9E9E9E"
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
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1A1A2E', margin: 14, borderRadius: 18, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  bannerIcon: { fontSize: 36 },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  menuBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { fontSize: 24, color: '#FFFFFF', fontWeight: '700', lineHeight: 28 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 20 },
  menuSheetTitle: { fontSize: 14, color: '#9E9E9E', fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  menuItem: { paddingVertical: 16, borderRadius: 14, backgroundColor: '#F8F9FA', marginBottom: 10, alignItems: 'center' },
  menuItemText: { fontSize: 16, fontWeight: '700' },
  menuItemBlock: { color: '#E53935' },
  menuItemUnblock: { color: '#546E7A' },
  menuItemCancel: { backgroundColor: '#EEEEEE' },
  menuItemCancelText: { fontSize: 15, fontWeight: '600', color: '#555555' },
  chatScroll: { paddingHorizontal: 16, paddingTop: 10 },
  noChatBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  noChatEmoji: { fontSize: 52, marginBottom: 14 },
  noChatText: { fontSize: 14, color: '#9E9E9E', fontWeight: '500', textAlign: 'center', paddingHorizontal: 16 },
  msgRow: { marginBottom: 10 },
  msgRowMine: { alignItems: 'flex-end', marginRight: 8 },
  msgRowTheirs: { alignItems: 'flex-start', marginLeft: 8 },
  msgBubble: { maxWidth: '78%', borderRadius: 18, padding: 12, paddingBottom: 6 },
  msgBubbleMine: { backgroundColor: '#546E7A', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextMine: { color: '#FFFFFF' },
  msgTextTheirs: { color: '#1B1B1B' },
  msgTime: { fontSize: 10, marginTop: 4 },
  msgTimeMine: { color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  msgTimeTheirs: { color: '#9E9E9E' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  plusBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ECEFF1', justifyContent: 'center', alignItems: 'center' },
  plusBtnText: { fontSize: 22, color: '#546E7A', fontWeight: '700', lineHeight: 26 },
  input: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1B1B1B', maxHeight: 120, borderWidth: 1, borderColor: '#E8E8E8' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#546E7A', justifyContent: 'center', alignItems: 'center' },
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
  recordingWaveBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#546E7A' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF0F0', borderRadius: 16 },
  cancelBtnText: { fontSize: 13, color: '#E53935', fontWeight: '700' },
  audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  audioPlayBtnTheirs: { backgroundColor: '#ECEFF1' },
  audioPlayIcon: { fontSize: 14, color: '#FFFFFF' },
  audioWaveContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  audioWaveBarMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  audioWaveBarTheirs: { backgroundColor: 'rgba(84,110,122,0.35)' },
  audioWaveBarMineFilled: { backgroundColor: 'rgba(255,255,255,1)' },
  audioWaveBarTheirsFilled: { backgroundColor: '#546E7A' },
  audioDuration: { fontSize: 11, fontWeight: '600', minWidth: 32 },
  audioDurationMine: { color: 'rgba(255,255,255,0.7)' },
  audioDurationTheirs: { color: '#9E9E9E' },
  bubbleImage: { width: 200, height: 150, borderRadius: 12, resizeMode: 'cover' },
});

export default SimpleAdminDirectMessageScreen;
