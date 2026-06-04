import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useLanguage } from '../context/LanguageContext';

interface PendingModalProps {
  visible: boolean;
  onClose: () => void;
  role?: string;
}

const AccountPendingModal = ({ visible, onClose, role = 'Farmer' }: PendingModalProps) => {
  const { t, isUrdu } = useLanguage();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>⏳</Text>
          </View>
          <Text style={[styles.title, isUrdu && styles.rtlText]}>
            {isUrdu ? 'اکاؤنٹ زیر التواء' : 'Account Pending'}
          </Text>
          <Text style={[styles.message, isUrdu && styles.rtlText]}>
            {isUrdu
              ? `آپ کا ${role === 'Farmer' ? 'کسان' : role === 'Buyer' ? 'خریدار' : role === 'Investor' ? 'سرمایہ کار' : 'ایڈمن'} اکاؤنٹ فی الحال منظوری کے انتظار میں ہے۔\n\nایڈمن کی منظوری تک آپ صرف `
              : `Your `}
            {isUrdu ? null : <Text style={styles.roleText}>{role}</Text>}
            {isUrdu
              ? <Text style={styles.highlight}>شکایت</Text>
              : null}
            {isUrdu
              ? ' مینو تک رسائی حاصل کر سکتے ہیں۔\n\nتمام دیگر خصوصیات عارضی طور پر بند ہیں۔'
              : ` account is currently pending approval.\n\nYou can only access the `}
            {isUrdu ? null : <Text style={styles.highlight}>Complain</Text>}
            {isUrdu ? null : ` menu until the Admin approves your account.\n\nAll other features are temporarily locked.`}
          </Text>
          <TouchableOpacity style={styles.okayBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.okayBtnText}>
              {isUrdu ? 'ٹھیک ہے' : 'Okay, Got It'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#F9A825',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 26,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  roleText: {
    fontWeight: '700',
    color: '#2E7D32',
  },
  highlight: {
    fontWeight: '700',
    color: '#1565C0',
  },
  okayBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  okayBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default AccountPendingModal;
