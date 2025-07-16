import { paymentService } from './payment';
import { useSubscriptionStore } from '../store/subscription';

export const subscriptionService = {
  /**
   * Load all subscription data for a user
   */
  async loadUserSubscriptionData(userId: string): Promise<void> {
    const { 
      setLoading, 
      setError, 
      setDbSubscription, 
      setSubscriptionUsage, 
      setUserFilesCount 
    } = useSubscriptionStore.getState();

    try {
      setLoading(true);
      setError(null);

      // Fetch user's subscription
      const subscription = await paymentService.getUserSubscription(userId);
      setDbSubscription(subscription);

      if (subscription) {
        // Fetch subscription usage
        const usage = await paymentService.getUserSubscriptionUsage(userId);
        setSubscriptionUsage(usage);
      }

      // Fetch user's total files count
      const filesCount = await paymentService.getUserFilesCount(userId);
      setUserFilesCount(filesCount);

    } catch (error) {
      console.error('Error loading subscription data:', error);
      setError('Failed to load subscription data');
      throw error;
    } finally {
      setLoading(false);
    }
  },

  /**
   * Refresh just the files count (useful after file upload/delete)
   */
  async refreshFilesCount(userId: string): Promise<void> {
    const { setUserFilesCount } = useSubscriptionStore.getState();

    try {
      // Fetch user's total files count
      const filesCount = await paymentService.getUserFilesCount(userId);
      setUserFilesCount(filesCount);
    } catch (error) {
      console.error('Error refreshing files count:', error);
      // Don't throw - this is a nice-to-have refresh
    }
  },

  /**
   * Refresh just the message usage (useful after sending messages)
   */
  async refreshMessageUsage(userId: string): Promise<void> {
    const { setSubscriptionUsage, dbSubscription } = useSubscriptionStore.getState();

    try {
      // Only refresh if user has a subscription (otherwise usage doesn't matter)
      if (dbSubscription) {
        const usage = await paymentService.getUserSubscriptionUsage(userId);
        setSubscriptionUsage(usage);
      }
    } catch (error) {
      console.error('Error refreshing message usage:', error);
      // Don't throw - this is a nice-to-have refresh
    }
  },

  /**
   * Check if user has access to the app (active subscription)
   */
  hasAppAccess(): boolean {
    const { isSubscriptionActive } = useSubscriptionStore.getState();
    return isSubscriptionActive();
  },

  /**
   * Check if user can send messages
   */
  canSendMessages(): boolean {
    const { isSubscriptionActive, hasExceededMessageLimit } = useSubscriptionStore.getState();
    return isSubscriptionActive() && !hasExceededMessageLimit();
  },

  /**
   * Check if user can upload files
   */
  canUploadFiles(): boolean {
    const { isSubscriptionActive, hasExceededFileLimit } = useSubscriptionStore.getState();
    return isSubscriptionActive() && !hasExceededFileLimit();
  },

  /**
   * Get subscription status for display
   */
  getSubscriptionStatus(): {
    isActive: boolean;
    isTrial: boolean;
    hasSubscription: boolean;
    messagesRemaining: number;
    filesRemaining: number;
    nextBillingDate: Date | null;
    currentMessageLimit: number;
    currentFileLimit: number;
  } {
    const store = useSubscriptionStore.getState();
    
    return {
      isActive: store.isSubscriptionActive(),
      isTrial: store.isTrialUser(),
      hasSubscription: !!store.dbSubscription,
      messagesRemaining: store.getMessagesRemaining(),
      filesRemaining: store.getFilesRemaining(),
      nextBillingDate: store.getNextBillingDate(),
      currentMessageLimit: store.getCurrentMessageLimit(),
      currentFileLimit: store.getCurrentFileLimit(),
    };
  },

  /**
   * Reset subscription store
   */
  resetSubscriptionData(): void {
    const { reset } = useSubscriptionStore.getState();
    reset();
  },
};
