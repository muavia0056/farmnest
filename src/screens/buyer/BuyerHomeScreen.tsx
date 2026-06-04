import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Modal, TextInput, Animated, ScrollView, Dimensions, Platform,
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, BackHandler,
  ToastAndroid, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import BuyerHeader from '../../components/BuyerHeader';
import AccountPendingModal from '../../components/AccountPendingModal';
import ImageViewer from '../../components/ImageViewer';
import { updateCropPostInFirebase, placeBidOnCropPostInFirebase, cancelBidOnCropPostInFirebase } from '../../services/firebaseCropService';
import {
  createReviewInFirebase,
  updateReviewInFirebase,
  deleteReviewInFirebase,
} from '../../services/firebaseReviewService';

const { width } = Dimensions.get('window');

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

const ImageGallery = ({ images, onImagePress }: { images: string[]; onImagePress?: (idx: number) => void }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  if (!images.length) return (
    <View style={styles.galleryPlaceholder}><Text style={{ fontSize: 40 }}>🌾</Text></View>
  );
  return (
    <View>
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / (width - 32)))}
        style={styles.galleryScroll}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.92} onPress={() => onImagePress?.(i)}>
            <Image source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.galleryIndicatorRow}>
          <Text style={styles.galleryIndicatorText}>{activeIdx + 1}/{images.length}</Text>
        </View>
      )}
    </View>
  );
};

const CountdownBadge = ({ endTimestamp }: { endTimestamp: number }) => {
  const { d, h, m, s, expired } = useCountdown(endTimestamp);
  const { isUrdu } = useLanguage();
  if (expired) return (
    <View style={[styles.countdownBadge, { backgroundColor: '#FFEBEE' }]}>
      <Text style={[styles.countdownText, { color: '#C62828' }]}>{isUrdu ? '⛔ بولی ختم ہوگئی' : '⛔ Bidding Ended'}</Text>
    </View>
  );
  return (
    <View style={styles.countdownBadge}>
      <Text style={styles.countdownText}>⏱ {d}d {h}h {m}m {s}s</Text>
    </View>
  );
};

