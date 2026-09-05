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
  loadTabData = (tab, options = {}) => tab === "providers" ? Promise.all([loadProviders({ reset: true }), loadProviderListings({ reset: true }), loadMerchantProducts({ reset: true })]) : tab === "merchant-fulfillments" ? loadMerchantFulfillments({ reset: true }) : originalLoadTabData(tab, options);

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
    setText("providerListingStatus", "Loading listings...");
    try {
      const data = await request(`/api/v1/admin/provider-listings?${queryParams("providerListingSearch", "providerListingModerationStatus", reset ? "" : state.providerListingCursor)}`);
      state.providerListings = reset ? (data.items || []) : [...state.providerListings, ...(data.items || [])];
      state.providerListingCursor = data.next_cursor || ""; state.providerListingHasMore = Boolean(data.has_more);
      renderProviderListings(); setText("providerListingStatus", `${state.providerListings.length} listings loaded.`);
    } catch (error) { setText("providerListingStatus", error.message); }
  }

  async function loadMerchantProducts({ reset = false } = {}) {
    setText("merchantProductModerationStatus", "Loading merchant products...");
    try {
      const data = await request(`/api/v1/admin/merchant-products?${queryParams("merchantProductSearch", "merchantProductStatus", reset ? "" : state.merchantProductCursor)}`);
      state.merchantProducts = reset ? (data.items || []) : [...state.merchantProducts, ...(data.items || [])];
      state.merchantProductCursor = data.page?.next_cursor || ""; state.merchantProductHasMore = Boolean(data.page?.has_more);
      renderMerchantProducts(); setText("merchantProductModerationStatus", `${state.merchantProducts.length} merchant products loaded.`);
    } catch (error) { setText("merchantProductModerationStatus", error.message); }
  }

  function renderProviders() {
    $("providersTable").innerHTML = `<thead><tr><th>Business</th><th>Contact</th><th>Location</th><th>Verification</th><th>Subscription</th><th>Action</th></tr></thead><tbody>${state.providers.map((item) => `<tr>
      <td><strong>${escapeHtml(item.business_name)}</strong><br><span class="muted">${format(item.created_at)}</span></td>
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
    $("providerListingsTable").innerHTML = `<thead><tr><th>Listing</th><th>Provider</th><th>Service</th><th>Location</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.providerListings.map((item) => `<tr>
      <td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.description || "").slice(0, 100)}</span></td><td>${escapeHtml(item.provider_name)}</td><td>${escapeHtml(item.listing_type.replaceAll("_", " "))}</td>
      <td>${escapeHtml([item.city, item.state].filter(Boolean).join(", ") || "-")}</td><td>${item.price == null ? "Enquiry" : `${escapeHtml(item.currency_code)} ${format(item.price)} / ${escapeHtml(item.pricing_unit || "unit")}`}</td>
      <td><span class="status-pill ${item.status === "approved" ? "active" : item.status === "rejected" ? "inactive" : ""}">${escapeHtml(item.status)}</span></td><td class="table-actions"><button data-listing-status="approved" data-id="${item.id}" class="secondary-button">Approve</button><button data-listing-status="rejected" data-id="${item.id}" class="danger-button">Reject</button><button data-listing-status="suspended" data-id="${item.id}" class="danger-button">Suspend</button></td>
    </tr>`).join("") || `<tr><td colspan="7">No matching listings.</td></tr>`}</tbody>`;
    $("loadMoreProviderListingsButton")?.classList.toggle("hidden", !state.providerListingHasMore);
    $("providerListingsTable").querySelectorAll("[data-listing-status]").forEach((button) => button.addEventListener("click", () => moderateListing(button.dataset.id, button.dataset.listingStatus)));
  }
  async function moderateListing(id, status) {
    const notes = prompt(`${status} listing. Add an internal note (optional):`, ""); if (notes === null) return;
    try { await request(`/api/v1/admin/provider-listings/${id}/moderation`, { method: "PATCH", body: { status, notes } }); await loadProviderListings({ reset: true }); }
    catch (error) { setText("providerListingStatus", error.message); }
  }
  function renderMerchantProducts() {
    $("merchantProductsTable").innerHTML = `<thead><tr><th>Product</th><th>Merchant</th><th>Price</th><th>Stock</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.merchantProducts.map((item) => `<tr><td>${item.image_urls?.[0] ? `<img class="product-image" src="${escapeHtml(item.image_urls[0])}" alt="">` : ""}<strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.sku)}</span></td><td>${escapeHtml(item.provider_name)}</td><td>NGN ${format(item.local_selling_price)}${item.compare_at_price ? `<br><span class="muted">Was NGN ${format(item.compare_at_price)}</span>` : ""}</td><td>${item.inventory_count}</td><td><span class="status-pill ${item.moderation_status === "approved" ? "active" : item.moderation_status === "rejected" ? "inactive" : ""}">${escapeHtml(item.moderation_status)}</span></td><td class="table-actions"><button data-product-status="approved" data-id="${item.id}" class="secondary-button">Approve</button><button data-product-status="rejected" data-id="${item.id}" class="danger-button">Reject</button><button data-product-status="suspended" data-id="${item.id}" class="danger-button">Suspend</button></td></tr>`).join("") || `<tr><td colspan="6">No matching merchant products.</td></tr>`}</tbody>`;
    $("loadMoreMerchantProductsButton")?.classList.toggle("hidden", !state.merchantProductHasMore);
    $("merchantProductsTable").querySelectorAll("[data-product-status]").forEach(button => button.onclick = () => moderateMerchantProduct(button.dataset.id, button.dataset.productStatus));
  }
  async function moderateMerchantProduct(id, status) {
    const notes = prompt(`${status} product. Add a moderation note (optional):`, ""); if (notes === null) return;
    try { await request(`/api/v1/admin/merchant-products/${id}/moderation`, { method: "PATCH", body: { status, notes } }); await loadMerchantProducts({ reset: true }); }
    catch (error) { setText("merchantProductModerationStatus", error.message); }
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
    table.innerHTML = `<thead><tr><th>Order</th><th>Merchant</th><th>Route</th><th>Status</th><th>Location</th><th>Updated</th><th>Action</th></tr></thead><tbody>${state.merchantFulfillments.map((item) => {
      const canCourierAct = state.role === "courier_admin" && item.fulfillment_owner === "atlantic_last_mile";
      const next = item.status === "handed_to_atlantic" ? "local_hub" : item.status === "local_hub" ? "ready_for_pickup" : item.status === "ready_for_pickup" ? "delivered" : "";
      return `<tr><td><strong>${escapeHtml(item.package_label || item.order_id)}</strong><br><span class="muted">${escapeHtml(item.tracking_number || "No tracking number")}</span></td><td>${escapeHtml(item.provider_name || "-")}</td><td>${escapeHtml((item.route_type || "").replaceAll("_", " "))}</td><td><span class="status-pill">${escapeHtml((item.status || "").replaceAll("_", " "))}</span></td><td>${escapeHtml(item.current_location || "-")}</td><td>${format(item.updated_at)}</td><td>${canCourierAct && next ? `<button class="secondary-button" data-last-mile-order="${item.order_id}" data-next-status="${next}" data-version="${item.version}">${escapeHtml(next.replaceAll("_", " "))}</button>` : "-"}</td></tr>`;
    }).join("") || `<tr><td colspan="7">No matching merchant fulfilments.</td></tr>`}</tbody>`;
    $("loadMoreMerchantFulfillmentsButton")?.classList.toggle("hidden", !state.merchantFulfillmentHasMore);
    table.querySelectorAll("[data-last-mile-order]").forEach((button) => button.onclick = () => updateLastMile(button));
  }

  async function updateLastMile(button) {
    const location = prompt("Current location or pickup point (optional):", "");
    if (location === null) return;
    try {
      await request(`/api/v1/admin/merchant-orders/${button.dataset.lastMileOrder}/last-mile`, { method: "PATCH", body: { status: button.dataset.nextStatus, current_location: location.trim(), expected_version: Number(button.dataset.version), idempotency_key: crypto.randomUUID() } });
      await loadMerchantFulfillments({ reset: true });
    } catch (error) { setText("merchantFulfillmentStatus", error.message); }
  }
  async function saveProviderPlan(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await request("/api/v1/admin/provider-subscription-plans", { method: "POST", body: { code: form.get("code"), name: form.get("name"), description: form.get("description"), amount_ngn: Number(form.get("amount_ngn")), listing_limit: Number(form.get("listing_limit")), flutterwave_plan_id: form.get("flutterwave_plan_id") ? Number(form.get("flutterwave_plan_id")) : null, features: { verified_badge: true, public_contact: true } } }); setText("providerPlanStatus", "Subscription plan saved."); event.currentTarget.reset(); }
    catch (error) { setText("providerPlanStatus", error.message); }
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
})();
