import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Modal, ScrollView, Platform, BackHandler, Animated,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import FarmerHeader from '../../components/FarmerHeader';
import { updateCropPostInFirebase } from '../../services/firebaseCropService';
import db from '../../firebase/firestore';
import firestore from '@react-native-firebase/firestore';

// ─── Countdown hook ────────────────────────────────────────────────────────────
const useCountdown = (endTimestamp: number) => {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, endTimestamp - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTimestamp]);
  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0;
  return { d, h, m, s, expired };
};

// ─── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ message, visible, color = '#2E7D32' }: { message: string; visible: boolean; color?: string }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { backgroundColor: color, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

// ─── Countdown badge ────────────────────────────────────────────────────────────
const CountdownBadge = ({ endTimestamp }: { endTimestamp: number }) => {
  const { d, h, m, s, expired } = useCountdown(endTimestamp);
  const { isUrdu } = useLanguage();
  if (expired) {
    return (
      <View style={[styles.countdownBadge, { backgroundColor: '#FFEBEE' }]}>
        <Text style={[styles.countdownText, { color: '#C62828' }]}>{isUrdu ? '\u26D4 \u0628\u0648\u0644\u06CC \u062E\u062A\u0645 \u06C1\u0648\u06AF\u0626\u06CC' : '\u26D4 Bidding Ended'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.countdownBadge}>
      <Text style={styles.countdownText}>{'\u23F1'} {d}d {h}h {m}m {s}s</Text>
    </View>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────────────
const FarmerSeeAllBiddingScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, users, addNotification } = useApp();
  const { t, isUrdu } = useLanguage();

  // ── Tracks which auctions have expired, updated once per second.
  // Only causes a re-render when the set of expired IDs actually changes,
  // so badges update smoothly without constant flickering.
  const [expiredPostIds, setExpiredPostIds] = useState<Set<string>>(new Set());

  // Keep refs to cropPosts and currentUser.id so the interval can always
  // read the latest values without needing to restart on every update.
  const cropPostsRef = useRef(cropPosts);
  const currentUserIdRef = useRef(currentUser?.id);
  useEffect(() => { cropPostsRef.current = cropPosts; }, [cropPosts]);
  useEffect(() => { currentUserIdRef.current = currentUser?.id; }, [currentUser?.id]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const posts = cropPostsRef.current;
      const uid = currentUserIdRef.current;
      setExpiredPostIds(prev => {
        const next = new Set<string>(
          posts
            .filter((p: any) => p.farmerId === uid && now > (p.bidEndTimestamp || 0))
            .map((p: any) => p.id)
        );
        // Only update state if the set actually changed
        if (next.size === prev.size && [...next].every(id => prev.has(id))) return prev;
        return next;
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []); // runs once — always reads latest data via refs

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');

  // Buyer profile modal
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);

  // Cancel order confirm modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPost, setCancelPost] = useState<any>(null);

  // Select buyer confirm modal
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [selectPost, setSelectPost] = useState<any>(null);
  const [selectBid, setSelectBid] = useState<any>(null);

  // Loading states
  const [actionLoading, setActionLoading] = useState(false);

  // Refs for back handler
  const showBuyerModalRef = useRef(showBuyerModal);
  const showCancelModalRef = useRef(showCancelModal);
  const showSelectModalRef = useRef(showSelectModal);
  useEffect(() => { showBuyerModalRef.current = showBuyerModal; }, [showBuyerModal]);
  useEffect(() => { showCancelModalRef.current = showCancelModal; }, [showCancelModal]);
  useEffect(() => { showSelectModalRef.current = showSelectModal; }, [showSelectModal]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (showBuyerModalRef.current) { setShowBuyerModal(false); return true; }
        if (showSelectModalRef.current) { setShowSelectModal(false); return true; }
        if (showCancelModalRef.current) { setShowCancelModal(false); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const showToast = (msg: string, color = '#2E7D32') => {
    setToastMsg(msg); setToastColor(color); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now7 = Date.now();
  const myBiddingPosts = cropPosts.filter(p => {
    if (p.farmerId !== currentUser?.id) return false;
    if (p.status === 'Active') return true;
    if ((p.status === 'Sold' || p.status === 'Expired') && (p as any).selectedBidderId) return true;
    if (p.status === 'Sold' && now7 - (p.bidEndTimestamp || 0) < SEVEN_DAYS_MS) return true;
    return false;
  });

  const getHighestBid = (post: any) => {
    const active = (post.bids || []).filter((b: any) => !b.cancelled);
    if (!active.length) return null;
    return active.reduce((mx: any, b: any) => b.amount > mx.amount ? b : mx, active[0]);
  };

  const getActiveBids = (post: any) =>
    (post.bids || []).filter((b: any) => !b.cancelled);

  const getBuyerUser = (bidderId: string) => users.find(u => u.id === bidderId);

  const auctionExpired = (post: any) => expiredPostIds.has(post.id);

  const handleCancelOrder = async () => {
    if (!cancelPost) return;
    setActionLoading(true);

    const currentSelectedId = (cancelPost as any).selectedBidderId;
    const prevOrderId = (cancelPost as any).orderId;

    try {
      // Read fresh bids from Firestore to avoid stale state
      const freshSnap = await db.collection('cropPosts').doc(cancelPost.id).get();
      const freshBids: any[] = (freshSnap.data()?.bids || cancelPost.bids || []);
      const highest = freshBids.filter((b: any) => !b.cancelled)
        .reduce((mx: any, b: any) => b.amount > (mx?.amount || 0) ? b : mx, null);
      const buyerToNotifyId = currentSelectedId || highest?.bidderId;

      const clearedBids = freshBids.map((b: any) => {
        const cleaned = { ...b };
        delete cleaned.wonTimestamp;
        cleaned.paymentConfirmed = false;
        return cleaned;
      });

      if (prevOrderId) {
        try {
          await db.collection('orders').doc(prevOrderId).update({
            status: 'Cancelled',
            cancelledBy: 'farmer_cancel',
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        } catch (orderErr) {
          console.warn('handleCancelOrder: could not cancel order doc (non-fatal):', orderErr);
        }
      }

      await updateCropPostInFirebase(cancelPost.id, {
        selectedBidderId: null as any,
        selectedBidderNotifiedAt: null as any,
        orderId: null as any,
        bids: clearedBids,
      } as any);

      if (buyerToNotifyId) {
        addNotification(buyerToNotifyId, {
          en: `\u274C The farmer has cancelled your order for "${cancelPost.cropTitle}". The farmer will now select another buyer.`,
          ur: `\u274C \u06A9\u0633\u0627\u0646 \u0646\u06D2 \u0622\u067E \u06A9\u0627 "${cancelPost.cropTitle}" \u06A9\u0627 \u0622\u0631\u0688\u0631 \u0645\u0646\u0633\u0648\u062E \u06A9\u0631\u062F\u06CC\u0627\u06D4 \u06A9\u0633\u0627\u0646 \u0627\u0628 \u062F\u0648\u0633\u0631\u0627 \u062E\u0631\u06CC\u062F\u0627\u0631 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06D2 \u06AF\u0627\u06D4`,
        });
      }

      showToast(
        isUrdu
          ? '\u0622\u0631\u0688\u0631 \u0645\u0646\u0633\u0648\u062E \u06C1\u0648\u06AF\u06CC\u0627\u06D4 \u0627\u0628 \u062F\u0648\u0633\u0631\u06D2 \u062E\u0631\u06CC\u062F\u0627\u0631 \u06A9\u0648 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA\u06D4'
          : 'Order cancelled. Now select another buyer.',
        '#E53935'
      );
    } catch (e) {
      console.warn('handleCancelOrder error:', e);
      showToast(isUrdu ? '\u062E\u0631\u0627\u0628\u06CC \u06C1\u0648\u0626\u06CC\u06D4 \u062F\u0648\u0628\u0627\u0631\u06C1 \u06A9\u0648\u0634\u0634 \u06A9\u0631\u06CC\u06BA\u06D4' : 'Error. Please try again.', '#E53935');
    }
    setActionLoading(false);
    setShowCancelModal(false);
  };

  const handleSelectBuyer = async () => {
    if (!selectPost || !selectBid) return;
    setActionLoading(true);
    const now = Date.now();
    try {
      // CRITICAL FIX: Always read the LATEST post data directly from Firestore
      // instead of using selectPost from React state. selectPost is captured
      // when the Select button is pressed and can be stale — e.g. if the farmer
      // previously cancelled Faizan's selection, handleCancelOrder wrote new bids
      // to Firestore, but selectPost still holds the old snapshot where Ali Ahmad's
      // bid might have cancelled:true. Using stale bids here would write
      // cancelled:true back for Ali Ahmad, making activeBids find zero bids for
      // him and the order never appearing on the buyer's screen.
      const freshPostSnap = await db.collection('cropPosts').doc(selectPost.id).get();
      if (!freshPostSnap.exists) {
        showToast(isUrdu ? 'پوسٹ نہیں ملی۔ دوبارہ کوشش کریں۔' : 'Post not found. Please try again.', '#E53935');
        setActionLoading(false);
        setShowSelectModal(false);
        return;
      }
      const freshPost = freshPostSnap.data() as any;
      const freshBids: any[] = freshPost.bids || [];

      // Build updatedBids from the FRESH bids from Firestore
      const updatedBids = freshBids.map((b: any) => {
        if (b.bidderId === selectBid.bidderId) {
          // Set wonTimestamp on selected buyer — clear cancelled flag if it was set
          return { ...b, cancelled: false, wonTimestamp: now, paymentConfirmed: false, penaltyApplied: false };
        }
        const cleaned = { ...b };
        delete cleaned.wonTimestamp;
        cleaned.paymentConfirmed = false;
        return cleaned;
      });

      // If the selected buyer had no bid in freshBids at all (edge case), add one
      const alreadyHasBid = freshBids.some((b: any) => b.bidderId === selectBid.bidderId);
      if (!alreadyHasBid) {
        updatedBids.push({
          id: selectBid.id || `${Date.now()}`,
          bidderId: selectBid.bidderId,
          bidderName: selectBid.bidderName || '',
          amount: selectBid.amount || 0,
          timestamp: selectBid.timestamp || now,
          cancelled: false,
          wonTimestamp: now,
          paymentConfirmed: false,
          penaltyApplied: false,
        });
      }

      const prevOrderId = (selectPost as any).orderId;
      const newOrderRef = db.collection('orders').doc();
      const newOrderId = newOrderRef.id;

      // Write selectedBidderId + orderId in ONE atomic call so the buyer's
      // order screen sees both fields in a single onSnapshot update.
      await updateCropPostInFirebase(selectPost.id, {
        selectedBidderId: selectBid.bidderId,
        selectedBidderNotifiedAt: now,
        status: 'Sold' as any,
        orderId: newOrderId,
        bids: updatedBids,
      } as any);

      if (prevOrderId) {
        try {
          await db.collection('orders').doc(prevOrderId).update({
            status: 'Cancelled',
            cancelledBy: 'farmer_reselect',
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        } catch (cancelErr) {
          console.warn('handleSelectBuyer: could not cancel prev order (non-fatal):', cancelErr);
        }
      }

      await newOrderRef.set({
        id: newOrderRef.id,
        postId: selectPost.id,
        cropTitle: selectPost.cropTitle || '',
        farmerId: selectPost.farmerId || currentUser?.id || '',
        farmerName: selectPost.farmerName || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
        buyerId: selectBid.bidderId,
        buyerName: selectBid.bidderName || '',
        bidAmount: Number(selectBid.amount || 0),
        status: 'PendingPayment',
        paymentConfirmed: false,
        viewedByFarmer: false,
        viewedByBuyer: false,
        viewedByAdmin: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
        createdAtMillis: now,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      addNotification(selectBid.bidderId, {
        en: `\u2705 The farmer has accepted your bid of PKR ${selectBid.amount.toLocaleString()} for "${selectPost.cropTitle}". Please go to Orders and make the payment within 24 hours.`,
        ur: `\u2705 \u06A9\u0633\u0627\u0646 \u0646\u06D2 "${selectPost.cropTitle}" \u06A9\u06D2 \u0644\u06CC\u06D2 \u0622\u067E \u06A9\u06CC PKR ${selectBid.amount.toLocaleString()} \u06A9\u06CC \u0628\u0648\u0644\u06CC \u0642\u0628\u0648\u0644 \u06A9\u0631\u0644\u06CC\u06D4 \u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u0622\u0631\u0688\u0631\u0632 \u0633\u06CC\u06A9\u0634\u0646 \u0645\u06CC\u06BA \u062C\u0627\u0626\u06CC\u06BA \u0627\u0648\u0631 24 \u06AF\u06BE\u0646\u0679\u0648\u06BA \u0645\u06CC\u06BA \u0627\u062F\u0627\u0626\u06CC\u06AF\u06CC \u06A9\u0631\u06CC\u06BA\u06D4`,
      });

      showToast(
        isUrdu
          ? `${selectBid.bidderName} \u06A9\u0648 \u0642\u0628\u0648\u0644 \u06A9\u0631\u0644\u06CC\u0627 \u06AF\u06CC\u0627\u06D4 \u0627\u0646\u06C1\u06CC\u06BA \u0627\u0637\u0644\u0627\u0639 \u0628\u06BE\u06CC\u062C \u062F\u06CC \u06AF\u0626\u06CC\u06D4`
          : `${selectBid.bidderName} selected. Notified to make payment.`,
        '#2E7D32'
      );
    } catch (e) {
      console.warn('handleSelectBuyer error:', e);
      showToast(isUrdu ? '\u062E\u0631\u0627\u0628\u06CC \u06C1\u0648\u0626\u06CC\u06D4 \u062F\u0648\u0628\u0627\u0631\u06C1 \u06A9\u0648\u0634\u0634 \u06A9\u0631\u06CC\u06BA\u06D4' : 'Error. Please try again.', '#E53935');
    }
    setActionLoading(false);
    setShowSelectModal(false);
  };

  const openBuyerProfile = (bidderId: string) => {
    const buyer = users.find(u => u.id === bidderId);
    if (buyer) { setSelectedBuyer(buyer); setShowBuyerModal(true); }
  };

  const handleMessageBuyer = (buyerId: string) => {
    navigation.navigate('FarmerMessages', { openChatWithUserId: buyerId });
  };

  const renderBidderRow = (bid: any, post: any, highest: any, isExpired: boolean) => {
    const buyer = getBuyerUser(bid.bidderId);
    const isHighestBidder = highest?.bidderId === bid.bidderId;
    const selectedBidderId = (post as any).selectedBidderId;
    const isSelected = selectedBidderId === bid.bidderId;
    const hasSelection = !!selectedBidderId;

    // Winner badge: highest bidder, auction ended, no manual selection yet
    const showWinnerBadge = isExpired && isHighestBidder && !hasSelection;

    // Cancel button: for currently selected buyer, or auto-winner (highest, no selection)
    const showCancelBtn = isExpired && (isSelected || (isHighestBidder && !hasSelection));

    // Select button: show for ANY non-selected buyer once auction has ended.
    // This allows the farmer to pick any lower bidder (e.g. Ali Ahmad) even when
    // Faizan is the auto-winner, or to switch after cancelling the current selection.
    const showSelectBtn = isExpired && !isSelected;

    return (
      <View
        key={bid.id}
        style={[
          styles.bidderRow,
          showWinnerBadge && styles.bidderRowWinner,
          isSelected && styles.bidderRowSelected,
        ]}>
        {buyer?.profilePic ? (
          <Image source={{ uri: buyer.profilePic }} style={styles.bidderAvatar} />
        ) : (
          <View style={styles.bidderAvatarPlaceholder}>
            <Text style={styles.bidderAvatarInit}>
              {buyer ? `${buyer.firstName[0]}${buyer.lastName[0]}` : '??'}
            </Text>
          </View>
        )}

        <View style={styles.bidderInfo}>
          <View style={styles.bidderNameRow}>
            <Text style={styles.bidderName} numberOfLines={1}>
              {buyer ? `${buyer.firstName} ${buyer.lastName}` : bid.bidderName}
            </Text>
            {showWinnerBadge && (
              <View style={styles.winnerBadge}>
                <Text style={styles.winnerBadgeText}>{'\uD83C\uDFC6'} {isUrdu ? '\u0641\u0627\u062A\u062D' : 'Winner'}</Text>
              </View>
            )}
            {isSelected && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>{'\u2705'} {isUrdu ? '\u0645\u0646\u062A\u062E\u0628' : 'Selected'}</Text>
              </View>
            )}
          </View>
          <Text style={styles.bidAmount}>PKR {bid.amount.toLocaleString()}</Text>
          <Text style={styles.bidTime}>
            {new Date(bid.timestamp).toLocaleDateString()} {new Date(bid.timestamp).toLocaleTimeString()}
          </Text>
        </View>

        <View style={styles.bidderActions}>
          <TouchableOpacity
            style={styles.viewProfileBtn}
            onPress={() => openBuyerProfile(bid.bidderId)}
            activeOpacity={0.8}>
            <Text style={styles.viewProfileBtnText}>{isUrdu ? '\uD83D\uDC64 \u067E\u0631\u0648\u0641\u0627\u0626\u0644' : '\uD83D\uDC64 Profile'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={() => handleMessageBuyer(bid.bidderId)}
            activeOpacity={0.8}>
            <Text style={styles.messageBtnText}>{isUrdu ? '\uD83D\uDCAC \u067E\u06CC\u063A\u0627\u0645' : '\uD83D\uDCAC Msg'}</Text>
          </TouchableOpacity>

          {showCancelBtn && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setCancelPost(post); setShowCancelModal(true); }}
              activeOpacity={0.85}>
              <Text style={styles.cancelBtnText}>{isUrdu ? '\u2715 \u0645\u0646\u0633\u0648\u062E' : '\u2715 Cancel'}</Text>
            </TouchableOpacity>
          )}

          {showSelectBtn && (
            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => { setSelectPost(post); setSelectBid(bid); setShowSelectModal(true); }}
              activeOpacity={0.85}>
              <Text style={styles.selectBtnText}>{isUrdu ? '\u2714 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA' : '\u2714 Select'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderPost = ({ item: post }: { item: any }) => {
    const activeBids = getActiveBids(post);
    const highest = getHighestBid(post);
    const expired = auctionExpired(post);
    const selectedBidderId = (post as any).selectedBidderId;

    const sortedBids = [...activeBids].sort((a: any, b: any) => {
      if (selectedBidderId) {
        if (a.bidderId === selectedBidderId) return -1;
        if (b.bidderId === selectedBidderId) return 1;
      } else if (expired && highest) {
        if (a.bidderId === highest.bidderId) return -1;
        if (b.bidderId === highest.bidderId) return 1;
      }
      return b.amount - a.amount;
    });

    return (
      <View style={styles.postCard}>
        {post.images?.[0] ? (
          <Image source={{ uri: post.images[0] }} style={styles.cropImage} resizeMode="cover" />
        ) : (
          <View style={styles.cropImagePlaceholder}><Text style={{ fontSize: 32 }}>🌾</Text></View>
        )}

        <View style={styles.postMeta}>
          <Text style={[styles.cropTitle, isUrdu && styles.rtlText]} numberOfLines={1}>{post.cropTitle}</Text>
          <Text style={styles.cropPrice}>
            {isUrdu ? '\u0628\u0646\u06CC\u0627\u062F\u06CC \u0642\u06CC\u0645\u062A:' : 'Base Price:'} PKR {parseFloat(post.basePrice).toLocaleString()}
          </Text>

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: expired ? '#FFEBEE' : '#E8F5E9' }]}>
              <Text style={[styles.statusText, { color: expired ? '#C62828' : '#2E7D32' }]}>
                {expired
                  ? (isUrdu ? '\u26D4 \u062E\u062A\u0645' : '\u26D4 Ended')
                  : (isUrdu ? '\uD83D\uDFE2 \u0641\u0639\u0627\u0644' : '\uD83D\uDFE2 Active')}
              </Text>
            </View>
            <CountdownBadge endTimestamp={post.bidEndTimestamp} />
          </View>

          {expired && selectedBidderId && (
            <View style={styles.selectionBanner}>
              <Text style={[styles.selectionBannerText, isUrdu && styles.rtlText]}>
                {isUrdu
                  ? '\u2705 \u062E\u0631\u06CC\u062F\u0627\u0631 \u0645\u0646\u062A\u062E\u0628 \u06C1\u0648\u06AF\u06CC\u0627\u06D4 \u0627\u062F\u0627\u0626\u06CC\u06AF\u06CC \u06A9\u0627 \u0627\u0646\u062A\u0638\u0627\u0631 \u06C1\u06D2\u06D4'
                  : '\u2705 Buyer selected. Awaiting payment confirmation.'}
              </Text>
            </View>
          )}

          {expired && !highest && (
            <View style={[styles.selectionBanner, { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }]}>
              <Text style={[styles.selectionBannerText, { color: '#E65100' }, isUrdu && styles.rtlText]}>
                {isUrdu ? '\u26A0\uFE0F \u06A9\u0648\u0626\u06CC \u0628\u0648\u0644\u06CC \u0646\u06C1\u06CC\u06BA \u0645\u0644\u06CC\u06D4' : '\u26A0\uFE0F No bids were placed.'}
              </Text>
            </View>
          )}
        </View>

        {activeBids.length === 0 ? (
          <View style={styles.noBidsRow}>
            <Text style={[styles.noBidsText, isUrdu && styles.rtlText]}>
              {isUrdu ? '\u0627\u0628\u06BE\u06CC \u06A9\u0648\u0626\u06CC \u0628\u0648\u0644\u06CC \u0646\u06C1\u06CC\u06BA \u06C1\u06D2\u06D4' : 'No bids yet.'}
            </Text>
          </View>
        ) : (
          <View style={styles.biddersSection}>
            <Text style={[styles.biddersSectionTitle, isUrdu && styles.rtlText]}>
              {isUrdu
                ? `\u0628\u0648\u0644\u06CC \u0644\u06AF\u0627\u0646\u06D2 \u0648\u0627\u0644\u06D2 (${activeBids.length})`
                : `Bidders (${activeBids.length})`}
            </Text>
            {sortedBids.map((bid: any) => renderBidderRow(bid, post, highest, expired))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FarmerHeader title={t('menuSeeAllBidding')} navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />

      {myBiddingPosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>
            {isUrdu ? '\u06A9\u0648\u0626\u06CC \u0628\u0648\u0644\u06CC \u0646\u06C1\u06CC\u06BA' : 'No Bidding Activity'}
          </Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>
            {isUrdu
              ? '\u062C\u0628 \u062E\u0631\u06CC\u062F\u0627\u0631 \u0622\u067E \u06A9\u06CC \u0641\u0635\u0644\u0648\u06BA \u067E\u0631 \u0628\u0648\u0644\u06CC \u0644\u06AF\u0627\u0626\u06CC\u06BA \u06AF\u06D2 \u062A\u0648 \u06CC\u06C1\u0627\u06BA \u0646\u0638\u0631 \u0622\u0626\u06CC\u06BA \u06AF\u06D2\u06D4'
              : 'When buyers bid on your crops, they will appear here in real time.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={myBiddingPosts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderPost}
          extraData={`${[...expiredPostIds].join(',')}_${myBiddingPosts.map(p => `${p.id}:${(p as any).selectedBidderId || ''}:${(p.bids || []).filter((b:any)=>!b.cancelled).length}`).join(',')}`}
        />
      )}

      {/* Buyer Profile Modal */}
      <Modal
        visible={showBuyerModal}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowBuyerModal(false)}>
        <View style={styles.profileModal}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => setShowBuyerModal(false)} activeOpacity={0.8} style={{ padding: 6 }}>
              <Text style={styles.profileModalBackText}>{isUrdu ? '\u2192 \u0648\u0627\u067E\u0633' : '\u2190 Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.profileModalTitle}>{isUrdu ? '\u062E\u0631\u06CC\u062F\u0627\u0631 \u06A9\u06CC \u067E\u0631\u0648\u0641\u0627\u0626\u0644' : 'Buyer Profile'}</Text>
            <View style={{ width: 60 }} />
          </View>
          {selectedBuyer && (
            <ScrollView contentContainerStyle={styles.profileModalContent} showsVerticalScrollIndicator={false}>
              {selectedBuyer.profilePic ? (
                <Image source={{ uri: selectedBuyer.profilePic }} style={styles.profileAvatar} />
              ) : (
                <View style={styles.profileAvatarPlaceholder}>
                  <Text style={styles.profileAvatarInit}>{selectedBuyer.firstName[0]}{selectedBuyer.lastName[0]}</Text>
                </View>
              )}
              <Text style={styles.profileName}>{selectedBuyer.firstName} {selectedBuyer.lastName}</Text>
              <View style={styles.profileRoleBadge}>
                <Text style={styles.profileRoleText}>{isUrdu ? '\uD83D\uDED2 \u062E\u0631\u06CC\u062F\u0627\u0631' : '\uD83D\uDED2 Buyer'}</Text>
              </View>
              {[
                { icon: '\uD83D\uDCF1', label: isUrdu ? '\u0641\u0648\u0646' : 'Phone', value: selectedBuyer.phone },
                { icon: '\uD83C\uDFD9\uFE0F', label: isUrdu ? '\u0634\u06C1\u0631' : 'City', value: selectedBuyer.city },
                { icon: '\uD83D\uDCCD', label: isUrdu ? '\u067E\u062A\u06C1' : 'Address', value: selectedBuyer.address },
              ].map(row => (
                <View key={row.label} style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoIcon}>{row.icon}</Text>
                  <View>
                    <Text style={styles.profileInfoLabel}>{row.label}</Text>
                    <Text style={[styles.profileInfoValue, isUrdu && styles.rtlText]}>{row.value || '—'}</Text>
                  </View>
                </View>
              ))}
              {(selectedBuyer.penalties || 0) > 0 && (
                <View style={styles.penaltyBadge}>
                  <Text style={styles.penaltyBadgeText}>
                    {isUrdu
                      ? `\u26A0\uFE0F \u062C\u0631\u0645\u0627\u0646\u06D2: ${selectedBuyer.penalties}/3`
                      : `\u26A0\uFE0F Penalties: ${selectedBuyer.penalties}/3`}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.messageBuyerBtn}
                onPress={() => { setShowBuyerModal(false); handleMessageBuyer(selectedBuyer.id); }}
                activeOpacity={0.85}>
                <Text style={styles.messageBuyerBtnText}>{isUrdu ? '\uD83D\uDCAC \u067E\u06CC\u063A\u0627\u0645 \u0628\u06BE\u06CC\u062C\u06CC\u06BA' : '\uD83D\uDCAC Send Message'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Cancel Order Confirm Modal */}
      <Modal visible={showCancelModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>⚠️</Text>
            <Text style={styles.confirmTitle}>{isUrdu ? '\u0622\u0631\u0688\u0631 \u0645\u0646\u0633\u0648\u062E \u06A9\u0631\u06CC\u06BA\u061F' : 'Cancel Order?'}</Text>
            <Text style={[styles.confirmMsg, isUrdu && styles.rtlText]}>
              {isUrdu
                ? '\u06A9\u06CC\u0627 \u0622\u067E \u0648\u0627\u0642\u0639\u06CC \u0627\u0633 \u062E\u0631\u06CC\u062F\u0627\u0631 \u06A9\u0627 \u0622\u0631\u0688\u0631 \u0645\u0646\u0633\u0648\u062E \u06A9\u0631\u0646\u0627 \u0686\u0627\u06C1\u062A\u06D2 \u06C1\u06CC\u06BA\u061F \u0622\u067E \u06A9\u0648 \u062F\u0648\u0633\u0631\u06D2 \u062E\u0631\u06CC\u062F\u0627\u0631 \u06A9\u0648 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u0646\u0627 \u06C1\u0648\u06AF\u0627\u06D4'
                : "Are you sure you want to cancel this buyer's order? You will need to select another buyer."}
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowCancelModal(false)} activeOpacity={0.8}>
                <Text style={styles.keepBtnText}>{isUrdu ? '\u0648\u0627\u067E\u0633' : 'Back'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={handleCancelOrder}
                disabled={actionLoading}
                activeOpacity={0.85}>
                {actionLoading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.confirmCancelBtnText}>{isUrdu ? '\u06C1\u0627\u06BA\u060C \u0645\u0646\u0633\u0648\u062E \u06A9\u0631\u06CC\u06BA' : 'Yes, Cancel'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Select Buyer Confirm Modal */}
      <Modal visible={showSelectModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSelectModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>✅</Text>
            <Text style={styles.confirmTitle}>{isUrdu ? '\u062E\u0631\u06CC\u062F\u0627\u0631 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA\u061F' : 'Select This Buyer?'}</Text>
            {selectBid && (
              <Text style={[styles.confirmMsg, isUrdu && styles.rtlText]}>
                {isUrdu
                  ? `\u06A9\u06CC\u0627 \u0622\u067E ${selectBid.bidderName} \u06A9\u0648 PKR ${selectBid.amount.toLocaleString()} \u06A9\u06CC \u0628\u0648\u0644\u06CC \u067E\u0631 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u0646\u0627 \u0686\u0627\u06C1\u062A\u06D2 \u06C1\u06CC\u06BA\u061F \u0627\u0646\u06C1\u06CC\u06BA \u0627\u062F\u0627\u0626\u06CC\u06AF\u06CC \u06A9\u0631\u0646\u06D2 \u06A9\u06CC \u0627\u0637\u0644\u0627\u0639 \u062F\u06CC \u062C\u0627\u0626\u06D2 \u06AF\u06CC\u06D4`
                  : `Select ${selectBid.bidderName} with bid of PKR ${selectBid.amount.toLocaleString()}? They will be notified to make the payment.`}
              </Text>
            )}
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.keepBtn} onPress={() => setShowSelectModal(false)} activeOpacity={0.8}>
                <Text style={styles.keepBtnText}>{isUrdu ? '\u0645\u0646\u0633\u0648\u062E \u06A9\u0631\u06CC\u06BA' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmSelectBtn}
                onPress={handleSelectBuyer}
                disabled={actionLoading}
                activeOpacity={0.85}>
                {actionLoading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.confirmSelectBtnText}>{isUrdu ? '\u06C1\u0627\u06BA\u060C \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA' : 'Yes, Select'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  toast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80,
    left: 20, right: 20, zIndex: 999, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  listContent: { padding: 14, paddingBottom: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  postCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.09, shadowRadius: 14, elevation: 6,
  },
  cropImage: { width: '100%', height: 180 },
  cropImagePlaceholder: { width: '100%', height: 180, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center' },
  postMeta: { padding: 14, paddingBottom: 8 },
  cropTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  cropPrice: { fontSize: 14, color: '#2E7D32', fontWeight: '700', marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  countdownBadge: { backgroundColor: '#E3F2FD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  countdownText: { fontSize: 12, fontWeight: '800', color: '#1565C0' },
  selectionBanner: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10,
    borderWidth: 1.5, borderColor: '#A5D6A7', marginBottom: 4,
  },
  selectionBannerText: { fontSize: 13, fontWeight: '700', color: '#2E7D32', textAlign: 'center' },
  noBidsRow: { padding: 14, alignItems: 'center' },
  noBidsText: { fontSize: 14, color: '#9E9E9E', fontWeight: '500' },
  biddersSection: { paddingHorizontal: 14, paddingBottom: 14 },
  biddersSectionTitle: { fontSize: 15, fontWeight: '800', color: '#333333', marginBottom: 10 },
  bidderRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#F9F9F9', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#F0F0F0',
  },
  bidderRowWinner: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  bidderRowSelected: { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' },
  bidderAvatar: { width: 44, height: 44, borderRadius: 22 },
  bidderAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center' },
  bidderAvatarInit: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  bidderInfo: { flex: 1 },
  bidderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  bidderName: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', flexShrink: 1 },
  winnerBadge: { backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  winnerBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  selectedBadge: { backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  selectedBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  bidAmount: { fontSize: 15, fontWeight: '800', color: '#2E7D32', marginBottom: 2 },
  bidTime: { fontSize: 11, color: '#9E9E9E' },
  bidderActions: { alignItems: 'flex-end', gap: 6 },
  viewProfileBtn: { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#A5D6A7' },
  viewProfileBtnText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  messageBtn: { backgroundColor: '#E3F2FD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#90CAF9' },
  messageBtnText: { fontSize: 11, fontWeight: '700', color: '#1565C0' },
  cancelBtn: { backgroundColor: '#FFEBEE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#EF9A9A' },
  cancelBtnText: { fontSize: 11, fontWeight: '800', color: '#C62828' },
  selectBtn: { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#A5D6A7' },
  selectBtnText: { fontSize: 11, fontWeight: '800', color: '#2E7D32' },
  profileModal: { flex: 1, backgroundColor: '#FFFFFF' },
  profileModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 48,
    paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  profileModalBackText: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  profileModalTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  profileModalContent: { alignItems: 'center', padding: 24, paddingBottom: 60 },
  profileAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32', marginBottom: 12 },
  profileAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  profileAvatarInit: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  profileRoleBadge: { backgroundColor: '#E3F2FD', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 16 },
  profileRoleText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },
  profileInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#F9F9F9', borderRadius: 14, padding: 14, marginBottom: 10, width: '100%' },
  profileInfoIcon: { fontSize: 20 },
  profileInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 2 },
  profileInfoValue: { fontSize: 14, fontWeight: '700', color: '#1B1B1B' },
  penaltyBadge: { backgroundColor: '#FFF3E0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#FFCC80', marginBottom: 10 },
  penaltyBadgeText: { fontSize: 13, fontWeight: '700', color: '#E65100' },
  messageBuyerBtn: { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 16, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  messageBuyerBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  confirmCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
  confirmEmoji: { fontSize: 48, marginBottom: 12 },
  confirmTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  confirmMsg: { fontSize: 14, color: '#555555', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  keepBtn: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0' },
  keepBtnText: { fontSize: 15, fontWeight: '700', color: '#555555' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  confirmSelectBtn: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  confirmSelectBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});

export default FarmerSeeAllBiddingScreen;
