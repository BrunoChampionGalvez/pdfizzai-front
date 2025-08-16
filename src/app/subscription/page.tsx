'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { useSubscriptionStore } from '../../store/subscription';
import { subscriptionService } from '../../services/subscription';
import { AuthToken, paymentService, SubscriptionPlan } from '../../services/payment';
import { useToast } from '../../components/ToastProvider';
import UsageBar from '../../components/UsageBar';
import * as Paddle from '@paddle/paddle-js';
import { PlanName, SubscribeTypes, SubscriptionStatus } from '../../types/subscription';

// Removed unused SubscriptionData interface

export default function SubscriptionPage() {
  return <SubscriptionPageContent />;
}

function SubscriptionPageContent() {
  const { showSuccess, showError } = useToast();
  const { user, isAuthenticated } = useAuthStore();
  const { 
    dbSubscription, 
    subscriptionUsage, 
    userFilePagesCount, 
    isLoading, 
    error
  } = useSubscriptionStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const [isProcessingDowngrade, setIsProcessingDowngrade] = useState(false);

  const [showCancelDowngradeModal, setShowCancelDowngradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<{
    name: string | undefined;
    price: string | undefined;
    interval: string | undefined;
    subscribeType: SubscribeTypes | undefined;
  } | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);

  const [currentTargetPlan, setCurrentTargetPlan] = useState<string | undefined>(undefined);

  const router = useRouter();

  // Helper function to get the current display plan name
  const getCurrentDisplayPlan = useCallback(() => {
    if (!dbSubscription?.plan) return 'starter';
    
    // If user has downgraded, show the original plan they had before downgrade
    if (dbSubscription.hasDowngraded && dbSubscription.nameBeforeDowngrade) {
      return dbSubscription.nameBeforeDowngrade;
    }
    
    // If user has upgraded, show the upgraded plan
    if (dbSubscription.hasUpgraded) {
      return dbSubscription.plan.name;
    }
    
    return dbSubscription.plan.name;
  }, [dbSubscription]);

  // Function to fetch subscription plans
  const fetchSubscriptionPlans = useCallback(async () => {
    try {
      const plans = await paymentService.getAllSubscriptionPlans();
      setSubscriptionPlans(plans);
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
    }
  }, []);

  // Helper function to get plan data
  const getPlanByName = useCallback((name: string) => {
    return subscriptionPlans.find(plan => plan.name.toLowerCase() === name.toLowerCase());
  }, [subscriptionPlans]);

  const getPlanPrice = useCallback((planName: string, isAnnual: boolean) => {
    const plan = getPlanByName(planName);
    if (!plan) return '0';
    
    // Convert from cents to USD
    const priceInUSD = plan.price / 100;
    
    if (isAnnual) {
      // For annual billing, apply discount and calculate monthly equivalent
      // Plus plan gets 60% discount, others get 50% discount
      const discountRate = planName.toLowerCase() === 'plus' ? 0.4 : 0.5; // 60% off = 0.4 remaining, 50% off = 0.5 remaining
      const annualPrice = priceInUSD * 12 * discountRate;
      return (annualPrice / 12).toFixed(2);
    }
    return priceInUSD.toFixed(2);
  }, [getPlanByName]);



  const getPaddlePriceId = useCallback((planName: string, isAnnual: boolean) => {
    const plan = getPlanByName(planName);
    if (!plan) return '';
    return isAnnual ? plan.yearlyPaddlePriceId : plan.monthlyPaddlePriceId;
  }, [getPlanByName]);

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



  const openCheckout = async (subscribeType: SubscribeTypes, targetPlan?: string) => {
    // Store the target plan for use in modal confirmations
    setCurrentTargetPlan(targetPlan);
    
    // Check if subscription is scheduled for cancellation OR active and show appropriate modal
    if (dbSubscription?.status !== SubscriptionStatus.CANCELED) {
      // Create plan info for modal display
      let planInfo = null;
      
      if (subscribeType === SubscribeTypes.UPGRADE) {
        const finalTargetPlan = targetPlan || 'pro';
        const targetPlanName = finalTargetPlan.charAt(0).toUpperCase() + finalTargetPlan.slice(1);
        const targetPlanData = getPlanByName(finalTargetPlan);
        const targetPrice = targetPlanData ? (targetPlanData.price / 100).toFixed(2) : '0.00';
        
        planInfo = {
          name: targetPlanName,
          price: targetPrice,
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        };
        
        setSelectedPlan(planInfo);
        // Directly execute checkout for upgrades
      await executeCheckout(subscribeType, targetPlan);
        return;
      } else if (subscribeType === SubscribeTypes.DOWNGRADE) {
        const finalTargetPlan = targetPlan || 'starter';
        const targetPlanName = finalTargetPlan.charAt(0).toUpperCase() + finalTargetPlan.slice(1);
        const targetPrice = getPlanPrice(finalTargetPlan, dbSubscription?.interval === 'year');
        
        planInfo = {
          name: targetPlanName,
          price: targetPrice,
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        };
        
        setSelectedPlan(planInfo);
        setShowDowngradeModal(true);
        return;
      } else if (subscribeType === SubscribeTypes.REACTIVATE) {
        const currentPlanName = dbSubscription?.plan?.name || 'starter';
        const reactivatePlanName = currentPlanName.charAt(0).toUpperCase() + currentPlanName.slice(1);
        
        planInfo = {
          name: reactivatePlanName,
          price: Number(dbSubscription?.plan?.price).toFixed(2) || '0.00',
          interval: dbSubscription?.interval || 'month',
          subscribeType: subscribeType,
        };
        
        setSelectedPlan(planInfo);
        setShowReactivateModal(true);
        return;
      }
    }

    // Execute the actual checkout logic
    await executeCheckout(subscribeType, targetPlan);
  };

  const executeCheckout = async (subscribeType: SubscribeTypes, targetPlan?: string) => {
    let items: Paddle.CheckoutOpenLineItem[] = [];
    if (subscribeType === SubscribeTypes.REACTIVATE) {
      if (!dbSubscription?.scheduledCancel) {
        items = [
          {
            priceId: getPaddlePriceId(dbSubscription?.plan?.name || 'starter', dbSubscription?.interval === 'year') || 'pri_01jzvtb4tanwae3pv22fyewn0g',
            quantity: 1,
          }
        ];
  
        const planInfo = {
          name: dbSubscription?.plan && (dbSubscription?.plan?.name === 'starter' ? 'Starter' : dbSubscription?.plan.name === 'pro' ? 'Pro' : dbSubscription?.plan.name === 'plus' ? 'Plus' : 'Enterprise'),
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
            } catch (err) {
              console.error('Failed to generate auth token:', err);
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
      // Always use Paddle.js checkout for upgrades (user pays full price)
      // Determine target plan for upgrade based on current plan and targetPlan parameter
      let finalTargetPlan = targetPlan || 'pro';
      let targetPriceId = '';
      let targetPrice = '';
      
      if (dbSubscription?.plan?.name === 'starter') {
        if (finalTargetPlan === 'plus') {
          targetPriceId = getPaddlePriceId('plus', dbSubscription?.interval === 'year');
          const targetPlanData = getPlanByName('plus');
          targetPrice = targetPlanData ? (targetPlanData.price / 100).toFixed(2) : '0.00';
        } else {
          finalTargetPlan = 'pro';
          targetPriceId = getPaddlePriceId('pro', dbSubscription?.interval === 'year');
          const targetPlanData = getPlanByName('pro');
          targetPrice = targetPlanData ? (targetPlanData.price / 100).toFixed(2) : '0.00';
        }
      } else if (dbSubscription?.plan?.name === 'pro') {
        finalTargetPlan = 'plus';
        targetPriceId = getPaddlePriceId('plus', dbSubscription?.interval === 'year');
        const targetPlanData = getPlanByName('plus');
        targetPrice = targetPlanData ? (targetPlanData.price / 100).toFixed(2) : '0.00';
      }
      
      items = [
        {
          priceId: targetPriceId,
          quantity: 1,
        }
      ];

      const planInfo = {
        name: finalTargetPlan,
        price: targetPrice,
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
            planName: finalTargetPlan,
            isUpgrade: true,
          },
        };

        // Only add customerAuthToken if we have one
        if (authToken?.customer_auth_token) {
          checkoutOptions.customerAuthToken = authToken.customer_auth_token;
        }

        Paddle.getPaddleInstance()?.Checkout.open(checkoutOptions);
      }, 200);
    } else if (subscribeType === SubscribeTypes.DOWNGRADE) {
      // Downgrades are always free and handled by backend only
      if (dbSubscription?.status !== SubscriptionStatus.CANCELED) {
        try {
          const downgraded = await paymentService.downgradeSubscription(dbSubscription?.paddleSubscriptionId, targetPlan)
          if (downgraded) {
            showSuccess('Subscription Downgraded', 'Your subscription has been successfully downgraded. The change will take effect at the end of your current billing cycle.');
            // Refresh subscription data
            if (user?.id) {
              await subscriptionService.loadUserSubscriptionData(user.id);
            }
          } else {
            showError('Downgrade Failed', 'Failed to downgrade subscription. Please try again later.');
          }
        } catch {
          showError('Downgrade Failed', 'Failed to downgrade subscription. Please try again later.');
        }
      } else {
        showError('Invalid Operation', 'Cannot downgrade a canceled subscription.');
      }
    }
  }
  useEffect(() => {
      const initializePaddleFunction = async () => {
        // Only initialize Paddle if user is authenticated
        if (!isAuthenticated) return;
        
        // Initialize Paddle on client side
        await Paddle.initializePaddle({
          token: process.env.NEXT_PUBLIC_PADDLE_KEY as string, // replace with a client-side token
          environment: 'sandbox',
          eventCallback: async (event) => {
            if (event.name === 'checkout.completed') {
              console.log('Payment completed, starting subscription verification...');
              showSuccess('Payment Successful', 'Your subscription has been updated successfully.');
              setIsProcessingPayment(true);
              
              // Start polling for subscription activation
              if (user?.id) {
                await pollForSubscriptionActivation(user.id);
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
    }, [isAuthenticated, showSuccess, user?.id]);
  
  // Re-initialize Paddle when selectedPlan changes to ensure checkout container is ready
  useEffect(() => {
    const reinitializePaddle = async () => {
      if (!isAuthenticated || !selectedPlan) return;
      
      // Small delay to ensure DOM element exists
      setTimeout(async () => {
        try {
          await Paddle.initializePaddle({
            token: process.env.NEXT_PUBLIC_PADDLE_KEY as string,
            environment: 'sandbox',
            eventCallback: async (event) => {
              if (event.name === 'checkout.completed') {
                console.log('Payment completed, starting subscription verification...');
                showSuccess('Payment Successful', 'Your subscription has been updated successfully.');
                setIsProcessingPayment(true);
                
                // Start polling for subscription activation
                if (user?.id) {
                  await pollForSubscriptionActivation(user.id);
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
        } catch (err) {
          console.error('Failed to reinitialize Paddle:', err);
        }
      }, 100);
    };
    
    reinitializePaddle();
  }, [selectedPlan, isAuthenticated, user?.id, showSuccess]);

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

    // Fetch subscription plans
    fetchSubscriptionPlans();
  }, [isAuthenticated, user?.id, router, fetchSubscriptionPlans]);

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



  const confirmDowngrade = async () => {
    setIsProcessingDowngrade(true);
    setShowDowngradeModal(false);
    await executeCheckout(SubscribeTypes.DOWNGRADE, currentTargetPlan);
    // Refresh subscription data
    setIsProcessingDowngrade(false);
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }
  };

  const cancelDowngrade = async () => {
    setShowCancelDowngradeModal(false);
    setIsProcessing(true);
    await paymentService.cancelDowngrade(dbSubscription?.paddleSubscriptionId);
    setShowDowngradeModal(false);
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }

    showSuccess('Downgrade Canceled', 'Your subscription will remain on the Pro plan.');
    setIsProcessing(false);
  }

  const confirmReactivate = async () => {
    setIsProcessing(true);
    setShowReactivateModal(false);
    await executeCheckout(SubscribeTypes.REACTIVATE, currentTargetPlan);
    setIsProcessing(false);
    // Show success message
    showSuccess('Subscription Reactivated', 'Your subscription has been successfully reactivated.');
    // Refresh subscription data
    if (user?.id) {
      await subscriptionService.loadUserSubscriptionData(user.id);
    }
  };



  const closeCheckout = () => {
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
  };;

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
          <p className="text-secondary mb-6">You don&apos;t have an active subscription yet.</p>
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

  // Reactivation Modal Component
  const ReactivateConfirmationModal = () => {
    if (!showReactivateModal) return null;

    const isScheduledCancel = dbSubscription?.scheduledCancel;
    const planName = dbSubscription?.plan?.name === 'starter' ? 'Starter' : dbSubscription?.plan?.name === 'pro' ? 'Pro' : 'Enterprise';
    const planPrice = dbSubscription?.plan ? (dbSubscription.plan.price / 100).toFixed(2) : '0.00';

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-accent text-center mb-2">
              Reactivate Your {planName} Plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              {isScheduledCancel 
                ? `Your ${planName} plan is currently scheduled for cancellation. Reactivating will keep your subscription active.`
                : `Your ${planName} plan is currently canceled. Reactivating will restore your subscription.`
              }
            </p>

            {/* Benefits/Billing Information */}
            <div className="bg-primary border border-accent-100/50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-accent mb-2">
                {isScheduledCancel ? 'What will happen:' : 'Billing & Benefits:'}
              </h4>
              <ul className="text-xs text-accent-100/40 space-y-1">
                {isScheduledCancel ? (
                  <>
                    <li>• Your subscription will remain active and won&apos;t be canceled</li>
                    <li>• You&apos;ll keep access to {dbSubscription?.plan?.messagesLimit || 0} AI chat messages per month</li>
                    <li>• You&apos;ll keep access to Unlimited PDF page uploads per month</li>
                    <li>• You&apos;ll continue to be billed ${planPrice} per {dbSubscription?.interval || 'month'}</li>
                    <li>• No additional charges apply</li>
                  </>
                ) : (
                  <>
                    <li>• You&apos;ll be charged ${planPrice} for your {planName} plan</li>
                    <li>• You&apos;ll regain immediate access to {dbSubscription?.plan?.messagesLimit || 0} AI chat messages per month</li>
                    <li>• You&apos;ll regain immediate access to Unlimited PDF page uploads per month</li>
                    <li>• You&apos;ll regain access to premium features and priority support</li>
                    <li>• Your billing cycle will resume normally</li>
                  </>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowReactivateModal(false)}
                className="flex-1 bg-primary hover:bg-secondary text-text-primary font-semibold py-3 px-4 rounded-lg border border-secondary transition-colors duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmReactivate}
                disabled={isProcessing}
                className="flex-1 bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? 'Reactivating...' : `Reactivate ${planName} Plan`}
              </button>
            </div>
          </div>
        </div>
      </div>
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
              You&apos;ll continue to have access until <span className="font-medium text-text-primary">{new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</span>, 
              but you won&apos;t be billed again.
            </p>

            {/* Benefits reminder */}
            <div className="bg-primary rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-text-primary mb-2">What will happen:</h4>
              <ul className="text-sm text-secondary space-y-1">
                <li>• You will lose access to {dbSubscription?.plan?.messagesLimit || 0} AI chat messages per month</li>
                <li>• You will lose access to Unlimited PDF page uploads per month</li>
                <li>• You will lose access to premium features and priority support</li>
                <li>• If you have a downgrade scheduled to a lower plan, it will be canceled and you won&apos;t be charged when the cancellation takes effect.</li>
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



  // Downgrade Confirmation Modal Component
  const DowngradeConfirmationModal = () => {
    if (!showDowngradeModal || !selectedPlan) return null;

    const isScheduledCancel = dbSubscription?.scheduledCancel;
    const currentPlan = dbSubscription?.plan?.name || 'pro';
    const targetPlan = selectedPlan.name?.toLowerCase() || 'starter';
    const targetPlanName = selectedPlan.name || 'Starter';
    const currentPlanName = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
    
    const getTargetPrice = () => {
      return selectedPlan.price || '0.00';
    };

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center border-yellow-500/50 border-2">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Downgrade to {targetPlanName} plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              {isScheduledCancel 
                ? `You currently have a canceled subscription. Downgrading will reactivate your subscription with the ${targetPlanName} plan.`
                : `You&apos;re about to downgrade from ${currentPlanName} to ${targetPlanName} plan.`
              }
            </p>

            {/* Warning Details */}
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-yellow-500 mb-2">What will happen:</h4>
              <ul className="text-xs text-yellow-500/70 space-y-1">
                {isScheduledCancel ? (
                  <>
                    <li>• You&apos;ll lose {currentPlanName} plan benefits when your next billing period starts on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</li>
                    <li>• Your AI chat messages will be limited to {getPlanByName(targetPlan)?.messagesLimit || (targetPlan === 'starter' ? 200 : 400)} per month (currently {getPlanByName(currentPlan)?.messagesLimit || (currentPlan === 'plus' ? 1000 : 400)})</li>
                    <li>• Your PDF page uploads will be Unlimited per month</li>
                    <li>• You&apos;ll lose priority support</li>
                    <li>• Starting next billing cycle, you&apos;ll be charged ${getTargetPrice()} for the {targetPlanName} plan</li>
                  </>
                ) : (
                  <>
                    <li>• You&apos;ll lose {currentPlanName} plan benefits at your next billing period on {new Date(dbSubscription?.nextBillingAt || '').toLocaleDateString()}</li>
                    <li>• Your AI chat messages will be limited to {getPlanByName(targetPlan)?.messagesLimit || (targetPlan === 'starter' ? 200 : 400)} per month (currently {getPlanByName(currentPlan)?.messagesLimit || (currentPlan === 'plus' ? 1000 : 400)})</li>
                    <li>• Your PDF page uploads will be Unlimited per month</li>
                    <li>• You&apos;ll lose priority support</li>
                    <li>• Starting next billing cycle, you&apos;ll be charged ${getTargetPrice()} for the {targetPlanName} plan</li>
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
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Yes, Downgrade
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

    const originalPlanName = dbSubscription?.nameBeforeDowngrade ? dbSubscription.nameBeforeDowngrade.charAt(0).toUpperCase() + dbSubscription.nameBeforeDowngrade.slice(1) : getCurrentDisplayPlan().charAt(0).toUpperCase() + getCurrentDisplayPlan().slice(1);
    const targetPlanName = dbSubscription?.plan?.name ? dbSubscription.plan.name.charAt(0).toUpperCase() + dbSubscription.plan.name.slice(1) : 'Starter';
    const originalPlan = getPlanByName(dbSubscription?.nameBeforeDowngrade || getCurrentDisplayPlan());

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <div className="bg-background-secondary rounded-2xl max-w-md w-full mx-4 shadow-xl border border-secondary">
          <div className="p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8l5-5 5 5M12 3v18" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-text-primary text-center mb-2">
              Cancel Downgrade to {targetPlanName} Plan?
            </h3>

            {/* Description */}
            <p className="text-secondary text-center mb-4 leading-relaxed">
              You currently have a downgrade scheduled. Canceling will keep you on the {originalPlanName} plan.
            </p>

            {/* Warning Details */}
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-yellow-500 mb-2">What will happen:</h4>
              <ul className="text-xs text-yellow-500/70 space-y-1">
                <li>• You&apos;ll keep all {originalPlanName} plan benefits</li>
                <li>• Your AI chat messages will remain at {originalPlan?.messagesLimit || 0} per month</li>
                <li>• Your PDF page uploads will be {originalPlan?.filePagesLimit === -1 ? 'Unlimited' : originalPlan?.filePagesLimit || 0} per month</li>
                <li>• You won&apos;t be charged for the {targetPlanName} plan</li>
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
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Keep {originalPlanName} Plan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <ReactivateConfirmationModal />
      <CancelConfirmationModal />

      <DowngradeConfirmationModal />
      <CancelDowngradeConfirmationModal />
      
      {/* Main Subscription Management UI */}
      <div className="min-h-screen bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-primary mb-2">Subscription Management</h1>
            <p className="text-secondary">Manage your PDFizz AI subscription and usage</p>
          </div>

          {/* Current Plan Card */}
          <div className="bg-background-secondary rounded-2xl p-6 border border-secondary mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-2">
                  {(() => {
                    const displayPlan = getCurrentDisplayPlan();
                    return displayPlan === 'starter' ? 'Starter' : displayPlan === 'pro' ? 'Pro' : displayPlan === 'plus' ? 'Plus' : 'Enterprise';
                  })()} Plan
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
                  ${(() => {
                    if (!dbSubscription?.plan) return '0.00';
                    
                    // If user has downgraded, show the price of the current active plan
                    if (dbSubscription.hasDowngraded) {
                      const displayPlan = getCurrentDisplayPlan();
                      const originalPlan = getPlanByName(displayPlan);
                      return originalPlan ? (originalPlan.price / 100).toFixed(2) : (dbSubscription.plan.price / 100).toFixed(2);
                    }
                    
                    return (dbSubscription.plan.price / 100).toFixed(2);
                  })()}
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
                      You&apos;ll continue to have access until then.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {(dbSubscription.hasDowngraded && !dbSubscription.scheduledCancel) && (
              <div className="bg-red-400/10 border border-yellow-400/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center mr-4">
                    <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="text-yellow-400 font-medium">Subscription Set to Downgrade</h4>
                      <p className="text-yellow-500/60 text-sm">
                        Your subscription is set to downgrade to the <span className="font-semibold">{dbSubscription.plan?.name === PlanName.STARTER ? 'Starter' : dbSubscription.plan?.name === PlanName.PRO ? 'Pro' : 'Enterprise'}</span> plan on {new Date(dbSubscription.nextBillingAt).toLocaleDateString()}. 
                        You&apos;ll continue to have access to {dbSubscription.nameBeforeDowngrade ? dbSubscription.nameBeforeDowngrade.charAt(0).toUpperCase() + dbSubscription.nameBeforeDowngrade.slice(1) : getCurrentDisplayPlan().charAt(0).toUpperCase() + getCurrentDisplayPlan().slice(1)} until then.
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
                limit={(() => {
                  if (!dbSubscription?.plan) return 0;
                  
                  // If user has downgraded, show limits for the current active plan
                  if (dbSubscription.hasDowngraded) {
                    const displayPlan = getCurrentDisplayPlan();
                    const originalPlan = getPlanByName(displayPlan);
                    return (originalPlan?.messagesLimit || dbSubscription.plan.messagesLimit) + (dbSubscription.messagesLeftBeforeUpgrade || 0);
                  }
                  
                  return dbSubscription.plan.messagesLimit + (dbSubscription.messagesLeftBeforeUpgrade || 0);
                })()}
              />
              <UsageBar
                label="PDF Page Uploads"
                used={userFilePagesCount?.totalFilePages || 0}
                limit={(() => {
                  if (!dbSubscription?.plan) return 0;
                  
                  // If user has downgraded, show limits for the current active plan
                  if (dbSubscription.hasDowngraded) {
                    const displayPlan = getCurrentDisplayPlan();
                    const originalPlan = getPlanByName(displayPlan);
                    return (originalPlan?.filePagesLimit || dbSubscription.plan.filePagesLimit) + (dbSubscription.filePagesLeftBeforeUpgrade || 0);
                  }
                  
                  return dbSubscription.plan.filePagesLimit + (dbSubscription.filePagesLeftBeforeUpgrade || 0);
                })()}
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
                      Cancel your subscription. You&apos;ll keep access until the end of your billing period.
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
              {getCurrentDisplayPlan() === 'pro' && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Upgrade to Plus</h3>
                      <p className="text-secondary text-sm">
                        Switch to Plus plan (${getPlanPrice('plus', false)}/month). Upgrade takes effect immediately.
                      </p>
                    </div>
                    <button
                       onClick={() => openCheckout(SubscribeTypes.UPGRADE, 'plus')}
                       disabled={isProcessingDowngrade}
                       className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                     >
                       {isProcessingDowngrade ? 'Processing...' : 'Upgrade to Plus'}
                     </button>
                  </div>
                  {!dbSubscription.hasDowngraded && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                      <div>
                        <h3 className="text-text-primary font-medium">Downgrade to Starter</h3>
                        <p className="text-secondary text-sm">
                          Switch to Starter plan (${getPlanPrice('starter', false)}/month). Changes take effect at next billing cycle.
                        </p>
                      </div>
                      <button
                        onClick={() => openCheckout(SubscribeTypes.DOWNGRADE, 'starter')}
                        disabled={isProcessingDowngrade}
                        className="mt-3 sm:mt-0 bg-yellow-600 hover:bg-yellow-700 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                      >
                        {isProcessingDowngrade ? 'Processing...' : 'Downgrade to Starter'}
                      </button>
                    </div>
                  )}
                </>
              )}
              {getCurrentDisplayPlan() === 'starter' && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Upgrade to Pro</h3>
                      <p className="text-secondary text-sm">
                        Switch to Pro plan (${getPlanPrice('pro', false)}/month). Upgrade takes effect immediately.
                      </p>
                    </div>
                    <button
                      onClick={() => openCheckout(SubscribeTypes.UPGRADE, 'pro')}
                      disabled={isProcessingDowngrade}
                      className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessingDowngrade ? 'Processing...' : 'Upgrade to Pro'}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Upgrade to Plus</h3>
                      <p className="text-secondary text-sm">
                        Switch to Plus plan (${getPlanPrice('plus', false)}/month). Upgrade takes effect immediately.
                      </p>
                    </div>
                    <button
                      onClick={() => openCheckout(SubscribeTypes.UPGRADE, 'plus')}
                      disabled={isProcessingDowngrade}
                      className="mt-3 sm:mt-0 bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessingDowngrade ? 'Processing...' : 'Upgrade to Plus'}
                    </button>
                  </div>
                </>
              )}
              {getCurrentDisplayPlan() === 'plus' && !dbSubscription.hasDowngraded && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Downgrade to Pro</h3>
                      <p className="text-secondary text-sm">
                        Switch to Pro plan (${getPlanPrice('pro', false)}/month). Changes take effect at next billing cycle.
                      </p>
                    </div>
                    <button
                      onClick={() => openCheckout(SubscribeTypes.DOWNGRADE, 'pro')}
                      disabled={isProcessingDowngrade}
                      className="mt-3 sm:mt-0 bg-yellow-600 hover:bg-yellow-700 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessingDowngrade ? 'Processing...' : 'Downgrade to Pro'}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-secondary rounded-lg">
                    <div>
                      <h3 className="text-text-primary font-medium">Downgrade to Starter</h3>
                      <p className="text-secondary text-sm">
                        Switch to Starter plan (${getPlanPrice('starter', false)}/month). Changes take effect at next billing cycle.
                      </p>
                    </div>
                    <button
                      onClick={() => openCheckout(SubscribeTypes.DOWNGRADE, 'starter')}
                      disabled={isProcessingDowngrade}
                      className="mt-3 sm:mt-0 bg-yellow-600 hover:bg-yellow-700 text-text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessingDowngrade ? 'Processing...' : 'Downgrade to Starter'}
                    </button>
                  </div>
                </>
              )}
              {/* Reactivate Subscription */}
              {dbSubscription.scheduledCancel && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-primary/10 border border-accent">
                  <div>
                    <h3 className="font-medium text-accent">Reactivate Subscription</h3>
                    <p className="text-secondary text-sm">
                      Resume your {(dbSubscription.plan) && (dbSubscription.plan.name === 'starter' ? 'Starter' : dbSubscription.plan.name === 'pro' ? 'Pro' : dbSubscription.plan.name === 'plus' ? 'Plus' : 'Enterprise')} plan before it expires.
                    </p>
                  </div>
                  <button
                    onClick={() => openCheckout(SubscribeTypes.REACTIVATE)}
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
      
      {/* Checkout Modal - Fixed overlay like pricing page */}
      {selectedPlan && (
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
                  <h4 className="text-lg font-medium text-text-primary">{selectedPlan.name && selectedPlan.name?.charAt(0).toUpperCase() + selectedPlan.name?.slice(1)} Plan</h4>

                  <span className="inline-block bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold mt-1">
                    {selectedPlan.subscribeType === 'upgrade' ? 'Upgrade' : selectedPlan.subscribeType === 'downgrade' ? 'Downgrade' : selectedPlan.subscribeType === 'reactivate' ? 'Reactivation' : 'Subscription'}
                  </span>
                </div>
                
                {/* Pricing */}
                <div className="border-t border-secondary pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-secondary">Price</span>
                    <span className="text-text-primary font-semibold">
                      ${selectedPlan.price}/{selectedPlan.interval === 'year' ? 'year' : 'month'}
                    </span>
                  </div>
                  
                  {selectedPlan.interval === 'year' && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-secondary">Billed</span>
                      <span className="text-text-primary">Annually</span>
                    </div>
                  )}
                  
                  {selectedPlan.subscribeType === 'upgrade' && (
                    <div className="bg-accent bg-opacity-10 rounded-lg p-3 mt-3">
                      <p className="text-sm text-primary font-medium">
                        Upgrade takes effect immediately
                      </p>
                      <p className="text-xs text-secondary mt-1">
                        You&apos;ll be charged the full amount and receive both new plan features and remaining features from your previous plan&apos;s billing cycle
                      </p>
                    </div>
                  )}
                  
                  {selectedPlan.subscribeType === 'reactivate' && (
                    <div className="bg-accent bg-opacity-10 rounded-lg p-3 mt-3">
                      <p className="text-sm text-primary font-medium">
                        Reactivate your subscription
                      </p>
                      <p className="text-xs text-secondary mt-1">
                        Your subscription will be reactivated immediately
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Features Summary */}
                <div className="border-t border-secondary pt-4">
                  <h5 className="text-sm font-medium text-text-primary mb-2">What&apos;s included:</h5>
                  <ul className="text-sm text-secondary space-y-1">
                    <li>• Unlimited PDF page uploads</li>
                    <li>• {selectedPlan.name === 'Plus' || selectedPlan.name === 'plus' ? 'Unlimited' : getPlanByName(selectedPlan.name?.toLowerCase() || '')?.messagesLimit || 'N/A'} AI chat messages</li>
                    <li>• {selectedPlan.name === 'Starter' || selectedPlan.name === 'starter' ? 'Email support' : 'Priority support'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Fallback for when no plan is selected but checkout container is needed */}
      {!selectedPlan && <div className='checkout-container'></div>}
    </>
  );
}
