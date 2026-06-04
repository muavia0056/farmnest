import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  size?: 'small' | 'medium' | 'large';
  showTagline?: boolean;
}

const FarmNestLogo = ({ size = 'medium', showTagline = false }: Props) => {
  const boxSize = size === 'small' ? 52 : size === 'medium' ? 72 : 100;
  const borderRadius = boxSize * 0.24;
  const emojiSize = boxSize * 0.55;
  const titleSize = size === 'small' ? 18 : size === 'medium' ? 28 : 38;
  const tagSize = size === 'small' ? 10 : size === 'medium' ? 13 : 16;

  return (
    <View style={styles.container}>
      {/* Logo box */}
      <View
        style={[
          styles.iconBox,
          { width: boxSize, height: boxSize, borderRadius },
        ]}
      >
        <Text style={{ fontSize: emojiSize, lineHeight: boxSize }}>
          🌱
        </Text>
      </View>

      {/* App name */}
      <Text style={[styles.title, { fontSize: titleSize }]}>
        Farm <Text style={styles.titleAccent}>Nest</Text>
      </Text>

      {/* Tagline */}
      {showTagline && (
        <Text style={[styles.tagline, { fontSize: tagSize }]}>
          Connecting Farmers, Buyers {'&'} Investors
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconBox: {
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 8,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  title: {
    fontWeight: '900',
    color: '#1B1B1B',
    letterSpacing: 1,
    marginTop: 2,
  },
  titleAccent: {
    color: '#2E7D32',
  },
  tagline: {
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

export default FarmNestLogo;