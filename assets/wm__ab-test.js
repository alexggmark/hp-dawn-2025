/*

File to controls feature flags in PostHog. This fails safely, if no FeatureFlag running from PostHog, nothing happens.
Use this file to control variants. I.e. "if test A running, querySelect this element and show/hide"

- data-abtest="experiment-name"
- data-abtest-var="a" (optional: if comparing 2 features)
- data-abtest-var="b" (default hidden)

- "active-bundles"
- "atf-paired"
- "active-search"
- "usps"
- "recently-viewed"

IDEA?: TODO:
{% capture "original_content" %}
{% render 'ab-tester', original: original_content, variant: variant %}

*/

posthog.onFeatureFlags(function() {
  if (posthog.getFeatureFlag('test-experiment')  == 'test') {
    console.log('Test running');
  }
})