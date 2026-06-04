import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  BackHandler, Modal, StatusBar, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';
import ImageViewer from '../../components/ImageViewer';
import {
  sendTextMessageToFirebase,
} from '../../services/firebaseMessageService';
import { Alert, TextInput, ActivityIndicator } from 'react-native';

const InvestorInvestmentsScreen = ({ navigation }: any) => {
  const { currentUser, investmentOrders, fundingPosts, users, messages } = useApp();
  const { t, isUrdu } = useLanguage();

  const [profileModal, setProfileModal] = useState<any>(null);
  const [chatModal, setChatModal] = useState<{ farmerId: string; farmerName: string; postTitle: string } | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [profileImageViewerVisible, setProfileImageViewerVisible] = useState(false);

  const viewerRef = useRef(viewerVisible);
  viewerRef.current = viewerVisible;

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerRef.current) { setViewerVisible(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // All investment orders for current investor
  const myOrders = investmentOrders.filter((o: any) => o.investorId === currentUser?.id);

  // Unique postIds invested in
  const investedPostIds = [...new Set(myOrders.map((o: any) => o.postId))];
  const investedPostDetails = investedPostIds.map(pid => {
    const post = fundingPosts.find((p: any) => p.id === pid);
    const orders = myOrders.filter((o: any) => o.postId === pid);
    const totalInvested = orders.reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
    return { post, orders, totalInvested };
  }).filter(item => !!item.post);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return '#1B5E20';
      case 'PaymentSent': return '#1565C0';
      case 'PendingPayment': return '#E65100';
      default: return '#9E9E9E';
    }
  };
  const getStatusBg = (status: string) => {
    switch (status) {
      case 'Approved': return '#E8F5E9';
      case 'PaymentSent': return '#E3F2FD';
      case 'PendingPayment': return '#FFF8E1';
      default: return '#F5F5F5';
    }
  };
  const getStatusLabel = (status: string) => {
    if (isUrdu) {
      switch (status) {
        case 'Approved': return 'منظور شدہ ✓';
        case 'PaymentSent': return 'ادائیگی بھیجی';
        case 'PendingPayment': return 'ادائیگی باقی';
        default: return status;
      }
    }
    switch (status) {
      case 'Approved': return 'Admin Approved ✓';
      case 'PaymentSent': return 'Payment Sent';
      case 'PendingPayment': return 'Pending Payment';
      default: return status;
    }
  };

  const openFarmerProfile = (farmerId: string) => {
    const farmer = users.find((u: any) => u.id === farmerId);
    if (farmer) setProfileModal(farmer);
  };

  const openChat = (farmerId: string, farmerName: string, postTitle: string) => {
    setChatText('');
    setChatModal({ farmerId, farmerName, postTitle });
  };

  const sendChat = async () => {
    if (!chatText.trim() || !chatModal || !currentUser) return;
    const msg = chatText.trim();
    setChatText('');
    setChatLoading(true);
    try {
      await sendTextMessageToFirebase({
        receiverId: chatModal.farmerId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        senderRole: currentUser.role,
        text: msg,
      });
    } catch {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setChatLoading(false);
    }
  };

  const chatMessages = chatModal
    ? messages
        .filter(
          (m: any) =>
            (m.senderId === currentUser?.id && m.receiverId === chatModal.farmerId) ||
            (m.senderId === chatModal.farmerId && m.receiverId === currentUser?.id)
        )
        .sort((a: any, b: any) => a.timestamp - b.timestamp)
    : [];

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const farmerAvgRating = (farmer: any) => {
    const reviews = farmer?.reviews || [];
    if (!reviews.length) return 0;
    return reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length;
  };

  return (
    <View style={styles.container}>
      <InvestorHeader title={isUrdu ? 'میری سرمایہ کاریاں' : 'My Investments'} navigation={navigation} />

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={0}
        onClose={() => setViewerVisible(false)}
      />

      {/* Farmer Profile Modal */}
      <Modal
        visible={!!profileModal}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { setProfileModal(null); setProfileImageViewerVisible(false); }}>
        {profileModal && (
          <View style={styles.profileModal}>
            <ImageViewer
              visible={profileImageViewerVisible}
              images={profileModal.profilePic ? [profileModal.profilePic] : []}
              initialIndex={0}
              onClose={() => setProfileImageViewerVisible(false)}
            />
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setProfileModal(null); setProfileImageViewerVisible(false); }} style={styles.modalBack}>
                <Text style={styles.modalBackText}>{t('backLabel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{isUrdu ? 'کسان کا پروفائل' : 'Farmer Profile'}</Text>
              <View style={{ width: 70 }} />
            </View>
            <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.profileAvatarSection}>
                {profileModal.profilePic ? (
                  <TouchableOpacity onPress={() => setProfileImageViewerVisible(true)} activeOpacity={0.85}>
                    <Image source={{ uri: profileModal.profilePic }} style={styles.profileAvatar} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.profileAvatarPH}>
                    <Text style={styles.profileAvatarInit}>{profileModal.firstName?.[0]}{profileModal.lastName?.[0]}</Text>
                  </View>
                )}
                <Text style={styles.profileName}>{profileModal.firstName} {profileModal.lastName}</Text>
                <View style={{ flexDirection: 'row', gap: 3, marginVertical: 6 }}>
                  {[1,2,3,4,5].map(s => (
                    <Text key={s} style={{ fontSize: 20, color: s <= Math.round(farmerAvgRating(profileModal)) ? '#F9A825' : '#E0E0E0' }}>★</Text>
                  ))}
                </View>
                <Text style={{ fontSize: 12, color: '#9E9E9E', marginBottom: 8 }}>
                  ({(profileModal.reviews || []).length} {isUrdu ? 'جائزے' : 'reviews'})
                </Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>🌾 {isUrdu ? 'کسان' : 'Farmer'}</Text>
                </View>
              </View>
              <View style={styles.infoCard}>
                {[
                  { icon: '📧', label: isUrdu ? 'ای میل' : 'Email', value: profileModal.email },
                  { icon: '📱', label: isUrdu ? 'فون' : 'Phone', value: profileModal.phone },
                  { icon: '🏙️', label: isUrdu ? 'شہر' : 'City', value: profileModal.city },
                  { icon: '📍', label: isUrdu ? 'پتہ' : 'Address', value: profileModal.address },
                ].map(row => (
                  <View key={row.label} style={styles.infoRow}>
                    <Text style={styles.infoIcon}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoValue}>{row.value || '—'}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Chat Modal */}
      <Modal
        visible={!!chatModal}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setChatModal(null)}>
        {chatModal && (
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setChatModal(null)} style={styles.modalBack}>
                <Text style={styles.modalBackText}>{t('backLabel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>💬 {chatModal.farmerName}</Text>
              <View style={{ width: 70 }} />
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {chatMessages.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
                  <Text style={{ fontSize: 15, color: '#9E9E9E' }}>
                    {isUrdu ? 'گفتگو شروع کریں' : 'Start the conversation'}
                  </Text>
                </View>
              ) : (
                chatMessages.map((msg: any) => {
                  const isMine = msg.senderId === currentUser?.id;
                  return (
                    <View key={msg.id} style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
                      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={[styles.bubbleTxt, isMine ? { color: '#FFF' } : { color: '#1B1B1B' }]}>
                          {msg.text}
                        </Text>
                        <Text style={[styles.bubbleTime, isMine && { color: '#CE93D8' }]}>
                          {formatTime(msg.timestamp)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder={isUrdu ? 'پیغام لکھیں...' : 'Type message...'}
                placeholderTextColor="#9E9E9E"
                value={chatText}
                onChangeText={setChatText}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!chatText.trim() || chatLoading) && { opacity: 0.5 }]}
                onPress={sendChat}
                disabled={!chatText.trim() || chatLoading}
                activeOpacity={0.8}>
                {chatLoading ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <Text style={{ color: '#FFF', fontSize: 16 }}>➤</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {investedPostDetails.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💼</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtl]}>
            {isUrdu ? 'کوئی سرمایہ کاری نہیں' : 'No Investments Yet'}
          </Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtl]}>
            {isUrdu
              ? 'کسی فنڈنگ پوسٹ میں سرمایہ کاری کریں تاکہ یہاں ظاہر ہو۔'
              : 'Invest in a funding post and it will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={investedPostDetails}
          keyExtractor={(item: any) => item.post.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const { post, orders, totalInvested } = item;
            const farmer = users.find((u: any) => u.id === post.farmerId);
            const progressPct = post.targetAmount > 0
              ? Math.min(100, Math.round((post.investedAmount / post.targetAmount) * 100))
              : 0;
            return (
              <View style={styles.postCard}>
                {/* Post header */}
                <View style={styles.postHeaderRow}>
                  {post.images?.[0] ? (
                    <TouchableOpacity onPress={() => { setViewerImages(post.images); setViewerVisible(true); }} activeOpacity={0.85}>
                      <Image source={{ uri: post.images[0] }} style={styles.postThumb} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.postThumb, { backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>🌍</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.postTitle, isUrdu && styles.rtl]} numberOfLines={2}>
                      {post.title || post.landTitle}
                    </Text>
                    <Text style={styles.postCity}>📍 {post.city}</Text>
                    <View style={[styles.postStatusPill, {
                      backgroundColor: post.status === 'Funded' ? '#E8F5E9' : '#F9F5FF',
                    }]}>
                      <Text style={[styles.postStatusText, {
                        color: post.status === 'Funded' ? '#1B5E20' : '#6A1B9A',
                      }]}>
                        {post.status === 'Funded' ? '✅ Funded' : '🟢 Open'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Progress */}
                <View style={styles.progressSection}>
                  <View style={styles.progressRow}>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>{isUrdu ? 'ہدف' : 'Target'}</Text>
                      <Text style={styles.progressValue}>PKR {Number(post.targetAmount || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>{isUrdu ? 'جمع' : 'Raised'}</Text>
                      <Text style={[styles.progressValue, { color: '#2E7D32' }]}>
                        PKR {Number(post.investedAmount || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>{isUrdu ? 'آپ کا حصہ' : 'Your Share'}</Text>
                      <Text style={[styles.progressValue, { color: '#6A1B9A' }]}>
                        PKR {Number(totalInvested).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progressPct}%` as any }]} />
                  </View>
                  <Text style={styles.progressPct}>{progressPct}% {isUrdu ? 'مکمل' : 'funded'}</Text>
                </View>

                {/* My orders for this post */}
                {orders.map((order: any) => (
                  <View key={order.id} style={[styles.orderItem, { borderLeftColor: getStatusColor(order.status) }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B1B1B' }}>
                        PKR {Number(order.amount || 0).toLocaleString()}
                      </Text>
                      <View style={[styles.orderStatusBadge, { backgroundColor: getStatusBg(order.status) }]}>
                        <Text style={[styles.orderStatusText, { color: getStatusColor(order.status) }]}>
                          {getStatusLabel(order.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#9E9E9E', marginTop: 3 }}>
                      {new Date(order.createdAtMillis || 0).toLocaleDateString('en-PK')}
                    </Text>
                  </View>
                ))}

                {/* Farmer info + actions */}
                {farmer && (
                  <View style={styles.farmerRow}>
                    {farmer.profilePic ? (
                      <Image source={{ uri: farmer.profilePic }} style={styles.farmerAvatar} />
                    ) : (
                      <View style={styles.farmerAvatarPH}>
                        <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>
                          {farmer.firstName?.[0]}{farmer.lastName?.[0]}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B1B1B' }}>
                        {farmer.firstName} {farmer.lastName}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9E9E9E' }}>🌾 {isUrdu ? 'کسان' : 'Farmer'}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#EDE7F6', marginRight: 6 }]}
                      onPress={() => openFarmerProfile(post.farmerId)}
                      activeOpacity={0.85}>
                      <Text style={[styles.actionBtnText, { color: '#6A1B9A' }]}>
                        👤 {isUrdu ? 'پروفائل' : 'Profile'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#6A1B9A' }]}
                      onPress={() => openChat(post.farmerId, `${farmer.firstName} ${farmer.lastName}`, post.title || post.landTitle)}
                      activeOpacity={0.85}>
                      <Text style={[styles.actionBtnText, { color: '#FFF' }]}>
                        💬 {isUrdu ? 'پیغام' : 'Message'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },

  postCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  postHeaderRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  postThumb: { width: 70, height: 70, borderRadius: 14, resizeMode: 'cover' },
  postTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  postCity: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 6 },
  postStatusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  postStatusText: { fontSize: 11, fontWeight: '700' },

  progressSection: { marginBottom: 14 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressItem: { alignItems: 'center' },
  progressLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  progressValue: { fontSize: 13, fontWeight: '800', color: '#1B1B1B' },
  progressBarBg: { height: 8, backgroundColor: '#EDE7F6', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: 8, backgroundColor: '#6A1B9A', borderRadius: 4 },
  progressPct: { fontSize: 11, color: '#6A1B9A', fontWeight: '700', textAlign: 'right' },

  orderItem: {
    borderLeftWidth: 3, backgroundColor: '#FAFAFA', borderRadius: 10,
    padding: 10, marginBottom: 8,
  },
  orderStatusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  orderStatusText: { fontSize: 11, fontWeight: '700' },

  farmerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    backgroundColor: '#F9F5FF', borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: '#EDE7F6',
  },
  farmerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#6A1B9A' },
  farmerAvatarPH: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center',
  },
  actionBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  actionBtnText: { fontSize: 12, fontWeight: '800' },

  // Profile Modal
  profileModal: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8,
    paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    elevation: 4,
  },
  modalBack: { padding: 6, minWidth: 70 },
  modalBackText: { fontSize: 15, color: '#6A1B9A', fontWeight: '700' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B', flex: 1, textAlign: 'center' },
  profileScrollContent: { padding: 16, paddingBottom: 50 },
  profileAvatarSection: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  profileAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32', marginBottom: 12 },
  profileAvatarPH: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  profileAvatarInit: { color: '#FFF', fontSize: 34, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  rolePill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  rolePillText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },

  // Chat
  chatInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  chatInput: {
    flex: 1, fontSize: 14, color: '#1B1B1B', maxHeight: 100,
    backgroundColor: '#F5F5F5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center',
  },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRight: { justifyContent: 'flex-end' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 10 },
  bubbleMine: { backgroundColor: '#6A1B9A', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#F0F0F0' },
  bubbleTxt: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: '#9E9E9E', marginTop: 3 },

  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});

export default InvestorInvestmentsScreen;
