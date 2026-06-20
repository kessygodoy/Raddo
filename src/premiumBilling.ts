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
  purchasePremium(options: { obfuscatedAccountId: string; productId: string }): Promise<BillingPurchase>;
  restorePremium(options: { productId: string }): Promise<{ purchases?: BillingPurchase[] }>;
};

const RaddoBilling = registerPlugin<RaddoBillingPlugin>('RaddoBilling');

export async function premiumBillingAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  const { data, error } = await supabase.functions.invoke<{ configured?: boolean; ok?: boolean }>('verify-premium-purchase', {
    body: { action: 'status' },
  });
  return !error && Boolean(data?.ok && data.configured);
}

async function obfuscatedAccountId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Entre na sua conta antes de assinar o Premium.');
  const bytes = new TextEncoder().encode(data.user.id);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

  const purchase = await RaddoBilling.purchasePremium({
    obfuscatedAccountId: await obfuscatedAccountId(),
    productId: PREMIUM_PRODUCT_ID,
  });
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
