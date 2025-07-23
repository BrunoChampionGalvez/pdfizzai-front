import { create } from 'zustand';
import type { DbSubscription, SubscriptionUsage, SubscriptionPlan } from '../services/payment';

export interface UserFilePagesCount {
  totalFilePages: number;
}

interface SubscriptionState {
  dbSubscription: DbSubscription | null;
  subscriptionUsage: SubscriptionUsage | null;
  userFilePagesCount: UserFilePagesCount | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setDbSubscription: (subscription: DbSubscription | null) => void;
  setSubscriptionUsage: (usage: SubscriptionUsage | null) => void;
  setUserFilePagesCount: (count: UserFilePagesCount | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Computed getters
  isSubscriptionActive: () => boolean;
  isTrialUser: () => boolean;
  hasExceededMessageLimit: () => boolean;
  hasExceededFileLimit: () => boolean;
  getCurrentMessageLimit: () => number;
  getCurrentFilePagesLimit: () => number;
  getMessagesRemaining: () => number;
  getFilePagesRemaining: () => number;
  getNextBillingDate: () => Date | null;
  
  // Reset function
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  dbSubscription: null,
  subscriptionUsage: null,
  userFilePagesCount: null,
  isLoading: false,
  error: null,
  
  setDbSubscription: (subscription) => set({ dbSubscription: subscription }),
  setSubscriptionUsage: (usage) => set({ subscriptionUsage: usage }),
  setUserFilePagesCount: (count) => set({ userFilePagesCount: count }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  // Check if subscription is active (either active or trialing)
  isSubscriptionActive: () => {
    const { dbSubscription } = get();
    return dbSubscription?.status === 'active' || dbSubscription?.status === 'trialing';
  },
  
  // Check if user is on trial
  isTrialUser: () => {
    const { dbSubscription } = get();
    return dbSubscription?.status === 'trialing' || dbSubscription?.hasTrialPeriod === true;
  },
  
  // Check if user has exceeded message limit
  hasExceededMessageLimit: () => {
    const { subscriptionUsage, dbSubscription } = get();
    if (!subscriptionUsage) return false; // If we don't know the usage, allow messages
    
    const messageLimit = get().getCurrentMessageLimit(); // This now handles missing subscription/plan
    return subscriptionUsage.messagesUsed >= messageLimit + (dbSubscription?.messagesLeftBeforeUpgrade || 0);
  },
  
  // Check if user has exceeded file limit
  hasExceededFileLimit: () => {
    const { userFilePagesCount, dbSubscription } = get();
    if (!userFilePagesCount) return false; // If we don't know the count, allow uploads

    const filePagesLimit = get().getCurrentFilePagesLimit(); // This now handles missing subscription/plan
    return userFilePagesCount.totalFilePages >= filePagesLimit + (dbSubscription?.filePagesLeftBeforeUpgrade || 0);
  },
  
  // Get current message limit based on trial status
  getCurrentMessageLimit: () => {
    const { dbSubscription } = get();
    if (!dbSubscription?.plan) return 50; // Default limit for users without subscription
    
    const isTrialUser = get().isTrialUser();
    return isTrialUser 
      ? dbSubscription.plan.trialMessagesLimit 
      : dbSubscription.plan.messagesLimit + (dbSubscription?.messagesLeftBeforeUpgrade || 0);
  },
  
  // Get current file limit based on trial status
  getCurrentFilePagesLimit: () => {
    const { dbSubscription } = get();
    if (!dbSubscription?.plan) return 10; // Default limit for users without subscription
    
    const isTrialUser = get().isTrialUser();
    return isTrialUser 
      ? dbSubscription.plan.trialFilePagesLimit 
      : dbSubscription.plan.filePagesLimit + (dbSubscription?.filePagesLeftBeforeUpgrade || 0);
  },
  
  // Get remaining messages
  getMessagesRemaining: () => {
    const { subscriptionUsage, dbSubscription } = get();
    const messageLimit = get().getCurrentMessageLimit();
    if (!subscriptionUsage) return messageLimit;

    return Math.max(0, messageLimit - subscriptionUsage.messagesUsed);
  },

  // Get remaining file pages
  getFilePagesRemaining: () => {
    const { userFilePagesCount, dbSubscription } = get();
    const filePagesLimit = get().getCurrentFilePagesLimit();
    if (!userFilePagesCount) return filePagesLimit;

    return Math.max(0, filePagesLimit - userFilePagesCount.totalFilePages);
  },
  
  // Get next billing date
  getNextBillingDate: () => {
    const { dbSubscription } = get();
    if (!dbSubscription?.nextBillingAt) return null;
    
    // Ensure we return a proper Date object
    const date = new Date(dbSubscription.nextBillingAt);
    if (isNaN(date.getTime())) {
      console.error('Invalid nextBillingAt date:', dbSubscription.nextBillingAt);
      return null;
    }
    return date;
  },
  
  // Reset all state
  reset: () => set({
    dbSubscription: null,
    subscriptionUsage: null,
    userFilePagesCount: null,
    isLoading: false,
    error: null,
  }),
}));
