package com.raddo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(RaddoUpdaterPlugin.class);
    registerPlugin(RaddoBillingPlugin.class);
    super.onCreate(savedInstanceState);
    getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    createPushNotificationChannel();
  }

  private void createPushNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
      getString(R.string.default_notification_channel_id),
      "Raddo",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Mensagens, matches e chats do Raddo");

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) manager.createNotificationChannel(channel);
  }
}
