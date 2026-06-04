import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, TextInput, Animated, Platform, ActivityIndicator,
  KeyboardAvoidingView, SafeAreaView, Alert, Dimensions, BackHandler,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import BuyerHeader from '../../components/BuyerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';
import { updateCropPostInFirebase } from '../../services/firebaseCropService';
import {
  confirmOrderPaymentInFirebase,
  updateOrderStatusInFirebase,
} from '../../services/firebaseOrderService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, visible }: { message: string; visible: boolean }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.delay(2400),
        Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[toastStyle.box, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Text style={toastStyle.text}>{message}</Text>
    </Animated.View>
  );
};

const toastStyle = StyleSheet.create({
  box: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999, backgroundColor: '#2E7D32',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
  },
  text: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});

// ─── 24-Hour Countdown Hook ───────────────────────────────────────────────────
const usePaymentCountdown = (wonTimestamp: number) => {
  const hasStamp = wonTimestamp > 0;
  const deadline = hasStamp ? wonTimestamp + PAYMENT_DEADLINE_MS : Number.MAX_SAFE_INTEGER;

  const [remaining, setRemaining] = useState(() =>
    hasStamp ? Math.max(0, deadline - Date.now()) : PAYMENT_DEADLINE_MS,
  );

  useEffect(() => {
    if (!hasStamp) return;
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, hasStamp]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const expired = hasStamp && remaining === 0;
  return { h, m, s, expired, remaining };
};

// ─── Payment Countdown Badge ──────────────────────────────────────────────────
const PaymentCountdownBadge = ({ wonTimestamp, paid }: { wonTimestamp: number; paid: boolean }) => {
  const { h, m, s, expired } = usePaymentCountdown(wonTimestamp);
  const { isUrdu } = useLanguage();

  if (paid) return null;

  if (!wonTimestamp || wonTimestamp <= 0) {
    return (
      <View style={[cStyles.timerBadge, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}>
        <Text style={[cStyles.timerLabel, { color: '#1565C0' }]}>
          {isUrdu ? '⏳ 24 گھنٹے کا ادائیگی ٹائمر ترتیب دیا جا رہا ہے...' : '⏳ 24h payment timer is being set up...'}
        </Text>
      </View>
    );
  }

  if (expired) {
    return (
      <View style={cStyles.expiredBadge}>
        <Text style={cStyles.expiredText}>{isUrdu ? '⛔ ادائیگی کا وقت ختم ہوگیا' : '⛔ Payment Time Expired'}</Text>
      </View>
    );
  }

  const isUrgent = h === 0 && m < 30;

  return (
    <View style={[cStyles.timerBadge, isUrgent ? cStyles.timerBadgeUrgent : null]}>
      <Text style={cStyles.timerLabel}>{isUrdu ? '⏱ وقت پر ادائیگی کریں:' : '⏱ Pay within:'}</Text>
      <Text style={[cStyles.timerValue, isUrgent ? cStyles.timerValueUrgent : null]}>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </Text>
    </View>
  );
};

const cStyles = StyleSheet.create({
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#E8F5E9', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    marginBottom: 10, borderWidth: 1.5, borderColor: '#A5D6A7',
  },
  timerBadgeUrgent: { backgroundColor: '#FFF3E0', borderColor: '#FFCC80' },
  timerLabel: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },
  timerValue: { fontSize: 14, fontWeight: '800', color: '#1B5E20', letterSpacing: 1 },
  timerValueUrgent: { color: '#E65100' },
  expiredBadge: {
    backgroundColor: '#FFEBEE', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    marginBottom: 10, borderWidth: 1.5, borderColor: '#EF9A9A', alignItems: 'center',
  },
  expiredText: { fontSize: 13, fontWeight: '800', color: '#C62828' },
});

// ─── Payment Warning Box ──────────────────────────────────────────────────────
const PaymentWarningBox = ({ paid }: { paid: boolean }) => {
  const { isUrdu } = useLanguage();
  if (paid) return null;
  return (
    <View style={wStyles.box}>
      <Text style={wStyles.text}>
        {isUrdu
          ? '⚠️ جیتنے کے 24 گھنٹوں کے اندر ادائیگی کی تصدیق کرنا ضروری ہے۔ اگر وقت پر ادائیگی نہ ہوئی تو آپ کا آرڈر خودکار طور پر منسوخ ہوجائے گا اور آئٹم دوبارہ بولی میں چلا جائے گا۔'
          : '⚠️ You must confirm payment within 24 hours of winning. If payment is not made in time, your order will be automatically canceled and the item will go back to bidding.'}
      </Text>
    </View>
  );
};

const wStyles = StyleSheet.create({
  box: {
    backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#FFD54F',
  },
  text: { fontSize: 12, color: '#E65100', lineHeight: 18, fontWeight: '500' },
});