const StarRating = ({ rating, onRate, size = 24 }: { rating: number; onRate?: (r: number) => void; size?: number }) => (
  <View style={{ flexDirection: 'row', gap: 4 }}>
    {[1, 2, 3, 4, 5].map(star => (
      <TouchableOpacity key={star} onPress={() => onRate?.(star)} disabled={!onRate} activeOpacity={0.7}>
        <Text style={{ fontSize: size, color: star <= rating ? '#F9A825' : '#E0E0E0' }}>★</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const BuyerHomeScreen = ({ navigation }: any) => {
  const { currentUser, cropPosts, users, setUsers, addNotification } = useApp();
  const { t, isUrdu } = useLanguage();
  const isPending = currentUser?.accountStatus !== 'Approved';

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastColor, setToastColor] = useState('#2E7D32');
  const [searchText, setSearchText] = useState('');
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [showFarmerModal, setShowFarmerModal] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState<any>(null);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewDetail, setReviewDetail] = useState('');
  const [reviewErrors, setReviewErrors] = useState<any>({});
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBidPost, setCancelBidPost] = useState<any>(null);
  const [hasShownPending, setHasShownPending] = useState(false);
  const [farmerModalOpenCount, setFarmerModalOpenCount] = useState(0);

  const [showReviewManageModal, setShowReviewManageModal] = useState(false);
  const [showUpdateReviewForm, setShowUpdateReviewForm] = useState(false);
  const [updateRatingValue, setUpdateRatingValue] = useState(0);
  const [updateReviewTitle, setUpdateReviewTitle] = useState('');
  const [updateReviewDetail, setUpdateReviewDetail] = useState('');
  const [updateReviewErrors, setUpdateReviewErrors] = useState<any>({});

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [refreshing, setRefreshing] = useState(false);

  const [expandedPosts, setExpandedPosts] = useState<{ [id: string]: boolean }>({});
  const toggleExpanded = (id: string) => setExpandedPosts(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (isPending && !hasShownPending) { setShowPendingModal(true); setHasShownPending(true); }
  }, []);

  const showReviewManageModalRef = useRef(showReviewManageModal);
  const showFarmerModalRef       = useRef(showFarmerModal);
  const showBidModalRef          = useRef(showBidModal);
  const showCancelModalRef       = useRef(showCancelModal);
  const viewerVisibleRef         = useRef(viewerVisible);
  useEffect(() => { showReviewManageModalRef.current = showReviewManageModal; }, [showReviewManageModal]);
  useEffect(() => { showFarmerModalRef.current       = showFarmerModal;       }, [showFarmerModal]);
  useEffect(() => { showBidModalRef.current          = showBidModal;          }, [showBidModal]);
  useEffect(() => { showCancelModalRef.current       = showCancelModal;       }, [showCancelModal]);
  useEffect(() => { viewerVisibleRef.current         = viewerVisible;         }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current)         { setViewerVisible(false);                                    return true; }
        if (showReviewManageModalRef.current) { setShowReviewManageModal(false);                            return true; }
        if (showFarmerModalRef.current)       { setShowFarmerModal(false); setShowRatingForm(false);        return true; }
        if (showBidModalRef.current)          { setShowBidModal(false);                                    return true; }
        if (showCancelModalRef.current)       { setShowCancelModal(false);                                  return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  const showToast = (msg: string, color = '#2E7D32') => {
    setToastMsg(msg); setToastColor(color); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const activePosts = (() => {
    const now = Date.now();
    const filtered = cropPosts.filter(p =>
      p.status === 'Active' && p.farmerId !== currentUser?.id &&
      (searchText === '' || p.cropTitle.toLowerCase().includes(searchText.toLowerCase()) || p.city.toLowerCase().includes(searchText.toLowerCase()))
    );
    const active = filtered.filter(p => now <= (p.bidEndTimestamp || 0));
    const expired = filtered.filter(p => now > (p.bidEndTimestamp || 0));
    return [...active, ...expired];
  })();

  const openBidModal = (post: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    setSelectedPost(post); setBidAmount(''); setBidError(''); setShowBidModal(true);
  };

  const getMyBidOnPost = (post: any) => post?.bids?.find((b: any) => b.bidderId === currentUser?.id && !b.cancelled);

  const getHighestBid = (post: any) => {
    if (!post) return null;
    const active = post.bids?.filter((b: any) => !b.cancelled) || [];
    if (!active.length) return null;
    return active.reduce((max: any, b: any) => b.amount > max.amount ? b : max, active[0]);
  };

  const handlePlaceBid = () => {
    if (!currentUser) { Alert.alert('Error', 'You must be logged in to bid.'); return; }
    const amount = parseFloat(bidAmount);
    if (!bidAmount.trim()) { setBidError('Please enter bid amount.'); return; }
    if (isNaN(amount)) { setBidError('Enter a valid number.'); return; }
    const basePrice = parseFloat(selectedPost.basePrice);
    if (amount < basePrice) { setBidError(`Bid must be at least PKR ${basePrice.toLocaleString()}.`); return; }
    if (amount === basePrice) { setBidError(isUrdu ? `براہ کرم بنیادی قیمت PKR ${basePrice.toLocaleString()} سے زیادہ رقم درج کریں۔` : `Please enter an amount greater than the base price of PKR ${basePrice.toLocaleString()}.`); return; }
    const highest = getHighestBid(selectedPost);
    if (highest && amount <= highest.amount) { setBidError(`Bid must be higher than PKR ${highest.amount.toLocaleString()}.`); return; }
    const myExisting = getMyBidOnPost(selectedPost);
    if (myExisting && amount <= myExisting.amount) { setBidError('New bid must be higher than your current bid.'); return; }

    setBidLoading(true);
    placeBidOnCropPostInFirebase(selectedPost.id, {
      bidderId: currentUser.id,
      bidderName: `${currentUser.firstName} ${currentUser.lastName}`,
      amount,
    })
      .then(() => {
        addNotification(selectedPost.farmerId, {
          en: `💬 ${currentUser.firstName} ${currentUser.lastName} placed a bid of PKR ${amount.toLocaleString()} on your crop "${selectedPost.cropTitle}"`,
          ur: `💬 ${currentUser.firstName} ${currentUser.lastName} نے آپ کی فصل "${selectedPost.cropTitle}" پر PKR ${amount.toLocaleString()} کی بولی لگائی`,
        });
        setBidLoading(false);
        setShowBidModal(false);
        showToast(isUrdu ? `✅ PKR ${amount.toLocaleString()} کی بولی لگائی گئی!` : `✅ Bid of PKR ${amount.toLocaleString()} placed!`);
      })
      .catch((e: any) => {
        setBidLoading(false);
        const msg = e?.message;
        if (msg === 'BIDDING_CLOSED') {
          Alert.alert('Bidding Closed', 'The auction has ended. You can no longer place bids.');
        } else if (msg === 'BID_TOO_LOW') {
          setBidError(`Bid must be at least PKR ${basePrice.toLocaleString()}.`);
        } else if (msg === 'BID_NOT_HIGHEST') {
          setBidError('Your bid must be higher than the current highest bid.');
        } else if (msg === 'POST_NOT_ACTIVE') {
          Alert.alert('Post Unavailable', 'This crop post is no longer active.');
        } else {
          Alert.alert('Bid Failed', 'Could not place bid. Please try again.');
        }
        console.warn('handlePlaceBid error:', e);
      });
  };

  const openCancelBid = (post: any) => {
    if (isPending) { setShowPendingModal(true); return; }
    setCancelBidPost(post); setShowCancelModal(true);
  };

  const handleCancelBid = () => {
    if (!currentUser) return;
    setShowCancelModal(false);
    cancelBidOnCropPostInFirebase(cancelBidPost.id, currentUser.id)
      .then(() => {
        addNotification(cancelBidPost.farmerId, {
          en: `❌ ${currentUser.firstName} ${currentUser.lastName} cancelled their bid on "${cancelBidPost.cropTitle}"`,
          ur: `❌ ${currentUser.firstName} ${currentUser.lastName} نے "${cancelBidPost.cropTitle}" پر اپنی بولی منسوخ کردی`,
        });
        showToast(t('bidCancelled'), '#E53935');
      })
      .catch((e: any) => {
        Alert.alert('Cancel Failed', 'Could not cancel bid. Please try again.');
        console.warn('handleCancelBid error:', e);
      });
  };

  const openFarmerProfile = (farmerId: string) => {
    const farmer = users.find((u: any) => u.id === farmerId);
    if (farmer) { setSelectedFarmer(farmer); setShowRatingForm(false); setFarmerModalOpenCount(c => c + 1); setShowFarmerModal(true); }
  };

  useEffect(() => {
    if (showFarmerModal && selectedFarmer) {
      const fresh = users.find((u: any) => u.id === selectedFarmer.id);
      if (fresh) setSelectedFarmer(fresh);
    }
  }, [users, showFarmerModal]);

  const getMyReviewOnFarmer = (farmer: any) => {
    return (farmer?.reviews || []).find((r: any) => r.reviewerId === currentUser?.id);
  };

  const openReviewManageModal = () => {
    const myReview = getMyReviewOnFarmer(selectedFarmer);
    if (!myReview) return;
    setUpdateRatingValue(myReview.rating);
    setUpdateReviewTitle(myReview.title);
    setUpdateReviewDetail(myReview.detail);
    setUpdateReviewErrors({});
    setShowUpdateReviewForm(false);
    setShowReviewManageModal(true);
  };

  const handleSubmitReview = async () => {
    const errs: any = {};
    if (ratingValue === 0) errs.rating = 'Please select a rating.';
    if (!reviewTitle.trim()) errs.title = 'Title is required.';
    if (!reviewDetail.trim()) errs.detail = 'Detail is required.';
    setReviewErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await createReviewInFirebase({
        farmerId: selectedFarmer.id,
        farmerName: `${selectedFarmer.firstName} ${selectedFarmer.lastName}`,
        reviewerId: currentUser!.id,
        reviewerName: `${currentUser!.firstName} ${currentUser!.lastName}`,
        reviewerRole: 'Buyer',
        rating: ratingValue,
        title: reviewTitle.trim(),
        detail: reviewDetail.trim(),
      });
      setShowRatingForm(false);
      setRatingValue(0); setReviewTitle(''); setReviewDetail(''); setReviewErrors({});
      showToast(isUrdu ? 'جائزہ جمع ہوگیا! ⭐' : 'Review submitted! ⭐');
    } catch (error: any) {
      console.warn('handleSubmitReview Firebase error:', error);
      Alert.alert('Error', 'Could not submit review. Please try again.');
    }
  };

  const handleUpdateReview = async () => {
    const errs: any = {};
    if (updateRatingValue === 0) errs.rating = 'Please select a rating.';
    if (!updateReviewTitle.trim()) errs.title = 'Title is required.';
    if (!updateReviewDetail.trim()) errs.detail = 'Detail is required.';
    setUpdateReviewErrors(errs);
    if (Object.keys(errs).length) return;
    const myReview = getMyReviewOnFarmer(selectedFarmer);
    try {
      if (myReview?.id) {
        await updateReviewInFirebase(myReview.id, selectedFarmer.id, currentUser!.id, {
          rating: updateRatingValue,
          title: updateReviewTitle.trim(),
          detail: updateReviewDetail.trim(),
        });
      }
      setShowReviewManageModal(false);
      showToast(isUrdu ? 'جائزہ اپڈیٹ ہوگیا! ⭐' : 'Review updated! ⭐');
    } catch (error: any) {
      console.warn('handleUpdateReview Firebase error:', error);
      Alert.alert('Error', 'Could not update review. Please try again.');
    }
  };

  const handleDeleteReview = () => {
    const myReview = getMyReviewOnFarmer(selectedFarmer);
    Alert.alert(
      isUrdu ? 'جائزہ حذف کریں' : 'Delete Review',
      isUrdu ? 'کیا آپ واقعی اپنا جائزہ حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete your review?',
      [
        { text: isUrdu ? 'منسوخ کریں' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'حذف کریں' : 'Delete', style: 'destructive', onPress: async () => {
            try {
              if (myReview?.id) { await deleteReviewInFirebase(myReview.id, selectedFarmer.id, currentUser!.id); }
              setShowReviewManageModal(false);
              showToast(isUrdu ? 'جائزہ حذف ہوگیا۔' : 'Review deleted.', '#E53935');
            } catch (error: any) {
              console.warn('handleDeleteReview Firebase error:', error);
              Alert.alert('Error', 'Could not delete review. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleMessageFarmer = (farmerId: string) => {
    navigation.navigate('BuyerMessages', { openChatWithUserId: farmerId });
  };

  // Stamp wonTimestamp on the winning bid once the auction expires.
  // wonTimestampWrittenRef: prevents writing more than once per post per session,
  // avoiding the write→snapshot→effect→write loop that caused badge flickering.
  // IMPORTANT: When wonTimestamp is cleared (farmer cancelled an order),
  // we remove post.id from the ref so the next cycle can re-stamp it.
  // Without this, the buyer's order screen would show nothing after a cancel.
  const wonTimestampWrittenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const now = Date.now();
    cropPosts.forEach(post => {
      const expired = now > (post.bidEndTimestamp || 0);
      const activeBids = post.bids?.filter((b: any) => !b.cancelled) || [];
      if (!activeBids.length) return;
      const highest = activeBids.reduce((mx: any, b: any) => b.amount > mx.amount ? b : mx, activeBids[0]);
      if (!highest) return;

      // ── LIVE AUCTION CLEANUP ───────────────────────────────────────────────
      // Wipe any stale selectedBidderId written mid-auction by old buggy code.
      // Only applies to LIVE auctions — never touch expired auctions here.
      if (!expired) {
        const hasStaleSelection = !!(post as any).selectedBidderId;
        const hasStaleWonTimestamp = activeBids.some((b: any) => b.wonTimestamp);
        if (hasStaleSelection || hasStaleWonTimestamp) {
          const cleanedBids = (post.bids || []).map((b: any) => { const c = { ...b }; delete c.wonTimestamp; return c; });
          updateCropPostInFirebase(post.id, {
            selectedBidderId: null as any,
            selectedBidderNotifiedAt: null as any,
            bids: cleanedBids,
          } as any).catch(e => console.warn('Stale cleanup failed:', e));
        }
        return;
      }

      // ── POST-AUCTION: stamp wonTimestamp on winner ─────────────────────────
      const hasManualSelection = !!(post as any).selectedBidderId;

      // KEY FIX: If wonTimestamp was cleared (e.g. farmer cancelled an order),
      // remove from ref so this cycle can re-stamp it for the buyer to see.
      if (!highest.wonTimestamp && wonTimestampWrittenRef.current.has(post.id)) {
        wonTimestampWrittenRef.current.delete(post.id);
      }

      if (!hasManualSelection && !highest.wonTimestamp && !wonTimestampWrittenRef.current.has(post.id)) {
        wonTimestampWrittenRef.current.add(post.id);
        const updatedBids = post.bids?.map((b: any) =>
          b.id === highest.id ? { ...b, wonTimestamp: now } : b
        ) || [];
        updateCropPostInFirebase(post.id, { bids: updatedBids }).catch(e => {
          wonTimestampWrittenRef.current.delete(post.id);
          console.warn('wonTimestamp update failed:', e);
        });
      }

      // Send notifications exactly once per auction cycle
      if (!post.auctionNotified) {
        updateCropPostInFirebase(post.id, { auctionNotified: true }).catch(e =>
          console.warn('auctionNotified update failed:', e),
        );
        addNotification(highest.bidderId, {
          en: `🏆 Congratulations! You won the auction for "${post.cropTitle}" with a bid of PKR ${highest.amount.toLocaleString()}. Please go to Orders and confirm your payment within 24 hours.`,
          ur: `🏆 مبارک ہو! آپ نے "${post.cropTitle}" کی نیلامی PKR ${highest.amount.toLocaleString()} کی بولی کے ساتھ جیت لی۔ براہ کرم آرڈرز میں جائیں اور 24 گھنٹوں میں ادائیگی کی تصدیق کریں۔`,
        });
        const loserIds = new Set<string>(
          activeBids.filter((b: any) => b.bidderId !== highest.bidderId).map((b: any) => b.bidderId as string)
        );
        loserIds.forEach((loserId: string) => {
          addNotification(loserId, {
            en: `❌ The auction for "${post.cropTitle}" has ended. Unfortunately, you did not win this time. Better luck next time!`,
            ur: `❌ "${post.cropTitle}" کی نیلامی ختم ہوگئی۔ افسوس، اس بار آپ نہیں جیت سکے۔ اگلی بار قسمت آزمائیں!`,
          });
        });
      }
    });
  }, [cropPosts.map(p => `${p.id}:${p.bidEndTimestamp}:${(p.bids || []).filter((b:any)=>!b.cancelled).length}:${(p as any).selectedBidderId || ''}`).join(',')]);

  const renderPost = ({ item }: { item: any }) => {
    const myBid = getMyBidOnPost(item);
    const highest = getHighestBid(item);
    const isMyHighest = highest?.bidderId === currentUser?.id;
    const farmer = users.find(u => u.id === item.farmerId);
    const expired = Date.now() > item.bidEndTimestamp;

    return (
      <View style={styles.postCard}>
        <ImageGallery images={item.images} onImagePress={(idx) => openImageViewer(item.images, idx)} />
        <View style={styles.postHeader}>
          <View style={styles.postHeaderLeft}>
            <Text style={[styles.postTitle, isUrdu && styles.rtlText]}>{item.cropTitle}</Text>
            <Text style={styles.postCity}>📍 {item.city}</Text>
          </View>
          <View style={styles.postHeaderRight}>
            <Text style={styles.postBasePrice}>{t('basePriceLabel')}</Text>
            <Text style={styles.postBasePriceVal}>PKR {parseFloat(item.basePrice).toLocaleString()}</Text>
          </View>
        </View>
        {(() => {
          const isExpanded = !!expandedPosts[item.id];
          const desc = item.description || '';
          const PREVIEW_CHARS = 120;
          const isLong = desc.length > PREVIEW_CHARS;
          return (
            <View style={{ paddingHorizontal: 14, marginBottom: 10 }}>
              <Text style={[styles.postDesc, isUrdu && styles.rtlText]}>
                {isExpanded || !isLong ? desc : desc.slice(0, PREVIEW_CHARS).trimEnd() + '...'}
              </Text>
              {isLong && (
                <TouchableOpacity onPress={() => toggleExpanded(item.id)} activeOpacity={0.7}>
                  <Text style={styles.seeMoreText}>{isExpanded ? (isUrdu ? 'کم دیکھیں' : 'See less') : (isUrdu ? 'مزید دیکھیں' : 'See more')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
        <CountdownBadge endTimestamp={item.bidEndTimestamp} />
        <View style={styles.bidInfoRow}>
          <View style={styles.bidInfoItem}>
            <Text style={styles.bidInfoLabel}>{t('totalBids')}</Text>
            <Text style={styles.bidInfoValue}>{item.bids?.filter((b: any) => !b.cancelled).length || 0}</Text>
          </View>
          {highest && (
            <View style={styles.bidInfoItem}>
              <Text style={styles.bidInfoLabel}>{t('highestBid')}</Text>
              <Text style={[styles.bidInfoValue, { color: isMyHighest ? '#2E7D32' : '#1565C0' }]}>
                PKR {highest.amount.toLocaleString()}{isMyHighest ? ` (${t('yourBid')})` : ''}
              </Text>
            </View>
          )}
          {myBid && (
            <View style={styles.bidInfoItem}>
              <Text style={styles.bidInfoLabel}>{t('yourBid')}</Text>
              <Text style={styles.bidInfoValue}>PKR {myBid.amount.toLocaleString()}</Text>
            </View>
          )}
        </View>
        {item.liveLocation && (
          <TouchableOpacity style={styles.liveLocationBtn}
            onPress={() => { const { latitude, longitude } = item.liveLocation!; Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`).catch(() => Alert.alert('Error', 'Could not open Google Maps.')); }}
            activeOpacity={0.85}>
            <Text style={styles.liveLocationBtnText}>{t('seeFarmerLocation')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.farmerRow} onPress={() => openFarmerProfile(item.farmerId)} activeOpacity={0.8}>
          {farmer?.profilePic ? (
            <Image source={{ uri: farmer.profilePic }} style={styles.farmerAvatar} />
          ) : (
            <View style={styles.farmerAvatarPlaceholder}>
              <Text style={styles.farmerAvatarInit}>{farmer?.firstName[0]}{farmer?.lastName[0]}</Text>
            </View>
          )}
          <View style={styles.farmerInfo}>
            <Text style={styles.farmerName}>{farmer?.firstName} {farmer?.lastName}</Text>
            <Text style={styles.farmerLocation}>📍 {farmer?.city}</Text>
          </View>
          <View style={styles.farmerStarsRow}>
            {[1,2,3,4,5].map(s => (
              <Text key={s} style={{ fontSize: 12, color: s <= Math.round(farmer?.reviews?.reduce((a:number,r:any)=>a+r.rating,0)/(farmer?.reviews?.length||1)||0) ? '#F9A825' : '#E0E0E0' }}>★</Text>
            ))}
          </View>
          <Text style={styles.viewProfileLink}>{t('viewProfile')} ›</Text>
        </TouchableOpacity>
        <View style={styles.actionsContainer}>
          {!expired && (
            <View style={styles.actionRow}>
              {myBid ? (
                <>
                  <TouchableOpacity style={styles.updateBidBtn} onPress={() => openBidModal(item)} activeOpacity={0.85}>
                    <Text style={styles.updateBidBtnText}>{t('updateBid')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBidBtn} onPress={() => openCancelBid(item)} activeOpacity={0.85}>
                    <Text style={styles.cancelBidBtnText}>✕ {t('cancelBid')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.placeBidBtn} onPress={() => openBidModal(item)} activeOpacity={0.85}>
                    <Text style={styles.placeBidBtnText}>🏷️ {t('placeBid')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.messageFarmerBtn} onPress={() => handleMessageFarmer(item.farmerId)} activeOpacity={0.85}>
                    <Text style={styles.messageFarmerBtnText}>{isUrdu ? '💬 پیغام' : '💬 Message'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          {(expired || myBid) && (
            <TouchableOpacity style={styles.messageAloneBtn} onPress={() => handleMessageFarmer(item.farmerId)} activeOpacity={0.85}>
              <Text style={styles.messageFarmerBtnText}>{isUrdu ? '💬 کسان کو پیغام کریں' : '💬 Message Farmer'}</Text>
            </TouchableOpacity>
          )}
          {expired && myBid && isMyHighest && (
            <View style={styles.winnerBanner}>
              <Text style={[styles.winnerBannerText, isUrdu && styles.rtlText]}>{t('youWon')}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <BuyerHeader title={t('buyerHome')} navigation={navigation} />
      <Toast message={toastMsg} visible={toastVisible} color={toastColor} />
      <AccountPendingModal visible={showPendingModal} onClose={() => setShowPendingModal(false)} role="Buyer" />
      <ImageViewer visible={viewerVisible} images={viewerImages} initialIndex={viewerIndex} onClose={() => setViewerVisible(false)} />

      {isPending && (
        <TouchableOpacity style={styles.lockedBanner} onPress={() => setShowPendingModal(true)} activeOpacity={0.85}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={[styles.lockedText, isUrdu && styles.rtlText]}>{t('accountPending')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={[styles.searchInput, isUrdu && styles.rtlInput]} placeholder={t('searchCropsCity')} placeholderTextColor="#9E9E9E" value={searchText} onChangeText={setSearchText} textAlign={isUrdu ? 'right' : 'left'} />
        {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.7}><Text style={styles.searchClear}>✕</Text></TouchableOpacity>}
      </View>

      <View style={styles.refreshBarRow}>
        <TouchableOpacity style={styles.refreshBarBtn} onPress={onRefresh} activeOpacity={0.75}>
          <Text style={styles.refreshBarBtnText}>↻ {isUrdu ? 'تازہ کریں' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {activePosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌾</Text>
          <Text style={[styles.emptyTitle, isUrdu && styles.rtlText]}>{searchText ? t('noResultsFound') : t('noCropsYet')}</Text>
          <Text style={[styles.emptySubtitle, isUrdu && styles.rtlText]}>{searchText ? `${t('noResultsFound')}: "${searchText}"` : t('checkBackLater')}</Text>
        </View>
      ) : (
        <FlatList
          data={activePosts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderPost}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {/* BID MODAL */}
      <Modal visible={showBidModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowBidModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.bidModalCard}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowBidModal(false)}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.bidModalTitle, isUrdu && styles.rtlText]}>{getMyBidOnPost(selectedPost) ? t('updateBidTitle') : t('placeABid')}</Text>
            {selectedPost && (
              <>
                <Text style={[styles.bidModalCropName, isUrdu && styles.rtlText]}>{selectedPost.cropTitle}</Text>
                <Text style={[styles.bidModalBasePrice, isUrdu && styles.rtlText]}>{t('basePriceLabel')} PKR {parseFloat(selectedPost.basePrice || 0).toLocaleString()}</Text>
                {getHighestBid(selectedPost) && <Text style={[styles.bidModalHighest, isUrdu && styles.rtlText]}>{t('highestBid')} PKR {getHighestBid(selectedPost).amount.toLocaleString()}</Text>}
                {getMyBidOnPost(selectedPost) && <Text style={[styles.bidModalMine, isUrdu && styles.rtlText]}>{t('yourBid')}: PKR {getMyBidOnPost(selectedPost).amount.toLocaleString()}</Text>}
              </>
            )}
            <Text style={[styles.bidModalLabel, isUrdu && styles.rtlText]}>{t('enterBidAmountPKR')}</Text>
            <View style={styles.bidInputRow}>
              <Text style={styles.bidInputPrefix}>PKR</Text>
              <TextInput style={styles.bidInput} placeholder="0.00" placeholderTextColor="#9E9E9E" keyboardType="numeric" value={bidAmount} onChangeText={v => { setBidAmount(v); setBidError(''); }} autoFocus />
            </View>
            {bidError ? <Text style={styles.bidError}>⚠ {bidError}</Text> : null}
            <TouchableOpacity style={[styles.placeBidConfirmBtn, bidLoading && styles.placeBidConfirmBtnDisabled]} onPress={handlePlaceBid} disabled={bidLoading} activeOpacity={0.85}>
              {bidLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.placeBidConfirmBtnText}>{getMyBidOnPost(selectedPost) ? t('updateBid') : t('confirmBid')}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CANCEL BID MODAL */}
      <Modal visible={showCancelModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.cancelModalCard}>
            <Text style={styles.cancelModalEmoji}>⚠️</Text>
            <Text style={[styles.cancelModalTitle, isUrdu && styles.rtlText]}>{t('cancelBidQ')}</Text>
            <Text style={[styles.cancelModalMsg, isUrdu && styles.rtlText]}>{t('cancelBidConfirm')}{'\n'}<Text style={{ fontWeight: '800' }}>{cancelBidPost?.cropTitle}</Text>?</Text>
            <View style={styles.cancelModalBtns}>
              <TouchableOpacity style={styles.cancelNoBtn} onPress={() => setShowCancelModal(false)} activeOpacity={0.8}>
                <Text style={styles.cancelNoBtnText}>{t('keepBid')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelYesBtn} onPress={handleCancelBid} activeOpacity={0.85}>
                <Text style={styles.cancelYesBtnText}>{t('yesCancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FARMER PROFILE MODAL */}
      <Modal visible={showFarmerModal} animationType="slide" statusBarTranslucent onRequestClose={() => { setShowFarmerModal(false); setShowRatingForm(false); }}>
        <View style={styles.farmerProfileModal}>
          <View style={styles.farmerProfileHeader}>
            <TouchableOpacity style={styles.farmerProfileBack} onPress={() => { setShowFarmerModal(false); setShowRatingForm(false); }}>
              <Text style={styles.farmerProfileBackTxt}>{t('backLabel')}</Text>
            </TouchableOpacity>
            <Text style={styles.farmerProfileHeaderTitle}>{t('farmerProfile')}</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={{ flex: 1, overflow: 'hidden' }}>
          {selectedFarmer && (
            <ScrollView
              key={`${selectedFarmer.id}-${farmerModalOpenCount}-${(selectedFarmer.reviews || []).length}-${showFarmerModal ? 'open' : 'closed'}`}
              style={StyleSheet.absoluteFillObject}
              contentContainerStyle={styles.farmerProfileScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {(() => {
                const reviews = selectedFarmer.reviews || [];
                const avg = reviews.length ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
                const myReview = getMyReviewOnFarmer(selectedFarmer);
                return (
                  <>
                    <View style={styles.farmerProfileAvatarWrap}>
                      {selectedFarmer.profilePic ? (
                        <TouchableOpacity activeOpacity={0.85} onPress={() => openImageViewer([selectedFarmer.profilePic], 0)}>
                          <Image source={{ uri: selectedFarmer.profilePic }} style={styles.farmerProfileAvatar} />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.farmerProfileAvatarPlaceholder}>
                          <Text style={styles.farmerProfileAvatarInit}>{selectedFarmer.firstName[0]}{selectedFarmer.lastName[0]}</Text>
                        </View>
                      )}
                      <View style={styles.farmerProfileRoleBadge}><Text style={styles.farmerProfileRoleText}>{t('farmer')}</Text></View>
                    </View>
                    <Text style={styles.farmerProfileName}>{selectedFarmer.firstName} {selectedFarmer.lastName}</Text>
                    <View style={styles.farmerRatingSummary}>
                      <StarRating rating={Math.round(avg)} size={26} />
                      <Text style={styles.farmerRatingAvg}>{avg.toFixed(1)} ({reviews.length} {t('reviews')})</Text>
                    </View>
                    {myReview && (
                      <TouchableOpacity onPress={openReviewManageModal} activeOpacity={0.8} style={styles.myReviewLink}>
                        <Text style={styles.myReviewLinkText}>{isUrdu ? '📝 میرا جائزہ دیکھیں' : '📝 View My Review'}</Text>
                      </TouchableOpacity>
                    )}
                    {[
                      { icon: '📱', label: t('phone'), value: selectedFarmer.phone },
                      { icon: '🏙️', label: t('cityLabel'), value: selectedFarmer.city },
                      { icon: '📍', label: t('address'), value: selectedFarmer.address },
                      { icon: '📧', label: t('email'), value: selectedFarmer.email },
                    ].map(row => (
                      <View key={row.label} style={styles.farmerInfoRow}>
                        <Text style={styles.farmerInfoIcon}>{row.icon}</Text>
                        <View><Text style={styles.farmerInfoLabel}>{row.label}</Text><Text style={[styles.farmerInfoValue, isUrdu && styles.rtlText]}>{row.value || '—'}</Text></View>
                      </View>
                    ))}
                    {!myReview && (
                      <TouchableOpacity style={styles.giveReviewBtn} onPress={() => setShowRatingForm(!showRatingForm)} activeOpacity={0.85}>
                        <Text style={styles.giveReviewBtnText}>{showRatingForm ? t('cancelReview') : t('giveReview')}</Text>
                      </TouchableOpacity>
                    )}
                    {showRatingForm && !myReview && (
                      <View style={styles.reviewFormCard}>
                        <Text style={[styles.reviewFormTitle, isUrdu && styles.rtlText]}>{t('writeAReview')}</Text>
                        <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{t('reviewTitle')}</Text>
                        <StarRating rating={ratingValue} onRate={setRatingValue} size={32} />
                        {reviewErrors.rating ? <Text style={styles.reviewErrTxt}>⚠ {reviewErrors.rating}</Text> : null}
                        <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{t('reviewTitle')}</Text>
                        <TextInput style={[styles.reviewInput, reviewErrors.title ? styles.reviewInputErr : null, isUrdu && styles.rtlInput]} placeholder={t('reviewTitle')} placeholderTextColor="#9E9E9E" value={reviewTitle} onChangeText={v => { setReviewTitle(v); setReviewErrors((e: any) => ({ ...e, title: '' })); }} textAlign={isUrdu ? 'right' : 'left'} />
                        {reviewErrors.title ? <Text style={styles.reviewErrTxt}>⚠ {reviewErrors.title}</Text> : null}
                        <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{t('reviewDetail')}</Text>
                        <TextInput style={[styles.reviewInput, styles.reviewMultiInput, reviewErrors.detail ? styles.reviewInputErr : null, isUrdu && styles.rtlInput]} placeholder={t('reviewDetail')} placeholderTextColor="#9E9E9E" multiline numberOfLines={4} value={reviewDetail} onChangeText={v => { setReviewDetail(v); setReviewErrors((e: any) => ({ ...e, detail: '' })); }} textAlignVertical="top" textAlign={isUrdu ? 'right' : 'left'} />
                        {reviewErrors.detail ? <Text style={styles.reviewErrTxt}>⚠ {reviewErrors.detail}</Text> : null}
                        <TouchableOpacity style={styles.submitReviewBtn} onPress={handleSubmitReview} activeOpacity={0.85}>
                          <Text style={styles.submitReviewBtnText}>{t('submitReviewBtn')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {reviews.length > 0 && (
                      <View style={styles.reviewsList}>
                        <Text style={[styles.reviewsListTitle, isUrdu && styles.rtlText]}>{t('reviews')} ({reviews.length})</Text>
                        {reviews.map((r: any, i: number) => (
                          <View key={i} style={styles.reviewItem}>
                            <View style={styles.reviewItemHeader}><StarRating rating={r.rating} size={14} /><Text style={styles.reviewItemName}>{r.reviewerName}</Text></View>
                            <Text style={[styles.reviewItemTitle, isUrdu && styles.rtlText]}>{r.title}</Text>
                            <Text style={[styles.reviewItemDetail, isUrdu && styles.rtlText]}>{r.detail}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={{ height: 40 }} />
                  </>
                );
              })()}
            </ScrollView>
          )}
          </View>
        </View>
      </Modal>

      {/* REVIEW MANAGE MODAL */}
      <Modal visible={showReviewManageModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => { setShowReviewManageModal(false); setShowUpdateReviewForm(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.reviewManageCard}>
            <TouchableOpacity style={styles.modalClose} onPress={() => { setShowReviewManageModal(false); setShowUpdateReviewForm(false); }}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.reviewManageTitle}>{isUrdu ? 'میرا جائزہ' : 'My Review'}</Text>
            {!showUpdateReviewForm ? (
              <>
                {(() => {
                  const myReview = getMyReviewOnFarmer(selectedFarmer);
                  return myReview ? (
                    <View style={styles.myReviewPreview}>
                      <StarRating rating={myReview.rating} size={20} />
                      <Text style={styles.myReviewPreviewTitle}>{myReview.title}</Text>
                      <Text style={styles.myReviewPreviewDetail}>{myReview.detail}</Text>
                    </View>
                  ) : null;
                })()}
                <TouchableOpacity style={styles.updateReviewBtn} onPress={() => setShowUpdateReviewForm(true)} activeOpacity={0.85}>
                  <Text style={styles.updateReviewBtnText}>{isUrdu ? '✏️ جائزہ اپڈیٹ کریں' : '✏️ Update Review'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteReviewBtn} onPress={handleDeleteReview} activeOpacity={0.85}>
                  <Text style={styles.deleteReviewBtnText}>{isUrdu ? '🗑️ جائزہ حذف کریں' : '🗑️ Delete Review'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{isUrdu ? 'آپ کی ریٹنگ' : 'Your Rating'}</Text>
                <StarRating rating={updateRatingValue} onRate={setUpdateRatingValue} size={32} />
                {updateReviewErrors.rating ? <Text style={styles.reviewErrTxt}>⚠ {updateReviewErrors.rating}</Text> : null}
                <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{isUrdu ? 'عنوان' : 'Title'}</Text>
                <TextInput style={[styles.reviewInput, updateReviewErrors.title ? styles.reviewInputErr : null, isUrdu && styles.rtlInput]} placeholder={isUrdu ? 'جائزے کا عنوان' : 'Review title'} placeholderTextColor="#9E9E9E" value={updateReviewTitle} onChangeText={v => { setUpdateReviewTitle(v); setUpdateReviewErrors((e: any) => ({ ...e, title: '' })); }} textAlign={isUrdu ? 'right' : 'left'} />
                {updateReviewErrors.title ? <Text style={styles.reviewErrTxt}>⚠ {updateReviewErrors.title}</Text> : null}
                <Text style={[styles.reviewFormLabel, isUrdu && styles.rtlText]}>{isUrdu ? 'تفصیل' : 'Detail'}</Text>
                <TextInput style={[styles.reviewInput, styles.reviewMultiInput, updateReviewErrors.detail ? styles.reviewInputErr : null, isUrdu && styles.rtlInput]} placeholder={isUrdu ? 'اپنا جائزہ لکھیں...' : 'Write your review...'} placeholderTextColor="#9E9E9E" multiline numberOfLines={4} value={updateReviewDetail} onChangeText={v => { setUpdateReviewDetail(v); setUpdateReviewErrors((e: any) => ({ ...e, detail: '' })); }} textAlignVertical="top" textAlign={isUrdu ? 'right' : 'left'} />
                {updateReviewErrors.detail ? <Text style={styles.reviewErrTxt}>⚠ {updateReviewErrors.detail}</Text> : null}
                <TouchableOpacity style={styles.submitReviewBtn} onPress={handleUpdateReview} activeOpacity={0.85}>
                  <Text style={styles.submitReviewBtnText}>{isUrdu ? 'تبدیلیاں محفوظ کریں' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelNoBtn, { marginTop: 10 }]} onPress={() => setShowUpdateReviewForm(false)} activeOpacity={0.8}>
                  <Text style={styles.cancelNoBtnText}>{isUrdu ? 'منسوخ کریں' : 'Cancel'}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  toast: { position: 'absolute', top: Platform.OS === 'ios' ? 100 : 80, left: 20, right: 20, zIndex: 999, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 12 },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderWidth: 1.5, borderColor: '#E8E8E8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  searchIcon: { fontSize: 18 },
  searchInput: { flex: 1, fontSize: 15, color: '#1B1B1B', paddingVertical: 0 },
  searchClear: { fontSize: 16, color: '#9E9E9E', paddingHorizontal: 4 },
  listContent: { paddingHorizontal: 14, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22 },
  postCard: { backgroundColor: '#FFFFFF', borderRadius: 22, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 7 },
  galleryPlaceholder: { width: '100%', height: 200, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center' },
  galleryScroll: { width: width - 28, height: 210 },
  galleryImage: { width: width - 28, height: 210 },
  galleryIndicatorRow: { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  galleryIndicatorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 6 },
  postHeaderLeft: { flex: 1, paddingRight: 10 },
  postHeaderRight: { alignItems: 'flex-end' },
  postTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  postCity: { fontSize: 13, color: '#757575', fontWeight: '500' },
  postBasePrice: { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },
  postBasePriceVal: { fontSize: 16, fontWeight: '800', color: '#2E7D32' },
  postDesc: { fontSize: 13, color: '#555555', lineHeight: 20 },
  seeMoreText: { fontSize: 13, color: '#1565C0', fontWeight: '700', marginTop: 4 },
  countdownBadge: { backgroundColor: '#E3F2FD', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 14, marginBottom: 10, alignSelf: 'flex-start' },
  countdownText: { fontSize: 13, fontWeight: '800', color: '#1565C0' },
  bidInfoRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 16, marginBottom: 12 },
  bidInfoItem: {},
  bidInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 2 },
  bidInfoValue: { fontSize: 14, fontWeight: '800', color: '#1B1B1B' },
  liveLocationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, marginHorizontal: 14, marginBottom: 10, paddingVertical: 11, borderWidth: 1.5, borderColor: '#A5D6A7' },
  liveLocationBtnText: { fontSize: 14, fontWeight: '800', color: '#2E7D32' },
  farmerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9F9F9', paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  farmerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#2E7D32' },
  farmerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
  farmerAvatarInit: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  farmerInfo: { flex: 1 },
  farmerName: { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  farmerLocation: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
  farmerStarsRow: { flexDirection: 'row', gap: 1 },
  viewProfileLink: { fontSize: 12, color: '#1565C0', fontWeight: '700' },
  actionsContainer: { paddingHorizontal: 14, paddingBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  placeBidBtn: { flex: 1, backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  placeBidBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  messageFarmerBtn: { flex: 1, backgroundColor: '#E3F2FD', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BBDEFB' },
  messageAloneBtn: { backgroundColor: '#E3F2FD', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BBDEFB' },
  messageFarmerBtnText: { color: '#1565C0', fontSize: 15, fontWeight: '800' },
  updateBidBtn: { flex: 1, backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  updateBidBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  cancelBidBtn: { backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A' },
  cancelBidBtnText: { color: '#C62828', fontSize: 15, fontWeight: '800' },
  winnerBanner: { backgroundColor: '#E8F5E9', paddingVertical: 12, paddingHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#A5D6A7' },
  winnerBannerText: { fontSize: 13, fontWeight: '800', color: '#2E7D32', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  bidModalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalClose: { position: 'absolute', top: 16, right: 20, width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  modalCloseTxt: { fontSize: 16, color: '#555555', fontWeight: '700' },
  bidModalTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 6, marginTop: 8 },
  bidModalCropName: { fontSize: 15, color: '#2E7D32', fontWeight: '700', marginBottom: 4 },
  bidModalBasePrice: { fontSize: 13, color: '#555555', fontWeight: '500', marginBottom: 2 },
  bidModalHighest: { fontSize: 13, color: '#1565C0', fontWeight: '700', marginBottom: 2 },
  bidModalMine: { fontSize: 13, color: '#9E9E9E', fontWeight: '600', marginBottom: 16 },
  bidModalLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 12 },
  bidInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8', overflow: 'hidden' },
  bidInputPrefix: { paddingHorizontal: 14, fontSize: 14, fontWeight: '800', color: '#1565C0', borderRightWidth: 1.5, borderRightColor: '#E8E8E8', paddingVertical: 14 },
  bidInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  bidError: { color: '#E53935', fontSize: 12, marginTop: 5, fontWeight: '500' },
  placeBidConfirmBtn: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 9 },
  placeBidConfirmBtnDisabled: { backgroundColor: '#90CAF9' },
  placeBidConfirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelModalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44, alignItems: 'center' },
  cancelModalEmoji: { fontSize: 48, marginBottom: 14 },
  cancelModalTitle: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  cancelModalMsg: { fontSize: 15, color: '#555555', textAlign: 'center', lineHeight: 24, marginBottom: 26 },
  cancelModalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelNoBtn: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0' },
  cancelNoBtnText: { fontSize: 15, fontWeight: '700', color: '#555555' },
  cancelYesBtn: { flex: 1, backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A' },
  cancelYesBtnText: { fontSize: 15, fontWeight: '800', color: '#C62828' },
  farmerProfileModal: { flex: 1, backgroundColor: '#FFFFFF' },
  farmerProfileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  farmerProfileBack: { padding: 6 },
  farmerProfileBackTxt: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  farmerProfileHeaderTitle: { fontSize: 18, fontWeight: '800', color: '#1B1B1B' },
  farmerProfileScroll: { padding: 20, paddingBottom: 60 },
  farmerProfileAvatarWrap: { alignItems: 'center', marginBottom: 14 },
  farmerProfileAvatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#2E7D32' },
  farmerProfileAvatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#81C784' },
  farmerProfileAvatarInit: { color: '#FFFFFF', fontSize: 38, fontWeight: '800' },
  farmerProfileRoleBadge: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 8 },
  farmerProfileRoleText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  farmerProfileName: { fontSize: 24, fontWeight: '800', color: '#1B1B1B', textAlign: 'center', marginBottom: 10 },
  farmerRatingSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 6 },
  farmerRatingAvg: { fontSize: 14, color: '#555555', fontWeight: '600' },
  myReviewLink: { alignSelf: 'center', marginBottom: 16, marginTop: 4 },
  myReviewLinkText: { fontSize: 14, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline' },
  farmerInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: '#F9F9F9', borderRadius: 14, padding: 14, marginBottom: 10 },
  farmerInfoIcon: { fontSize: 22 },
  farmerInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  farmerInfoValue: { fontSize: 15, fontWeight: '700', color: '#1B1B1B' },
  giveReviewBtn: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginVertical: 16, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  giveReviewBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  reviewFormCard: { backgroundColor: '#F0F7FF', borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: '#BBDEFB', marginBottom: 16 },
  reviewFormTitle: { fontSize: 16, fontWeight: '800', color: '#1565C0', marginBottom: 14 },
  reviewFormLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 12 },
  reviewInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1B1B1B' },
  reviewMultiInput: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  reviewInputErr: { borderColor: '#E53935' },
  reviewErrTxt: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  submitReviewBtn: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  submitReviewBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  reviewsList: { marginTop: 8 },
  reviewsListTitle: { fontSize: 16, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  reviewItem: { backgroundColor: '#F9F9F9', borderRadius: 14, padding: 14, marginBottom: 10 },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reviewItemName: { fontSize: 12, color: '#9E9E9E', fontWeight: '600' },
  reviewItemTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  reviewItemDetail: { fontSize: 13, color: '#555555', lineHeight: 20 },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#FFE082' },
  lockedIcon: { fontSize: 16, marginRight: 8 },
  lockedText: { fontSize: 13, fontWeight: '600', color: '#F57F17', flex: 1 },
  reviewManageCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  reviewManageTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginTop: 8, marginBottom: 16 },
  myReviewPreview: { backgroundColor: '#F0F7FF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#BBDEFB' },
  myReviewPreviewTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginTop: 8, marginBottom: 4 },
  myReviewPreviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20 },
  updateReviewBtn: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 7 },
  updateReviewBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  deleteReviewBtn: { backgroundColor: '#FFEBEE', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#EF9A9A' },
  deleteReviewBtnText: { color: '#C62828', fontSize: 15, fontWeight: '800' },
  refreshBarRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 6 },
  refreshBarBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#A5D6A7' },
  refreshBarBtnText: { fontSize: 13, fontWeight: '800', color: '#2E7D32' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },
});

export default BuyerHomeScreen;
