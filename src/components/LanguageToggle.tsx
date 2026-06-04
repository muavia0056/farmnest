import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useLanguage } from '../context/LanguageContext';

interface LanguageToggleProps {
  accentColor?: string;
}

const LanguageToggle = ({ accentColor = '#2E7D32' }: LanguageToggleProps) => {
  const { language, toggleLanguage } = useLanguage();
  const isEnglish = language === 'en';

  // Single button that shows current language and taps to switch
  return (
    <TouchableOpacity
      onPress={toggleLanguage}
      activeOpacity={0.75}
      style={[styles.toggle, { borderColor: accentColor }]}>
      <Text style={[styles.inactive, !isEnglish && { color: accentColor, fontWeight: '800' }]}>EN</Text>
      <Text style={styles.sep}>|</Text>
      <Text style={[styles.inactive, isEnglish && { color: accentColor, fontWeight: '800' }]}>اردو</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  inactive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAAAAA',
  },
  sep: {
    fontSize: 13,
    color: '#CCCCCC',
    marginHorizontal: 2,
  },
});

export default LanguageToggle;
