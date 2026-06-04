import firestore from '@react-native-firebase/firestore';
import db from '../firebase/firestore';
import {addNotificationToFirebase} from './firebaseNotificationService';

type CreateFarmerPaymentInput = {
  orderId: string;
  farmerId: string;
  farmerName: string;
  buyerId: string;
  buyerName: string;
  cropTitle: string;
  amount: number;
};

// ── Create a farmer payment record when order is completed ───────────────────
export const createFarmerPaymentInFirebase = async (
  input: CreateFarmerPaymentInput,
) => {
  const docRef = db.collection('farmerPayments').doc();

  await docRef.set({
    id: docRef.id,
    orderId: input.orderId,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    buyerId: input.buyerId,
    buyerName: input.buyerName,
    cropTitle: input.cropTitle,
    amount: input.amount,
    status: 'Pending', // Pending -> Processing -> Paid
    viewedByFarmer: false,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Notify the farmer
  await addNotificationToFirebase(input.farmerId, {
    en: `💰 Payment of PKR ${input.amount.toLocaleString()} for "${input.cropTitle}" is pending. Check your Payments screen.`,
    ur: `💰 "${input.cropTitle}" کے لیے PKR ${input.amount.toLocaleString()} کی ادائیگی زیر التواء ہے۔ اپنی ادائیگیوں کی سکرین چیک کریں۔`,
  });

  return docRef.id;
};

// ── Update farmer payment status ─────────────────────────────────────────────
export const updateFarmerPaymentStatusInFirebase = async (
  paymentId: string,
  status: 'Pending' | 'Processing' | 'Paid',
  extra?: Record<string, any>,
) => {
  const paymentRef = db.collection('farmerPayments').doc(paymentId);
  const paymentSnap = await paymentRef.get();
  
  if (!paymentSnap.exists) {
    throw new Error('PAYMENT_NOT_FOUND');
  }
  
  const paymentData: any = paymentSnap.data() || {};
  
  await paymentRef.update({
    status,
    ...extra,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Notify farmer when payment is processed
  if (status === 'Paid' && paymentData.farmerId) {
    await addNotificationToFirebase(paymentData.farmerId, {
      en: `✅ Payment of PKR ${paymentData.amount?.toLocaleString()} for "${paymentData.cropTitle}" has been released to your account!`,
      ur: `✅ "${paymentData.cropTitle}" کے لیے PKR ${paymentData.amount?.toLocaleString()} آپ کے اکاؤنٹ میں جاری ہو گیا!`,
    });
  }
};

// ── Mark farmer payment as viewed ────────────────────────────────────────────
export const markFarmerPaymentViewedInFirebase = async (paymentId: string) => {
  await db.collection('farmerPayments').doc(paymentId).update({
    viewedByFarmer: true,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

// ── Get unviewed farmer payments count ───────────────────────────────────────
export const getUnviewedFarmerPaymentsCount = async (farmerId: string): Promise<number> => {
  try {
    const snapshot = await db
      .collection('farmerPayments')
      .where('farmerId', '==', farmerId)
      .where('viewedByFarmer', '==', false)
      .get();
    return snapshot.size;
  } catch (error) {
    console.warn('getUnviewedFarmerPaymentsCount error:', error);
    return 0;
  }
};
