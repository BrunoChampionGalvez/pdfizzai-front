'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { useSubscriptionStore } from '../../store/subscription';
import { subscriptionService } from '../../services/subscription';
import { paymentService } from '../../services/payment';
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
  const { 
    dbSubscription, 
    subscriptionUsage, 
    userFilesCount, 
    isLoading, 
    error,
    isSubscriptionActive,
    isTrialUser,
    getCurrentMessageLimit,
    getCurrentFileLimit,
    getMessagesRemaining,
    getFilesRemaining,
    getNextBillingDate
  } = useSubscriptionStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    // Load subscription data using our existing service
    if (user?.id) {
      subscriptionService.loadUserSubscriptionData(user.id).catch(err => {
        console.error('Failed to load subscription data:', err);
      });
    }
  }, [isAuthenticated, user?.id, router]);

  const handleCancelSubscription = async () => {
    setShowCancelModal(true);
  };

  const confirmCancelSubscription = async () => {
    if (!dbSubscription) return;
    
    setIsProcessing(true);
    setShowCancelModal(false);
    try {
      // Call the payment service to cancel the subscription
      const success = await paymentService.cancelSubscription(dbSubscription.paddleSubscriptionId);
      
      if (success) {
        // Refresh subscription data to get updated status
        if (user?.id) {
          await subscriptionService.loadUserSubscriptionData(user.id);
        }
        alert('Subscription canceled successfully. You will continue to have access until the end of your billing period.');
      } else {
        throw new Error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription. Please try again or contact support.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanChange = async (newPlan: 'Starter' | 'Pro') => {
    setIsProcessing(true);
    try {
      // TODO: Implement plan change in payment service
      alert('Plan change functionality needs to be implemented');
    } catch (error) {
      console.error('Failed to change plan:', error);
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
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!dbSubscription) {
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

  // Confirmation Modal Component
  const CancelConfirmationModal = () => {
    if (!showCancelModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Cancel Subscription?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-6 leading-relaxed">
              Are you sure you want to cancel your <span className="font-medium text-text-primary">{dbSubscription?.name === 'starter' ? 'Starter' : dbSubscription?.name === 'pro' ? 'Pro' : 'Enterprise'} plan</span>? 
              You'll continue to have access until <span className="font-medium text-text-primary">{new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</span>, 
              but you won't be billed again.
            </p>

            {/* Benefits reminder */}
            <div className="bg-primary rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-text-primary mb-2">You'll lose access to:</h4>
              <ul className="text-sm text-secondary space-y-1">
                <li>• {dbSubscription?.plan?.messagesLimit || 0} AI chat messages per month</li>
                <li>• {dbSubscription?.plan?.filesLimit || 0} PDF uploads per month</li>
                <li>• Premium features and priority support</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-primary hover:bg-secondary text-text-primary font-semibold py-3 px-4 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
              >
                Keep Subscription
              </button>
              <button
                onClick={confirmCancelSubscription}
                disabled={isProcessing}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? 'Canceling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <CancelConfirmationModal />
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
                  {dbSubscription.name === 'starter' ? 'Starter' : dbSubscription.name === 'pro' ? 'Pro' : 'Enterprise'} Plan
                </h2>
                <div className="flex items-center space-x-3">
                  {getStatusBadge(dbSubscription.scheduledCancel ? 'canceled' : dbSubscription.status === 'active' ? 'active' : dbSubscription.status)}
                  {dbSubscription.hasTrialPeriod && (
                    <span className="bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold">
                      Trial
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <div className="text-3xl font-bold text-accent">
                  ${(dbSubscription.price / 100).toFixed(2)}
                </div>
                <div className="text-secondary text-sm">
                  per {dbSubscription.interval === 'month' ? 'month' : 'year'}
                </div>
              </div>
            </div>

            {/* Billing Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-primary rounded-lg p-4">
                <h3 className="text-sm font-medium text-secondary mb-1">
                  {dbSubscription.scheduledCancel ? 'Ends On' : dbSubscription.status === 'canceled' ? 'Ends On' : 'Next Billing'}
                </h3>
                <p className="text-text-primary font-semibold">
                  {new Date(dbSubscription.nextBillingAt).toLocaleDateString()}
                </p>
              </div>
              <div className="bg-primary rounded-lg p-4">
                <h3 className="text-sm font-medium text-secondary mb-1">Billed every</h3>
                <p className="text-text-primary font-semibold capitalize">
                  {dbSubscription.interval}
                </p>
              </div>
            </div>

            {(dbSubscription.scheduledCancel ? true : dbSubscription.status === 'canceled') && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-red-800 font-medium">Subscription Canceled</h4>
                    <p className="text-red-600 text-sm">
                      Your subscription will end on {new Date(dbSubscription.nextBillingAt).toLocaleDateString()}. 
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
                used={subscriptionUsage?.messagesUsed || 0}
                limit={dbSubscription.plan?.messagesLimit || 0}
              />
              <UsageBar
                label="PDF Uploads"
                used={userFilesCount?.totalFiles || 0}
                limit={dbSubscription.plan?.filesLimit || 0}
              />
            </div>
          </div>

          {/* Plan Management */}
          <div className="bg-background-secondary rounded-2xl p-6 border border-secondary">
            <h2 className="text-xl font-semibold text-text-primary mb-6">Plan Management</h2>
            
            <div className="space-y-4">
              {/* Cancel Subscription */}
              {(dbSubscription.scheduledCancel ? false : dbSubscription.status === "canceled" ? false : true) && (
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
                    className="mt-3 sm:mt-0 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessing ? 'Canceling...' : 'Cancel Subscription'}
                  </button>
                </div>
              )}

              {/* Plan Changes */}
              {(dbSubscription.scheduledCancel ? false : dbSubscription.status === "canceled" ? false : true) && (
                <>
                  {dbSubscription.name === 'Pro' && (
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

                  {dbSubscription.name === 'Starter' && (
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
              {dbSubscription.scheduledCancel && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-primary/10 border border-accent">
                  <div>
                    <h3 className="font-medium text-accent">Reactivate Subscription</h3>
                    <p className="text-secondary text-sm">
                      Resume your {dbSubscription.name === 'starter' ? 'Starter' : dbSubscription.name === 'pro' ? 'Pro' : 'Enterprise'} plan before it expires.
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/pricing')}
                    className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
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
              className="bg-primary hover:bg-secondary text-text-primary font-semibold py-2 px-6 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
            >
              Back to App
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
