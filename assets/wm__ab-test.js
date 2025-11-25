/*

File to controls feature flags in PostHog. This fails safely, if no FeatureFlag running from PostHog, nothing happens.
Use this file to control variants. I.e. "if test A running, querySelect this element and show/hide"

*/

posthog.onFeatureFlags(function() {
  if (posthog.getFeatureFlag('test-experiment')  == 'test') {
    console.log('Test running');
  }
})