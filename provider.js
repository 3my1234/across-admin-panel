(() => {
  "use strict";
  const API = "https://api.atlxpres.com/api/v1";
  const PAGE_SIZE = 25;
  const PENDING_SUBSCRIPTION_KEY = "atlantic.provider.pending_subscription";
  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem("atlantic.provider.token") || "",
    account: null,
    provider: null, plans: [], listings: [], requests: [], documents: [], products: [], merchantOrders: [], manifests: [], notifications: [], unreadNotifications: 0,
    listingCursor: "", listingHasMore: false, requestCursor: "", requestHasMore: false,
    productCursor: "", productHasMore: false, merchantOrderCursor: "", merchantOrderHasMore: false, manifestCursor: "", manifestHasMore: false, editingProductID: "", notificationTimer: null
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = (value, currency = "NGN") => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(Number(value || 0)); }
    catch (_) { return ((currency || "") + " " + Number(value || 0).toLocaleString()).trim(); }
  };
  const human = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const debounce = (fn, wait = 300) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const setMessage = (text, ok = false, target = "portalMessage") => { const node = $(target); if (!node) return; node.textContent = text || ""; node.className = `message${ok ? " success" : ""}`; };
  function readPendingSubscription() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_SUBSCRIPTION_KEY) || "null");
      return value && typeof value === "object" ? value : null;
    } catch (_) { return null; }
  }
  function savePendingSubscription(value) { localStorage.setItem(PENDING_SUBSCRIPTION_KEY, JSON.stringify(value)); }
  function clearPendingSubscription() { localStorage.removeItem(PENDING_SUBSCRIPTION_KEY); }
  function hasPendingSubscription() { return Boolean(readPendingSubscription()) || state.provider?.subscription?.status === "pending"; }

  async function api(path, options = {}) {
    const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const raw = response.status === 204 ? "" : await response.text();
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (_) { data = null; } }
    if (!response.ok) {
      const safeText = raw && !raw.trim().startsWith("<") ? raw.trim().slice(0, 300) : "";
      const fallback = response.status === 402 ? "An active monthly provider subscription is required." : `Request failed (${response.status})`;
      const error = new Error(data?.message || data?.error?.message || data?.error || safeText || fallback);
      error.status = response.status;
      if (response.status === 401 && state.token) signOut();
      throw error;
    }
    return data;
  }

  async function login(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true; setMessage("Signing in…", false, "loginMessage");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      state.token = data.access_token; localStorage.setItem("atlantic.provider.token", state.token); setMessage("", false, "loginMessage"); await boot();
    } catch (error) { setMessage(error.message, false, "loginMessage"); } finally { button.disabled = false; }
  }

  async function signup(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true; setMessage("Creating your account…", false, "signupMessage");
    const payload = Object.fromEntries(new FormData(form));
    try {
      const data = await api("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
      setMessage(data.message || "Account created. Verify your email, then sign in here.", true, "signupMessage"); form.reset();
    } catch (error) {
      if (error.status === 409) {
        const conflict = String(error.message || "").toLowerCase();
        if (conflict.includes("phone")) {
          setMessage(
            "This phone number is already linked to another Atlantic Express account. Use that account, or enter a different phone number.",
            false,
            "signupMessage",
          );
        } else if (conflict.includes("email")) {
          switchAuth("login");
          document.querySelector("#loginForm [name=email]").value = String(payload.email || "");
          setMessage("An account already uses this email. Verify the email we sent, then sign in. If the message is missing, select Resend verification email.", false, "loginMessage");
        } else {
          setMessage(error.message || "That account information is already in use.", false, "signupMessage");
        }
      } else {
        setMessage(error.message, false, "signupMessage");
      }
    } finally { button.disabled = false; }
  }

  async function resendVerification() {
    const email = document.querySelector("#loginForm [name=email]").value.trim();
    if (!email) return setMessage("Enter your email first.", false, "loginMessage");
    try { const data = await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); setMessage(data.message || "Verification email queued.", true, "loginMessage"); }
    catch (error) { setMessage(error.message, false, "loginMessage"); }
  }

  function signOut() {
    state.token = ""; state.account = null; state.provider = null; state.listings = []; state.requests = []; state.documents = []; state.products = []; state.merchantOrders = [];
    localStorage.removeItem("atlantic.provider.token"); $("portal").classList.add("hidden"); $("authPanel").classList.remove("hidden"); $("signOut").classList.add("hidden");
    $("providerStatus").textContent = "Secure provider access";
  }

  async function boot() {
    if (!state.token) return signOut();
    $("authPanel").classList.add("hidden"); $("portal").classList.add("hidden"); $("signOut").classList.add("hidden");
    $("providerStatus").textContent = "Restoring provider session..."; setMessage("");
    try {
      const profileData = await api("/profile");
      state.account = profileData.profile || profileData.user || profileData;
      try { state.provider = await api("/providers/me"); $("onboardingCard").classList.add("hidden"); }
      catch (error) { if (error.status === 404) { state.provider = null; $("onboardingCard").classList.remove("hidden"); } else throw error; }
    } catch (error) {
      if (error.status === 401) return signOut();
      throw error;
    }
    $("portal").classList.remove("hidden"); $("signOut").classList.remove("hidden"); $("providerAlerts").classList.remove("hidden");
    $("providerStatus").textContent = `Signed in as ${state.account.email || "verified user"}. Provider access is separate from the Admin dashboard.`;
    await loadPlans();
    if (state.provider) await Promise.all([loadListings({ reset: true }), loadRequests({ reset: true }), loadVerificationDocuments(), loadProducts({ reset: true }), loadMerchantOrders({ reset: true }), loadManifests({ reset: true }), loadProviderNotifications()]);
    renderOverview();
    startProviderNotificationPolling();
    void handleSubscriptionReturn();
  }

  function notificationCopy(item) {
    const meta = item.metadata || {};
    const title = meta.listing_title || meta.title || human(item.event_type);
    const body = meta.notes || meta.message || ({ request_created: "A buyer sent a new booking or enquiry.", listing_approved: "Your service listing is now visible to buyers.", listing_rejected: "Your service listing needs changes.", provider_approved: "Your provider account was approved.", provider_rejected: "Your provider verification was rejected." }[item.event_type] || "Your provider account has new activity.");
    return { title, body };
  }
  function playProviderAlert() {
    try { const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return; const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = 880; gain.gain.value = .04; oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .12); oscillator.onended = () => audio.close(); } catch (_) {}
  }
  function renderProviderNotifications() {
    const count = $("providerAlertCount"); count.textContent = String(state.unreadNotifications); count.classList.toggle("hidden", state.unreadNotifications < 1);
    $("providerAlertRows").innerHTML = state.notifications.length ? state.notifications.map((item) => { const copy = notificationCopy(item); return `<article class="alert-item${item.read_at ? "" : " unread"}"><strong>${escapeHtml(copy.title)}</strong><p>${escapeHtml(copy.body)}</p><small>${new Date(item.created_at).toLocaleString()}</small></article>`; }).join("") : "<p>No new activity.</p>";
  }
  async function loadProviderNotifications({ silent = false } = {}) {
    if (!state.provider) return;
    try { const previous = state.unreadNotifications; const data = await api("/providers/me/notifications?limit=50"); state.notifications = data.items || []; state.unreadNotifications = Number(data.unread_count || 0); renderProviderNotifications(); if (silent && state.unreadNotifications > previous) playProviderAlert(); }
    catch (error) { if (!silent) setMessage(error.message); }
  }
  function startProviderNotificationPolling() {
    if (state.notificationTimer) clearInterval(state.notificationTimer);
    state.notificationTimer = setInterval(() => { if (!document.hidden && state.token && state.provider) void loadProviderNotifications({ silent: true }); }, 30000);
  }
  async function markProviderNotificationsRead() { await api("/providers/me/notifications/read-all", { method: "PATCH" }); await loadProviderNotifications(); }

  async function onboard(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form)); payload.country_code = String(payload.country_code || "").trim().toUpperCase();
      await api("/providers/onboarding", { method: "POST", body: JSON.stringify(payload) }); setMessage("Provider profile submitted for verification.", true); await boot();
    }
    catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }

  async function loadPlans() { const data = await api("/marketplace/subscription-plans"); state.plans = data.items || []; renderPlans(); }
  function hasActiveSubscription() {
    const subscription = state.provider?.subscription;
    const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
    return subscription?.status === "active" && Number.isFinite(periodEnd) && periodEnd > Date.now();
  }
  function openSubscription() { switchView("subscription"); document.querySelector('[data-view="subscription"]')?.focus(); }
  function clearSubscriptionReturn() {
    const url = new URL(location.href);
    ["subscription_return", "status", "tx_ref", "transaction_id"].forEach((key) => url.searchParams.delete(key));
    history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
  async function confirmPendingSubscription(overrides = {}) {
    const pending = { ...(readPendingSubscription() || {}), ...overrides };
    const payload = {
      tx_ref: String(pending.tx_ref || "").trim(),
      transaction_id: String(pending.transaction_id || "").trim(),
    };
    const result = await api("/providers/me/subscription-confirm", { method: "POST", body: JSON.stringify(payload) });
    state.provider = await api("/providers/me");
    renderOverview();
    const paymentState = hasActiveSubscription() ? "settled" : String(result?.payment_state || "pending");
    if (paymentState === "settled" || paymentState === "not_found") clearPendingSubscription();
    else savePendingSubscription({ ...pending, ...payload, updated_at: new Date().toISOString() });
    return paymentState;
  }
  async function handleSubscriptionReturn() {
    const params = new URLSearchParams(location.search);
    const isReturn = params.get("subscription_return") === "1";
    const stored = readPendingSubscription();
    const backendPending = state.provider?.subscription?.status === "pending";
    if ((!isReturn && !stored && !backendPending) || !state.provider || hasActiveSubscription()) {
      if (hasActiveSubscription()) clearPendingSubscription();
      return;
    }
    openSubscription();
    const checkoutStatus = String(params.get("status") || "").toLowerCase();
    if (["cancelled", "canceled", "failed"].includes(checkoutStatus)) {
      setMessage("Subscription checkout was not completed. No plan was activated; you can try again when ready.");
      clearPendingSubscription();
      clearSubscriptionReturn();
      return;
    }
    const returnData = {
      tx_ref: params.get("tx_ref") || stored?.tx_ref || "",
      transaction_id: params.get("transaction_id") || stored?.transaction_id || "",
    };
    savePendingSubscription({ ...(stored || {}), ...returnData, updated_at: new Date().toISOString() });
    setMessage("Confirming your subscription securely with Flutterwave...", true);
    try {
      for (let attempt = 0; attempt < 7 && !hasActiveSubscription(); attempt += 1) {
        if (attempt > 0) await delay(2000);
        if (await confirmPendingSubscription(returnData) === "settled") break;
      }
      if (hasActiveSubscription()) {
        setMessage("Subscription activated. Product and service drafts are now unlocked.", true);
      } else {
        setMessage("The paid checkout is still being verified. Do not pay again. Select Check payment status shortly to reconcile this same payment.");
      }
    } catch (error) {
      setMessage(`We could not verify the subscription yet: ${error.message}. Do not pay again; select Check payment status shortly.`);
    } finally {
      if (isReturn) clearSubscriptionReturn();
    }
  }
  async function refreshSubscriptionStatus() {
    try {
      if (!hasActiveSubscription() && state.provider?.verification_status === "approved") {
        setMessage("Checking your existing payment with Flutterwave...", true);
        const paymentState = await confirmPendingSubscription();
        if (paymentState === "settled") {
          setMessage("Subscription activated. Product and service drafts are now unlocked.", true);
          return;
        }
        if (paymentState === "not_found") {
          setMessage("No pending subscription payment was found. Select Subscribe securely when you are ready.");
          return;
        }
        setMessage("Payment is still awaiting confirmation. Do not pay again; check again shortly.");
        return;
      }
      state.provider = await api("/providers/me");
      renderOverview();
      setMessage(hasActiveSubscription() ? "Subscription is active." : "Subscription status refreshed.", hasActiveSubscription());
    } catch (error) {
      setMessage(`We could not verify the subscription yet: ${error.message}. Do not pay again; check again shortly.`);
    }
  }
  function requireSubscription(kind = "products") {
    if (hasActiveSubscription()) return true;
    setMessage(`Choose and activate a monthly plan before creating ${kind}.`);
    openSubscription();
    return false;
  }
  async function subscribe(planId) {
    if (state.provider?.verification_status !== "approved") return setMessage("Your business must be approved before subscription checkout.");
    document.querySelectorAll("[data-subscribe]").forEach((button) => { button.disabled = true; });
    const pending = hasPendingSubscription();
    setMessage(pending ? "Checking your existing payment with Flutterwave..." : "Opening secure Flutterwave checkout...", true);
    try {
      if (pending) {
        const paymentState = await confirmPendingSubscription();
        if (paymentState === "settled") setMessage("Subscription activated. Product and service drafts are now unlocked.", true);
        else if (paymentState === "not_found") setMessage("No pending payment was found. Select Subscribe securely again to begin a new checkout.");
        else setMessage("This payment is still awaiting confirmation. Do not pay again; check its status shortly.");
        return;
      }
      const returnURL = new URL(location.href);
      returnURL.searchParams.set("subscription_return", "1");
      const data = await api("/providers/me/subscription-checkout", { method: "POST", body: JSON.stringify({ plan_id: planId, redirect_url: returnURL.toString() }) });
      if (!data.checkout_link || !data.tx_ref) throw new Error("Checkout link unavailable");
      savePendingSubscription({ tx_ref: data.tx_ref, transaction_id: "", plan_id: planId, created_at: new Date().toISOString() });
      location.href = data.checkout_link;
    }
    catch (error) { setMessage(error.message); renderPlans(); }
    finally { document.querySelectorAll("[data-subscribe]").forEach((button) => { button.disabled = false; }); }
  }
  function renderPlans() {
    const active = hasActiveSubscription();
    const approved = state.provider?.verification_status === "approved";
    const pending = !active && hasPendingSubscription();
    if (active) clearPendingSubscription();
    $("subscriptionGuidance").innerHTML = active ? `<strong>Subscription active.</strong> You can create private drafts and submit them for review.${state.provider.subscription.current_period_end ? ` Current period ends ${new Date(state.provider.subscription.current_period_end).toLocaleDateString()}.` : ""}` : pending ? "<strong>Payment confirmation pending.</strong> Do not pay again. Use Check payment status while Atlantic Express securely reconciles this payment with Flutterwave." : approved ? "<strong>Subscription required.</strong> Choose a monthly plan below. Product and service creation unlocks after Flutterwave confirms payment." : "Your business must be approved before you can purchase a provider plan.";
    $("plans").innerHTML = state.plans.length ? state.plans.map((plan) => `<article class="plan"><span class="eyebrow">Monthly plan</span><h3>${escapeHtml(plan.name)}</h3><strong>${money(plan.amount_ngn)}/month</strong><p>${escapeHtml(plan.description || `${plan.listing_limit} active listings`)}</p><button data-subscribe="${plan.id}" ${!state.provider || active || !approved ? "disabled" : ""}>${active ? "Current plan active" : pending ? "Check payment status" : "Subscribe securely"}</button></article>`).join("") : '<p class="notice"><strong>No active plan is available.</strong> Atlantic Express must configure a monthly provider plan before checkout can begin.</p>';
    document.querySelectorAll("[data-subscribe]").forEach((button) => button.onclick = () => subscribe(button.dataset.subscribe));
    renderSubscriptionGates();
  }
  function renderSubscriptionGates() {
    const active = hasActiveSubscription();
    [["productSubscriptionGate", "products"], ["listingSubscriptionGate", "services"]].forEach(([id, label]) => {
      const node = $(id); if (!node) return;
      node.classList.toggle("hidden", active);
      node.innerHTML = active ? "" : `<div><strong>Monthly subscription required</strong><p>Activate a plan before creating ${label}. No image will be uploaded until access is active.</p></div><button type="button" data-open-subscription>View plans & subscribe</button>`;
    });
    document.querySelectorAll("[data-open-subscription]").forEach((button) => button.onclick = openSubscription);
  }

  async function uploadImages(files, progressTarget = "uploadProgress") {
    if (files.length > 20) throw new Error("A listing can have at most 20 images.");
    const urls = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]; setMessage(`Uploading image ${index + 1} of ${files.length}...`, false, progressTarget);
      const signed = await api("/providers/me/uploads/presign", { method: "POST", body: JSON.stringify({ filename: file.name, mime_type: file.type, purpose: "listing" }) });
      const put = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Image upload failed (${put.status})`); urls.push(signed.view_url);
    }
    return urls;
  }

  async function loadVerificationDocuments() {
    const data = await api("/providers/me/verification-documents");
    state.documents = data.items || [];
    renderVerificationDocuments();
  }
  function renderVerificationDocuments() {
    $("verificationDocuments").classList.toggle("hidden", !state.provider);
    $("verificationRows").innerHTML = state.documents.length ? state.documents.map((item) => `<article class="list-row"><div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(human(item.document_type))}</h3><p>${new Date(item.created_at).toLocaleString()}${item.review_notes ? ` - ${escapeHtml(item.review_notes)}` : ""}</p></div><a class="secondary" href="${escapeHtml(item.document_url)}" target="_blank" rel="noopener">Open document</a></article>`).join("") : "<p>No verification documents uploaded yet.</p>";
  }
  async function uploadVerificationDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const file = $("verificationFile").files[0];
    if (!file) return setMessage("Choose a document first.", false, "verificationMessage");
    const documentType = new FormData(form).get("document_type");
    button.disabled = true;
    try {
      setMessage("Uploading document...", false, "verificationMessage");
      const signed = await api("/providers/me/uploads/presign", { method: "POST", body: JSON.stringify({ filename: file.name, mime_type: file.type, purpose: "verification" }) });
      const put = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Document upload failed (${put.status})`);
      await api("/providers/me/verification-documents", { method: "POST", body: JSON.stringify({ document_type: documentType, document_url: signed.view_url }) });
      form.reset(); setMessage("Document submitted for review.", true, "verificationMessage"); await loadVerificationDocuments();
    } catch (error) { setMessage(error.message, false, "verificationMessage"); } finally { button.disabled = false; }
  }

  function setListingFormOpen(open, { reset = false } = {}) {
    const form = $("listingForm"); const toggle = $("toggleListingForm");
    if (reset) { form.reset(); setListingLocationStatus("No location captured yet."); }
    form.classList.toggle("hidden", !open); toggle.textContent = open ? "Close form" : "Create service"; toggle.setAttribute("aria-expanded", String(open));
    if (open) requestAnimationFrame(() => form.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function setSelectOptions(select, options, preferred) {
    select.replaceChildren(...options.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));
    if (options.some(([value]) => value === preferred)) select.value = preferred;
  }

  function syncProductFulfillment(preferredState = "") {
    const mode = $("productFulfillmentMode").value; const stock = $("productStockState"); const country = $("productCountryCode");
    if (mode === "merchant_local") {
      setSelectOptions(stock, [["locally_available", "Available now in Nigeria"]], "locally_available"); country.value = "NG"; country.readOnly = true;
      $("productStockHelp").textContent = "Local products must already be available in Nigeria.";
    } else {
      setSelectOptions(stock, [["foreign_stock", "In stock outside Nigeria"], ["import_on_demand", "Import on demand"]], preferredState || stock.value);
      country.readOnly = false; if (country.value.toUpperCase() === "NG") country.value = "";
      $("productStockHelp").textContent = "Enter the two-letter country where the stock is currently held.";
    }
  }

  function setProductFormOpen(open, { reset = false } = {}) {
    const form = $("productForm"); const toggle = $("toggleProductForm");
    if (reset) { form.reset(); state.editingProductID = ""; syncProductFulfillment(); }
    form.classList.toggle("hidden", !open); toggle.textContent = open ? "Close form" : "Create product"; toggle.setAttribute("aria-expanded", String(open));
    if (open) requestAnimationFrame(() => form.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function validatedProductValues(form) {
    if (!form.reportValidity()) throw new Error("Complete the highlighted product fields.");
    const values = Object.fromEntries(new FormData(form)); const price = Number(values.local_selling_price); const compared = values.compare_at_price === "" ? null : Number(values.compare_at_price); const flash = values.flash_sale_price === "" ? null : Number(values.flash_sale_price);
    if (compared !== null && compared <= price) throw new Error("Crossed-out price must be higher than the selling price.");
    if (form.elements.is_flash_sale.checked && (flash === null || flash <= 0 || flash >= price)) throw new Error("Flash price must be greater than zero and lower than the selling price.");
    if (Number(values.delivery_max_days) < Number(values.delivery_min_days)) throw new Error("Maximum delivery days cannot be less than minimum delivery days.");
    values.inventory_country_code = String(values.inventory_country_code).trim().toUpperCase();
    if (values.fulfillment_mode === "merchant_local") {
      values.inventory_country_code = "NG"; values.stock_state = "locally_available";
      if (values.inventory_latitude === "" || values.inventory_longitude === "") throw new Error("Use current stock location so nearby buyers can discover this product.");
    }
    else if (values.inventory_country_code === "NG") throw new Error("Imported products must state the foreign country where stock is held.");
    return values;
  }

  async function saveListing(event) {
    event.preventDefault(); if (!requireSubscription("services")) return; const form = event.currentTarget; if (!form.reportValidity()) return; const files = [...$("listingImages").files];
    if (!files.length) return setMessage("Add at least one clear listing image."); if (files.length > 20) return setMessage("Upload no more than 20 listing images.");
    const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      values.country_code = String(values.country_code || "").trim().toUpperCase();
      values.currency_code = String(values.currency_code || "").trim().toUpperCase();
      const latitude = Number(values.latitude); const longitude = Number(values.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Enter valid latitude and longitude for this service.");
      const media_urls = await uploadImages(files);
      const payload = { ...values, price: values.price === "" ? null : Number(values.price), capacity: Number(values.capacity || 1), latitude, longitude, service_radius_km: values.service_radius_km === "" ? null : Number(values.service_radius_km), is_mobile_service: form.elements.is_mobile_service.checked, is_available_now: form.elements.is_available_now.checked, media_urls, attributes: {} };
      await api("/providers/me/listings", { method: "POST", body: JSON.stringify(payload) });
      setListingFormOpen(false, { reset: true }); setMessage("Service draft saved privately. Use Submit for review when it is complete.", true); setMessage("", false, "uploadProgress"); await loadListings({ reset: true });
    } catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }

  async function saveProduct(event) {
    event.preventDefault(); if (!requireSubscription("products")) return; const form = event.currentTarget; let values;
    try { values = validatedProductValues(form); } catch (error) { return setMessage(error.message); }
    const files = [...$("productImages").files]; if (files.length > 20) return setMessage("Upload no more than 20 product images."); const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const existing = state.products.find(item => item.id === state.editingProductID);
      if (!files.length && !existing?.image_urls?.length) throw new Error("Add at least one clear product image.");
      const image_urls = files.length ? await uploadImages(files, "productUploadProgress") : existing.image_urls;
      const payload = { title: values.title, sku: values.sku, description: values.description, category_path: [values.category], image_urls, local_selling_price: Number(values.local_selling_price), compare_at_price: values.compare_at_price ? Number(values.compare_at_price) : null, inventory_count: Number(values.inventory_count), is_flash_sale: form.elements.is_flash_sale.checked, flash_sale_price: values.flash_sale_price ? Number(values.flash_sale_price) : null, fulfillment_mode: values.fulfillment_mode, inventory_country_code: values.inventory_country_code, inventory_city: values.inventory_city, inventory_location: values.inventory_location, inventory_latitude: values.inventory_latitude === "" ? null : Number(values.inventory_latitude), inventory_longitude: values.inventory_longitude === "" ? null : Number(values.inventory_longitude), stock_state: values.stock_state, handling_time_hours: Number(values.handling_time_hours), delivery_min_days: Number(values.delivery_min_days), delivery_max_days: Number(values.delivery_max_days), delivery_methods: String(values.delivery_methods).split(",").map(value => value.trim()).filter(Boolean), return_policy: values.return_policy, atlantic_last_mile: form.elements.atlantic_last_mile.checked };
      const path = state.editingProductID ? `/providers/me/products/${state.editingProductID}` : "/providers/me/products";
      await api(path, { method: state.editingProductID ? "PATCH" : "POST", body: JSON.stringify(payload) }); setProductFormOpen(false, { reset: true }); setMessage("Product draft saved privately. Use Submit for review when it is complete.", true); setMessage("", false, "productUploadProgress"); await loadProducts({ reset: true });
    } catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }
  async function loadProducts({ reset = false } = {}) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const search = $("productSearch").value.trim(), status = $("productStatus").value; if (search) params.set("search", search); if (status) params.set("status", status); if (!reset && state.productCursor) params.set("cursor", state.productCursor);
    const data = await api(`/providers/me/products?${params}`); state.products = reset ? (data.items || []) : [...state.products, ...(data.items || [])]; state.productCursor = data.page?.next_cursor || ""; state.productHasMore = Boolean(data.page?.has_more); renderProducts(); renderOverview();
  }
  function renderProducts() {
    $("productRows").innerHTML = state.products.length ? state.products.map((item) => `<article class="list-row listing-row">${item.image_urls?.[0] ? `<img class="listing-thumb" src="${escapeHtml(item.image_urls[0])}" alt="">` : ""}<div><span class="badge">${escapeHtml(human(item.moderation_status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.sku)} · ${money(item.local_selling_price)} · ${item.inventory_count} in stock</p><p>${escapeHtml(human(item.fulfillment_mode))} · ${escapeHtml([item.inventory_city, item.inventory_country_code].filter(Boolean).join(", "))} · ${item.delivery_min_days}-${item.delivery_max_days} days</p>${item.moderation_notes ? `<p>${escapeHtml(item.moderation_notes)}</p>` : ""}</div><div class="list-actions"><button class="secondary" data-edit-product="${item.id}">Edit</button>${["draft","rejected"].includes(item.moderation_status) ? `<button data-submit-product="${item.id}">Submit for review</button>` : ""}<button class="secondary" data-archive-product="${item.id}">Archive</button></div></article>`).join("") : "<p>No matching products.</p>";
    $("loadMoreProducts").classList.toggle("hidden", !state.productHasMore);
    document.querySelectorAll("[data-submit-product]").forEach((button) => button.onclick = async () => { button.disabled = true; try { await api(`/providers/me/products/${button.dataset.submitProduct}/submit`, { method: "POST" }); setMessage("Product submitted for moderation.", true); await loadProducts({ reset: true }); } catch (error) { setMessage(error.message); } finally { button.disabled = false; } });
    document.querySelectorAll("[data-edit-product]").forEach((button) => button.onclick = () => editProduct(button.dataset.editProduct));
    document.querySelectorAll("[data-archive-product]").forEach((button) => button.onclick = async () => { if (!confirm("Archive this product?")) return; button.disabled = true; try { await api(`/providers/me/products/${button.dataset.archiveProduct}`, { method: "DELETE" }); await loadProducts({ reset: true }); } catch (error) { setMessage(error.message); } finally { button.disabled = false; } });
  }
  function editProduct(id) {
    const item = state.products.find(product => product.id === id);
    if (!item) return;
    const form = $("productForm");
    state.editingProductID = id;
    form.elements.fulfillment_mode.value = item.fulfillment_mode || "merchant_local";
    syncProductFulfillment(item.stock_state);
    ["title", "sku", "description", "local_selling_price", "compare_at_price", "inventory_count", "flash_sale_price", "inventory_country_code", "inventory_city", "inventory_location", "inventory_latitude", "inventory_longitude", "handling_time_hours", "delivery_min_days", "delivery_max_days", "return_policy"].forEach((name) => {
      form.elements[name].value = item[name] ?? "";
    });
    form.elements.stock_state.value = item.stock_state || (item.fulfillment_mode === "merchant_cross_border" ? "foreign_stock" : "locally_available");
    form.elements.category.value = item.category_path?.[0] || "";
    form.elements.delivery_methods.value = (item.delivery_methods || []).join(",");
    form.elements.is_flash_sale.checked = Boolean(item.is_flash_sale);
    form.elements.atlantic_last_mile.checked = Boolean(item.atlantic_last_mile);
    setProductFormOpen(true);
  }
  async function loadMerchantOrders({ reset = false } = {}) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); if (!reset && state.merchantOrderCursor) params.set("cursor", state.merchantOrderCursor); const data = await api(`/providers/me/merchant-orders?${params}`); state.merchantOrders = reset ? (data.items || []) : [...state.merchantOrders, ...(data.items || [])]; state.merchantOrderCursor = data.page?.next_cursor || ""; state.merchantOrderHasMore = Boolean(data.page?.has_more); renderMerchantOrders();
  }
  function renderMerchantOrders() {
    const transitions = {
      merchant_local: { pending:["accepted"], accepted:["packed"], packed:["ready_for_pickup","out_for_delivery","handed_to_atlantic"], ready_for_pickup:["delivered"], out_for_delivery:["delivered"] },
      merchant_cross_border: { pending:["accepted"], accepted:["processing"], processing:["dispatched_from_origin"], dispatched_from_origin:["international_transit"], international_transit:["customs_clearance","local_hub"], customs_clearance:["local_hub"], local_hub:["ready_for_pickup","out_for_delivery","handed_to_atlantic"], ready_for_pickup:["delivered"], out_for_delivery:["delivered"] }
    };
    $("merchantOrderRows").innerHTML = state.merchantOrders.length ? state.merchantOrders.map((order) => { const f=order.fulfillment||{}, targets=transitions[f.route]?.[f.status]||[]; return `<article class="list-row"><label>${f.route === "merchant_cross_border" && ["pending","accepted","processing"].includes(f.status) ? `<input type="checkbox" data-manifest-order="${order.id}" /> Add to manifest` : ""}</label><div><span class="badge">${escapeHtml(human(f.status || order.status))}</span><h3>${escapeHtml(order.package_label || order.id)}</h3><p>${escapeHtml(human(f.route))} · ${new Date(order.created_at).toLocaleString()} · ${money(order.total_amount)}</p>${(order.items || []).map((item) => `<p><strong>${escapeHtml(item.title)}</strong> · ${item.quantity} × ${money(item.unit_price)}</p>`).join("")}<p><strong>Buyer:</strong> ${escapeHtml(order.fulfillment_contact?.full_name || "")} · ${escapeHtml(order.fulfillment_contact?.phone || "")} · ${escapeHtml([order.fulfillment_contact?.address, order.fulfillment_contact?.city, order.fulfillment_contact?.state].filter(Boolean).join(", "))}</p></div><div class="list-actions">${targets.map(target => `<button data-fulfil-order="${order.id}" data-next="${target}" data-version="${f.version}">${escapeHtml(human(target))}</button>`).join("")}</div></article>`; }).join("") : "<p>No paid merchant orders yet.</p>"; $("loadMoreMerchantOrders").classList.toggle("hidden", !state.merchantOrderHasMore);
    document.querySelectorAll("[data-fulfil-order]").forEach(button => button.onclick = () => transitionOrder(button));
  }

  async function transitionOrder(button) { const notes=prompt(`Operational note for ${human(button.dataset.next)}`, "") ?? ""; const location=prompt("Current location (optional)", "") ?? ""; button.disabled=true; try { await api(`/providers/me/merchant-orders/${button.dataset.fulfilOrder}/fulfillment`, { method:"PATCH", body:JSON.stringify({ status:button.dataset.next, expected_version:Number(button.dataset.version), idempotency_key:crypto.randomUUID(), notes, location }) }); await loadMerchantOrders({reset:true}); } catch(error) { setMessage(error.message); } finally { button.disabled=false; } }

  async function loadManifests({reset=false}={}) { const params=new URLSearchParams({limit:String(PAGE_SIZE)}); if(!reset&&state.manifestCursor) params.set("cursor",state.manifestCursor); const data=await api(`/providers/me/manifests?${params}`); state.manifests=reset?(data.items||[]):[...state.manifests,...(data.items||[])]; state.manifestCursor=data.next_cursor||""; state.manifestHasMore=Boolean(data.has_more); renderManifests(); }
  function renderManifests(){ const next={open:"closed",closed:"dispatched",dispatched:"completed"}; $("manifestRows").innerHTML=state.manifests.length?state.manifests.map(item=>`<article class="list-row"><div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.manifest_code)}</h3><p>${item.order_count} orders · ${escapeHtml(item.origin_city)}, ${escapeHtml(item.origin_country_code)} · cutoff ${new Date(item.cutoff_at).toLocaleString()}</p></div><div class="list-actions"><button class="secondary" data-print-manifest="${item.id}">View / print</button>${next[item.status]?`<button data-manifest-transition="${item.id}" data-next="${next[item.status]}" data-version="${item.version}">${escapeHtml(human(next[item.status]))}</button>`:""}</div></article>`).join(""):"<p>No merchant manifests yet.</p>"; $("loadMoreManifests").classList.toggle("hidden",!state.manifestHasMore); document.querySelectorAll("[data-print-manifest]").forEach(button=>button.onclick=()=>printManifest(button.dataset.printManifest)); document.querySelectorAll("[data-manifest-transition]").forEach(button=>button.onclick=()=>transitionManifest(button)); }
  async function createManifest(){ const order_ids=[...document.querySelectorAll("[data-manifest-order]:checked")].map(input=>input.dataset.manifestOrder); if(!order_ids.length) return setMessage("Select at least one imported order."); const origin_country_code=(prompt("Origin country code","CN")||"").trim().toUpperCase(); const origin_city=(prompt("Origin city","")||"").trim(); if(!origin_country_code||!origin_city)return; try{await api("/providers/me/manifests",{method:"POST",body:JSON.stringify({order_ids,origin_country_code,origin_city,cutoff_at:new Date().toISOString()})}); await Promise.all([loadManifests({reset:true}),loadMerchantOrders({reset:true})]);}catch(error){setMessage(error.message);} }
  async function transitionManifest(button){button.disabled=true;try{await api(`/providers/me/manifests/${button.dataset.manifestTransition}`,{method:"PATCH",body:JSON.stringify({status:button.dataset.next,expected_version:Number(button.dataset.version),idempotency_key:crypto.randomUUID(),notes:""})});await loadManifests({reset:true});}catch(error){setMessage(error.message);}finally{button.disabled=false;}}
  async function printManifest(id){try{const data=await api(`/providers/me/manifests/${id}`);const popup=open("","_blank");if(!popup)throw new Error("Allow pop-ups to print manifests.");popup.document.write(`<title>${escapeHtml(data.manifest.manifest_code)}</title><style>body{font:14px Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}img{width:72px}</style><h1>${escapeHtml(data.manifest.manifest_code)}</h1><p>${escapeHtml(data.manifest.origin_city)}, ${escapeHtml(data.manifest.origin_country_code)} · ${escapeHtml(human(data.manifest.status))}</p><table><tr><th>Package</th><th>Product</th><th>Qty</th><th>Buyer</th><th>Contact</th></tr>${(data.items||[]).map(row=>`<tr><td>${escapeHtml(row.package_code)}</td><td>${escapeHtml(row.product?.title||row.product?.sku||row.item_id)}</td><td>${row.quantity}</td><td>${escapeHtml(row.buyer?.full_name)}</td><td>${escapeHtml(row.buyer?.phone)}<br>${escapeHtml(row.buyer?.email)}</td></tr>`).join("")}</table>`);popup.document.close();popup.focus();}catch(error){setMessage(error.message);}}

  function useCurrentProductLocation() {
    if (!navigator.geolocation) return setMessage("Location is unavailable in this browser.");
    const button = $("useProductLocation"); button.disabled = true; navigator.geolocation.getCurrentPosition(({ coords }) => { const form = $("productForm"); form.elements.inventory_latitude.value = coords.latitude.toFixed(6); form.elements.inventory_longitude.value = coords.longitude.toFixed(6); setMessage("Current stock location added.", true); button.disabled = false; }, (error) => { setMessage(error.message || "Could not read current location."); button.disabled = false; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function setListingLocationStatus(text, stateName = "") {
    const node = $("listingLocationStatus"); node.textContent = text;
    node.className = "location-status" + (stateName ? " " + stateName : "");
  }
  function requestBrowserPosition(options) { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options)); }
  function explainLocationError(error) {
    if (error?.code === 1) return "Location is blocked for this site. Use the padlock/site-settings icon beside the address, allow Location for admin.atlxpres.com, then retry—or enter coordinates manually.";
    if (error?.code === 2) return "This device could not determine its location. Check the operating-system location service or enter the service coordinates manually.";
    if (error?.code === 3) return "Location timed out. Move near a window, retry, or enter the service coordinates manually.";
    return "Could not read this device's location. Enter the service coordinates manually.";
  }
  async function useCurrentLocation() {
    if (!window.isSecureContext) return setListingLocationStatus("Device location requires a secure HTTPS page.", "error");
    if (!navigator.geolocation) return setListingLocationStatus("Location is unavailable in this browser. Enter coordinates manually.", "error");
    const button = $("useCurrentLocation"); button.disabled = true; setListingLocationStatus("Requesting this device's location…");
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state === "denied") throw Object.assign(new Error("Permission denied"), { code: 1 });
      }
      let position;
      try { position = await requestBrowserPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }); }
      catch (error) {
        if (error?.code === 1) throw error;
        position = await requestBrowserPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      }
      const { latitude, longitude, accuracy } = position.coords; const form = $("listingForm");
      form.elements.latitude.value = latitude.toFixed(6); form.elements.longitude.value = longitude.toFixed(6);
      setListingLocationStatus("Location captured: " + latitude.toFixed(6) + ", " + longitude.toFixed(6) + " (accuracy about " + Math.round(accuracy) + " m).", "ready");
      setMessage("Device location added to this service draft.", true);
    } catch (error) {
      const message = explainLocationError(error); setListingLocationStatus(message, "error"); setMessage(message);
    } finally { button.disabled = false; }
  }

  function updateManualListingLocation() {
    const form = $("listingForm"); const latitude = Number(form.elements.latitude.value); const longitude = Number(form.elements.longitude.value);
    if (!form.elements.latitude.value || !form.elements.longitude.value) return setListingLocationStatus("No complete location captured yet.");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setListingLocationStatus("Latitude must be -90 to 90 and longitude must be -180 to 180.", "error");
    setListingLocationStatus("Service location set to " + latitude.toFixed(6) + ", " + longitude.toFixed(6) + ".", "ready");
  }

  async function loadListings({ reset = false } = {}) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const search = $("listingSearch").value.trim(), status = $("listingStatus").value;
    if (search) params.set("search", search); if (status) params.set("status", status); if (!reset && state.listingCursor) params.set("cursor", state.listingCursor);
    const data = await api(`/providers/me/listings?${params}`); state.listings = reset ? (data.items || []) : [...state.listings, ...(data.items || [])]; state.listingCursor = data.next_cursor || ""; state.listingHasMore = Boolean(data.has_more); renderListings(); renderOverview();
  }
  function renderListings() {
    $("listingRows").innerHTML = state.listings.length ? state.listings.map((item) => {
      const image = item.media_urls?.[0]; const canSubmit = ["draft", "rejected"].includes(item.status); const direct = ["hotel", "short_let", "car_rental", "car_wash", "mechanic", "plumber", "carpenter", "fuel_station", "food_vendor", "artisan"].includes(item.listing_type);
      return `<article class="list-row listing-row">${image ? `<img class="listing-thumb" src="${escapeHtml(image)}" alt="">` : ""}<div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(human(item.listing_type))} · ${escapeHtml(item.city)}, ${escapeHtml(item.state)} · ${item.price == null ? "Enquiry" : money(item.price)}</p>${item.moderation_notes ? `<p class="moderation-note">Moderator note: ${escapeHtml(item.moderation_notes)}</p>` : ""}</div><div class="list-actions">${canSubmit ? `<button data-submit-listing="${item.id}">Submit for review</button>` : ""}${direct ? `<button class="secondary" data-availability="${item.id}" data-title="${escapeHtml(item.title)}">Add availability</button>` : ""}</div></article>`;
    }).join("") : "<p>No matching listings.</p>";
    $("loadMoreListings").classList.toggle("hidden", !state.listingHasMore);
    document.querySelectorAll("[data-submit-listing]").forEach((button) => button.onclick = async () => { button.disabled = true; try { await api(`/providers/me/listings/${button.dataset.submitListing}/submit`, { method: "POST" }); setMessage("Listing submitted for moderation.", true); await loadListings({ reset: true }); } catch (error) { setMessage(error.message); } finally { button.disabled = false; } });
    document.querySelectorAll("[data-availability]").forEach((button) => button.onclick = () => openAvailability(button.dataset.availability, button.dataset.title));
  }

  function openAvailability(id, title) { const form = $("availabilityForm"); form.reset(); form.elements.listing_id.value = id; $("availabilityTitle").textContent = `Availability · ${title}`; setMessage("", false, "availabilityMessage"); $("availabilityDialog").showModal(); }
  async function saveAvailability(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try { await api(`/providers/me/listings/${values.listing_id}/availability`, { method: "POST", body: JSON.stringify({ starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(), capacity: Number(values.capacity), status: "open" }) }); setMessage("Availability saved.", true, "availabilityMessage"); setTimeout(() => $("availabilityDialog").close(), 500); }
    catch (error) { setMessage(error.message, false, "availabilityMessage"); } finally { button.disabled = false; }
  }

  async function loadRequests({ reset = false } = {}) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const status = $("requestStatus").value, search = $("requestSearch").value.trim(); if (status) params.set("status", status); if (search) params.set("search", search); if (!reset && state.requestCursor) params.set("cursor", state.requestCursor);
    const data = await api(`/providers/me/requests?${params}`); state.requests = reset ? (data.items || []) : [...state.requests, ...(data.items || [])]; state.requestCursor = data.next_cursor || ""; state.requestHasMore = Boolean(data.has_more); renderRequests(); renderOverview();
  }
  async function updateRequest(id, status) { try { await api(`/providers/me/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setMessage(`Request marked ${status}.`, true); await loadRequests({ reset: true }); } catch (error) { setMessage(error.message); } }
  function renderRequests() {
    const items = state.requests;
    $("requestRows").innerHTML = items.length ? items.map((item) => `<article class="list-row"><div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.listing_title)}</h3><p>${escapeHtml(human(item.request_type))} · party of ${item.party_size} · ${item.starts_at ? new Date(item.starts_at).toLocaleString() : "Schedule by contact"}</p><p>${escapeHtml(item.message || "No message")}</p>${item.buyer ? `<p><strong>${escapeHtml(item.buyer.full_name)}</strong> · <a href="mailto:${escapeHtml(item.buyer.email)}">${escapeHtml(item.buyer.email)}</a>${item.buyer.phone ? ` · <a href="tel:${escapeHtml(item.buyer.phone)}">${escapeHtml(item.buyer.phone)}</a>` : ""}</p>` : ""}</div><div class="list-actions">${item.status === "pending" ? `<button data-request="${item.id}" data-status="accepted">Accept</button><button class="secondary" data-request="${item.id}" data-status="rejected">Reject</button>` : item.status === "accepted" ? `<button data-request="${item.id}" data-status="completed">Complete</button>` : ""}</div></article>`).join("") : "<p>No matching bookings or enquiries.</p>";
    $("loadMoreRequests").classList.toggle("hidden", !state.requestHasMore); document.querySelectorAll("[data-request]").forEach((button) => button.onclick = () => updateRequest(button.dataset.request, button.dataset.status));
  }

  function renderOverview() {
    const p = state.provider, verification = p?.verification_status || "Not submitted", subscription = p?.subscription?.status || "None";
    const subscriptionActive = hasActiveSubscription();
    const subscriptionLabel = subscriptionActive ? "Active" : subscription === "active" ? "Expired" : subscription;
    $("businessName").textContent = p?.business_name || "Provider setup"; $("verificationState").textContent = human(verification); $("metricVerification").textContent = human(verification); $("metricSubscription").textContent = human(subscriptionLabel); $("metricListings").textContent = state.listings.length + state.products.length; $("metricRequests").textContent = state.requests.filter((item) => ["pending", "accepted"].includes(item.status)).length; $("providerStatus").textContent = p ? `${p.business_name} - ${human(verification)}` : "Complete provider onboarding";
    $("accountGuidance").innerHTML = !p ? "Create your provider profile to begin." : verification !== "approved" ? `<strong>Verification ${escapeHtml(verification)}.</strong> Listings remain private until an administrator approves your business and each listing.${p.verification_notes ? `<br>${escapeHtml(p.verification_notes)}` : ""}` : !subscriptionActive ? "<strong>Business verified.</strong> Choose an active monthly plan so approved listings and contact details can appear to buyers." : `<strong>Ready for buyers.</strong> Your verification and subscription are active${p.subscription.current_period_end ? ` until ${new Date(p.subscription.current_period_end).toLocaleDateString()}` : ""}.`;
    renderPlans();
  }
  function switchView(view) { document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view)); document.querySelectorAll("[data-view-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.viewPanel !== view)); }
  function switchAuth(view) { document.querySelectorAll("[data-auth-view]").forEach((b) => b.classList.toggle("active", b.dataset.authView === view)); document.querySelectorAll("[data-auth-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.authPanel !== view)); }

  $("loginForm").addEventListener("submit", login); $("signupForm").addEventListener("submit", signup); $("resendVerification").addEventListener("click", resendVerification); $("signOut").addEventListener("click", signOut); $("onboardingForm").addEventListener("submit", onboard); $("verificationForm").addEventListener("submit", uploadVerificationDocument); $("listingForm").addEventListener("submit", saveListing); $("productForm").addEventListener("submit", saveProduct); $("availabilityForm").addEventListener("submit", saveAvailability); $("closeAvailability").addEventListener("click", () => $("availabilityDialog").close()); $("refreshSubscription").addEventListener("click", refreshSubscriptionStatus);
  $("toggleListingForm").addEventListener("click", () => {
    if (!requireSubscription("services")) return;
    setListingFormOpen($("listingForm").classList.contains("hidden"));
  });
  $("cancelListingForm").addEventListener("click", () => setListingFormOpen(false, { reset: true }));
  $("listingSearch").addEventListener("input", debounce(() => loadListings({ reset: true })));
  $("listingStatus").addEventListener("change", () => loadListings({ reset: true }));
  $("loadMoreListings").addEventListener("click", () => loadListings());
  $("requestSearch").addEventListener("input", debounce(() => loadRequests({ reset: true }))); $("requestStatus").addEventListener("change", () => loadRequests({ reset: true })); $("loadMoreRequests").addEventListener("click", () => loadRequests()); $("refreshPortal").addEventListener("click", boot); $("refreshRequests").addEventListener("click", () => loadRequests({ reset: true }));
  $("toggleProductForm").addEventListener("click", () => {
    if (!requireSubscription("products")) return;
    setProductFormOpen($("productForm").classList.contains("hidden"));
  });
  $("cancelProductForm").addEventListener("click", () => setProductFormOpen(false, { reset: true }));
  $("productFulfillmentMode").addEventListener("change", () => syncProductFulfillment());
  $("productSearch").addEventListener("input", debounce(() => loadProducts({ reset: true })));
  $("productStatus").addEventListener("change", () => loadProducts({ reset: true }));
  $("loadMoreProducts").addEventListener("click", () => loadProducts());
  $("refreshMerchantOrders").addEventListener("click", () => Promise.all([loadMerchantOrders({ reset: true }), loadManifests({ reset: true })]));
  $("loadMoreMerchantOrders").addEventListener("click", () => loadMerchantOrders());
  $("useProductLocation").addEventListener("click", useCurrentProductLocation);
  $("loadMoreManifests").addEventListener("click", () => loadManifests());
  $("createManifest").addEventListener("click", createManifest);
  $("useCurrentLocation").addEventListener("click", useCurrentLocation);
  $("listingForm").elements.latitude.addEventListener("input", updateManualListingLocation);
  $("listingForm").elements.longitude.addEventListener("input", updateManualListingLocation);
  $("providerAlerts").addEventListener("click", () => { renderProviderNotifications(); $("providerAlertsDialog").showModal(); });
  $("closeProviderAlerts").addEventListener("click", () => $("providerAlertsDialog").close());
  $("markProviderAlertsRead").addEventListener("click", () => void markProviderNotificationsRead());
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view))); document.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => switchAuth(button.dataset.authView)));
  boot().catch((error) => setMessage(error.message));
})();
