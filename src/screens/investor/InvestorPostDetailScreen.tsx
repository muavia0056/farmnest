import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  TextInput, FlatList, Alert, Linking, Platform, BackHandler, NativeScrollEvent, NativeSyntheticEvent,
  Modal, StatusBar, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import ImageViewer from '../../components/ImageViewer';
import { createInvestmentOrderInFirebase } from '../../services/firebaseFundingService';
import {
  createReviewInFirebase,
  updateReviewInFirebase,
  deleteReviewInFirebase,
} from '../../services/firebaseReviewService';
import {
  sendTextMessageToFirebase,
  sendImageMessageToFirebase,
} from '../../services/firebaseMessageService';

const { width: SCREEN_WIDTH } = require('react-native').Dimensions.get('window');

// ── Star Rating ──────────────────────────────────────────────────────────────
const StarRating = ({ rating, onRate, size = 24 }: { rating: number; onRate?: (r: number) => void; size?: number }) => (
  <View style={{ flexDirection: 'row', gap: 3 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <TouchableOpacity key={s} onPress={() => onRate?.(s)} disabled={!onRate} activeOpacity={0.7}>
        <Text style={{ fontSize: size, color: s <= rating ? '#F9A825' : '#E0E0E0' }}>★</Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ── Image Gallery ──────────────────────────────────────────────────────────────
const ImageGallery = ({ images, onImagePress }: { images: string[]; onImagePress?: (idx: number) => void }) => {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  if (!images || images.length === 0) {
    return (
      <View style={styles.galleryPlaceholder}>
        <Text style={{ fontSize: 48 }}>🌍</Text>
      </View>
    );
  }
  return (
    <View style={styles.galleryWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
          setIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
        }
      >
        {images.map((item, index) => (
          <TouchableOpacity
            key={String(index)}
            activeOpacity={0.92}
            onPress={() => onImagePress?.(index)}
          >
            <Image
              source={{ uri: item }}
              style={{ width: SCREEN_WIDTH, height: 240 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {images.length > 1 && idx > 0 && (
        <TouchableOpacity
          style={[styles.arrow, styles.arrowLeft]}
          onPress={() => {
            const n = idx - 1;
            scrollRef.current?.scrollTo({ x: n * SCREEN_WIDTH, animated: true });
            setIdx(n);
          }}>
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
      )}
      {images.length > 1 && idx < images.length - 1 && (
        <TouchableOpacity
          style={[styles.arrow, styles.arrowRight]}
          onPress={() => {
            const n = idx + 1;
            scrollRef.current?.scrollTo({ x: n * SCREEN_WIDTH, animated: true });
            setIdx(n);
          }}>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      )}
      {images.length > 1 && (
        <View style={styles.galleryCounter}>
          <Text style={styles.galleryCounterText}>{idx + 1}/{images.length}</Text>
        </View>
      )}
    </View>
  );
};

// ── Main Detail Screen ────────────────────────────────────────────────────────
const InvestorPostDetailScreen = ({ route, navigation }: any) => {
  const { postId } = route.params;
  const { currentUser, fundingPosts, users, setUsers, messages, addNotification } = useApp();
  const { t, isUrdu } = useLanguage();

  const post = fundingPosts.find((p: any) => p.id === postId);
  const farmer = post ? users.find((u: any) => u.id === post.farmerId) : null;
  const reviews = farmer?.reviews || [];
  const avgRating = reviews.length
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : 0;
  const myReview = reviews.find((r: any) => r.reviewerId === currentUser?.id);

  // Image viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Farmer profile modal
  const [showFarmerProfile, setShowFarmerProfile] = useState(false);
  const [farmerProfileOpenCount, setFarmerProfileOpenCount] = useState(0);
  const [showFarmerReviews, setShowFarmerReviews] = useState(false);
  const [farmerProfileImageViewerVisible, setFarmerProfileImageViewerVisible] = useState(false);

  // Invest state
  const [investAmount, setInvestAmount] = useState('');
  const [investLoading, setInvestLoading] = useState(false);

  const viewerVisibleRef = useRef(viewerVisible);
  useEffect(() => { viewerVisibleRef.current = viewerVisible; }, [viewerVisible]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (viewerVisibleRef.current) { setViewerVisible(false); return true; }
        navigation.goBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  const openImageViewer = (imgs: string[], idx: number) => {
    setViewerImages(imgs); setViewerIndex(idx); setViewerVisible(true);
  };

  // Review state
  const [myRating, setMyRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewDetail, setReviewDetail] = useState('');
  const [reviewErrors, setReviewErrors] = useState<any>({});
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  // Chat state
  const [chatText, setChatText] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2800);
  };

  const resetReviewForm = () => {
    setMyRating(0); setReviewTitle(''); setReviewDetail('');
    setReviewErrors({}); setEditingReviewId(null);
  };

  const validateReview = () => {
    const e: any = {};
    if (myRating === 0) e.rating = t('ratingRequired');
    if (!reviewTitle.trim()) e.title = t('reviewTitleRequired');
    if (!reviewDetail.trim()) e.detail = t('reviewDetailRequired');
    setReviewErrors(e);
    return !Object.keys(e).length;
  };

  // ── Invest handler — creates an investmentOrder, then directs to Payment menu ──
  const handleInvest = async () => {
    if (!currentUser) { Alert.alert('Error', 'Please login again.'); return; }
    if (!post) { Alert.alert('Error', 'No funding post selected.'); return; }
    if (!investAmount.trim() || isNaN(Number(investAmount)) || Number(investAmount) <= 0) {
      Alert.alert('Error', isUrdu ? 'درست رقم درج کریں۔' : 'Please enter a valid investment amount.');
      return;
    }

    Alert.alert(
      isUrdu ? 'تصدیق' : 'Confirm Investment',
      isUrdu
        ? `PKR ${Number(investAmount).toLocaleString()} سرمایہ کاری کریں؟\n\nادائیگی مینو میں جا کر ادائیگی مکمل کریں۔`
        : `Invest PKR ${Number(investAmount).toLocaleString()} in this post?\n\nYou will be taken to the Payment menu to complete your payment.`,
      [
        { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
        {
          text: isUrdu ? 'Invest Now' : 'Invest Now',
          onPress: async () => {
            try {
              setInvestLoading(true);
              await createInvestmentOrderInFirebase({
                postId: post.id,
                investorId: currentUser.id,
                investorName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
                farmerId: post.farmerId,
                farmerName: post.farmerName || '',
                amount: Number(investAmount),
                postTitle: post.title || post.landTitle || '',
              });
              addNotification(post.farmerId, {
                en: `💼 ${currentUser.firstName} ${currentUser.lastName} wants to invest PKR ${Number(investAmount).toLocaleString()} in "${post.title || post.landTitle}". Awaiting payment.`,
                ur: `💼 ${currentUser.firstName} ${currentUser.lastName} آپ کی زمین میں سرمایہ کاری کرنا چاہتے ہیں۔ ادائیگی باقی ہے۔`,
              });
              setInvestLoading(false);
              setInvestAmount('');
              Alert.alert(
                isUrdu ? 'آرڈر بنایا گیا' : 'Order Created!',
                isUrdu
                  ? 'سرمایہ کاری آرڈر بنایا گیا ہے۔ ادائیگی مینو میں جا کر ادائیگی مکمل کریں۔'
                  : 'Your investment order has been placed. Please go to the Payment menu to complete your payment.',
                [
                  { text: isUrdu ? 'ادائیگی مینو' : 'Go to Payment', onPress: () => navigation.navigate('InvestorPayment') },
                  { text: 'OK' },
                ]
              );
            } catch (error: any) {
              setInvestLoading(false);
              Alert.alert('Investment Error', 'Failed to create order. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handlePostReview = async () => {
    if (!validateReview() || !post || !farmer) return;

    const isEdit = !!editingReviewId;

    try {
      if (isEdit && editingReviewId) {
        await updateReviewInFirebase(
          editingReviewId,
          post.farmerId,
          currentUser!.id,
          {
            rating: myRating,
            title: reviewTitle.trim(),
            detail: reviewDetail.trim(),
          }
        );
      } else {
        await createReviewInFirebase({
          farmerId: post.farmerId,
          farmerName: `${farmer.firstName} ${farmer.lastName}`,
          reviewerId: currentUser!.id,
          reviewerName: `${currentUser!.firstName} ${currentUser!.lastName}`,
          reviewerRole: 'Investor',
          rating: myRating,
          title: reviewTitle.trim(),
          detail: reviewDetail.trim(),
        });
      }

      showToast(isEdit ? t('reviewUpdated') : t('reviewPosted'));
      resetReviewForm();
    } catch (error: any) {
      console.warn('handlePostReview Firebase error:', error);
      Alert.alert('Error', 'Could not submit review. Please try again.');
    }
  };

  const handleEditReview = (review: any) => {
    setEditingReviewId(review.id);
    setMyRating(review.rating);
    setReviewTitle(review.title);
    setReviewDetail(review.detail);
    setReviewErrors({});
  };

  const handleDeleteReview = (reviewId: string) => {
    if (!post) return;
    Alert.alert(t('deleteReviewTitle'), t('deleteReviewConfirm'), [
      { text: t('cancelLabel'), style: 'cancel' },
      {
        text: t('deleteLabel'), style: 'destructive', onPress: async () => {
          try {
            await deleteReviewInFirebase(reviewId, post.farmerId, currentUser!.id);
            showToast(t('reviewDeleted'));
            resetReviewForm();
          } catch (error: any) {
            console.warn('handleDeleteReview Firebase error:', error);
            Alert.alert('Error', 'Could not delete review. Please try again.');
          }
        },
      },
    ]);
  };

  const chatMessages = post
    ? messages.filter((m: any) =>
        (m.senderId === currentUser?.id && m.receiverId === post.farmerId) ||
        (m.senderId === post.farmerId && m.receiverId === currentUser?.id)
      ).sort((a: any, b: any) => a.timestamp - b.timestamp)
    : [];

  const sendChatMessage = async () => {
    if (!chatText.trim() || !post || !currentUser) return;
    const msgText = chatText.trim();
    setChatText('');
    try {
      await sendTextMessageToFirebase({
        receiverId: post.farmerId,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        senderRole: currentUser.role,
        text: msgText,
      });
    } catch (error) {
      Alert.alert('Message Error', 'Failed to send message.');
    }
  };

  const sendChatImage = async () => {
    if (!post || !currentUser) return;
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]?.uri) {
      try {
        await sendImageMessageToFirebase({
          receiverId: post.farmerId,
          senderName: `${currentUser.firstName} ${currentUser.lastName}`,
          senderRole: currentUser.role,
          imageUri: res.assets[0].uri,
        });
      } catch (error) {
        Alert.alert('Image Error', 'Failed to send image.');
      }
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!post) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>{t('backLabel')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Post not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Fixed header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>{t('backLabel')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{post.title || post.landTitle}</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* ── Toast ── */}
      {toastMsg !== '' && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Full-screen image viewer */}
      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Farmer header */}
        {farmer && (
          <View style={styles.farmerHeader}>
            {farmer.profilePic ? (
              <Image source={{ uri: farmer.profilePic }} style={styles.farmerAvatar} />
            ) : (
              <View style={styles.farmerAvatarPH}>
                <Text style={styles.farmerAvatarInit}>
                  {farmer.firstName?.[0]}{farmer.lastName?.[0]}
                </Text>
              </View>
            )}
            <View style={styles.farmerInfo}>
              <Text style={[styles.farmerName, isUrdu && styles.rtl]}>
                {farmer.firstName} {farmer.lastName}
              </Text>
              <TouchableOpacity onPress={() => { setFarmerProfileOpenCount(c => c + 1); setShowFarmerProfile(true); }} activeOpacity={0.7}>
                <Text style={styles.seeProfileLink}>
                  {isUrdu ? 'پروفائل دیکھیں' : 'View Profile'}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <StarRating rating={Math.round(avgRating)} size={18} />
                <Text style={styles.farmerRatingTxt}>
                  {avgRating.toFixed(1)} ({reviews.length})
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Farmer Full Profile Modal */}
        {farmer && (
          <Modal
            visible={showFarmerProfile}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => { setShowFarmerProfile(false); setShowFarmerReviews(false); setFarmerProfileImageViewerVisible(false); }}
          >
            <ImageViewer
              visible={farmerProfileImageViewerVisible}
              images={farmer.profilePic ? [farmer.profilePic] : []}
              initialIndex={0}
              onClose={() => setFarmerProfileImageViewerVisible(false)}
            />

            <View style={styles.profileModal}>
              <View style={styles.profileModalHeader}>
                <TouchableOpacity
                  onPress={() => { setShowFarmerProfile(false); setShowFarmerReviews(false); setFarmerProfileImageViewerVisible(false); }}
                  style={styles.profileModalBack}>
                  <Text style={styles.profileModalBackText}>{t('backLabel')}</Text>
                </TouchableOpacity>
                <Text style={styles.profileModalTitle}>{isUrdu ? 'کسان کا پروفائل' : 'Farmer Profile'}</Text>
                <View style={{ width: 70 }} />
              </View>

              <View style={{ flex: 1 }}>
                <ScrollView
                  key={`detail-profile-${farmer.id}-${farmerProfileOpenCount}`}
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.profileModalScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.profileModalAvatarSection}>
                    {farmer.profilePic ? (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setFarmerProfileImageViewerVisible(true)}>
                        <Image source={{ uri: farmer.profilePic }} style={styles.profileModalAvatar} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.profileModalAvatarPH}>
                        <Text style={styles.profileModalAvatarInit}>{farmer.firstName?.[0]}{farmer.lastName?.[0]}</Text>
                      </View>
                    )}
                    <Text style={styles.profileModalName}>{farmer.firstName} {farmer.lastName}</Text>
                    <View style={{ flexDirection: 'row', gap: 3, marginVertical: 4 }}>
                      {[1,2,3,4,5].map(s => (
                        <Text key={s} style={{ fontSize: 20, color: s <= Math.round(avgRating) ? '#F9A825' : '#E0E0E0' }}>★</Text>
                      ))}
                    </View>
                    <Text style={styles.profileModalRatingCount}>({reviews.length} {isUrdu ? 'جائزے' : 'reviews'})</Text>

                    {reviews.length > 0 && (
                      <TouchableOpacity onPress={() => setShowFarmerReviews(true)} activeOpacity={0.7}>
                        <Text style={styles.profileModalSeeReviews}>
                          {isUrdu ? 'تمام جائزے دیکھیں' : 'See All Reviews'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.profileModalRolePill}>
                      <Text style={styles.profileModalRolePillText}>🌾 {isUrdu ? 'کسان' : 'Farmer'}</Text>
                    </View>
                  </View>

                  <View style={styles.profileModalInfoCard}>
                    {[
                      { icon: '📧', label: isUrdu ? 'ای میل' : 'Email', value: farmer.email },
                      { icon: '📱', label: isUrdu ? 'فون' : 'Phone', value: farmer.phone },
                      { icon: '🏙️', label: isUrdu ? 'شہر' : 'City', value: farmer.city },
                      { icon: '📍', label: isUrdu ? 'پتہ' : 'Address', value: farmer.address },
                    ].map(row => (
                      <View key={row.label} style={styles.profileModalInfoRow}>
                        <Text style={styles.profileModalInfoIcon}>{row.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.profileModalInfoLabel}>{row.label}</Text>
                          <Text style={styles.profileModalInfoValue}>{row.value || '—'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={{ height: 30 }} />
                </ScrollView>
              </View>
            </View>

            {/* Reviews sub-modal */}
            <Modal
              visible={showFarmerReviews}
              animationType="slide"
              statusBarTranslucent
              onRequestClose={() => setShowFarmerReviews(false)}
            >
              <View style={styles.profileModal}>
                <View style={styles.profileModalHeader}>
                  <TouchableOpacity onPress={() => setShowFarmerReviews(false)} style={styles.profileModalBack}>
                    <Text style={styles.profileModalBackText}>{t('backLabel')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.profileModalTitle}>⭐ {isUrdu ? 'جائزے' : 'Reviews'} ({reviews.length})</Text>
                  <View style={{ width: 70 }} />
                </View>
                <FlatList
                  data={reviews}
                  keyExtractor={(_: any, i: number) => String(i)}
                  contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                      <Text style={{ fontSize: 48, marginBottom: 12 }}>⭐</Text>
                      <Text style={{ fontSize: 16, color: '#9E9E9E' }}>{isUrdu ? 'کوئی جائزہ نہیں' : 'No reviews yet'}</Text>
                    </View>
                  }
                  renderItem={({ item: review }: { item: any }) => (
                    <View style={styles.reviewModalItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {[1,2,3,4,5].map(s => (
                            <Text key={s} style={{ fontSize: 14, color: s <= review.rating ? '#F9A825' : '#E0E0E0' }}>★</Text>
                          ))}
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1B1B1B', flex: 1 }}>{review.title}</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#555555', lineHeight: 20, marginBottom: 6 }}>{review.detail}</Text>
                      <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: '600', fontStyle: 'italic' }}>— {review.reviewerName}</Text>
                    </View>
                  )}
                />
              </View>
            </Modal>
          </Modal>
        )}

        {/* Gallery */}
        <ImageGallery images={post.images || []} onImagePress={(i) => openImageViewer(post.images || [], i)} />

        {/* Land info */}
        <View style={styles.infoCard}>
          <Text style={[styles.landTitle, isUrdu && styles.rtl]}>{post.title || post.landTitle}</Text>
          <Text style={styles.cityTxt}>📍 {post.city}</Text>
          {post.address ? <Text style={styles.addressTxt}>🏠 {post.address}</Text> : null}
          {post.description ? (
            <Text style={[styles.descTxt, isUrdu && styles.rtl]}>{post.description}</Text>
          ) : null}
          {post.liveLocation && (
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => {
                const { latitude, longitude } = post.liveLocation;
                Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                ).catch(() => Alert.alert('Error', 'Could not open Google Maps.'));
              }}
              activeOpacity={0.85}>
              <Text style={styles.mapBtnTxt}>{t('seeFarmerLiveLocation')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Invest Section ── */}
        {(post.status === 'Open' || post.status === 'Active') && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
              {isUrdu ? 'سرمایہ کاری کریں' : 'Invest in this Post'}
            </Text>

            {/* Progress bar */}
            {(post.targetAmount || 0) > 0 && (
              <View style={styles.progressWrap}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, {
                    width: `${Math.min(100, Math.round(((post.investedAmount || 0) / post.targetAmount) * 100))}%` as any,
                  }]} />
                </View>
                <Text style={styles.progressPct}>
                  {Math.min(100, Math.round(((post.investedAmount || 0) / post.targetAmount) * 100))}% {isUrdu ? 'مکمل' : 'funded'}
                </Text>
              </View>
            )}

            {/* Target / Raised */}
            <View style={styles.investProgressRow}>
              <View style={styles.investProgressItem}>
                <Text style={styles.investProgressLabel}>{isUrdu ? 'ہدف' : 'Target'}</Text>
                <Text style={styles.investProgressValue}>
                  PKR {Number(post.targetAmount || 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.investProgressDivider} />
              <View style={styles.investProgressItem}>
                <Text style={styles.investProgressLabel}>{isUrdu ? 'جمع شدہ' : 'Raised'}</Text>
                <Text style={[styles.investProgressValue, { color: '#2E7D32' }]}>
                  PKR {Number(post.investedAmount || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder={isUrdu ? 'رقم درج کریں (PKR)' : 'Enter amount (PKR)'}
              placeholderTextColor="#9E9E9E"
              keyboardType="numeric"
              value={investAmount}
              onChangeText={setInvestAmount}
              textAlign={isUrdu ? 'right' : 'left'}
            />

            <TouchableOpacity
              style={[styles.investBtn, investLoading && styles.investBtnDisabled]}
              onPress={handleInvest}
              disabled={investLoading}
              activeOpacity={0.85}>
              {investLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.investBtnTxt}>
                  {isUrdu ? 'سرمایہ کاری کریں' : 'Invest Now'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Funded badge */}
        {post.status === 'Funded' && (
          <View style={styles.fundedBadge}>
            <Text style={styles.fundedBadgeTxt}>
              ✅ {isUrdu ? 'یہ پوسٹ مکمل فنڈڈ ہو گئی ہے' : 'This post has been fully funded!'}
            </Text>
          </View>
        )}

        {/* ── Review Section ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>
            {t('writeAReviewInvestor')}
          </Text>

          {myReview && !editingReviewId && (
            <View style={styles.myReviewCard}>
              <View style={styles.myReviewHeader}>
                <StarRating rating={myReview.rating} size={16} />
                <Text style={styles.myReviewLabel}>{t('yourReview')}</Text>
              </View>
              <Text style={[styles.myReviewTitle, isUrdu && styles.rtl]}>{myReview.title}</Text>
              <Text style={[styles.myReviewDetail, isUrdu && styles.rtl]}>{myReview.detail}</Text>
              <View style={styles.reviewActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => handleEditReview(myReview)} activeOpacity={0.8}>
                  <Text style={styles.editBtnTxt}>{t('editReview')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteReview(myReview.id)} activeOpacity={0.8}>
                  <Text style={styles.deleteBtnTxt}>{t('deleteReview')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(!myReview || editingReviewId) && (
            <View style={styles.reviewForm}>
              <Text style={[styles.formLabel, isUrdu && styles.rtl]}>{t('yourRating')}</Text>
              <StarRating
                rating={myRating}
                onRate={r => { setMyRating(r); setReviewErrors((e: any) => ({ ...e, rating: '' })); }}
                size={34}
              />
              {reviewErrors.rating ? <Text style={styles.errTxt}>⚠ {reviewErrors.rating}</Text> : null}

              <Text style={[styles.formLabel, isUrdu && styles.rtl]}>{t('reviewTitle')}</Text>
              <TextInput
                style={[styles.input, reviewErrors.title && styles.inputErr, isUrdu && styles.rtlInput]}
                placeholder={t('shortSummary')}
                placeholderTextColor="#9E9E9E"
                value={reviewTitle}
                onChangeText={v => { setReviewTitle(v); setReviewErrors((e: any) => ({ ...e, title: '' })); }}
                textAlign={isUrdu ? 'right' : 'left'}
              />
              {reviewErrors.title ? <Text style={styles.errTxt}>⚠ {reviewErrors.title}</Text> : null}

              <Text style={[styles.formLabel, isUrdu && styles.rtl]}>{t('reviewDetail')}</Text>
              <TextInput
                style={[styles.input, styles.multiInput, reviewErrors.detail && styles.inputErr, isUrdu && styles.rtlInput]}
                placeholder={t('yourExperience')}
                placeholderTextColor="#9E9E9E"
                multiline
                numberOfLines={4}
                value={reviewDetail}
                onChangeText={v => { setReviewDetail(v); setReviewErrors((e: any) => ({ ...e, detail: '' })); }}
                textAlignVertical="top"
                textAlign={isUrdu ? 'right' : 'left'}
              />
              {reviewErrors.detail ? <Text style={styles.errTxt}>⚠ {reviewErrors.detail}</Text> : null}

              <View style={styles.formBtns}>
                {editingReviewId && (
                  <TouchableOpacity style={styles.cancelReviewBtn} onPress={resetReviewForm} activeOpacity={0.8}>
                    <Text style={styles.cancelReviewBtnTxt}>{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.postReviewBtn} onPress={handlePostReview} activeOpacity={0.85}>
                  <Text style={styles.postReviewBtnTxt}>
                    {editingReviewId ? t('updateReview') : t('postReview')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Chat Section ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isUrdu && styles.rtl]}>{t('messageFarmer')}</Text>
          <View style={styles.chatBubbles}>
            {chatMessages.length === 0 ? (
              <Text style={[styles.noChatTxt, isUrdu && styles.rtl]}>
                {t('noMessagesStartConversation')}
              </Text>
            ) : (
              chatMessages.map((msg: any) => {
                const isMine = msg.senderId === currentUser?.id;
                return (
                  <View
                    key={msg.id}
                    style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
                    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {msg.image ? (
                        <Image source={{ uri: msg.image }} style={styles.bubbleImg} />
                      ) : (
                        <Text style={[styles.bubbleTxt, isMine ? styles.bubbleTxtMine : styles.bubbleTxtTheirs]}>
                          {msg.text}
                        </Text>
                      )}
                      <Text style={[styles.bubbleTime, isMine && { color: '#CE93D8' }]}>
                        {formatTime(msg.timestamp)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.chatInputRow}>
            <TouchableOpacity style={styles.imgBtn} onPress={sendChatImage} activeOpacity={0.75}>
              <Text style={styles.imgBtnTxt}>＋</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.chatInput, isUrdu && styles.rtlInput]}
              placeholder={t('typeMessage')}
              placeholderTextColor="#9E9E9E"
              value={chatText}
              onChangeText={setChatText}
              multiline
              textAlign={isUrdu ? 'right' : 'left'}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !chatText.trim() && styles.sendBtnDisabled]}
              onPress={sendChatMessage}
              disabled={!chatText.trim()}
              activeOpacity={0.8}>
              <Text style={styles.sendBtnTxt}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8,
    paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 4,
  },
  backBtn: { padding: 4, minWidth: 70 },
  backTxt: { fontSize: 15, color: '#6A1B9A', fontWeight: '700' },
  headerTitle: {
    flex: 1, fontSize: 16, fontWeight: '800',
    color: '#1B1B1B', textAlign: 'center', marginHorizontal: 10,
  },

  toast: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 70,
    left: 20, right: 20, zIndex: 999,
    backgroundColor: '#6A1B9A', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20, elevation: 12,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 30 },

  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#9E9E9E' },

  farmerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: '#F9F5FF', borderBottomWidth: 1, borderBottomColor: '#EDE7F6',
  },
  farmerAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: '#6A1B9A' },
  farmerAvatarPH: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#6A1B9A',
    justifyContent: 'center', alignItems: 'center',
  },
  farmerAvatarInit: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  farmerInfo: { flex: 1 },
  farmerName: { fontSize: 18, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  farmerRatingTxt: { fontSize: 13, color: '#555555', fontWeight: '600' },

  galleryWrap: { position: 'relative', height: 240, backgroundColor: '#EDE7F6' },
  galleryPlaceholder: { height: 240, backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center' },
  arrow: {
    position: 'absolute', top: '50%', marginTop: -25,
    width: 44, height: 50, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  arrowText: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  galleryCounter: {
    position: 'absolute', bottom: 10, right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  galleryCounterText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  infoCard: { padding: 16, paddingBottom: 8, backgroundColor: '#FFFFFF', marginBottom: 8 },
  landTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  cityTxt: { fontSize: 14, color: '#757575', fontWeight: '500', marginBottom: 4 },
  addressTxt: { fontSize: 13, color: '#757575', fontWeight: '500', marginBottom: 10 },
  descTxt: { fontSize: 14, color: '#444444', lineHeight: 22 },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDE7F6', borderRadius: 12, marginTop: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#CE93D8',
  },
  mapBtnTxt: { fontSize: 14, fontWeight: '800', color: '#6A1B9A' },

  section: { backgroundColor: '#FFFFFF', marginTop: 8, padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 14 },

  progressWrap: { marginBottom: 10 },
  progressBarBg: { height: 8, backgroundColor: '#EDE7F6', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: 8, backgroundColor: '#6A1B9A', borderRadius: 4 },
  progressPct: { fontSize: 11, color: '#6A1B9A', fontWeight: '700', textAlign: 'right' },

  investProgressRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9F5FF', borderRadius: 14, padding: 14,
    marginBottom: 14, borderWidth: 1.5, borderColor: '#EDE7F6',
  },
  investProgressItem: { flex: 1, alignItems: 'center' },
  investProgressLabel: { fontSize: 12, color: '#9E9E9E', fontWeight: '600', marginBottom: 4 },
  investProgressValue: { fontSize: 16, fontWeight: '800', color: '#1B1B1B' },
  investProgressDivider: { width: 1, height: 40, backgroundColor: '#E0E0E0', marginHorizontal: 12 },
  investBtn: {
    backgroundColor: '#6A1B9A', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38, shadowRadius: 10, elevation: 7,
  },
  investBtnDisabled: { backgroundColor: '#CE93D8' },
  investBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  fundedBadge: {
    margin: 8, backgroundColor: '#E8F5E9', borderRadius: 14,
    padding: 16, borderWidth: 1.5, borderColor: '#A5D6A7', alignItems: 'center',
  },
  fundedBadgeTxt: { fontSize: 15, fontWeight: '800', color: '#1B5E20', textAlign: 'center' },

  myReviewCard: {
    backgroundColor: '#F9F5FF', borderRadius: 16, padding: 14, marginBottom: 16,
    borderWidth: 1.5, borderColor: '#EDE7F6',
  },
  myReviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  myReviewLabel: { fontSize: 12, fontWeight: '700', color: '#6A1B9A' },
  myReviewTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  myReviewDetail: { fontSize: 13, color: '#555555', lineHeight: 20, marginBottom: 12 },
  reviewActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1, backgroundColor: '#EDE7F6', borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#CE93D8',
  },
  editBtnTxt: { fontSize: 13, fontWeight: '700', color: '#6A1B9A' },
  deleteBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#EF9A9A',
  },
  deleteBtnTxt: { fontSize: 13, fontWeight: '700', color: '#C62828' },

  reviewForm: {
    backgroundColor: '#F9F5FF', borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#EDE7F6', marginBottom: 16,
  },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#333333', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E8E8',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1B1B1B',
  },
  multiInput: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  inputErr: { borderColor: '#E53935', backgroundColor: '#FFF5F5' },
  errTxt: { color: '#E53935', fontSize: 12, marginTop: 4, fontWeight: '500' },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelReviewBtn: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  cancelReviewBtnTxt: { fontSize: 14, fontWeight: '600', color: '#555555' },
  postReviewBtn: {
    flex: 2, backgroundColor: '#6A1B9A', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    shadowColor: '#6A1B9A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.38, shadowRadius: 10, elevation: 7,
  },
  postReviewBtnTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  allReviews: { marginTop: 8 },
  allReviewsTitle: { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 12 },
  reviewItem: { backgroundColor: '#FAFAFA', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  reviewerName: { fontSize: 12, color: '#9E9E9E', fontWeight: '600' },
  roleBadge: { backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#6A1B9A' },
  reviewItemTitle: { fontSize: 14, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  reviewItemDetail: { fontSize: 13, color: '#555555', lineHeight: 20 },
  viewAllBtn: {
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EDE7F6', borderRadius: 12, backgroundColor: '#F9F5FF',
  },
  viewAllBtnTxt: { fontSize: 14, fontWeight: '700', color: '#6A1B9A' },

  chatBubbles: {
    backgroundColor: '#F8F0FF', borderRadius: 18, padding: 14, marginBottom: 12,
    minHeight: 80, borderWidth: 1, borderColor: '#EDE7F6',
  },
  noChatTxt: { color: '#9E9E9E', fontSize: 13, textAlign: 'center', marginVertical: 20 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRight: { justifyContent: 'flex-end' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 10, elevation: 1 },
  bubbleMine: { backgroundColor: '#6A1B9A', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 14, lineHeight: 20 },
  bubbleTxtMine: { color: '#FFFFFF' },
  bubbleTxtTheirs: { color: '#1B1B1B' },
  bubbleImg: { width: 180, height: 130, borderRadius: 10, resizeMode: 'cover' },
  bubbleTime: { fontSize: 10, color: '#9E9E9E', marginTop: 3 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFFFF',
    borderRadius: 18, borderWidth: 1.5, borderColor: '#EDE7F6',
    paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  imgBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center' },
  imgBtnTxt: { fontSize: 20, color: '#6A1B9A', fontWeight: '700', lineHeight: 24 },
  chatInput: { flex: 1, fontSize: 14, color: '#1B1B1B', maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6A1B9A', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#CE93D8' },
  sendBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right' },

  seeProfileLink: {
    fontSize: 13, color: '#1565C0', fontWeight: '700',
    textDecorationLine: 'underline', marginBottom: 2,
  },

  profileModal: { flex: 1, backgroundColor: '#F8F9FA' },
  profileModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 24) + 8, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  profileModalBack: { padding: 6, minWidth: 70 },
  profileModalBackText: { fontSize: 15, color: '#6A1B9A', fontWeight: '700' },
  profileModalTitle: { fontSize: 17, fontWeight: '800', color: '#1B1B1B' },
  profileModalScroll: { padding: 16, paddingBottom: 50, flexGrow: 1 },
  profileModalAvatarSection: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  profileModalAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#2E7D32', marginBottom: 12 },
  profileModalAvatarPH: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  profileModalAvatarInit: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  profileModalName: { fontSize: 22, fontWeight: '800', color: '#1B1B1B', marginBottom: 4 },
  profileModalRatingCount: { fontSize: 13, color: '#9E9E9E', fontWeight: '500', marginTop: 4, marginBottom: 6 },
  profileModalSeeReviews: { fontSize: 13, color: '#1565C0', fontWeight: '700', textDecorationLine: 'underline', marginBottom: 12 },
  profileModalRolePill: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  profileModalRolePillText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
  profileModalInfoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  profileModalInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  profileModalInfoIcon: { fontSize: 20, marginTop: 2 },
  profileModalInfoLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  profileModalInfoValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },

  reviewModalItem: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3,
  },
});

export default InvestorPostDetailScreen;
