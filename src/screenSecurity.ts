import { Capacitor, registerPlugin } from '@capacitor/core';

type RaddoScreenSecurityPlugin = {
  setSecure(options: { enabled: boolean }): Promise<void>;
};

const RaddoScreenSecurity = registerPlugin<RaddoScreenSecurityPlugin>('RaddoScreenSecurity');

export async function setScreenshotBlocked(enabled: boolean) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    await RaddoScreenSecurity.setSecure({ enabled });
  } catch {
    // Screenshot blocking is a privacy enhancement, not a reason to break media viewing.
  }
}
