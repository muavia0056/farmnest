import firestore from '@react-native-firebase/firestore';
import db from '../firebase/firestore';
import {addNotificationToFirebase} from './firebaseNotificationService';

type CreateReviewInput = {
  farmerId: string;
  farmerName: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: 'Buyer' | 'Investor';
  rating: number;
  title: string;
  detail: string;
  orderId?: string;
  investmentId?: string;
};

// ── Helper: recalculate average rating from a reviews array ──────────────────
const calcAvg = (reviews: any[]): number => {
  if (!reviews.length) return 0;
  return Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;
};

// ── Create a review for a farmer ─────────────────────────────────────────────
export const createReviewInFirebase = async (input: CreateReviewInput) => {
  // Step 1: Write to /reviews collection (this always succeeds — the rule
  // only requires request.resource.data.reviewerId == request.auth.uid).
  const docRef = db.collection('reviews').doc();
  const reviewId = docRef.id;

  const reviewDoc = {
    id: reviewId,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    reviewerId: input.reviewerId,
    reviewerName: input.reviewerName,
    reviewerRole: input.reviewerRole,
    rating: input.rating,
    title: input.title.trim(),
    detail: input.detail.trim(),
    orderId: input.orderId || '',
    investmentId: input.investmentId || '',
    createdAt: firestore.FieldValue.serverTimestamp(),
    createdAtMillis: Date.now(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(reviewDoc);

  // Step 2: Update farmer's user doc using arrayUnion — this does NOT trigger
  // the diff() check because arrayUnion is a field transform, not a document
  // replacement. The rule allows updates to the 'reviews' and 'rating' fields.
  const newReviewEntry = {
    id: reviewId,
    reviewerId: input.reviewerId,
    reviewerName: input.reviewerName,
    reviewerRole: input.reviewerRole,
    rating: input.rating,
    title: input.title.trim(),
    detail: input.detail.trim(),
    timestamp: Date.now(),
  };

  try {
    // Read current reviews to compute the new average
    const farmerSnap = await db.collection('users').doc(input.farmerId).get();
    const existingReviews: any[] = farmerSnap.exists
      ? (farmerSnap.data()?.reviews || [])
      : [];
    const updatedReviews = [...existingReviews, newReviewEntry];
    const newRating = calcAvg(updatedReviews);

    // Use arrayUnion for reviews — avoids the diff() rule evaluation problem
    await db.collection('users').doc(input.farmerId).update({
      reviews: firestore.FieldValue.arrayUnion(newReviewEntry),
      rating: newRating,
    });
  } catch (e: any) {
    // Non-fatal — the review is already saved in /reviews collection.
    // The AppContext listener on /users will still show it eventually.
    console.warn('[createReviewInFirebase] farmer user doc update failed (non-fatal):', e?.code, e?.message);
  }

  // Step 3: Notify farmer — fire-and-forget
  addNotificationToFirebase(input.farmerId, {
    en: `⭐ ${input.reviewerName} gave you a ${input.rating}-star review: "${input.title}"`,
    ur: `⭐ ${input.reviewerName} نے آپ کو ${input.rating} ستارہ جائزہ دیا: "${input.title}"`,
  }).catch(e =>
    console.warn('[createReviewInFirebase] notification failed (non-fatal):', e),
  );

  return reviewId;
};

// ── Update an existing review ────────────────────────────────────────────────
export const updateReviewInFirebase = async (
  reviewId: string,
  farmerId: string,
  reviewerId: string,
  updates: {
    rating?: number;
    title?: string;
    detail?: string;
  },
) => {
  // Update the /reviews document
  await db.collection('reviews').doc(reviewId).update({
    ...updates,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Update the reviews array in the farmer's user doc
  try {
    const farmerSnap = await db.collection('users').doc(farmerId).get();
    if (farmerSnap.exists) {
      const existingReviews: any[] = farmerSnap.data()?.reviews || [];
      const updatedReviews = existingReviews.map((r: any) =>
        r.id === reviewId || r.reviewerId === reviewerId
          ? { ...r, ...updates }
          : r,
      );
      const newRating = calcAvg(updatedReviews);
      await db.collection('users').doc(farmerId).update({
        reviews: updatedReviews,
        rating: newRating,
      });
    }
  } catch (e: any) {
    console.warn('[updateReviewInFirebase] farmer user doc update failed (non-fatal):', e?.code, e?.message);
  }
};

// ── Delete a review ──────────────────────────────────────────────────────────
export const deleteReviewInFirebase = async (
  reviewId: string,
  farmerId: string,
  reviewerId: string,
) => {
  // Delete from /reviews collection
  await db.collection('reviews').doc(reviewId).delete();

  // Remove from farmer's user doc reviews array
  try {
    const farmerSnap = await db.collection('users').doc(farmerId).get();
    if (farmerSnap.exists) {
      const existingReviews: any[] = farmerSnap.data()?.reviews || [];
      const updatedReviews = existingReviews.filter(
        (r: any) => r.id !== reviewId && r.reviewerId !== reviewerId,
      );
      const newRating = calcAvg(updatedReviews);
      await db.collection('users').doc(farmerId).update({
        reviews: updatedReviews,
        rating: newRating,
      });
    }
  } catch (e: any) {
    console.warn('[deleteReviewInFirebase] farmer user doc update failed (non-fatal):', e?.code, e?.message);
  }
};

// ── Get reviews for a farmer ─────────────────────────────────────────────────
export const getFarmerReviewsFromFirebase = async (farmerId: string) => {
  const snapshot = await db
    .collection('reviews')
    .where('farmerId', '==', farmerId)
    .orderBy('createdAtMillis', 'desc')
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};
