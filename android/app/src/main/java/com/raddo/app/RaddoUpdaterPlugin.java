package com.raddo.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RaddoUpdater")
public class RaddoUpdaterPlugin extends Plugin {
  private long downloadId = -1;
  private BroadcastReceiver downloadReceiver;

  @PluginMethod
  public void installApk(PluginCall call) {
    String apkUrl = call.getString("url");
    if (apkUrl == null || apkUrl.trim().isEmpty()) {
      call.reject("URL do APK não informada.");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
      Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
      settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(settingsIntent);
      call.reject("Ative a permissão para instalar apps desconhecidos e tente atualizar novamente.");
      return;
    }

    try {
      DownloadManager downloadManager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
      if (downloadManager == null) {
        call.reject("Gerenciador de downloads indisponível.");
        return;
      }

      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
      request.setTitle("Atualização do Raddo");
      request.setDescription("Baixando nova versão do app.");
      request.setMimeType("application/vnd.android.package-archive");
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalFilesDir(getContext(), "updates", "raddo-update.apk");

      unregisterDownloadReceiver();
      downloadId = downloadManager.enqueue(request);
      registerDownloadReceiver(downloadManager);

      JSObject result = new JSObject();
      result.put("downloadId", downloadId);
      call.resolve(result);
    } catch (Exception exception) {
      call.reject(exception.getMessage() != null ? exception.getMessage() : "Não consegui iniciar a atualização.");
    }
  }

  private void registerDownloadReceiver(DownloadManager downloadManager) {
    downloadReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
        if (completedId != downloadId) return;

        Uri apkUri = downloadManager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) return;

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(installIntent);
        unregisterDownloadReceiver();
      }
    };

    IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      getContext().registerReceiver(downloadReceiver, filter);
    }
  }

  private void unregisterDownloadReceiver() {
    if (downloadReceiver == null) return;

    try {
      getContext().unregisterReceiver(downloadReceiver);
    } catch (Exception ignored) {
      // Receiver may already be detached when the activity is recreated.
    }
    downloadReceiver = null;
  }
}
