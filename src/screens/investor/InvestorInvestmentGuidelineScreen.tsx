import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import InvestorHeader from '../../components/InvestorHeader';

const GUIDELINES = [
  {
    emoji: '🌍',
    title: 'Location & Land Condition',
    body: 'Check that the land is in a productive agricultural area with proper road access and is close to markets or mandis. Consider whether the soil is suitable for the planned crop and whether the area has a stable farming history.',
  },
  {
    emoji: '💧',
    title: 'Water Availability & Irrigation',
    body: 'A good investment opportunity must have reliable access to water — through canal systems, tube wells, rainfall, or other irrigation methods. Land with uncertain water supply carries higher farming risk and requires extra caution.',
  },
  {
    emoji: '👨‍🌾',
    title: 'Farmer\'s Experience & Background',
    body: 'Review the farmer\'s practical knowledge of crop production, land management, and market selling. A farmer with a good history of cultivation, timely harvesting, and responsible communication is generally a lower-risk option. Trust, consistency, and work ethic all matter.',
  },
  {
    emoji: '🌾',
    title: 'Crop Type & Market Demand',
    body: 'Crops with stable demand, good selling potential, and nearby market access are usually safer. If a crop is seasonal or highly price-sensitive, carefully consider the risks. Always examine expected production cost, expected yield, and estimated profit margin before investing.',
  },
  {
    emoji: '⚠️',
    title: 'Risk Evaluation',
    body: 'Consider weather conditions, disease risk, transport issues, and market price fluctuations. Land in areas with frequent flooding, drought, or poor road access involves higher uncertainty. A wise investor always compares possible profit with the level of risk involved.',
  },
  {
    emoji: '📋',
    title: 'Transparency & Agreement',
    body: 'Ensure there is clear agreement between both sides. The investment amount, purpose of funding, expected timeline, share of return, and responsibilities of the farmer should all be clearly defined. Proper records and regular updates build trust and reduce misunderstandings.',
  },
];

const GUIDELINES_UR = [
  {
    emoji: '🌍',
    title: 'زمین کی جگہ اور حالت',
    body: 'یہ دیکھیں کہ زمین زرخیز زراعتی علاقے میں ہے جو سڑک تک رسائی اور منڈی کے قریب ہو۔ زمین کی مٹی فصل کے لیے مناسب ہونی چاہیے اور علاقے میں زراعت کی مضبوط تاریخ ہونی چاہیے۔',
  },
  {
    emoji: '💧',
    title: 'پانی کی دستیابی اور آبپاشی',
    body: 'ایک اچھی سرمایہ کاری کے موقع میں پانی کی قابل اعتماد دستیابی ہونی چاہیے — نہری نظام، ٹیوب ویل، بارش یا دیگر ذرائع سے۔ پانی کی غیر یقینی فراہمی زیادہ خطرہ پیدا کرتی ہے۔',
  },
  {
    emoji: '👨‍🌾',
    title: 'کسان کا تجربہ اور پس منظر',
    body: 'کسان کی عملی معلومات دیکھیں۔ اچھی کاشتکاری، بروقت کٹائی، اور ذمہ داری کی تاریخ والے کسان کا انتخاب کم خطرے کا ہوتا ہے۔ اعتماد، اتساق اور محنت سب اہم ہیں۔',
  },
  {
    emoji: '🌾',
    title: 'فصل کی قسم اور مارکیٹ طلب',
    body: 'مستحکم طلب، اچھی فروخت کی صلاحیت اور قریبی مارکیٹ والی فسلیں عموماً زیادہ محفوظ ہوتی ہیں۔ سرمایہ کاری سے پہلے متوقع لاگت، پیداوار اور منافع کا جائزہ لیں۔',
  },
  {
    emoji: '⚠️',
    title: 'خطرے کا جائزہ',
    body: 'موسمی حالات، بیماری، نقل و حمل کے مسائل اور مارکیٹ قیمت کی تبدیلی کو مدِّ نظر رکھیں۔ بار بار سیلاب، سوکھے یا خراب سڑکوں والے علاقے زیادہ غیر یقینی ہوتے ہیں۔ سمجھدار سرمایہ کار ہمیشہ ممکنہ منافع کو خطرے کے ساتھ تولتا ہے۔',
  },
  {
    emoji: '📋',
    title: 'شفافیت اور معاہدہ',
    body: 'دونوں فریقوں کے درمیان واضح معاہدہ ہونا ضروری ہے۔ سرمایہ کی رقم، مقصد، متوقع میعاد، منافع کا حصہ اور کسان کی ذمہ داری سب واضح ہونی چاہیے۔ باقاعدہ ریکارڈ اور باقاعدہ اپڈیٹس اعتماد اور غلط فہمی کو کم کرتے ہیں۔',
  },
];

