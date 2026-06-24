export const CONFIG = {
  LIFF_ID: '',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwJ98cJAg-FVLcgmua1WOr-Apgfn4N9Q3sEXEuEARQZx46eRLyHR2cI1pJnG4DMy2c5/exec',
  REQUEST_TIMEOUT_MS: 20000
};

export function validateConfig() {
  const missing = [];
  if (!CONFIG.LIFF_ID) missing.push('LIFF_ID');
  if (!CONFIG.GAS_URL) missing.push('GAS_URL');
  return missing;
}
