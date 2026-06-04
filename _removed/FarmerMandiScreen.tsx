/**
 * FarmerMandiScreen.tsx — Live Mandi Prices
 *
 * Changes in this version:
 *  1. Nearest Mandi card → tappable → opens Google Maps at mandi's real GPS location.
 *     If user GPS is off → shows "Please turn on your live location" message.
 *  2. Crop chips removed → replaced with a full search bar supporting ALL Pakistani
 *     crops & fruits (60+ items). User types any name → results shown instantly.
 *  3. Mandi cards → removed "View Distance & Profit" expand section → replaced with
 *     "📍 View on Map" button that opens Google Maps at that mandi's live location.
 *  4. Price Trend tab → province-based: select a province → see all mandis in that
 *     province on a beautiful line chart. Days selector: 7 / 14 / 30 days.
 *  5. Graph completely redesigned: proper line chart with gridlines, dot markers,
 *     price labels, scrollable, easy to understand at a glance.
 *  6. Comparison section: Today vs N-day average (not just yesterday).
 *
 * DATA SOURCE: WFP (World Food Programme) — Real Pakistan Market Prices
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  TextInput,
  Modal,
  PermissionsAndroid,
  RefreshControl,
  Linking,
  FlatList,
  BackHandler,
} from 'react-native';
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FarmerHeader from '../../components/FarmerHeader';
import { useLanguage } from '../../context/LanguageContext';
import {
  fetchMandiPrices,
  getMandiRecommendation,
  generatePriceHistory,
  generateProvincePriceHistory,
  searchCrops,
  ALL_CROPS,
  CropEntry,
  MandiResult,
  PriceHistory,
} from '../../services/MandiService';

const { width, height: screenHeight } = Dimensions.get('window');

// ─── Chart dimension constants ───
const CHART_H          = 200;
const CHART_PAD_LEFT   = 58;
const CHART_PAD_BOTTOM = 36;
const CHART_PAD_TOP    = 18;
const CHART_PAD_RIGHT  = 12;

const ALERTS_KEY = 'mandi_alerts_v2';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AlertSetting {
  cropKey: string;
  thresholdPrice: number;
  enabled: boolean;
  createdAt: string;
}

type ActiveTab = 'list' | 'trend';
type ProvinceFilter = 'All' | 'Punjab' | 'Sindh' | 'KPK' | 'Balochistan';

const PROVINCES: ProvinceFilter[] = ['All', 'Punjab', 'Sindh', 'KPK', 'Balochistan'];

const MANDI_COLORS = [
  '#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#C62828',
  '#00838F', '#558B2F', '#AD1457', '#4527A0', '#00695C',
];

// ─────────────────────────────────────────────
// Open Google Maps
// ─────────────────────────────────────────────

function openMapsAt(lat: number, lng: number, label: string) {
  const query = encodeURIComponent(label);
  const url = Platform.OS === 'ios'
    ? `maps://?q=${query}`
    : `geo:${lat},${lng}?q=${query}`;
  Linking.canOpenURL(url)
    .then(can => {
      if (can) return Linking.openURL(url);
      return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    })
    .catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    });
}

// ─────────────────────────────────────────────
// Types for chart
// ─────────────────────────────────────────────

interface MandiHistory {
  mandiName: string;
  city: string;
  history: PriceHistory[];
}

// ─────────────────────────────────────────────
// FullscreenChartModal
// ─────────────────────────────────────────────

const FullscreenChartModal = React.memo(({ visible, onClose, data, days, isUrdu }: {
  visible: boolean;
  onClose: () => void;
  data: MandiHistory[];
  days: number;
  isUrdu?: boolean;
}) => {
  const lsWidth  = screenHeight;
  const lsHeight = width;

  const baseScale   = useRef(new Animated.Value(1)).current;
  const pinchScale  = useRef(new Animated.Value(1)).current;
  const lastScale   = useRef(1);
  const combinedScale = Animated.multiply(baseScale, pinchScale);

  const translateX     = useRef(new Animated.Value(0)).current;
  const lastTranslateX = useRef(0);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= nativeEvent.scale;
      if (lastScale.current < 0.5) lastScale.current = 0.5;
      if (lastScale.current > 6)   lastScale.current = 6;
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState === State.ACTIVE) {
      lastTranslateX.current += nativeEvent.translationX;
      translateX.setOffset(lastTranslateX.current);
      translateX.setValue(0);
    }
  };

  const resetTransform = () => {
    lastScale.current = 1;
    lastTranslateX.current = 0;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    translateX.setOffset(0);
    translateX.setValue(0);
  };

  const handleClose = () => { resetTransform(); onClose(); };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={fsc.overlay}>
          <View style={[
            fsc.rotatedWrap,
            {
              width: lsWidth,
              height: lsHeight,
              transform: [{ rotate: '90deg' }],
            },
          ]}>
            <View style={[fsc.topBar, { width: lsWidth }]}>
              <TouchableOpacity onPress={resetTransform} style={fsc.resetBtn} activeOpacity={0.75}>
                <Text style={fsc.resetText}>{isUrdu ? '↺ ری سیٹ' : '↺ Reset'}</Text>
              </TouchableOpacity>
              <Text style={fsc.topTitle}>{isUrdu ? 'قیمت رجحان' : 'Price Trend'}</Text>
              <TouchableOpacity onPress={handleClose} style={fsc.closeBtn} activeOpacity={0.75}>
                <Text style={fsc.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <PanGestureHandler
              onGestureEvent={onPanEvent}
              onHandlerStateChange={onPanStateChange}
              avgTouches>
              <Animated.View style={{ flex: 1 }}>
                <PinchGestureHandler
                  onGestureEvent={onPinchEvent}
                  onHandlerStateChange={onPinchStateChange}>
                  <Animated.View
                    style={[
                      fsc.chartWrap,
                      { width: lsWidth, height: lsHeight - 52 },
                      {
                        transform: [
                          { scaleX: combinedScale },
                          { translateX },
                        ],
                      },
                    ]}>
                    <ProvinceChart
                      data={data}
                      days={days}
                      isUrdu={isUrdu}
                      chartWidth={lsWidth - 80}
                    />
                  </Animated.View>
                </PinchGestureHandler>
              </Animated.View>
            </PanGestureHandler>

            <Text style={fsc.hint}>
              {isUrdu
                ? '🤏 زوم کے لیے دو انگلیاں • ↔ بائیں دائیں گھسیٹیں'
                : '🤏 Pinch to zoom  •  ↔ Drag to pan left / right'}
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const fsc = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  rotatedWrap: { backgroundColor: '#111827', justifyContent: 'flex-start', alignItems: 'center', overflow: 'hidden' },
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1F2937' },
  topTitle:    { fontSize: 14, fontWeight: '800', color: '#FFFFFF', flex: 1, textAlign: 'center' },
  resetBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#374151', borderRadius: 8 },
  resetText:   { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center' },
  closeText:   { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  chartWrap:   { backgroundColor: '#1A2433', padding: 8, justifyContent: 'center' },
  hint:        { fontSize: 11, color: '#6B7280', paddingVertical: 6, textAlign: 'center', fontWeight: '600' },
});

// ─────────────────────────────────────────────
// ProvinceChart
// ─────────────────────────────────────────────

const ProvinceChart = React.memo(({ isUrdu,
data,
days,
chartWidth,
  selectedCity,
onCitySelect,
}: {
isUrdu?: boolean;
data: MandiHistory[];
  days: number;
  chartWidth?: number;
  selectedCity?: string | null;
  onCitySelect?: (city: string) => void;
}) => {
  if (!data.length) return null;

  const drawW = (chartWidth ?? (width - 40)) - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const drawH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  const dateLabels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateLabels.push(d.toISOString().split('T')[0]);
  }

  let gMin = Infinity, gMax = 0;
  data.forEach(m =>
    m.history.forEach(h => {
      if (h.avgPrice < gMin) gMin = h.avgPrice;
      if (h.avgPrice > gMax) gMax = h.avgPrice;
    }),
  );
  const pad = ((gMax - gMin) || 1000) * 0.12;
  gMin = Math.max(0, gMin - pad);
  gMax = gMax + pad;
  const range = gMax - gMin || 1;

  const toY = (price: number) =>
    CHART_PAD_TOP + drawH - Math.round(((price - gMin) / range) * drawH);
  const toX = (idx: number) =>
    Math.round((idx / Math.max(dateLabels.length - 1, 1)) * drawW);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => gMin + t * range);

  const maxXLabels = days <= 7 ? 7 : 5;
  const xStep = Math.ceil(dateLabels.length / maxXLabels);

  const allLines = data.slice(0, 6);
  const lines = selectedCity ? allLines.filter(m => m.city === selectedCity) : allLines;

  const SCROLL_RIGHT_PAD = 50;
  const scrollW = Math.max(drawW, dateLabels.length * 32) + SCROLL_RIGHT_PAD;

  return (
    <View style={pc.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pc.legend}>
        {allLines.map((m, i) => {
          const isActive = !selectedCity || selectedCity === m.city;
          return (
            <TouchableOpacity
              key={m.mandiName}
              style={[pc.legendItem, !isActive && pc.legendItemFaded]}
              onPress={() => onCitySelect && onCitySelect(m.city)}
              activeOpacity={0.7}>
              <View style={[pc.legendDot, { backgroundColor: MANDI_COLORS[i % MANDI_COLORS.length], opacity: isActive ? 1 : 0.3 }]} />
              <Text style={[pc.legendLabel, !isActive && pc.legendLabelFaded]} numberOfLines={1}>{m.city}</Text>
              {selectedCity === m.city && <Text style={pc.legendCheckmark}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[pc.yAxis, { height: CHART_H }]}>
          {yTicks.slice().reverse().map((val, i) => {
            const top = CHART_PAD_TOP + (i / (yTicks.length - 1)) * drawH - 7;
            const label = val >= 1000
              ? `${(val / 1000).toFixed(1)}k`
              : Math.round(val).toString();
            return (
              <View key={i} style={[pc.yTickRow, { top }]}>
                <Text style={pc.yTickText}>{label}</Text>
              </View>
            );
          })}
          <Text style={pc.yUnit}>PKR</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={{ flex: 1 }}>
          <View style={{ width: scrollW, height: CHART_H }}>

            {yTicks.map((val, i) => (
              <View key={i} style={[pc.gridLine, { top: toY(val) }]} />
            ))}

            {lines.map((m, mi) => {
              const color = MANDI_COLORS[mi % MANDI_COLORS.length];
              const pts = dateLabels
                .map((date, di) => {
                  const pt = m.history.find(h => h.date === date);
                  return pt ? { x: toX(di), y: toY(pt.avgPrice), price: pt.avgPrice, di } : null;
                })
                .filter(Boolean) as { x: number; y: number; price: number; di: number }[];

              return (
                <View key={m.mandiName} style={StyleSheet.absoluteFill} pointerEvents="none">
                  {pts.map((pt, pi) => {
                    if (pi === pts.length - 1) return null;
                    const next = pts[pi + 1];
                    const dx = next.x - pt.x;
                    const dy = next.y - pt.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                    return (
                      <View
                        key={`seg-${pi}`}
                        style={[
                          pc.segment,
                          {
                            left: pt.x,
                            top: pt.y - 1,
                            width: len,
                            borderColor: color,
                            opacity: 0.9,
                            transform: [{ rotate: `${angle}deg` }],
                          },
                        ]}
                      />
                    );
                  })}

                  {pts.map((pt, pi) => {
                    const isToday = pi === pts.length - 1;
                    const r = isToday ? 6 : 4;
                    return (
                      <View
                        key={`dot-${pi}`}
                        style={[
                          pc.dot,
                          {
                            left: pt.x - r,
                            top: pt.y - r,
                            width: r * 2,
                            height: r * 2,
                            borderRadius: r,
                            backgroundColor: isToday ? color : color + 'BB',
                            borderWidth: isToday ? 2 : 1.5,
                            borderColor: '#FFFFFF',
                          },
                        ]}
                      />
                    );
                  })}

                  {pts.length > 0 && (() => {
                    const last = pts[pts.length - 1];
                    const lbl = last.price >= 1000
                      ? `${(last.price / 1000).toFixed(1)}k`
                      : Math.round(last.price).toString();
                    const bubbleLeft = Math.max(0, last.x - 18);
                    return (
                      <View
                        style={[
                          pc.priceBubble,
                          {
                            left: bubbleLeft,
                            top: last.y - 22,
                            backgroundColor: color,
                          },
                        ]}>
                        <Text style={pc.priceBubbleText}>{lbl}</Text>
                      </View>
                    );
                  })()}
                </View>
              );
            })}

            <View style={[pc.xAxis, { top: CHART_PAD_TOP + drawH }]} />

            {dateLabels.map((date, di) => {
              const isToday = di === dateLabels.length - 1;
              const isSecondToLast = di === dateLabels.length - 2;
              const tooCloseToToday = isSecondToLast && (dateLabels.length - 1 - di) < xStep;
              const show = (di % xStep === 0 || isToday) && !tooCloseToToday;
              if (!show) return null;
              const x = toX(di);
              return (
                <View
                  key={date}
                  style={[
                    pc.xTickWrap,
                    { left: x - 18, top: CHART_PAD_TOP + drawH + 6 },
                  ]}>
                  <Text
                    style={[
                      pc.xTickText,
                      isToday && { color: '#2E7D32', fontWeight: '800' },
                    ]}>
                    {isToday ? (isUrdu ? 'آج' : 'Today') : date.slice(5)}
                  </Text>
                </View>
              );
            })}

          </View>
        </ScrollView>
      </View>

      <Text style={pc.hint}>{isUrdu ? '← تمام تاریخیں دیکھنے کے لیے سکرول کریں  •  قیمتیں PKR فی من' : '← Scroll to explore all dates  •  Prices in PKR per maan'}</Text>
    </View>
  );
});

const pc = StyleSheet.create({
  wrap:            { marginTop: 8, marginBottom: 4 },
  legend:          { marginBottom: 10 },
  legendItem:      { flexDirection: 'row', alignItems: 'center', marginRight: 14, gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'transparent' },
  legendItemFaded: { opacity: 0.45 },
  legendDot:       { width: 10, height: 10, borderRadius: 5 },
  legendLabel:     { fontSize: 11, color: '#333333', fontWeight: '700', maxWidth: 90 },
  legendLabelFaded:{ color: '#AAAAAA' },
  legendCheckmark: { fontSize: 10, color: '#2E7D32', fontWeight: '900', marginLeft: 2 },
  yAxis:           { width: CHART_PAD_LEFT, position: 'relative' },
  yTickRow:        { position: 'absolute', right: 6, alignItems: 'flex-end' },
  yTickText:       { fontSize: 10, color: '#777777', fontWeight: '600' },
  yUnit:           { position: 'absolute', left: 2, top: CHART_PAD_TOP + 2, fontSize: 8, color: '#AAAAAA', fontWeight: '700' },
  gridLine:        { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#EEEEEE' },
  segment:         { position: 'absolute', height: 2, borderTopWidth: 2, transformOrigin: 'left center' },
  dot:             { position: 'absolute' },
  priceBubble:     { position: 'absolute', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, zIndex: 10 },
  priceBubbleText: { fontSize: 9, color: '#FFFFFF', fontWeight: '800' },
  xAxis:           { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: '#CCCCCC' },
  xTickWrap:       { position: 'absolute', width: 44, alignItems: 'center' },
  xTickText:       { fontSize: 9, color: '#999999', fontWeight: '600' },
  hint:            { fontSize: 10, color: '#BDBDBD', textAlign: 'center', marginTop: 8, fontWeight: '500' },
});

// ─────────────────────────────────────────────
// TrendBadge
// ─────────────────────────────────────────────

const TrendBadge = React.memo(({ direction, percent }: { direction: 'rising' | 'falling' | 'stable'; percent: number }) => {
  const cfg = {
    rising:  { icon: '↑', color: '#2E7D32', bg: '#E8F5E9', text: `+${percent.toFixed(1)}%` },
    falling: { icon: '↓', color: '#C62828', bg: '#FFEBEE', text: `-${percent.toFixed(1)}%` },
    stable:  { icon: '→', color: '#E65100', bg: '#FFF3E0', text: `~${percent.toFixed(1)}%` },
  }[direction];
  return (
    <View style={[tbStyles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[tbStyles.text, { color: cfg.color }]}>{cfg.icon} {cfg.text}</Text>
    </View>
  );
});
const tbStyles = StyleSheet.create({
  pill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: '800' },
});

// ─────────────────────────────────────────────
// AdviceBanner
// ─────────────────────────────────────────────

const AdviceBanner = React.memo(({ advice, reason, reasonUr, isUrdu }: {
  advice: 'sell_now' | 'wait' | 'monitor'; reason: string; reasonUr: string; isUrdu: boolean;
}) => {
  const cfg = {
    sell_now: { icon: '💰', label: 'Sell Now!', labelUr: 'ابھی بیچیں!', bg: '#E8F5E9', border: '#2E7D32', color: '#1B5E20' },
    wait:     { icon: '⏳', label: 'Wait',       labelUr: 'انتظار کریں', bg: '#E3F2FD', border: '#1565C0', color: '#0D47A1' },
    monitor:  { icon: '👁️', label: 'Monitor',    labelUr: 'نگرانی کریں', bg: '#FFF8E1', border: '#F57F17', color: '#E65100' },
  }[advice];
  return (
    <View style={[abStyles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={abStyles.icon}>{cfg.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[abStyles.label, { color: cfg.color }]}>{isUrdu ? cfg.labelUr : cfg.label}</Text>
        <Text style={[abStyles.reason, { color: cfg.color + 'CC', textAlign: isUrdu ? 'right' : 'left' }]}>
          {isUrdu ? reasonUr : reason}
        </Text>
      </View>
    </View>
  );
});
const abStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 12, marginBottom: 16 },
  icon:   { fontSize: 26 },
  label:  { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  reason: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
});

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────

const FarmerMandiScreen = ({ navigation }: any) => {
  const { isUrdu, t } = useLanguage();

  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedCrop, setSelectedCrop]       = useState<CropEntry>(ALL_CROPS[0]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchResults = useMemo(() => searchCrops(searchQuery), [searchQuery]);

  const [loading, setLoading]               = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [prices, setPrices]                 = useState<MandiResult[]>([]);
  const [recommendation, setRecommendation] = useState<ReturnType<typeof getMandiRecommendation> | null>(null);
  const [lastSync, setLastSync]             = useState('');
  const [fromCache, setFromCache]           = useState(false);

  const [userLat, setUserLat]               = useState(28.4212);
  const [userLng, setUserLng]               = useState(70.2989);
  const [locationReady, setLocationReady]   = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  const [activeTab, setActiveTab]           = useState<ActiveTab>('list');
  const [provinceFilter, setProvinceFilter] = useState<ProvinceFilter>('All');
  const [trendProvince, setTrendProvince]   = useState<ProvinceFilter>('Punjab');
  const [trendDays, setTrendDays]           = useState(14);

  const [selectedChartCity, setSelectedChartCity] = useState<string | null>(null);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState('');
  const [alerts, setAlerts]                 = useState<AlertSetting[]>([]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const alertsRef = useRef<AlertSetting[]>([]);
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);

  useEffect(() => {
    const first = generateProvincePriceHistory(selectedCrop.key, trendProvince, trendDays);
    if (first.length > 0) {
      setSelectedChartCity(first[0].city);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendProvince, selectedCrop]);

  const provinceTrendData = useMemo(
    () => generateProvincePriceHistory(selectedCrop.key, trendProvince, trendDays),
    [selectedCrop, trendProvince, trendDays],
  );

  const bestMandiHistory = useMemo(() => {
    if (!recommendation?.bestProfitMandi) return [];
    return generatePriceHistory(selectedCrop.key, recommendation.bestProfitMandi.mandiName);
  }, [recommendation, selectedCrop]);

  useEffect(() => {
    AsyncStorage.getItem(ALERTS_KEY)
      .then(raw => { if (raw) setAlerts(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (res !== PermissionsAndroid.RESULTS.GRANTED) {
            if (!cancelled) { setLocationReady(true); setLocationGranted(false); }
            return;
          }
        }
        if (!cancelled) setLocationGranted(true);
        Geolocation.getCurrentPosition(
          pos => {
            if (!cancelled) {
              setUserLat(pos.coords.latitude);
              setUserLng(pos.coords.longitude);
              setLocationReady(true);
            }
          },
          () => { if (!cancelled) setLocationReady(true); },
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
        );
      } catch { if (!cancelled) setLocationReady(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (locationReady) { fadeAnim.setValue(0); loadPrices(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady, selectedCrop]);

  const loadPrices = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const { prices: p, fromCache: fc, lastSync: ls } = await fetchMandiPrices(selectedCrop.key, userLat, userLng, force);
      setPrices(p);
      setFromCache(fc);
      setLastSync(ls);
      const rec = getMandiRecommendation(p, selectedCrop.key);
      setRecommendation(rec);
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      const al = alertsRef.current.find(a => a.cropKey === selectedCrop.key && a.enabled);
      if (al) {
        const top = Math.max(...p.map(r => r.avgPrice));
        if (top >= al.thresholdPrice) {
          Alert.alert('🔔 Price Alert!', `${selectedCrop.label} reached PKR ${top.toLocaleString()} — alert was set at PKR ${al.thresholdPrice.toLocaleString()}.`);
        }
      }
    } catch {
      Alert.alert(
        isUrdu ? 'ڈیٹا نہیں ملا' : 'Data Unavailable',
        isUrdu
          ? 'WFP سرور سے ڈیٹا نہیں مل سکا۔ براہ کرم انٹرنیٹ کنکشن چیک کریں اور دوبارہ کوشش کریں۔'
          : 'Could not fetch prices from WFP server. Please check your internet connection and try again.',
      );
    } finally { setLoading(false); setRefreshing(false); }
  }, [selectedCrop, userLat, userLng, isUrdu, fadeAnim]);

  const onRefresh = useCallback(() => { setRefreshing(true); fadeAnim.setValue(0); loadPrices(true); }, [loadPrices, fadeAnim]);

  const selectCrop = (crop: CropEntry) => {
    setSelectedCrop(crop);
    setSearchQuery(crop.label);
    setShowSuggestions(false);
    setProvinceFilter('All');
    fadeAnim.setValue(0);
  };

  const openNearestMandi = () => {
    if (!locationGranted) {
      Alert.alert(
        isUrdu ? '📍 لائیو لوکیشن بند ہے' : '📍 Live Location Required',
        isUrdu
          ? 'براہ کرم اپنی لائیو لوکیشن آن کریں تاکہ قریب ترین منڈی دیکھ سکیں۔'
          : 'Please turn on your live location to view the nearest mandi on the map.',
        [
          { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
          { text: isUrdu ? 'سیٹنگز کھولیں' : 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    if (!recommendation?.nearestMandi) return;
    const m = recommendation.nearestMandi;
    openMapsAt(m.latitude, m.longitude, m.mandiName);
  };

  const saveAlert = async () => {
    const threshold = parseInt(alertThreshold, 10);
    if (!threshold || threshold < 100) {
      Alert.alert(isUrdu ? 'غلط قیمت' : 'Invalid', isUrdu ? 'کم از کم PKR 100 درج کریں' : 'Enter a valid price (min PKR 100)');
      return;
    }
    const newAlert: AlertSetting = { cropKey: selectedCrop.key, thresholdPrice: threshold, enabled: true, createdAt: new Date().toISOString().split('T')[0] };
    const updated = [...alerts.filter(a => a.cropKey !== selectedCrop.key), newAlert];
    setAlerts(updated);
    try { await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(updated)); } catch {}
    setAlertModalVisible(false);
    setAlertThreshold('');
    Alert.alert('✅', `Alert set for PKR ${threshold.toLocaleString()}`);
  };

  const removeAlert = async () => {
    const updated = alerts.filter(a => a.cropKey !== selectedCrop.key);
    setAlerts(updated);
    try { await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(updated)); } catch {}
    setAlertModalVisible(false);
    setAlertThreshold('');
  };

  const currentAlert   = useMemo(() => alerts.find(a => a.cropKey === selectedCrop.key), [alerts, selectedCrop]);
  const filteredPrices = useMemo(() => provinceFilter === 'All' ? prices : prices.filter(p => p.province === provinceFilter), [prices, provinceFilter]);
  const formatPKR      = (n: number) => `PKR ${Math.round(n).toLocaleString()}`;

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (alertModalVisible) { setAlertModalVisible(false); setAlertThreshold(''); return true; }
        navigation.openDrawer();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [alertModalVisible, navigation])
  );

  return (
    <View style={s.root}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <FarmerHeader
        title={isUrdu ? 'لائیو منڈی قیمتیں' : 'Live Mandi Prices'}
        navigation={navigation}
        rightComponent={
          <TouchableOpacity onPress={() => setAlertModalVisible(true)} style={s.alertBtn} activeOpacity={0.7}>
            <Text style={s.alertBtnIcon}>{currentAlert ? '🔔' : '🔕'}</Text>
          </TouchableOpacity>
        }
      />

      {/* ──── SEARCH BAR ──── */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder={isUrdu ? 'کوئی بھی فصل یا پھل تلاش کریں...' : 'Search any crop or fruit (e.g. wheat, mango, onion)...'}
            placeholderTextColor="#BDBDBD"
            value={searchQuery}
            onChangeText={q => { setSearchQuery(q); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            textAlign={isUrdu ? 'right' : 'left'}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setShowSuggestions(false); }} style={s.clearBtn}>
              <Text style={s.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.selectedCropPill}>
          <Text style={s.selectedCropEmoji}>{selectedCrop.emoji}</Text>
          <Text style={s.selectedCropLabel}>{isUrdu ? selectedCrop.labelUr : selectedCrop.label}</Text>
        </View>
      </View>

      {/* ──── SEARCH SUGGESTIONS DROPDOWN ──── */}
      {showSuggestions && searchResults.length > 0 && (
        <View style={s.dropdown}>
          <FlatList
            data={searchResults.slice(0, 12)}
            keyExtractor={item => item.key}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 260 }}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                style={[s.suggestionRow, item.key === selectedCrop.key && s.suggestionRowActive]}
                onPress={() => selectCrop(item)}
                activeOpacity={0.75}>
                <Text style={s.suggestionEmoji}>{item.emoji}</Text>
                <View style={s.suggestionInfo}>
                  <Text style={[s.suggestionLabel, item.key === selectedCrop.key && s.suggestionLabelActive]}>
                    {item.label}
                  </Text>
                  <Text style={s.suggestionUrdu}>{item.labelUr}</Text>
                </View>
                <View style={[s.categoryBadge, { backgroundColor: CATEGORY_COLORS[item.category] }]}>
                  <Text style={s.categoryBadgeText}>{item.category}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
          {searchResults.length > 12 && (
            <Text style={s.moreResults}>+{searchResults.length - 12} {isUrdu ? 'مزید نتائج' : 'more results'}</Text>
          )}
        </View>
      )}

      {/* ──── MAIN CONTENT ──── */}
      {loading && !refreshing ? (
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={s.loadText}>{isUrdu ? 'منڈی ڈیٹا لوڈ ہو رہا ہے...' : 'Fetching latest mandi prices from WFP...'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setShowSuggestions(false)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2E7D32']} tintColor="#2E7D32" />}>
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Sync row */}
            <View style={s.syncRow}>
              <View style={s.syncDot} />
              <Text style={s.syncText}>{fromCache ? 'Cached' : 'Live'} data • {lastSync}</Text>
              <TouchableOpacity onPress={onRefresh} style={s.refreshPill} activeOpacity={0.75}>
                <Text style={s.refreshPillText}>↻</Text>
              </TouchableOpacity>
            </View>

            {/* ── WFP Data Source Banner ── */}
            <View style={s.sourceBanner}>
              <Text style={s.sourceBannerText}>
                {isUrdu
                  ? '📡 ماخذ: WFP (عالمی غذائی پروگرام) — پاکستانی منڈیوں سے حقیقی ڈیٹا'
                  : '📡 Source: WFP (World Food Programme) — Real Pakistan Market Prices'}
              </Text>
            </View>

            {/* ── Summary cards ── */}
            {recommendation && (
              <View style={s.summaryCard}>
                <Text style={[s.summaryHeading, isUrdu && s.rtl]}>
                  {selectedCrop.emoji} {isUrdu ? `آج کی بہترین منڈی — ${selectedCrop.labelUr}` : `Best Mandi Today — ${selectedCrop.label}`}
                </Text>
                <View style={s.statsRow}>
                  {recommendation.bestPriceMandi && (
                    <View style={[s.statBox, { borderColor: '#2E7D32' }]}>
                      <Text style={s.statIcon}>🏆</Text>
                      <Text style={s.statTitle}>{isUrdu ? 'سب سے اعلیٰ' : 'Highest'}</Text>
                      <Text style={[s.statValue, { color: '#2E7D32' }]}>{formatPKR(recommendation.bestPriceMandi.avgPrice)}</Text>
                      <Text style={s.statSub} numberOfLines={1}>{recommendation.bestPriceMandi.city}</Text>
                    </View>
                  )}
                  {recommendation.nearestMandi && (
                    <TouchableOpacity
                      style={[s.statBox, { borderColor: '#1565C0' }]}
                      onPress={openNearestMandi}
                      activeOpacity={0.8}>
                      <Text style={s.statIcon}>📍</Text>
                      <Text style={s.statTitle}>{isUrdu ? 'قریب ترین' : 'Nearest'}</Text>
                      <Text style={[s.statValue, { color: '#1565C0' }]}>{recommendation.nearestMandi.distanceKm} km</Text>
                      <Text style={s.statSub} numberOfLines={1}>{recommendation.nearestMandi.city}</Text>
                      <Text style={[s.statSub, { marginTop: 2, fontSize: 9 }]} numberOfLines={1}>
                        {recommendation.nearestMandi.mandiName}
                      </Text>
                      <Text style={[s.statMapHint, { color: locationGranted ? '#1565C0' : '#9E9E9E' }]}>
                        {locationGranted ? '🗺️ Open Map' : '🔒 GPS Off'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {recommendation.bestProfitMandi && (
                    <View style={[s.statBox, { borderColor: '#E65100' }]}>
                      <Text style={s.statIcon}>💹</Text>
                      <Text style={s.statTitle}>{isUrdu ? 'خالص منافع' : 'Best Profit'}</Text>
                      <Text style={[s.statValue, { color: '#E65100' }]}>{formatPKR(recommendation.bestProfitMandi.netProfit)}</Text>
                      <Text style={s.statSub} numberOfLines={1}>{recommendation.bestProfitMandi.city}</Text>
                    </View>
                  )}
                </View>
                <AdviceBanner
                  advice={recommendation.trendAdvice}
                  reason={recommendation.trendAdviceReason}
                  reasonUr={recommendation.trendAdviceReasonUr}
                  isUrdu={isUrdu}
                />
              </View>
            )}

            {/* ── Tabs ── */}
            <View style={s.tabRow}>
              {(['list', 'trend'] as ActiveTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tabBtn, activeTab === tab && s.tabBtnOn]}
                  onPress={() => { setActiveTab(tab); setShowSuggestions(false); }}
                  activeOpacity={0.75}>
                  <Text style={[s.tabLabel, activeTab === tab && s.tabLabelOn]}>
                    {tab === 'list'
                      ? (isUrdu ? '📋 منڈی فہرست' : '📋 Mandi List')
                      : (isUrdu ? '📈 قیمت رجحان' : '📈 Price Trend')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ────────── TAB: PRICE TREND ────────── */}
            {activeTab === 'trend' && (
              <View style={s.trendCard}>
                <Text style={[s.trendHeading, isUrdu && s.rtl]}>
                  {isUrdu ? 'صوبائی قیمت رجحان' : 'Province-wise Price Trends'}
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['Punjab', 'Sindh', 'KPK', 'Balochistan'] as ProvinceFilter[]).map(prov => {
                      const provLabel: Record<string, string> = { Punjab: isUrdu ? 'پنجاب' : 'Punjab', Sindh: isUrdu ? 'سندھ' : 'Sindh', KPK: isUrdu ? 'خیبرپختونخواہ' : 'KPK', Balochistan: isUrdu ? 'بلوچستان' : 'Balochistan' };
                      return (
                        <TouchableOpacity
                          key={prov}
                          style={[s.trendProvChip, trendProvince === prov && s.trendProvChipOn]}
                          onPress={() => setTrendProvince(prov)}
                          activeOpacity={0.75}>
                          <Text style={[s.trendProvLabel, trendProvince === prov && s.trendProvLabelOn]}>{provLabel[prov]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                <View style={s.daysRow}>
                  {([7, 14, 30] as const).map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[s.dayBtn, trendDays === d && s.dayBtnOn]}
                      onPress={() => setTrendDays(d)}
                      activeOpacity={0.75}>
                      <Text style={[s.dayLabel, trendDays === d && s.dayLabelOn]}>
                        {isUrdu ? `${d} دن` : `${d} Days`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.chartContainer}>
                  <ProvinceChart
                    data={provinceTrendData}
                    days={trendDays}
                    isUrdu={isUrdu}
                    selectedCity={selectedChartCity}
                    onCitySelect={(city) => {
                      setSelectedChartCity(prev => prev === city ? null : city);
                    }}
                  />
                </View>

                <Text style={[s.trendSubHeading, isUrdu && s.rtl, { marginTop: 18 }]}>
                  {isUrdu
                    ? `آج بمقابلہ ${trendDays} دن کی اوسط — ہر منڈی`
                    : `Today vs ${trendDays}-Day Average — Each Mandi`}
                </Text>

                {provinceTrendData.slice(0, 8).map((m, i) => {
                  const today = m.history[m.history.length - 1];
                  if (!today) return null;
                  const periodSlice = m.history.slice(0, m.history.length - 1);
                  if (!periodSlice.length) return null;
                  const periodAvg = Math.round(
                    periodSlice.reduce((sum, h) => sum + h.avgPrice, 0) / periodSlice.length,
                  );
                  const diff  = today.avgPrice - periodAvg;
                  const pct   = ((diff / (periodAvg || 1)) * 100).toFixed(1);
                  const isUp  = diff >= 0;
                  const color = MANDI_COLORS[i % MANDI_COLORS.length];

                  return (
                    <View key={m.mandiName} style={s.mandiTrendRow}>
                      <View style={[s.mandiTrendDot, { backgroundColor: color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.mandiTrendName}>{m.city}</Text>
                        <Text style={s.mandiTrendSub}>
                          {isUrdu ? `${trendDays} دن اوسط` : `${trendDays}d avg`}: PKR {periodAvg.toLocaleString()}
                        </Text>
                      </View>
                      <View style={s.mandiTrendRight}>
                        <Text style={s.mandiTrendToday}>PKR {today.avgPrice.toLocaleString()}</Text>
                        <View style={[s.diffBadge, { backgroundColor: isUp ? '#E8F5E9' : '#FFEBEE' }]}>
                          <Text style={[s.diffText, { color: isUp ? '#2E7D32' : '#C62828' }]}>
                            {isUp ? '↑' : '↓'} {Math.abs(diff).toLocaleString()} ({pct}%)
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ────────── TAB: MANDI LIST ────────── */}
            {activeTab === 'list' && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
                  {PROVINCES.map(prov => {
                    const filterLabel: Record<string, string> = { All: isUrdu ? 'سب' : 'All', Punjab: isUrdu ? 'پنجاب' : 'Punjab', Sindh: isUrdu ? 'سندھ' : 'Sindh', KPK: isUrdu ? 'خیبرپختونخواہ' : 'KPK', Balochistan: isUrdu ? 'بلوچستان' : 'Balochistan' };
                    return (
                      <TouchableOpacity
                        key={prov}
                        style={[s.filterChip, provinceFilter === prov && s.filterChipOn]}
                        onPress={() => setProvinceFilter(prov)}
                        activeOpacity={0.75}>
                        <Text style={[s.filterLabel, provinceFilter === prov && s.filterLabelOn]}>
                          {filterLabel[prov]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={[s.countLabel, isUrdu && s.rtl]}>
                  {isUrdu ? `${filteredPrices.length} منڈیاں` : `${filteredPrices.length} mandis`}
                </Text>

                {filteredPrices.map((item, idx) => {
                  const isBestPrice  = recommendation?.bestPriceMandi?.id === item.id;
                  const isBestProfit = recommendation?.bestProfitMandi?.id === item.id;
                  const isNearest    = recommendation?.nearestMandi?.id === item.id;

                  return (
                    <View key={item.id} style={[s.mandiCard, isBestProfit && s.mandiCardStar]}>
                      <View style={s.mandiTop}>
                        <View style={[s.rankBubble, idx === 0 && s.rankGold]}>
                          <Text style={[s.rankText, idx === 0 && s.rankGoldText]}>#{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={s.nameTagRow}>
                            <Text style={s.mandiName} numberOfLines={1}>{item.mandiName}</Text>
                            {isBestProfit && <View style={[s.tag, { backgroundColor: '#2E7D32' }]}><Text style={s.tagText}>{isUrdu ? '✨ بہترین' : '✨ Best'}</Text></View>}
                            {isBestPrice && !isBestProfit && <View style={[s.tag, { backgroundColor: '#E65100' }]}><Text style={s.tagText}>{isUrdu ? '🏆 اعلیٰ' : '🏆 Top'}</Text></View>}
                            {isNearest && <View style={[s.tag, { backgroundColor: '#1565C0' }]}><Text style={s.tagText}>{isUrdu ? '📍 قریب' : '📍 Near'}</Text></View>}
                          </View>
                          <Text style={s.mandiMeta}>{item.city} • {item.province}</Text>
                        </View>
                        <TrendBadge direction={item.trendDirection} percent={item.trendPercent} />
                      </View>

                      <View style={s.priceRow}>
                        <View style={s.priceCell}>
                          <Text style={s.priceLbl}>{isUrdu ? 'کم' : 'Min'}</Text>
                          <Text style={[s.priceVal, { color: '#C62828' }]}>{formatPKR(item.minPrice)}</Text>
                        </View>
                        <View style={[s.priceCell, s.priceMid]}>
                          <Text style={s.priceLbl}>{isUrdu ? 'اوسط' : 'Avg'}</Text>
                          <Text style={[s.priceVal, { color: '#2E7D32', fontSize: 14 }]}>{formatPKR(item.avgPrice)}</Text>
                        </View>
                        <View style={s.priceCell}>
                          <Text style={s.priceLbl}>{isUrdu ? 'زیادہ' : 'Max'}</Text>
                          <Text style={[s.priceVal, { color: '#2E7D32' }]}>{formatPKR(item.maxPrice)}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={s.mapBtn}
                        onPress={() => openMapsAt(item.latitude, item.longitude, `${item.mandiName}, ${item.city}, Pakistan`)}
                        activeOpacity={0.8}>
                        <Text style={s.mapBtnText}>
                          📍 {isUrdu ? 'منڈی کی لوکیشن دیکھیں' : 'View Mandi Location on Map'}
                        </Text>
                      </TouchableOpacity>

                      <Text style={s.updatedLabel}>
                        {isUrdu ? `آخری اپڈیٹ: ${item.lastUpdated}` : `Updated: ${item.lastUpdated} • ${item.unit}`}
                      </Text>
                    </View>
                  );
                })}

                {filteredPrices.length === 0 && (
                  <View style={s.emptyWrap}>
                    <Text style={s.emptyIcon}>🌐</Text>
                    <Text style={s.emptyText}>
                      {isUrdu
                        ? 'اس فصل کا ڈیٹا WFP کے پاکستان ڈیٹا میں دستیاب نہیں\nبڑی فصلیں جیسے گندم، چاول، ٹماٹر، پیاز وغیرہ آزمائیں'
                        : 'WFP does not track this crop for Pakistan markets.\nTry staple crops like wheat, rice, tomato, onion, potato.'}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 50 }} />
          </Animated.View>
        </ScrollView>
      )}

      {/* ──── ALERT MODAL ──── */}
      <Modal visible={alertModalVisible} transparent animationType="slide" onRequestClose={() => setAlertModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={[s.modalTitle, isUrdu && s.rtl]}>
              {isUrdu
                ? `🔔 قیمت الرٹ — ${selectedCrop.emoji} ${selectedCrop.labelUr}`
                : `🔔 Price Alert — ${selectedCrop.emoji} ${selectedCrop.label}`}
            </Text>
            <Text style={[s.modalSub, isUrdu && s.rtl]}>
              {isUrdu ? 'جب قیمت اس حد سے اوپر جائے آپ کو اطلاع ملے گی' : 'Notify me when price exceeds:'}
            </Text>
            {currentAlert && (
              <View style={s.existingAlert}>
                <Text style={s.existingAlertText}>Active: PKR {currentAlert.thresholdPrice.toLocaleString()} ({currentAlert.createdAt})</Text>
                <TouchableOpacity onPress={removeAlert} style={s.removeBtn}>
                  <Text style={s.removeBtnText}>{isUrdu ? '🗑️ ہٹائیں' : '🗑️ Remove'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={s.alertInputRow}>
              <Text style={s.pkrTag}>PKR</Text>
              <TextInput
                style={s.alertInput}
                placeholder={isUrdu ? 'حد قیمت درج کریں' : 'Enter threshold price'}
                placeholderTextColor="#BDBDBD"
                keyboardType="numeric"
                value={alertThreshold}
                onChangeText={setAlertThreshold}
              />
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={saveAlert} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>{isUrdu ? '✅ الرٹ محفوظ کریں' : '✅ Save Alert'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setAlertModalVisible(false); setAlertThreshold(''); }} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>{isUrdu ? 'منسوخ' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────
// Category badge colours
// ─────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  grain: '#A5D6A7', vegetable: '#80CBC4', fruit: '#FFCC80',
  cash_crop: '#CE93D8', spice: '#FFAB91', pulse: '#80DEEA', oilseed: '#FFF59D',
};

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F8F9FA' },
  scroll:{ padding: 16, paddingBottom: 24 },
  rtl:   { textAlign: 'right', writingDirection: 'rtl' },

  alertBtn:     { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  alertBtnIcon: { fontSize: 22 },

  searchWrap:         { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  searchBox:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 12, gap: 8, borderWidth: 1.5, borderColor: '#E8E8E8' },
  searchIcon:         { fontSize: 16 },
  searchInput:        { flex: 1, paddingVertical: 12, fontSize: 14, color: '#1B1B1B', fontWeight: '500' },
  clearBtn:           { padding: 6 },
  clearBtnText:       { fontSize: 14, color: '#9E9E9E', fontWeight: '700' },
  selectedCropPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  selectedCropEmoji:  { fontSize: 16 },
  selectedCropLabel:  { fontSize: 13, fontWeight: '700', color: '#2E7D32' },

  dropdown:           { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 14, marginHorizontal: 14, marginTop: -2, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10 },
  suggestionRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 10 },
  suggestionRowActive:{ backgroundColor: '#F1F8E9' },
  suggestionEmoji:    { fontSize: 20 },
  suggestionInfo:     { flex: 1 },
  suggestionLabel:    { fontSize: 14, fontWeight: '700', color: '#1B1B1B' },
  suggestionLabelActive: { color: '#2E7D32' },
  suggestionUrdu:     { fontSize: 12, color: '#9E9E9E', fontWeight: '500', marginTop: 1 },
  categoryBadge:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadgeText:  { fontSize: 10, fontWeight: '700', color: '#333333' },
  moreResults:        { textAlign: 'center', fontSize: 12, color: '#9E9E9E', padding: 10, fontWeight: '600' },

  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadText: { fontSize: 14, color: '#9E9E9E', fontWeight: '500' },

  syncRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14, gap: 8 },
  syncDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E7D32' },
  syncText:       { flex: 1, fontSize: 11, color: '#2E7D32', fontWeight: '600' },
  refreshPill:    { backgroundColor: '#2E7D32', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  refreshPillText:{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  sourceBanner:     { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: '#A5D6A7' },
  sourceBannerText: { fontSize: 11, color: '#2E7D32', fontWeight: '600', textAlign: 'center' },

  summaryCard:   { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5 },
  summaryHeading:{ fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 14 },
  statsRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox:       { flex: 1, borderRadius: 14, borderWidth: 2, padding: 10, alignItems: 'center', backgroundColor: '#FAFAFA' },
  statIcon:      { fontSize: 20, marginBottom: 4 },
  statTitle:     { fontSize: 10, fontWeight: '700', color: '#9E9E9E', textAlign: 'center', marginBottom: 4 },
  statValue:     { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  statSub:       { fontSize: 10, color: '#9E9E9E', textAlign: 'center', marginTop: 2 },
  statMapHint:   { fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 4 },

  tabRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tabBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0' },
  tabBtnOn:  { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  tabLabel:  { fontSize: 13, fontWeight: '700', color: '#777777' },
  tabLabelOn:{ color: '#FFFFFF' },

  trendCard:       { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 5 },
  trendHeading:    { fontSize: 15, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  trendSubHeading: { fontSize: 13, fontWeight: '800', color: '#1B1B1B', marginBottom: 10 },
  trendProvChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  trendProvChipOn: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  trendProvLabel:  { fontSize: 12, fontWeight: '700', color: '#555555' },
  trendProvLabelOn:{ color: '#FFFFFF' },

  daysRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  dayBtn:     { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA', alignItems: 'center' },
  dayBtnOn:   { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  dayLabel:   { fontSize: 12, fontWeight: '700', color: '#555555' },
  dayLabelOn: { color: '#FFFFFF' },

  chartContainer: { backgroundColor: '#FAFFFE', borderRadius: 14, borderWidth: 1, borderColor: '#E8F5E9', padding: 10, marginBottom: 4, overflow: 'hidden' },

  mandiTrendRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 10 },
  mandiTrendDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  mandiTrendName:  { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  mandiTrendSub:   { fontSize: 11, color: '#9E9E9E', fontWeight: '500', marginTop: 2 },
  mandiTrendRight: { alignItems: 'flex-end' },
  mandiTrendToday: { fontSize: 13, fontWeight: '800', color: '#1B1B1B' },
  diffBadge:       { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 3 },
  diffText:        { fontSize: 11, fontWeight: '700' },

  filterBar:     { marginBottom: 10 },
  filterContent: { gap: 8, paddingVertical: 2 },
  filterChip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  filterChipOn:  { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  filterLabel:   { fontSize: 12, fontWeight: '700', color: '#666666' },
  filterLabelOn: { color: '#FFFFFF' },
  countLabel:    { fontSize: 12, color: '#9E9E9E', fontWeight: '600', marginBottom: 10 },

  mandiCard:    { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
  mandiCardStar:{ borderWidth: 2, borderColor: '#2E7D32' },
  mandiTop:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rankBubble:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  rankGold:     { backgroundColor: '#FFF8E1' },
  rankText:     { fontSize: 12, fontWeight: '800', color: '#777777' },
  rankGoldText: { color: '#F57F17' },
  nameTagRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  mandiName:    { fontSize: 15, fontWeight: '800', color: '#1B1B1B' },
  tag:          { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:      { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  mandiMeta:    { fontSize: 11, color: '#9E9E9E', fontWeight: '500', marginTop: 3 },

  priceRow:  { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priceCell: { flex: 1, backgroundColor: '#F9F9F9', borderRadius: 10, padding: 10, alignItems: 'center' },
  priceMid:  { backgroundColor: '#F1F8E9' },
  priceLbl:  { fontSize: 10, color: '#9E9E9E', fontWeight: '700', marginBottom: 4 },
  priceVal:  { fontSize: 13, fontWeight: '800' },

  mapBtn:      { backgroundColor: '#E3F2FD', borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0', marginBottom: 8 },
  mapBtnText:  { color: '#1565C0', fontSize: 13, fontWeight: '800' },
  updatedLabel:{ fontSize: 10, color: '#BDBDBD', textAlign: 'center', fontWeight: '500' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: '#9E9E9E', fontWeight: '600', textAlign: 'center', lineHeight: 22 },

  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 32 },
  modalHandle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 20 },
  modalTitle:        { fontSize: 17, fontWeight: '800', color: '#1B1B1B', marginBottom: 6 },
  modalSub:          { fontSize: 13, color: '#9E9E9E', marginBottom: 18, fontWeight: '500', lineHeight: 20 },
  existingAlert:     { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  existingAlertText: { fontSize: 12, fontWeight: '700', color: '#E65100', flex: 1 },
  removeBtn:         { paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText:     { fontSize: 12, fontWeight: '700', color: '#C62828' },
  alertInputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8', overflow: 'hidden', marginBottom: 16 },
  pkrTag:            { paddingHorizontal: 14, paddingVertical: 15, fontSize: 14, fontWeight: '800', color: '#2E7D32', borderRightWidth: 1.5, borderRightColor: '#E8E8E8' },
  alertInput:        { flex: 1, paddingHorizontal: 14, paddingVertical: 15, fontSize: 16, fontWeight: '700', color: '#1B1B1B' },
  saveBtn:           { backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  saveBtnText:       { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  cancelBtn:         { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText:     { fontSize: 14, color: '#9E9E9E', fontWeight: '600' },
});

export default FarmerMandiScreen;
