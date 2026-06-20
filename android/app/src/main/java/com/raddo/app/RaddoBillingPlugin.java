package com.raddo.app;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "RaddoBilling")
public class RaddoBillingPlugin extends Plugin implements PurchasesUpdatedListener {
  private static final String DEFAULT_PREMIUM_PRODUCT_ID = "raddo_premium_monthly";

  private BillingClient billingClient;
  private PluginCall purchaseCall;

  @Override
  public void load() {
    billingClient = BillingClient.newBuilder(getContext())
      .setListener(this)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .build();
  }

  @PluginMethod
  public void purchasePremium(PluginCall call) {
    String productId = call.getString("productId", DEFAULT_PREMIUM_PRODUCT_ID);
    String obfuscatedAccountId = call.getString("obfuscatedAccountId", "");

    ensureConnected(call, () -> queryPremiumProduct(productId, obfuscatedAccountId, call));
  }

  @PluginMethod
  public void restorePremium(PluginCall call) {
    ensureConnected(call, () -> {
      QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
        .setProductType(BillingClient.ProductType.SUBS)
        .build();

      billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
          call.reject(billingResult.getDebugMessage());
          return;
        }

        JSObject result = new JSObject();
        result.put("purchases", purchasesToArray(purchases));
        call.resolve(result);
      });
    });
  }

  private void queryPremiumProduct(String productId, String obfuscatedAccountId, PluginCall call) {
    QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
      .setProductId(productId)
      .setProductType(BillingClient.ProductType.SUBS)
      .build();

    QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
      .setProductList(Collections.singletonList(product))
      .build();

    billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
      if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
        call.reject(billingResult.getDebugMessage());
        return;
      }

      List<ProductDetails> productDetailsList = queryProductDetailsResult.getProductDetailsList();
      if (productDetailsList.isEmpty()) {
        call.reject("Assinatura Premium não encontrada na Play Store. Confira o produto " + productId + ".");
        return;
      }

      ProductDetails productDetails = productDetailsList.get(0);
      List<ProductDetails.SubscriptionOfferDetails> offers = productDetails.getSubscriptionOfferDetails();
      if (offers == null || offers.isEmpty()) {
        call.reject("Plano mensal do Premium não encontrado na Play Store.");
        return;
      }

      BillingFlowParams.ProductDetailsParams productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
        .setProductDetails(productDetails)
        .setOfferToken(offers.get(0).getOfferToken())
        .build();

      BillingFlowParams.Builder flowParamsBuilder = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(Collections.singletonList(productDetailsParams));
      if (!obfuscatedAccountId.isEmpty()) {
        flowParamsBuilder.setObfuscatedAccountId(obfuscatedAccountId);
      }
      BillingFlowParams flowParams = flowParamsBuilder.build();

      purchaseCall = call;
      BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
      if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
        purchaseCall = null;
        call.reject(launchResult.getDebugMessage());
      }
    });
  }

  @Override
  public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
    if (purchaseCall == null) return;

    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
      purchaseCall.reject("Compra cancelada.");
      purchaseCall = null;
      return;
    }

    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
      purchaseCall.reject(billingResult.getDebugMessage());
      purchaseCall = null;
      return;
    }

    Purchase purchase = purchases.get(0);
    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
      purchaseCall.reject("A compra ainda não foi confirmada pela Play Store.");
      purchaseCall = null;
      return;
    }

    acknowledgeIfNeeded(purchase);

    JSObject result = purchaseToObject(purchase);
    purchaseCall.resolve(result);
    purchaseCall = null;
  }

  private void acknowledgeIfNeeded(Purchase purchase) {
    if (purchase.isAcknowledged()) return;

    AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
      .setPurchaseToken(purchase.getPurchaseToken())
      .build();

    billingClient.acknowledgePurchase(params, ignored -> {});
  }

  private JSArray purchasesToArray(List<Purchase> purchases) {
    JSArray array = new JSArray();
    for (Purchase purchase : purchases) {
      if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
        array.put(purchaseToObject(purchase));
      }
    }
    return array;
  }

  private JSObject purchaseToObject(Purchase purchase) {
    JSObject result = new JSObject();
    result.put("purchaseToken", purchase.getPurchaseToken());
    result.put("orderId", purchase.getOrderId());
    result.put("packageName", purchase.getPackageName());
    result.put("products", new JSArray(purchase.getProducts()));
    result.put("purchaseTime", purchase.getPurchaseTime());
    result.put("isAcknowledged", purchase.isAcknowledged());
    return result;
  }

  private void ensureConnected(PluginCall call, Runnable onConnected) {
    if (billingClient.isReady()) {
      onConnected.run();
      return;
    }

    billingClient.startConnection(new BillingClientStateListener() {
      @Override
      public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
          onConnected.run();
        } else {
          call.reject(billingResult.getDebugMessage());
        }
      }

      @Override
      public void onBillingServiceDisconnected() {
        // The next call reconnects automatically.
      }
    });
  }
}
