'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { authService } from '../../services/auth';
import { subscriptionService, SubscriptionInfo } from '../../services/subscription';
import UsageBar from '../../components/UsageBar';

interface SubscriptionData {
  id: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  nextBillingDate: string;
  endDate?: string;
  price: string;
  interval: 'monthly' | 'annually';
  chatMessagesUsed: number;
  chatMessagesLimit: number;
  pdfUploadsUsed: number;
  pdfUploadsLimit: number;
  isTrial: boolean;
  trialEndsAt?: string;
}

export default function SubscriptionPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    // Load subscription data
    const loadSubscription = async () => {
      try {
        const subscriptionInfo = await subscriptionService.getSubscription();
        if (subscriptionInfo) {
          setSubscription({
            id: subscriptionInfo.id,
            plan: subscriptionInfo.plan,
            status: subscriptionInfo.status,
            nextBillingDate: subscriptionInfo.nextBillingDate,
            endDate: subscriptionInfo.endDate,
            price: subscriptionInfo.price,
            interval: subscriptionInfo.interval,
            chatMessagesUsed: subscriptionInfo.usage.chatMessagesUsed,
            chatMessagesLimit: subscriptionInfo.usage.chatMessagesLimit,
            pdfUploadsUsed: subscriptionInfo.usage.pdfUploadsUsed,
            pdfUploadsLimit: subscriptionInfo.usage.pdfUploadsLimit,
            isTrial: subscriptionInfo.isTrial,
            trialEndsAt: subscriptionInfo.trialEndsAt
          });
        }
      } catch (error) {
        console.error('Failed to load subscription:', error);
        setError('Failed to load subscription information');
      } finally {
        setIsLoading(false);
      }
    };

    loadSubscription();
  }, [isAuthenticated, router]);

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    
    setIsProcessing(true);
    try {
      await subscriptionService.cancelSubscription(subscription.id);
      
      setSubscription({
        ...subscription,
        status: 'canceled',
        endDate: subscription.nextBillingDate
      });
    } catch (error) {
      setError('Failed to cancel subscription. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanChange = async (newPlan: 'Starter' | 'Pro') => {
    setIsProcessing(true);
    try {
      await subscriptionService.changePlan(newPlan);
      
      if (subscription) {
        const newLimits = newPlan === 'Starter' 
          ? { chatMessagesLimit: 200, pdfUploadsLimit: 250 }
          : { chatMessagesLimit: 500, pdfUploadsLimit: 500 };

        const newPrice = newPlan === 'Starter' ? '5.90' : '9.90';

        setSubscription({
          ...subscription,
          plan: newPlan,
          price: newPrice,
          ...newLimits
        });
      }
    } catch (error) {
      setError('Failed to change plan. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg max-w-md">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <button 
            className="mt-3 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-4">No Active Subscription</h2>
          <p className="text-secondary mb-6">You don't have an active subscription yet.</p>
          <button 
            onClick={() => router.push('/pricing')}
            className="bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            View Plans
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      active: 'bg-accent text-primary',
      trialing: 'bg-blue-500 text-white',
      canceled: 'bg-red-500 text-white',
      past_due: 'bg-yellow-500 text-black'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusStyles[status] || 'bg-gray-500 text-white'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Subscription Management</h1>
          <p className="text-secondary">Manage your RefDoc AI subscription and usage</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-background-secondary rounded-2xl p-6 border border-secondary mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary mb-2">
                {subscription.plan} Plan
              </h2>
              <div className="flex items-center space-x-3">
                {getStatusBadge(subscription.status)}
                {subscription.isTrial && (
                  <span className="bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold">
                    Trial
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <div className="text-3xl font-bold text-accent">
                ${subscription.price}
              </div>
              <div className="text-secondary text-sm">
                per {subscription.interval === 'monthly' ? 'month' : 'year'}
              </div>
            </div>
          </div>

          {/* Billing Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-primary rounded-lg p-4">
              <h3 className="text-sm font-medium text-secondary mb-1">
                {subscription.status === 'canceled' ? 'Ends On' : 'Next Billing'}
              </h3>
              <p className="text-text-primary font-semibold">
                {new Date(subscription.status === 'canceled' && subscription.endDate 
                  ? subscription.endDate 
                  : subscription.nextBillingDate
                ).toLocaleDateString()}
              </p>
            </div>
            <div className="bg-primary rounded-lg p-4">
              <h3 className="text-sm font-medium text-secondary mb-1">Billing Cycle</h3>
              <p className="text-text-primary font-semibold capitalize">
                {subscription.interval}
              </p>
            </div>
          </div>

          {subscription.status === 'canceled' && subscription.endDate && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-red-800 font-medium">Subscription Canceled</h4>
                  <p className="text-red-600 text-sm">
                    Your subscription will end on {new Date(subscription.endDate).toLocaleDateString()}. 
                    You'll continue to have access until then.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Usage Statistics */}
        <div className="bg-background-secondary rounded-2xl p-6 border border-secondary mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-6">Usage Statistics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <UsageBar
              label="AI Chat Messages"
              used={subscription.chatMessagesUsed}
              limit={subscription.chatMessagesLimit}
            />
            <UsageBar
              label="PDF Uploads"
              used={subscription.pdfUploadsUsed}
              limit={subscription.pdfUploadsLimit}
            />
          </div>
        </div>

        {/* Plan Management */}
        <div className="bg-background-secondary rounded-2xl p-6 border border-secondary">
          <h2 className="text-xl font-semibold text-text-primary mb-6">Plan Management</h2>
          
          <div className="space-y-4">
            {/* Cancel Subscription */}
            {subscription.status === 'active' && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                <div>
                  <h3 className="text-text-primary font-medium">Cancel Subscription</h3>
                  <p className="text-secondary text-sm">
                    Cancel your subscription. You'll keep access until the end of your billing period.
                  </p>
                </div>
                <button
                  onClick={handleCancelSubscription}
                  disabled={isProcessing}
                  className="mt-3 sm:mt-0 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50"
                >
                  {isProcessing ? 'Canceling...' : 'Cancel Subscription'}
                </button>
              </div>
            )}

            {/* Plan Changes */}
            {subscription.status === 'active' && (
              <>
                {subscription.plan === 'Pro' && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Downgrade to Starter</h3>
                      <p className="text-secondary text-sm">
                        Switch to Starter plan ($5.90/month). Changes take effect at next billing cycle.
                      </p>
                    </div>
                    <button
                      onClick={() => handlePlanChange('Starter')}
                      disabled={isProcessing}
                      className="mt-3 sm:mt-0 bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Downgrade to Starter'}
                    </button>
                  </div>
                )}

                {subscription.plan === 'Starter' && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Upgrade to Pro</h3>
                      <p className="text-secondary text-sm">
                        Switch to Pro plan ($9.90/month). Upgrade takes effect immediately.
                      </p>
                    </div>
                    <button
                      onClick={() => handlePlanChange('Pro')}
                      disabled={isProcessing}
                      className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Upgrade to Pro'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Reactivate Subscription */}
            {subscription.status === 'canceled' && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-accent rounded-lg bg-accent bg-opacity-5">
                <div>
                  <h3 className="text-text-primary font-medium">Reactivate Subscription</h3>
                  <p className="text-secondary text-sm">
                    Resume your {subscription.plan} plan before it expires.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/pricing')}
                  className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  Reactivate Plan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Back to App */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/app')}
            className="bg-primary hover:bg-secondary text-text-primary font-semibold py-2 px-6 rounded-lg border border-secondary transition-colors duration-200"
          >
            Back to App
          </button>
        </div>
      </div>
    </div>
  );
}
