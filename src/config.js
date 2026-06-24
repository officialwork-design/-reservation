export const CONFIG = {
  LIFF_ID: '',
  GAS_URL: '',
  REQUEST_TIMEOUT_MS: 20000
};

export function validateConfig() {
  const missing = [];
  if (!CONFIG.LIFF_ID) missing.push('LIFF_ID');
  if (!CONFIG.GAS_URL) missing.push('GAS_URL');
  return missing;
}
