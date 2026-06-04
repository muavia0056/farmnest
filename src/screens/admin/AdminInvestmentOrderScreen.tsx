import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Alert, ActivityIndicator, BackHandler, Platform, StatusBar, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { ensureMainAdminSession } from '../../services/sessionService';

const AdminInvestmentOrderScreen = ({ navigation }: any) => {
  const { investmentOrders, users, fundingPosts, addNotification, addPenaltyToInvestor } = useApp();
  const { isUrdu } = useLanguage();
  const [loading, setLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'PaymentSent' | 'PendingPayment' | 'Approved' | 'Rejected'>('PaymentSent');

  useFocusEffect(
    useCallback(() => {
      const onBack = () => { navigation.openDrawer(); return true; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const filtered = investmentOrders.filter((o: any) =>
    filter === 'all' ? true : o.status === filter
  ).sort((a: any, b: any) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));

  const getUser = (uid: string) => users.find((u: any) => u.id === uid);
  const getPost = (pid: string) => fundingPosts.find((p: any) => p.id === pid);

  const handleApprove = async (order: any) => {
    Alert.alert(
      'Approve Investment',
      `Approve PKR ${Number(order.amount || 0).toLocaleString()} investment by ${order.investorName}?\n\nThis will update the Raised amount on the funding post.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setLoading(order.id);
            try {
              // Ensure admin is authenticated before touching Firestore
              await ensureMainAdminSession();

              // 1. Update the order status
              await firestore().collection('investmentOrders').doc(order.id).update({
                status: 'Approved',
                adminApproved: true,
                approvedAt: firestore.FieldValue.serverTimestamp(),
                updatedAt: firestore.FieldValue.serverTimestamp(),
              });

              // 2. Update fundingPost investedAmount in a transaction
              const postRef = firestore().collection('fundingPosts').doc(order.postId);
              await firestore().runTransaction(async transaction => {
                const postSnap = await transaction.get(postRef);
                if (!postSnap.exists) return;
                const postData: any = postSnap.data() || {};
                const prevInvested = Number(postData.investedAmount || 0);
                const targetAmount = Number(postData.targetAmount || 0);
                const newInvested = prevInvested + Number(order.amount || 0);
                const investors = Array.isArray(postData.investors) ? postData.investors : [];

                // Add investor entry if not already there
                const alreadyIn = investors.some(
                  (inv: any) => inv.investorId === order.investorId &&
                    Math.abs((inv.timestamp || 0) - (order.createdAtMillis || 0)) < 60000
                );
                const updatedInvestors = alreadyIn ? investors : [
                  ...investors,
                  {
                    id: order.id,
                    investorId: order.investorId,
                    investorName: order.investorName,
                    amount: Number(order.amount || 0),
                    timestamp: order.createdAtMillis || Date.now(),
                    status: 'Approved',
                  },
                ];
                const isNowFunded = newInvested >= targetAmount && targetAmount > 0;
                transaction.update(postRef, {
                  investedAmount: newInvested,
                  investors: updatedInvestors,
                  status: isNowFunded ? 'Funded' : postData.status,
                  updatedAt: firestore.FieldValue.serverTimestamp(),
                });
              });

              // 3. Notify investor
              const post = getPost(order.postId);
              addNotification(order.investorId, {
                en: `✅ Your investment of PKR ${Number(order.amount || 0).toLocaleString()} in "${post?.title || post?.landTitle || 'Land Post'}" has been approved!`,
                ur: `✅ "${post?.title || post?.landTitle || 'Land Post'}" میں آپ کی PKR ${Number(order.amount || 0).toLocaleString()} سرمایہ کاری منظور ہوگئی!`,
              });
              // 4. Notify farmer
              if (post?.farmerId) {
                addNotification(post.farmerId, {
                  en: `💼 PKR ${Number(order.amount || 0).toLocaleString()} investment in "${post.title || post.landTitle}" has been approved by admin.`,
                  ur: `💼 "${post.title || post.landTitle}" میں PKR ${Number(order.amount || 0).toLocaleString()} سرمایہ کاری ایڈمن نے منظور کی۔`,
                });
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to approve. Please try again.');
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = async (order: any) => {
    Alert.alert(
      'Reject Investment',
      `Reject this investment order?\n\nInvestor: ${order.investorName}\nAmount: PKR ${Number(order.amount || 0).toLocaleString()}\n\nA penalty will be added to the investor.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject & Penalize',
          style: 'destructive',
          onPress: async () => {
            setLoading(order.id);
            try {
              await ensureMainAdminSession();
              await firestore().collection('investmentOrders').doc(order.id).update({
                status: 'Rejected',
                adminApproved: false,
                rejectedAt: firestore.FieldValue.serverTimestamp(),
                updatedAt: firestore.FieldValue.serverTimestamp(),
              });
              // Apply penalty to investor
              addPenaltyToInvestor(order.investorId);
            } catch (e) {
              Alert.alert('Error', 'Failed to reject. Please try again.');
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return '#1B5E20';
      case 'PaymentSent': return '#1565C0';
      case 'PendingPayment': return '#E65100';
      case 'Rejected': return '#C62828';
      default: return '#9E9E9E';
    }
  };
  const getStatusBg = (status: string) => {
    switch (status) {
      case 'Approved': return '#E8F5E9';
      case 'PaymentSent': return '#E3F2FD';
      case 'PendingPayment': return '#FFF8E1';
      case 'Rejected': return '#FFEBEE';
      default: return '#F5F5F5';
    }
  };

  const FILTERS = [
    { key: 'PaymentSent', label: 'Payment Sent' },
    { key: 'PendingPayment', label: 'Pending' },
    { key: 'Approved', label: 'Approved' },
    { key: 'Rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💼 Investment Orders</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key as any)}
            activeOpacity={0.75}>
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
              {f.key !== 'all' && (
                ` (${investmentOrders.filter((o: any) => o.status === f.key).length})`
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }}>
      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No {filter === 'all' ? '' : filter} orders</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: order }) => {
            const investor = getUser(order.investorId);
            const farmer = order.farmerId ? getUser(order.farmerId) : null;
            const post = getPost(order.postId);
            return (
              <View style={styles.orderCard}>
                {/* Status badge */}
                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(order.status) }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                    {order.status}
                  </Text>
                </View>

                {/* Amount */}
                <Text style={styles.orderAmount}>
                  PKR {Number(order.amount || 0).toLocaleString()}
                </Text>

                {/* Post info */}
                {post && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>🌍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Funding Post</Text>
                      <Text style={styles.infoValue}>{post.title || post.landTitle}</Text>
                    </View>
                  </View>
                )}

                {/* Investor */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>💼</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Investor</Text>
                    <Text style={styles.infoValue}>{order.investorName}</Text>
                    {investor?.email ? <Text style={{ fontSize: 11, color: '#9E9E9E' }}>{investor.email}</Text> : null}
                    {investor?.phone ? <Text style={{ fontSize: 11, color: '#9E9E9E' }}>{investor.phone}</Text> : null}
                    {/* Penalty count */}
                    {(investor?.penalties || 0) > 0 && (
                      <View style={styles.penaltyBadge}>
                        <Text style={styles.penaltyText}>⚠️ {investor?.penalties}/3 Penalties</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Farmer */}
                {farmer && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>🌾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Farmer</Text>
                      <Text style={styles.infoValue}>{farmer.firstName} {farmer.lastName}</Text>
                    </View>
                  </View>
                )}

                {/* Date */}
                <Text style={styles.orderDate}>
                  🗓 {new Date(order.createdAtMillis || 0).toLocaleDateString('en-PK', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </Text>

                {/* Action buttons — shown for PaymentSent AND PendingPayment orders */}
                {(order.status === 'PaymentSent' || order.status === 'PendingPayment') && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.approveBtn, loading === order.id && { opacity: 0.6 }]}
                      onPress={() => handleApprove(order)}
                      disabled={!!loading}
                      activeOpacity={0.85}>
                      {loading === order.id ? <ActivityIndicator color="#FFF" size="small" /> : (
                        <Text style={styles.actionBtnText}>✅ Approve</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn, loading === order.id && { opacity: 0.6 }]}
                      onPress={() => handleReject(order)}
                      disabled={!!loading}
                      activeOpacity={0.85}>
                      <Text style={styles.actionBtnText}>❌ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8,
    paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#1A1A2E',
  },
  menuBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  menuIcon: { fontSize: 22, color: '#FFFFFF' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', flex: 1, textAlign: 'center' },
  filterScroll: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', flexGrow: 0 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center', flexDirection: 'row' },
  filterTab: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  filterTabActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  filterTabText: { fontSize: 12, fontWeight: '700', color: '#555' },
  filterTabTextActive: { color: '#FFFFFF' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9E9E9E' },
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-end', marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  orderAmount: { fontSize: 24, fontWeight: '900', color: '#FF6B35', marginBottom: 14 },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoIcon: { fontSize: 18, marginTop: 2 },
  infoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1B1B1B', lineHeight: 20 },
  orderDate: { fontSize: 12, color: '#9E9E9E', fontWeight: '500', marginTop: 10, marginBottom: 14 },
  penaltyBadge: { backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 4 },
  penaltyText: { fontSize: 11, color: '#C62828', fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  approveBtn: {
    backgroundColor: '#1B5E20',
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  rejectBtn: {
    backgroundColor: '#C62828',
    shadowColor: '#C62828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

export default AdminInvestmentOrderScreen;
