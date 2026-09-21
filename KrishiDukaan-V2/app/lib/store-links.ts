/**
 * Single source of truth for the app-store download links, shared by the
 * /app landing page, the footer, and the navbar.
 *
 * The Android package id is fixed at build time (mobile/android/app/build.gradle.kts),
 * so the Play Store URL is deterministic and safe to hardcode — it will 404 until
 * the listing goes live, then start working with zero code changes.
 *
 * The iOS App Store URL is NOT deterministic — Apple assigns the numeric app id
 * only once the app is approved in App Store Connect. Now that KrishiDukan is live
 * on the App Store, that id is known and the URL is hardcoded here (same as the
 * Android package above). NEXT_PUBLIC_APP_STORE_URL can still override it if the
 * listing ever moves.
 */

const ANDROID_PACKAGE_ID = "com.karanarjuntechnologies.KrishiDukan";

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;

export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
  "https://apps.apple.com/in/app/krishidukan/id6788309167";

/** Android is always considered "live" — the Play Store URL 404s gracefully pre-launch. */
export const androidLive = true;

/** True now that the App Store listing is live (APP_STORE_URL is always set). */
export const iosLive = Boolean(APP_STORE_URL);
