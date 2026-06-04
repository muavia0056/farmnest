import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Modal,
  TextInput, ScrollView, Platform, Alert, Image, Animated,
  PermissionsAndroid, KeyboardAvoidingView, BackHandler,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { CachesDirectoryPath } from 'react-native-blob-util';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import ImageViewer from '../../components/ImageViewer';
import firebaseAuth from '../../firebase/auth';
import {
  sendTextMessageToFirebase,
  deleteMessageFromFirebase,
} from '../../services/firebaseMessageService';

const SuspendedScreen = ({ navigation }: any) => {
  const { setCurrentUser, currentUser, messages, setMessages } = useApp();
  const { t, isUrdu } = useLanguage();

  const MAIN_ADMIN_ID = 'main-admin-001';
  const [showMsgModal, setShowMsgModal] = useState(false);

  // Image viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImage, setViewerImage] = useState<string>('');

  // ── Back handler: close message modal on back press ──────────────────
  const showMsgModalRef = useRef(showMsgModal);
  useEffect(() => { showMsgModalRef.current = showMsgModal; }, [showMsgModal]);

  useEffect(() => {
    const onBack = () => {
      if (showMsgModalRef.current) { setShowMsgModal(false); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  const [msgText, setMsgText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const playingAudioIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const waveAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const audioRecorderPlayerRef = useRef<AudioRecorderPlayer>(new AudioRecorderPlayer());
  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission', message: 'Farmnest needs microphone access.',
        buttonPositive: 'Allow', buttonNegative: 'Deny',
      });
    }
  }, []);

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
    try { await audioRecorderPlayerRef.current.stopPlayer(); } catch {}
    audioRecorderPlayerRef.current.removePlayBackListener();
    const prevId = playingAudioIdRef.current;
    playingAudioIdRef.current = null;
    setPlayingAudioId(null);
    if (prevId) setPlaybackProgress(prev => ({ ...prev, [prevId]: 0 }));
  }, []);

  const togglePlayAudio = useCallback(async (msgId: string, uri: string) => {
    if (playingAudioIdRef.current === msgId) { await stopPlayback(); return; }
    if (playingAudioIdRef.current) await stopPlayback();
    playingAudioIdRef.current = msgId;
    setPlayingAudioId(msgId);
    await audioRecorderPlayerRef.current.startPlayer(uri);
    audioRecorderPlayerRef.current.addPlayBackListener(e => {
      const progress = e.currentPosition / (e.duration || 1);
      setPlaybackProgress(prev => ({ ...prev, [msgId]: progress }));
      if (e.currentPosition >= e.duration && e.duration > 0) { stopPlayback(); }
    });
  }, [stopPlayback]);

  const handleMicPress = useCallback(async () => {
    if (isRecordingRef.current) {
      // STOP and send
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
      if (duration >= 1 && uri) {
        setMessages((prev: any[]) => [...prev, {
          id: Date.now().toString(),
          senderId: currentUser?.id || 'unknown',
          senderName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Suspended User',
          senderRole: currentUser?.role || 'Unknown',
          receiverId: MAIN_ADMIN_ID,
          text: '', audio: uri, audioDuration: duration,
          timestamp: Date.now(), read: false,
        }]);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } else {
      // START recording
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
      try { audioRecorderPlayerRef.current.removeRecordBackListener(); } catch {}
      try { await audioRecorderPlayerRef.current.stopRecorder(); } catch {}
      audioRecorderPlayerRef.current = new AudioRecorderPlayer();
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      const fileName = `file://${CachesDirectoryPath}/voice_${Date.now()}.m4a`;
      try { await audioRecorderPlayerRef.current.startRecorder(fileName); }
      catch { Alert.alert('Error', 'Could not start recording. Please try again.'); return; }
      isRecordingRef.current = true;
      setIsRecording(true);
      startWave();
      timerRef.current = setInterval(() => { recordSecondsRef.current += 1; setRecordSeconds(recordSecondsRef.current); }, 1000);
    }
  }, [startWave, stopWave, currentUser, setMessages]);

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

  const deleteMessage = (msgId: string) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Optimistic local remove first
          setMessages((prev: any[]) => prev.filter((m: any) => m.id !== msgId));
          try { await deleteMessageFromFirebase(msgId); } catch (e) {
            console.log('Suspended deleteMessage Firebase error:', e);
          }
        },
      },
    ]);
  };

  const goToLogin = async () => {
    try { await firebaseAuth.signOut(); } catch (_) {}
    setCurrentUser(null);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const sendMessage = async () => {
    if (!msgText.trim()) {
      Alert.alert('Empty Message', 'Please write a message before sending.');
      return;
    }
    const msgContent = msgText.trim();
    const newMsg = {
      id: Date.now().toString(),
      senderId: currentUser?.id || 'unknown',
      senderName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Suspended User',
      senderRole: currentUser?.role || 'Unknown',
      receiverId: MAIN_ADMIN_ID,
      text: msgContent,
      timestamp: Date.now(),
      read: false,
    };
    // ── Optimistic update: message appears instantly ───────────────────────
    setMessages((prev: any[]) => [...prev, newMsg]);
    setMsgText('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    // ── Best-effort Firestore persist ─────────────────────────────────────
    try {
      await sendTextMessageToFirebase({
        receiverId: MAIN_ADMIN_ID,
        senderName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Suspended User',
        senderRole: currentUser?.role || 'Unknown',
        text: msgContent,
      });
    } catch (e) {
      console.log('Suspended sendMessage Firebase error:', e);
    }
  };

  const sendImageMsg = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets && result.assets[0]?.uri) {
      setMessages((prev: any[]) => [...prev, {
        id: Date.now().toString(),
        senderId: currentUser?.id || 'unknown',
        senderName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Suspended User',
        senderRole: currentUser?.role || 'Unknown',
        receiverId: MAIN_ADMIN_ID,
        text: '', image: result.assets![0].uri,
        timestamp: Date.now(), read: false,
      }]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const conversation = messages
    .filter(m =>
      (m.senderId === currentUser?.id && m.receiverId === MAIN_ADMIN_ID) ||
      (m.senderId === MAIN_ADMIN_ID && m.receiverId === currentUser?.id)
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1A1A2E" barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.icon}>🚫</Text>
        <Text style={[styles.title, isUrdu && styles.rtlText]}>{t('accountSuspendedTitle')}</Text>
        <Text style={[styles.message, isUrdu && styles.rtlText]}>{t('accountSuspendedMsg')}</Text>
        <Text style={[styles.subMessage, isUrdu && styles.rtlText]}>{t('accountSuspendedSub')}</Text>

        <TouchableOpacity style={styles.contactBtn} onPress={() => setShowMsgModal(true)} activeOpacity={0.85}>
          <Text style={styles.contactBtnText}>💬 Contact Main Admin</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={goToLogin} activeOpacity={0.85}>
          <Text style={styles.btnText}>{t('backToLogin')}</Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen image viewer */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImage ? [viewerImage] : []}
        initialIndex={0}
        onClose={() => setViewerVisible(false)}
      />

      {/* Message Modal */}
      <Modal visible={showMsgModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowMsgModal(false)}>
        <View style={styles.msgModalContainer}>
          <View style={styles.msgModalHeader}>
            <TouchableOpacity onPress={() => setShowMsgModal(false)} style={{ padding: 4 }}>
              <Text style={styles.msgModalBack}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.msgModalTitle}>Message Main Admin</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView ref={chatScrollRef} contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}>
            {conversation.length === 0 ? (
              <View style={styles.noChatBox}>
                <Text style={styles.noChatEmoji}>💬</Text>
                <Text style={styles.noChatText}>
                  Send a message to the Main Admin explaining your situation.
                </Text>
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
                        <TouchableOpacity activeOpacity={0.85} onPress={() => { setViewerImage(msg.image!); setViewerVisible(true); }}>
                          <Image source={{ uri: msg.image }} style={styles.bubbleImage} />
                        </TouchableOpacity>
                      ) : (
                        <Text selectable style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
                          {msg.text}
                        </Text>
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
            <View style={styles.inputRow}>
              {!isRecording && (
                <TouchableOpacity style={styles.plusBtn} onPress={sendImageMsg} activeOpacity={0.75}>
                  <Text style={styles.plusBtnText}>＋</Text>
                </TouchableOpacity>
              )}
              {!isRecording && (
                <TextInput style={styles.input} placeholder="Type your message to Main Admin..."
                  placeholderTextColor="#9E9E9E" value={msgText} onChangeText={setMsgText} multiline />
              )}
              {isRecording && <View style={{ flex: 1 }} />}
              {msgText.trim() ? (
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} activeOpacity={0.85}>
                  <Text style={styles.sendBtnText}>➤</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.micBtnWrap, styles.micBtn, isRecording && styles.micBtnActive]}
                  onPress={handleMicPress} activeOpacity={0.7}>
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
  container: { flex: 1, backgroundColor: '#1A1A2E', justifyContent: 'center', alignItems: 'center', padding: 30 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 32, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 18 },
  icon: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B1B1B', marginBottom: 14, textAlign: 'center' },
  message: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 24, marginBottom: 12 },
  subMessage: { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  contactBtn: { backgroundColor: '#1A1A2E', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, marginBottom: 12, width: '100%', alignItems: 'center', shadowColor: '#1A1A2E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  contactBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btn: { backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, width: '100%', alignItems: 'center', shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  msgModalContainer: { flex: 1, backgroundColor: '#F4F6F9' },
  msgModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A2E', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16 },
  msgModalBack: { fontSize: 15, color: '#FF6B35', fontWeight: '700' },
  msgModalTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  chatScroll: { paddingHorizontal: 16, paddingTop: 20 },
  noChatBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  noChatEmoji: { fontSize: 52, marginBottom: 14 },
  noChatText: { fontSize: 14, color: '#9E9E9E', fontWeight: '500', textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  msgRow: { marginBottom: 10 },
  msgRowMine: { alignItems: 'flex-end', marginRight: 8 },
  msgRowTheirs: { alignItems: 'flex-start', marginLeft: 8 },
  msgBubble: { maxWidth: '78%', borderRadius: 18, padding: 12, paddingBottom: 6, overflow: 'hidden' },
  msgBubbleMine: { backgroundColor: '#1A1A2E', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextMine: { color: '#FFFFFF' },
  msgTextTheirs: { color: '#1B1B1B' },
  msgTime: { fontSize: 10, marginTop: 4 },
  msgTimeMine: { color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  msgTimeTheirs: { color: '#9E9E9E' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  plusBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' },
  plusBtnText: { fontSize: 22, color: '#E53935', fontWeight: '700', lineHeight: 26 },
  input: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1B1B1B', maxHeight: 120, borderWidth: 1, borderColor: '#E8E8E8' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center' },
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
  recordingWaveBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#E53935' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF0F0', borderRadius: 16 },
  cancelBtnText: { fontSize: 13, color: '#E53935', fontWeight: '700' },
  audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
  audioPlayBtnTheirs: { backgroundColor: '#FFEBEE' },
  audioPlayIcon: { fontSize: 14, color: '#FFFFFF' },
  audioWaveContainer: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  audioWaveBar: { width: 3, borderRadius: 2 },
  audioWaveBarMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  audioWaveBarTheirs: { backgroundColor: 'rgba(229,57,53,0.35)' },
  audioWaveBarMineFilled: { backgroundColor: 'rgba(255,255,255,1)' },
  audioWaveBarTheirsFilled: { backgroundColor: '#E53935' },
  audioDuration: { fontSize: 11, fontWeight: '600', minWidth: 32 },
  audioDurationMine: { color: 'rgba(255,255,255,0.7)' },
  audioDurationTheirs: { color: '#9E9E9E' },
  bubbleImage: { width: 180, height: 150, borderRadius: 8, resizeMode: 'cover' },
});

export default SuspendedScreen;
