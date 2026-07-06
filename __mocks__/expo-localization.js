/**
 * Jest manual mock for expo-localization.
 *
 * Used by src/i18n/i18n.ts to detect the device's preferred language for
 * first-run seeding of `uiLanguage`. In tests we return a deterministic
 * locale so i18next initializes predictably without OS locale detection.
 *
 * API surface implemented (only what i18n.ts uses):
 *   Localization.getLocales()   — returns a deterministic locale list
 *
 * Pattern mirrors __mocks__/expo-sharing.js: module-level state + test
 * utilities for overriding the returned locale.
 *
 * Default: Ukrainian Ukraine ('uk-UA') — the app's primary locale.
 */

'use strict';

let _locales = [
  {
    languageTag: 'uk-UA',
    languageCode: 'uk',
    regionCode: 'UA',
    currencyCode: 'UAH',
    currencySymbol: '₴',
    decimalSeparator: ',',
    digitGroupingSeparator: ' ',
    textDirection: 'ltr',
    measurementSystem: 'metric',
    temperatureUnit: 'celsius',
  },
];

function _reset() {
  _locales = [
    {
      languageTag: 'uk-UA',
      languageCode: 'uk',
      regionCode: 'UA',
      currencyCode: 'UAH',
      currencySymbol: '₴',
      decimalSeparator: ',',
      digitGroupingSeparator: ' ',
      textDirection: 'ltr',
      measurementSystem: 'metric',
      temperatureUnit: 'celsius',
    },
  ];
}

/**
 * Override the locale list for a test (e.g. to simulate an English device).
 * @param {Array} locales — Array of locale objects in expo-localization shape.
 */
function _setLocales(locales) {
  _locales = locales;
}

function getLocales() {
  return _locales;
}

module.exports = {
  getLocales,
  // Test utilities
  _reset,
  _setLocales,
};
