'use client';

import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="flex flex-col items-center justify-center  p-8 bg-background-primary text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Something went wrong</h2>
          <p className="text-secondary mb-6 max-w-md">
            We're sorry, but an error occurred while trying to display this content.
          </p>
          <div className="bg-background-secondary p-4 rounded-md mb-6 w-full max-w-lg overflow-auto text-left">
            <pre className="text-sm text-red-400 whitespace-pre-wrap break-words">
              {this.state.error?.toString()}
            </pre>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
