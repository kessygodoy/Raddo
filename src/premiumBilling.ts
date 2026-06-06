import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';

const PREMIUM_PRODUCT_ID = 'raddo_premium_monthly';

type BillingPurchase = {
  isAcknowledged?: boolean;
  orderId?: string;
  packageName?: string;
  products?: string[];
  purchaseTime?: number;
  purchaseToken?: string;
};

type RaddoBillingPlugin = {
  purchasePremium(options: { productId: string }): Promise<BillingPurchase>;
  restorePremium(options: { productId: string }): Promise<{ purchases?: BillingPurchase[] }>;
};

const RaddoBilling = registerPlugin<RaddoBillingPlugin>('RaddoBilling');

async function verifyPremiumPurchase(purchase: BillingPurchase) {
  if (!purchase.purchaseToken) throw new Error('A Play Store não retornou o token da assinatura.');

  const { data, error } = await supabase.functions.invoke<{ expiresAt?: string; isPremium?: boolean; ok?: boolean }>('verify-premium-purchase', {
    body: {
      packageName: purchase.packageName,
      productId: purchase.products?.[0] ?? PREMIUM_PRODUCT_ID,
      purchaseToken: purchase.purchaseToken,
    },
  });

  if (error) throw new Error(error.message || 'Não consegui validar a assinatura.');
  if (!data?.ok || !data.isPremium) throw new Error('A assinatura ainda não foi liberada pela Play Store.');

  return data;
}

export async function buyPremiumSubscription() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('A assinatura Premium só pode ser comprada pelo app Android instalado pela Play Store.');
  }

  const purchase = await RaddoBilling.purchasePremium({ productId: PREMIUM_PRODUCT_ID });
  return verifyPremiumPurchase(purchase);
}

export async function restorePremiumSubscription() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('A restauração do Premium só funciona no app Android.');
  }

  const result = await RaddoBilling.restorePremium({ productId: PREMIUM_PRODUCT_ID });
  const purchase = result.purchases?.find((item) => item.products?.includes(PREMIUM_PRODUCT_ID)) ?? result.purchases?.[0];
  if (!purchase) throw new Error('Não encontrei uma assinatura Premium ativa nesta conta Google.');

  return verifyPremiumPurchase(purchase);
}
