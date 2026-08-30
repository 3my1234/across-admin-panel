(() => {
  "use strict";
  const API = "https://atlanticexpress-api.sportbanter.online/api/v1";
  const PAGE_SIZE = 25;
  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem("atlantic.provider.token") || "",
    provider: null, plans: [], listings: [], requests: [], documents: [],
    listingCursor: "", listingHasMore: false, requestCursor: "", requestHasMore: false
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = (value) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));
  const human = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const debounce = (fn, wait = 300) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
  const setMessage = (text, ok = false, target = "portalMessage") => { const node = $(target); if (!node) return; node.textContent = text || ""; node.className = `message${ok ? " success" : ""}`; };

  async function api(path, options = {}) {
    const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `Request failed (${response.status})`);
      error.status = response.status;
      if (response.status === 401 && state.token) signOut();
      throw error;
    }
    return data;
  }

  async function login(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; setMessage("Signing in…", false, "loginMessage");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      state.token = data.access_token; localStorage.setItem("atlantic.provider.token", state.token); setMessage("", false, "loginMessage"); await boot();
    } catch (error) { setMessage(error.message, false, "loginMessage"); } finally { button.disabled = false; }
  }

  async function signup(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; setMessage("Creating your account…", false, "signupMessage");
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      const data = await api("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
      setMessage(data.message || "Account created. Verify your email, then sign in here.", true, "signupMessage"); event.currentTarget.reset();
    } catch (error) { setMessage(error.message, false, "signupMessage"); } finally { button.disabled = false; }
  }

  async function resendVerification() {
    const email = document.querySelector("#loginForm [name=email]").value.trim();
    if (!email) return setMessage("Enter your email first.", false, "loginMessage");
    try { const data = await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); setMessage(data.message || "Verification email queued.", true, "loginMessage"); }
    catch (error) { setMessage(error.message, false, "loginMessage"); }
  }

  function signOut() {
    state.token = ""; state.provider = null; state.listings = []; state.requests = []; state.documents = [];
    localStorage.removeItem("atlantic.provider.token"); $("portal").classList.add("hidden"); $("authPanel").classList.remove("hidden"); $("signOut").classList.add("hidden");
  }

  async function boot() {
    if (!state.token) return signOut();
    $("authPanel").classList.add("hidden"); $("portal").classList.remove("hidden"); $("signOut").classList.remove("hidden"); setMessage("");
    try { state.provider = await api("/providers/me"); $("onboardingCard").classList.add("hidden"); }
    catch (error) { if (error.status === 404) { state.provider = null; $("onboardingCard").classList.remove("hidden"); } else throw error; }
    await loadPlans();
    if (state.provider) await Promise.all([loadListings({ reset: true }), loadRequests({ reset: true }), loadVerificationDocuments()]);
    renderOverview();
  }

  async function onboard(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    try { await api("/providers/onboarding", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(new FormData(event.currentTarget)), country_code: "NG" }) }); setMessage("Provider profile submitted for verification.", true); await boot(); }
    catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }

  async function loadPlans() { const data = await api("/marketplace/subscription-plans"); state.plans = data.items || []; renderPlans(); }
  async function subscribe(planId) {
    if (state.provider?.verification_status !== "approved") return setMessage("Your business must be approved before subscription checkout.");
    try { const data = await api("/providers/me/subscription-checkout", { method: "POST", body: JSON.stringify({ plan_id: planId, redirect_url: location.href }) }); if (!data.checkout_link) throw new Error("Checkout link unavailable"); location.href = data.checkout_link; }
    catch (error) { setMessage(error.message); }
  }
  function renderPlans() {
    const active = state.provider?.subscription?.status === "active";
    $("plans").innerHTML = state.plans.length ? state.plans.map((plan) => `<article class="plan"><span class="eyebrow">Monthly plan</span><h3>${escapeHtml(plan.name)}</h3><strong>${money(plan.amount_ngn)}/month</strong><p>${escapeHtml(plan.description || `${plan.listing_limit} active listings`)}</p><button data-subscribe="${plan.id}" ${!state.provider || active || state.provider.verification_status !== "approved" ? "disabled" : ""}>${active ? "Subscription active" : "Choose plan"}</button></article>`).join("") : "<p>No subscription plan is available yet.</p>";
    document.querySelectorAll("[data-subscribe]").forEach((button) => button.onclick = () => subscribe(button.dataset.subscribe));
  }

  async function uploadImages(files) {
    if (files.length > 20) throw new Error("A listing can have at most 20 images.");
    const urls = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]; setMessage(`Uploading image ${index + 1} of ${files.length}...`, false, "uploadProgress");
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
    const button = event.currentTarget.querySelector("button[type=submit]");
    const file = $("verificationFile").files[0];
    if (!file) return setMessage("Choose a document first.", false, "verificationMessage");
    button.disabled = true;
    try {
      setMessage("Uploading document...", false, "verificationMessage");
      const signed = await api("/providers/me/uploads/presign", { method: "POST", body: JSON.stringify({ filename: file.name, mime_type: file.type, purpose: "verification" }) });
      const put = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Document upload failed (${put.status})`);
      await api("/providers/me/verification-documents", { method: "POST", body: JSON.stringify({ document_type: new FormData(event.currentTarget).get("document_type"), document_url: signed.view_url }) });
      event.currentTarget.reset(); setMessage("Document submitted for review.", true, "verificationMessage"); await loadVerificationDocuments();
    } catch (error) { setMessage(error.message, false, "verificationMessage"); } finally { button.disabled = false; }
  }

  async function saveListing(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)); const files = [...$("listingImages").files];
      if (!files.length) throw new Error("Add at least one clear listing image.");
      const media_urls = await uploadImages(files);
      const payload = { ...values, price: values.price === "" ? null : Number(values.price), capacity: Number(values.capacity || 1), currency_code: "NGN", country_code: "NG", media_urls, attributes: {} };
      await api("/providers/me/listings", { method: "POST", body: JSON.stringify(payload) });
      event.currentTarget.reset(); event.currentTarget.classList.add("hidden"); setMessage("Draft saved. Submit it when the details are ready for review.", true); setMessage("", false, "uploadProgress"); await loadListings({ reset: true });
    } catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }

  async function loadListings({ reset = false } = {}) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) }); const search = $("listingSearch").value.trim(), status = $("listingStatus").value;
    if (search) params.set("search", search); if (status) params.set("status", status); if (!reset && state.listingCursor) params.set("cursor", state.listingCursor);
    const data = await api(`/providers/me/listings?${params}`); state.listings = reset ? (data.items || []) : [...state.listings, ...(data.items || [])]; state.listingCursor = data.next_cursor || ""; state.listingHasMore = Boolean(data.has_more); renderListings(); renderOverview();
  }
  function renderListings() {
    $("listingRows").innerHTML = state.listings.length ? state.listings.map((item) => {
      const image = item.media_urls?.[0]; const canSubmit = ["draft", "rejected"].includes(item.status); const direct = ["hotel", "short_let", "car_rental", "car_wash"].includes(item.listing_type);
      return `<article class="list-row listing-row">${image ? `<img class="listing-thumb" src="${escapeHtml(image)}" alt="">` : ""}<div><span class="badge">${escapeHtml(human(item.status))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(human(item.listing_type))} · ${escapeHtml(item.city)}, ${escapeHtml(item.state)} · ${item.price == null ? "Enquiry" : money(item.price)}</p></div><div class="list-actions">${canSubmit ? `<button data-submit-listing="${item.id}">Submit for review</button>` : ""}${direct ? `<button class="secondary" data-availability="${item.id}" data-title="${escapeHtml(item.title)}">Add availability</button>` : ""}</div></article>`;
    }).join("") : "<p>No matching listings.</p>";
    $("loadMoreListings").classList.toggle("hidden", !state.listingHasMore);
    document.querySelectorAll("[data-submit-listing]").forEach((button) => button.onclick = async () => { button.disabled = true; try { await api(`/providers/me/listings/${button.dataset.submitListing}/submit`, { method: "POST" }); setMessage("Listing submitted for moderation.", true); await loadListings({ reset: true }); } catch (error) { setMessage(error.message); } finally { button.disabled = false; } });
    document.querySelectorAll("[data-availability]").forEach((button) => button.onclick = () => openAvailability(button.dataset.availability, button.dataset.title));
  }

  function openAvailability(id, title) { const form = $("availabilityForm"); form.reset(); form.elements.listing_id.value = id; $("availabilityTitle").textContent = `Availability · ${title}`; setMessage("", false, "availabilityMessage"); $("availabilityDialog").showModal(); }
  async function saveAvailability(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
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
    $("businessName").textContent = p?.business_name || "Provider setup"; $("verificationState").textContent = human(verification); $("metricVerification").textContent = human(verification); $("metricSubscription").textContent = human(subscription); $("metricListings").textContent = state.listings.length; $("metricRequests").textContent = state.requests.filter((item) => ["pending", "accepted"].includes(item.status)).length; $("providerStatus").textContent = p ? `${p.business_name} - ${human(verification)}` : "Complete provider onboarding";
    $("accountGuidance").innerHTML = !p ? "Create your provider profile to begin." : verification !== "approved" ? `<strong>Verification ${escapeHtml(verification)}.</strong> Listings remain private until an administrator approves your business and each listing.${p.verification_notes ? `<br>${escapeHtml(p.verification_notes)}` : ""}` : subscription !== "active" ? "<strong>Business verified.</strong> Choose an active monthly plan so approved listings and contact details can appear to buyers." : `<strong>Ready for buyers.</strong> Your verification and subscription are active${p.subscription.current_period_end ? ` until ${new Date(p.subscription.current_period_end).toLocaleDateString()}` : ""}.`;
    renderPlans();
  }
  function switchView(view) { document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view)); document.querySelectorAll("[data-view-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.viewPanel !== view)); }
  function switchAuth(view) { document.querySelectorAll("[data-auth-view]").forEach((b) => b.classList.toggle("active", b.dataset.authView === view)); document.querySelectorAll("[data-auth-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.authPanel !== view)); }

  $("loginForm").addEventListener("submit", login); $("signupForm").addEventListener("submit", signup); $("resendVerification").addEventListener("click", resendVerification); $("signOut").addEventListener("click", signOut); $("onboardingForm").addEventListener("submit", onboard); $("verificationForm").addEventListener("submit", uploadVerificationDocument); $("listingForm").addEventListener("submit", saveListing); $("availabilityForm").addEventListener("submit", saveAvailability); $("closeAvailability").addEventListener("click", () => $("availabilityDialog").close());
  $("toggleListingForm").addEventListener("click", () => $("listingForm").classList.toggle("hidden")); $("listingSearch").addEventListener("input", debounce(() => loadListings({ reset: true }))); $("listingStatus").addEventListener("change", () => loadListings({ reset: true })); $("loadMoreListings").addEventListener("click", () => loadListings());
  $("requestSearch").addEventListener("input", debounce(() => loadRequests({ reset: true }))); $("requestStatus").addEventListener("change", () => loadRequests({ reset: true })); $("loadMoreRequests").addEventListener("click", () => loadRequests()); $("refreshPortal").addEventListener("click", boot); $("refreshRequests").addEventListener("click", () => loadRequests({ reset: true }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view))); document.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => switchAuth(button.dataset.authView)));
  boot().catch((error) => setMessage(error.message));
})();