// ─── Payment Details Page ─────────────────────────────────────────────────────
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
  { name: 'Bank Alfalah',              accountName: 'Farm Nest', iban: 'PK78 ALFH 0004 5678 9012 34' },
  { name: 'Meezan Bank',               accountName: 'Farm Nest', iban: 'PK90 MEZN 0005 6789 0123 45' },
  { name: 'Faisal Bank',               accountName: 'Farm Nest', iban: 'PK55 FAYS 0006 7890 1234 56' },
];

const PaymentDetailsPage = ({ onBack }: { onBack: () => void }) => {
  const { isUrdu } = useLanguage();
  return (
  <SafeAreaView style={pdStyles.root}>
    <View style={pdStyles.header}>
      <TouchableOpacity style={pdStyles.backBtn} onPress={onBack} activeOpacity={0.8}>
        <Text style={pdStyles.backBtnText}>{isUrdu ? '-> واپس' : '<- Back'}</Text>
      </TouchableOpacity>
      <Text style={pdStyles.headerTitle}>{isUrdu ? 'ادائیگی کی تفصیلات' : 'Payment Details'}</Text>
      <View style={{ width: 70 }} />
    </View>
    <ScrollView style={pdStyles.scrollView} contentContainerStyle={pdStyles.scrollContent}
      showsVerticalScrollIndicator bounces>
      <View style={pdStyles.warning}>
        <Text style={pdStyles.warningText}>
          {isUrdu
            ? 'براہ کرم ادائیگی صرف Farm Nest ایڈمن اکاؤنٹ میں بھیجیں۔ بھیجنے سے پہلے تمام تفصیلات دوبارہ چیک کریں۔'
            : 'Please send payment to Farm Nest Admin account only. Double-check all details before sending.'}
        </Text>
      </View>
      <Text style={pdStyles.sectionHeader}>{isUrdu ? 'موبائل والٹ' : 'Mobile Wallets'}</Text>
      {MOBILE_WALLETS.map((w, i) => (
        <View key={i} style={pdStyles.card}>
          <Text style={pdStyles.cardName}>{w.name}</Text>
          <View style={pdStyles.row}>
            <Text style={pdStyles.rowLabel}>{isUrdu ? 'اکاؤنٹ کا نام' : 'Account Name'}</Text>
            <Text style={pdStyles.rowValue}>{w.accountName}</Text>
          </View>
          <View style={[pdStyles.row, { borderBottomWidth: 0 }]}>
            <Text style={pdStyles.rowLabel}>{isUrdu ? 'اکاؤنٹ نمبر' : 'Account Number'}</Text>
            <Text style={pdStyles.rowValue}>{w.accountNumber}</Text>
          </View>
        </View>
      ))}
      <Text style={[pdStyles.sectionHeader, { marginTop: 20 }]}>{isUrdu ? 'بینک اکاؤنٹس' : 'Bank Accounts'}</Text>
      {BANK_ACCOUNTS.map((b, i) => (
        <View key={i} style={pdStyles.card}>
          <Text style={pdStyles.cardName}>{b.name}</Text>
          <View style={pdStyles.row}>
            <Text style={pdStyles.rowLabel}>{isUrdu ? 'اکاؤنٹ کا نام' : 'Account Name'}</Text>
            <Text style={pdStyles.rowValue}>{b.accountName}</Text>
          </View>
          <View style={[pdStyles.row, { borderBottomWidth: 0 }]}>
            <Text style={pdStyles.rowLabel}>IBAN</Text>
            <Text style={pdStyles.rowValue}>{b.iban}</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 60 }} />
    </ScrollView>
  </SafeAreaView>
  );
};

const pdStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  backBtnText: { fontSize: 15, fontWeight: '700', color: '#1565C0' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 80 },
  warning: {
    backgroundColor: '#FFF3E0', borderRadius: 14, padding: 14, marginBottom: 20,
    borderWidth: 1.5, borderColor: '#FFB74D',
  },
  warningText: { fontSize: 13, color: '#E65100', lineHeight: 20, fontWeight: '500' },
  sectionHeader: { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  cardName: { fontSize: 15, fontWeight: '800', color: '#1565C0', marginBottom: 10 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  rowLabel: { fontSize: 13, color: '#9E9E9E', fontWeight: '600' },
  rowValue: { fontSize: 13, color: '#1B1B1B', fontWeight: '700', flex: 1, textAlign: 'right' },
});

// ─── Image Gallery ────────────────────────────────────────────────────────────
const OrderImageGallery = ({
  images,
  onImagePress,
}: {
  images: string[];
  onImagePress?: (idx: number) => void;
}) => {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);

  if (!images || images.length === 0) {
    return (
      <View style={galStyles.placeholder}>
        <Text style={{ fontSize: 28 }}>🌾</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e =>
          setActiveIdx(
            Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 28)),
          )
        }
        style={galStyles.scroll}>
        {images.map((uri, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.92}
            onPress={() => onImagePress?.(i)}>
            <Image source={{ uri }} style={galStyles.image} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={galStyles.indicatorRow}>
          <Text style={galStyles.indicatorText}>
            {activeIdx + 1}/{images.length}
          </Text>
        </View>
      )}
    </View>
  );
};

