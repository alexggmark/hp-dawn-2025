/*

File to controls feature flags in PostHog. This fails safely, if no FeatureFlag running from PostHog, nothing happens.
Use this file to control variants. I.e. "if test A running, querySelect this element and show/hide"

- data-abtest="experiment-name"
- data-abtest-var="a" (optional: if comparing 2 features)
- data-abtest-var="b" (default hidden)
- data-abtest-multivar="a"/"b"…etc

- "active-bundles"
- "atf-paired" XX

data-abtest="atf-paired"
data-abtest-var="b"

- "active-search" XX

data-abtest="active-search"
data-abtest-var="a"
data-abtest-var="b"

- "rotating-usps" X

data-abtest="rotating-usps"
data-abtest-var="a"
data-abtest-var="b"
  data-abtest-multivar="a"
  data-abtest-multivar="b"
  data-abtest-multivar="c"

- "recently-viewed" XX

data-abtest="recently-viewed"
data-abtest-var="b"
*/

// MASTER TEST BUS
posthog.onFeatureFlags(function() {
  // if (posthog.getFeatureFlag('atf-paired')  == 'test') {
  if (posthog.isFeatureEnabled('atf-paired')) handleAtfPairedTest();

  // if (posthog.getFeatureFlag('active-search')  == 'test') {
  if (posthog.isFeatureEnabled('active-search')) handleActiveSearchTest()

  // if (posthog.getFeatureFlag('recently-viewed')  == 'test') {
  if (posthog.isFeatureEnabled('recently-viewed')) handleRecentlyViewed();
})

function handleAtfPairedTest() {
  const test = document.querySelector('[data-abtest="atf-paired"]');
  if (!test) return;
  const testElement = test.querySelector('[data-abtest-var="b"]');
  if (!testElement) return;

  testElement.style.display = "block";
}

function handleActiveSearchTest() {
  document.querySelector('header').classList.add('ab-test-active-search');
}

function handleRecentlyViewed() {
  const test = document.querySelector('[data-abtest="recently-viewed"]');
  if (!test) return;
  const testElement = test.querySelector('[data-abtest-var="b"]');
  if (!testElement) return;

  testElement.style.display = "block";
}