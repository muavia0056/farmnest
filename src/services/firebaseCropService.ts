import firestore from '@react-native-firebase/firestore';
import firebaseAuth from '../firebase/auth';
import db from '../firebase/firestore';
import {uploadMultipleImagesToCloudinary, isRemoteUrl} from './cloudinaryService';
import {ensureMainAdminSession} from './sessionService';

type CreateCropPostInput = {
  farmerId: string;
  farmerName: string;
  farmerProfilePic: string | null;
  farmerRating: number;
  images: string[];
  cropTitle: string;
  description: string;
  city: string;
  address: string;
  paymentMethod: string;
  paymentAccountNumber: string;
  paymentName: string;
  bidEndDay: string;
  bidEndHour: string;
  bidEndMinute: string;
  basePrice: string;
  bidEndTimestamp: number;
  liveLocation?: {latitude: number; longitude: number; timestamp: number} | null;
};

export const createCropPostInFirebase = async (
  input: CreateCropPostInput,
) => {
  const user = firebaseAuth.currentUser;

  if (!user) {
    throw new Error('NO_AUTH_USER');
  }

  if (user.uid !== input.farmerId) {
    throw new Error('INVALID_FARMER_ID');
  }

  console.log('[createCropPostInFirebase] Starting crop post creation with', input.images.length, 'images');

  const uploadedImages = await uploadMultipleImagesToCloudinary(input.images || []);
  
  console.log('[createCropPostInFirebase] Uploaded', uploadedImages.length, 'images to Cloudinary');

  const docRef = db.collection('cropPosts').doc();

  await docRef.set({
    id: docRef.id,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    farmerProfilePic: input.farmerProfilePic || '',
    farmerRating: input.farmerRating || 0,
    images: uploadedImages,
    cropTitle: input.cropTitle.trim(),
    description: input.description.trim(),
    city: input.city.trim(),
    address: input.address.trim(),
    paymentMethod: input.paymentMethod,
    paymentAccountNumber: input.paymentAccountNumber?.trim() || '',
    paymentName: input.paymentName?.trim() || '',
    bidEndDay: input.bidEndDay,
    bidEndHour: input.bidEndHour,
    bidEndMinute: input.bidEndMinute,
    basePrice: input.basePrice.trim(),
    bids: [],
    status: 'Active',
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    bidEndTimestamp: input.bidEndTimestamp,
    liveLocation: input.liveLocation || null,
    auctionNotified: false,
  });

  console.log('[createCropPostInFirebase] Crop post created:', docRef.id);

  return docRef.id;
};