const InvestorInvestmentGuidelineScreen = ({ navigation }: any) => {
  const { isUrdu, t } = useLanguage();

  const guidelines = isUrdu ? GUIDELINES_UR : GUIDELINES;

  return (
    <View style={styles.container}>
      <InvestorHeader title={isUrdu ? 'سرمایہ کاری رہنما' : 'Investment Guideline'} navigation={navigation} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* Header Banner */}
        <View style={styles.heroBanner}>
          <Text style={styles.heroEmoji}>💼</Text>
          <Text style={[styles.heroTitle, isUrdu && styles.rtlText]}>
            {isUrdu ? 'ذہین سرمایہ کاری کے اصول' : 'Smart Investment Guidelines'}
          </Text>
          <Text style={[styles.heroSubtitle, isUrdu && styles.rtlText]}>
            {isUrdu ? 'کسی بھی کسان کی زمین میں سرمایہ کاری سے پہلے ان اہم اصولوں پر عمل کریں' : "Follow these key principles before investing in any farmer's land"}
          </Text>
        </View>

        {/* Intro card */}
        <View style={styles.introCard}>
          <Text style={styles.introIcon}>📌</Text>
          <Text style={[styles.introText, isUrdu && styles.rtlText]}>
            {isUrdu
              ? 'کسان کی زمین میں سرمایہ کاری سے پہلے، یہ احتیاط سے جائزہ لیں کہ آیا زمین اور کسان میں محفوظ اور منافع بخش واپسی کی مضبوط صلاحیت ہے۔'
              : "Before investing in a farmer's land, carefully evaluate whether the land and the farmer have strong potential for a safe and profitable return."}
          </Text>
        </View>

        {/* Guideline Items */}
        {guidelines.map((item, index) => (
          <View key={index} style={styles.guideCard}>
            <View style={styles.guideCardHeader}>
              <View style={styles.guideIndexBadge}>
                <Text style={styles.guideIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.guideEmoji}>{item.emoji}</Text>
              <Text style={[styles.guideTitle, isUrdu && styles.rtlText]} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            <View style={styles.guideDivider} />
            <View style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={[styles.guideBody, isUrdu && styles.rtlText]}>{item.body}</Text>
            </View>
          </View>
        ))}

        {/* Summary Rule Box */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>{isUrdu ? '✅ سرمایہ کاری کا سنہری اصول' : '✅ Golden Rule of Investment'}</Text>
          <View style={styles.summaryBullets}>
            {(isUrdu
              ? ['🌱  زمین زرخیز ہونی چاہیے', '🤝  کسان قابل اعتماد ہونا چاہیے', '📈  فصل میں مارکیٹ کی صلاحیت ہونی چاہیے', '⚖️  مجموعی خطرہ قابل انتظام ہونا چاہیے']
              : ['🌱  The land must be productive', '🤝  The farmer must be reliable', '📈  The crop must have market potential', '⚖️  The overall risk must be manageable']
            ).map((point, i) => (
              <Text key={i} style={[styles.summaryPoint, isUrdu && styles.rtlText]}>{point}</Text>
            ))}
          </View>
          <Text style={[styles.summaryFooter, isUrdu && styles.rtlText]}>
            {isUrdu ? 'اچھے سرمایہ کاری فیصلے موقع اور احتیاط دونوں پر مبنی ہونے چاہئیں۔' : 'Good investment decisions should be based on both opportunity and caution.'}
          </Text>
        </View>

        {/* Contact Footer */}
        <View style={styles.contactCard}>
          <Text style={styles.contactEmoji}>📞</Text>
          <Text style={[styles.contactText, isUrdu && styles.rtlText]}>
            {isUrdu ? 'مزید رہنما اصولوں کے لیے رابطہ کریں ' : 'For more guidelines, contact '}{' '}
            <Text style={styles.contactBrand}>Farm Nest</Text>
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16 },

  heroBanner: {
    backgroundColor: '#6A1B9A',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6A1B9A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  heroEmoji: { fontSize: 44, marginBottom: 10 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#E1BEE7',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },

  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3E5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#6A1B9A',
  },
  introIcon: { fontSize: 20, marginTop: 2 },
  introText: {
    flex: 1,
    fontSize: 14,
    color: '#4A148C',
    lineHeight: 22,
    fontWeight: '600',
  },

  guideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0E6FF',
  },
  guideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  guideIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6A1B9A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideIndexText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  guideEmoji: { fontSize: 22 },
  guideTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#1B1B1B',
    lineHeight: 22,
  },
  guideDivider: {
    height: 1,
    backgroundColor: '#F3E5F5',
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: 18,
    color: '#6A1B9A',
    lineHeight: 22,
    fontWeight: '900',
    marginTop: 1,
  },
  guideBody: {
    flex: 1,
    fontSize: 13,
    color: '#444444',
    lineHeight: 22,
  },

  summaryBox: {
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    padding: 20,
    marginTop: 4,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#CE93D8',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4A148C',
    marginBottom: 14,
    textAlign: 'center',
  },
  summaryBullets: { gap: 8, marginBottom: 14 },
  summaryPoint: {
    fontSize: 14,
    color: '#1B1B1B',
    fontWeight: '600',
    lineHeight: 22,
  },
  summaryFooter: {
    fontSize: 13,
    color: '#6A1B9A',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },

  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#EDE7F6',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  contactEmoji: { fontSize: 24 },
  contactText: { fontSize: 14, color: '#555555', fontWeight: '500' },
  contactBrand: { color: '#6A1B9A', fontWeight: '800' },

  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});

export default InvestorInvestmentGuidelineScreen;
