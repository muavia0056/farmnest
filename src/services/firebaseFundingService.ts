import firestore from '@react-native-firebase/firestore';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {uploadMultipleImagesToCloudinary, isRemoteUrl} from './cloudinaryService';
import {addNotificationToFirebase} from './firebaseNotificationService';
import {ensureMainAdminSession} from './sessionService';

type CreateFundingPostInput = {
  farmerId: string;
  farmerName: string;
  farmerProfilePic?: string;
  title: string;
  description: string;
  city: string;
  address: string;
  targetAmount: string;
  paymentMethod?: string;
  paymentAccountNumber?: string;
  paymentName?: string;
  images?: string[];
  liveLocation?: {latitude: number; longitude: number; timestamp: number} | null;
};

type InvestInFundingPostInput = {
  postId: string;
  investorId: string;
  investorName: string;
  amount: number;
};

export const createFundingPostInFirebase = async (
  input: CreateFundingPostInput,
) => {
  const authUser = firebaseAuth.currentUser;

  if (!authUser) {
    throw new Error('NO_AUTH_USER');
  }

  if (authUser.uid !== input.farmerId) {
    throw new Error('INVALID_FARMER_ID');
  }

  const uploadedImages = await uploadMultipleImagesToCloudinary(input.images || []);
  const docRef = db.collection('fundingPosts').doc();

  await docRef.set({
    id: docRef.id,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    farmerProfilePic: input.farmerProfilePic || '',
    title: input.title.trim(),
    description: input.description.trim(),
    city: input.city.trim(),
    address: input.address.trim(),
    targetAmount: Number(input.targetAmount || 0),
    investedAmount: 0,
    paymentMethod: input.paymentMethod || '',
    paymentAccountNumber: input.paymentAccountNumber?.trim() || '',
    paymentName: input.paymentName?.trim() || '',
    images: uploadedImages,
    investors: [],
    status: 'Open',
    liveLocation: input.liveLocation || null,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
};

export const investInFundingPostInFirebase = async (
  input: InvestInFundingPostInput,
) => {
  // Validate inputs before touching Firestore
  if (!input.investorId || !input.investorId.trim()) {
    throw new Error('INVALID_INVESTOR_ID');
  }

  if (!input.postId || !input.postId.trim()) {
    throw new Error('POST_NOT_FOUND');
  }

  const postRef = db.collection('fundingPosts').doc(input.postId);

  await db.runTransaction(async transaction => {
    const postSnap = await transaction.get(postRef);

    if (!postSnap.exists) {
      throw new Error('POST_NOT_FOUND');
    }

    const postData: any = postSnap.data() || {};
    const farmerId = postData.farmerId || '';
    const status = postData.status || 'Open';
    const targetAmount = Number(postData.targetAmount || 0);
    const investedAmount = Number(postData.investedAmount || 0);
    const investors = Array.isArray(postData.investors) ? postData.investors : [];

    if (status !== 'Open') {
      throw new Error('POST_NOT_OPEN');
    }

    if (Number(input.amount) <= 0) {
      throw new Error('INVALID_AMOUNT');
    }

    const nextInvestedAmount = investedAmount + Number(input.amount);

    const newInvestorEntry = {
      id: `${Date.now()}`,
      investorId: input.investorId,
      investorName: input.investorName,
      amount: Number(input.amount),
      timestamp: Date.now(),
      status: 'PendingPayment', // ADDED: Track investment payment status
    };

    const updatedInvestors = [...investors, newInvestorEntry];
    const isNowFunded = nextInvestedAmount >= targetAmount;

    transaction.update(postRef, {
      investedAmount: nextInvestedAmount,
      investors: updatedInvestors,
      status: isNowFunded ? 'Funded' : 'Open',
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    if (isNowFunded && farmerId) {
      // Notify farmer outside the transaction (non-fatal)
      const postTitle = postData.title || postData.landTitle || 'your funding post';
      addNotificationToFirebase(farmerId, {
        en: `🎉 Your funding post "${postTitle}" has reached its target amount!`,
        ur: `🎉 آپ کی فنڈنگ پوسٹ "${postTitle}" کی ہدف رقم پوری ہو گئی ہے۔`,
      }).catch(e =>
        console.warn('[investInFundingPost] funded notification error (non-fatal):', e),
      );
    }
  });
};

// ── Update an existing funding post - FIXED: Handles image uploads ───────────
export const updateFundingPostInFirebase = async (
  postId: string,
  data: Partial<{
    title: string;
    description: string;
    city: string;
    address: string;
    images: string[];
    status: string;
    targetAmount: number;
    investedAmount: number;
    investors: any[];
  }>,
) => {
  const updateData: any = { ...data };

  // FIXED: If images are being updated, upload new local images to Cloudinary
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    const processedImages: string[] = [];
    for (const img of data.images) {
      if (isRemoteUrl(img)) {
        // Already uploaded to Cloudinary, keep as is
        processedImages.push(img);
      } else {
        // Local file, needs upload to Cloudinary
        try {
          const uploaded = await uploadMultipleImagesToCloudinary([img]);
          if (uploaded.length > 0) {
            processedImages.push(uploaded[0]);
          }
        } catch (err) {
          console.warn('[updateFundingPostInFirebase] Image upload failed:', err);
        }
      }
    }
    updateData.images = processedImages;
  }

  updateData.updatedAt = firestore.FieldValue.serverTimestamp();

  await db.collection('fundingPosts').doc(postId).update(updateData);
};

// ── Delete a funding post ───────────────────────────────────────────────
export const deleteFundingPostInFirebase = async (postId: string) => {
  await ensureMainAdminSession();
  await db.collection('fundingPosts').doc(postId).delete();
};

// ── Create investment order (for Admin approval flow) ─────────────────────
export const createInvestmentOrderInFirebase = async (input: {
  postId: string;
  investorId: string;
  investorName: string;
  farmerId: string;
  farmerName: string;
  amount: number;
  postTitle: string;
}) => {
  // Use the Firebase Auth UID (not Firestore doc ID) so Firestore rules pass
  const authUser = firebaseAuth.currentUser;
  if (!authUser) throw new Error('NO_AUTH_USER');

  const docRef = db.collection('investmentOrders').doc();

  await docRef.set({
    id: docRef.id,
    postId: input.postId,
    investorId: authUser.uid,          // ← Firebase Auth UID (matches auth.uid in rules)
    investorAppId: input.investorId,   // ← keep the Firestore doc ID for lookups
    investorName: input.investorName,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    amount: input.amount,
    postTitle: input.postTitle,
    status: 'PendingPayment',
    paymentConfirmed: false,
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
};

// ── Update investment order status ─────────────────────────────────────────
export const updateInvestmentOrderInFirebase = async (
  orderId: string,
  data: Partial<{
    status: string;
    paymentConfirmed: boolean;
    adminApproved: boolean;
    confirmPayData: any;
  }>,
) => {
  await db.collection('investmentOrders').doc(orderId).update({
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};
