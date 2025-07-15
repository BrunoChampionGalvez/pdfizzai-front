'use client';

import * as Paddle from '@paddle/paddle-js';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { authService } from '../../services/auth';
import { setRedirectPath } from '../../lib/auth-utils';

enum PlanName {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { user, isAuthenticated, setUser } = useAuthStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<{
    name: string;
    price: string;
    interval: string;
    isTrial: boolean;
  } | null>(null);
  const router = useRouter();

  const monthlyStarter: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtb4tanwae3pv22fyewn0g',
    quantity: 1,
  }]
  const monthlyStarterWithTrial: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtvh1gm7s98g4mxg2syfbj',
    quantity: 1,
  }]
  const yearlyStarterWithTrial: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtd41z144brf89mj9nf69f', // You may need a different priceId for yearly trial
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
  const monthlyProWithTrial: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtxhb6bepcqhme0ynrg4wm',
    quantity: 1,
  }]
  const yearlyProWithTrial: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtxhb6bepcqhme0ynrg4wm', // You may need a different priceId for yearly trial
    quantity: 1,
  }]

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
      } catch (error) {
        // User not authenticated, which is fine for pricing page
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [setUser]);

  useEffect(() => {
    const initializePaddleFunction = async () => {
      // Only initialize Paddle if user is authenticated
      if (!isAuthenticated) return;
      
      // Initialize Paddle on client side
      const paddle = await Paddle.initializePaddle({
        token: 'test_2e2147bc43b16fada23cc993b41', // replace with a client-side token
        environment: 'sandbox',
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
  }, [isAuthenticated, isCheckingAuth]);

  // Re-initialize Paddle when selectedPlan changes to ensure checkout container is ready
  useEffect(() => {
    const reinitializePaddle = async () => {
      if (!isAuthenticated || !selectedPlan) return;
      
      // Small delay to ensure DOM element exists
      setTimeout(async () => {
        try {
          const paddle = await Paddle.initializePaddle({
            token: 'test_2e2147bc43b16fada23cc993b41',
            environment: 'sandbox',
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
        } catch (error) {
          console.error('Failed to reinitialize Paddle:', error);
        }
      }, 100);
    };
    
    reinitializePaddle();
  }, [selectedPlan, isAuthenticated]);

  const closeCheckout = () => {
    Paddle.getPaddleInstance()?.Checkout.close();
    setSelectedPlan(null);
  }

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
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
                16% off
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Starter Plan */}
          <div className="bg-background-secondary rounded-2xl p-8 border border-secondary relative">
            <div className="text-center flex flex-col justify-between h-full">
              <div>
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Starter</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-accent">
                    ${isAnnual ? '4.90' : '5.90'}
                  </span>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually ($59.80/year)
                    </div>
                  )}
                  <div className="text-sm text-accent mt-2 font-medium">
                    Try free for 7 days
                  </div>
                  <div className="text-xs text-accent mt-1 font-medium">
                    with 10 PDFs, 20 AI messages
                  </div>
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    250 PDF uploads
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    200 AI chat messages
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
                {isAuthenticated 
                ? <button 
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => openCheckout(
                      monthlyStarterWithTrial, 
                      {
                        name: 'Starter',
                        price: '5.90',
                        interval: 'monthly',
                        isTrial: true
                      }
                    )}
                  >
                    Start Free Trial
                  </button>   
                : <button
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => router.push('/auth/signup?redirect=/pricing')}
                  >
                    Sign Up for Free Trial
                  </button>
                }
                <button 
                  className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-6 rounded-lg transition-colors duration-200 text-sm cursor-pointer"
                  onClick={() => openCheckout(isAnnual ? yearlyStarter : monthlyStarter, {
                    name: 'Starter',
                    price: isAnnual ? '59.80' : '5.90',
                    interval: isAnnual ? 'annually' : 'monthly',
                    isTrial: false
                  })}
                >
                  Subscribe Now
                </button>
                <p className="text-xs text-secondary mt-2">
                  Cancel anytime during trial
                </p>
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
                    ${isAnnual ? '8.25' : '9.90'}
                  </span>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually ($99/year)
                    </div>
                  )}
                  <div className="text-sm text-accent mt-2 font-medium">
                    Try free for 7 days
                  </div>
                  <div className="text-xs text-accent mt-1 font-semibold">
                    with 20 PDFs, 40 AI messages
                  </div>
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    500 PDF uploads
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    500 AI chat messages
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
                {isAuthenticated 
                ? <button 
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => openCheckout(
                      monthlyProWithTrial, 
                      {
                        name: 'Pro',
                        price: '9.90',
                        interval: 'monthly',
                        isTrial: true
                      }
                    )}
                  >
                    Start Free Trial
                  </button>   
                : <button
                    className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer"
                    onClick={() => router.push('/auth/signup?redirect=/pricing')}
                  >
                    Sign Up for Free Trial
                  </button>
                }
                <button
                  className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-6 rounded-lg transition-colors duration-200 text-sm cursor-pointer"
                  onClick={() => openCheckout(isAnnual ? yearlyPro : monthlyPro, {
                    name: 'Pro',
                    price: isAnnual ? '99' : '9.90',
                    interval: isAnnual ? 'annually' : 'monthly',
                    isTrial: false
                  })}
                >
                  Subscribe Now
                </button>
                <p className="text-xs text-secondary mt-2">
                  Cancel anytime during trial
                </p>
              </div>
            </div>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-background-secondary rounded-2xl p-8 border border-secondary">
            <div className="text-center flex flex-col justify-between h-full">
              <div>
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Enterprise</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-accent">
                    ${isAnnual ? '7.00' : '8.49'}
                  </span>
                  <span className="text-secondary">/{isAnnual ? 'month' : 'month'}/user</span>
                  {isAnnual && (
                    <div className="text-sm text-secondary mt-1">
                      Billed annually ($84/year/user)
                    </div>
                  )}
                </div>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    500 PDF uploads / user
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    500 AI chat messages / user
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
                    Negotiable pricing based on volume
                  </li>
                </ul>
              </div>
              <button className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200 cursor-pointer">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
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
                  <h5 className="text-sm font-medium text-text-primary mb-2">What's included:</h5>
                  <ul className="text-sm text-secondary space-y-1">
                    {selectedPlan.name === 'Starter' ? (
                      <>
                        <li>• 250 PDF uploads</li>
                        <li>• 200 AI chat messages</li>
                        <li>• Email support</li>
                      </>
                    ) : (
                      <>
                        <li>• 500 PDF uploads</li>
                        <li>• 500 AI chat messages</li>
                        <li>• Priority support</li>
                      </>
                    )}
                  </ul>
                </div>
                {/* Trial Limits */}
                {selectedPlan.isTrial &&
                  <div className='bg-accent bg-opacity-10 rounded-lg p-3 mt-3'>
                    <p className="text-sm text-primary mt-1 font-medium">Trial limits:</p>
                    <p className="text-xs text-primary mt-1 font-medium">
                      <span className='font-normal'>{selectedPlan.name === 'Starter' ? '10 PDFs, 20 messages' : '20 PDFs, 40 messages'}</span>
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
