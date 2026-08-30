/* Provider marketplace administration. Loaded after the main admin bundle. */
(() => {
  const PAGE_SIZE = 25;
  const originalAllowedTabsForRole = allowedTabsForRole;
  allowedTabsForRole = (role = state.role) => {
    const tabs = originalAllowedTabsForRole(role);
    return ["super_admin", "catalog_admin"].includes(role) && !tabs.includes("providers") ? [...tabs.slice(0, 2), "providers", ...tabs.slice(2)] : tabs;
  };
  const originalLoadTabData = loadTabData;
  loadTabData = (tab, options = {}) => tab === "providers" ? Promise.all([loadProviders({ reset: true }), loadProviderListings({ reset: true })]) : originalLoadTabData(tab, options);

  state.providers = [];
  state.providerListings = [];
  state.providerCursor = "";
  state.providerHasMore = false;
  state.providerListingCursor = "";
  state.providerListingHasMore = false;

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
  setNavVisibility();
})();
