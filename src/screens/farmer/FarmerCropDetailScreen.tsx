import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Platform, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import ImageViewer from '../../components/ImageViewer';

const FarmerCropDetailScreen = ({ route, navigation }: any) => {
  const { postId } = route.params;
  const { cropPosts, users } = useApp();
  const { t, isUrdu } = useLanguage();

  const post = cropPosts.find((p: any) => p.id === postId);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ── Back handler: ImageViewer → close it; otherwise go back to History ──
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
    setViewerImages(imgs);
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });

  if (!post) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>{'<'} Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🌾 Crop Details</Text>
          <View style={{ width: 70 }} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Post not found.</Text>
        </View>
      </View>
    );
  }

  const winner = (() => {
    const activeBids = post.bids?.filter((b: any) => !b.cancelled) || [];
    if (!activeBids.length) return null;
    return activeBids.reduce((max: any, b: any) => b.amount > max.amount ? b : max, activeBids[0]);
  })();
  const winnerUser = winner ? users.find((u: any) => u.id === winner.bidderId) : null;

  const rows = [
    { icon: '📝', label: 'Description', value: post.description },
    { icon: '💰', label: 'Base Price', value: `PKR ${post.basePrice}` },
    { icon: '🏙️', label: 'City', value: post.city },
    { icon: '📍', label: 'Address', value: post.address },
    {
      icon: '⏱️', label: 'Bid Duration',
      value: `${post.bidEndDay ? post.bidEndDay + 'd ' : ''}${post.bidEndHour ? post.bidEndHour + 'h ' : ''}${post.bidEndMinute ? post.bidEndMinute + 'm' : ''}`.trim() || '—',
    },
    { icon: '📅', label: 'Posted On', value: formatDate(post.createdAt) },
    {
      icon: '🏷️', label: 'Status', value: post.status,
      color: post.status === 'Active' ? '#2E7D32' : post.status === 'SoldOut' ? '#C62828' : '#F57F17',
    },
    {
      icon: '📊', label: 'Total Bids',
      value: String(post.bids?.filter((b: any) => !b.cancelled).length || 0),
    },
  ];

  return (
    <View style={styles.container}>
      {/* Fixed header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>{'<'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>🌾 Crop Details</Text>
        <View style={{ width: 70 }} />
      </View>

      <ImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Scrollable content — plain View+ScrollView, no Modal, no transform issues */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image gallery */}
        {post.images && post.images.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imageRow}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            {post.images.map((uri: string, i: number) => (
              <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => openImageViewer(post.images, i)}>
                <Image source={{ uri }} style={styles.galleryImage} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Title */}
        <Text selectable style={[styles.postTitle, isUrdu && styles.rtl]}>{post.cropTitle}</Text>

        {/* Detail rows */}
        {rows.map((row, idx) => (
          <View key={idx} style={styles.detailRow}>
            <Text style={styles.detailIcon}>{row.icon}</Text>
            <View style={styles.detailContent}>
              <Text selectable style={styles.detailLabel}>{row.label}</Text>
              <Text selectable style={[styles.detailValue, (row as any).color ? { color: (row as any).color } : {}]}>
                {row.value}
              </Text>
            </View>
          </View>
        ))}

        {/* Winner section */}
        {winner && winnerUser && (
          <View style={styles.winnerCard}>
            <Text style={styles.winnerCardTitle}>🏆 Auction Winner</Text>
            <View style={styles.winnerRow}>
              {winnerUser.profilePic ? (
                <Image source={{ uri: winnerUser.profilePic }} style={styles.winnerAvatar} />
              ) : (
                <View style={styles.winnerAvatarPH}>
                  <Text style={styles.winnerAvatarInit}>
                    {winnerUser.firstName[0]}{winnerUser.lastName[0]}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text selectable style={styles.winnerName}>{winnerUser.firstName} {winnerUser.lastName}</Text>
                <Text selectable style={styles.winnerBid}>Winning Bid: PKR {winner.amount.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 4,
  },
  backBtn: { padding: 4, minWidth: 70 },
  backTxt: { fontSize: 15, color: '#2E7D32', fontWeight: '700' },
  headerTitle: {
    flex: 1, fontSize: 16, fontWeight: '800',
    color: '#1B1B1B', textAlign: 'center', marginHorizontal: 10,
  },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#9E9E9E' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 30 },
  imageRow: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  galleryImage: { width: 200, height: 140, borderRadius: 14, marginRight: 10, resizeMode: 'cover' },
  postTitle: { fontSize: 20, fontWeight: '800', color: '#1B1B1B', margin: 16, marginBottom: 8 },
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF', marginHorizontal: 14, marginBottom: 8,
    borderRadius: 14, padding: 14, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  detailIcon: { fontSize: 20, marginTop: 2 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#9E9E9E', fontWeight: '600', marginBottom: 3 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1B1B1B', lineHeight: 22 },
  winnerCard: {
    backgroundColor: '#F1F8E9', borderRadius: 16, margin: 14,
    padding: 16, borderWidth: 1.5, borderColor: '#A5D6A7',
  },
  winnerCardTitle: { fontSize: 15, fontWeight: '800', color: '#2E7D32', marginBottom: 12 },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  winnerAvatar: { width: 48, height: 48, borderRadius: 24 },
  winnerAvatarPH: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center',
  },
  winnerAvatarInit: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  winnerName: { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  winnerBid: { fontSize: 13, color: '#2E7D32', fontWeight: '600', marginTop: 2 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});

export default FarmerCropDetailScreen;
