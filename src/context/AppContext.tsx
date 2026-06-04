import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import db from '../firebase/firestore';
import { addNotificationToFirebase } from '../services/firebaseNotificationService';
import { bootstrapFCM, releaseFCMListeners } from '../services/fcmService';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  cnic: string;
  password: string;
  role: 'Farmer' | 'Buyer' | 'Investor' | 'Admin';
  profilePic: string | null;
  cnicFront?: string | null;
  cnicBack?: string | null;
  livenessVideo?: string | null;
  accountStatus: 'Pending' | 'Approved' | 'Rejected' | 'Suspended';
  rating: number;
  reviews: Review[];
  penalties?: number;
  registeredAt?: number;
}

interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  title: string;
  detail: string;
}

interface CropPost {
  id: string;
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
  bids: Bid[];
  status: 'Active' | 'SoldOut' | 'Ended' | 'Sold' | 'Expired';
  createdAt: number;
  bidEndTimestamp: number;
  liveLocation?: { latitude: number; longitude: number; timestamp: number } | null;
  auctionNotified?: boolean;
  selectedBidderId?: string | null;
  selectedBidderNotifiedAt?: number | null;
}

interface FundingPost {
  id: string;
  farmerId: string;
  farmerName: string;
  farmerProfilePic: string | null;
  farmerRating?: number;
  images: string[];
  title: string;
  landTitle?: string;
  description: string;
  city: string;
  address: string;
  targetAmount?: number;
  investedAmount?: number;
  status: 'Active' | 'SoldOut' | 'Open' | 'Funded';
  createdAt: number;
  liveLocation?: { latitude: number; longitude: number; timestamp: number } | null;
}

interface Bid {
  id: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  timestamp: number;
  cancelled: boolean;
  paymentConfirmed?: boolean;
  wonTimestamp?: number;
  penaltyApplied?: boolean;
  confirmPayData?: any;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  text: string;
  image?: string;
  audio?: string;
  audioDuration?: number;
  timestamp: number;
  read: boolean;
}

export interface NotificationMessage {
  en: string;
  ur: string;
}

interface Notification {
  id: string;
  userId: string;
  en?: string;
  ur?: string;
  message?: NotificationMessage;
  timestamp: number;
  read: boolean;
}

interface Complaint {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userProfilePic: string | null;
  problemTitle: string;
  problemDetail: string;
  screenshots: string[];
  timestamp: number;
  status?: string;
  adminReply?: string;
  viewedByAdmin?: boolean;
  createdAt?: any;
  createdAtMillis?: number;
}

interface Order {
  id: string;
  postId: string;
  cropTitle: string;
  farmerId: string;
  farmerName?: string;
  buyerId: string;
  buyerName: string;
  bidAmount: number;
  paymentConfirmed: boolean;
  wonTimestamp?: number;
  status: 'Active' | 'Cancelled' | 'PendingPayment' | 'PaymentSent' | 'Completed';
  cancelledBy?: string;
  createdAt?: any;
  createdAtMillis?: number;
}

interface FarmerPayment {
  id: string;
  orderId: string;
  farmerId: string;
  buyerId: string;
  amount: number;
  status: 'Pending' | 'Paid' | 'Released';
  createdAt: any;
  createdAtMillis: number;
}

interface InvestmentOrder {
  id: string;
  postId: string;
  investorId: string;
  investorName: string;
  farmerId: string;
  farmerName: string;
  amount: number;
  postTitle: string;
  status: 'PendingPayment' | 'PaymentSent' | 'Approved' | 'Rejected';
  paymentConfirmed: boolean;
  adminApproved?: boolean;
  createdAt?: any;
  createdAtMillis: number;
}

type Updater<T> = T | ((prev: T) => T);

type DailyPostCounts = Record<string, number>;

