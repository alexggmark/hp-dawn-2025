/*

File to controls feature flags in PostHog. This fails safely, if no FeatureFlag running from PostHog, nothing happens.
Use this file to control variants. I.e. "if test A running, querySelect this element and show/hide"

- data-abtest="experiment-name"
- data-abtest-var="a" (optional: if comparing 2 features)
- data-abtest-var="b" (default hidden)
- data-abtest-multivar="a"/"b"…etc

- "active-bundles"
- "atf-paired" XX
- "active-search" XX
- "rotating-usps" XX
- "recently-viewed" XX
*/

// MASTER TEST BUS
posthog.onFeatureFlags(function() {
  // TODO: Alex - if you want to turn these back on, setup PostHog, or just run the functions straight
  // - all AB tests built to default to "off" without these functions running (check wm__ab-tests.liquid)
  // if (posthog.getFeatureFlag('atf-paired')  == 'test') {
  // if (posthog.isFeatureEnabled('atf-paired')) handleAtfPairedTest();

  // if (posthog.getFeatureFlag('active-search')  == 'test') {
  // if (posthog.isFeatureEnabled('active-search')) handleActiveSearchTest()

  // if (posthog.getFeatureFlag('recently-viewed')  == 'test') {
  // if (posthog.isFeatureEnabled('recently-viewed')) handleRecentlyViewed();

  // if (posthog.isFeatureEnabled('rotating-usps')) {
  //   const variant = posthog.getFeatureFlag('rotating-usps');
  //   if (!variant) return;
  //   if (variant == 'control') return;
  //   handleRotatingUSPs(variant);
  // }
  // if (posthog.isFeatureEnabled('rotating-usps')) handleRotatingUSPs();
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

function handleRotatingUSPs(variant) {
  if (!variant) return;
  console.log(`Variant: ${variant}`);
  const test = document.querySelector('[data-abtest="rotating-usps"]');
  if (!test) return;
  const controlElement = test.querySelector('[data-abtest-var="a"]');
  if (!controlElement) return;
  const testElement = test.querySelector('[data-abtest-var="b"]');
  if (!testElement) return;
  
  controlElement.style.display = "none";
  testElement.style.display = "block";

  const copy = {
    b: "Formulated by dermatologists – trusted by 1,000+ clinics",
    c: "Free Next-Day Shipping Over £50"
  }

  const testElementText = testElement.querySelector('[data-abtest-multivar="text"]');
  if (!testElementText) return;

  testElementText.textContent = copy[variant];
}