/**
 * Error reporting utility powered by Sentry.
 * Logs errors to console in dev, sends to Sentry in production.
 */

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
  });
}

const IS_DEV = __DEV__;

interface ErrorContext {
  screen?: string;
  action?: string;
  userId?: string | null;
  extra?: Record<string, unknown>;
}

class ErrorReporter {
  private static instance: ErrorReporter;
  private userId: string | null = null;

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  setUser(userId: string | null) {
    this.userId = userId;
    Sentry.setUser(userId ? { id: userId } : null);
  }

  /**
   * Capture an error with optional context.
   */
  captureException(error: unknown, context?: ErrorContext) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const enrichedContext = { ...context, userId: context?.userId ?? this.userId };

    if (IS_DEV) {
      console.error('[ErrorReporter]', errorObj.message, enrichedContext);
      return;
    }

    // Send to Sentry in production
    Sentry.captureException(errorObj, { extra: enrichedContext });
  }

  /**
   * Capture a breadcrumb / log message.
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (IS_DEV) {
      console.log(`[ErrorReporter:${level}]`, message);
      return;
    }
    Sentry.captureMessage(message, level);
  }

  /**
   * Log a navigation event for debugging.
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
    if (IS_DEV) {
      console.log(`[Breadcrumb:${category}]`, message, data);
    }
    Sentry.addBreadcrumb({ category, message, data });
  }
}

export const errorReporter = ErrorReporter.getInstance();

/**
 * Global error handler setup — call this once in _layout.tsx
 */
export function setupGlobalErrorHandling() {
  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    errorReporter.captureException(error, {
      action: isFatal ? 'fatal_error' : 'unhandled_error',
    });

    // Call the original handler so React Native can show the red screen in dev
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });

  // Handle unhandled promise rejections
  if (typeof globalThis !== 'undefined') {
    const origRejection = (globalThis as any).onunhandledrejection;
    (globalThis as any).onunhandledrejection = (event: any) => {
      errorReporter.captureException(event?.reason ?? 'Unhandled promise rejection', {
        action: 'unhandled_promise_rejection',
      });
      if (origRejection) origRejection(event);
    };
  }
}
