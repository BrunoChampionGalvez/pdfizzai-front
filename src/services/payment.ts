import api from '../lib/api';

interface PaddleSubscription {
    id: string;
    status: string;
    // Add other relevant fields from Paddle's Subscription object
}

export interface DbSubscription {
    id: string;
    paddleSubscriptionId: string;
    status: string;
    scheduledCancel: boolean;
    hasFullAccess: boolean;
    nextBillingAt: Date;
    hasTrialPeriod: boolean;
    name: string;
    price: number;
    currency: string;
    interval: string;
    frequency: number;
    plan?: SubscriptionPlan;
    createdAt: Date;
}

export interface SubscriptionUsage {
    id: string;
    subscription: DbSubscription;
    messagesUsed: number;
    filesUploaded: number;
    startsAt: Date;
    endsAt: Date;
    createdAt: Date;
}

export interface SubscriptionPlan {
    id: string;
    name: string;
    messagesLimit: number;
    filesLimit: number;
    price: number;
    interval: string; // e.g., 'monthly', 'yearly'
    frequency: number; // e.g., 1 for monthly, 12 for yearly
    trialMessagesLimit: number;
    trialFilesLimit: number;
    currency: string;
    createdAt: Date;
}

export const paymentService = {
    async getPaddleSubscription(subscriptionId: string): Promise<PaddleSubscription | null> {
        try {
            const response = await api.get(`/api/payment/subscription/paddle/${subscriptionId}`);
            return response.data.status;
        }
        catch (error) {
            console.error('PaymentService: Error fetching subscription status', error);
            throw error;
        }
    },

    async getDbSubscription(subscriptionId: string): Promise<DbSubscription | null> {
        try {
            const response = await api.get(`/api/payment/subscription/db/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching DB subscription', error);
            throw error;
        }
    },

    async getUserSubscription(userId: string): Promise<DbSubscription | null> {
        try {
            const response = await api.get(`/api/payment/subscription/user/${userId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching user subscription', error);
            throw error;
        }
    },

    async getSubscriptionUsage(subscriptionId: string): Promise<SubscriptionUsage | null> {
        try {
            const response = await api.get(`/api/payment/subscription-usage/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching subscription usage', error);
            throw error;
        }
    },

    async getUserSubscriptionUsage(userId: string): Promise<SubscriptionUsage | null> {
        try {
            const response = await api.get(`/api/payment/subscription-usage/user/${userId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching user subscription usage', error);
            throw error;
        }
    },

    async getUserFilesCount(userId: string): Promise<{ totalFiles: number }> {
        try {
            const response = await api.get(`/api/payment/files-count/user/${userId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching user files count', error);
            throw error;
        }
    },

    async getSubscriptionPlan(subscriptionId: string): Promise<SubscriptionPlan | null> {
        try {
            const response = await api.get(`/api/payment/subscription-plan/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error fetching subscription plan', error);
            throw error;
        }
    },

    async cancelSubscription(subscriptionId: string): Promise<boolean> {
        try {
            const response = await api.put(`/api/payment/cancel-subscription/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('PaymentService: Error canceling subscription', error);
            throw error;
        }
    },
}