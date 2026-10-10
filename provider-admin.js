/* Provider marketplace administration. Loaded after the main admin bundle. */
(() => {
  const PAGE_SIZE = 25;
  const originalAllowedTabsForRole = allowedTabsForRole;
  allowedTabsForRole = (role = state.role) => {
    const tabs = originalAllowedTabsForRole(role);
    const withFulfilment = tabs.includes("merchant-fulfillments") ? tabs : [...tabs, "merchant-fulfillments"];
    return ["super_admin", "catalog_admin"].includes(role) && !withFulfilment.includes("providers") ? [...withFulfilment.slice(0, 2), "providers", ...withFulfilment.slice(2)] : withFulfilment;
  };
  const originalLoadTabData = loadTabData;
  loadTabData = (tab, options = {}) => {
    if (tab === "providers") {
      $("providerBillingSection")?.classList.toggle("hidden", state.role !== "super_admin");
      if (state.role === "super_admin") void loadProviderBilling();
      return Promise.all([
        loadProviders({ reset: true }),
        loadProviderListings({ reset: true }),
        loadMerchantProducts({ reset: true }),
        ...(state.role === "super_admin" ? [loadProviderAccess()] : [])
      ]);
    }
    return tab === "merchant-fulfillments" ? loadMerchantFulfillments({ reset: true }) : originalLoadTabData(tab, options);
  };

  state.providers = [];
  state.providerListings = [];
  state.providerCursor = "";
  state.providerHasMore = false;
  state.providerListingCursor = "";
  state.providerListingHasMore = false;
  state.merchantProducts = [];
  state.merchantProductCursor = "";
  state.merchantProductHasMore = false;
  state.merchantFulfillments = [];
  state.merchantFulfillmentCursor = "";
  state.merchantFulfillmentHasMore = false;
  state.providerPlans = [];
  state.providerAccess = null;
  state.gatewaySubscriptions = [];
  let billingLoadedAt = 0;
  let billingLoadPromise = null;
  let productLoadRevision = 0, listingLoadRevision = 0;

  function loadProviderBilling() {
    if (billingLoadPromise) return billingLoadPromise;
    if (Date.now() - billingLoadedAt < 60000) return Promise.resolve();
    billingLoadPromise = Promise.allSettled([loadProviderPlans().then(() => loadProviderPlans(true)), loadGatewaySubscriptions()]).finally(() => {
      billingLoadedAt = Date.now();
      billingLoadPromise = null;
    });
    return billingLoadPromise;
  }

  async function loadGatewaySubscriptions(fresh = false) {
    setText("gatewaySubscriptionsStatus", "Checking active Flutterwave renewals...");
    try {
      const data = await request(`/api/v1/admin/provider-gateway-subscriptions${fresh ? "?refresh=true" : ""}`);
      state.gatewaySubscriptions = data.items || [];
      renderGatewaySubscriptions();
      setText("gatewaySubscriptionsStatus", `${state.gatewaySubscriptions.length} active recurring subscription${state.gatewaySubscriptions.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setText("gatewaySubscriptionsStatus", error.message);
    }
  }

  function renderGatewaySubscriptions() {
    const table = $("gatewaySubscriptionsTable");
    table.innerHTML = `<thead><tr><th>Subscription</th><th>Customer</th><th>Flutterwave plan</th><th>Recurring amount</th><th>Action</th></tr></thead><tbody>${state.gatewaySubscriptions.map((item) => `<tr><td>${escapeHtml(String(item.id))}</td><td>${escapeHtml(item.customer_email || "Unavailable")}</td><td>${escapeHtml(String(item.plan_id))}</td><td>NGN ${Number(item.amount_ngn || 0).toLocaleString()} / month</td><td><button type="button" class="danger-button" data-stop-renewal="${item.id}">Stop renewal</button></td></tr>`).join("") || '<tr><td colspan="5">No active renewals found for linked provider plans.</td></tr>'}</tbody>`;
    table.querySelectorAll("[data-stop-renewal]").forEach((button) => button.addEventListener("click", () => cancelGatewaySubscription(button.dataset.stopRenewal)));
  }

  async function cancelGatewaySubscription(id) {
    const subscription = state.gatewaySubscriptions.find((item) => String(item.id) === String(id));
    if (!subscription || !confirm(`Stop future Flutterwave renewals for subscription ${id} (${subscription.customer_email || "unknown customer"})? This does not refund earlier charges. Paid access will require a new subscription after the free period.`)) return;
    const button = document.querySelector(`[data-stop-renewal="${id}"]`);
    button.disabled = true;
    setText("gatewaySubscriptionsStatus", `Cancelling subscription ${id} with Flutterwave...`);
    try {
      await request(`/api/v1/admin/provider-gateway-subscriptions/${id}/cancel`, { method: "POST" });
      await loadGatewaySubscriptions(true);
      setText("gatewaySubscriptionsStatus", `Flutterwave confirmed subscription ${id} is no longer active.`);
    } catch (error) {
      setText("gatewaySubscriptionsStatus", error.message);
      button.disabled = false;
    }
  }

  function localDateTimeValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderProviderAccess() {
    const access = state.providerAccess;
    if (!access) return;
    $("providerAccessMode").value = access.enforced ? "paid" : "free";
    $("providerPaidStartAt").value = access.enforced ? localDateTimeValue(access.start_at) : "";
    $("providerPaidStartAt").disabled = !access.enforced;
    const schedule = access.enforced && access.start_at ? ` Paid billing starts ${new Date(access.start_at).toLocaleString()}.` : "";
    setText("providerAccessStatus", `${access.required ? "Paid access is active." : "Provider access is free now."}${schedule} Setting source: ${access.source}.`);
  }

  async function loadProviderAccess() {
    try {
      state.providerAccess = await request("/api/v1/admin/provider-subscription-access");
      renderProviderAccess();
    } catch (error) {
      setText("providerAccessStatus", error.message);
    }
  }

  async function saveProviderAccess(event) {
    event.preventDefault();
    const enforced = $("providerAccessMode").value === "paid";
    const localStart = $("providerPaidStartAt").value;
    const parsedStart = enforced && localStart ? new Date(localStart) : null;
    if (parsedStart && Number.isNaN(parsedStart.getTime())) return setText("providerAccessStatus", "Choose a valid paid start time.");
    const message = enforced
      ? "Enable paid provider access? Approved providers without an active subscription will lose public listing visibility and messaging until they subscribe. Transfer-only plans are available without a recurring plan ID; linked card plans must match Flutterwave."
      : "Enable free provider access? This stops new subscription checkout in the app, but existing Flutterwave recurring subscriptions will keep charging until separately cancelled.";
    if (!confirm(message)) return;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setText("providerAccessStatus", "Saving provider access...");
    try {
      state.providerAccess = await request("/api/v1/admin/provider-subscription-access", { method: "PUT", body: { enforced, start_at: parsedStart ? parsedStart.toISOString() : null } });
      renderProviderAccess();
    } catch (error) {
      setText("providerAccessStatus", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function queryParams(searchID, statusID, cursor) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const search = ($(searchID)?.value || "").trim();
    const status = $(statusID)?.value || "";
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    return params;
  }

  async function loadProviders({ reset = false } = {}) {
    setText("providerStatus", "Loading providers...");
    try {
      const data = await request(`/api/v1/admin/providers?${queryParams("providerSearch", "providerVerificationStatus", reset ? "" : state.providerCursor)}`);
      state.providers = reset ? (data.items || []) : [...state.providers, ...(data.items || [])];
      state.providerCursor = data.next_cursor || ""; state.providerHasMore = Boolean(data.has_more);
      renderProviders(); setText("providerStatus", `${state.providers.length} providers loaded.`);
    } catch (error) { setText("providerStatus", error.message); }
  }

  async function loadProviderListings({ reset = false } = {}) {
    const revision = ++listingLoadRevision;
    setText("providerListingStatus", "Loading listings...");
    try {
      const data = await request(`/api/v1/admin/provider-listings?${queryParams("providerListingSearch", "providerListingModerationStatus", reset ? "" : state.providerListingCursor)}`);
      if (revision !== listingLoadRevision) return false;
      state.providerListings = reset ? (data.items || []) : [...state.providerListings, ...(data.items || [])];
      state.providerListingCursor = data.next_cursor || ""; state.providerListingHasMore = Boolean(data.has_more);
      renderProviderListings(); setText("providerListingStatus", `${state.providerListings.length} listings loaded.`);
      return true;
    } catch (error) { if (revision === listingLoadRevision) setText("providerListingStatus", error.message); return false; }
  }

  async function loadMerchantProducts({ reset = false } = {}) {
    const revision = ++productLoadRevision;
    setText("merchantProductModerationStatus", "Loading merchant products...");
    try {
      const data = await request(`/api/v1/admin/merchant-products?${queryParams("merchantProductSearch", "merchantProductStatus", reset ? "" : state.merchantProductCursor)}`);
      if (revision !== productLoadRevision) return false;
      state.merchantProducts = reset ? (data.items || []) : [...state.merchantProducts, ...(data.items || [])];
      state.merchantProductCursor = data.page?.next_cursor || ""; state.merchantProductHasMore = Boolean(data.page?.has_more);
      renderMerchantProducts(); setText("merchantProductModerationStatus", `${state.merchantProducts.length} merchant products loaded.`);
      return true;
    } catch (error) { if (revision === productLoadRevision) setText("merchantProductModerationStatus", error.message); return false; }
  }

  function renderProviders() {
    $("providersTable").innerHTML = `<thead><tr><th>Business</th><th>Contact</th><th>Location</th><th>Verification</th><th>Subscription</th><th>Action</th></tr></thead><tbody>${state.providers.map((item) => `<tr>
      <td><strong>${escapeHtml(item.business_name)}</strong><br><span class="muted">${escapeHtml((item.provider_type || "mixed").replaceAll("_", " "))}${item.provider_type_other ? ` — ${escapeHtml(item.provider_type_other)}` : ""}</span><br><span class="muted">${format(item.created_at)}</span></td>
      <td>${escapeHtml(item.contact_email)}<br>${escapeHtml(item.contact_phone)}</td><td>${escapeHtml([item.city, item.state].filter(Boolean).join(", ") || "-")}</td>
      <td><span class="status-pill ${item.verification_status === "approved" ? "active" : item.verification_status === "rejected" ? "inactive" : ""}">${escapeHtml(item.verification_status)}</span></td>
      <td>${escapeHtml(item.subscription_status || "none")}${item.subscription_ends_at ? `<br><span class="muted">to ${format(item.subscription_ends_at)}</span>` : ""}</td>
      <td class="table-actions"><button data-provider-docs="${item.id}" class="secondary-button">Review documents</button><button data-provider-status="approved" data-id="${item.id}" class="secondary-button">Approve</button><button data-provider-status="rejected" data-id="${item.id}" class="danger-button">Reject</button><button data-provider-status="suspended" data-id="${item.id}" class="danger-button">Suspend</button></td>
    </tr><tr id="provider-docs-${item.id}" class="hidden"><td colspan="6"></td></tr>`).join("") || `<tr><td colspan="6">No matching providers.</td></tr>`}</tbody>`;
    $("loadMoreProvidersButton")?.classList.toggle("hidden", !state.providerHasMore);
    $("providersTable").querySelectorAll("[data-provider-status]").forEach((button) => button.addEventListener("click", () => moderateProvider(button.dataset.id, button.dataset.providerStatus)));
    $("providersTable").querySelectorAll("[data-provider-docs]").forEach((button) => button.addEventListener("click", () => loadProviderDocuments(button.dataset.providerDocs)));
  }

  async function loadProviderDocuments(providerID) {
    const row = $(`provider-docs-${providerID}`); const cell = row.querySelector("td"); row.classList.remove("hidden"); cell.textContent = "Loading documents...";
    try {
      const data = await request(`/api/v1/admin/providers/${providerID}/verification-documents`);
      cell.innerHTML = (data.items || []).map((doc) => `<article class="mobile-card"><strong>${escapeHtml(doc.document_type.replaceAll("_", " "))}</strong> - ${escapeHtml(doc.status)} <a href="${escapeHtml(doc.document_url)}" target="_blank" rel="noopener">Open</a><div class="table-actions"><button data-review-doc="${doc.id}" data-provider="${providerID}" data-status="approved" class="secondary-button">Approve document</button><button data-review-doc="${doc.id}" data-provider="${providerID}" data-status="rejected" class="danger-button">Reject document</button></div>${doc.review_notes ? `<p>${escapeHtml(doc.review_notes)}</p>` : ""}</article>`).join("") || "No documents uploaded.";
      cell.querySelectorAll("[data-review-doc]").forEach((button) => button.onclick = () => reviewDocument(button.dataset.provider, button.dataset.reviewDoc, button.dataset.status));
    } catch (error) { cell.textContent = error.message; }
  }

  async function reviewDocument(providerID, documentID, status) {
    const notes = prompt(`${status} document. Add a note (optional):`, ""); if (notes === null) return;
    try { await request(`/api/v1/admin/providers/${providerID}/verification-documents/${documentID}`, { method: "PATCH", body: { status, notes } }); await loadProviderDocuments(providerID); }
    catch (error) { setText("providerStatus", error.message); }
  }
  async function moderateProvider(id, status) {
    const notes = prompt(`${status} provider. Add an internal note (optional):`, ""); if (notes === null) return;
    try { await request(`/api/v1/admin/providers/${id}/verification`, { method: "PATCH", body: { status, notes } }); await loadProviders({ reset: true }); }
    catch (error) { setText("providerStatus", error.message); }
  }

  function renderProviderListings() {
    $("providerListingsTable").innerHTML = `<thead><tr><th>Images</th><th>Listing</th><th>Provider</th><th>Service</th><th>Location</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.providerListings.map((item) => `<tr>
      <td><div class="moderation-media">${(item.media_urls || []).slice(0, 4).map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img class="product-image" src="${escapeHtml(url)}" alt="${escapeHtml(item.title)} image ${index + 1}" loading="lazy"></a>`).join("") || '<span class="muted">No image</span>'}</div></td>
      <td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.description || "").slice(0, 100)}</span></td><td>${escapeHtml(item.provider_name)}</td><td>${escapeHtml(item.listing_type.replaceAll("_", " "))}</td>
      <td>${escapeHtml([item.city, item.state].filter(Boolean).join(", ") || "-")}</td><td>${item.price == null || item.attributes?.price_mode === "quote" ? "Ask for a quote" : `${item.attributes?.price_mode === "from" ? "From " : ""}${escapeHtml(item.currency_code)} ${format(item.price)} / ${escapeHtml(item.pricing_unit || "unit")}`}</td>
      <td><span class="status-pill ${item.status === "approved" ? "active" : item.status === "rejected" ? "inactive" : ""}">${escapeHtml(item.status)}</span></td><td class="table-actions"><button data-listing-status="approved" data-id="${item.id}" class="secondary-button">Approve</button><button data-listing-status="rejected" data-id="${item.id}" class="danger-button">Reject</button><button data-listing-status="suspended" data-id="${item.id}" class="danger-button">Suspend</button></td>
    </tr>`).join("") || `<tr><td colspan="8">No matching listings.</td></tr>`}</tbody>`;
    $("loadMoreProviderListingsButton")?.classList.toggle("hidden", !state.providerListingHasMore);
    $("providerListingsTable").querySelectorAll("[data-listing-status]").forEach((button) => button.addEventListener("click", () => moderateListingVerified(button)));
  }
  async function moderateListing(id, status) {
    const notes = prompt(`${status} listing. Add an internal note (optional):`, ""); if (notes === null) return;
    try { await request(`/api/v1/admin/provider-listings/${id}/moderation`, { method: "PATCH", body: { status, notes } }); await loadProviderListings({ reset: true }); }
    catch (error) { setText("providerListingStatus", error.message); }
  }
  async function moderateListingVerified(button) {
    const id = button.dataset.id; const status = button.dataset.listingStatus;
    const notes = prompt(status + " listing. Add an internal note (optional):", ""); if (notes === null) return;
    const buttons = [...document.querySelectorAll("[data-listing-status]")].filter(item => item.dataset.id === id); buttons.forEach(item => { item.disabled = true; });
    try {
      const result = await request("/api/v1/admin/provider-listings/" + id + "/moderation", { method: "PATCH", body: { status, notes } });
      if (result.id !== id || result.status !== status) throw new Error("The server did not confirm this moderation change.");
      await loadProviderListings({ reset: true });
      setText("providerListingStatus", result.title + " (listing " + id.slice(0, 8) + ") is confirmed " + status + ".");
    } catch (error) { setText("providerListingStatus", error.message); }
    finally { buttons.forEach(item => { item.disabled = false; }); }
  }
  function merchantBuyerPriceSummary(item) {
    return (item.delivery_areas || []).map(area => {
      const itemPrice = Number(area.delivered_price) - Number(area.delivery_fee || 0);
      const mismatch = area.currency_code === item.currency_code && itemPrice !== Number(item.local_selling_price);
      return `<br><span class="${mismatch ? "error" : "muted"}">Buyer ${escapeHtml([area.country_code, area.state, area.city].filter(Boolean).join(" / "))}: ${escapeHtml(area.currency_code)} ${itemPrice.toFixed(2)} + ${Number(area.delivery_fee || 0).toFixed(2)} delivery${mismatch ? " — separate from main price" : ""}</span>`;
    }).join("");
  }
  function renderMerchantProducts() {
    $("merchantProductsTable").innerHTML = `<thead><tr><th>Images</th><th>Product</th><th>Merchant</th><th>Price</th><th>Stock</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.merchantProducts.map((item) => `<tr><td><div class="moderation-media">${(item.image_urls || []).slice(0, 4).map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img class="product-image" src="${escapeHtml(url)}" alt="${escapeHtml(item.title)} image ${index + 1}" loading="lazy"></a>`).join("") || '<span class="muted">No image</span>'}</div></td><td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.sku)}</span><br><span class="muted">${escapeHtml(item.description || "").slice(0, 100)}</span></td><td>${escapeHtml(item.provider_name)}</td><td>${escapeHtml(item.currency_code)} ${format(item.local_selling_price)}${item.compare_at_price ? `<br><span class="muted">Was NGN ${format(item.compare_at_price)}</span>` : ""}${merchantBuyerPriceSummary(item)}</td><td>${item.inventory_count}</td><td><span class="status-pill ${item.moderation_status === "approved" ? "active" : item.moderation_status === "rejected" ? "inactive" : ""}">${escapeHtml(item.moderation_status)}</span></td><td class="table-actions"><button data-product-status="approved" data-id="${item.id}" class="secondary-button">Approve</button><button data-product-status="rejected" data-id="${item.id}" class="danger-button">Reject</button><button data-product-status="suspended" data-id="${item.id}" class="danger-button">Suspend</button></td></tr>`).join("") || `<tr><td colspan="7">No matching merchant products.</td></tr>`}</tbody>`;
    $("loadMoreMerchantProductsButton")?.classList.toggle("hidden", !state.merchantProductHasMore);
    $("merchantProductsTable").querySelectorAll("[data-product-status]").forEach(button => button.onclick = () => moderateMerchantProductVerified(button));
  }
  async function moderateMerchantProductVerified(button) {
    const id = button.dataset.id; const status = button.dataset.productStatus;
    const product = state.merchantProducts.find(item => item.id === id);
    const separate = (product?.delivery_areas || []).filter(area => area.currency_code === product.currency_code && Number(area.delivered_price) - Number(area.delivery_fee || 0) !== Number(product.local_selling_price));
    if (status === "approved" && separate.length && !confirm(`Buyers will pay separate destination item prices (${separate.map(area => `${area.country_code}: ${area.currency_code} ${(Number(area.delivered_price) - Number(area.delivery_fee || 0)).toFixed(2)}`).join(", ")}), rather than the main price ${product.currency_code} ${product.local_selling_price}. Approve those exact buyer prices? Cancel and ask the provider to use the main price if this is unintended.`)) return;
    const notes = prompt(`${status} product. Add a moderation note (optional):`, ""); if (notes === null) return;
    const buttons = [...document.querySelectorAll("[data-product-status]")].filter(item => item.dataset.id === id); buttons.forEach(item => { item.disabled = true; });
    try {
      const result = await request(`/api/v1/admin/merchant-products/${id}/moderation`, { method: "PATCH", body: { status, notes } });
      if (result.id !== id || result.status !== status) throw new Error("The server did not confirm this product moderation change.");
      await loadMerchantProducts({ reset: true });
      setText("merchantProductModerationStatus", result.title + " (product " + id.slice(0, 8) + ") is confirmed " + status + ".");
    }
    catch (error) { setText("merchantProductModerationStatus", error.message); }
    finally { buttons.forEach(item => { item.disabled = false; }); }
  }

  async function loadMerchantFulfillments({ reset = false } = {}) {
    setText("merchantFulfillmentStatus", "Loading merchant fulfilment...");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const search = ($("merchantFulfillmentSearch")?.value || "").trim();
    const route = $("merchantFulfillmentRoute")?.value || "";
    const status = ($("merchantFulfillmentStatusFilter")?.value || "").trim();
    if (search) params.set("search", search);
    if (route) params.set("route_type", route);
    if (status) params.set("status", status);
    if (!reset && state.merchantFulfillmentCursor) params.set("cursor", state.merchantFulfillmentCursor);
    try {
      const data = await request(`/api/v1/admin/merchant-fulfillments?${params}`);
      state.merchantFulfillments = reset ? (data.items || []) : [...state.merchantFulfillments, ...(data.items || [])];
      state.merchantFulfillmentCursor = data.page?.next_cursor || "";
      state.merchantFulfillmentHasMore = Boolean(data.page?.has_more);
      renderMerchantFulfillments();
      setText("merchantFulfillmentStatus", `${state.merchantFulfillments.length} fulfilments loaded.`);
    } catch (error) { setText("merchantFulfillmentStatus", error.message); }
  }

  function renderMerchantFulfillments() {
    const table = $("merchantFulfillmentsTable");
    if (!table) return;
    table.innerHTML = `<thead><tr><th>Order</th><th>Seller</th><th>Route</th><th>Status</th><th>Carrier / tracking</th><th>Location</th><th>Updated</th></tr></thead><tbody>${state.merchantFulfillments.map((item) =>
      `<tr><td><strong>${escapeHtml(item.package_label || item.order_id)}</strong></td><td>${escapeHtml(item.provider_name || "-")}</td><td>${escapeHtml((item.route_type || "").replaceAll("_", " "))}</td><td><span class="status-pill">${escapeHtml((item.status || "").replaceAll("_", " "))}</span></td><td>${escapeHtml(item.carrier || "Seller managed")}<br><span class="muted">${escapeHtml(item.tracking_number || "No tracking number")}</span></td><td>${escapeHtml(item.current_location || "-")}</td><td>${format(item.updated_at)}</td></tr>`
    ).join("") || `<tr><td colspan="7">No matching seller fulfilments.</td></tr>`}</tbody>`;
    $("loadMoreMerchantFulfillmentsButton")?.classList.toggle("hidden", !state.merchantFulfillmentHasMore);
  }
  async function saveProviderPlan(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector('button[type="submit"]');
    const form = new FormData(formElement);
    setText("providerPlanStatus", "Saving subscription plan...");
    if (submitButton) submitButton.disabled = true;
    try {
      await request("/api/v1/admin/provider-subscription-plans", { method: "POST", body: { code: form.get("code"), name: form.get("name"), description: form.get("description"), amount_ngn: Number(form.get("amount_ngn")), listing_limit: Number(form.get("listing_limit")), flutterwave_plan_id: form.get("flutterwave_plan_id") ? Number(form.get("flutterwave_plan_id")) : null, features: { verified_badge: true, public_contact: true } } });
      setText("providerPlanStatus", "Subscription plan saved. Providers can now refresh their Subscription page.");
      formElement.reset();
      await loadProviderPlans(true);
    } catch (error) {
      setText("providerPlanStatus", error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function loadProviderPlans(verify = false) {
    setText("providerPlansStatus", verify ? "Checking Flutterwave plan prices..." : "Loading subscription plans...");
    try {
      const data = await request(`/api/v1/admin/provider-subscription-plans${verify ? "?verify=true" : ""}`);
      state.providerPlans = data.items || [];
      renderProviderPlans();
      setText("providerPlansStatus", `${state.providerPlans.filter((plan) => plan.is_active).length} active subscription plan${state.providerPlans.filter((plan) => plan.is_active).length === 1 ? "" : "s"}.${verify ? " Flutterwave prices checked." : " Checking Flutterwave prices in the background."}`);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    }
  }

  function renderProviderPlans() {
    const table = $("providerPlansTable");
    if (!table) return;
    table.innerHTML = `<thead><tr><th>Plan</th><th>Price</th><th>Listings</th><th>Flutterwave</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.providerPlans.map((plan) => `<tr>
      <td><strong>${escapeHtml(plan.name)}</strong><br><span class="muted">${escapeHtml(plan.code)}</span></td>
      <td>NGN ${Number(plan.amount_ngn || 0).toLocaleString()} / ${escapeHtml(plan.billing_interval || "month")}${plan.is_active && plan.gateway_plan_status === "unavailable" ? '<br><span class="muted">Flutterwave price could not be checked</span>' : plan.is_active && plan.gateway_price_matches === false && plan.gateway_plan_amount_ngn != null ? `<br><strong>Flutterwave: NGN ${Number(plan.gateway_plan_amount_ngn).toLocaleString()} — mismatch</strong>` : ""}</td>
      <td>${Number(plan.listing_limit || 0).toLocaleString()}</td>
      <td>${escapeHtml(String(plan.flutterwave_plan_id || "Not configured"))}</td>
      <td><span class="status-pill ${plan.is_active ? "active" : "inactive"}">${plan.is_active ? "ACTIVE" : "REMOVED"}</span></td>
      <td>${plan.is_active ? `<label>New monthly price NGN <input type="number" min="1" step="1" value="${Number(plan.amount_ngn || 0)}" data-new-price="${plan.id}" style="max-width:7rem" /></label><label>Existing Flutterwave plan ID (optional)<input type="number" min="1" step="1" data-link-plan="${plan.id}" placeholder="Plan ID" style="max-width:8rem" /></label><button type="button" data-change-price="${plan.id}">Save price / link plan</button><button type="button" class="danger-button" data-deactivate-plan="${plan.id}">Remove from sale</button>` : "-"}</td>
    </tr>`).join("") || `<tr><td colspan="6">No subscription plans configured.</td></tr>`}</tbody>`;
    table.querySelectorAll("[data-deactivate-plan]").forEach((button) => button.addEventListener("click", () => deactivateProviderPlan(button.dataset.deactivatePlan)));
    table.querySelectorAll("[data-change-price]").forEach((button) => button.addEventListener("click", () => changeProviderPlanPrice(button.dataset.changePrice)));
  }

  async function changeProviderPlanPrice(planID) {
    const input = document.querySelector(`[data-new-price="${planID}"]`);
    const amount = Number(input?.value);
    const planIDText = document.querySelector(`[data-link-plan="${planID}"]`)?.value.trim() || "";
    const gatewayID = planIDText ? Number(planIDText) : null;
    if (gatewayID !== null && (!Number.isSafeInteger(gatewayID) || gatewayID < 1)) return setText("providerPlansStatus", "Enter a valid positive Flutterwave plan ID.");
    if (!Number.isSafeInteger(amount) || amount < 1) return setText("providerPlansStatus", "Enter a positive whole-naira monthly price.");
    if (!confirm(`Set the monthly price to NGN ${amount.toLocaleString()} for future provider signups? ${gatewayID ? `Link existing Flutterwave plan ${gatewayID} after verifying its price and monthly interval.` : "The portal will reuse a matching Flutterwave plan or create a new one."} Existing subscriptions keep their current price.`)) return;
    const button = document.querySelector(`[data-change-price="${planID}"]`);
    button.disabled = true;
    setText("providerPlansStatus", "Matching the monthly price with Flutterwave...");
    try {
      const result = await request(`/api/v1/admin/provider-subscription-plans/${planID}/price`, { method: "POST", body: { amount_ngn: amount, ...(gatewayID ? {flutterwave_plan_id:gatewayID} : {}) } });
      await loadProviderPlans(true);
      setText("providerPlansStatus", `Price saved at NGN ${amount.toLocaleString()}/month; Flutterwave plan ${result.flutterwave_plan_id} is linked for future subscriptions. Existing subscriptions were not repriced.`);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function deactivateProviderPlan(planID) {
    if (!confirm("Remove this plan from sale? Existing paid subscriptions will remain valid until their paid period ends.")) return;
    setText("providerPlansStatus", "Removing subscription plan from sale...");
    try {
      await request(`/api/v1/admin/provider-subscription-plans/${planID}`, { method: "DELETE" });
      await loadProviderPlans(true);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    }
  }

  $("reloadProvidersButton")?.addEventListener("click", () => loadProviders({ reset: true }));
  $("reloadProviderListingsButton")?.addEventListener("click", () => loadProviderListings({ reset: true }));
  $("loadMoreProvidersButton")?.addEventListener("click", () => loadProviders());
  $("loadMoreProviderListingsButton")?.addEventListener("click", () => loadProviderListings());
  $("providerSearch")?.addEventListener("input", debounce(() => loadProviders({ reset: true }), 300));
  $("providerVerificationStatus")?.addEventListener("change", () => loadProviders({ reset: true }));
  $("providerListingSearch")?.addEventListener("input", debounce(() => loadProviderListings({ reset: true }), 300));
  $("providerListingModerationStatus")?.addEventListener("change", () => loadProviderListings({ reset: true }));
  $("providerPlanForm")?.addEventListener("submit", saveProviderPlan);
  $("providerAccessForm")?.addEventListener("submit", saveProviderAccess);
  $("providerAccessMode")?.addEventListener("change", () => { $("providerPaidStartAt").disabled = $("providerAccessMode").value !== "paid"; });
  $("reloadProviderPlansButton")?.addEventListener("click", () => loadProviderPlans(true));
  $("reloadGatewaySubscriptionsButton")?.addEventListener("click", () => loadGatewaySubscriptions(true));
  $("reloadMerchantProductsButton")?.addEventListener("click", () => loadMerchantProducts({ reset: true }));
  $("loadMoreMerchantProductsButton")?.addEventListener("click", () => loadMerchantProducts());
  $("merchantProductSearch")?.addEventListener("input", debounce(() => loadMerchantProducts({ reset: true }), 300));
  $("merchantProductStatus")?.addEventListener("change", () => loadMerchantProducts({ reset: true }));
  $("reloadMerchantFulfillmentsButton")?.addEventListener("click", () => loadMerchantFulfillments({ reset: true }));
  $("loadMoreMerchantFulfillmentsButton")?.addEventListener("click", () => loadMerchantFulfillments());
  $("merchantFulfillmentSearch")?.addEventListener("input", debounce(() => loadMerchantFulfillments({ reset: true }), 300));
  $("merchantFulfillmentRoute")?.addEventListener("change", () => loadMerchantFulfillments({ reset: true }));
  $("merchantFulfillmentStatusFilter")?.addEventListener("input", debounce(() => loadMerchantFulfillments({ reset: true }), 300));
  setNavVisibility();
  window.watchCatalogChanges({
    url: `${state.apiUrl}/api/v1/catalog/version`,
    enabled: () => Boolean(state.token && state.activeTab === "providers" && ["super_admin", "catalog_admin"].includes(state.role)),
    refresh: async () => {
      if (document.querySelector("#editListingDialog[open], #editProductDialog[open]") || document.querySelector("[data-product-status]:disabled")) return false;
      const results = await Promise.all([loadMerchantProducts({ reset: true }), loadProviderListings({ reset: true })]);
      return results.every(result => result !== false);
    }
  });
})();
