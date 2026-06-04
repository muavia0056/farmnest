import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, Platform, BackHandler, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';

const FarmerInvestorsScreen = ({ navigation }: any) => {
  const { currentUser, fundingPosts, users, investmentOrders } = useApp();
  const { isUrdu } = useLanguage();

  const [investorProfileModal, setInvestorProfileModal] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => { navigation.openDrawer(); return true; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // All funding posts belonging to this farmer
  const myFundingPosts = fundingPosts.filter((p: any) => p.farmerId === currentUser?.id);

  // Posts that have at least one approved investment order (new flow) OR legacy investors
  const approvedOrderPostIds = new Set(
    investmentOrders
      .filter((o: any) => o.farmerId === currentUser?.id && o.status === 'Approved')
      .map((o: any) => o.postId)
  );
  const investedPosts = myFundingPosts.filter(
    (p: any) => approvedOrderPostIds.has(p.id) || (p.investors || []).length > 0
  );

  // Total approved count for summary banner
  const totalApproved = investmentOrders.filter(
    (o: any) => o.farmerId === currentUser?.id && o.status === 'Approved'
  ).length;

  return (
    <View style={styles.container}>
      <FarmerHeader
        title={isUrdu ? 'کسان فنڈنگ' : 'Farmer Funding'}
        navigation={navigation}
      />

      {/* Investor Profile Modal */}
      <Modal
        visible={!!investorProfileModal}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setInvestorProfileModal(null)}>
        {investorProfileModal && (
          <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setInvestorProfileModal(null)} style={{ minWidth: 70 }}>
                <Text style={styles.modalBack}>← {isUrdu ? 'واپس' : 'Back'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {isUrdu ? 'سرمایہ کار کا پروفائل' : 'Investor Profile'}
              </Text>
              <View style={{ width: 70 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
              <View style={styles.profileCard}>
                {investorProfileModal.profilePic ? (
                  <Image source={{ uri: investorProfileModal.profilePic }} style={styles.profileAvatar} />
                ) : (
                  <View style={styles.profileAvatarPH}>
                    <Text style={styles.profileAvatarInit}>
                      {investorProfileModal.firstName?.[0]}{investorProfileModal.lastName?.[0]}
                    </Text>
                  </View>
                )}
                <Text style={styles.profileName}>
                  {investorProfileModal.firstName} {investorProfileModal.lastName}
                </Text>
                <View style={styles.profileRolePill}>
                  <Text style={styles.profileRolePillText}>💼 {isUrdu ? 'سرمایہ کار' : 'Investor'}</Text>
                </View>
              </View>
              <View style={styles.infoCard}>
                {[
                  { icon: '📧', label: isUrdu ? 'ای میل' : 'Email', value: investorProfileModal.email },
                  { icon: '📱', label: isUrdu ? 'فون' : 'Phone', value: investorProfileModal.phone },
                  { icon: '🏙️', label: isUrdu ? 'شہر' : 'City', value: investorProfileModal.city },
                  { icon: '📍', label: isUrdu ? 'پتہ' : 'Address', value: investorProfileModal.address },
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
            </ScrollView>
          </View>
        )}
      </Modal>

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

        {/* Summary banner */}
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryEmoji}>💼</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, isUrdu && styles.rtl]}>
              {isUrdu ? 'سرمایہ کاری کا جائزہ' : 'Investment Overview'}
            </Text>
            <Text style={[styles.summarySubtitle, isUrdu && styles.rtl]}>
              {isUrdu
                ? `${investedPosts.length} پوسٹ · ${totalApproved} منظور شدہ سرمایہ کار`
                : `${investedPosts.length} post(s) · ${totalApproved} approved investor(s)`}
            </Text>
          </View>
        </View>

        {/* Empty state */}
        {investedPosts.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={[styles.emptyTitle, isUrdu && styles.rtl]}>
              {isUrdu ? 'ابھی کوئی سرمایہ کاری نہیں' : 'No Investments Yet'}
            </Text>
            <Text style={[styles.emptySubtitle, isUrdu && styles.rtl]}>
              {isUrdu
                ? 'جب کوئی سرمایہ کار آپ کی فنڈنگ پوسٹ میں سرمایہ کاری کرے اور ایڈمن منظور کرے تو یہاں نظر آئے گا۔'
                : 'When an investor funds your post and the admin approves it, they will appear here.'}
            </Text>
          </View>
        )}

        {/* One card per funded post */}
        {investedPosts.map((post: any) => {
          const approvedOrders = investmentOrders.filter(
            (o: any) => o.postId === post.id && o.status === 'Approved'
          );
          const legacyInvestors = (post.investors || []).filter((inv: any) =>
            !investmentOrders.some(
              (o: any) => o.postId === post.id && o.investorId === inv.investorId && o.status === 'Approved'
            )
          );
          const totalInvestors = approvedOrders.length + legacyInvestors.length;
          const totalRaised = Number(post.investedAmount || 0);
          const targetAmount = Number(post.targetAmount || 0);
          const progressPct = targetAmount > 0
            ? Math.min(100, Math.round((totalRaised / targetAmount) * 100))
            : 0;

          return (
            <View key={post.id} style={styles.postCard}>
              {/* Post header row */}
              <View style={styles.postRow}>
                {post.images?.[0] ? (
                  <Image source={{ uri: post.images[0] }} style={styles.postImage} />
                ) : (
                  <View style={styles.postImagePH}>
                    <Text style={{ fontSize: 26 }}>🌍</Text>
                  </View>
                )}
                <View style={styles.postInfo}>
                  <Text style={[styles.postTitle, isUrdu && styles.rtl]} numberOfLines={1}>
                    {post.title || post.landTitle}
                  </Text>
                  <Text style={styles.postCity}>📍 {post.city}</Text>
                  <View style={styles.postStatsRow}>
                    <Text style={styles.postStatLabel}>
                      {isUrdu ? 'ہدف' : 'Target'}:{' '}
                      <Text style={styles.postStatValue}>
                        PKR {targetAmount.toLocaleString()}
                      </Text>
                    </Text>
                    <Text style={[styles.postStatLabel, { marginLeft: 12 }]}>
                      {isUrdu ? 'جمع' : 'Raised'}:{' '}
                      <Text style={[styles.postStatValue, { color: '#2E7D32' }]}>
                        PKR {totalRaised.toLocaleString()}
                      </Text>
                    </Text>
                  </View>
                  {/* Progress bar */}
                  {targetAmount > 0 && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
                      </View>
                      <Text style={styles.progressPct}>{progressPct}%</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Investor count pill */}
              <View style={styles.investorCountRow}>
                <View style={styles.investorCountBadge}>
                  <Text style={styles.investorCountText}>
                    👥 {totalInvestors}{' '}
                    {isUrdu ? 'سرمایہ کار' : totalInvestors === 1 ? 'Investor' : 'Investors'}
                  </Text>
                </View>
              </View>

              {/* ── Approved orders (new flow) ── */}
              {approvedOrders.map((order: any) => {
                const investor = users.find((u: any) => u.id === order.investorId);
                return (
                  <View key={`order-${order.id}`} style={styles.investorRow}>
                    <View style={styles.investorTopRow}>
                      {investor?.profilePic ? (
                        <Image source={{ uri: investor.profilePic }} style={styles.investorAvatar} />
                      ) : (
                        <View style={styles.investorAvatarPH}>
                          <Text style={styles.investorAvatarInit}>
                            {(investor?.firstName || order.investorName || '?')[0]}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.investorName} numberOfLines={1}>
                          {investor
                            ? `${investor.firstName} ${investor.lastName}`
                            : order.investorName}
                        </Text>
                        <Text style={styles.investorAmount}>
                          PKR {Number(order.amount || 0).toLocaleString()}
                        </Text>
                        <View style={styles.approvedBadge}>
                          <Text style={styles.approvedBadgeText}>
                            ✅ {isUrdu ? 'منظور شدہ' : 'Approved'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.investorBtnRow}>
                      <TouchableOpacity
                        style={[styles.profileBtn, { flex: 1 }]}
                        onPress={() => { if (investor) setInvestorProfileModal(investor); }}
                        activeOpacity={0.85}>
                        <Text style={[styles.profileBtnText, { textAlign: 'center' }]}>
                          👤 {isUrdu ? 'پروفائل' : 'Profile'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.messageBtn, { flex: 1 }]}
                        onPress={() =>
                          navigation.navigate('FarmerMessages', { openChatWithUserId: order.investorId })
                        }
                        activeOpacity={0.85}>
                        <Text style={[styles.messageBtnText, { textAlign: 'center' }]}>
                          💬 {isUrdu ? 'پیغام' : 'Message'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* ── Legacy investors from post.investors (old flow fallback) ── */}
              {legacyInvestors.map((inv: any, idx: number) => {
                const investor = users.find((u: any) => u.id === inv.investorId);
                return (
                  <View key={`legacy-${idx}`} style={styles.investorRow}>
                    <View style={styles.investorTopRow}>
                      {investor?.profilePic ? (
                        <Image source={{ uri: investor.profilePic }} style={styles.investorAvatar} />
                      ) : (
                        <View style={styles.investorAvatarPH}>
                          <Text style={styles.investorAvatarInit}>
                            {(investor?.firstName || inv.investorName || '?')[0]}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.investorName} numberOfLines={1}>
                          {investor
                            ? `${investor.firstName} ${investor.lastName}`
                            : inv.investorName}
                        </Text>
                        <Text style={styles.investorAmount}>
                          PKR {Number(inv.amount || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.investorBtnRow}>
                      <TouchableOpacity
                        style={[styles.profileBtn, { flex: 1 }]}
                        onPress={() => { if (investor) setInvestorProfileModal(investor); }}
                        activeOpacity={0.85}>
                        <Text style={[styles.profileBtnText, { textAlign: 'center' }]}>
                          👤 {isUrdu ? 'پروفائل' : 'Profile'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.messageBtn, { flex: 1 }]}
                        onPress={() =>
                          navigation.navigate('FarmerMessages', { openChatWithUserId: inv.investorId })
                        }
                        activeOpacity={0.85}>
                        <Text style={[styles.messageBtnText, { textAlign: 'center' }]}>
                          💬 {isUrdu ? 'پیغام' : 'Message'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  summaryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#6A1B9A', borderRadius: 18, padding: 18, marginBottom: 16,
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  summaryEmoji: { fontSize: 36 },
  summaryTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  summarySubtitle: { fontSize: 13, color: '#F3E5F5', fontWeight: '500' },

  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: {
    fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20,
  },

  postCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  postRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  postImage: { width: 80, height: 80, borderRadius: 14, resizeMode: 'cover' },
  postImagePH: {
    width: 80, height: 80, borderRadius: 14, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center',
  },
  postInfo: { flex: 1 },
  postTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  postCity: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 6 },
  postStatsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  postStatLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },
  postStatValue: { fontWeight: '700', color: '#1B1B1B' },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressBg: { flex: 1, height: 6, backgroundColor: '#E8F5E9', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#2E7D32', borderRadius: 3 },
  progressPct: { fontSize: 10, color: '#2E7D32', fontWeight: '800', minWidth: 30, textAlign: 'right' },

  investorCountRow: { marginBottom: 10 },
  investorCountBadge: {
    backgroundColor: '#F1F8E9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    alignSelf: 'flex-start', borderWidth: 1.5, borderColor: '#C8E6C9',
  },
  investorCountText: { fontSize: 12, fontWeight: '700', color: '#1B5E20' },

  investorRow: {
    flexDirection: 'column',
    backgroundColor: '#F9F5FF', borderRadius: 14, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#EDE7F6',
  },
  investorTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  investorBtnRow: {
    flexDirection: 'row', gap: 10,
  },
  investorAvatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#6A1B9A',
  },
  investorAvatarPH: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center',
  },
  investorAvatarInit: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  investorName: { fontSize: 13, fontWeight: '700', color: '#1B1B1B', marginBottom: 2, flexShrink: 1 },
  investorAmount: { fontSize: 12, color: '#6A1B9A', fontWeight: '700', marginBottom: 4 },
  approvedBadge: {
    backgroundColor: '#E8F5E9', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
  },
  approvedBadgeText: { color: '#1B5E20', fontSize: 11, fontWeight: '700' },

  profileBtn: {
    backgroundColor: '#EDE7F6', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  profileBtnText: { color: '#6A1B9A', fontSize: 11, fontWeight: '800' },
  messageBtn: {
    backgroundColor: '#6A1B9A', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  messageBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', elevation: 4,
  },
  modalBack: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  profileCard: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  profileAvatar: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#6A1B9A', marginBottom: 12,
  },
  profileAvatarPH: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  profileAvatarInit: { color: '#FFF', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 8 },
  profileRolePill: {
    backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  profileRolePillText: { fontSize: 13, fontWeight: '700', color: '#6A1B9A' },
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

  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});

export default FarmerInvestorsScreen;
