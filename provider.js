(() => {
  "use strict";
  const API = "https://atlanticexpress-api.sportbanter.online/api/v1";
  const PAGE_SIZE = 25;
  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem("atlantic.provider.token") || "",
    provider: null, plans: [], listings: [], requests: [], documents: [], products: [], merchantOrders: [], manifests: [],
    listingCursor: "", listingHasMore: false, requestCursor: "", requestHasMore: false,
    productCursor: "", productHasMore: false, merchantOrderCursor: "", merchantOrderHasMore: false, manifestCursor: "", manifestHasMore: false, editingProductID: ""
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
        switchAuth("login");
        document.querySelector("#loginForm [name=email]").value = String(payload.email || "");
        setMessage("An account already uses this email. Verify the email we sent, then sign in. If the message is missing, select Resend verification email.", false, "loginMessage");
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
    state.token = ""; state.provider = null; state.listings = []; state.requests = []; state.documents = []; state.products = []; state.merchantOrders = [];
    localStorage.removeItem("atlantic.provider.token"); $("portal").classList.add("hidden"); $("authPanel").classList.remove("hidden"); $("signOut").classList.add("hidden");
  }

  async function boot() {
    if (!state.token) return signOut();
    $("authPanel").classList.add("hidden"); $("portal").classList.remove("hidden"); $("signOut").classList.remove("hidden"); setMessage("");
    try { state.provider = await api("/providers/me"); $("onboardingCard").classList.add("hidden"); }
    catch (error) { if (error.status === 404) { state.provider = null; $("onboardingCard").classList.remove("hidden"); } else throw error; }
    await loadPlans();
    if (state.provider) await Promise.all([loadListings({ reset: true }), loadRequests({ reset: true }), loadVerificationDocuments(), loadProducts({ reset: true }), loadMerchantOrders({ reset: true }), loadManifests({ reset: true })]);
    renderOverview();
  }

  async function onboard(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try { await api("/providers/onboarding", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), country_code: "NG" }) }); setMessage("Provider profile submitted for verification.", true); await boot(); }
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

  async function saveListing(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form)); const files = [...$("listingImages").files];
      if (!files.length) throw new Error("Add at least one clear listing image.");
      const media_urls = await uploadImages(files);
      const payload = { ...values, price: values.price === "" ? null : Number(values.price), capacity: Number(values.capacity || 1), latitude: values.latitude === "" ? null : Number(values.latitude), longitude: values.longitude === "" ? null : Number(values.longitude), service_radius_km: values.service_radius_km === "" ? null : Number(values.service_radius_km), is_mobile_service: form.elements.is_mobile_service.checked, is_available_now: form.elements.is_available_now.checked, currency_code: "NGN", country_code: "NG", media_urls, attributes: {} };
      await api("/providers/me/listings", { method: "POST", body: JSON.stringify(payload) });
      form.reset(); form.classList.add("hidden"); setMessage("Draft saved. Submit it when the details are ready for review.", true); setMessage("", false, "uploadProgress"); await loadListings({ reset: true });
    } catch (error) { setMessage(error.message); } finally { button.disabled = false; }
  }

  async function saveProduct(event) {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form)); const files = [...$("productImages").files];
      const existing = state.products.find(item => item.id === state.editingProductID);
      if (!files.length && !existing?.image_urls?.length) throw new Error("Add at least one clear product image.");
      const image_urls = files.length ? await uploadImages(files, "productUploadProgress") : existing.image_urls;
      const payload = { title: values.title, sku: values.sku, description: values.description, category_path: [values.category], image_urls, local_selling_price: Number(values.local_selling_price), compare_at_price: values.compare_at_price ? Number(values.compare_at_price) : null, inventory_count: Number(values.inventory_count), is_flash_sale: form.elements.is_flash_sale.checked, flash_sale_price: values.flash_sale_price ? Number(values.flash_sale_price) : null, fulfillment_mode: values.fulfillment_mode, inventory_country_code: values.inventory_country_code, inventory_city: values.inventory_city, inventory_location: values.inventory_location, stock_state: values.stock_state, handling_time_hours: Number(values.handling_time_hours), delivery_min_days: Number(values.delivery_min_days), delivery_max_days: Number(values.delivery_max_days), delivery_methods: String(values.delivery_methods).split(",").map(value => value.trim()).filter(Boolean), return_policy: values.return_policy, atlantic_last_mile: form.elements.atlantic_last_mile.checked };
      const path = state.editingProductID ? `/providers/me/products/${state.editingProductID}` : "/providers/me/products";
      await api(path, { method: state.editingProductID ? "PATCH" : "POST", body: JSON.stringify(payload) }); state.editingProductID = ""; form.reset(); form.classList.add("hidden"); setMessage("Product saved. Submit it for review when ready.", true); setMessage("", false, "productUploadProgress"); await loadProducts({ reset: true });
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
    const item = state.products.find(product => product.id === id); if (!item) return; const form = $("productForm"); state.editingProductID = id; form.classList.remove("hidden"); ["title","sku","description","local_selling_price","compare_at_price","inventory_count","flash_sale_price","fulfillment_mode","inventory_country_code","inventory_city","inventory_location","stock_state","handling_time_hours","delivery_min_days","delivery_max_days","return_policy"].forEach(name => { form.elements[name].value = item[name] ?? ""; }); form.elements.category.value = item.category_path?.[0] || ""; form.elements.delivery_methods.value = (item.delivery_methods || []).join(","); form.elements.is_flash_sale.checked = Boolean(item.is_flash_sale); form.elements.atlantic_last_mile.checked = Boolean(item.atlantic_last_mile); form.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function useCurrentLocation() {
    if (!navigator.geolocation) return setMessage("Location is unavailable in this browser.");
    const button = $("useCurrentLocation"); button.disabled = true; navigator.geolocation.getCurrentPosition(({ coords }) => { const form = $("listingForm"); form.elements.latitude.value = coords.latitude.toFixed(6); form.elements.longitude.value = coords.longitude.toFixed(6); setMessage("Current location added to this service draft.", true); button.disabled = false; }, (error) => { setMessage(error.message || "Could not read current location."); button.disabled = false; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
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
    $("businessName").textContent = p?.business_name || "Provider setup"; $("verificationState").textContent = human(verification); $("metricVerification").textContent = human(verification); $("metricSubscription").textContent = human(subscription); $("metricListings").textContent = state.listings.length + state.products.length; $("metricRequests").textContent = state.requests.filter((item) => ["pending", "accepted"].includes(item.status)).length; $("providerStatus").textContent = p ? `${p.business_name} - ${human(verification)}` : "Complete provider onboarding";
    $("accountGuidance").innerHTML = !p ? "Create your provider profile to begin." : verification !== "approved" ? `<strong>Verification ${escapeHtml(verification)}.</strong> Listings remain private until an administrator approves your business and each listing.${p.verification_notes ? `<br>${escapeHtml(p.verification_notes)}` : ""}` : subscription !== "active" ? "<strong>Business verified.</strong> Choose an active monthly plan so approved listings and contact details can appear to buyers." : `<strong>Ready for buyers.</strong> Your verification and subscription are active${p.subscription.current_period_end ? ` until ${new Date(p.subscription.current_period_end).toLocaleDateString()}` : ""}.`;
    renderPlans();
  }
  function switchView(view) { document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view)); document.querySelectorAll("[data-view-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.viewPanel !== view)); }
  function switchAuth(view) { document.querySelectorAll("[data-auth-view]").forEach((b) => b.classList.toggle("active", b.dataset.authView === view)); document.querySelectorAll("[data-auth-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.authPanel !== view)); }

  $("loginForm").addEventListener("submit", login); $("signupForm").addEventListener("submit", signup); $("resendVerification").addEventListener("click", resendVerification); $("signOut").addEventListener("click", signOut); $("onboardingForm").addEventListener("submit", onboard); $("verificationForm").addEventListener("submit", uploadVerificationDocument); $("listingForm").addEventListener("submit", saveListing); $("productForm").addEventListener("submit", saveProduct); $("availabilityForm").addEventListener("submit", saveAvailability); $("closeAvailability").addEventListener("click", () => $("availabilityDialog").close());
  $("toggleListingForm").addEventListener("click", () => $("listingForm").classList.toggle("hidden")); $("listingSearch").addEventListener("input", debounce(() => loadListings({ reset: true }))); $("listingStatus").addEventListener("change", () => loadListings({ reset: true })); $("loadMoreListings").addEventListener("click", () => loadListings());
  $("requestSearch").addEventListener("input", debounce(() => loadRequests({ reset: true }))); $("requestStatus").addEventListener("change", () => loadRequests({ reset: true })); $("loadMoreRequests").addEventListener("click", () => loadRequests()); $("refreshPortal").addEventListener("click", boot); $("refreshRequests").addEventListener("click", () => loadRequests({ reset: true }));
  $("toggleProductForm").addEventListener("click", () => $("productForm").classList.toggle("hidden")); $("productSearch").addEventListener("input", debounce(() => loadProducts({ reset: true }))); $("productStatus").addEventListener("change", () => loadProducts({ reset: true })); $("loadMoreProducts").addEventListener("click", () => loadProducts()); $("refreshMerchantOrders").addEventListener("click", () => Promise.all([loadMerchantOrders({ reset: true }),loadManifests({reset:true})])); $("loadMoreMerchantOrders").addEventListener("click", () => loadMerchantOrders()); $("loadMoreManifests").addEventListener("click",()=>loadManifests()); $("createManifest").addEventListener("click",createManifest); $("useCurrentLocation").addEventListener("click", useCurrentLocation);
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view))); document.querySelectorAll("[data-auth-view]").forEach((button) => button.addEventListener("click", () => switchAuth(button.dataset.authView)));
  boot().catch((error) => setMessage(error.message));
})();