const galStyles = StyleSheet.create({
  placeholder: {
    width: '100%',
    height: 160,
    backgroundColor: '#F1F8E9',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 12,
  },
  scroll: { width: SCREEN_WIDTH - 28, height: 180 },
  image: { width: SCREEN_WIDTH - 28, height: 180, borderRadius: 12 },
  indicatorRow: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  indicatorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

// ─── Won Bid Card ─────────────────────────────────────────────────────────────
interface WonBidCardProps {
  item: any;
  currentUser: any;
  users: any[];
  addNotification: (userId: string, message: any) => void;
  addPenaltyToBuyer: (buyerId: string) => void;
  openPayModal: (win: any) => void;
  setShowPayDetails: (v: boolean) => void;
  isUrdu: boolean;
  t: (key: string) => string;
  cancelledIds: Set<string>;
  markCancelled: (postId: string) => void;
  openImageViewer: (images: string[], idx: number) => void;
  onDeleteOrder: (postId: string, bidderId: string) => void;
}

const WonBidCard = ({
  item, currentUser, users, addNotification, addPenaltyToBuyer,
  openPayModal, setShowPayDetails, isUrdu, t, cancelledIds, markCancelled, openImageViewer,
  onDeleteOrder,
}: WonBidCardProps) => {
  const paid = item.bid.paymentConfirmed;
  const farmer = users.find((u: any) => u.id === item.post.farmerId);
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  // PENALTY BUG FIX: Use ONLY wonTimestamp as the 24h deadline start.
  // Previously this fell back to item.bid.timestamp (the bid placement time),
  // which caused the 24h timer to start from when the bid was placed instead
  // of when the farmer selected/confirmed the buyer — triggering premature
  // expiry and phantom penalties.
  // If wonTimestamp is not yet set (still 0), the timer stays inactive.
  const wonTimestamp: number = (item.bid.wonTimestamp > 0) ? item.bid.wonTimestamp : 0;

  const { expired } = usePaymentCountdown(wonTimestamp);

  const didCancelRef = useRef(false);

  useEffect(() => {
    // Guard 1: wonTimestamp must be a real positive value — it is only set
    // when the farmer selects/confirms the buyer. If it is 0 or missing, the
    // 24-hour clock has not started yet; do NOT evaluate expiry.
    if (!wonTimestamp || wonTimestamp <= 0) return;

    // Guard 2: timer must actually be expired AND payment not confirmed.
    if (!expired || paid) return;

    // Guard 3: Firestore-persisted idempotency flag — prevents duplicate
    // penalties across remounts, farmer cancel-and-reselect cycles, etc.
    if (item.bid.penaltyApplied) return;

    // Guard 4: session-level ref + cancelledIds set — belt-and-suspenders
    // against the React StrictMode double-invoke and rapid re-renders.
    if (didCancelRef.current || cancelledIds.has(item.post.id)) return;

    // Guard 5: sanity check — the deadline must genuinely have passed
    // (not just expired===true from a stale render cycle).
    const deadlineMs = wonTimestamp + 24 * 60 * 60 * 1000;
    if (Date.now() < deadlineMs) return;

    didCancelRef.current = true;
    markCancelled(item.post.id);

    // Write penaltyApplied=true to Firestore FIRST so concurrent/remount
    // triggers cannot fire the penalty again.
    const updatedBids = (item.post.bids || []).map((b: any) =>
      b.bidderId === currentUser.id
        ? { ...b, penaltyApplied: true }
        : b
    );
    updateCropPostInFirebase(item.post.id, {
      selectedBidderId: null as any,
      selectedBidderNotifiedAt: null as any,
      bids: updatedBids,
    } as any).catch(e => console.warn('Auto-cancel Firestore update failed:', e));

    // Now apply penalty exactly once
    addPenaltyToBuyer(currentUser.id);

    addNotification(currentUser.id, {
      en: 'Your order for "' + item.post.cropTitle + '" was automatically canceled because payment was not made within 24 hours. The item has gone back to bidding.',
      ur: '"' + item.post.cropTitle + '" کا آرڈر خودکار طور پر منسوخ ہوگیا کیونکہ 24 گھنٹوں میں ادائیگی نہیں ہوئی۔ یہ آئٹم دوبارہ بولی میں چلا گیا ہے۔',
    });

    addNotification(item.post.farmerId, {
      en: 'The buyer did not make the payment for "' + item.post.cropTitle + '" within 24 hours. Please select another buyer from "See All Bidding".',
      ur: 'خریدار نے 24 گھنٹوں میں "' + item.post.cropTitle + '" کی ادائیگی نہیں کی۔ براہ کرم "تمام بولیاں دیکھیں" سے دوسرا خریدار منتخب کریں۔',
    });
  }, [expired, paid, wonTimestamp]);

  if (didCancelRef.current && expired && !paid) return null;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={() => onDeleteOrder(item.post.id, currentUser.id)}
      delayLongPress={400}>
      <View style={s.orderCard}>
        <OrderImageGallery
          images={item.post.images || []}
          onImagePress={(idx) => openImageViewer(item.post.images || [], idx)}
        />

        <View style={s.orderInfo}>
          <Text selectable style={[s.orderTitle, isUrdu && s.rtlText]}>{item.post.cropTitle}</Text>
          {(() => {
            const platformFee = Math.round(item.bid.amount * 0.03);
            const totalAmount = item.bid.amount + platformFee;
            return (
              <View>
                <Text selectable style={s.orderWinPrice}>
                  {t('wonAt2')} PKR {item.bid.amount.toLocaleString()}
                </Text>
                <View style={s.totalAmountRow}>
                  <Text selectable style={s.totalAmountText}>
                    {isUrdu ? 'کل ادائیگی (3% فیس شامل):' : 'Total Payable (incl. 3% fee):'}{' '}
                    <Text style={s.totalAmountValue}>PKR {totalAmount.toLocaleString()}</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowFeeInfo(prev => !prev)}
                    activeOpacity={0.7}
                    style={s.infoIconBtn}>
                    <Text style={s.infoIconText}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                {showFeeInfo && (
                  <View style={s.feeInfoBubble}>
                    <Text style={s.feeInfoText}>
                      {isUrdu
                        ? `یہ 3% پلیٹ فارم فیس ہے جو آن لائن نیلامی سروسز فراہم کرنے کے عوض فیس ہیں۔`
                        : 'These 3% are platform fees charged by FarmNest for facilitating the online auction service.'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
          <Text selectable style={s.orderFarmer}>{t('farmerLabel')} {farmer?.firstName} {farmer?.lastName}</Text>
          <View style={s.orderPayMethodRow}>
            <Text style={s.orderPayMethod}>{t('payVia')} {item.post.paymentMethod}{'  '}</Text>
            <TouchableOpacity onPress={() => setShowPayDetails(true)} activeOpacity={0.8}>
              <Text style={s.clickNowLink}>{isUrdu ? 'ابھی کلک کریں' : 'Click Now'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 24-hour countdown timer */}
        <PaymentCountdownBadge wonTimestamp={wonTimestamp} paid={paid} />

        {/* Warning message */}
        <PaymentWarningBox paid={paid} />

        <TouchableOpacity
          style={[s.confirmPayBtn, paid ? s.confirmPayBtnDone : null]}
          onPress={() => openPayModal(item)}
          disabled={paid}
          activeOpacity={0.85}>
          <Text style={s.confirmPayBtnText}>
            {paid ? t('alreadyPaid') : t('confirmPay')}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const BuyerOrderScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, users, orders, addNotification, addPenaltyToBuyer } = useApp();
  const { t, isUrdu } = useLanguage();

  // ── Force re-render every second so auction expiry and wonTimestamp changes
  // are reflected immediately without needing logout/login.
  // Without this, auctionExpired = Date.now() > bidEndTimestamp is only
  // evaluated when something else causes a re-render (e.g. a state change),
  // meaning the order never appears until the screen is navigated away and back.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMsg, setToastMsg]   = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const [showPayModal, setShowPayModal]   = useState(false);
  const [selectedWin, setSelectedWin]     = useState<any>(null);
  const [payFullName, setPayFullName]     = useState('');
  const [payPhone,    setPayPhone]        = useState('');
  const [payCity,     setPayCity]         = useState('');
  const [payAddress,  setPayAddress]      = useState('');
  const [payErrors,   setPayErrors]       = useState<any>({});
  const [payLoading,  setPayLoading]      = useState(false);

  const [showPayDetails, setShowPayDetails] = useState(false);

  // Image viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = useCallback((imgs: string[], idx: number) => {
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  }, []);

  // Track which post IDs have already been auto-cancelled this session
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());
  const markCancelled = useCallback((postId: string) => {
    setCancelledIds(prev => new Set([...prev, postId]));
  }, []);

  // ── Single consolidated back handler (useFocusEffect + refs) ──────────────
  const viewerVisibleRef  = useRef(viewerVisible);
  const showPayModalRef   = useRef(showPayModal);
  const showPayDetailsRef = useRef(showPayDetails);
  useEffect(() => { viewerVisibleRef.current  = viewerVisible;  }, [viewerVisible]);
  useEffect(() => { showPayModalRef.current   = showPayModal;   }, [showPayModal]);
  useEffect(() => { showPayDetailsRef.current = showPayDetails; }, [showPayDetails]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)  { setViewerVisible(false);  return true; }
        if (showPayModalRef.current)   { setShowPayModal(false);   return true; }
        if (showPayDetailsRef.current) { setShowPayDetails(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Data is kept live by Firestore real-time listeners in AppContext.
    // A short delay gives visual feedback that the refresh happened.
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3200);
  };

  // ── Won bids ──────────────────────────────────────────────────────────────────
  // ── Won bids: show order if farmer selected this buyer OR they are highest bidder ──
  // BUG 2 FIX: selectedBidderId check ensures the farmer-selected buyer sees
  // the order even when they are not the highest bidder.
  const myWonBids: any[] = [];
  cropPosts.forEach(post => {
    const activeBids = post.bids?.filter((b: any) => !b.cancelled) || [];
    const auctionExpired = Date.now() > (post.bidEndTimestamp || 0);
    const selectedBidderId = (post as any).selectedBidderId;

    // Debug: log every post that has this buyer as selectedBidderId
    if (selectedBidderId && selectedBidderId === currentUser?.id) {
      console.log('[myWonBids] Found selected post:', post.id,
        '| bidEndTimestamp:', post.bidEndTimestamp,
        '| auctionExpired:', auctionExpired,
        '| activeBids count:', activeBids.length,
        '| currentUser.id:', currentUser?.id,
        '| selectedBidderId:', selectedBidderId,
      );
    }

    if (!activeBids.length) return;
    if (!auctionExpired) return;

    const highest = activeBids.reduce((max: any, b: any) =>
      b.amount > max.amount ? b : max, activeBids[0]);

    // Case 1: farmer explicitly selected this buyer.
    if (selectedBidderId === currentUser?.id) {
      const myBid = activeBids.find((b: any) => b.bidderId === currentUser?.id);
      if (myBid) {
        myWonBids.push({ post, bid: myBid });
        return;
      }
      // Bid not found among active bids — log this unexpected case
      console.warn('[myWonBids] selectedBidderId matches but no active bid found for buyer!',
        'bids in post:', post.bids?.map((b: any) => ({ bidderId: b.bidderId, cancelled: b.cancelled }))
      );
      return;
    }

    // Case 2: no explicit selection — auto-winner flow.
    if (!selectedBidderId && highest.bidderId === currentUser?.id) {
      const wonTs = (highest as any).wonTimestamp || 0;
      if (wonTs > 0) {
        myWonBids.push({ post, bid: highest });
      }
    }
  });

  // ── Active bids ───────────────────────────────────────────────────────────────
  const myActiveBids: any[] = [];
  cropPosts.forEach(post => {
    const myBid = post.bids?.find((b: any) =>
      b.bidderId === currentUser?.id && !b.cancelled);
    const auctionExpired = Date.now() > (post.bidEndTimestamp || 0);
    if (myBid && !auctionExpired) myActiveBids.push({ post, bid: myBid });
  });

  // ── Firestore-backed buyer orders ─────────────────────────────────────────────
  const buyerOrders = orders.filter(
    order => order.buyerId === currentUser?.id,
  );

  // ── Delete won order (removes buyer's bid from the post) ─────────────────────
  const handleDeleteWonOrder = (postId: string, bidderId: string) => {
    Alert.alert(
      isUrdu ? 'آرڈر حذف کریں' : 'Delete Order',
      isUrdu
        ? 'کیا آپ واقعی اس جیتے ہوئے آرڈر کو اپنی فہرست سے ہٹانا چاہتے ہیں؟'
        : 'Are you sure you want to remove this won order from your list?',
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'حذف کریں' : 'Delete',
          style: 'destructive',
          onPress: () => {
            const post = cropPosts.find((p: any) => p.id === postId);
            if (!post) return;
            const updatedBids = (post.bids ?? []).filter((b: any) => b.bidderId !== bidderId);
            updateCropPostInFirebase(postId, { bids: updatedBids }).catch(e =>
              console.warn('handleDeleteWonOrder Firestore error:', e),
            );
          },
        },
      ],
    );
  };

  // ── Delete active bid (cancels the bid) ──────────────────────────────────────
  const handleDeleteActiveBid = (postId: string, bidderId: string) => {
    Alert.alert(
      isUrdu ? 'بولی منسوخ کریں' : 'Cancel Bid',
      isUrdu
        ? 'کیا آپ واقعی اس بولی کو منسوخ کرنا چاہتے ہیں؟'
        : 'Are you sure you want to cancel this bid?',
      [
        { text: isUrdu ? 'نہیں' : 'No', style: 'cancel' },
        {
          text: isUrdu ? 'ہاں، منسوخ کریں' : 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            const post = cropPosts.find((p: any) => p.id === postId);
            if (!post) return;
            const updatedBids = (post.bids ?? []).map((b: any) =>
              b.bidderId === bidderId ? { ...b, cancelled: true } : b,
            );
            updateCropPostInFirebase(postId, { bids: updatedBids }).catch(e =>
              console.warn('handleDeleteActiveBid Firestore error:', e),
            );
          },
        },
      ],
    );
  };

  // ── Open pay modal ────────────────────────────────────────────────────────────
  const openPayModal = (win: any) => {
    if (win.bid.paymentConfirmed) { showToast(t('paymentAlreadyConfirmed')); return; }
    setSelectedWin(win);
    setPayFullName(''); setPayPhone(''); setPayCity(''); setPayAddress('');
    setPayErrors({});
    setShowPayModal(true);
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validatePay = () => {
    const e: any = {};
    if (!payFullName.trim()) e.fullName = t('fullNameRequired');
    if (!payPhone.trim())    e.phone    = t('phoneRequired2');
    if (!payCity.trim())     e.city     = t('cityRequired3');
    if (!payAddress.trim())  e.address  = t('addressRequired3');
    setPayErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Confirm pay ───────────────────────────────────────────────────────────────
  const handleConfirmPay = () => {
    Alert.alert(
      isUrdu ? 'ادائیگی کی تصدیق' : 'Payment Confirmation',
      isUrdu
        ? 'ادائیگی Farm Nest ایڈمن اکاؤنٹ میں منتقل ہوگی۔ براہ کرم ادائیگی بھیجنے سے پہلے نام اور تفصیلات احتیاط سے چیک کریں۔ Farm Nest کسی غلط ادائیگی کی ذمہ دار نہیں ہوگی۔'
        : "The payment will be transferred to Farm Nest Admin's account. Please carefully check the name and details before sending the payment. Farm Nest will not be responsible for any incorrect payment.",
      [
        { text: isUrdu ? 'منسوخ کریں' : 'Cancel', style: 'cancel' },
        { text: isUrdu ? 'میں سمجھ گیا' : 'I Understand', onPress: proceedWithPayment },
      ],
    );
  };

  const proceedWithPayment = () => {
    if (!validatePay()) return;
    setPayLoading(true);

    const confirmData = {
      fullName: payFullName.trim(), phone: payPhone.trim(),
      city: payCity.trim(),        address: payAddress.trim(),
    };

    const post = cropPosts.find((p: any) => p.id === selectedWin.post.id);
    if (!post) { setPayLoading(false); return; }

    const updatedBids = (post.bids ?? []).map((b: any) =>
      b.bidderId === currentUser?.id
        ? { ...b, paymentConfirmed: true, confirmPayData: confirmData }
        : b,
    );

    // Find the matching Firestore order for this post+buyer, then update it
    const matchingOrder = orders.find(
      (o: any) => o.postId === selectedWin.post.id && o.buyerId === currentUser?.id,
    );

    const cropUpdatePromise = updateCropPostInFirebase(selectedWin.post.id, { bids: updatedBids });
    const orderUpdatePromise = matchingOrder
      ? confirmOrderPaymentInFirebase(matchingOrder.id, confirmData)
      : Promise.resolve();

    Promise.all([cropUpdatePromise, orderUpdatePromise])
      .then(() => {
        addNotification(currentUser!.id, {
          en: 'You have sent the payment to Farm Nest account.',
          ur: 'آپ نے Farm Nest اکاؤنٹ میں ادائیگی بھیج دی ہے۔',
        });
        addNotification(selectedWin.post.farmerId, {
          en: 'The buyer has sent the payment to Farm Nest account. The amount will remain on hold for 7 days.',
          ur: 'خریدار نے Farm Nest اکاؤنٹ میں ادائیگی بھیج دی ہے۔ رقم 7 دن کے لیے ہولڈ پر رہے گی۔',
        });
        setPayLoading(false);
        setShowPayModal(false);
        showToast(t('paymentConfirmedToast'));
      })
      .catch(e => {
        console.warn('proceedWithPayment Firestore error:', e);
        setPayLoading(false);
        Alert.alert('Payment Error', 'Could not confirm payment. Please try again.');
      });
  };

  // ── Render active bid card ────────────────────────────────────────────────────
  const renderActiveBid = (item: any, idx: number) => {
    const activeBids = item.post.bids?.filter((b: any) => !b.cancelled) || [];
    const highest    = activeBids.length
      ? activeBids.reduce((mx: any, b: any) => b.amount > mx.amount ? b : mx, activeBids[0])
      : null;
    const isHighest  = highest?.bidderId === currentUser?.id;
    return (
      <TouchableOpacity
        key={idx}
        activeOpacity={1}
        onLongPress={() => handleDeleteActiveBid(item.post.id, currentUser?.id)}
        delayLongPress={400}>
        <View style={s.activeBidCard}>
          <View style={s.activeBidGalleryWrap}>
            <OrderImageGallery
              images={item.post.images || []}
              onImagePress={(imgIdx) => openImageViewer(item.post.images || [], imgIdx)}
            />
          </View>
          <View style={s.activeBidInfo}>
            <Text selectable style={[s.activeBidTitle, isUrdu ? s.rtlText : null]} numberOfLines={1}>
              {item.post.cropTitle}
            </Text>
            <Text selectable style={s.activeBidAmount}>{t('yourBidLabel')} PKR {item.bid.amount.toLocaleString()}</Text>
            {highest && (
              <Text style={[s.activeBidStatus, { color: isHighest ? '#2E7D32' : '#E53935' }]}>
                {isHighest ? t('youLeading') : (t('outbidBy') + ' ' + highest.amount.toLocaleString())}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── If payment details page is open, render it full-screen ───────────────────
  if (showPayDetails) {
    return <PaymentDetailsPage onBack={() => setShowPayDetails(false)} />;
  }

  // ── Main screen ───────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <BuyerHeader title={t('myOrders')} navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} />

      {/* Full-screen image viewer */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
      <AccountPendingModal
        visible={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        role="Buyer"
      />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2E7D32']}
            tintColor="#2E7D32"
            progressBackgroundColor="#E8F5E9"
          />
        }>
        <Text style={[s.sectionTitle, isUrdu ? s.rtlText : null]}>{t('wonAuctions')}</Text>

        {myWonBids.length === 0 ? (
          <View style={s.emptySectionBox}>
            <Text style={[s.emptySectionText, isUrdu ? s.rtlText : null]}>
              {t('noWonAuctions')}
            </Text>
          </View>
        ) : (
          myWonBids.map((item, idx) => (
            <WonBidCard
              key={`wonbid-${item.post.id}-${item.bid.bidderId}`}
              item={item}
              currentUser={currentUser}
              users={users}
              addNotification={addNotification}
              addPenaltyToBuyer={addPenaltyToBuyer}
              openPayModal={openPayModal}
              setShowPayDetails={setShowPayDetails}
              isUrdu={isUrdu}
              t={t}
              cancelledIds={cancelledIds}
              markCancelled={markCancelled}
              openImageViewer={openImageViewer}
              onDeleteOrder={handleDeleteWonOrder}
            />
          ))
        )}

        <Text style={[s.sectionTitle, { marginTop: 20 }, isUrdu ? s.rtlText : null]}>
          {t('activeBids')}
        </Text>
        {myActiveBids.length === 0 ? (
          <View style={s.emptySectionBox}>
            <Text style={[s.emptySectionText, isUrdu ? s.rtlText : null]}>
              {t('noActiveBids')}
            </Text>
          </View>
        ) : (
          myActiveBids.map(renderActiveBid)
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── CONFIRM PAY MODAL ───────────────────────────────────────────────── */}
      <Modal visible={showPayModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowPayModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}>
          <View style={s.payModalCard}>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowPayModal(false)}>
              <Text style={s.modalCloseTxt}>{'X'}</Text>
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[s.payModalTitle, isUrdu ? s.rtlText : null]}>
                {t('confirmPaymentTitle')}
              </Text>

              {selectedWin && (
                <View style={s.payInfoBox}>
                  <Text selectable style={[s.payInfoTitle, isUrdu ? s.rtlText : null]}>
                    {selectedWin.post.cropTitle}
                  </Text>
                  <Text selectable style={s.payInfoAmount}>
                    {isUrdu ? 'رقم: PKR ' : 'Amount: PKR '}{selectedWin.bid.amount.toLocaleString()}
                  </Text>
                  <View style={s.payInfoMethodRow}>
                    <Text style={s.payInfoMethod}>
                      {t('paymentMethodLabel')}{': '}{selectedWin.post.paymentMethod}{'  '}
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setShowPayModal(false); setShowPayDetails(true); }}
                      activeOpacity={0.8}>
                      <Text style={s.clickNowLink}>{isUrdu ? 'ابھی کلک کریں' : 'Click Now'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <Text style={[s.payModalInstruction, isUrdu ? s.rtlText : null]}>
                {t('paymentInstruction')}
              </Text>

              {([
                { label: t('yourFullName'), key: 'fullName', value: payFullName, setter: setPayFullName, placeholder: t('enterFullName'), numeric: false },
                { label: t('phoneNumber2'), key: 'phone',    value: payPhone,    setter: setPayPhone,    placeholder: t('enterPhoneNumber'), numeric: true },
                { label: t('city2'),        key: 'city',     value: payCity,     setter: setPayCity,     placeholder: t('enterCityField'),   numeric: false },
              ] as const).map(field => (
                <View key={field.key}>
                  <Text style={[s.payLabel, isUrdu ? s.rtlText : null]}>{field.label}</Text>
                  <TextInput
                    style={[s.payInput, payErrors[field.key] ? s.payInputErr : null, isUrdu ? s.rtlInput : null]}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9E9E9E"
                    value={field.value}
                    onChangeText={txt => {
                      field.setter(txt);
                      setPayErrors((e: any) => ({ ...e, [field.key]: '' }));
                    }}
                    keyboardType={field.numeric ? 'numeric' : 'default'}
                    textAlign={isUrdu ? 'right' : 'left'}
                  />
                  {payErrors[field.key]
                    ? <Text style={s.payErrTxt}>{'! '}{payErrors[field.key]}</Text>
                    : null}
                </View>
              ))}

              <Text style={[s.payLabel, isUrdu ? s.rtlText : null]}>{t('deliveryAddress')}</Text>
              <TextInput
                style={[s.payInput, s.payMultiInput, payErrors.address ? s.payInputErr : null, isUrdu ? s.rtlInput : null]}
                placeholder={t('enterDeliveryAddressField')}
                placeholderTextColor="#9E9E9E"
                multiline
                numberOfLines={3}
                value={payAddress}
                onChangeText={txt => {
                  setPayAddress(txt);
                  setPayErrors((e: any) => ({ ...e, address: '' }));
                }}
                textAlignVertical="top"
                textAlign={isUrdu ? 'right' : 'left'}
              />
              {payErrors.address
                ? <Text style={s.payErrTxt}>{'! '}{payErrors.address}</Text>
                : null}

              <TouchableOpacity
                style={[s.confirmPaySubmitBtn, payLoading ? s.confirmPaySubmitBtnDisabled : null]}
                onPress={handleConfirmPay}
                disabled={payLoading}
                activeOpacity={0.85}>
                {payLoading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={s.confirmPaySubmitBtnText}>{t('confirmNotifyFarmer')}</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 14, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  emptySectionBox: {
    backgroundColor: '#F9F9F9', borderRadius: 14, padding: 20, alignItems: 'center',
    marginBottom: 12, borderWidth: 1, borderColor: '#EEEEEE',
  },
  emptySectionText: { fontSize: 14, color: '#9E9E9E', fontWeight: '500' },
  rtlText:  { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },

  // Order card
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  orderInfo:         { marginBottom: 12 },
  orderTitle:        { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 5 },
  orderWinPrice:     { fontSize: 15, fontWeight: '700', color: '#2E7D32', marginBottom: 3 },
  orderFarmer:       { fontSize: 13, color: '#555555', fontWeight: '500', marginBottom: 4 },

  // 3% platform fee row
  totalAmountRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  totalAmountText: { fontSize: 13, color: '#555555', fontWeight: '600', flex: 1 },
  totalAmountValue:{ color: '#1565C0', fontWeight: '800' },
  infoIconBtn:     { paddingHorizontal: 6, paddingVertical: 2 },
  infoIconText:    { fontSize: 16, color: '#1565C0', fontWeight: '800' },
  feeInfoBubble: {
    backgroundColor: '#E3F2FD', borderRadius: 10, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: '#90CAF9',
  },
  feeInfoText: { fontSize: 12, color: '#1565C0', lineHeight: 18, fontWeight: '500' },
  orderPayMethodRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  orderPayMethod:    { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  clickNowLink:      { fontSize: 13, color: '#1565C0', fontWeight: '800', textDecorationLine: 'underline' },
  confirmPayBtn: {
    backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 7,
  },
  confirmPayBtnDone: { backgroundColor: '#2E7D32', shadowOpacity: 0 },
  confirmPayBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  // Active bid card
  activeBidCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  activeBidGalleryWrap: { width: '100%' },
  activeBidInfo:   { flex: 1, padding: 12 },
  activeBidTitle:  { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  activeBidAmount: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 3 },
  activeBidStatus: { fontSize: 12, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  payModalCard: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 20, maxHeight: '90%',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 20, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  modalCloseTxt:  { fontSize: 16, color: '#555555', fontWeight: '700' },
  payModalTitle:  { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 14, marginTop: 10 },
  payInfoBox: {
    backgroundColor: '#E3F2FD', borderRadius: 14, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#BBDEFB',
  },
  payInfoTitle:     { fontSize: 16, fontWeight: '800', color: '#1565C0', marginBottom: 5 },
  payInfoAmount:    { fontSize: 15, fontWeight: '700', color: '#1B1B1B', marginBottom: 3 },
  payInfoMethodRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  payInfoMethod:    { fontSize: 13, color: '#555555', fontWeight: '600' },
  payModalInstruction: {
    fontSize: 13, color: '#555555', lineHeight: 20, marginBottom: 14, fontStyle: 'italic',
  },
  payLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 7, marginTop: 12 },
  payInput: {
    backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1B1B1B',
  },
  payMultiInput:  { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  payInputErr:    { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  payErrTxt:      { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  confirmPaySubmitBtn: {
    backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    marginTop: 20, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 9,
  },
  confirmPaySubmitBtnDisabled: { backgroundColor: '#90CAF9' },
  confirmPaySubmitBtnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default BuyerOrderScreen;
