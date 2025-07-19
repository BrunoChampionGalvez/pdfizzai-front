'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { useSubscriptionStore } from '../../store/subscription';
import { subscriptionService } from '../../services/subscription';
import { AuthToken, paymentService } from '../../services/payment';
import { ToastProvider, useToast } from '../../components/ToastProvider';
import UsageBar from '../../components/UsageBar';
import * as Paddle from '@paddle/paddle-js';
import { PlanName } from '../pricing/page';

enum SubscribeTypes {
  REACTIVATE = 'reactivate',
  UPGRADE = 'upgrade',
  DOWNGRADE = 'downgrade'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  TRIALING = 'trialing'
}

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
  return (
    <ToastProvider>
      <SubscriptionPageContent />
    </ToastProvider>
  );
}

function SubscriptionPageContent() {
  const { showSuccess, showError, showInfo } = useToast();
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
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);
  const [isProcessingDowngrade, setIsProcessingDowngrade] = useState(false);
  const [isProcessingCancelDowngrade, setIsProcessingCancelDowngrade] = useState(false);
  const [showCancelDowngradeModal, setShowCancelDowngradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<{
    name: string | undefined;
    price: string | undefined;
    interval: string | undefined;
    subscribeType: SubscribeTypes | undefined;
  } | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const router = useRouter();

  // Function to poll for subscription activation after payment
  const pollForSubscriptionActivation = async (userId: string) => {
    const maxAttempts = 30; // Poll for up to 30 attempts (1 minute at 2-second intervals)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        console.log(`Polling for subscription activation, attempt ${attempts + 1}/${maxAttempts}`);
        
        // Refresh subscription data
        await subscriptionService.loadUserSubscriptionData(userId);
        
        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        
      } catch (error) {
        console.error('Error polling for subscription:', error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // If we get here, polling completed
    console.log('Subscription polling completed');
    setIsProcessingPayment(false);
  };

  const monthlyStarter: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtb4tanwae3pv22fyewn0g',
    quantity: 1,
  }]

  const yearlyStarter: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtd41z144brf89mj9nf69f',
    quantity: 1,
  }]

  const monthlyPro: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtps3cxzxfasnm66p9zv17',
    quantity: 1,
  }]
  const yearlyPro: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtqfqrzfx707b60n9gepax',
    quantity: 1,
  }]

  const openCheckout = async (subscribeType: SubscribeTypes) => {
    // Check if subscription is scheduled for cancellation OR active and show appropriate modal
    if (dbSubscription?.status !== SubscriptionStatus.CANCELED) {
      if (subscribeType === SubscribeTypes.UPGRADE) {
        setShowUpgradeModal(true);
        return;
      } else if (subscribeType === SubscribeTypes.DOWNGRADE) {
        setShowDowngradeModal(true);
        return;
      }
    }

    // Execute the actual checkout logic
    await executeCheckout(subscribeType);
  };

  const executeCheckout = async (subscribeType: SubscribeTypes) => {
    let items: Paddle.CheckoutOpenLineItem[] = [];
    if (subscribeType === SubscribeTypes.REACTIVATE) {
      if (!dbSubscription?.scheduledCancel) {
        items = [
          {
            priceId: dbSubscription?.plan?.name === 'starter' ? (dbSubscription.interval === 'month' ? 'pri_01jzvtb4tanwae3pv22fyewn0g' : 'pri_01jzvtd41z144brf89mj9nf69f') :
              dbSubscription?.plan?.name === 'pro' ? (dbSubscription.interval === 'month' ? 'pri_01jzvtps3cxzxfasnm66p9zv17' : 'pri_01jzvtqfqrzfx707b60n9gepax') :
              'pri_01jzvtb4tanwae3pv22fyewn0g', // Default to Starter monthly if no plan
            quantity: 1,
          }
        ];
  
        const planInfo = {
          name: dbSubscription?.plan && (dbSubscription?.plan?.name === 'starter' ? 'Starter' : dbSubscription?.plan.name === 'pro' ? 'Pro' : 'Enterprise'),
          price: Number(dbSubscription?.plan?.price).toFixed(2) || '0.00',
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        }
  
        // Set the selected plan for summary display
        setSelectedPlan(planInfo);
    
        // Wait a bit for the DOM to update, then open checkout
        setTimeout(async () => {
          let authToken: AuthToken | null = null;
          if (user?.paddleCustomerId) {
            try {
              authToken = await paymentService.generateAuthTokenCustomer(user.paddleCustomerId);
            } catch (error) {
              console.error('Failed to generate auth token:', error);
            }
          }
          
          const checkoutOptions: Paddle.CheckoutOpenOptions = {
            items: items,
            customData: {
              userId: user?.id,
              planName: dbSubscription?.plan?.name,
            },
          };
  
          // Only add customerAuthToken if we have one
          if (authToken?.customer_auth_token) {
            checkoutOptions.customerAuthToken = authToken.customer_auth_token;
          }
  
          Paddle.getPaddleInstance()?.Checkout.open(checkoutOptions);
        }, 200);
      } else {
        await paymentService.reactivateSubscription(dbSubscription?.paddleSubscriptionId);
      }
    } else if (subscribeType === SubscribeTypes.UPGRADE) {
      if (dbSubscription?.status !== SubscriptionStatus.CANCELED) {
        try {
          const upgraded = await paymentService.upgradeSubscription(dbSubscription?.paddleSubscriptionId)
          if (upgraded) {
            showSuccess('Subscription Upgraded', 'Your subscription has been successfully upgraded.');
          } else {
            showError('Upgrade Failed', 'Failed to upgrade subscription. Please try again later.');
          }
        } catch (error) {
          showError('Upgrade Failed', 'Failed to upgrade subscription. Please try again later.');
        }
      } else {
        items = [
          {
            priceId: dbSubscription?.interval === 'month' ? 'pri_01jzvtps3cxzxfasnm66p9zv17' : 'pri_01jzvtqfqrzfx707b60n9gepax',
            quantity: 1,
          }
        ];
  
        const planInfo = {
          name: 'pro',
          price: dbSubscription?.interval === 'month' ? '9.90' : '99',
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        }
  
        // Set the selected plan for summary display
        setSelectedPlan(planInfo);
    
        // Wait a bit for the DOM to update, then open checkout
        setTimeout(async () => {
          let authToken: AuthToken | null = null;
          if (user?.paddleCustomerId) {
            try {
              authToken = await paymentService.generateAuthTokenCustomer(user.paddleCustomerId);
            } catch (error) {
              console.error('Failed to generate auth token:', error);
            }
          }
          
          const checkoutOptions: Paddle.CheckoutOpenOptions = {
            items: items,
            customData: {
              userId: user?.id,
              planName: dbSubscription?.plan?.name,
            },
          };
  
          // Only add customerAuthToken if we have one
          if (authToken?.customer_auth_token) {
            checkoutOptions.customerAuthToken = authToken.customer_auth_token;
          }
  
          Paddle.getPaddleInstance()?.Checkout.open(checkoutOptions);
        }, 200);
      }
    } else if (subscribeType === SubscribeTypes.DOWNGRADE) {
      if (dbSubscription?.status !== SubscriptionStatus.CANCELED) {
        try {
          const downgraded = await paymentService.downgradeSubscription(dbSubscription?.paddleSubscriptionId)
          if (downgraded) {
            showSuccess('Subscription Downgraded', 'Your subscription has been successfully downgraded.');
            // Refresh subscription data
          } else {
            showError('Downgrade Failed', 'Failed to downgrade subscription. Please try again later.');
          }
        } catch (error) {
          showError('Downgrade Failed', 'Failed to downgrade subscription. Please try again later.');
        }
      } else {
        items = [
          {
            priceId: dbSubscription?.interval === 'month' ? 'pri_01jzvtb4tanwae3pv22fyewn0g' : 'pri_01jzvtd41z144brf89mj9nf69f',
            quantity: 1,
          }
        ];
  
        const planInfo = {
          name: 'starter',
          price: dbSubscription?.interval === 'month' ? '5.90' : '59.80',
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        }
  
        // Set the selected plan for summary display
        setSelectedPlan(planInfo);
    
        // Wait a bit for the DOM to update, then open checkout
        setTimeout(async () => {
          let authToken: AuthToken | null = null;
          if (user?.paddleCustomerId) {
            try {
              authToken = await paymentService.generateAuthTokenCustomer(user.paddleCustomerId);
            } catch (error) {
              console.error('Failed to generate auth token:', error);
            }
          }
          
          const checkoutOptions: Paddle.CheckoutOpenOptions = {
            items: items,
            customData: {
              userId: user?.id,
              planName: dbSubscription?.plan?.name,
            },
          };
  
          // Only add customerAuthToken if we have one
          if (authToken?.customer_auth_token) {
            checkoutOptions.customerAuthToken = authToken.customer_auth_token;
          }
  
          Paddle.getPaddleInstance()?.Checkout.open(checkoutOptions);
        }, 200);
      }
    }
  }
  useEffect(() => {
      const initializePaddleFunction = async () => {
        // Only initialize Paddle if user is authenticated
        if (!isAuthenticated) return;
        
        // Initialize Paddle on client side
        const paddle = await Paddle.initializePaddle({
          token: 'test_2e2147bc43b16fada23cc993b41', // replace with a client-side token
          environment: 'sandbox',
          eventCallback: async (event) => {
            if (event.name === 'checkout.completed') {
              console.log('Payment completed, starting subscription verification...');
              showSuccess('Payment Successful', 'Your subscription has been updated successfully.');
              setIsProcessingPayment(true);
              
              // Start polling for subscription activation
              if (user?.id) {
                await pollForSubscriptionActivation(user.id);
                closeCheckout();
              }
            } else if (event.type === 'checkout.close') {
              console.log('Checkout closed');
            }
          },
          checkout: {
            settings: {
              displayMode: 'inline',
              variant: 'one-page',
              theme: 'dark',
              frameTarget: 'checkout-container',
              frameInitialHeight: 600,
              frameStyle: "width: 100%; height: 600px; background-color: oklch(0.16 0.028 264.665); border: 2px solid gray; border-radius: 8px; padding: 16px;"
            }
          }
        });
      };
      initializePaddleFunction();
    }, [isAuthenticated]);
  

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

  const handleCancelDowngrade = async () => {
    setShowCancelDowngradeModal(true);
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
        showSuccess(
          'Subscription Canceled',
          'You will continue to have access until the end of your billing period.'
        );
      } else {
        throw new Error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      showError(
        'Cancellation Failed',
        'Failed to cancel subscription. Please try again or contact support.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmUpgrade = async () => {
    setIsProcessingUpgrade(true);
    setShowUpgradeModal(false);
    await executeCheckout(SubscribeTypes.UPGRADE);
    setIsProcessingUpgrade(false);
    // Refresh subscription data
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }
  };

  const confirmDowngrade = async () => {
    setIsProcessingDowngrade(true);
    setShowDowngradeModal(false);
    await executeCheckout(SubscribeTypes.DOWNGRADE);
    // Refresh subscription data
    setIsProcessingDowngrade(false);
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }
  };

  const cancelDowngrade = async () => {
    setShowCancelDowngradeModal(false);
    setIsProcessingCancelDowngrade(true);
    await paymentService.cancelDowngrade(dbSubscription?.paddleSubscriptionId);
    setShowDowngradeModal(false);
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }

    showSuccess('Downgrade Canceled', 'Your subscription will remain on the Pro plan.');
    setIsProcessingCancelDowngrade(false);
  }

  const handlePlanChange = async (newPlan: 'Starter' | 'Pro') => {
    setIsProcessing(true);
    try {
      // TODO: Implement plan change in payment service
      showInfo(
        'Feature Coming Soon',
        'Plan change functionality will be available soon.'
      );
    } catch (error) {
      console.error('Failed to change plan:', error);
      showError(
        'Plan Change Failed',
        'Failed to change plan. Please try again later.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const closeCheckout = () => {
      Paddle.getPaddleInstance()?.Checkout.close();
      setSelectedPlan(null);
    }

  // Show loading while processing payment
  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-text-primary text-lg">
            Processing your payment...
          </p>
          <p className="text-secondary text-sm mt-2">
            Please wait while we update your subscription
          </p>
        </div>
      </div>
    );
  }

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
      trialing: 'bg-blue-700 text-white',
      canceled: 'bg-red-700 text-white',
      past_due: 'bg-yellow-700 text-black'
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
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
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
              Are you sure you want to cancel your <span className="font-medium text-text-primary">{dbSubscription?.plan?.name === 'starter' ? 'Starter' : dbSubscription?.plan?.name === 'pro' ? 'Pro' : 'Enterprise'} plan</span>? 
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

  // Upgrade Confirmation Modal Component
  const UpgradeConfirmationModal = () => {
    if (!showUpgradeModal) return null;

    const isScheduledCancel = dbSubscription?.scheduledCancel;
    const isActive = dbSubscription?.status === SubscriptionStatus.ACTIVE;

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18m-4-4v8" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Upgrade to Pro Plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              {isScheduledCancel 
                ? "You currently have a canceled subscription. Upgrading will reactivate your subscription with the Pro plan."
                : "You're about to upgrade from Starter to Pro plan."
              }
            </p>

            {/* Billing Details */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-green-800 mb-2">Billing Details:</h4>
              <ul className="text-xs text-green-700 space-y-1">
                {isScheduledCancel ? (
                  <>
                    <li>• You'll be charged the difference between Pro and Starter plans for the remaining time until {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</li>
                    <li>• Starting your next billing cycle, you'll be charged ${dbSubscription?.interval === 'month' ? '9.90' : '99.00'} for the Pro plan</li>
                    <li>• You'll get immediate access to all Pro features</li>
                  </>
                ) : (
                  <>
                    <li>• You'll be charged the difference between Pro and Starter plans, prorated for your current billing period</li>
                    <li>• Starting your next billing cycle on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}, you'll be charged ${dbSubscription?.interval === 'month' ? '9.90' : '99.00'} for the Pro plan</li>
                    <li>• You'll get immediate access to all Pro features (500 PDFs, 400 messages, priority support)</li>
                  </>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 bg-primary hover:bg-secondary text-text-primary font-semibold py-3 px-4 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpgrade}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Yes, Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Downgrade Confirmation Modal Component
  const DowngradeConfirmationModal = () => {
    if (!showDowngradeModal) return null;

    const isScheduledCancel = dbSubscription?.scheduledCancel;
    const isActive = dbSubscription?.status === SubscriptionStatus.ACTIVE;

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H3m4 4v-8" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Downgrade to Starter Plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              {isScheduledCancel 
                ? "You currently have a canceled subscription. Downgrading will reactivate your subscription with the Starter plan."
                : "You're about to downgrade from Pro to Starter plan."
              }
            </p>

            {/* Warning Details */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">What will happen:</h4>
              <ul className="text-xs text-yellow-700 space-y-1">
                {isScheduledCancel ? (
                  <>
                    <li>• You'll lose Pro plan benefits when your next billing period starts on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</li>
                    <li>• Your chat messages will be limited to 200 per month</li>
                    <li>• Your PDF uploads will be limited to 250 per month</li>
                    <li>• You'll be charged ${dbSubscription?.interval === 'month' ? '5.90' : '59.80'} for the Starter plan</li>
                  </>
                ) : (
                  <>
                    <li>• You'll lose Pro plan benefits at your next billing period on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</li>
                    <li>• Your chat messages will be limited to 200 per month (currently 400)</li>
                    <li>• Your PDF uploads will be limited to 250 per month (currently 500)</li>
                    <li>• You'll lose priority support</li>
                    <li>• Starting next billing cycle, you'll be charged ${dbSubscription?.interval === 'month' ? '5.90' : '59.80'} for the Starter plan</li>
                  </>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowDowngradeModal(false)}
                className="flex-1 bg-primary hover:bg-secondary text-text-primary font-semibold py-3 px-4 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDowngrade}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Yes, Downgrade to Starter
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  // Cancel Downgrade Confirmation Modal Component
  const CancelDowngradeConfirmationModal = () => {
    if (!showCancelDowngradeModal) return null;

    const hasDowngraded = dbSubscription?.hasDowngraded;
    const isActive = dbSubscription?.status === SubscriptionStatus.ACTIVE;

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H3m4 4v-8" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Cancel Downgrade to Starter Plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              You currently have a downgrade scheduled. Canceling will keep you on the Pro plan.
            </p>

            {/* Warning Details */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">What will happen:</h4>
              <ul className="text-xs text-yellow-700 space-y-1">
                <li>• You'll keep all Pro plan benefits</li>
                <li>• Your AI chat messages will remain at 400 per month</li>
                <li>• Your PDF uploads will remain at 500 per month</li>
                <li>• You won't be charged for the Starter plan</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowCancelDowngradeModal(false)}
                className="flex-1 bg-primary hover:bg-secondary text-text-primary font-semibold py-3 px-4 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={cancelDowngrade}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Keep Pro Plan
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
      <UpgradeConfirmationModal />
      <DowngradeConfirmationModal />
      <CancelDowngradeConfirmationModal />
      
      {/* Main Subscription Management UI */}
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
                  {dbSubscription?.plan?.name === 'starter' ? 'Starter' : dbSubscription?.plan?.name === 'pro' ? 'Pro' : 'Enterprise'} Plan
                </h2>
                <div className="flex items-center space-x-3">
                  {getStatusBadge(dbSubscription.scheduledCancel ? SubscriptionStatus.CANCELED : dbSubscription.status === SubscriptionStatus.ACTIVE ? SubscriptionStatus.ACTIVE : dbSubscription.status)}
                  {dbSubscription.hasTrialPeriod && (
                    <span className="bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold">
                      Trial
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <div className="text-3xl font-bold text-accent">
                  ${dbSubscription.plan ? (dbSubscription.plan.price / 100).toFixed(2) : '0.00'}
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
                  {dbSubscription.scheduledCancel ? 'Ends On' : dbSubscription.status === SubscriptionStatus.CANCELED ? 'Ends On' : 'Next Billing'}
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

            {(dbSubscription.scheduledCancel ? true : dbSubscription.status === SubscriptionStatus.CANCELED) && (
              <div className="bg-red-700/10 border border-red-700/50 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-700 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-red-700 font-medium">Subscription Canceled</h4>
                    <p className="text-red-700 text-sm">
                      Your subscription will end on {new Date(dbSubscription.nextBillingAt).toLocaleDateString()}. 
                      You'll continue to have access until then.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {(dbSubscription.hasDowngraded) && (
              <div className="bg-red-400/10 border border-yellow-400/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center mr-4">
                    <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="text-yellow-400 font-medium">Subscription Set to Downgrade</h4>
                      <p className="text-yellow-600 text-sm">
                        Your subscription is set to downgrade to the <span className="font-semibold">Starter</span> plan on {new Date(dbSubscription.nextBillingAt).toLocaleDateString()}. 
                        You'll continue to have access to {dbSubscription.plan?.name === PlanName.STARTER ? 'Starter' : dbSubscription.plan?.name === PlanName.PRO ? 'Pro' : 'Enterprise'} until then.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelDowngrade}
                    disabled={isProcessingDowngrade}
                    className="bg-yellow-600 hover:bg-yellow-700 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    {isProcessing ? 'Processing...' : 'Cancel Downgrade'}
                  </button>
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
              {(dbSubscription.scheduledCancel ? false : dbSubscription.status === SubscriptionStatus.CANCELED ? false : true) && (
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
              {(dbSubscription?.plan?.name === 'pro' && !dbSubscription.hasDowngraded) && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                  <div>
                    <h3 className="text-text-primary font-medium">Downgrade to Starter</h3>
                    <p className="text-secondary text-sm">
                      Switch to Starter plan ($5.90/month). Changes take effect at next billing cycle.
                    </p>
                  </div>
                  <button
                    onClick={() => openCheckout(SubscribeTypes.DOWNGRADE)}
                    disabled={isProcessingDowngrade}
                    className="mt-3 sm:mt-0 bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessingDowngrade ? 'Processing...' : 'Downgrade to Starter'}
                  </button>
                </div>
              )}
              {dbSubscription.plan?.name === 'starter' && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                  <div>
                    <h3 className="text-text-primary font-medium">Upgrade to Pro</h3>
                    <p className="text-secondary text-sm">
                      Switch to Pro plan ($9.90/month). Upgrade takes effect immediately.
                    </p>
                  </div>
                  <button
                    onClick={() => openCheckout(SubscribeTypes.UPGRADE)}
                    disabled={isProcessingUpgrade}
                    className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessingUpgrade ? 'Processing...' : 'Upgrade to Pro'}
                  </button>
                </div>
              )}
              {/* Reactivate Subscription */}
              {dbSubscription.scheduledCancel && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-primary/10 border border-accent">
                  <div>
                    <h3 className="font-medium text-accent">Reactivate Subscription</h3>
                    <p className="text-secondary text-sm">
                      Resume your {(dbSubscription.plan) && (dbSubscription.plan.name === 'starter' ? 'Starter' : dbSubscription.plan.name === 'pro' ? 'Pro' : 'Enterprise')} plan before it expires.
                    </p>
                  </div>
                  <button
                    onClick={() => openCheckout(SubscribeTypes.REACTIVATE, )}
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

          {isAuthenticated && selectedPlan && (
          <div 
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <div className="flex gap-6 max-w-6xl w-full mx-4">
              {/* Checkout Container */}
              <div className="flex-1 min-h-[600px] bg-background-secondary rounded-lg">
                <div 
                  className='checkout-container'
                  style={{ minHeight: '600px', width: '100%' }}
                >
                  {/* This div will be populated by Paddle */}
                </div>
              </div>
              
              {/* Plan Summary - Only show on larger screens */}
              <div className="hidden relative lg:block w-80 bg-background-secondary rounded-2xl p-6 border border-secondary min-h-[600px]">
                {/* Close Button */}
                <button 
                  onClick={closeCheckout}
                  className="absolute top-4 right-4 w-8 h-8 hover:bg-opacity-100 text-text-primary rounded-full flex items-center justify-center text-2xl font-bold cursor-pointer z-60"
                >
                  ×
                </button>
                <h3 className="text-xl font-semibold text-text-primary mb-4">Order Summary</h3>
                
                <div className="space-y-4">
                  {/* Plan Name */}
                  <div>
                    <h4 className="text-lg font-medium text-text-primary">{selectedPlan.name === 'starter' ? 'Starter' : selectedPlan.name === 'pro' ? 'Pro' : 'Enterprise'} Plan</h4>
                  </div>
                  
                  {/* Pricing */}
                  <div className="border-t border-secondary pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-secondary">Price</span>
                      <span className="text-text-primary font-semibold">
                        ${Number(selectedPlan.price).toFixed(2)}/{selectedPlan.interval === 'annually' ? 'year' : 'month'}
                      </span>
                    </div>
                    
                    {selectedPlan.interval === 'annually' && (
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-secondary">Billed</span>
                        <span className="text-text-primary">Annually</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Features Summary */}
                  <div className="border-t border-secondary pt-4">
                    <h5 className="text-sm font-medium text-text-primary mb-2">What's included:</h5>
                    <ul className="text-sm text-secondary space-y-1">
                      {selectedPlan.name === 'starter' ? (
                        <>
                          <li>• 250 PDF uploads</li>
                          <li>• 200 AI chat messages</li>
                          <li>• Email support</li>
                        </>
                      ) : (
                        <>
                          <li>• 500 PDF uploads</li>
                          <li>• 400 AI chat messages</li>
                          <li>• Priority support</li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Subscription Type Messages */}
                  <div className="border-t border-secondary pt-4">
                    {selectedPlan.subscribeType === SubscribeTypes.DOWNGRADE && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h6 className="text-sm font-medium text-blue-800 mb-1">Plan Change Details</h6>
                        <p className="text-xs text-blue-700 mb-2">
                          You will keep all Pro plan benefits until the end of your current billing period on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}.
                        </p>
                        <p className="text-xs text-blue-700">
                          Starting your next billing cycle, you will be charged ${selectedPlan.price} for the Starter plan.
                        </p>
                      </div>
                    )}

                    {selectedPlan.subscribeType === SubscribeTypes.UPGRADE && (
                      <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
                        <h6 className="text-sm font-medium text-accent mb-1">Upgrade Details</h6>
                        <p className="text-sm text-secondary mb-2">
                          You will only be charged the difference between your current Starter plan and the Pro plan, prorated based on your current billing period.
                        </p>
                        <p className="text-sm text-secondary">
                          Starting your next billing cycle, you will be charged ${selectedPlan.price} for the Pro plan.
                        </p>
                      </div>
                    )}

                    {selectedPlan.subscribeType === SubscribeTypes.REACTIVATE && (
                      <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
                        <h6 className="text-sm font-medium text-accent mb-1">Reactivation Details</h6>
                        <p className="text-sm text-secondary">
                          Your {selectedPlan.name} plan will be reactivated and you'll regain access to all features immediately.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
