import liff from '@line/liff';
import { CONFIG } from './config.js';

export async function initializeLiff() {
  if (!CONFIG.LIFF_ID) {
    throw new Error('LIFF_ID が未設定です。src/config.js を更新してください。');
  }

  await liff.init({ liffId: CONFIG.LIFF_ID });

  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }

  const profile = await liff.getProfile();
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl || ''
  };
}

export function isInClient() {
  return liff.isInClient();
}
