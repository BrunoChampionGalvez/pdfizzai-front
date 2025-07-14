import api from '../lib/api';

export interface SubscriptionUsage {
  chatMessagesUsed: number;
  chatMessagesLimit: number;
  pdfUploadsUsed: number;
  pdfUploadsLimit: number;
}

export interface SubscriptionInfo {
  id: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  nextBillingDate: string;
  endDate?: string;
  price: string;
  interval: 'monthly' | 'annually';
  isTrial: boolean;
  trialEndsAt?: string;
  usage: SubscriptionUsage;
}

export const subscriptionService = {
  // Get current subscription information
  async getSubscription(): Promise<SubscriptionInfo | null> {
    try {
      const response = await api.get('/api/subscription');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      // For now, return mock data until backend is implemented
      return {
        id: 'sub_123',
        plan: 'Pro',
        status: 'active',
        nextBillingDate: '2025-02-14',
        price: '9.90',
        interval: 'monthly',
        isTrial: false,
        usage: {
          chatMessagesUsed: 127,
          chatMessagesLimit: 500,
          pdfUploadsUsed: 8,
          pdfUploadsLimit: 500,
        }
      };
    }
  },

  // Get usage statistics
  async getUsage(): Promise<SubscriptionUsage> {
    try {
      const response = await api.get('/api/subscription/usage');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch usage:', error);
      // For now, return mock data until backend is implemented
      return {
        chatMessagesUsed: 127,
        chatMessagesLimit: 500,
        pdfUploadsUsed: 8,
        pdfUploadsLimit: 500,
      };
    }
  },

  // Cancel subscription
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await api.put(`/api/payment/cancel-subscription/${subscriptionId}`);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      throw error;
    }
  },

  // Change subscription plan
  async changePlan(newPlan: 'Starter' | 'Pro'): Promise<void> {
    try {
      await api.put('/api/subscription/change-plan', { plan: newPlan });
    } catch (error) {
      console.error('Failed to change plan:', error);
      throw error;
    }
  },

  // Reactivate subscription
  async reactivateSubscription(): Promise<void> {
    try {
      await api.put('/api/subscription/reactivate');
    } catch (error) {
      console.error('Failed to reactivate subscription:', error);
      throw error;
    }
  }
};