interface AppContextType {
  users: User[];
  setUsers: (u: Updater<User[]>) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  cropPosts: CropPost[];
  setCropPosts: (p: Updater<CropPost[]>) => void;
  fundingPosts: FundingPost[];
  setFundingPosts: (p: Updater<FundingPost[]>) => void;
  messages: Message[];
  setMessages: (m: Updater<Message[]>) => void;
  notifications: Notification[];
  setNotifications: (n: Updater<Notification[]>) => void;
  complaints: Complaint[];
  setComplaints: (c: Updater<Complaint[]>) => void;
  lastRegisteredName: string;
  setLastRegisteredName: (name: string) => void;
  addNotification: (userId: string, message: NotificationMessage) => void;
  addPenaltyToBuyer: (buyerId: string) => void;
  getDailyPostCount: (farmerId: string) => number;
  incrementDailyPostCount: (farmerId: string) => void;
  blockedUsers: Record<string, string[]>;
  blockUser: (blockerId: string, blockedId: string) => void;
  unblockUser: (blockerId: string, blockedId: string) => void;
  isBlocked: (blockerId: string, blockedId: string) => boolean;
  orders: Order[];
  setOrders: (o: Updater<Order[]>) => void;
  farmerPayments: FarmerPayment[];
  setFarmerPayments: (p: Updater<FarmerPayment[]>) => void;
  investmentOrders: InvestmentOrder[];
  setInvestmentOrders: (o: Updater<InvestmentOrder[]>) => void;
  addPenaltyToInvestor: (investorId: string) => void;
  clearAppSessionState: () => void;
  markCropPostDeleted: (postId: string) => void;
  markFundingPostDeleted: (postId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Stable constant — lives outside the component so it never triggers re-renders
const MAIN_ADMIN: User = {
  id: 'main-admin-001',
  firstName: 'Muhammad',
  lastName: 'Muavia',
  email: 'muavia@gmail.com',
  phone: '03001234567',
  city: 'RYK',
  address: 'Airport Road',
  cnic: '',
  password: 'muavia',
  role: 'Admin',
  profilePic: null,
  accountStatus: 'Approved',
  rating: 0,
  reviews: [],
  registeredAt: 0,
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<User[]>([MAIN_ADMIN]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cropPosts, setCropPosts] = useState<CropPost[]>([]);
  const [fundingPosts, setFundingPosts] = useState<FundingPost[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [lastRegisteredName, setLastRegisteredName] = useState<string>('');
  const [dailyPostCounts, setDailyPostCounts] = useState<DailyPostCounts>({});
  const [blockedUsers, setBlockedUsers] = useState<Record<string, string[]>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [farmerPayments, setFarmerPayments] = useState<FarmerPayment[]>([]);
  const [investmentOrders, setInvestmentOrders] = useState<InvestmentOrder[]>([]);

  // ── Tracks post IDs that have been optimistically deleted locally.
  const deletedCropPostIdsRef = useRef<Set<string>>(new Set());
  const deletedFundingPostIdsRef = useRef<Set<string>>(new Set());

  // ── Guards: prevent duplicate listeners when onAuthStateChanged fires for Main Admin
  const adminListenerActiveRef = useRef<boolean>(false);
  const cropPostsListenerActiveRef = useRef<boolean>(false);
  const fundingPostsListenerActiveRef = useRef<boolean>(false);

  // ── Refs for unsubscribing ───────────────────────────────────────────────
  const unsubscribeUsersRef = useRef<(() => void) | null>(null);
  const unsubscribeCropPostsRef = useRef<(() => void) | null>(null);
  const unsubscribeFundingPostsRef = useRef<(() => void) | null>(null);
  const unsubscribeMessagesRef = useRef<(() => void) | null>(null);
  const unsubscribeNotificationsRef = useRef<(() => void) | null>(null);
  const unsubscribeComplaintsRef = useRef<(() => void) | null>(null);
  const unsubscribeOrdersRef = useRef<(() => void) | null>(null);
  const unsubscribeFarmerPaymentsRef = useRef<(() => void) | null>(null);
  const unsubscribeInvestmentsRef = useRef<(() => void) | null>(null);
  const unsubscribeInvestmentOrdersRef = useRef<(() => void) | null>(null);

  // ── Real-time Firestore listener for USERS ────────────────────────────────
  const startUsersListener = () => {
    if (unsubscribeUsersRef.current) {
      unsubscribeUsersRef.current();
      unsubscribeUsersRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('users')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const firestoreUsers: User[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id:            doc.id,
              firstName:     d.firstName     || '',
              lastName:      d.lastName      || '',
              email:         d.email         || '',
              phone:         d.phone         || '',
              city:          d.city          || '',
              address:       d.address       || '',
              cnic:          d.cnic          || '',
              password:      '',
              role:          d.role          || 'Farmer',
              profilePic:    d.profilePic    || null,
              cnicFront:     d.cnicFront     || null,
              cnicBack:      d.cnicBack      || null,
              livenessVideo: d.livenessVideo || null,
              accountStatus: d.accountStatus || 'Pending',
              rating:        d.rating        || 0,
              reviews:       d.reviews       || [],
              penalties:     d.penalties     || 0,
              registeredAt:  d.createdAtMillis || (d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.registeredAt || 0)),
            };
          });
          setUsers([MAIN_ADMIN, ...firestoreUsers]);
        },
        error => {
          console.warn('[AppContext] Firestore users snapshot error:', error);
          setTimeout(() => startUsersListener(), 3000);
        },
      );

    unsubscribeUsersRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for CROP POSTS ────────────────────────────
  const startCropPostsListener = () => {
    // Guard: if already listening, never restart. Restarting tears down the
    // current listener and fires a brand-new full snapshot that races with any
    // in-flight delete, causing the deleted post to flicker back into the list.
    if (cropPostsListenerActiveRef.current) return;

    if (unsubscribeCropPostsRef.current) {
      unsubscribeCropPostsRef.current();
      unsubscribeCropPostsRef.current = null;
    }

    cropPostsListenerActiveRef.current = true;

    const unsubscribe = firestore()
      .collection('cropPosts')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: true },
        snapshot => {
          // Skip intermediate snapshots caused by pending local writes.
          // Without this, a delete fires the snapshot twice: once while the
          // write is pending (doc still present) and once confirmed (doc gone).
          // The pending snapshot overwrites the optimistic setCropPosts filter,
          // causing the post to flicker back and the count to jump.
          if (snapshot.metadata.hasPendingWrites) return;

          const posts: CropPost[] = snapshot.docs
            .filter(doc => !deletedCropPostIdsRef.current.has(doc.id))
            .map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              farmerId: d.farmerId || '',
              farmerName: d.farmerName || '',
              farmerProfilePic: d.farmerProfilePic || null,
              farmerRating: d.farmerRating || 0,
              images: d.images || [],
              cropTitle: d.cropTitle || '',
              description: d.description || '',
              city: d.city || '',
              address: d.address || '',
              paymentMethod: d.paymentMethod || '',
              paymentAccountNumber: d.paymentAccountNumber || '',
              paymentName: d.paymentName || '',
              bidEndDay: d.bidEndDay || '',
              bidEndHour: d.bidEndHour || '',
              bidEndMinute: d.bidEndMinute || '',
              basePrice: d.basePrice || '0',
              bids: (d.bids || []).map((b: any) => ({
                id:               b.id               || '',
                bidderId:         b.bidderId         || '',
                bidderName:       b.bidderName       || '',
                amount:           typeof b.amount === 'number' ? b.amount : Number(b.amount) || 0,
                // Convert Firestore Timestamps → plain millisecond numbers.
                // Without this, wonTimestamp arrives as a Timestamp object.
                // Arithmetic on an object gives NaN / string concat, which
                // makes the 24-hour deadline check always false → instant penalty.
                timestamp:        b.timestamp?.toMillis ? b.timestamp.toMillis() : (typeof b.timestamp === 'number' ? b.timestamp : 0),
                wonTimestamp:     b.wonTimestamp?.toMillis ? b.wonTimestamp.toMillis() : (typeof b.wonTimestamp === 'number' ? b.wonTimestamp : (b.wonTimestamp ? Number(b.wonTimestamp) : undefined)),
                cancelled:        b.cancelled         || false,
                paymentConfirmed: b.paymentConfirmed  || false,
                penaltyApplied:   b.penaltyApplied    || false,
                confirmPayData:   b.confirmPayData    || null,
              })),
              status: d.status || 'Active',
              createdAt: d.createdAtMillis
                ? d.createdAtMillis
                : (d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now()),
              bidEndTimestamp: d.bidEndTimestamp?.toMillis
                ? d.bidEndTimestamp.toMillis()
                : (typeof d.bidEndTimestamp === 'number' ? d.bidEndTimestamp : 0),
              liveLocation: d.liveLocation || null,
              auctionNotified: d.auctionNotified || false,
              selectedBidderId: d.selectedBidderId || null,
              selectedBidderNotifiedAt: d.selectedBidderNotifiedAt?.toMillis
                ? d.selectedBidderNotifiedAt.toMillis()
                : (typeof d.selectedBidderNotifiedAt === 'number' ? d.selectedBidderNotifiedAt : null),
            };
          });
          setCropPosts(posts);
        },
        error => {
          console.warn('[AppContext] Firestore cropPosts snapshot error:', error);
          cropPostsListenerActiveRef.current = false;
          setTimeout(() => startCropPostsListener(), 3000);
        },
      );

    unsubscribeCropPostsRef.current = () => {
      cropPostsListenerActiveRef.current = false;
      unsubscribe();
    };
  };

  // ── Real-time Firestore listener for FUNDING POSTS ─────────────────────────
  const startFundingPostsListener = () => {
    // Same guard as cropPosts — never restart a running listener.
    if (fundingPostsListenerActiveRef.current) return;

    if (unsubscribeFundingPostsRef.current) {
      unsubscribeFundingPostsRef.current();
      unsubscribeFundingPostsRef.current = null;
    }

    fundingPostsListenerActiveRef.current = true;

    const unsubscribe = firestore()
      .collection('fundingPosts')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: true },
        snapshot => {
          // Same guard as cropPosts — skip pending-write snapshots.
          if (snapshot.metadata.hasPendingWrites) return;

          const posts: FundingPost[] = snapshot.docs
            .filter(doc => !deletedFundingPostIdsRef.current.has(doc.id))
            .map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              farmerId: d.farmerId || '',
              farmerName: d.farmerName || '',
              farmerProfilePic: d.farmerProfilePic || null,
              farmerRating: d.farmerRating || 0,
              images: d.images || [],
              title: d.title || d.landTitle || '',
              landTitle: d.landTitle || d.title || '',
              description: d.description || '',
              city: d.city || '',
              address: d.address || '',
              targetAmount: d.targetAmount || 0,
              investedAmount: d.investedAmount || 0,
              status: d.status || 'Open',
              createdAt: d.createdAtMillis || Date.now(),
              liveLocation: d.liveLocation || null,
            };
          });
          setFundingPosts(posts);
        },
        error => {
          console.warn('[AppContext] Firestore fundingPosts snapshot error:', error);
          fundingPostsListenerActiveRef.current = false;
          setTimeout(() => startFundingPostsListener(), 3000);
        },
      );

    unsubscribeFundingPostsRef.current = () => {
      fundingPostsListenerActiveRef.current = false;
      unsubscribe();
    };
  };

  // ── Real-time Firestore listener for MESSAGES ──────────────────────────────
  const startMessagesListener = (userId?: string, isAdminUser?: boolean) => {
    // If the admin all-messages listener is already running, do not restart it.
    // This prevents the duplicate-listener flicker when onAuthStateChanged fires
    // for the Main Admin who already has a listener from the initial mount.
    if (isAdminUser && adminListenerActiveRef.current) {
      return;
    }

    if (unsubscribeMessagesRef.current) {
      unsubscribeMessagesRef.current();
      unsubscribeMessagesRef.current = null;
    }

    let query1: any;
    let query2: any;

    if (!userId || isAdminUser) {
      const unsubAll = firestore()
        .collection('messages')
        .orderBy('createdAtMillis', 'asc')
        .limit(1000)
        .onSnapshot(
          { includeMetadataChanges: false },
          snapshot => {
            // Skip snapshots from pending local writes — these are
            // intermediate states before Firestore confirms the write.
            // Without this guard, a serverTimestamp() field causes the
            // snapshot to fire twice (pending + confirmed), creating flicker.
            if (snapshot.metadata.hasPendingWrites) return;

            // Simple, clean replacement — no merging, no optimistic logic.
            // The query is ordered ASC so messages are already in correct
            // chronological order for display.
            const msgs: Message[] = snapshot.docs.map(doc => {
              const d = doc.data();
              const effectiveSenderId = d.senderDisplayId || d.senderId || '';
              return {
                id: doc.id,
                senderId: effectiveSenderId,
                senderName: d.senderName || '',
                senderRole: d.senderRole || '',
                receiverId: d.receiverId || '',
                text: d.text || '',
                image: d.image || '',
                audio: d.audio || '',
                audioDuration: d.audioDuration || 0,
                timestamp: d.timestamp || d.createdAtMillis || Date.now(),
                read: d.read || false,
              };
            });
            setMessages(msgs);
          },
          error => {
            console.warn('[AppContext] Firestore messages (admin) snapshot error:', error);
            setTimeout(() => startMessagesListener(userId, isAdminUser), 3000);
          },
        );
      adminListenerActiveRef.current = true;
      unsubscribeMessagesRef.current = () => {
        adminListenerActiveRef.current = false;
        unsubAll();
      };
      return;
    }

    let sentMsgs: Message[] = [];
    let receivedMsgs: Message[] = [];

    const mergeMsgs = () => {
      const all = [...sentMsgs, ...receivedMsgs];
      const seen = new Set<string>();
      const deduped = all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
      deduped.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(prev => {
        const localReadIds = new Set(prev.filter(m => m.read).map(m => m.id));
        return deduped.map(m => localReadIds.has(m.id) ? { ...m, read: true } : m);
      });
    };

    const mapMsg = (doc: any): Message => {
      const d = doc.data();
      const effectiveSenderId = d.senderDisplayId || d.senderId || '';
      return {
        id: doc.id,
        senderId: effectiveSenderId,
        senderName: d.senderName || '',
        senderRole: d.senderRole || '',
        receiverId: d.receiverId || '',
        text: d.text || '',
        image: d.image || '',
        audio: d.audio || '',
        audioDuration: d.audioDuration || 0,
        timestamp: d.timestamp || d.createdAtMillis || Date.now(),
        read: d.read || false,
      };
    };

    const unsubSent = firestore()
      .collection('messages')
      .where('senderDisplayId', '==', userId)
      .orderBy('createdAtMillis', 'desc')
      .limit(500)
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          sentMsgs = snapshot.docs.map(mapMsg);
          mergeMsgs();
        },
        () => {
          firestore()
            .collection('messages')
            .where('senderId', '==', userId)
            .orderBy('createdAtMillis', 'desc')
            .limit(500)
            .onSnapshot(
              { includeMetadataChanges: false },
              snapshot => { sentMsgs = snapshot.docs.map(mapMsg); mergeMsgs(); },
              err2 => console.warn('[AppContext] messages sentMsgs fallback error:', err2),
            );
        },
      );

    const unsubReceived = firestore()
      .collection('messages')
      .where('receiverId', '==', userId)
      .orderBy('createdAtMillis', 'desc')
      .limit(500)
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          receivedMsgs = snapshot.docs.map(mapMsg);
          mergeMsgs();
        },
        error => {
          console.warn('[AppContext] Firestore messages receivedMsgs snapshot error:', error);
        },
      );

    unsubscribeMessagesRef.current = () => { unsubSent(); unsubReceived(); };
  };

  // ── Real-time Firestore listener for NOTIFICATIONS ─────────────────────────
  const startNotificationsListener = (userId?: string, isAdminUser?: boolean) => {
    if (unsubscribeNotificationsRef.current) {
      unsubscribeNotificationsRef.current();
      unsubscribeNotificationsRef.current = null;
    }

    const mapNotif = (doc: any): Notification => {
      const d = doc.data();
      return {
        id: doc.id,
        userId: d.userId || '',
        en: d.en || '',
        ur: d.ur || '',
        message: { en: d.en || '', ur: d.ur || '' },
        timestamp: d.createdAtMillis || Date.now(),
        read: d.read || false,
      };
    };

    const handleSnapshot = (snapshot: any) => {
      const notifs: Notification[] = snapshot.docs.map(mapNotif);
      setNotifications(prev => {
        const realIds = new Set(notifs.map(n => n.id));
        const onlyLocals = prev.filter(n => n.id.startsWith('local_') && !realIds.has(n.id));
        return [...onlyLocals, ...notifs];
      });
    };

    let query: any;
    if (!userId || isAdminUser) {
      query = firestore().collection('notifications').orderBy('createdAtMillis', 'desc').limit(100);
    } else {
      query = firestore().collection('notifications').where('userId', '==', userId).orderBy('createdAtMillis', 'desc').limit(100);
    }

    const unsubscribe = query.onSnapshot(
      { includeMetadataChanges: false },
      handleSnapshot,
      (error: any) => {
        console.warn('[AppContext] Firestore notifications snapshot error:', error);
        setTimeout(() => startNotificationsListener(userId, isAdminUser), 3000);
      },
    );

    unsubscribeNotificationsRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for COMPLAINTS ────────────────────────────
  const startComplaintsListener = () => {
    if (unsubscribeComplaintsRef.current) {
      unsubscribeComplaintsRef.current();
      unsubscribeComplaintsRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('complaints')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const comps: Complaint[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              userId: d.userId || '',
              userName: d.userName || '',
              userRole: d.userRole || '',
              userProfilePic: d.userProfilePic || null,
              problemTitle: d.problemTitle || '',
              problemDetail: d.problemDetail || '',
              screenshots: d.screenshots || [],
              timestamp: d.createdAtMillis || Date.now(),
              status: d.status || 'Open',
              adminReply: d.adminReply || '',
              viewedByAdmin: d.viewedByAdmin || false,
              createdAt: d.createdAt,
              createdAtMillis: d.createdAtMillis,
            };
          });
          setComplaints(comps);
        },
        error => {
          console.warn('[AppContext] Firestore complaints snapshot error:', error);
          setTimeout(() => startComplaintsListener(), 3000);
        },
      );

    unsubscribeComplaintsRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for ORDERS ────────────────────────────────
  const startOrdersListener = () => {
    if (unsubscribeOrdersRef.current) {
      unsubscribeOrdersRef.current();
      unsubscribeOrdersRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('orders')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const ords: Order[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              postId: d.postId || '',
              cropTitle: d.cropTitle || '',
              farmerId: d.farmerId || '',
              farmerName: d.farmerName || '',
              buyerId: d.buyerId || '',
              buyerName: d.buyerName || '',
              bidAmount: d.bidAmount || 0,
              paymentConfirmed: d.paymentConfirmed || false,
              wonTimestamp: d.wonTimestamp,
              status: d.status || 'PendingPayment',
              cancelledBy: d.cancelledBy,
              createdAt: d.createdAt,
              createdAtMillis: d.createdAtMillis,
            };
          });
          setOrders(ords);
        },
        error => {
          console.warn('[AppContext] Firestore orders snapshot error:', error);
          setTimeout(() => startOrdersListener(), 3000);
        },
      );

    unsubscribeOrdersRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for FARMER PAYMENTS ───────────────────────
  const startFarmerPaymentsListener = () => {
    if (unsubscribeFarmerPaymentsRef.current) {
      unsubscribeFarmerPaymentsRef.current();
      unsubscribeFarmerPaymentsRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('farmerPayments')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const payments: FarmerPayment[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              orderId: d.orderId || '',
              farmerId: d.farmerId || '',
              buyerId: d.buyerId || '',
              amount: d.amount || 0,
              status: d.status || 'Pending',
              createdAt: d.createdAt,
              createdAtMillis: d.createdAtMillis || Date.now(),
            };
          });
          setFarmerPayments(payments);
        },
        error => {
          console.warn('[AppContext] Firestore farmerPayments snapshot error:', error);
        },
      );

    unsubscribeFarmerPaymentsRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for INVESTMENTS ───────────────────────────
  const startInvestmentsListener = () => {
    if (unsubscribeInvestmentsRef.current) {
      unsubscribeInvestmentsRef.current();
      unsubscribeInvestmentsRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('investments')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {},
        error => {},
      );

    unsubscribeInvestmentsRef.current = unsubscribe;
  };

  // ── Real-time Firestore listener for INVESTMENT ORDERS ─────────────────────
  const startInvestmentOrdersListener = () => {
    if (unsubscribeInvestmentOrdersRef.current) {
      unsubscribeInvestmentOrdersRef.current();
      unsubscribeInvestmentOrdersRef.current = null;
    }

    const unsubscribe = firestore()
      .collection('investmentOrders')
      .orderBy('createdAtMillis', 'desc')
      .onSnapshot(
        { includeMetadataChanges: false },
        snapshot => {
          const ords: InvestmentOrder[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              postId: d.postId || '',
              investorId: d.investorAppId || d.investorId || '',
              investorName: d.investorName || '',
              farmerId: d.farmerId || '',
              farmerName: d.farmerName || '',
              amount: d.amount || 0,
              postTitle: d.postTitle || '',
              status: d.status || 'PendingPayment',
              paymentConfirmed: d.paymentConfirmed || false,
              adminApproved: d.adminApproved || false,
              createdAt: d.createdAt,
              createdAtMillis: d.createdAtMillis || Date.now(),
            };
          });
          setInvestmentOrders(ords);
        },
        error => {
          console.warn('[AppContext] investmentOrders snapshot error:', error);
        },
      );

    unsubscribeInvestmentOrdersRef.current = unsubscribe;
  };

  // ── Start listeners on mount — only collections that don't need auth context
  // Orders and farmerPayments require an authenticated user (permission-denied
  // if called before Firebase Auth resolves). They are started inside the
  // onAuthStateChanged handler below instead.
  useEffect(() => {
    startUsersListener();
    startCropPostsListener();
    startFundingPostsListener();
    startMessagesListener(undefined, true);
    startNotificationsListener(undefined, true);
    startComplaintsListener();
    startInvestmentsListener();
    startInvestmentOrdersListener();

    return () => {
      if (unsubscribeUsersRef.current) unsubscribeUsersRef.current();
      if (unsubscribeCropPostsRef.current) unsubscribeCropPostsRef.current();
      if (unsubscribeFundingPostsRef.current) unsubscribeFundingPostsRef.current();
      if (unsubscribeMessagesRef.current) unsubscribeMessagesRef.current();
      if (unsubscribeNotificationsRef.current) unsubscribeNotificationsRef.current();
      if (unsubscribeComplaintsRef.current) unsubscribeComplaintsRef.current();
      if (unsubscribeOrdersRef.current) unsubscribeOrdersRef.current();
      if (unsubscribeFarmerPaymentsRef.current) unsubscribeFarmerPaymentsRef.current();
      if (unsubscribeInvestmentsRef.current) unsubscribeInvestmentsRef.current();
      if (unsubscribeInvestmentOrdersRef.current) unsubscribeInvestmentOrdersRef.current();
    };
  }, []);

  // ── Restart Firestore listeners + bootstrap FCM when a user signs IN ───────
  useEffect(() => {
    const MAIN_ADMIN_EMAIL = 'muavia@gmail.com';
    const unsubAuth = auth().onAuthStateChanged(firebaseUser => {
      if (firebaseUser) {
        startUsersListener();
        startCropPostsListener();
        startFundingPostsListener();
        const isAdminUser =
          (firebaseUser.email || '').toLowerCase() === MAIN_ADMIN_EMAIL;

        // ── CRITICAL FIX: Main Admin already has a permanent "all messages"
        // listener started at mount. NEVER restart it here — doing so causes
        // the listener to tear down and re-attach, firing a full snapshot that
        // produces the visible flicker whenever a user replies to the admin
        // (because ensureMainAdminSession() re-signs-in on session expiry,
        // triggering onAuthStateChanged again).
        if (!isAdminUser) {
          startMessagesListener(firebaseUser.uid, false);
        }
        // For notifications: same guard — admin listener is already running
        if (!isAdminUser) {
          startNotificationsListener(firebaseUser.uid, false);
        }

        startComplaintsListener();
        startOrdersListener();
        startFarmerPaymentsListener();
        startInvestmentsListener();
        startInvestmentOrdersListener();

        // ── Bootstrap FCM: request permission + save token + register listeners
        bootstrapFCM(firebaseUser.uid).catch(e =>
          console.warn('[AppContext] bootstrapFCM error:', e)
        );
      } else {
        // User signed out — release FCM listeners
        releaseFCMListeners();
      }
    });
    return () => unsubAuth();
  }, []);

  // ── Keep currentUser in sync with the Firestore users listener ─────────────
  // When a buyer/investor submits a review, the Firestore listener updates `users`.
  // Without this effect, `currentUser` (used by FarmerProfileScreen) stays stale
  // until logout/login. This ensures the farmer sees new reviews instantly.
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  useEffect(() => {
    if (!currentUserRef.current) return;
    const updated = users.find(u => u.id === currentUserRef.current!.id);
    if (updated && updated !== currentUserRef.current) {
      setCurrentUser(updated);
    }
  }, [users]);

  // ── In-flight guard: tracks notifications currently being written to Firestore.
  // Keyed by `userId|en` to block concurrent calls for the exact same message
  // (e.g. AuctionBootstrap tick racing with handleSelectBuyer).
  const inFlightNotifRef = useRef<Set<string>>(new Set());

  const addNotification = (userId: string, message: NotificationMessage) => {
    const dedupeKey = `${userId}|${message.en}`;
    const now = Date.now();

    const newNotif: Notification = {
      id: `local_${now}`,
      userId,
      en: message.en,
      ur: message.ur,
      message,
      timestamp: now,
      read: false,
    };

    // ── 1. Block if an identical message was already sent in the last 30 s
    //        OR if it is currently in-flight to Firestore.
    let isDuplicate = false;
    setNotifications(prev => {
      if (inFlightNotifRef.current.has(dedupeKey)) {
        isDuplicate = true;
        return prev;
      }
      const alreadyExists = prev.some(
        n =>
          n.userId === userId &&
          n.en === message.en &&
          Math.abs(n.timestamp - now) < 30_000, // 30-second window
      );
      if (alreadyExists) {
        isDuplicate = true;
        return prev;
      }
      inFlightNotifRef.current.add(dedupeKey);
      return [newNotif, ...prev];
    });

    if (isDuplicate) return;

    addNotificationToFirebase(userId, message)
      .catch(e => console.warn('[addNotification] Firestore persist failed:', e))
      .finally(() => {
        // Release the in-flight lock after 30 s so genuine repeats (e.g. a
        // second penalty notice) can still be delivered after that window.
        setTimeout(() => inFlightNotifRef.current.delete(dedupeKey), 30_000);
      });
  };

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDailyPostCount = (farmerId: string): number => {
    const key = `${farmerId}_${getTodayStr()}`;
    return dailyPostCounts[key] ?? 0;
  };

  const incrementDailyPostCount = (farmerId: string) => {
    const key = `${farmerId}_${getTodayStr()}`;
    setDailyPostCounts(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  const blockUser = (blockerId: string, blockedId: string) => {
    setBlockedUsers(prev => ({
      ...prev,
      [blockerId]: [...(prev[blockerId] ?? []), blockedId],
    }));
  };

  const unblockUser = (blockerId: string, blockedId: string) => {
    setBlockedUsers(prev => ({
      ...prev,
      [blockerId]: (prev[blockerId] ?? []).filter(id => id !== blockedId),
    }));
  };

  const isBlocked = (blockerId: string, blockedId: string): boolean =>
    (blockedUsers[blockerId] ?? []).includes(blockedId);

  const clearAppSessionState = () => {
    setCurrentUser(null);
    setNotifications([]);
    setMessages([]);
    setComplaints([]);
    setCropPosts([]);
    setFundingPosts([]);
    setOrders([]);
    setFarmerPayments([]);
    setInvestmentOrders([]);
    // Reset all listener guards so listeners can restart cleanly on next login
    adminListenerActiveRef.current = false;
    // Calling unsubscribeCropPostsRef.current() sets cropPostsListenerActiveRef
    // to false via the wrapped unsubscribe we assigned in startCropPostsListener.
    if (unsubscribeCropPostsRef.current) {
      unsubscribeCropPostsRef.current();
      unsubscribeCropPostsRef.current = null;
    }
    if (unsubscribeFundingPostsRef.current) {
      unsubscribeFundingPostsRef.current();
      unsubscribeFundingPostsRef.current = null;
    }
    // Also wipe the deleted-post ID sets on session end
    deletedCropPostIdsRef.current.clear();
    deletedFundingPostIdsRef.current.clear();
    if (unsubscribeMessagesRef.current) {
      unsubscribeMessagesRef.current();
      unsubscribeMessagesRef.current = null;
    }
    startMessagesListener(undefined, true);
    startNotificationsListener(undefined, true);
    startCropPostsListener();
    startFundingPostsListener();
  };

  const addPenaltyToInvestor = (investorId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id !== investorId) { return u; }
      const currentPenalties = (u.penalties || 0) + 1;
      const newStatus = currentPenalties >= 3 ? 'Suspended' : u.accountStatus;

      db.collection('users').doc(investorId).update({
        penalties: currentPenalties,
        accountStatus: newStatus,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }).catch(e => console.warn('[addPenaltyToInvestor] Firestore update failed:', e));

      if (currentPenalties >= 3) {
        addNotification(investorId, {
          en: '🚫 Your investor account has been suspended due to 3 consecutive penalties (failed/rejected investments).',
          ur: '🚫 آپ کا سرمایہ کار اکاؤنٹ 3 مسلسل جرمانوں کی وجہ سے معطل کر دیا گیا ہے۔',
        });
        setCurrentUser(prev =>
          prev && prev.id === investorId
            ? { ...prev, penalties: currentPenalties, accountStatus: 'Suspended' as const }
            : prev
        );
        return { ...u, penalties: currentPenalties, accountStatus: 'Suspended' };
      }
      addNotification(investorId, {
        en: `⚠️ You have received penalty ${currentPenalties}/3. If you accumulate 3 penalties, your investor account will be suspended.`,
        ur: `⚠️ آپ کو جرمانہ ${currentPenalties}/3 ملا ہے۔ 3 جرمانوں پر سرمایہ کار اکاؤنٹ معطل ہوگا۔`,
      });
      setCurrentUser(prev =>
        prev && prev.id === investorId
          ? { ...prev, penalties: currentPenalties }
          : prev
      );
      return { ...u, penalties: currentPenalties };
    }));
  };

  const markCropPostDeleted = (postId: string) => {
    // Keep the ID in the set indefinitely — Firestore's own delete event will
    // eventually fire a snapshot WITHOUT the doc, at which point the filter is
    // a no-op anyway. Clearing it early is what causes the rollback.
    deletedCropPostIdsRef.current.add(postId);
  };

  const markFundingPostDeleted = (postId: string) => {
    deletedFundingPostIdsRef.current.add(postId);
  };

  const addPenaltyToBuyer = (buyerId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id !== buyerId) { return u; }
      const currentPenalties = (u.penalties || 0) + 1;
      const newStatus = currentPenalties >= 3 ? 'Suspended' : u.accountStatus;

      db.collection('users').doc(buyerId).update({
        penalties: currentPenalties,
        accountStatus: newStatus,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }).catch(e => console.warn('[addPenaltyToBuyer] Firestore update failed:', e));

      if (currentPenalties >= 3) {
        addNotification(buyerId, {
          en: '🚫 Your account has been suspended due to 3 consecutive penalties (cancelled orders / missed payments).',
          ur: '🚫 آپ کا اکاؤنٹ 3 مسلسل جرمانوں کی وجہ سے معطل کر دیا گیا ہے۔',
        });
        setCurrentUser(prev =>
          prev && prev.id === buyerId
            ? { ...prev, penalties: currentPenalties, accountStatus: 'Suspended' as const }
            : prev
        );
        return { ...u, penalties: currentPenalties, accountStatus: 'Suspended' };
      }
      addNotification(buyerId, {
        en: `⚠️ You have received penalty ${currentPenalties}/3. If you accumulate 3 consecutive penalties, your account will be suspended.`,
        ur: `⚠️ آپ کو جرمانہ ${currentPenalties}/3 ملا ہے۔ 3 مسلسل جرمانوں پر اکاؤنٹ معطل ہوگا۔`,
      });
      setCurrentUser(prev =>
        prev && prev.id === buyerId
          ? { ...prev, penalties: currentPenalties }
          : prev
      );
      return { ...u, penalties: currentPenalties };
    }));
  };

  return (
    <AppContext.Provider
      value={{
        users,
        setUsers,
        currentUser,
        setCurrentUser,
        cropPosts,
        setCropPosts,
        fundingPosts,
        setFundingPosts,
        messages,
        setMessages,
        notifications,
        setNotifications,
        complaints,
        setComplaints,
        lastRegisteredName,
        setLastRegisteredName,
        addNotification,
        addPenaltyToBuyer,
        getDailyPostCount,
        incrementDailyPostCount,
        blockedUsers,
        blockUser,
        unblockUser,
        isBlocked,
        orders,
        setOrders,
        farmerPayments,
        setFarmerPayments,
        investmentOrders,
        setInvestmentOrders,
        addPenaltyToInvestor,
        clearAppSessionState,
        markCropPostDeleted,
        markFundingPostDeleted,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) { throw new Error('useApp must be used within AppProvider'); }
  return context;
};
