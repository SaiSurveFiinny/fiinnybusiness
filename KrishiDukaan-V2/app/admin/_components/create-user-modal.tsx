"use client";

/**
 * Shared "Create New User" modal — the single source of truth for creating a
 * user account from the admin portal. Extracted verbatim from the Users & Roles
 * page so it can be reused elsewhere (e.g. the manual-order wizard's "Create
 * Customer" action) without duplicating the form, its validation, or its
 * Firestore/Auth creation logic.
 *
 * Creation paths (unchanged from the original):
 *   - admin / salesExecutive → POST /api/admin/create-user (Firebase Auth user)
 *   - retailer / manufacturer / customer → users/{+91phone} written directly
 *     (the admin client token satisfies the rules; sellers also get profiles/ +
 *     storefront + an optional subscription record).
 *
 * `lockRole` restricts the modal to a single role and hides the role selector —
 * the manual-order wizard passes "customer" so it can only mint buyers. On a
 * successful create, `onCreated` receives a summary of the new account (the
 * caller uses it to auto-select the customer); it is null for the email/password
 * roles where no buyer summary is meaningful.
 */

import { useEffect, useRef, useState } from "react";
import {
  UserPlus, X, ShieldCheck, Check, AlertTriangle, MapPin, Loader2,
} from "lucide-react";
import { ensureSellerStorefront, db, auth } from "../../firebase";
import {
  addDoc, doc, setDoc, getDoc, serverTimestamp, collection, Timestamp, GeoPoint,
} from "firebase/firestore";

declare global {
  interface Window { google?: any }
}

export type CreatedUser = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  role: string;
};

function extractAddressFields(place: any) {
  const out: { address?: string; city?: string; state?: string; pincode?: string; latitude?: number; longitude?: number } = {};
  const parts: { long_name: string; types: string[] }[] = place?.address_components || [];
  for (const want of ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2"]) {
    const m = parts.find(p => p.types.includes(want));
    if (m) { out.city = m.long_name; break; }
  }
  const st = parts.find(p => p.types.includes("administrative_area_level_1"));
  if (st) out.state = st.long_name;
  const pin = parts.find(p => p.types.includes("postal_code"));
  if (pin) out.pincode = pin.long_name;
  if (place?.formatted_address) out.address = place.formatted_address;
  if (place?.geometry?.location) {
    out.latitude  = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
    out.longitude = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
  }
  return out;
}

