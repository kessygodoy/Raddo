import { Capacitor, registerPlugin } from '@capacitor/core';

type RaddoUpdaterPlugin = {
  installApk(options: { url: string }): Promise<{ downloadId?: number }>;
};

const RaddoUpdater = registerPlugin<RaddoUpdaterPlugin>('RaddoUpdater');

export async function installAndroidApkUpdate(apkUrl: string) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    window.location.href = apkUrl;
    return;
  }

  await RaddoUpdater.installApk({ url: apkUrl });
}
