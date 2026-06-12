package com.raddo.app;

import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RaddoScreenSecurity")
public class RaddoScreenSecurityPlugin extends Plugin {
  @PluginMethod
  public void setSecure(PluginCall call) {
    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    getActivity().runOnUiThread(() -> {
      Window window = getActivity().getWindow();
      if (enabled) {
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
      } else {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
      }
      call.resolve();
    });
  }
}
