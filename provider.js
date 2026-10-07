(() => {
  "use strict";
  const API = "https://api.atlxpres.com/api/v1";
  const PAGE_SIZE = 25;
  const PENDING_SUBSCRIPTION_KEY = "atlantic.provider.pending_subscription";
  const ACTIVE_VIEW_KEY = "atlantic.provider.active_view";
  const PROVIDER_VIEWS = new Set(["overview", "subscription", "products", "merchant-orders", "listings", "requests", "messages"]);
  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem("atlantic.provider.token") || "",
    account: null,
    provider: null, plans: [], buyerMarkets: [], listings: [], requests: [], documents: [], products: [], merchantOrders: [], manifests: [], notifications: [], unreadNotifications: 0, conversations: [], currentConversation: null, payoutBanks: [],
    listingCursor: "", listingHasMore: false, requestCursor: "", requestHasMore: false,
    productCursor: "", productHasMore: false, merchantOrderCursor: "", merchantOrderHasMore: false, manifestCursor: "", manifestHasMore: false, editingProductID: "", editingListingID: "", listingRetainedMediaUrls: [], listingLocationAccuracy: null, listingLocationSource: "", listingMap: null, listingMarker: null, lastLocationSearchAt: 0, notificationTimer: null, booting: false,
    activeView: PROVIDER_VIEWS.has(localStorage.getItem(ACTIVE_VIEW_KEY)) ? localStorage.getItem(ACTIVE_VIEW_KEY) : "overview"
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = (value, currency = "NGN") => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(Number(value || 0)); }
    catch (_) { return ((currency || "") + " " + Number(value || 0).toLocaleString()).trim(); }
  };
  const human = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const bookingUnit = (listingType, count) => {
    const singular = listingType === "hotel" || listingType === "short_let" ? "guest" : ["car_rental", "car_wash", "mechanic"].includes(listingType) ? "vehicle" : "person";
    return Number(count) === 1 ? singular : `${singular}s`;
  };
  const debounce = (fn, wait = 300) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const setMessage = (text, ok = false, target = "portalMessage") => { const node = $(target); if (!node) return; node.textContent = text || ""; node.className = `message${target === "portalMessage" ? " portal-message" : ""}${ok ? " success" : ""}`; };
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
    const authToken = state.token;
    const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let response, raw;
    const readOnly = !options.method || options.method === "GET";
    for (let attempt = 0; attempt < (readOnly ? 2 : 1); attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        response = await fetch(`${API}${path}`, { cache: "no-store", ...options, headers, signal: options.signal || controller.signal });
        raw = response.status === 204 ? "" : await response.text();
        if (readOnly && attempt === 0 && [502,503,504].includes(response.status) && authToken === state.token) continue;
        break;
      } catch (error) {
        if (readOnly && attempt === 0 && !options.signal?.aborted && authToken === state.token && (error.name === "AbortError" || error instanceof TypeError)) continue;
        if (error.name === "AbortError" || error instanceof TypeError) throw new Error("Unable to connect. Previously loaded conversations are kept. Please retry.");
        throw error;
      } finally { clearTimeout(timeout); }
    }
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (_) { data = null; } }
    if (authToken !== state.token) throw new Error("Session changed; previous response ignored.");
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
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); const defaultLabel = button.textContent; button.disabled = true; button.textContent = "Creating account…"; setMessage("", false, "signupMessage");
    const payload = { ...Object.fromEntries(new FormData(form)), registration_context: "provider" };
    try {
      const data = await api("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
      switchAuth("login");
      document.querySelector("#loginForm [name=email]").value = String(payload.email || "");
      setMessage(data.message || "Account created. Check your email to verify it, then sign in here.", true, "loginMessage");
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
    } finally { button.disabled = false; button.textContent = defaultLabel; }
  }

  async function resendVerification() {
    const email = document.querySelector("#loginForm [name=email]").value.trim();
    if (!email) return setMessage("Enter your email first.", false, "loginMessage");
    try { const data = await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); setMessage(data.message || "Verification email queued.", true, "loginMessage"); }
    catch (error) { setMessage(error.message, false, "loginMessage"); }
  }

  function signOut() {
    state.booting = false;
    conversationsGeneration++; conversationGeneration++; conversationListFlight = null; conversationListCursor = "";
    conversationItems = []; conversationCursor = "";
    if ($("conversationDialog").open) $("conversationDialog").close();
    $("conversationMessages").textContent = ""; $("conversationRows").textContent = "";
    $("loadEarlierConversations").classList.add("hidden");
    state.token = ""; state.account = null; state.provider = null; state.listings = []; state.requests = []; state.documents = []; state.products = []; state.merchantOrders = []; state.conversations = []; state.currentConversation = null;
    localStorage.removeItem("atlantic.provider.token"); $("portal").classList.add("hidden"); $("sessionRestorePanel").classList.add("hidden"); $("authPanel").classList.remove("hidden"); $("signOut").classList.add("hidden"); $("providerAlerts").classList.add("hidden");
    document.body.classList.add("auth-mode");
    document.body.classList.remove("session-restoring");
    document.documentElement.classList.remove("provider-session-pending");
    switchAuth("login");
    $("providerStatus").textContent = "Secure provider access";
  }

  async function boot() {
    if (!state.token) return signOut();
    if (state.booting) return;
    state.booting = true;
    $("authPanel").classList.add("hidden"); $("portal").classList.remove("hidden"); $("sessionRestorePanel").classList.add("hidden"); $("signOut").classList.remove("hidden");
    document.body.classList.remove("auth-mode");
    document.body.classList.add("session-restoring");
    switchView(state.activeView, { persist: false });
    $("sessionRestoreMessage").textContent = "Checking your Atlantic Express account and provider access…";
    $("retrySessionRestore").disabled = true;
    $("providerStatus").textContent = "Restoring provider session..."; setMessage("");
    try {
      const profileData = await api("/profile");
      state.account = profileData.profile || profileData.user || profileData;
      try { state.provider = await api("/providers/me"); $("onboardingCard").classList.add("hidden"); }
      catch (error) { if (error.status === 404) { state.provider = null; $("onboardingCard").classList.remove("hidden"); } else throw error; }
    } catch (error) {
      if (error.status === 401) return signOut();
      setMessage((error.message || "The provider session could not be restored.") + " Check your connection, then refresh.", false);
      $("providerStatus").textContent = "Session restoration needs attention";
      document.body.classList.remove("session-restoring");
      document.documentElement.classList.remove("provider-session-pending");
      state.booting = false;
      return;
    }
    $("sessionRestorePanel").classList.add("hidden"); $("portal").classList.remove("hidden"); $("signOut").classList.remove("hidden"); $("providerAlerts").classList.remove("hidden");
    document.body.classList.remove("auth-mode");
    document.body.classList.remove("session-restoring");
    document.documentElement.classList.remove("provider-session-pending");
    switchView(state.activeView, { persist: false });
    $("providerStatus").textContent = `Signed in as ${state.account.email || "verified user"}. Provider access is separate from the Admin dashboard.`;
    renderOverview();
    state.booting = false;
    startProviderNotificationPolling();
    void handleSubscriptionReturn();
    const loads = [loadPlans(), loadBuyerMarkets()];
    if (state.provider) loads.push(loadListings({ reset: true }), loadRequests({ reset: true }), loadVerificationDocuments(), loadProducts({ reset: true }), loadMerchantOrders({ reset: true }), loadManifests({ reset: true }), loadProviderNotifications(), loadConversations());
    void Promise.allSettled(loads).then(results => {
      if (results.some(result => result.status === "rejected")) setMessage("Some provider data could not be loaded. Use Refresh to try again.");
      renderOverview();
    });
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
    try {
      const previous = state.unreadNotifications; const known = new Set(state.notifications.map(item => item.id));
      const data = await api("/providers/me/notifications?limit=50"); state.notifications = data.items || []; state.unreadNotifications = Number(data.unread_count || 0); renderProviderNotifications();
      const listingChanged = state.notifications.some(item => !known.has(item.id) && ["listing_approved", "listing_rejected", "listing_suspended"].includes(item.event_type));
      if (silent && state.unreadNotifications > previous) playProviderAlert();
      if (silent && listingChanged) await loadListings({ reset: true });
      if (silent && state.notifications.some(item => !known.has(item.id) && ["conversation_message", "request_created"].includes(item.event_type))) await loadConversations();
    }
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

  async function loadPayoutBanks() {
    if (!state.provider?.can_sell_products || state.provider?.payout_account?.status === "active") return;
    const country = String($("payoutCountry").value || state.provider.country_code || "NG").trim().toUpperCase();
    if (country.length !== 2) return setMessage("Enter a valid two-letter bank country code.", false, "payoutMessage");
    const button = $("loadPayoutBanks"); button.disabled = true; setMessage("Loading supported banks…", false, "payoutMessage");
    try {
      const data = await api(`/providers/payout-banks?country=${encodeURIComponent(country)}`);
      state.payoutBanks = data.items || [];
      $("payoutBank").innerHTML = '<option value="">Choose your bank</option>' + state.payoutBanks.map((bank) => `<option value="${escapeHtml(bank.code)}">${escapeHtml(bank.name)} (${escapeHtml(bank.code)})</option>`).join("");
      setMessage(state.payoutBanks.length ? "Choose the account's bank." : "Flutterwave returned no supported banks for this country.", state.payoutBanks.length > 0, "payoutMessage");
    } catch (error) { setMessage(error.message, false, "payoutMessage"); }
    finally { button.disabled = false; }
  }

  async function configurePayoutAccount(event) {
    event.preventDefault();
    if (!confirm("Confirm this is the provider's settlement account. Replacing it later requires support review.")) return;
    const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    const payload = Object.fromEntries(new FormData(form)); payload.country_code = String(payload.country_code || "").trim().toUpperCase();
    try {
      await api("/providers/me/payout-account", { method: "POST", body: JSON.stringify(payload) });
      state.provider = await api("/providers/me");
      form.reset(); renderOverview();
      setMessage("Flutterwave settlement account connected.", true, "payoutMessage");
    } catch (error) { setMessage(error.message, false, "payoutMessage"); }
    finally { button.disabled = false; }
  }

  async function loadPlans() { const data = await api("/marketplace/subscription-plans"); state.plans = data.items || []; renderPlans(); }
  async function loadBuyerMarkets() {
    try {
      const data = await api("/buyer-markets");
      state.buyerMarkets = data.markets || [];
      $("enabledBuyerMarkets").textContent = `You can currently deliver to: ${(data.markets || []).map(market => market.country_name || (market.country_code === "NG" ? "Nigeria" : market.country_code)).join(", ") || "no countries yet"}.`;
    } catch {
      $("enabledBuyerMarkets").textContent = "Could not load enabled buyer markets. Refresh before adding a new destination.";
    }
  }
  function hasActiveSubscription() {
    const subscription = state.provider?.subscription;
    const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
    return subscription?.status === "active" && Number.isFinite(periodEnd) && periodEnd > Date.now();
  }
  function hasProviderAccess() { return state.provider?.subscription?.launch_access_active === true || hasActiveSubscription(); }
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
    if (!hasProviderAccess()) {
      setMessage(`Choose and activate a monthly plan before creating ${kind}.`);
      openSubscription();
      return false;
    }
    if (kind === "products" && state.provider?.payout_account?.status !== "active") {
      setMessage("Connect the seller's Flutterwave settlement account before creating products.");
      switchView("overview");
      $("sellerSettlement").scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    return true;
  }
  async function subscribe(planId) {
    if (state.provider?.subscription?.launch_access_active) return setMessage("Provider access is free during launch. No subscription payment is needed.", true);
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
    const freeLaunch = state.provider?.subscription?.launch_access_active === true;
    const approved = state.provider?.verification_status === "approved";
    const pending = !active && hasPendingSubscription();
    if (active) clearPendingSubscription();
    $("subscriptionGuidance").innerHTML = freeLaunch ? "<strong>Free launch access is active.</strong> Approved providers can create and submit products and services without paying a subscription." : active ? `<strong>Subscription active.</strong> You can create private drafts and submit them for review.${state.provider.subscription.current_period_end ? ` Current period ends ${new Date(state.provider.subscription.current_period_end).toLocaleDateString()}.` : ""}` : pending ? "<strong>Payment confirmation pending.</strong> Do not pay again. Use Check payment status while Atlantic Express securely reconciles this payment with Flutterwave." : approved ? "<strong>Subscription required.</strong> Choose a monthly plan below. Product and service creation unlocks after Flutterwave confirms payment." : "Your business must be approved before you can purchase a provider plan.";
    $("plans").innerHTML = freeLaunch ? "" : state.plans.length ? state.plans.map((plan) => `<article class="plan"><span class="eyebrow">Monthly plan</span><h3>${escapeHtml(plan.name)}</h3><strong>${money(plan.amount_ngn)}/month</strong><p>${escapeHtml(plan.description || `${plan.listing_limit} active listings`)}</p><button data-subscribe="${plan.id}" ${!state.provider || active || !approved ? "disabled" : ""}>${active ? "Current plan active" : pending ? "Check payment status" : "Subscribe securely"}</button></article>`).join("") : '<p class="notice"><strong>No active plan is available.</strong> Atlantic Express must configure a monthly provider plan before checkout can begin.</p>';
    document.querySelectorAll("[data-subscribe]").forEach((button) => button.onclick = () => subscribe(button.dataset.subscribe));
    renderSubscriptionGates();
  }
  function renderSubscriptionGates() {
    const active = hasProviderAccess();
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
      urls.push(await PortalStorageUpload.upload(file, signed));
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
      await PortalStorageUpload.upload(file, signed);
      await api("/providers/me/verification-documents", { method: "POST", body: JSON.stringify({ document_type: documentType, document_url: signed.view_url }) });
      form.reset(); setMessage("Document submitted for review.", true, "verificationMessage"); await loadVerificationDocuments();
    } catch (error) { setMessage(error.message, false, "verificationMessage"); } finally { button.disabled = false; }
  }

  function renderExistingListingImages() {
    const container = $("listingExistingImages");
    if (!container) return;
    const urls = state.listingRetainedMediaUrls || [];
    container.classList.toggle("hidden", urls.length === 0);
    container.innerHTML = urls.length ? `<strong>Current images</strong><p>Remove only the images you no longer want. New images selected below will be added to these.</p><div class="existing-media-grid">${urls.map((url, index) => `<figure><img src="${escapeHtml(url)}" alt="Current service image ${index + 1}" /><button type="button" class="secondary" data-remove-listing-image="${index}">Remove</button></figure>`).join("")}</div>` : "";
    container.querySelectorAll("[data-remove-listing-image]").forEach((button) => {
      button.addEventListener("click", () => {
        state.listingRetainedMediaUrls.splice(Number(button.dataset.removeListingImage), 1);
        renderExistingListingImages();
        setMessage("Image removed from this draft. Select Save service draft to keep the change.", true, "uploadProgress");
      });
    });
  }

  function syncListingPriceMode() {
    const form = $("listingForm"), mode = form.elements.price_mode.value;
    const quote = mode === "quote";
    $("listingPriceField").classList.toggle("hidden", quote);
    form.elements.price.disabled = quote; form.elements.price.required = !quote;
    form.elements.price.min = mode === "from" ? "0.01" : "0";
    $("listingPriceLabel").textContent = mode === "from" ? "starting amount" : "set amount";
    $("listingPriceHelp").textContent = mode === "from" ? "The lowest price. Tell customers below what may cost extra." : "What the customer pays for the service described.";
  }
  function setListingFormOpen(open, { reset = false } = {}) {
    const form = $("listingForm"); const toggle = $("toggleListingForm");
    if (reset) {
      form.reset(); state.editingListingID = ""; state.listingRetainedMediaUrls = []; state.listingLocationAccuracy = null; state.listingLocationSource = ""; renderExistingListingImages();
      $("confirmListingLocation").checked = false; $("openListingLocationMap").classList.add("hidden"); $("listingLocationSearchResults").classList.add("hidden"); $("listingLocationSearchResults").replaceChildren();
      if (state.listingMarker && state.listingMap) { state.listingMap.removeLayer(state.listingMarker); state.listingMarker = null; state.listingMap.setView([9.082, 8.6753], 6); }
      setListingLocationStatus("Search for the address or use this device's location, then verify the pin.");
    }
    form.classList.toggle("hidden", !open); toggle.textContent = open ? "Close form" : "Create service"; toggle.setAttribute("aria-expanded", String(open));
    syncListingPriceMode();
    if (open) {
      ensureListingMap();
      setTimeout(() => state.listingMap?.invalidateSize(), 0);
      requestAnimationFrame(() => form.scrollIntoView({ behavior: "smooth", block: "start" }));
      void prepareListingLocation();
	  syncListingTypeFields();
    }
  }

  function syncListingTypeFields() {
	const form = $("listingForm");
	const capacityTypes = new Set(["hotel", "short_let", "car_rental", "car_wash", "food_vendor", "shop_rental"]);
	const visible = capacityTypes.has(form.elements.listing_type.value);
	$("listingCapacityField").classList.toggle("hidden", !visible);
	if (!visible) form.elements.capacity.value = "1";
  }

  function setSelectOptions(select, options, preferred) {
    select.replaceChildren(...options.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));
    if (options.some(([value]) => value === preferred)) select.value = preferred;
  }

  function syncProductFulfillment(preferredState = "") {
    const mode = $("productFulfillmentMode").value; const stock = $("productStockState"); const country = $("productCountryCode");
    country.readOnly = false;
    if (mode === "merchant_local") {
      setSelectOptions(stock, [["locally_available", "Available now"]], "locally_available");
      $("productStockHelp").textContent = "Use the country where this stock is already available.";
    } else {
      setSelectOptions(stock, [["foreign_stock", "In stock at origin"], ["import_on_demand", "Source after customer payment"]], preferredState || stock.value);
      $("productStockHelp").textContent = "Enter the country where the seller will source or dispatch this product.";
    }
  }

  const deliveryEditor = new ProviderDeliveryAreas.Editor($("productDeliveryAreas"), {
    markets: () => state.buyerMarkets, mainPrice: () => Number($("productForm").elements.local_selling_price.value),
    mainCurrency: () => $("productForm").elements.currency_code.value.trim().toUpperCase(), formatMoney: money
  });
  function setProductFormOpen(open, { reset = false } = {}) {
    const form = $("productForm"); const toggle = $("toggleProductForm");
    if (reset) {
      form.reset(); state.editingProductID = "";
      const country = String(state.provider?.country_code || "NG").toUpperCase();
      const market = state.buyerMarkets.find(item => item.country_code === country);
      form.elements.inventory_country_code.value = country;
      if (market) {
        form.elements.currency_code.value = market.currency_code;

      }
      form.elements.sku.readOnly = false;
      deliveryEditor.reset(country);
      syncProductFulfillment();
    }
    form.classList.toggle("hidden", !open); toggle.textContent = open ? "Close form" : "Create product"; toggle.setAttribute("aria-expanded", String(open));
    if (open) { if (!deliveryEditor.rows.length) deliveryEditor.reset(state.provider?.country_code || "NG"); deliveryEditor.refresh(); requestAnimationFrame(() => form.scrollIntoView({ behavior: "smooth", block: "start" })); }
  }

  function validatedProductValues(form) {
    if (!form.reportValidity()) throw new Error("Complete the highlighted product fields.");
    const values = Object.fromEntries(new FormData(form)); const price = Number(values.local_selling_price); const compared = values.compare_at_price === "" ? null : Number(values.compare_at_price); const flash = values.flash_sale_price === "" ? null : Number(values.flash_sale_price);
    if (compared !== null && compared <= price) throw new Error("Crossed-out price must be higher than the selling price.");
    if (form.elements.is_flash_sale.checked && (flash === null || flash <= 0 || flash >= price)) throw new Error("Flash price must be greater than zero and lower than the selling price.");
    if (Number(values.delivery_max_days) < Number(values.delivery_min_days)) throw new Error("Maximum delivery days cannot be less than minimum delivery days.");
    values.inventory_country_code = String(values.inventory_country_code).trim().toUpperCase();
    values.currency_code = String(values.currency_code || "").trim().toUpperCase();
    values.delivery_areas = deliveryEditor.values();
    if (values.fulfillment_mode === "merchant_local") {
      values.stock_state = "locally_available";
      if (values.inventory_latitude === "" || values.inventory_longitude === "") throw new Error("Use current stock location so nearby buyers can discover this product.");
    }
    return values;
  }

  async function saveListing(event) {
    event.preventDefault(); if (!requireSubscription("services")) return; const form = event.currentTarget; if (!form.reportValidity()) return; const files = [...$("listingImages").files];
    const existing = state.listings.find(item => item.id === state.editingListingID);
    const retainedMedia = state.editingListingID ? [...state.listingRetainedMediaUrls] : [];
    if (!files.length && !retainedMedia.length) return setMessage("Keep or add at least one clear service image.", false, "uploadProgress");
    if (files.length + retainedMedia.length > 20) return setMessage("A service can have no more than 20 images in total.", false, "uploadProgress");
    const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      values.country_code = String(values.country_code || "").trim().toUpperCase();
      values.currency_code = String(values.currency_code || "").trim().toUpperCase();
      const latitude = Number(values.latitude); const longitude = Number(values.longitude);
      if (values.latitude === "" || values.longitude === "" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setListingLocationStatus("Location is required. Select Use my current location, then allow the browser request.", "error");
        $("listingLocationStatus").scrollIntoView({ behavior: "smooth", block: "center" });
        throw new Error("Capture the service location before saving.");
      }
      if (!$("confirmListingLocation").checked) {
        $("listingLocationPreview").scrollIntoView({ behavior: "smooth", block: "center" });
        throw new Error("Confirm that the map pin is at the actual service or property location before saving.");
      }
      const uploadedMedia = files.length ? await uploadImages(files) : [];
      const media_urls = [...retainedMedia, ...uploadedMedia];
      const attributes = { ...(existing?.attributes || {}), price_mode: values.price_mode, price_notes: String(values.price_notes || "").trim(), location_source: state.listingLocationSource || "manual", location_accuracy_m: state.listingLocationAccuracy, location_captured_at: new Date().toISOString() };
      const payload = { ...values, price: values.price_mode === "quote" || values.price === "" ? null : Number(values.price), capacity: Number(values.capacity || 1), latitude, longitude, service_radius_km: values.service_radius_km === "" ? null : Number(values.service_radius_km), is_mobile_service: form.elements.is_mobile_service.checked, is_available_now: form.elements.is_available_now.checked, media_urls, attributes };
      const path = state.editingListingID ? "/providers/me/listings/" + state.editingListingID : "/providers/me/listings";
      await api(path, { method: state.editingListingID ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setListingFormOpen(false, { reset: true }); setMessage(existing ? "Service updated and returned for review." : "Service draft saved privately. Use Submit for review when it is complete.", true); setMessage("", false, "uploadProgress"); await loadListings({ reset: true });
    } catch (error) {
	  setMessage(error.message, false, "uploadProgress");
	  $("uploadProgress").scrollIntoView({ behavior: "smooth", block: "center" });
	} finally { button.disabled = false; }
  }

  async function saveProduct(event) {
    event.preventDefault(); if (!requireSubscription("products")) return; const form = event.currentTarget; let values;
    const showFormError = (message) => { setMessage(message, false, "productUploadProgress"); $("productUploadProgress").scrollIntoView({ behavior: "smooth", block: "center" }); };
    setMessage("", false, "productUploadProgress");
    try { values = validatedProductValues(form); } catch (error) { return showFormError(error.message); }
    const files = [...$("productImages").files]; if (files.length > 20) return showFormError("Upload no more than 20 product images."); const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const existing = state.products.find(item => item.id === state.editingProductID);
      if (!files.length && !existing?.image_urls?.length) throw new Error("Add at least one clear product image.");
      const image_urls = files.length ? await uploadImages(files, "productUploadProgress") : existing.image_urls;
      const payload = { title: values.title, sku: values.sku, description: values.description, category_path: [values.category], image_urls, local_selling_price: Number(values.local_selling_price), currency_code: values.currency_code, compare_at_price: values.compare_at_price ? Number(values.compare_at_price) : null, inventory_count: Number(values.inventory_count), is_flash_sale: form.elements.is_flash_sale.checked, flash_sale_price: values.flash_sale_price ? Number(values.flash_sale_price) : null, fulfillment_mode: values.fulfillment_mode, inventory_country_code: values.inventory_country_code, inventory_city: values.inventory_city, inventory_location: values.inventory_location, inventory_latitude: values.inventory_latitude === "" ? null : Number(values.inventory_latitude), inventory_longitude: values.inventory_longitude === "" ? null : Number(values.inventory_longitude), stock_state: values.stock_state, handling_time_hours: Number(values.handling_time_hours), delivery_min_days: Number(values.delivery_min_days), delivery_max_days: Number(values.delivery_max_days), delivery_methods: String(values.delivery_methods).split(",").map(value => value.trim()).filter(Boolean), delivery_areas: values.delivery_areas, return_policy: values.return_policy };
      const path = state.editingProductID ? `/providers/me/products/${state.editingProductID}` : "/providers/me/products";
      await api(path, { method: state.editingProductID ? "PATCH" : "POST", body: JSON.stringify(payload) }); setProductFormOpen(false, { reset: true }); setMessage("Product draft saved privately. Use Submit for review when it is complete.", true); setMessage("", false, "productUploadProgress"); await loadProducts({ reset: true });
    } catch (error) { showFormError(error.message); } finally { button.disabled = false; }
  }
  let productsGeneration = 0;
  async function loadProducts({ reset = false } = {}) {
    const generation = ++productsGeneration;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const search = $("productSearch").value.trim(), status = $("productStatus").value; if (search) params.set("search", search); if (status) params.set("status", status); if (!reset && state.productCursor) params.set("cursor", state.productCursor);
    const data = await api(`/providers/me/products?${params}`); if (generation !== productsGeneration) return; state.products = reset ? (data.items || []) : [...state.products, ...(data.items || [])]; state.productCursor = data.page?.next_cursor || ""; state.productHasMore = Boolean(data.page?.has_more); renderProducts(); renderOverview();
  }
  function renderProducts() {
    $("productRows").innerHTML = state.products.length ? state.products.map((item) => `<article class="list-row listing-row">${item.image_urls?.[0] ? `<img class="listing-thumb" src="${escapeHtml(item.image_urls[0])}" alt="">` : ""}<div><span class="badge">${escapeHtml(human(item.moderation_status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.sku)} · ${money(item.local_selling_price, item.currency_code)} · ${item.inventory_count} in stock</p><p>${escapeHtml(human(item.fulfillment_mode))} · ${escapeHtml([item.inventory_city, item.inventory_country_code].filter(Boolean).join(", "))} · ${item.delivery_min_days}-${item.delivery_max_days} days</p><p>Delivers to: ${escapeHtml((item.delivery_areas || []).map(area => `${[area.city, area.state, area.country_code].filter(Boolean).join(", ")}: ${money(Number(area.delivered_price) - Number(area.delivery_fee || 0), area.currency_code)} + ${money(area.delivery_fee || 0, area.currency_code)} delivery`).join("; ") || "No area set")}</p>${item.moderation_notes ? `<p>${escapeHtml(item.moderation_notes)}</p>` : ""}</div><div class="list-actions"><button class="secondary" data-edit-product="${item.id}">Edit</button>${["draft","rejected"].includes(item.moderation_status) ? `<button data-submit-product="${item.id}">Submit for review</button>` : ""}<button class="secondary" data-archive-product="${item.id}">Archive</button></div></article>`).join("") : "<p>No matching products.</p>";
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
    ["title", "sku", "description", "local_selling_price", "currency_code", "compare_at_price", "inventory_count", "flash_sale_price", "inventory_country_code", "inventory_city", "inventory_location", "inventory_latitude", "inventory_longitude", "handling_time_hours", "delivery_min_days", "delivery_max_days", "return_policy"].forEach((name) => {
      form.elements[name].value = item[name] ?? "";
    });
    form.elements.stock_state.value = item.stock_state || (item.fulfillment_mode === "merchant_cross_border" ? "foreign_stock" : "locally_available");
    deliveryEditor.load(item.delivery_areas || []);
    form.elements.sku.readOnly = true;
    form.elements.category.value = item.category_path?.[0] || "";
    form.elements.delivery_methods.value = (item.delivery_methods || []).join(",");
    form.elements.is_flash_sale.checked = Boolean(item.is_flash_sale);

    setProductFormOpen(true);
  }

  let merchantOrdersGeneration = 0;
  async function loadMerchantOrders({ reset = false } = {}) {
    const generation = ++merchantOrdersGeneration; const authToken = state.token;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); if (!reset && state.merchantOrderCursor) params.set("cursor", state.merchantOrderCursor); const data = await api(`/providers/me/merchant-orders?${params}`); if (generation !== merchantOrdersGeneration || authToken !== state.token) return; state.merchantOrders = reset ? (data.items || []) : [...state.merchantOrders, ...(data.items || [])]; state.merchantOrderCursor = data.page?.next_cursor || ""; state.merchantOrderHasMore = Boolean(data.page?.has_more); renderMerchantOrders();
  }
  function renderMerchantOrders() {
    const transitions = {
      merchant_local: { pending:["accepted"], accepted:["packed"], packed:["ready_for_pickup","out_for_delivery"], ready_for_pickup:["delivered"], out_for_delivery:["delivered"] },
      merchant_cross_border: { pending:["accepted"], accepted:["processing"], processing:["dispatched_from_origin"], dispatched_from_origin:["international_transit"], international_transit:["customs_clearance","local_hub"], customs_clearance:["local_hub"], local_hub:["ready_for_pickup","out_for_delivery"], ready_for_pickup:["delivered"], out_for_delivery:["delivered"] }
    };
    $("merchantOrderRows").innerHTML = state.merchantOrders.length ? state.merchantOrders.map((order) => {
      const f = order.fulfillment || {}, funds = order.seller_funds || {};
      const settlementPending = f.route === "merchant_cross_border" && funds.status !== "settled";
      const targets = settlementPending ? [] : (transitions[f.route]?.[f.status] || []);
      const payoutKnown = funds.payout_amount != null;
      const failed = ["failed", "reversed"].includes(funds.status);
      const payoutSummary = `<p><strong>Seller funds:</strong> ${escapeHtml(human(funds.status || "pending"))}</p>
        <p>Expected seller share: ${money(funds.expected_amount || 0)}${payoutKnown ? ` · Gateway deductions: ${money(funds.gateway_deductions || 0)}` : ""}</p>
        ${payoutKnown ? `<p>${funds.status === "settled" ? "Released payout" : funds.status === "reversed" ? "Reversed payout" : "Reported payout (not released)"}: <strong>${money(funds.payout_amount)}</strong>${funds.destination ? ` · ${escapeHtml(human(funds.destination))}` : ""}</p>` : ""}
        ${funds.note ? `<p class="moderation-note">Flutterwave: ${escapeHtml(funds.note)}</p>` : ""}
        ${funds.checked_at ? `<p class="mobile-card-meta">Last settlement update: ${new Date(funds.checked_at).toLocaleString()}</p>` : ""}`;
      return `<article class="list-row"><label>${!settlementPending && f.route === "merchant_cross_border" && ["pending", "accepted", "processing"].includes(f.status) ? `<input type="checkbox" data-manifest-order="${order.id}" /> Add to manifest` : ""}</label>
        <div><span class="badge">${escapeHtml(human(f.status || order.status))}</span><h3>${escapeHtml(order.package_label || order.id)}</h3>
        <p>${escapeHtml(human(f.route))} · ${new Date(order.created_at).toLocaleString()} · ${money(order.total_amount)}</p>${payoutSummary}
        ${settlementPending ? `<p class="moderation-note">${failed ? "Seller payout needs attention. Contact support." : "Buyer payment is confirmed, but Flutterwave has not released the seller payout."} Do not purchase or dispatch this imported item yet.</p>` : ""}
        ${(order.items || []).map(item => `<p><strong>${escapeHtml(item.title)}</strong> · ${item.quantity} × ${money(item.unit_price)}</p>`).join("")}
        <p><strong>Buyer:</strong> ${escapeHtml(order.fulfillment_contact?.full_name || "")} · ${escapeHtml(order.fulfillment_contact?.phone || "")} · ${escapeHtml([order.fulfillment_contact?.address, order.fulfillment_contact?.city, order.fulfillment_contact?.state].filter(Boolean).join(", "))}</p></div>
        <div class="list-actions">${targets.map(target => `<button data-fulfil-order="${order.id}" data-next="${target}" data-version="${f.version}">${escapeHtml(human(target))}</button>`).join("")}</div></article>`;
    }).join("") : "<p>No paid merchant orders yet.</p>";
    $("loadMoreMerchantOrders").classList.toggle("hidden", !state.merchantOrderHasMore);
    document.querySelectorAll("#merchantOrderRows article").forEach((article, index) => {
      const order = state.merchantOrders[index];
      article.querySelector("label")?.insertAdjacentHTML("afterbegin", `<input type="checkbox" data-bulk-order="${order.id}" /> Select for bulk update<br>`);
    });
    document.querySelectorAll("[data-fulfil-order]").forEach(button => button.onclick = () => transitionOrder(button));
  }

  function transitionOrder(button) {
    const order = state.merchantOrders.find(item => item.id === button.dataset.fulfilOrder);
    if (!order) return;
    const fulfillment = order.fulfillment || {};
    const form = $("fulfillmentForm");
    form.reset();
    form.elements.order_id.value = order.id;
    form.elements.status.value = button.dataset.next;
    form.elements.expected_version.value = button.dataset.version;
    form.elements.location.value = fulfillment.current_location || "";
    form.elements.carrier.value = fulfillment.carrier || "";
    form.elements.tracking_number.value = fulfillment.tracking_number || "";
    form.elements.tracking_url.value = fulfillment.tracking_url || "";
    $("fulfillmentTitle").textContent = human(button.dataset.next);
    setMessage("", false, "fulfillmentMessage");
    $("fulfillmentDialog").showModal();
  }

  async function submitFulfillmentUpdate(event) {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    try {
      const estimated = values.estimated_delivery_at ? new Date(values.estimated_delivery_at).toISOString() : "";
      await api("/providers/me/merchant-orders/" + values.order_id + "/fulfillment", { method:"PATCH", body:JSON.stringify({ status:values.status, expected_version:Number(values.expected_version), idempotency_key:crypto.randomUUID(), notes:values.notes, location:values.location, carrier:values.carrier, tracking_number:values.tracking_number, tracking_url:values.tracking_url, estimated_delivery_at:estimated }) });
      $("fulfillmentDialog").close();
      setMessage("Tracking update published to the buyer.", true);
      await loadMerchantOrders({reset:true});
    } catch(error) { setMessage(error.message, false, "fulfillmentMessage"); }
    finally { button.disabled=false; }
  }

  async function bulkUpdateMerchantOrders() {
    const selectedIDs = [...document.querySelectorAll("[data-bulk-order]:checked")].map(input => input.dataset.bulkOrder);
    const status = $("bulkFulfillmentStatus").value;
    if (!selectedIDs.length || !status) {
      setMessage("Select at least one order and the next tracking stage.", false, "bulkFulfillmentMessage");
      return $("bulkFulfillmentControls").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const orders = selectedIDs.map(orderID => {
      const order = state.merchantOrders.find(item => item.id === orderID);
      return { order_id: orderID, expected_version: Number(order?.fulfillment?.version || 0) };
    });
    const button = $("bulkUpdateOrders");
    button.disabled = true;
    setMessage(`Updating ${orders.length} order(s)...`, true, "bulkFulfillmentMessage");
    try {
      const data = await api("/providers/me/merchant-orders/fulfillment/bulk", { method: "PATCH", body: JSON.stringify({ orders, status, idempotency_key: crypto.randomUUID() }) });
      setMessage(`${data.updated || orders.length} order(s) updated. Buyers have been notified.`, true, "bulkFulfillmentMessage");
      await loadMerchantOrders({ reset: true });
    } catch (error) {
      setMessage(error.message, false, "bulkFulfillmentMessage");
      $("bulkFulfillmentControls").scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      button.disabled = false;
    }
  }

  let manifestsGeneration = 0;
  async function loadManifests({reset=false}={}) {
    const generation = ++manifestsGeneration; const authToken = state.token; const params=new URLSearchParams({limit:String(PAGE_SIZE)}); if(!reset&&state.manifestCursor) params.set("cursor",state.manifestCursor); const data=await api(`/providers/me/manifests?${params}`); if (generation !== manifestsGeneration || authToken !== state.token) return; state.manifests=reset?(data.items||[]):[...state.manifests,...(data.items||[])]; state.manifestCursor=data.next_cursor||""; state.manifestHasMore=Boolean(data.has_more); renderManifests(); }
  function renderManifests(){ const next={open:"closed",closed:"dispatched",dispatched:"completed"}; $("manifestRows").innerHTML=state.manifests.length?state.manifests.map(item=>`<article class="list-row"><div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.manifest_code)}</h3><p>${item.order_count} orders · ${escapeHtml(item.origin_city)}, ${escapeHtml(item.origin_country_code)} · cutoff ${new Date(item.cutoff_at).toLocaleString()}</p></div><div class="list-actions"><button class="secondary" data-print-manifest="${item.id}">View / print</button>${next[item.status]?`<button data-manifest-transition="${item.id}" data-next="${next[item.status]}" data-version="${item.version}">${escapeHtml(human(next[item.status]))}</button>`:""}</div></article>`).join(""):"<p>No merchant manifests yet.</p>"; $("loadMoreManifests").classList.toggle("hidden",!state.manifestHasMore); document.querySelectorAll("[data-print-manifest]").forEach(button=>button.onclick=()=>printManifest(button.dataset.printManifest)); document.querySelectorAll("[data-manifest-transition]").forEach(button=>button.onclick=()=>transitionManifest(button)); }
  async function createManifest(){ const order_ids=[...document.querySelectorAll("[data-manifest-order]:checked")].map(input=>input.dataset.manifestOrder); if(!order_ids.length) return setMessage("Select at least one imported order."); const origin_country_code=(prompt("Two-letter origin country code","")||"").trim().toUpperCase(); const origin_city=(prompt("Origin city","")||"").trim(); if(!origin_country_code||!origin_city)return; try{await api("/providers/me/manifests",{method:"POST",body:JSON.stringify({order_ids,origin_country_code,origin_city,cutoff_at:new Date().toISOString()})}); await Promise.all([loadManifests({reset:true}),loadMerchantOrders({reset:true})]);}catch(error){setMessage(error.message);} }
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
  function ensureListingMap() {
    if (state.listingMap) return state.listingMap;
    if (!window.L) { setListingLocationStatus("The interactive map could not load. Check the internet connection and reload this page.", "error"); return null; }
    const map = window.L.map("listingLocationMap").setView([9.082, 8.6753], 6);
    const street = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
    const satellite = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" });
    window.L.control.layers({ "Street map": street, "Satellite": satellite }, null, { collapsed: false }).addTo(map);
    map.on("click", (event) => { setListingMapPin(event.latlng.lat, event.latlng.lng, "map", null, true); setListingLocationStatus("Pin placed. Drag it if needed, then confirm the exact service location.", "ready"); });
    state.listingMap = map;
    return map;
  }
  function setListingMapPin(latitude, longitude, source = "map", accuracy = null, recenter = true) {
    const lat = Number(latitude); const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const map = ensureListingMap(); if (!map) return;
    const form = $("listingForm"); form.elements.latitude.value = lat.toFixed(6); form.elements.longitude.value = lon.toFixed(6);
    state.listingLocationSource = source; state.listingLocationAccuracy = Number.isFinite(accuracy) ? Math.round(accuracy) : null;
    if (!state.listingMarker) {
      state.listingMarker = window.L.marker([lat, lon], { draggable: true }).addTo(map);
      state.listingMarker.on("dragend", (event) => { const point = event.target.getLatLng(); setListingMapPin(point.lat, point.lng, "map", null, false); setListingLocationStatus("Pin moved. Confirm that it is now at the exact service location.", "ready"); });
    } else { state.listingMarker.setLatLng([lat, lon]); }
    if (recenter) map.setView([lat, lon], Math.max(map.getZoom(), 16));
    $("openListingLocationMap").href = "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=17/" + lat + "/" + lon;
    $("openListingLocationMap").classList.remove("hidden"); $("confirmListingLocation").checked = false;
    setTimeout(() => map.invalidateSize(), 0);
  }
  function renderListingLocationPreview(latitude, longitude) {
    setListingMapPin(latitude, longitude, state.listingLocationSource || "saved", state.listingLocationAccuracy, true);
  }
  function cachedLocationSearch(query) {
    try { return JSON.parse(localStorage.getItem("atlantic.location.search." + query.toLowerCase()) || "null"); } catch (_) { return null; }
  }
  async function searchListingLocation() {
    const form = $("listingForm"); const input = $("listingLocationSearch"); const button = $("searchListingLocation");
    const composed = [form.elements.address_line.value, form.elements.city.value, form.elements.state.value].map(value => String(value || "").trim()).filter(Boolean).join(", ");
    const query = input.value.trim() || composed; if (!query) return setListingLocationStatus("Enter an address, area, city, or state to search.", "error");
    input.value = query; const country = String(form.elements.country_code.value || "").trim().toLowerCase(); button.disabled = true; setListingLocationStatus("Searching the map for " + query + "…");
    try {
      let results = cachedLocationSearch(query + "|" + country);
      if (!results) {
        const wait = Math.max(0, 1100 - (Date.now() - state.lastLocationSearchAt)); if (wait) await delay(wait);
        state.lastLocationSearchAt = Date.now(); const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "5", addressdetails: "1" }); if (country) params.set("countrycodes", country);
        const response = await fetch("https://nominatim.openstreetmap.org/search?" + params, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error("Map search is temporarily unavailable (" + response.status + ").");
        results = await response.json(); localStorage.setItem("atlantic.location.search." + (query + "|" + country).toLowerCase(), JSON.stringify(results));
      }
      const container = $("listingLocationSearchResults"); container.replaceChildren();
      if (!results.length) { container.classList.add("hidden"); return setListingLocationStatus("No map result matched that search. Add the city/state or try a nearby landmark.", "error"); }
      results.forEach((result) => {
        const option = document.createElement("button"); option.type = "button"; option.className = "location-search-result"; option.textContent = result.display_name;
        option.onclick = () => { setListingMapPin(result.lat, result.lon, "address_search", null, true); container.classList.add("hidden"); setListingLocationStatus("Search result selected. Click the map or drag the pin to the exact property, then confirm it.", "ready"); };
        container.append(option);
      });
      container.classList.remove("hidden"); setListingLocationStatus("Choose the best result, then move the pin to the exact service location.");
    } catch (error) { setListingLocationStatus(error.message || "Map search failed. Try again or click the location directly on the map.", "error"); } finally { button.disabled = false; }
  }
  function requestBrowserPosition(options) { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options)); }
  function explainLocationError(error) {
    if (error?.code === 1) return "Location is blocked for this site. Use the padlock/site-settings icon beside the address, allow Location for admin.atlxpres.com, then retry—or enter coordinates manually.";
    if (error?.code === 2) return "This device could not determine its location. Check the operating-system location service or enter the service coordinates manually.";
    if (error?.code === 3) return "Location timed out. Move near a window, retry, or enter the service coordinates manually.";
    if (String(error?.message || "").startsWith("Location accuracy is too low")) return error.message;
    return "Could not read this device's location. Enter the service coordinates manually.";
  }
  async function prepareListingLocation() {
    const form = $("listingForm");
    if (form.elements.latitude.value && form.elements.longitude.value) return updateManualListingLocation();
    if (!window.isSecureContext) return setListingLocationStatus("Location requires the secure HTTPS portal.", "error");
    if (!navigator.geolocation) return setListingLocationStatus("This browser does not provide device location. Open the advanced fallback below.", "error");
    if (!navigator.permissions?.query) return setListingLocationStatus("Select Use my current location, then approve the browser request.");
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "granted") return setListingLocationStatus("Search the address first, or select Use my current location as a starting point. Always verify the pin on the map.");
      if (permission.state === "denied") return setListingLocationStatus("Location is blocked for " + location.hostname + ". Open the padlock/site settings beside the address, change Location to Allow, reload, then select Use my current location.", "error");
      setListingLocationStatus("Select Use my current location, then choose Allow when your browser asks.");
    } catch (_) { setListingLocationStatus("Select Use my current location, then approve the browser request."); }
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
      if (!Number.isFinite(accuracy) || accuracy > 10000) throw new Error("Location accuracy is too low. Move near a window, disable any VPN, or use a phone at the service address and retry.");
      state.listingLocationAccuracy = Math.round(accuracy); state.listingLocationSource = "device";
      setListingMapPin(latitude, longitude, "device", accuracy, true);
      setListingLocationStatus("Device suggested this pin (reported accuracy about " + Math.round(accuracy) + " m). Verify it on the map and move it if needed before confirming.", "ready");
    } catch (error) {
      const message = explainLocationError(error); setListingLocationStatus(message, "error");
    } finally { button.disabled = false; }
  }

  function updateManualListingLocation() {
    const form = $("listingForm"); const latitude = Number(form.elements.latitude.value); const longitude = Number(form.elements.longitude.value);
    if (!form.elements.latitude.value || !form.elements.longitude.value) return setListingLocationStatus("No complete location captured yet.");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setListingLocationStatus("Latitude must be -90 to 90 and longitude must be -180 to 180.", "error");
    state.listingLocationAccuracy = null; state.listingLocationSource = "manual";
    renderListingLocationPreview(latitude, longitude);
    setListingLocationStatus("Service location set to " + latitude.toFixed(6) + ", " + longitude.toFixed(6) + ".", "ready");
  }

  let listingsGeneration = 0;
  async function loadListings({ reset = false } = {}) {
    const generation = ++listingsGeneration;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const search = $("listingSearch").value.trim(), status = $("listingStatus").value;
    if (search) params.set("search", search); if (status) params.set("status", status); if (!reset && state.listingCursor) params.set("cursor", state.listingCursor);
    const data = await api(`/providers/me/listings?${params}`); if (generation !== listingsGeneration) return; state.listings = reset ? (data.items || []) : [...state.listings, ...(data.items || [])]; state.listingCursor = data.next_cursor || ""; state.listingHasMore = Boolean(data.has_more); renderListings(); renderOverview();
  }
  function renderListings() {
    $("listingRows").innerHTML = state.listings.length ? state.listings.map((item) => {
      const image = item.media_urls?.[0]; const canSubmit = ["draft", "rejected"].includes(item.status); const direct = ["hotel", "short_let", "car_rental", "car_wash", "mechanic", "plumber", "carpenter", "fuel_station", "food_vendor", "artisan"].includes(item.listing_type);
      return `<article class="list-row listing-row">${image ? `<img class="listing-thumb" src="${escapeHtml(image)}" alt="">` : ""}<div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(human(item.listing_type))} · ${escapeHtml(item.city)}, ${escapeHtml(item.state)} · ${item.price == null || item.attributes?.price_mode === "quote" ? "Ask for a quote" : (item.attributes?.price_mode === "from" ? "From " : "") + money(item.price, item.currency_code)}</p>${item.moderation_notes ? `<p class="moderation-note">Moderator note: ${escapeHtml(item.moderation_notes)}</p>` : ""}</div><div class="list-actions">${canSubmit ? `<button data-submit-listing="${item.id}">Submit for review</button>` : ""}${direct ? `<button class="secondary" data-availability="${item.id}" data-title="${escapeHtml(item.title)}">Add availability</button>` : ""}</div></article>`;
    }).join("") : "<p>No matching listings.</p>";
    [...$("listingRows").children].forEach((row, index) => {
      const actions = row.querySelector(".list-actions"); const item = state.listings[index];
      if (!actions || !item) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "secondary"; button.textContent = "Edit"; button.dataset.editListing = item.id;
      actions.prepend(button);
    });
    $("loadMoreListings").classList.toggle("hidden", !state.listingHasMore);
    document.querySelectorAll("[data-edit-listing]").forEach((button) => button.onclick = () => editListing(button.dataset.editListing));
    document.querySelectorAll("[data-submit-listing]").forEach((button) => button.onclick = async () => { button.disabled = true; try { await api(`/providers/me/listings/${button.dataset.submitListing}/submit`, { method: "POST" }); setMessage("Listing submitted for moderation.", true); await loadListings({ reset: true }); } catch (error) { setMessage(error.message); } finally { button.disabled = false; } });
    document.querySelectorAll("[data-availability]").forEach((button) => button.onclick = () => openAvailability(button.dataset.availability, button.dataset.title));
  }

  function editListing(id) {
    const item = state.listings.find(listing => listing.id === id); if (!item) return;
    const form = $("listingForm"); state.editingListingID = id; state.listingRetainedMediaUrls = [...(item.media_urls || [])]; renderExistingListingImages();
    ["listing_type", "title", "category", "city", "state", "address_line", "country_code", "currency_code", "price", "pricing_unit", "capacity", "contact_email", "contact_phone", "latitude", "longitude", "service_radius_km", "description"].forEach(name => {
      form.elements[name].value = item[name] ?? "";
    });
    form.elements.is_mobile_service.checked = Boolean(item.is_mobile_service);
    form.elements.is_available_now.checked = Boolean(item.is_available_now);
    form.elements.price_mode.value = item.attributes?.price_mode || (item.price == null ? "quote" : "fixed");
    form.elements.price_notes.value = item.attributes?.price_notes || "";
    setListingFormOpen(true);
    state.editingListingID = id;
    state.listingLocationAccuracy = Number.isFinite(item.attributes?.location_accuracy_m) ? Number(item.attributes.location_accuracy_m) : null;
    state.listingLocationSource = String(item.attributes?.location_source || "saved");
    setListingLocationStatus("Saved location loaded. Verify it on the map; search again, click, or drag the pin if it is not at the exact property.", "ready");
  }

  function openAvailability(id, title) { const form = $("availabilityForm"); form.reset(); form.elements.listing_id.value = id; $("availabilityTitle").textContent = `Availability · ${title}`; setMessage("", false, "availabilityMessage"); $("availabilityDialog").showModal(); }
  async function saveAvailability(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try { await api(`/providers/me/listings/${values.listing_id}/availability`, { method: "POST", body: JSON.stringify({ starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(), capacity: Number(values.capacity), status: "open" }) }); setMessage("Availability saved.", true, "availabilityMessage"); setTimeout(() => $("availabilityDialog").close(), 500); }
    catch (error) { setMessage(error.message, false, "availabilityMessage"); } finally { button.disabled = false; }
  }

  let requestsGeneration = 0;
  async function loadRequests({ reset = false } = {}) {
    const generation = ++requestsGeneration; const authToken = state.token;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const status = $("requestStatus").value, search = $("requestSearch").value.trim(); if (status) params.set("status", status); if (search) params.set("search", search); if (!reset && state.requestCursor) params.set("cursor", state.requestCursor);
    const data = await api(`/providers/me/requests?${params}`); if (generation !== requestsGeneration || authToken !== state.token) return; state.requests = reset ? (data.items || []) : [...state.requests, ...(data.items || [])]; state.requestCursor = data.next_cursor || ""; state.requestHasMore = Boolean(data.has_more); renderRequests(); renderOverview();
  }
  async function updateRequest(id, status) { try { await api(`/providers/me/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setMessage(`Request marked ${status}.`, true); await loadRequests({ reset: true }); } catch (error) { setMessage(error.message); } }
  function renderRequests() {
    const items = state.requests;
    $("requestRows").innerHTML = items.length ? items.map((item) => `<article class="list-row"><div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.listing_title)}</h3><p>${escapeHtml(human(item.request_type))} · booking for ${item.party_size} ${bookingUnit(item.listing_type, item.party_size)} · ${item.starts_at ? new Date(item.starts_at).toLocaleString() : "Provider and customer will agree on a time"}</p><p>${escapeHtml(item.message || "No message")}</p>${item.buyer ? `<p><strong>${escapeHtml(item.buyer.full_name)}</strong> · <a href="mailto:${escapeHtml(item.buyer.email)}">${escapeHtml(item.buyer.email)}</a>${item.buyer.phone ? ` · <a href="tel:${escapeHtml(item.buyer.phone)}">${escapeHtml(item.buyer.phone)}</a>` : ""}</p>` : ""}</div><div class="list-actions">${item.status === "pending" ? `<button data-request="${item.id}" data-status="accepted">Accept</button><button class="secondary" data-request="${item.id}" data-status="rejected">Reject</button>` : item.status === "accepted" ? `<button data-request="${item.id}" data-status="completed">Complete</button>` : ""}</div></article>`).join("") : "<p>No matching bookings or enquiries.</p>";
    $("loadMoreRequests").classList.toggle("hidden", !state.requestHasMore); document.querySelectorAll("[data-request]").forEach((button) => button.onclick = () => updateRequest(button.dataset.request, button.dataset.status));
  }

  let conversationsGeneration = 0;
  let conversationGeneration = 0;
  let conversationListCursor = "";
  let conversationListFlight = null;
  async function loadConversations(cursor = "") {
    if (!state.provider) return;
    const authToken = state.token;
    if (conversationListFlight?.token === authToken) return;
    const generation = ++conversationsGeneration;
    conversationListFlight = {token: authToken, generation};
    $("loadEarlierConversations").disabled = true;
    setMessage("Loading conversations...", false, "conversationListStatus");
    try {
      const data = await api(`/providers/me/conversations?limit=50${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
      if (generation !== conversationsGeneration || authToken !== state.token) return;
      const hadHistory = state.conversations.length > 0;
      const merged = new Map(); [...state.conversations, ...(data.items || [])].forEach(item => merged.set(item.id, item));
      state.conversations = [...merged.values()].sort((a,b) => b.last_message_at.localeCompare(a.last_message_at) || b.id.localeCompare(a.id));
      if (cursor || !hadHistory) conversationListCursor = data.next_cursor || "";
      $("loadEarlierConversations").classList.toggle("hidden", !conversationListCursor);
      setMessage(`${state.conversations.length} conversations shown.`, true, "conversationListStatus");
      renderConversations();
    } catch (error) {
      if (generation === conversationsGeneration && authToken === state.token) setMessage(error.message, false, "conversationListStatus");
    } finally {
      if (conversationListFlight?.generation === generation) { conversationListFlight = null; $("loadEarlierConversations").disabled = false; }
    }
  }
  $("loadEarlierConversations").addEventListener("click", () => { if (conversationListCursor) void loadConversations(conversationListCursor); });
  function renderConversations() {
    $("conversationRows").innerHTML = state.conversations.length ? state.conversations.map((item) => `<article class="list-row"><div><span class="badge">${item.unread_count ? `${item.unread_count} unread` : "Up to date"}</span><h3>${escapeHtml(item.listing_title)}</h3><p><strong>${escapeHtml(item.counterpart_name)}</strong> · ${new Date(item.last_message_at).toLocaleString()}</p><p>${escapeHtml(item.last_message || "No messages yet")}</p>${item.subscription_active ? "" : '<p class="moderation-note">Subscription inactive — replies are paused.</p>'}</div><div class="list-actions"><button type="button" data-conversation="${item.id}">Open</button></div></article>`).join("") : "<p>No buyer conversations yet.</p>";
    document.querySelectorAll("[data-conversation]").forEach((button) => button.onclick = () => openConversation(button.dataset.conversation).catch(error => setMessage(error.message, false, "conversationListStatus")));
  }
  let conversationItems = [], conversationCursor = "";
  async function openConversation(id, { cursor = "" } = {}) {
    const generation = ++conversationGeneration; const authToken = state.token;
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    const same = state.currentConversation?.id === id;
    if (!same) { conversationItems = []; conversationCursor = ""; $("conversationMessages").textContent = "Loading conversation..."; }
    state.currentConversation = conversation;
    $("conversationTitle").textContent = conversation.listing_title + " · " + conversation.counterpart_name;
    setMessage("", false, "conversationMessage");
    if (!$("conversationDialog").open) $("conversationDialog").showModal();
    const data = await api(`/providers/me/conversations/${id}/messages?limit=50${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    if (generation !== conversationGeneration || authToken !== state.token || state.currentConversation?.id !== id) return;
    const thread = $("conversationMessages"), oldHeight = thread.scrollHeight, oldTop = thread.scrollTop;
    const atBottom = !same || oldHeight - oldTop - thread.clientHeight < 100;
    conversationItems = Array.from(new Map([...(cursor ? data.items || [] : conversationItems), ...(cursor ? conversationItems : data.items || [])].map(item => [item.id, item])).values()).sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (cursor || !same) conversationCursor = data.next_cursor || "";
    $("loadEarlierConversation").classList.toggle("hidden", !conversationCursor);
    $("conversationMessages").innerHTML = conversationItems.map((item) => `<article class="alert-item ${item.sender_type === "provider" ? "unread" : ""}"><strong>${item.sender_type === "provider" ? "You" : escapeHtml(conversation.counterpart_name)}</strong><p>${escapeHtml(item.body)}</p><small>${new Date(item.created_at).toLocaleString()}</small></article>`).join("") || "<p>No messages yet.</p>";
    thread.scrollTop = cursor ? oldTop + thread.scrollHeight - oldHeight : atBottom ? thread.scrollHeight : oldTop;
    const reply = $("conversationReplyForm");
    reply.querySelector("textarea").disabled = !conversation.subscription_active;
    reply.querySelector("button").disabled = !conversation.subscription_active;
    if (!conversation.subscription_active) setMessage("Renew your subscription to reply.", false, "conversationMessage");
    if (!$("conversationDialog").open) $("conversationDialog").showModal();
    conversation.unread_count = 0;
    renderConversations();
  }
  $("loadEarlierConversation").addEventListener("click", () => { if (state.currentConversation && conversationCursor) void openConversation(state.currentConversation.id, {cursor: conversationCursor}).catch(error => setMessage(error.message, false, "conversationMessage")); });
  async function sendConversationReply(event) {
    event.preventDefault();
    if (!state.currentConversation) return;
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const message = form.elements.message.value.trim();
    if (!message) return;
    button.disabled = true;
    try {
      await api(`/providers/me/conversations/${state.currentConversation.id}/messages`, { method: "POST", body: JSON.stringify({ message }) });
      form.reset();
      await Promise.all([loadConversations(), openConversation(state.currentConversation.id)]);
    } catch (error) {
      setMessage(error.message, false, "conversationMessage");
    } finally {
      button.disabled = !state.currentConversation?.subscription_active;
    }
  }

  function renderProviderTools(provider) {
    const hasProviderProfile = Boolean(provider);
    const productsAllowed = hasProviderProfile && provider.can_sell_products !== false;
    const servicesAllowed = hasProviderProfile && provider.can_offer_services !== false;
    document.querySelectorAll("[data-provider-profile]").forEach((element) => element.classList.toggle("hidden", !hasProviderProfile));
    document.querySelectorAll("[data-product-tool]").forEach((element) => element.classList.toggle("hidden", !productsAllowed));
    document.querySelectorAll("[data-service-tool]").forEach((element) => element.classList.toggle("hidden", !servicesAllowed));
    if (!hasProviderProfile) {
      if (state.activeView !== "overview") switchView("overview");
      document.querySelector('[data-view-panel="overview"]').classList.add("hidden");
      return;
    }
    if ((!productsAllowed && ["products", "merchant-orders"].includes(state.activeView)) || (!servicesAllowed && ["listings", "requests"].includes(state.activeView))) {
      switchView("overview");
    }
    $("verificationDocumentGuidance").textContent = provider.provider_type === "product_merchant"
      ? "Upload a government ID and business registration where applicable. Names and contact details must match your account."
      : provider.provider_type === "property_host"
        ? "Upload a government ID plus proof that you own or are authorized to offer the property or accommodation."
        : "Upload a government ID plus any professional licence, qualification, business registration, or proof of address relevant to your work.";
  }

  function renderOverview() {
    const p = state.provider, verification = p?.verification_status || "Not submitted", subscription = p?.subscription?.status || "None";
    const subscriptionActive = hasProviderAccess();
    const freeLaunch = p?.subscription?.launch_access_active === true;
    const subscriptionLabel = freeLaunch ? "Free launch" : subscriptionActive ? "Active" : subscription === "active" ? "Expired" : subscription;
    $("businessName").textContent = p?.business_name || "Provider setup"; $("verificationState").textContent = human(verification); $("metricVerification").textContent = human(verification); $("metricSubscription").textContent = human(subscriptionLabel); $("metricListings").textContent = state.listings.length + state.products.length; $("metricRequests").textContent = state.requests.filter((item) => ["pending", "accepted"].includes(item.status)).length; $("providerStatus").textContent = p ? `${p.business_name} - ${human(verification)}` : "Complete provider onboarding";
    $("accountGuidance").innerHTML = !p ? "Create your provider profile to begin." : verification !== "approved" ? `<strong>Verification ${escapeHtml(verification)}.</strong> Listings remain private until an administrator approves your business and each listing.${p.verification_notes ? `<br>${escapeHtml(p.verification_notes)}` : ""}` : !subscriptionActive ? "<strong>Business verified.</strong> Choose an active monthly plan so approved listings and contact details can appear to buyers." : p.can_sell_products && p.payout_account?.status !== "active" ? "<strong>Settlement setup required.</strong> Connect the product seller's Flutterwave settlement account before products can appear to buyers." : freeLaunch ? "<strong>Ready for buyers.</strong> Free launch access is active for approved providers." : `<strong>Ready for buyers.</strong> Your verification and subscription are active${p.subscription.current_period_end ? ` until ${new Date(p.subscription.current_period_end).toLocaleDateString()}` : ""}.`;
    const settlement = $("sellerSettlement"); const payout = p?.payout_account || {};
    settlement.classList.toggle("hidden", !p?.can_sell_products);
    if (p?.can_sell_products) {
      $("payoutStatus").textContent = human(payout.status || "not_configured");
      const activePayout = payout.status === "active";
      $("payoutForm").classList.toggle("hidden", activePayout);
      $("payoutSummary").classList.toggle("hidden", !activePayout);
      if (activePayout) $("payoutSummary").innerHTML = `<strong>${escapeHtml(payout.account_name || "Verified seller")}</strong><br>${escapeHtml(payout.bank_name || "Flutterwave settlement account")} · ${escapeHtml(payout.account_number_masked || "")}<br>Atlantic Express service fee: 1%`;
      else {
        $("payoutCountry").value = String(p.country_code || "NG").toUpperCase();
        if (!state.payoutBanks.length) void loadPayoutBanks();
      }
    }
    renderPlans();
    renderProviderTools(p);
  }
  let visibleProviderRefreshing = false;
  async function refreshVisibleProviderPage() {
    if (!state.token || !state.provider || state.booting || document.hidden || visibleProviderRefreshing || document.activeElement?.matches("input,textarea,select")) return;
    const dialog = document.querySelector("dialog[open]");
    if (dialog && dialog.id !== "conversationDialog") return;
    visibleProviderRefreshing = true;
    try {
      if (state.activeView === "requests") await loadRequests({reset:true});
      else if (state.activeView === "merchant-orders") await Promise.all([loadMerchantOrders({reset:true}),loadManifests({reset:true})]);
      else if (state.activeView === "messages") { await loadConversations(); if ($("conversationDialog").open && state.currentConversation) await openConversation(state.currentConversation.id); }
      else if (state.activeView === "overview") {state.provider=await api("/providers/me"); renderOverview();}
      else if (state.activeView === "products" && $("productForm").classList.contains("hidden")) await loadProducts({reset:true});
      else if (state.activeView === "listings" && $("listingForm").classList.contains("hidden")) await loadListings({reset:true});
    } catch(error) {setMessage(error.message || "This page could not refresh. Retry when connected.");}
    finally {visibleProviderRefreshing=false;}
  }
  setInterval(() => { if (!["products","listings"].includes(state.activeView)) void refreshVisibleProviderPage(); },12000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshVisibleProviderPage(); });
  window.addEventListener("focus", () => { void refreshVisibleProviderPage(); });
  function switchView(view, { persist = true } = {}) {
    const nextView = PROVIDER_VIEWS.has(view) ? view : "overview";
    state.activeView = nextView;
    if (persist) localStorage.setItem(ACTIVE_VIEW_KEY, nextView);
    document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === nextView));
    document.querySelectorAll("[data-view-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.viewPanel !== nextView));
    void refreshVisibleProviderPage();
  }
  function resetAuthForms() {
    ["loginForm", "signupForm"].forEach((id) => {
      const form = $(id);
      form.reset();
      const submit = form.querySelector("button[type=submit]");
      if (submit) submit.disabled = false;
    });
    setMessage("", false, "loginMessage");
    setMessage("", false, "signupMessage");
  }
  function switchAuth(view, { reset = true } = {}) {
    if (reset) resetAuthForms();
    document.querySelectorAll("[data-auth-view]").forEach((b) => b.classList.toggle("active", b.dataset.authView === view));
    document.querySelectorAll("[data-auth-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.authPanel !== view));
  }

  document.querySelectorAll('input[name="provider_type"]').forEach((input) => input.addEventListener("change", (event) => {
    const isOther = event.target.value === "other";
    $("providerTypeOtherField").classList.toggle("hidden", !isOther);
    $("providerTypeOtherField").querySelector("input").required = isOther;
  }));
  $("listingPriceMode").addEventListener("change", syncListingPriceMode);
  $("refreshConversations").addEventListener("click", () => void loadConversations());
  $("closeConversation").addEventListener("click", () => $("conversationDialog").close());
  $("conversationReplyForm").addEventListener("submit", sendConversationReply);
  $("loginForm").addEventListener("submit", login); $("signupForm").addEventListener("submit", signup); $("resendVerification").addEventListener("click", resendVerification); $("signOut").addEventListener("click", signOut); $("onboardingForm").addEventListener("submit", onboard); $("payoutForm").addEventListener("submit", configurePayoutAccount); $("loadPayoutBanks").addEventListener("click", loadPayoutBanks); $("payoutCountry").addEventListener("change", () => { state.payoutBanks = []; void loadPayoutBanks(); }); $("verificationForm").addEventListener("submit", uploadVerificationDocument); $("listingForm").addEventListener("submit", saveListing); $("productForm").addEventListener("submit", saveProduct); $("availabilityForm").addEventListener("submit", saveAvailability); $("closeAvailability").addEventListener("click", () => $("availabilityDialog").close()); $("refreshSubscription").addEventListener("click", refreshSubscriptionStatus);
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
  $("productForm").elements.local_selling_price.addEventListener("input", () => deliveryEditor.refresh());
  $("productForm").elements.currency_code.addEventListener("change", () => deliveryEditor.refresh());
  $("addProductDeliveryArea").addEventListener("click", () => { try { deliveryEditor.add(); } catch (error) { setMessage(error.message, false, "productUploadProgress"); } });
  $("productSearch").addEventListener("input", debounce(() => loadProducts({ reset: true })));
  $("productStatus").addEventListener("change", () => loadProducts({ reset: true }));
  $("loadMoreProducts").addEventListener("click", () => loadProducts());
  $("refreshMerchantOrders").addEventListener("click", () => Promise.all([loadMerchantOrders({ reset: true }), loadManifests({ reset: true })]));
  $("loadMoreMerchantOrders").addEventListener("click", () => loadMerchantOrders());
  $("bulkUpdateOrders").addEventListener("click", () => void bulkUpdateMerchantOrders());
  $("useProductLocation").addEventListener("click", useCurrentProductLocation);
  $("loadMoreManifests").addEventListener("click", () => loadManifests());
  $("createManifest").addEventListener("click", createManifest);
  $("fulfillmentForm").addEventListener("submit", submitFulfillmentUpdate);
  $("closeFulfillment").addEventListener("click", () => $("fulfillmentDialog").close());
  $("useCurrentLocation").addEventListener("click", useCurrentLocation);
  $("searchListingLocation").addEventListener("click", searchListingLocation);
  $("listingLocationSearch").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void searchListingLocation(); } });
  $("listingForm").elements.latitude.addEventListener("input", updateManualListingLocation);
  $("listingForm").elements.longitude.addEventListener("input", updateManualListingLocation);
  $("listingForm").elements.listing_type.addEventListener("change", syncListingTypeFields);
  $("providerAlerts").addEventListener("click", () => { renderProviderNotifications(); $("providerAlertsDialog").showModal(); });
  $("closeProviderAlerts").addEventListener("click", () => $("providerAlertsDialog").close());
  $("markProviderAlertsRead").addEventListener("click", () => void markProviderNotificationsRead());
  $("retrySessionRestore").addEventListener("click", () => void boot());
  $("cancelSessionRestore").addEventListener("click", signOut);
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view))); document.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => switchAuth(button.dataset.authView)));
  boot().catch((error) => setMessage(error.message));
  window.watchCatalogChanges({
    url: `${API}/catalog/version`,
    enabled: () => Boolean(state.token && state.provider && !state.booting),
    refresh: async () => {
      // Refresh lists only: never reset the provider's open edit form.
      if (state.activeView === "products") await loadProducts({ reset: true });
      else if (state.activeView === "listings") await loadListings({ reset: true });
    }
  });
})();
