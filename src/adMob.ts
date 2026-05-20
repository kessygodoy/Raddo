import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob';

const ADMOB_BANNER_ID = 'ca-app-pub-8229743926476674/7512105226';
const ADMOB_REWARDED_ID = 'ca-app-pub-8229743926476674/3031999816';

let initialized = false;

export function isNativeAdMobAvailable() {
  return Capacitor.isNativePlatform();
}

export async function initializeAdMob() {
  if (!isNativeAdMobAvailable() || initialized) return false;

  try {
    await AdMob.initialize({
      initializeForTesting: false,
      maxAdContentRating: MaxAdContentRating.MatureAudience,
    });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function showAdMobBanner() {
  const ready = await initializeAdMob();
  if (!ready) return false;

  try {
    await AdMob.showBanner({
      adId: ADMOB_BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 82,
      isTesting: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function hideAdMobBanner() {
  if (!isNativeAdMobAvailable()) return;

  try {
    await AdMob.hideBanner();
  } catch {
    // Banner may not be loaded yet.
  }
}

export async function showRewardedVideoAd() {
  const ready = await initializeAdMob();
  if (!ready) return false;

  try {
    await AdMob.prepareRewardVideoAd({
      adId: ADMOB_REWARDED_ID,
      isTesting: false,
    });
    await AdMob.showRewardVideoAd();
    return true;
  } catch {
    return false;
  }
}
