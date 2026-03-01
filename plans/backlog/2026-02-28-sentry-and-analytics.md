# Sentry and Analytics

Add Sentry error tracking and analytics to the web, API, and iOS apps.

## Why

Currently we have no visibility into:
- Production errors and crashes
- User behavior and feature usage
- Performance bottlenecks
- API error rates

## Areas to Instrument

**Web App:**
- Error tracking (React error boundaries, API failures)
- Performance monitoring (page loads, interactions)
- User flows (todo creation, completion rates)

**API Worker:**
- Error tracking (unhandled exceptions, AI failures)
- Performance (database query times, AI response times)
- Request volume and error rates per endpoint

**iOS App:**
- Crash reporting
- Error tracking (sync failures, network issues)
- App lifecycle events (launches, background/foreground)

## Considerations

- Privacy: ensure no PII is captured
- Sampling: decide on error vs session sampling rates
- Source maps: need to upload for web/iOS
- Environment separation: dev/staging/prod
