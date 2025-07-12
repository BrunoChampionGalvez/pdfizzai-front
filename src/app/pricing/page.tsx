'use client';

import * as Paddle from '@paddle/paddle-js';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  const monthlyStarter: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtb4tanwae3pv22fyewn0g',
    quantity: 1,
  }]
  const monthlyStarterWithTrial: Paddle.CheckoutLineItem[] = [{
    priceId: 'pri_01jzvtvh1gm7s98g4mxg2syfbj',
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

  const openCheckout = (items: Paddle.CheckoutOpenLineItem[]) => {
    Paddle.getPaddleInstance()?.Checkout.open({
      items: items,
    });
  }

  useEffect(() => {
    const initializePaddleFunction = async () => {
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
        frameInitialHeight: 450,
        frameStyle: "min-width: 50%; max-height: 95%; background-color: oklch(0.16 0.028 264.665); border: 2px solid gray; position: absolute; top: 50%; left: 0; right: 0; margin: auto; transform: translateY(-50%); border-radius: 8px; padding: 16px;"
          }
        }
      });
    }
    initializePaddleFunction();
  }, []);

  const closeCheckout = () => {
    Paddle.getPaddleInstance()?.Checkout.close();
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
          <div className="bg-background-secondary rounded-2xl p-8 border border-secondary">
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
              <button 
              className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              onClick={() => openCheckout(isAnnual ? yearlyStarter : monthlyStarter)}>
                Get Started
              </button>
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
              <button
               className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
               onClick={() => openCheckout(isAnnual ? yearlyPro : monthlyPro)}>
                Get Started
              </button>
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
                    24/7 phone support
                  </li>
                  <li className="flex items-center text-text-primary">
                    <svg className="h-5 w-5 text-accent mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Negotiable pricing based on volume
                  </li>
                </ul>
              </div>
              <button className="w-full bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-3 px-6 rounded-lg transition-colors duration-200">
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-16">
          <p className="text-secondary mb-6">
            Not sure which plan is right for you?
          </p>
          <Link
            href="/auth/signup"
            className="inline-block bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-8 rounded-lg transition-colors duration-200 text-lg"
          >
            Start Free Trial
          </Link>
        </div>
      </div>
      <div className='checkout-container'></div>
      <button 
        onClick={closeCheckout}
        className="fixed w-8 h-8 bg-opacity-50 hover:bg-opacity-80 text-accent hover:text-accent-300 rounded-full flex items-center justify-center text-2xl font-bold cursor-pointer"
        style={{ display: 'none', zIndex: 10001 }}
        id="checkout-close-btn"
      >
        ×
      </button>
      <style jsx>{`
        .checkout-container:has(iframe) + #checkout-close-btn {
          display: flex !important;
          top: calc(2.5% + 20px);
          right: calc(25% + 35px);
        }
      `}</style>
    </div>
  );
}