export function CreateUserModal({
  open, onClose, onCreated, lockRole, title = "Create New User",
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (user: CreatedUser | null) => void;
  /** When set, the modal creates only this role and hides the role selector. */
  lockRole?: "customer";
  title?: string;
}) {
  const BLANK_FORM = {
    name: "", email: "", phone: "", password: "", shopName: "",
    role: (lockRole ?? "customer") as string,
    address: "", city: "", state: "", pincode: "",
    latitude: null as number | null, longitude: null as number | null,
    gstin: "", secondaryPhone: "",
    subscriptionStatus: "inactive" as "inactive" | "active",
    seats: 1,
    durationMonths: 12 as 1 | 3 | 6 | 12,
  };

  const [createForm, setCreateForm] = useState(BLANK_FORM);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [seatsInput, setSeatsInput] = useState("1");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const createAddressInputRef = useRef<HTMLInputElement>(null);
  const createAcListenerRef   = useRef<any>(null);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (open) {
      setCreateForm({ ...BLANK_FORM });
      setPhoneError(null); setSeatsInput("1");
      setCreateError(null); setCreateSuccess(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Google Maps autocomplete for the address input.
  useEffect(() => {
    if (!open) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const setup = () => {
      if (!createAddressInputRef.current || !window.google?.maps?.places) return;
      if (createAcListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(createAcListenerRef.current);
      const ac = new window.google.maps.places.Autocomplete(createAddressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      createAcListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const fields = extractAddressFields(place);
        if (createAddressInputRef.current && fields.address)
          createAddressInputRef.current.value = fields.address;
        setCreateForm(prev => ({
          ...prev,
          ...(place.name && (prev.role === "retailer" ? { shopName: place.name } : prev.role === "manufacturer" ? { shopName: place.name } : {})),
          address:   fields.address   ?? prev.address,
          city:      fields.city      ?? prev.city,
          state:     fields.state     ?? prev.state,
          pincode:   fields.pincode   ?? prev.pincode,
          latitude:  fields.latitude  ?? prev.latitude,
          longitude: fields.longitude ?? prev.longitude,
        }));
      });
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const run = () => requestAnimationFrame(() => setup());
    if (window.google?.maps?.places) { run(); }
    else if (existing) {
      if (existing.dataset.loaded === "true") run();
      else existing.addEventListener("load", run, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; run(); };
      document.head.appendChild(script);
    }
    return () => {
      if (createAcListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(createAcListenerRef.current);
      createAcListenerRef.current = null;
    };
  }, [open]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = () => { setPhoneError(null); setSeatsInput("1"); onClose(); };

  const handleCreateUser = async () => {
    const { name, email, phone, password, shopName, role, gstin, secondaryPhone, subscriptionStatus, seats, durationMonths } = createForm;

    // ── Admin / Sales Executive: server route (needs Firebase Auth createUser) ─
    if (role === "admin" || role === "salesExecutive") {
      const label = role === "salesExecutive" ? "sales executive" : "admin";
      if (!email.trim())                    { setCreateError(`Email is required for ${label} accounts.`); return; }
      if (!password || password.length < 6) { setCreateError("Password must be at least 6 characters."); return; }
      setCreating(true); setCreateError(null); setCreateSuccess(null);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ name, email, password, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to create ${label}.`);
        setCreateSuccess(data.message ?? `${label} account created.`);
        setCreateForm({ ...BLANK_FORM });
        onCreated?.(null);
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : `Failed to create ${label}.`);
      } finally { setCreating(false); }
      return;
    }

    // ── Retailer / Manufacturer / Consumer: write Firestore directly ──────────
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!name.trim()) { setCreateError("Full Name is required."); return; }
    if ((role === "retailer" || role === "manufacturer") && !shopName.trim()) {
      setCreateError(`${role === "retailer" ? "Shop Name" : "Business Name"} is required.`);
      return;
    }
    if (subscriptionStatus === "active" && seats < 1) {
      setCreateError("Seats must be at least 1 for active subscriptions.");
      return;
    }

    const normalizedPhone = `+91${digits}`;
    setCreating(true); setCreateError(null); setCreateSuccess(null);
    try {
      const existing = await getDoc(doc(db, "users", normalizedPhone));
      if (existing.exists()) throw new Error(`A user with phone ${normalizedPhone} already exists.`);

      const now = serverTimestamp();
      const callerUid = auth.currentUser?.uid ?? "admin";
      const currentAddress = createAddressInputRef.current?.value?.trim() || createForm.address;

      const isPaid     = subscriptionStatus === "active";
      const totalSeats = isPaid ? Math.max(1, seats) : 0;

      // users/{normalizedPhone}
      await setDoc(doc(db, "users", normalizedPhone), {
        phone: normalizedPhone,
        uid: null,
        name: name.trim(),
        email: email ? email.trim().toLowerCase() : null,
        role,
        isPaid,
        subscriptionStatus,
        totalSeats,
        productCount: 0,
        address: currentAddress || null,
        city: createForm.city || null,
        state: createForm.state || null,
        pincode: createForm.pincode || null,
        latitude:  createForm.latitude  ?? null,
        longitude: createForm.longitude ?? null,
        ...(gstin.trim()          ? { gstin: gstin.trim().toUpperCase() }        : {}),
        ...(secondaryPhone.trim() ? { secondaryPhone: secondaryPhone.trim() } : {}),
        preCreatedByAdmin: callerUid,
        createdAt: now,
        updatedAt: now,
      });

      // profiles/{normalizedPhone} for sellers
      if (role === "retailer" || role === "manufacturer") {
        await setDoc(doc(db, "profiles", normalizedPhone), {
          type: role,
          ownerPhone: normalizedPhone,
          businessName: (shopName || name).trim(),
          ownerName: name.trim(),
          phone: normalizedPhone,
          email: email ? email.trim().toLowerCase() : null,
          address: {
            line1:   currentAddress || null,
            city:    createForm.city    || null,
            state:   createForm.state   || null,
            pincode: createForm.pincode || null,
          },
          // Must be a Firestore GeoPoint — plain {lat,lng} objects are not recognised
          // by parseGeo() as instanceof GeoPoint and are ignored by the Profile page.
          ...(createForm.latitude && createForm.longitude
            ? { geo: new GeoPoint(createForm.latitude, createForm.longitude) }
            : {}),
          ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
          isActive: true,
          subscriptionStatus,
          catalogIds: [],
          retailerPhones: [],
          preCreatedByAdmin: callerUid,
          createdAt: now,
          updatedAt: now,
        });

        await ensureSellerStorefront({
          phone: normalizedPhone, role, name, shopName,
          address: currentAddress || createForm.address,
          city: createForm.city, state: createForm.state, pincode: createForm.pincode,
          latitude: createForm.latitude, longitude: createForm.longitude,
          createdByAdmin: callerUid,
        });
      }

      // Create subscription record for active sellers — mirrors updateSubscriptionStatus logic
      if (isPaid && (role === "retailer" || role === "manufacturer")) {
        const startDate = new Date();
        const expiryDate = new Date(startDate);
        expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
        await addDoc(collection(db, "subscriptions"), {
          ownerPhone: normalizedPhone,
          ownerId: null,
          ownerType: role,
          planName: "Admin Assigned",
          seatsPurchased: totalSeats,
          durationMonths,
          amountPaid: 0,
          currency: "INR",
          subscriptionStatus: "active",
          startDate: Timestamp.fromDate(startDate),
          expiryDate: Timestamp.fromDate(expiryDate),
          createdByAdmin: callerUid,
          createdAt: now,
          updatedAt: now,
        });
      }

      setCreateSuccess(
        `Pre-registered ${normalizedPhone} as ${role}${subscriptionStatus === "active" ? ` (active, ${durationMonths}mo)` : ""}. When they sign in via OTP they will automatically get the ${role} role.`
      );
      onCreated?.({
        id: normalizedPhone,
        name: name.trim(),
        phone: normalizedPhone,
        email: email ? email.trim().toLowerCase() : null,
        city: createForm.city || null,
        state: createForm.state || null,
        address: currentAddress || null,
        role,
      });
      setCreateForm({ ...BLANK_FORM });
      setPhoneError(null);
      setSeatsInput("1");
      if (createAddressInputRef.current) createAddressInputRef.current.value = "";
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user.");
    } finally { setCreating(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-on-surface">{title}</h2>
          </div>
          <button type="button" onClick={close}
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {createError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 font-medium">{createError}</div>
          )}
          {createSuccess && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 font-medium">{createSuccess}</div>
          )}

          {/* ── Role ── */}
          {!lockRole && (
            <div>
              <SectionLabel>Role</SectionLabel>
              <select
                value={createForm.role}
                onChange={e => {
                  setCreateForm({ ...BLANK_FORM, role: e.target.value });
                  setPhoneError(null); setSeatsInput("1");
                  if (createAddressInputRef.current) createAddressInputRef.current.value = "";
                }}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
              >
                <option value="customer">Customer (Regular User)</option>
                <option value="retailer">Retailer</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="salesExecutive">Sales Executive (Field Team)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {/* ── Email + password path (admin & sales executive) ── */}
          {createForm.role === "admin" || createForm.role === "salesExecutive" ? (
            <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 space-y-3">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                {createForm.role === "salesExecutive"
                  ? "Sales Executive — Email + Password login at /sales/login"
                  : "Admin — Email + Password login at /admin-login"}
              </p>
              <Field label="Full Name" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder={createForm.role === "salesExecutive" ? "e.g. Ramesh Field" : "e.g. Vinay Admin"} />
              <Field label="Email *" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder={createForm.role === "salesExecutive" ? "rep@example.com" : "admin@example.com"} type="email" />
              <Field label="Password * (min 6 chars)" value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} placeholder="Secure password" type="password" />
            </div>
          ) : (
            /* Non-admin: phone OTP */
            <>
              {/* ── Required Fields ── */}
              <div>
                <SectionLabel>Required</SectionLabel>
                <div className="space-y-3">
                  {/* Phone with inline validation */}
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Phone Number *</span>
                    <div className={`flex items-center gap-2 rounded-xl border bg-surface-container-low px-3 py-2 ${phoneError ? "border-red-400 ring-2 ring-red-200" : "border-outline-variant/40 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary"}`}>
                      <span className="text-sm font-bold text-on-surface-variant shrink-0">+91</span>
                      <input
                        type="tel"
                        value={createForm.phone}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setCreateForm(f => ({ ...f, phone: digits }));
                          setPhoneError(digits.length > 0 && digits.length < 10
                            ? "Please enter a valid 10-digit mobile number."
                            : null);
                        }}
                        onBlur={() => {
                          const digits = createForm.phone.replace(/\D/g, "");
                          setPhoneError(digits.length > 0 && digits.length !== 10
                            ? "Please enter a valid 10-digit mobile number."
                            : null);
                        }}
                        placeholder="98765 43210"
                        maxLength={10}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                      />
                      {createForm.phone.length === 10 && (
                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                      )}
                    </div>
                    {phoneError && (
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {phoneError}
                      </p>
                    )}
                  </div>

                  <Field
                    label="Full Name *"
                    value={createForm.name}
                    onChange={v => setCreateForm(f => ({ ...f, name: v }))}
                    placeholder="e.g. Raju Sharma"
                  />
                </div>
              </div>

              {/* ── Optional Fields ── */}
              <div>
                <SectionLabel>Optional</SectionLabel>
                <div className="space-y-3">
                  <Field label="Email" value={createForm.email} onChange={v => setCreateForm(f => ({ ...f, email: v }))} placeholder="user@example.com" type="email" />

                  {/* Address — Google Maps autocomplete */}
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Address
                      <span className="text-xs font-normal text-on-surface-variant">(type to search)</span>
                    </span>
                    <input
                      ref={createAddressInputRef}
                      autoComplete="off"
                      placeholder="Type address, landmark or pincode…"
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="City"    value={createForm.city}    onChange={v => setCreateForm(f => ({ ...f, city: v }))}    placeholder="City" />
                    <Field label="State"   value={createForm.state}   onChange={v => setCreateForm(f => ({ ...f, state: v }))}   placeholder="State" />
                    <Field label="Pincode" value={createForm.pincode} onChange={v => setCreateForm(f => ({ ...f, pincode: v }))} placeholder="000000" />
                  </div>
                  {createForm.latitude && createForm.longitude && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      Location pinned ({createForm.latitude.toFixed(4)}, {createForm.longitude.toFixed(4)})
                    </div>
                  )}
                </div>
              </div>

              {/* ── Business Details (retailer / manufacturer only) ── */}
              {(createForm.role === "retailer" || createForm.role === "manufacturer") && (
                <div>
                  <SectionLabel>Business Details</SectionLabel>
                  <div className="space-y-3">
                    <Field
                      label={`${createForm.role === "retailer" ? "Shop Name" : "Business Name"} *`}
                      value={createForm.shopName}
                      onChange={v => setCreateForm(f => ({ ...f, shopName: v }))}
                      placeholder={createForm.role === "retailer" ? "e.g. Sharma Agro Store" : "e.g. KisanBio Inputs Ltd"}
                    />
                    <Field
                      label="GSTIN (optional)"
                      value={createForm.gstin}
                      onChange={v => setCreateForm(f => ({ ...f, gstin: v.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                      placeholder="e.g. 27AAPFU0939F1ZV"
                    />
                    {/* Secondary mobile */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface">Secondary Mobile (optional)</span>
                      <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                        <span className="text-sm font-bold text-on-surface-variant shrink-0">+91</span>
                        <input
                          type="tel"
                          value={createForm.secondaryPhone}
                          onChange={e => setCreateForm(f => ({ ...f, secondaryPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                          placeholder="Alternate number"
                          maxLength={10}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Subscription Setup ── */}
              {(createForm.role === "retailer" || createForm.role === "manufacturer") && (
                <div>
                  <SectionLabel>Subscription Setup</SectionLabel>
                  <div className="space-y-4">
                    {/* Status pills */}
                    <div className="flex gap-2">
                      {(["inactive", "active"] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCreateForm(f => ({ ...f, subscriptionStatus: s }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                            createForm.subscriptionStatus === s
                              ? s === "active"
                                ? "bg-green-600 text-white border-green-600 shadow-sm"
                                : "bg-surface-container-high text-on-surface border-outline-variant shadow-sm"
                              : "bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                          }`}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Active-only fields */}
                    {createForm.subscriptionStatus === "active" && (
                      <div className="space-y-3 rounded-xl border border-green-200 bg-green-50/40 p-3">
                        {/* Seats */}
                        <div className="flex flex-col gap-1.5 text-sm">
                          <span className="font-medium text-on-surface">Seats</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={seatsInput}
                            onChange={e => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setSeatsInput(raw);
                              setCreateForm(f => ({ ...f, seats: raw === "" ? 0 : parseInt(raw, 10) }));
                            }}
                            placeholder="e.g. 1, 5, 20, 100"
                            className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 w-36"
                          />
                        </div>

                        {/* Duration */}
                        <div className="flex flex-col gap-1.5 text-sm">
                          <span className="font-medium text-on-surface">Duration</span>
                          <div className="flex gap-2">
                            {([1, 3, 6, 12] as const).map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setCreateForm(f => ({ ...f, durationMonths: m }))}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                  createForm.durationMonths === m
                                    ? "bg-primary text-white border-primary shadow-sm"
                                    : "bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                                }`}
                              >
                                {m === 1 ? "1 Mo" : m === 12 ? "1 Yr" : `${m} Mo`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={creating}
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60 sm:w-auto w-full">
            Cancel
          </button>
          <button type="button" onClick={handleCreateUser} disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto w-full">
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><UserPlus className="h-4 w-4" /> {lockRole === "customer" ? "Create Customer" : "Create User"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">{children}</p>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-on-surface">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
    </label>
  );
}
