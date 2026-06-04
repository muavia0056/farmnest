/**
 * ImageViewer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen image viewer built with:
 *   • react-native-gesture-handler  (Gesture API v2)
 *   • react-native-reanimated       (useSharedValue / useAnimatedStyle)
 *
 * Features:
 *   • Pinch to zoom  (1× – 5×)
 *   • Two-finger pan while zoomed
 *   • Double-tap to toggle 2.5× zoom
 *   • Swipe left / right to change image  (only at base scale)
 *   • Swipe down to close                 (only at base scale)
 *   • ✕ close button always works
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  Modal,
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface Props {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/* ─── Single-image zoom/pan panel ──────────────────────────────────────────── */
interface PanelProps {
  uri: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeDown: () => void;
}

const ImagePanel = ({ uri, onSwipeLeft, onSwipeRight, onSwipeDown }: PanelProps) => {
  /* Reanimated shared values */
  const scale      = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  /* Pinch origin accumulator */
  const savedScale = useSharedValue(1);
  const savedX     = useSharedValue(0);
  const savedY     = useSharedValue(0);

  const resetZoom = () => {
    'worklet';
    scale.value      = withSpring(1, { damping: 20, stiffness: 130, mass: 0.5 });
    translateX.value = withSpring(0, { damping: 20, stiffness: 130, mass: 0.5 });
    translateY.value = withSpring(0, { damping: 20, stiffness: 130, mass: 0.5 });
    savedScale.value = 1;
    savedX.value     = 0;
    savedY.value     = 0;
  };

  /* ── Pinch gesture ─────────────────────────────────────────────────────── */
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      /* Lerp toward target scale for a smooth, controlled feel */
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = scale.value + (target - scale.value) * 0.35;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        /* Soft spring settle to the final value */
        scale.value = withSpring(scale.value, { damping: 18, stiffness: 130, mass: 0.5 });
      }
    });

  /* ── Pan gesture ───────────────────────────────────────────────────────── */
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .onStart(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        /* Pan the zoomed image with friction so it feels controlled */
        const FRICTION = 0.55;
        const maxX = (W * (scale.value - 1)) / 2;
        const maxY = (H * (scale.value - 1)) / 2;
        const rawX = savedX.value + e.translationX * FRICTION;
        const rawY = savedY.value + e.translationY * FRICTION;
        translateX.value = Math.min(maxX, Math.max(-maxX, rawX));
        translateY.value = Math.min(maxY, Math.max(-maxY, rawY));
      }
      /* (at base scale — handled in onEnd) */
    })
    .onEnd((e) => {
      if (scale.value > 1.05) {
        /* Smooth spring snap back into bounds */
        const maxX = (W * (scale.value - 1)) / 2;
        const maxY = (H * (scale.value - 1)) / 2;
        translateX.value = withSpring(
          Math.min(maxX, Math.max(-maxX, translateX.value)),
          { damping: 20, stiffness: 120, mass: 0.6 },
        );
        translateY.value = withSpring(
          Math.min(maxY, Math.max(-maxY, translateY.value)),
          { damping: 20, stiffness: 120, mass: 0.6 },
        );
        return;
      }

      /* Base scale — swipe gestures */
      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);

      if (e.translationY > 80 && absY > absX) {
        runOnJS(onSwipeDown)();
        return;
      }
      if (absX > 50 || Math.abs(e.velocityX) > 300) {
        if (e.translationX < 0) runOnJS(onSwipeLeft)();
        else                    runOnJS(onSwipeRight)();
      }
    });

  /* ── Double-tap gesture ────────────────────────────────────────────────── */
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.1) {
        resetZoom();
      } else {
        scale.value      = withTiming(DOUBLE_TAP_SCALE, { duration: 320 });
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  /* ── Compose gestures: pinch + pan run simultaneously; doubleTap separate */
  const composed = Gesture.Simultaneous(
    Gesture.Race(doubleTap, panGesture),
    pinchGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      scale.value      },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={styles.panelContainer}>
        <Animated.Image
          source={{ uri }}
          style={[styles.fullImage, animatedStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
};

/* ─── Main ImageViewer ──────────────────────────────────────────────────────── */
const ImageViewer = ({ visible, images, initialIndex = 0, onClose }: Props) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [visible, initialIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, images.length - 1));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, []);

  const currentUri = images[currentIndex] ?? '';

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <StatusBar backgroundColor="#000000" barStyle="light-content" />

      <GestureHandlerRootView style={styles.root}>

        {/* Image panel — handles all pinch/pan/swipe gestures */}
        <ImagePanel
          key={currentUri}          /* remount = reset zoom on image change */
          uri={currentUri}
          onSwipeLeft={goNext}
          onSwipeRight={goPrev}
          onSwipeDown={onClose}
        />

        {/* ── Close button — rendered ABOVE the gesture surface ── */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.75}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>

        {/* Counter */}
        {images.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterTxt}>{currentIndex + 1} / {images.length}</Text>
          </View>
        )}

        {/* Dot pager */}
        {images.length > 1 && (
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>
        )}

        {/* Arrow buttons */}
        {images.length > 1 && currentIndex > 0 && (
          <TouchableOpacity style={[styles.arrow, styles.arrowLeft]} onPress={goPrev} activeOpacity={0.7}>
            <Text style={styles.arrowTxt}>‹</Text>
          </TouchableOpacity>
        )}
        {images.length > 1 && currentIndex < images.length - 1 && (
          <TouchableOpacity style={[styles.arrow, styles.arrowRight]} onPress={goNext} activeOpacity={0.7}>
            <Text style={styles.arrowTxt}>›</Text>
          </TouchableOpacity>
        )}

      </GestureHandlerRootView>
    </Modal>
  );
};

/* ─── Styles ─────────────────────────────────────────────────────────────────  */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  panelContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: W,
    height: H,
  },
  /* Close button — high zIndex, absolute, above everything */
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 20,
    right: 20,
    zIndex: 999,
    elevation: 999,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeTxt: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
  counter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 20,
    left: 20,
    zIndex: 999,
    elevation: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  arrow: {
    position: 'absolute',
    top: H / 2 - 30,
    zIndex: 999,
    elevation: 999,
    width: 50,
    height: 60,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowLeft:  { left: 10 },
  arrowRight: { right: 10 },
  arrowTxt: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 44,
  },
  dots: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 52 : 30,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    zIndex: 999,
    elevation: 999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 22,
    borderRadius: 4,
  },
});

export default ImageViewer;
