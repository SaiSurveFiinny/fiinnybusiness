"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getUserProfile } from "../firebase";
import {
  saveCart,
  loadStoredCart,
  reconstructCartItems,
  mergeCartItems,
} from "../cartService";
import { calcDiscount } from "../utils/discount";
import type { CartItem } from "../../types/order";
import type { MarketplaceProduct } from "../../types/product";

/** Same key the SPA shell (app/page.tsx) uses, so a cart filled on a standalone
 *  route (e.g. /brand/{slug}) is picked up when the shopper lands back in the app. */
const CART_KEY = "krishidukan_cart_v1";

function readGuestCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Cart state for routes that live OUTSIDE the SPA shell.
 *
 * The main app keeps the cart in app/page.tsx React state; standalone Next routes
 * (the brand page) have no access to it. This hook mirrors that component's
 * persistence rules exactly — guests in localStorage, signed-in shoppers in
 * Firestore via cartService with localStorage kept clear — so both surfaces
 * read and write one cart rather than two that silently diverge.
 */
export function useSharedCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [phone, setPhone] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest cart first so the badge is correct before auth resolves.
  useEffect(() => {
    setItems(readGuestCart());
    setLoaded(true);
  }, []);

  // On sign-in, merge the guest cart into the Firestore cart — same order of
  // operations as the SPA, so switching surfaces never drops or duplicates items.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setPhone("");
        return;
      }
      try {
        const profile = await getUserProfile(firebaseUser.uid);
        const p = profile?.phone || "";
        setPhone(p);
        if (!p) return;

        const guestCart = readGuestCart();
        const stored = await loadStoredCart(p);
        const merged =
          stored.length > 0
            ? mergeCartItems(guestCart, await reconstructCartItems(stored))
            : guestCart;

        if (merged.length > 0 || stored.length > 0) {
          setItems(merged);
          await saveCart(p, merged);
        }
        window.localStorage.removeItem(CART_KEY);
      } catch (e) {
        console.error("[Cart] brand-page sync failed:", e);
      }
    });
    return () => unsub();
  }, []);

  // Persist: Firestore (debounced) when signed in, localStorage otherwise.
  useEffect(() => {
    if (!loaded) return;
    if (!phone) {
      window.localStorage.setItem(CART_KEY, JSON.stringify(items));
      return;
    }
    window.localStorage.removeItem(CART_KEY);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCart(phone, items).catch((e) =>
        console.error("[Cart] Firestore save failed:", e),
      );
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [items, phone, loaded]);

  /**
   * Adds a "pending" cart line — no seller attached yet, exactly like the Market
   * grid's Add to Cart. The shopper picks the actual store later in the cart, so
   * the brand page doesn't have to resolve a seller.
   */
  const addToCart = useCallback((product: MarketplaceProduct) => {
    if (product.sellMode === "offline_store_only") return false;

    const maxPct = product.maxDiscountPct ?? product.effectiveDiscountPct ?? 0;
    const { finalPrice } = calcDiscount(product.price, maxPct);

    setItems((prev) => {
      const found = prev.find(
        (i) =>
          i.productId === product.id &&
          i.sellMode === "pending" &&
          i.variantUnit === undefined,
      );
      if (found) {
        return prev.map((i) =>
          i.productId === product.id &&
          i.sellMode === "pending" &&
          i.variantUnit === undefined
            ? { ...i, qty: i.qty + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sellerId: "",
          sellerType: "retailer" as const,
          name: product.name,
          image: product.image,
          price: maxPct > 0 ? finalPrice : product.price,
          originalPrice: maxPct > 0 ? product.price : undefined,
          discountPct: maxPct > 0 ? maxPct : undefined,
          qty: 1,
          sellMode: "pending" as const,
          ...(product.gstApplicable && product.gstRate
            ? { gstApplicable: true, gstRate: product.gstRate }
            : {}),
        },
      ];
    });
    return true;
  }, []);

  const isInCart = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items],
  );

  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return { items, count, addToCart, isInCart, loaded };
}
