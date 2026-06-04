import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, Alert, ActivityIndicator, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';

const MOBILE_WALLETS = [
  { name: 'JazzCash',  accountName: 'Farm Nest', accountNumber: '0300 1234567' },
  { name: 'EasyPaisa', accountName: 'Farm Nest', accountNumber: '0311 2345678' },
  { name: 'SadaPay',   accountName: 'Farm Nest', accountNumber: '0312 3456789' },
  { name: 'NayaPay',   accountName: 'Farm Nest', accountNumber: '0321 4567890' },
];
const BANK_ACCOUNTS = [
  { name: 'HBL (Habib Bank Limited)', accountName: 'Farm Nest', iban: 'PK36 HABB 0001 2345 6789 01' },
  { name: 'UBL (United Bank Limited)', accountName: 'Farm Nest', iban: 'PK12 UNIL 0002 3456 7890 12' },
  { name: 'MCB Bank',                  accountName: 'Farm Nest', iban: 'PK45 MUCB 0003 4567 8901 23' },
  { name: 'Meezan Bank',               accountName: 'Farm Nest', iban: 'PK90 MEZN 0005 6789 0123 45' },
];

const InvestorPaymentScreen = ({ navigation }: any) => {
  const { currentUser, investmentOrders, fundingPosts } = useApp();
  const { t, isUrdu } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [feeInfoOrderId, setFeeInfoOrderId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => { navigation.openDrawer(); return true; };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // Orders for this investor that are PendingPayment
  const myPendingOrders = investmentOrders.filter(
    (o: any) => o.investorId === currentUser?.id && o.status === 'PendingPayment'
  );
  const myPaidOrders = investmentOrders.filter(
    (o: any) => o.investorId === currentUser?.id && (o.status === 'PaymentSent' || o.status === 'Approved')
  );

  const handleMarkPaid = async (orderId: string) => {
    Alert.alert(
      isUrdu ? 'ادائیگی کی تصدیق' : 'Confirm Payment Sent',
      isUrdu
        ? 'کیا آپ نے Farm Nest اکاؤنٹ میں ادائیگی بھیج دی ہے؟ ایڈمن کی تصدیق کے بعد سرمایہ کاری مکمل ہوگی۔'
        : 'Have you sent the payment to the Farm Nest account? Investment will be confirmed after admin approval.',
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'ہاں، بھیج دیا' : 'Yes, Payment Sent',
          onPress: async () => {
            setLoading(true);
            try {
              await firestore().collection('investmentOrders').doc(orderId).update({
                status: 'PaymentSent',
                paymentSentAt: firestore.FieldValue.serverTimestamp(),
                updatedAt: firestore.FieldValue.serverTimestamp(),
              });
              Alert.alert(
                isUrdu ? 'شکریہ' : 'Thank You',
                isUrdu
                  ? 'آپ کی ادائیگی کی اطلاع موصول ہوگئی۔ ایڈمن کی تصدیق کا انتظار کریں۔'
                  : 'Payment notification received. Please wait for admin approval.'
              );
            } catch (e) {
              Alert.alert('Error', 'Failed to update. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getPostTitle = (postId: string) => {
    const post = fundingPosts.find((p: any) => p.id === postId);
    return post ? (post.title || post.landTitle || 'Land Post') : 'Land Post';
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <InvestorHeader title={isUrdu ? 'ادائیگی' : 'Payment'} navigation={navigation} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── 24-Hour Deadline Notice Post ── */}
        {myPendingOrders.length > 0 && (
          <View style={styles.noticePost}>
            <View style={styles.noticePostHeader}>
              <Text style={styles.noticePostIcon}>📢</Text>
              <Text style={[styles.noticePostTitle, isUrdu && styles.rtl]}>
                {isUrdu ? 'اہم اطلاع — Farm Nest' : 'Important Notice — Farm Nest'}
              </Text>
            </View>
            <Text style={[styles.noticePostBody, isUrdu && styles.rtl]}>
              {isUrdu
                ? `آپ نے سرمایہ کاری کا آرڈر دیا ہے۔ براہ کرم اپنی سرمایہ کاری کی رقم 24 گھنٹوں کے اندر Farm Nest اکاؤنٹ میں جمع کروائیں۔\n\nادائیگی نہ کرنے کی صورت میں آپ کا آرڈر منسوخ کیا جا سکتا ہے اور آپ کے اکاؤنٹ پر جرمانہ لگایا جائے گا۔`
                : `You have placed an investment order. Please transfer your investment amount to the Farm Nest account within 24 hours.\n\nFailure to pay on time may result in order cancellation and a penalty on your investor account.`}
            </Text>
            <View style={styles.noticePostFooter}>
              <Text style={styles.noticePostFooterText}>
                ⏰ {isUrdu ? 'ادائیگی کا وقت: 24 گھنٹے' : 'Payment deadline: 24 hours'}
              </Text>
            </View>
          </View>
        )}

        {/* Pending Orders */}
        {myPendingOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
              ⏳ {isUrdu ? 'زیر التواء ادائیگیاں' : 'Pending Payments'}
            </Text>
            {myPendingOrders.map((order: any) => (
              <View key={order.id} style={[styles.orderCard, { borderLeftColor: '#F9A825' }]}>
                <Text style={[styles.orderTitle, isUrdu && styles.rtl]} numberOfLines={1}>
                  📋 {getPostTitle(order.postId)}
                </Text>
                {(() => {
                  const base = Number(order.amount || 0);
                  const fee = Math.round(base * 0.03);
                  const total = base + fee;
                  const showFee = feeInfoOrderId === order.id;
                  return (
                    <>
                      <Text style={styles.orderAmount}>
                        PKR {base.toLocaleString()}
                      </Text>
                      <View style={styles.totalAmountRow}>
                        <Text style={styles.totalAmountText}>
                          {isUrdu ? 'کل ادائیگی (3% فیس شامل):' : 'Total Payable (incl. 3% fee):'}{' '}
                          <Text style={styles.totalAmountValue}>PKR {total.toLocaleString()}</Text>
                        </Text>
                        <TouchableOpacity
                          onPress={() => setFeeInfoOrderId(showFee ? null : order.id)}
                          activeOpacity={0.7}
                          style={styles.infoIconBtn}>
                          <Text style={styles.infoIconText}>ⓘ</Text>
                        </TouchableOpacity>
                      </View>
                      {showFee && (
                        <View style={styles.feeInfoBubble}>
                          <Text style={styles.feeInfoText}>
                            {isUrdu
                              ? 'یہ 3% پلیٹ فارم فیس ہے جو آن لائن سرمایہ کاری سروسز فراہم کرنے کے عوض فیس ہیں۔'
                              : 'These 3% are platform fees charged by FarmNest for facilitating the investment service.'}
                          </Text>
                        </View>
                      )}
                    </>
                  );
                })()}
                <Text style={styles.orderDate}>{formatDate(order.createdAtMillis)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: '#FFF8E1' }]}>
                  <Text style={[styles.statusText, { color: '#E65100' }]}>
                    {isUrdu ? 'ادائیگی باقی ہے' : 'Payment Pending'}
                  </Text>
                </View>

                <View style={[styles.warningBox, { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }]}>
                  <Text style={{ fontSize: 12, color: '#E65100', lineHeight: 18 }}>
                    {isUrdu
                      ? `نیچے دیے گئے اکاؤنٹ میں PKR ${(Number(order.amount || 0) + Math.round(Number(order.amount || 0) * 0.03)).toLocaleString()} بھیجیں اور پھر "ادائیگی بھیج دی" دبائیں۔`
                      : `Please send PKR ${(Number(order.amount || 0) + Math.round(Number(order.amount || 0) * 0.03)).toLocaleString()} to one of the Farm Nest accounts below, then tap "Mark as Paid".`}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.paidBtn, loading && { opacity: 0.6 }]}
                  onPress={() => handleMarkPaid(order.id)}
                  disabled={loading}
                  activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <Text style={styles.paidBtnText}>
                      ✅ {isUrdu ? 'ادائیگی بھیج دی' : 'Mark as Paid'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Paid / Approved Orders */}
        {myPaidOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
              ✅ {isUrdu ? 'مکمل ادائیگیاں' : 'Completed / Approved'}
            </Text>
            {myPaidOrders.map((order: any) => (
              <View key={order.id} style={[styles.orderCard, { borderLeftColor: '#2E7D32' }]}>
                <Text style={[styles.orderTitle, isUrdu && styles.rtl]} numberOfLines={1}>
                  📋 {getPostTitle(order.postId)}
                </Text>
                {(() => {
                  const base = Number(order.amount || 0);
                  const fee = Math.round(base * 0.03);
                  const total = base + fee;
                  const showFee = feeInfoOrderId === order.id;
                  return (
                    <>
                      <Text style={styles.orderAmount}>
                        PKR {base.toLocaleString()}
                      </Text>
                      <View style={styles.totalAmountRow}>
                        <Text style={styles.totalAmountText}>
                          {isUrdu ? 'کل ادائیگی (3% فیس شامل):' : 'Total Payable (incl. 3% fee):'}{' '}
                          <Text style={styles.totalAmountValue}>PKR {total.toLocaleString()}</Text>
                        </Text>
                        <TouchableOpacity
                          onPress={() => setFeeInfoOrderId(showFee ? null : order.id)}
                          activeOpacity={0.7}
                          style={styles.infoIconBtn}>
                          <Text style={styles.infoIconText}>ⓘ</Text>
                        </TouchableOpacity>
                      </View>
                      {showFee && (
                        <View style={styles.feeInfoBubble}>
                          <Text style={styles.feeInfoText}>
                            {isUrdu
                              ? 'یہ 3% پلیٹ فارم فیس ہے جو آن لائن سرمایہ کاری سروسز فراہم کرنے کے عوض فیس ہیں۔'
                              : 'These 3% are platform fees charged by FarmNest for facilitating the investment service.'}
                          </Text>
                        </View>
                      )}
                    </>
                  );
                })()}
                <Text style={styles.orderDate}>{formatDate(order.createdAtMillis)}</Text>
                <View style={[styles.statusBadge, {
                  backgroundColor: order.status === 'Approved' ? '#E8F5E9' : '#E3F2FD',
                }]}>
                  <Text style={[styles.statusText, {
                    color: order.status === 'Approved' ? '#1B5E20' : '#1565C0',
                  }]}>
                    {order.status === 'Approved'
                      ? (isUrdu ? 'ایڈمن نے منظور کیا' : 'Admin Approved ✓')
                      : (isUrdu ? 'ادائیگی بھیجی گئی' : 'Payment Sent — Awaiting Admin')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {myPendingOrders.length === 0 && myPaidOrders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>💳</Text>
            <Text style={[styles.emptyTitle, isUrdu && styles.rtl]}>
              {isUrdu ? 'کوئی سرمایہ کاری نہیں' : 'No Investments Yet'}
            </Text>
            <Text style={[styles.emptySubtitle, isUrdu && styles.rtl]}>
              {isUrdu
                ? 'کسی فنڈنگ پوسٹ میں سرمایہ کاری کریں تاکہ یہاں ادائیگی ظاہر ہو۔'
                : 'Invest in a funding post to see payment details here.'}
            </Text>
          </View>
        )}

        {/* Payment Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
            📱 {isUrdu ? 'موبائل والٹ' : 'Mobile Wallets'}
          </Text>
          {MOBILE_WALLETS.map((w, i) => (
            <View key={i} style={styles.paymentCard}>
              <Text style={styles.paymentCardName}>{w.name}</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{isUrdu ? 'اکاؤنٹ نام' : 'Account Name'}</Text>
                <Text style={styles.paymentValue}>{w.accountName}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{isUrdu ? 'اکاؤنٹ نمبر' : 'Account Number'}</Text>
                <Text style={styles.paymentValue}>{w.accountNumber}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
            🏦 {isUrdu ? 'بینک اکاؤنٹس' : 'Bank Accounts'}
          </Text>
          {BANK_ACCOUNTS.map((b, i) => (
            <View key={i} style={styles.paymentCard}>
              <Text style={styles.paymentCardName}>{b.name}</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{isUrdu ? 'اکاؤنٹ نام' : 'Account Name'}</Text>
                <Text style={styles.paymentValue}>{b.accountName}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>IBAN</Text>
                <Text style={styles.paymentValue}>{b.iban}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  orderTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  orderAmount: { fontSize: 18, fontWeight: '900', color: '#6A1B9A', marginBottom: 4 },

  // 3% platform fee row
  totalAmountRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  totalAmountText: { fontSize: 13, color: '#555555', fontWeight: '600', flex: 1 },
  totalAmountValue:{ color: '#6A1B9A', fontWeight: '800' },
  infoIconBtn:     { paddingHorizontal: 6, paddingVertical: 2 },
  infoIconText:    { fontSize: 16, color: '#6A1B9A', fontWeight: '800' },
  feeInfoBubble: {
    backgroundColor: '#EDE7F6', borderRadius: 10, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#CE93D8',
  },
  feeInfoText: { fontSize: 12, color: '#6A1B9A', lineHeight: 18, fontWeight: '500' },
  orderDate: { fontSize: 12, color: '#9E9E9E', fontWeight: '500', marginBottom: 10 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
  warningBox: { borderRadius: 10, padding: 10, borderWidth: 1.5, marginBottom: 12 },
  paidBtn: {
    backgroundColor: '#6A1B9A', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  paidBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  paymentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#EDE7F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3,
  },
  paymentCardName: { fontSize: 15, fontWeight: '800', color: '#6A1B9A', marginBottom: 8 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  paymentLabel: { fontSize: 12, color: '#9E9E9E', fontWeight: '600' },
  paymentValue: { fontSize: 13, fontWeight: '700', color: '#1B1B1B', flex: 1, textAlign: 'right' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  noticePost: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FF6B35',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  noticePostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  noticePostIcon: { fontSize: 22 },
  noticePostTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#BF360C',
    flex: 1,
  },
  noticePostBody: {
    fontSize: 13,
    color: '#4E342E',
    lineHeight: 21,
    marginBottom: 12,
  },
  noticePostFooter: {
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  noticePostFooterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

export default InvestorPaymentScreen;