// ── Update an existing crop post (edit listing) ──────────────────────────
// FIXED: Now properly handles Cloudinary image uploads for updates
export const updateCropPostInFirebase = async (
  postId: string,
  data: Partial<{
    cropTitle: string;
    description: string;
    city: string;
    address: string;
    images: string[];
    bidEndDay: string;
    bidEndHour: string;
    bidEndMinute: string;
    bidEndTimestamp: number;
    bids: any[];
    auctionNotified: boolean;
    status: string;
    selectedBidderId: string | null;
    selectedBidderNotifiedAt: number | null;
    orderId: string | null;
    winningBidderId: string;
    winningBidAmount: number;
    winningBidId: string;
    winningBidderName: string;
    finalizedAt: any;
  }>,
) => {
  const updateData: any = {
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  // If images are being updated, upload new local images to Cloudinary
  if (data.images && Array.isArray(data.images)) {
    const processedImages: string[] = [];
    for (const img of data.images) {
      if (isRemoteUrl(img)) {
        // Already a Cloudinary URL, keep as is
        processedImages.push(img);
      } else {
        // Local file, upload to Cloudinary
        try {
          const uploaded = await uploadMultipleImagesToCloudinary([img]);
          if (uploaded.length > 0) {
            processedImages.push(uploaded[0]);
          }
        } catch (err) {
          console.warn('[updateCropPostInFirebase] Image upload failed:', err);
        }
      }
    }
    updateData.images = processedImages;
  }

  await db.collection('cropPosts').doc(postId).update(updateData);
};

// ── Delete a crop post ───────────────────────────────────────────────
export const deleteCropPostInFirebase = async (postId: string) => {
  await ensureMainAdminSession();
  await db.collection('cropPosts').doc(postId).delete();
};

// ── Place a bid on a crop post ───────────────────────────────────────────
// FIXED: Better error handling and validation
export const placeBidOnCropPostInFirebase = async (
  postId: string,
  bid: {
    bidderId: string;
    bidderName: string;
    amount: number;
  },
) => {
  // Validate bid amount
  if (!bid.amount || isNaN(bid.amount) || bid.amount <= 0) {
    throw new Error('INVALID_BID_AMOUNT');
  }

  const postRef = db.collection('cropPosts').doc(postId);

  try {
    await db.runTransaction(async transaction => {
      const postSnap = await transaction.get(postRef);

      if (!postSnap.exists) {
        throw new Error('POST_NOT_FOUND');
      }

      const postData: any = postSnap.data() || {};
      const status = postData.status || 'Active';
      const bidEndTimestamp = postData.bidEndTimestamp || 0;
      const basePrice = Number(postData.basePrice || 0);
      const existingBids = Array.isArray(postData.bids) ? postData.bids : [];

      // Validate post is still active
      if (status !== 'Active') {
        throw new Error('POST_NOT_ACTIVE');
      }
      
      if (Date.now() > bidEndTimestamp) {
        throw new Error('BIDDING_CLOSED');
      }

      // Validate bid amount >= base price
      if (bid.amount < basePrice) {
        throw new Error('BID_TOO_LOW');
      }

      // Check if bid is higher than current highest
      const activeBids = existingBids.filter((b: any) => !b.cancelled);
      const highestBid = activeBids.reduce((max: any, b: any) => 
        (b.amount > (max?.amount || 0) ? b : max), null
      );

      if (highestBid && bid.amount <= highestBid.amount) {
        throw new Error('BID_NOT_HIGHEST');
      }

      // Remove previous bid from same bidder (replace with new one)
      const filteredBids = existingBids.filter(
        (b: any) => b.bidderId !== bid.bidderId || b.cancelled
      );

      const newBid = {
        id: `${Date.now()}`,
        bidderId: bid.bidderId,
        bidderName: bid.bidderName,
        amount: bid.amount,
        timestamp: Date.now(),
        cancelled: false,
        paymentConfirmed: false,
      };

      transaction.update(postRef, {
        bids: [...filteredBids, newBid],
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log('[placeBidOnCropPostInFirebase] Bid placed successfully:', bid.amount);
  } catch (error: any) {
    console.error('[placeBidOnCropPostInFirebase] Transaction failed:', error?.message || error);
    throw error;
  }
};

// ── Cancel a bid on a crop post ───────────────────────────────────────────
export const cancelBidOnCropPostInFirebase = async (
  postId: string,
  bidderId: string,
) => {
  const postRef = db.collection('cropPosts').doc(postId);

  try {
    await db.runTransaction(async transaction => {
      const postSnap = await transaction.get(postRef);

      if (!postSnap.exists) {
        throw new Error('POST_NOT_FOUND');
      }

      const postData: any = postSnap.data() || {};
      const existingBids = Array.isArray(postData.bids) ? postData.bids : [];

      // Mark the bidder's active bid as cancelled
      const updatedBids = existingBids.map((b: any) =>
        b.bidderId === bidderId && !b.cancelled
          ? { ...b, cancelled: true, cancelledAt: Date.now() }
          : b
      );

      transaction.update(postRef, {
        bids: updatedBids,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log('[cancelBidOnCropPostInFirebase] Bid cancelled successfully for bidder:', bidderId);
  } catch (error: any) {
    console.error('[cancelBidOnCropPostInFirebase] Transaction failed:', error?.message || error);
    throw error;
  }
};
