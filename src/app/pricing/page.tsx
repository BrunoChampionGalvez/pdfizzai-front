'use client';

import * as Paddle from '@paddle/paddle-js';
// Removed unused imports
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { useSubscriptionStore } from '../../store/subscription';
import { authService } from '../../services/auth';
import { subscriptionService } from '../../services/subscription';
import { paymentService, SubscriptionPlan } from '../../services/payment';
import { setRedirectPath } from '../../lib/auth-utils';
import { PlanName } from '../../types/subscription';

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { user, isAuthenticated, setUser } = useAuthStore();
  const { dbSubscription, isSubscriptionActive } = useSubscriptionStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isFromPaymentFlow, setIsFromPaymentFlow] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{
    name: string;
    price: string;
    interval: string;
    isTrial: boolean;
  } | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const router = useRouter();

  // Function to fetch subscription plans
  const fetchSubscriptionPlans = useCallback(async () => {
    try {
      setIsLoadingPlans(true);
      setPlansError(null);
      const plans = await paymentService.getAllSubscriptionPlans();
      setSubscriptionPlans(plans);
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      setPlansError('Failed to load subscription plans');
    } finally {
      setIsLoadingPlans(false);
    }
  }, []);

  // Helper functions to get plan data
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

  const getPlanAnnualPrice = useCallback((planName: string) => {
    const plan = getPlanByName(planName);
    if (!plan) return '0';
    // Convert from cents to USD and calculate annual price with discount
    const monthlyPriceInUSD = plan.price / 100;
    // Plus plan gets 60% discount, others get 50% discount
    const discountRate = planName.toLowerCase() === 'plus' ? 0.4 : 0.5; // 60% off = 0.4 remaining, 50% off = 0.5 remaining
    const annualPrice = monthlyPriceInUSD * 12 * discountRate;
    return annualPrice.toFixed(2);
  }, [getPlanByName]);

  const getPaddlePriceId = useCallback((planName: string, isAnnual: boolean) => {
    const plan = getPlanByName(planName);
    if (!plan) return '';
    return isAnnual ? plan.yearlyPaddlePriceId : plan.monthlyPaddlePriceId;
  }, [getPlanByName]);

  // Function to poll for subscription activation after payment
  const pollForSubscriptionActivation = useCallback(async (userId: string) => {
    const maxAttempts = 30; // Poll for up to 30 attempts (1 minute at 2-second intervals)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        console.log(`Polling for subscription activation, attempt ${attempts + 1}/${maxAttempts}`);
        
        // Refresh subscription data
        await subscriptionService.loadUserSubscriptionData(userId);
        
        // Check if subscription is now active
        if (subscriptionService.hasAppAccess()) {
          console.log('Subscription activated! Redirecting to app...');
          setIsProcessingPayment(false);
          router.push('/app');
          return;
        }
        
        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        
      } catch (error) {
        console.error('Error polling for subscription:', error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // If we get here, polling timed out
    console.log('Subscription polling timed out, redirecting anyway...');
    setIsProcessingPayment(false);
    router.push('/app'); // Redirect anyway - app will handle the subscription check
  }, [router, setIsProcessingPayment]);

  // Removed unused Paddle checkout line items

  const openCheckout = async (items: Paddle.CheckoutOpenLineItem[], planInfo: {
    name: string;
    price: string;
    interval: string;
    isTrial: boolean;
  }) => {
    // Check if user is authenticated before opening checkout
    if (!isAuthenticated || !user) {
      // Store current pricing page as redirect path
      setRedirectPath('/pricing');
      // Redirect to signup page with redirect parameter
      router.push('/auth/signup?redirect=/pricing');
      return;
    }

    // Set the selected plan for summary display
    setSelectedPlan(planInfo);

    // Wait a bit for the DOM to update, then open checkout
    setTimeout(() => {
      // User is authenticated, proceed with checkout
      Paddle.getPaddleInstance()?.Checkout.open({
        items: items,
        customData: {
          userId: user.id,
          isTrial: planInfo.isTrial,
          planName: planInfo.name === 'Starter' ? PlanName.STARTER : planInfo.name === 'Pro' ? PlanName.PRO : PlanName.ENTERPRISE,
        },
      });
    }, 200);
  }

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await authService.getMe();
        setUser(currentUser);
        
        // Load subscription data if user is authenticated
        if (currentUser?.id) {
          try {
            await subscriptionService.loadUserSubscriptionData(currentUser.id);
            
            // Only redirect to app if user came from payment flow and has active subscription
            if (subscriptionService.hasAppAccess() && isFromPaymentFlow) {
              console.log('User has active subscription after payment, redirecting to app');
              router.push('/app');
              return;
            }
          } catch (err) {
            console.error('Failed to load subscription data:', err);
          }
        }
      } catch {
        // User not authenticated, which is fine for pricing page
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [setUser, router, isFromPaymentFlow]);

  // Fetch subscription plans on component mount
  useEffect(() => {
    fetchSubscriptionPlans();
  }, [fetchSubscriptionPlans]);

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
            setIsProcessingPayment(true);
            setIsFromPaymentFlow(true);
            
            // Start polling for subscription activation instead of immediate redirect
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
    
    // Only initialize Paddle if auth check is complete and user is authenticated
    if (!isCheckingAuth) {
      initializePaddleFunction();
    }
  }, [isAuthenticated, isCheckingAuth, user?.id, pollForSubscriptionActivation]);

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
                setIsProcessingPayment(true);
                setIsFromPaymentFlow(true);
                
                // Start polling for subscription activation instead of immediate redirect
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
  }, [selectedPlan, isAuthenticated, user?.id, pollForSubscriptionActivation]);

  const closeCheckout = () => {
    Paddle.getPaddleInstance()?.Checkout.close();
    setSelectedPlan(null);
  }

  // Show loading while checking authentication or processing payment
  if (isCheckingAuth || isProcessingPayment) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-text-primary text-lg">
            {isProcessingPayment ? 'Processing your payment...' : 'Loading...'}
          </p>
          {isProcessingPayment && (
            <p className="text-secondary text-sm mt-2">
              Please wait while we activate your subscription
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-text-primary mb-4">
            Pricing Plans
          </h1>
          <p className="text-xl text-secondary mb-8 max-w-2xl mx-auto">
            Choose the perfect plan for your document analysis needs
          </p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center mb-8 relative w-max mx-auto">
            <span className={`mr-3 ${!isAnnual ? 'text-text-primary font-semibold' : 'text-secondary'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${
                isAnnual ? 'bg-accent' : 'bg-secondary'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isAnnual ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`ml-3 ${isAnnual ? 'text-text-primary font-semibold' : 'text-secondary'}`}>
              Annual
            </span>
            {isAnnual && (
              <span className="ml-2 bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold absolute -right-16">
                50% off
              </span>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoadingPlans ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
            <span className="ml-4 text-text-primary">Loading pricing plans...</span>
          </div>
        ) : plansError ? (
          <div className="text-center py-16">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-md mx-auto">
              <strong className="font-bold">Error loading plans: </strong>
              <span className="block sm:inline">{plansError}</span>
            </div>
            <button 
              onClick={fetchSubscriptionPlans}
              className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded transition-colors duration-200"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Starter Plan */}
          <div className="bg-background-secondary rounded-2xl p-8 border border-secondary relative">
            <div className="text-center flex flex-col justify-between h-full">
              <div>
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Starter</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-accent">
                    ${getPlanPrice('Starter', isAnnual)}
                  </span>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually (${getPlanAnnualPrice('starter')}/year)
                    </div>
                  )}
                  <div className="text-sm text-accent mt-2 font-medium">
                    Try free for 7 days
                  </div>
                  <div className="text-xs text-accent mt-1 font-medium">
                    with {getPlanByName('starter')?.trialFilePagesLimit || 10} PDFs, {getPlanByName('starter')?.trialMessagesLimit || 20} AI messages
                  </div>
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited PDF page uploads
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {getPlanByName('starter')?.messagesLimit || 200} AI chat messages
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Email support
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                {/* Show subscription status if user has active subscription */}
                {isAuthenticated && isSubscriptionActive() ? (
                  <div className="text-center">
                    <div className="w-full bg-green-100 text-green-800 border border-green-300 font-semibold py-3 px-6 rounded-lg">
                      ✓ Already Subscribed
                    </div>
                    <p className="text-sm text-secondary mt-2">
                      {dbSubscription?.status === 'trialing' ? 'You are currently on a trial' : 'You have an active subscription'}
                    </p>
                  </div>
                ) : isAuthenticated ? (
                  <>
                    <button 
                      className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                      onClick={() => openCheckout(
                        [{ priceId: getPaddlePriceId('starter', false), quantity: 1 }], 
                        {
                          name: 'Starter',
                          price: getPlanPrice('starter', false),
                          interval: 'monthly',
                          isTrial: true
                        }
                      )}
                    >
                      Start Free Trial
                    </button>
                    <button 
                      className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-6 rounded-lg transition-colors duration-200 text-sm cursor-pointer"
                      onClick={() => openCheckout([{ priceId: getPaddlePriceId('starter', isAnnual), quantity: 1 }], {
                        name: 'Starter',
                        price: isAnnual ? getPlanAnnualPrice('starter') : getPlanPrice('starter', false),
                        interval: isAnnual ? 'annually' : 'monthly',
                        isTrial: false
                      })}
                    >
                      Subscribe Now
                    </button>
                  </>
                ) : (
                  <button
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => router.push('/auth/signup?redirect=/pricing')}
                  >
                    Sign Up for Free Trial
                  </button>
                )}
                {!isAuthenticated || !isSubscriptionActive() ? (
                  <p className="text-xs text-secondary mt-2">
                    Cancel anytime during trial
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Pro Plan */}
          <div className="bg-background-secondary rounded-2xl p-8 border-2 border-accent relative">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-accent text-primary px-4 py-1 rounded-full text-sm font-semibold">
                Most Popular
              </span>
            </div>
            <div className="text-center flex flex-col justify-between h-full">
              <div>
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Pro</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-accent">
                    ${getPlanPrice('pro', isAnnual)}
                  </span>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually (${getPlanAnnualPrice('pro')}/year)
                    </div>
                  )}
                  <div className="text-sm text-accent mt-2 font-medium">
                    Try free for 7 days
                  </div>
                  <div className="text-xs text-accent mt-1 font-semibold">
                    with {getPlanByName('pro')?.trialFilePagesLimit || 20} PDFs, {getPlanByName('pro')?.trialMessagesLimit || 40} AI messages
                  </div>
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited PDF page uploads
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {getPlanByName('pro')?.messagesLimit || 400} AI chat messages
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority support
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                {/* Show subscription status if user has active subscription */}
                {isAuthenticated && isSubscriptionActive() ? (
                  <div className="text-center">
                    <div className="w-full bg-green-100 text-green-800 border border-green-300 font-semibold py-3 px-6 rounded-lg">
                      ✓ Already Subscribed
                    </div>
                    <p className="text-sm text-secondary mt-2">
                      {dbSubscription?.status === 'trialing' ? 'You are currently on a trial' : 'You have an active subscription'}
                    </p>
                  </div>
                ) : isAuthenticated ? (
                  <>
                    <button 
                      className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                      onClick={() => openCheckout(
                        [{ priceId: getPaddlePriceId('pro', false), quantity: 1 }], 
                        {
                          name: 'Pro',
                          price: getPlanPrice('pro', false),
                          interval: 'monthly',
                          isTrial: true
                        }
                      )}
                    >
                      Start Free Trial
                    </button>
                    <button
                      className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-6 rounded-lg transition-colors duration-200 text-sm cursor-pointer"
                      onClick={() => openCheckout([{ priceId: getPaddlePriceId('pro', isAnnual), quantity: 1 }], {
                        name: 'Pro',
                        price: isAnnual ? getPlanAnnualPrice('pro') : getPlanPrice('pro', false),
                        interval: isAnnual ? 'annually' : 'monthly',
                        isTrial: false
                      })}
                    >
                      Subscribe Now
                    </button>
                  </>
                ) : (
                  <button
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => router.push('/auth/signup?redirect=/pricing')}
                  >
                    Sign Up for Free Trial
                  </button>
                )}
                {!isAuthenticated || !isSubscriptionActive() ? (
                  <p className="text-xs text-secondary mt-2">
                    Cancel anytime during trial
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Plus Plan */}
          <div className="bg-background-secondary rounded-2xl p-8 border border-secondary relative">
            {/* 60% Discount Badge - Only show when annual billing is selected */}
            {isAnnual && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-accent text-primary px-4 py-1 rounded-full text-sm font-bold">
                  Special 60% OFF
                </span>
              </div>
            )}
            <div className="text-center flex flex-col justify-between h-full">
              <div>
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Plus</h3>
                <div className="mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-4xl font-bold text-accent">
                      ${getPlanPrice('Plus', isAnnual) || (isAnnual ? '8.00' : '9.99')}
                    </span>
                  </div>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually (${getPlanAnnualPrice('plus') || '96'}/year)
                    </div>
                  )}
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited PDF page uploads
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited AI chat messages
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority support
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Advanced analytics
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                {/* Show subscription status if user has active subscription */}
                {isAuthenticated && isSubscriptionActive() ? (
                  <div className="text-center">
                    <div className="w-full bg-green-100 text-green-800 border border-green-300 font-semibold py-3 px-6 rounded-lg">
                      ✓ Already Subscribed
                    </div>
                    <p className="text-sm text-secondary mt-2">
                      {dbSubscription?.status === 'trialing' ? 'You are currently on a trial' : 'You have an active subscription'}
                    </p>
                  </div>
                ) : isAuthenticated ? (
                  <>
                    <button 
                      className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                      onClick={() => openCheckout(
                        [{ priceId: getPaddlePriceId('plus', false), quantity: 1 }], 
                        {
                          name: 'Plus',
                          price: getPlanPrice('plus', false),
                          interval: 'monthly',
                          isTrial: true
                        }
                      )}
                    >
                      Start Free Trial
                    </button>
                    <button
                      className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-6 rounded-lg transition-colors duration-200 text-sm cursor-pointer"
                      onClick={() => openCheckout([{ priceId: getPaddlePriceId('plus', isAnnual), quantity: 1 }], {
                        name: 'Plus',
                        price: isAnnual ? getPlanAnnualPrice('plus') : getPlanPrice('plus', false),
                        interval: isAnnual ? 'annually' : 'monthly',
                        isTrial: false
                      })}
                    >
                      Subscribe Now
                    </button>
                  </>
                ) : (
                  <button
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => router.push('/auth/signup?redirect=/pricing')}
                  >
                    Sign Up for Free Trial
                  </button>
                )}
                {!isAuthenticated || !isSubscriptionActive() ? (
                  <p className="text-xs text-secondary mt-2">
                    Cancel anytime during trial
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
      {/* Only render checkout container if user is authenticated */}
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
                  <h4 className="text-lg font-medium text-text-primary">{selectedPlan.name} Plan</h4>
                  {selectedPlan.isTrial && (
                    <span className="inline-block bg-accent text-primary px-2 py-1 rounded-full text-xs font-semibold mt-1">
                      7-Day Free Trial
                    </span>
                  )}
                </div>
                
                {/* Pricing */}
                <div className="border-t border-secondary pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-secondary">Price</span>
                    <span className="text-text-primary font-semibold">
                      ${selectedPlan.price}/{selectedPlan.interval === 'annually' ? 'year' : 'month'}
                    </span>
                  </div>
                  
                  {selectedPlan.interval === 'annually' && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-secondary">Billed</span>
                      <span className="text-text-primary">Annually</span>
                    </div>
                  )}
                  
                  {selectedPlan.isTrial && (
                    <div className="bg-accent bg-opacity-10 rounded-lg p-3 mt-3">
                      <p className="text-sm text-primary font-medium">
                        Free for 7 days, then ${selectedPlan.price}/{selectedPlan.interval === 'annually' ? 'year' : 'month'}
                      </p>
                      <p className="text-xs text-secondary mt-1">
                        Cancel anytime during trial period
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Features Summary */}
                <div className="border-t border-secondary pt-4">
                  <h5 className="text-sm font-medium text-text-primary mb-2">What&apos;s included:</h5>
                  <ul className="text-sm text-secondary space-y-1">
                    <li>• Unlimited PDF page uploads</li>
                    <li>• {selectedPlan.name === 'Plus' ? 'Unlimited' : (getPlanByName(selectedPlan.name.toLowerCase())?.messagesLimit || 0)} AI chat messages</li>
                    <li>• {selectedPlan.name === 'Starter' ? 'Email support' : 'Priority support'}</li>
                  </ul>
                </div>
                {/* Trial Limits */}
                {selectedPlan.isTrial &&
                  <div className='bg-accent bg-opacity-10 rounded-lg p-3 mt-3'>
                    <p className="text-sm text-primary mt-1 font-medium">Trial limits:</p>
                    <p className="text-xs text-primary mt-1 font-medium">
                      <span className='font-normal'>
                        Unlimited PDF page uploads, {getPlanByName(selectedPlan.name.toLowerCase())?.trialMessagesLimit || 0} AI chat messages
                      </span>
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Fallback for when no plan is selected but user is authenticated */}
      {isAuthenticated && !selectedPlan && <div className='checkout-container'></div>}
    </div>
  );
}
