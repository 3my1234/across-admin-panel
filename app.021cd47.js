const state = {
  apiUrl: localStorage.getItem("across.admin.apiUrl") || "https://atlanticexpress-api.sportbanter.online",
  token: localStorage.getItem("across.admin.token") || "",
  adminId: localStorage.getItem("across.admin.adminId") || "",
  role: localStorage.getItem("across.admin.role") || "",
  fullName: localStorage.getItem("across.admin.fullName") || "",
  products: [],
  batches: [],
  admins: [],
  users: [],
  orders: [],
  transactions: [],
  listViews: Object.fromEntries(
    ["admins", "users", "orders", "batches", "transactions"].map((name) => [
      name,
      { query: "", cursor: "", total: 0, hasMore: false, loading: false, requestSeq: 0 }
    ])
  ),
  productSearch: "",
  productPage: { cursor: "", total: 0, hasMore: false, loading: false, requestSeq: 0 },
  activeTab: localStorage.getItem("across.admin.activeTab") || "overview",
  resetAdminTarget: null,
  activityCursor: "",
  activityItems: [],
  activityTimer: null
};

const $ = (id) => document.getElementById(id);
const CACHE_TTL_MS = 5 * 60 * 1000;
const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = value;
};
const categoryPrefixes = {
  "Mobile Devices": "MOB",
  Laptops: "LAP",
  Accessories: "ACC",
  "Male Clothes": "MCL",
  "Female Clothes": "FCL",
  Shoes: "SHO",
  Beauty: "BEA",
  Home: "HOM",
  Electronics: "ELC",
  Kids: "KID"
};

$("apiUrl").value = state.apiUrl;
renderSession({ restoring: Boolean(state.token) });

if (state.token) {
  restoreSession();
}

$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  input.type = input.type === "password" ? "text" : "password";
  $("togglePassword").textContent = input.type === "password" ? "Show" : "Hide";
});
const createAdminPasswordInput = document.querySelector("#adminForm input[name='password']");
const toggleAdminPassword = $("toggleAdminPassword");
if (createAdminPasswordInput && toggleAdminPassword) {
  toggleAdminPassword.addEventListener("click", () => {
    createAdminPasswordInput.type = createAdminPasswordInput.type === "password" ? "text" : "password";
    toggleAdminPassword.textContent = createAdminPasswordInput.type === "password" ? "Show" : "Hide";
  });
}

$("loginButton").addEventListener("click", async () => {
  state.apiUrl = $("apiUrl").value.replace(/\/$/, "");
  localStorage.setItem("across.admin.apiUrl", state.apiUrl);
  setText("authError", "");
  try {
    const data = await request("/api/v1/admin/login", {
      method: "POST",
      body: {
        email: $("email").value,
        password: $("password").value
      },
      auth: false
    });
    state.token = data.access_token;
    state.adminId = data.admin_id || "";
    state.role = data.role || "";
    state.fullName = data.full_name || "";
    localStorage.setItem("across.admin.token", state.token);
    localStorage.setItem("across.admin.adminId", state.adminId);
    localStorage.setItem("across.admin.role", state.role);
    localStorage.setItem("across.admin.fullName", state.fullName);
    hydrateAdminCache();
    initializeAdminDrafts();
    renderSession();
    await loadDashboard({ force: true });
    startAdminActivityPolling();
  } catch (error) {
    setText("authError", error.message);
  }
});

$("refreshButton").addEventListener("click", () => loadDashboard({ force: true }));
$("logoutButton").addEventListener("click", logout);
$("adminNotificationButton")?.addEventListener("click", () => {
  $("adminNotificationPanel")?.classList.toggle("hidden");
});
$("clearAdminNotifications")?.addEventListener("click", async () => {
  try {
    await request("/api/v1/admin/activity/read-all", { method: "PATCH" });
    state.activityItems = state.activityItems.map((item) => ({ ...item, is_read: true }));
    renderAdminNotifications();
  } catch (error) {
    if (error.status === 401) logout();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.token) void pollAdminActivity();
});
$("reloadProductsButton").addEventListener("click", () => loadProducts({ reset: true }));
$("reloadBatchesButton").addEventListener("click", loadBatches);
$("reloadAdminsButton").addEventListener("click", loadAdminDirectory);
$("productSearch").addEventListener("input", debounce(() => {
  state.productSearch = $("productSearch").value.trim();
  loadProducts({ reset: true }).catch((error) => setText("catalogStatus", error.message));
}, 250));
$("showMoreProductsButton").addEventListener("click", () => {
  loadProducts({ append: true }).catch((error) => setText("catalogStatus", error.message));
});
$("collapseProductsButton").addEventListener("click", () => {
  loadProducts({ reset: true }).catch((error) => setText("catalogStatus", error.message));
  document.querySelector("[data-panel='products']")?.scrollIntoView({ block: "start" });
});
for (const name of ["admins", "users", "orders", "batches", "transactions"]) {
  const input = $(`${name}Search`);
  input?.addEventListener("input", debounce(() => {
    state.listViews[name].query = input.value.trim();
    loadNamedList(name, { reset: true }).catch((error) => showListError(name, error));
  }, 250));
}
document.querySelectorAll("[data-list-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.listToggle;
    const view = state.listViews[name];
    const reset = !view.hasMore && state[name].length > 25;
    loadNamedList(name, { append: !reset, reset }).catch((error) => showListError(name, error));
  });
});
$("closeEditDialog").addEventListener("click", closeEditDialog);
$("cancelEditButton").addEventListener("click", closeEditDialog);
$("editProductForm").addEventListener("submit", saveProductEdits);
$("editProductForm").elements.image_urls.addEventListener("input", () => {
  renderEditImagePreview(parseImageUrls($("editProductForm").elements.image_urls.value));
});
$("closeBatchDialog").addEventListener("click", closeBatchDialog);
$("cancelBatchButton").addEventListener("click", closeBatchDialog);
$("editBatchForm").addEventListener("submit", saveBatchEdits);
$("closeBatchTransitionDialog").addEventListener("click", closeBatchTransitionDialog);
$("cancelBatchTransitionButton").addEventListener("click", closeBatchTransitionDialog);
$("batchTransitionForm").addEventListener("submit", submitBatchTransition);
$("closeManifestExceptionDialog").addEventListener("click", closeManifestExceptionDialog);
$("cancelManifestExceptionButton").addEventListener("click", closeManifestExceptionDialog);
$("manifestExceptionForm").addEventListener("submit", submitManifestException);
$("closeResetAdminDialog").addEventListener("click", closeResetAdminDialog);
$("cancelResetAdminButton").addEventListener("click", closeResetAdminDialog);
$("resetAdminForm").addEventListener("submit", saveResetAdminPassword);
$("paymentReconciliationForm")?.addEventListener("submit", reconcileFlutterwavePayment);
const resetAdminPasswordInput = document.querySelector("#resetAdminForm input[name='password']");
const toggleResetAdminPassword = $("toggleResetAdminPassword");
if (resetAdminPasswordInput && toggleResetAdminPassword) {
  toggleResetAdminPassword.addEventListener("click", () => {
    resetAdminPasswordInput.type = resetAdminPasswordInput.type === "password" ? "text" : "password";
    toggleResetAdminPassword.textContent = resetAdminPasswordInput.type === "password" ? "Show" : "Hide";
  });
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
    loadTabData(button.dataset.tab).catch((error) => showListError(button.dataset.tab, error));
  });
});

setActiveTab(state.activeTab, { persist: false });

document.querySelectorAll(".mobile-nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
    loadTabData(button.dataset.tab).catch((error) => showListError(button.dataset.tab, error));
  });
});

const productForm = $("productForm");
productForm.elements.title.addEventListener("input", updateSkuPreview);
productForm.elements.category.addEventListener("change", updateSkuPreview);

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"], button:not([type])');
  const form = new FormData(formElement);
  setText("productStatus", "");
  if (submitButton) submitButton.disabled = true;
  try {
    const category = String(form.get("category") || "").trim();
    const imageUrls = String(form.get("image_urls") || "")
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);
    const uploadedUrls = await uploadProductImages(form.getAll("image_files").filter((file) => file instanceof File && file.size > 0));
    const product = await request("/api/v1/admin/products", {
      method: "POST",
      body: {
        sku: String(form.get("sku") || "").trim(),
        title: form.get("title"),
        description: form.get("description"),
        category_path: category ? [category] : [],
        local_selling_price: Number(form.get("local_selling_price") || 0),
        compare_at_price: Number(form.get("compare_at_price") || 0),
        cost_price_rmb: Number(form.get("cost_price_rmb") || 0),
        exchange_rate_snapshot: Number(form.get("exchange_rate_snapshot") || 1),
        inventory_count: Number(form.get("inventory_count") || 0),
        image_urls: [...uploadedUrls, ...imageUrls],
        factory_name: form.get("factory_name"),
        factory_location: form.get("factory_location")
      }
    });
    formElement.reset();
    clearFormDraft(formElement);
    updateSkuPreview();
    $("productStatus").className = "success";
    setText("productStatus", `Product added with SKU ${product.sku}. It will appear in the mobile catalog on refresh.`);
    await loadProducts({ reset: true });
  } catch (error) {
    $("productStatus").className = "error";
    setText("productStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  setText("adminStatus", "");
  try {
    await request("/api/v1/admin/admins", {
      method: "POST",
      body: {
        full_name: form.get("full_name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role")
      }
    });
    formElement.reset();
    clearFormDraft(formElement);
    $("adminStatus").className = "success";
    setText("adminStatus", "Admin created.");
  } catch (error) {
    $("adminStatus").className = "error";
    setText("adminStatus", error.message);
  }
});

async function loadDashboard({ force = false } = {}) {
  const results = await Promise.allSettled([
    loadOverview(),
    loadTabData(state.activeTab, { force })
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

function startAdminActivityPolling() {
  stopAdminActivityPolling();
  state.activityItems = [];
  state.activityCursor = "";
  renderAdminNotifications();
  void pollAdminActivity();
  state.activityTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void pollAdminActivity();
  }, 12000);
}

function stopAdminActivityPolling() {
  if (state.activityTimer) window.clearInterval(state.activityTimer);
  state.activityTimer = null;
}

async function pollAdminActivity() {
  if (!state.token) return;
  const isInitialLoad = !state.activityCursor;
  const query = state.activityCursor ? `?limit=25&cursor=${encodeURIComponent(state.activityCursor)}` : "?limit=25";
  try {
    const result = await request(`/api/v1/admin/activity${query}`);
    const events = Array.isArray(result.events) ? result.events : [];
    if (result.cursor) {
      state.activityCursor = result.cursor;
    }
    if (isInitialLoad) {
      state.activityItems = events.slice(0, 50);
    } else if (events.length) {
      const known = new Set(state.activityItems.map((item) => item.id));
      const fresh = events.filter((item) => !known.has(item.id));
      state.activityItems = [...fresh.reverse(), ...state.activityItems].slice(0, 50);
    }
    renderAdminNotifications();
    if (!isInitialLoad && events.length) {
      await Promise.allSettled([loadOverview(), loadTabData(state.activeTab, { force: true })]);
    }
  } catch (error) {
    if (error.status === 401) logout();
  }
}

function renderAdminNotifications() {
  const unreadCount = state.activityItems.filter((item) => !item.is_read).length;
  const badge = $("adminNotificationBadge");
  if (badge) {
    badge.textContent = String(Math.min(unreadCount, 99));
    badge.classList.toggle("hidden", unreadCount === 0);
  }
  const list = $("adminNotificationList");
  if (!list) return;
  list.replaceChildren();
  if (!state.activityItems.length) {
    const empty = document.createElement("p");
    empty.className = "muted notification-empty";
    empty.textContent = "No operational activity yet.";
    list.appendChild(empty);
    return;
  }
  state.activityItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `notification-item${item.is_read ? " is-read" : " is-unread"}`;
    const title = document.createElement("strong");
    title.textContent = item.batch_code || "Batch update";
    const detail = document.createElement("span");
    detail.textContent = `${String(item.status || item.event_type || "updated").replaceAll("_", " ")}${item.notes ? ` · ${item.notes}` : ""}`;
    const when = document.createElement("small");
    when.textContent = new Date(item.created_at).toLocaleString();
    button.append(title, detail, when);
    button.addEventListener("click", async () => {
      try {
        if (!item.is_read) {
          await request(`/api/v1/admin/activity/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
          state.activityItems = state.activityItems.map((entry) =>
            entry.id === item.id ? { ...entry, is_read: true } : entry
          );
          renderAdminNotifications();
        }
        $("adminNotificationPanel")?.classList.add("hidden");
        setActiveTab("batches");
        await loadBatches();
      } catch (error) {
        if (error.status === 401) logout();
      }
    });
    list.appendChild(button);
  });
}

async function loadOverview() {
  const overview = await request("/api/v1/admin/overview");
  setText("orderCount", overview.order_count ?? 0);
  setText("transactionCount", overview.transaction_count ?? 0);
  setText("manifestCount", overview.manifest_count ?? overview.batch_count ?? 0);
  writeAdminCache("overview", overview);
}

async function loadTabData(tab, { force = false } = {}) {
  if (tab === "products") return loadProducts({ reset: force || !state.products.length });
  if (tab === "orders") return loadNamedList("orders", { reset: force || !state.orders.length });
  if (tab === "transactions") return loadNamedList("transactions", { reset: force || !state.transactions.length });
  if (tab === "batches") return loadNamedList("batches", { reset: force || !state.batches.length });
  if (tab === "admins") {
    return Promise.all([
      loadNamedList("admins", { reset: force || !state.admins.length }),
      loadNamedList("users", { reset: force || !state.users.length })
    ]);
  }
}

async function loadProducts({ append = false, reset = false } = {}) {
  if (state.productPage.loading && append) return;
  if (!reset && !append && state.products.length) return;
  setText("catalogStatus", "");
  const page = state.productPage;
  if (reset) page.cursor = "";
  const seq = ++page.requestSeq;
  page.loading = true;
  if (!append && !state.products.length) setListLoading("products", true);
  try {
    const params = new URLSearchParams({ limit: "25" });
    if (state.productSearch) params.set("search", state.productSearch);
    if (append && page.cursor) params.set("cursor", page.cursor);
    const data = await request(`/api/v1/admin/products?${params}`);
    if (seq !== page.requestSeq) return;
    state.products = append ? [...state.products, ...(data.products || [])] : (data.products || []);
    page.cursor = data.page?.next_cursor || "";
    if (!append) page.total = Number(data.page?.total || state.products.length);
    page.hasMore = Boolean(data.page?.has_more);
    renderProductsTable();
    if (!state.productSearch) {
      writeAdminCache("products", { rows: state.products, page: { ...page, loading: false } });
    }
  } catch (error) {
    renderListFailure("products", error);
    throw error;
  } finally {
    if (seq === page.requestSeq) page.loading = false;
  }
}

const listEndpoints = {
  admins: ["/api/v1/admin/admins", "admins"],
  users: ["/api/v1/admin/users", "users"],
  orders: ["/api/v1/admin/orders", "orders"],
  batches: ["/api/v1/admin/batches", "batches"],
  transactions: ["/api/v1/admin/transactions", "transactions"]
};

async function loadNamedList(name, { append = false, reset = false } = {}) {
  const view = state.listViews[name];
  if (!view || (view.loading && append)) return;
  if (!reset && !append && state[name].length) return;
  if (reset) view.cursor = "";
  const seq = ++view.requestSeq;
  view.loading = true;
  if (!append && !state[name].length) setListLoading(name, true);
  try {
    const [endpoint, key] = listEndpoints[name];
    const params = new URLSearchParams({ limit: "25" });
    if (view.query) params.set("search", view.query);
    if (append && view.cursor) params.set("cursor", view.cursor);
    const data = await request(`${endpoint}?${params}`);
    if (seq !== view.requestSeq) return;
    state[name] = append ? [...state[name], ...(data[key] || [])] : (data[key] || []);
    view.cursor = data.page?.next_cursor || "";
    if (!append) view.total = Number(data.page?.total || state[name].length);
    view.hasMore = Boolean(data.page?.has_more);
    renderNamedList(name);
    if (!view.query) {
      writeAdminCache(name, { rows: state[name], page: { ...view, loading: false } });
    }
  } catch (error) {
    renderListFailure(name, error);
    throw error;
  } finally {
    if (seq === view.requestSeq) view.loading = false;
  }
}

async function loadAdminDirectory() {
  return Promise.all([
    loadNamedList("admins", { reset: true }),
    loadNamedList("users", { reset: true })
  ]);
}

async function loadBatches() {
  return loadNamedList("batches", { reset: true });
}

function renderBatchesTable() {
  const table = $("batchesTable");
  if (!table) return;
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Batch</th>
      <th>Date</th>
      <th>Status</th>
      <th>Transport</th>
      <th>Location</th>
      <th>Orders</th>
      <th>Collected</th>
      <th>Product Checklist</th>
      <th>Actions</th>
    </tr>
  `;
  const tbody = document.createElement("tbody");
  const batches = state.batches;
  if (!batches.length) {
    tbody.innerHTML = `<tr><td colspan="9">No batches yet.</td></tr>`;
    table.append(thead, tbody);
    renderBatchCards([]);
    updateListControls("batches", state.batches);
    return;
  }
  for (const batch of batches) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(batch.batch_code)}</td>
      <td>${format(batch.batch_date)}</td>
      <td>${escapeHtml(prettyBatchStatus(batch.status))}</td>
      <td>${escapeHtml(prettyTransportMode(batch.transport_mode))}</td>
      <td>${escapeHtml(batch.current_location || "-")}</td>
      <td>${format(batch.order_count)}</td>
      <td>${format(batch.total_ngn_collected)}</td>
      <td>${escapeHtml(batchChecklistSummary(batch))}</td>
      <td class="table-actions">
        ${isSuperAdmin() ? `<button type="button" class="secondary-button" data-action="edit-batch" data-id="${batch.id}">Details</button>` : ""}
        ${renderBatchActionButtons(batch)}
      </td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='edit-batch']").forEach((button) => {
    button.addEventListener("click", () => openBatchDialog(button.dataset.id));
  });
  bindBatchWorkflowButtons(table);
  renderBatchCards(batches);
  updateListControls("batches", state.batches);
}

function renderAdminsTable() {
  const table = $("adminsTable");
  if (!table) return;
  table.innerHTML = "";
  const canManageAdmins = isSuperAdmin();
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Full Name</th>
      <th>Email</th>
      <th>Role</th>
      <th>Status</th>
      <th>Created</th>
      ${canManageAdmins ? "<th>Actions</th>" : ""}
    </tr>
  `;
  const tbody = document.createElement("tbody");
  const admins = state.admins;
  if (!admins.length) {
    tbody.innerHTML = `<tr><td colspan="${canManageAdmins ? 6 : 5}">No admins yet.</td></tr>`;
    table.append(thead, tbody);
    renderAdminCards([]);
    updateListControls("admins", state.admins);
    return;
  }
  for (const admin of admins) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(admin.full_name || "-")}</td>
      <td>${escapeHtml(admin.email || "-")}</td>
      <td>${escapeHtml(prettyRole(admin.role))}</td>
      <td>${admin.is_active ? "Active" : "Inactive"}</td>
      <td>${format(admin.created_at)}</td>
      ${canManageAdmins ? `<td class="table-actions">
        <button type="button" class="secondary-button" data-action="reset-admin-password" data-id="${admin.id}">Reset password</button>
        <button type="button" class="danger-button" data-action="delete-admin" data-id="${admin.id}">Delete admin</button>
      </td>` : ""}
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  if (canManageAdmins) {
    table.querySelectorAll("[data-action='reset-admin-password']").forEach((button) => {
      button.addEventListener("click", () => openResetAdminDialog(button.dataset.id));
    });
    table.querySelectorAll("[data-action='delete-admin']").forEach((button) => {
      button.addEventListener("click", () => deleteAdmin(button.dataset.id));
    });
  }
  renderAdminCards(admins);
  updateListControls("admins", state.admins);
}

function renderUsersTable() {
  const table = $("usersTable");
  if (!table) return;
  table.innerHTML = "";
  const canDeleteUsers = isSuperAdmin();
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Full Name</th>
      <th>Email</th>
      <th>Phone</th>
      <th>Country</th>
      <th>Status</th>
      <th>Created</th>
      ${canDeleteUsers ? "<th>Actions</th>" : ""}
    </tr>
  `;
  const tbody = document.createElement("tbody");
  const users = state.users;
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="${canDeleteUsers ? 7 : 6}">No buyers yet.</td></tr>`;
    table.append(thead, tbody);
    renderUserCards([]);
    updateListControls("users", state.users);
    return;
  }
  for (const user of users) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(user.full_name || "-")}</td>
      <td>${escapeHtml(user.email || "-")}</td>
      <td>${escapeHtml(user.phone || "-")}</td>
      <td>${escapeHtml(user.country_code || "-")}</td>
      <td>${user.is_active ? "Active" : "Inactive"}</td>
      <td>${format(user.created_at)}</td>
      ${canDeleteUsers ? `<td class="table-actions"><button type="button" class="danger-button" data-action="delete-user" data-id="${user.id}">Delete user</button></td>` : ""}
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  if (canDeleteUsers) {
    table.querySelectorAll("[data-action='delete-user']").forEach((button) => {
      button.addEventListener("click", () => deleteUser(button.dataset.id));
    });
  }
  renderUserCards(users);
  updateListControls("users", state.users);
}

function renderAdminCards(rows) {
  const container = $("adminsCards");
  if (!container) return;
  const canManageAdmins = isSuperAdmin();
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No admins yet.</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map((admin) => `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(admin.full_name || "-")}</h3>
        <p class="mobile-card-meta">${escapeHtml(admin.email || "-")} · ${escapeHtml(prettyRole(admin.role))}</p>
        <p class="mobile-card-meta">${admin.is_active ? "Active" : "Inactive"} · ${format(admin.created_at)}</p>
        ${canManageAdmins ? `<div class="mobile-card-actions">
          <button type="button" class="secondary-button" data-action="reset-admin-password" data-id="${admin.id}">Reset password</button>
          <button type="button" class="danger-button" data-action="delete-admin" data-id="${admin.id}">Delete admin</button>
        </div>` : ""}
      </article>
    `)
    .join("");
  if (canManageAdmins) {
    container.querySelectorAll("[data-action='reset-admin-password']").forEach((button) => {
      button.addEventListener("click", () => openResetAdminDialog(button.dataset.id));
    });
    container.querySelectorAll("[data-action='delete-admin']").forEach((button) => {
      button.addEventListener("click", () => deleteAdmin(button.dataset.id));
    });
  }
}

function renderUserCards(rows) {
  const container = $("usersCards");
  if (!container) return;
  const canDeleteUsers = isSuperAdmin();
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No buyers yet.</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map((user) => `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(user.full_name || "-")}</h3>
        <p class="mobile-card-meta">${escapeHtml(user.email || "-")} · ${escapeHtml(user.phone || "-")}</p>
        <p class="mobile-card-meta">${escapeHtml(user.country_code || "-")} · ${user.is_active ? "Active" : "Inactive"}</p>
        <p class="mobile-card-meta">${format(user.created_at)}</p>
        ${canDeleteUsers ? `<div class="mobile-card-actions"><button type="button" class="danger-button" data-action="delete-user" data-id="${user.id}">Delete user</button></div>` : ""}
      </article>
    `)
    .join("");
  if (canDeleteUsers) {
    container.querySelectorAll("[data-action='delete-user']").forEach((button) => {
      button.addEventListener("click", () => deleteUser(button.dataset.id));
    });
  }
}

function renderBatchCards(rows) {
  const container = $("batchesCards");
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No batches yet.</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map((batch) => {
      return `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(batch.batch_code)}</h3>
        <p class="mobile-card-meta">${escapeHtml(format(batch.batch_date))} · ${escapeHtml(prettyBatchStatus(batch.status))}</p>
        <p class="mobile-card-meta">${escapeHtml(prettyTransportMode(batch.transport_mode))} · ${escapeHtml(batch.current_location || "-")}</p>
        <p class="mobile-card-meta">${format(batch.order_count)} orders · NGN ${format(batch.total_ngn_collected)}</p>
        <p class="mobile-card-meta">Checklist: ${escapeHtml(batchChecklistSummary(batch))}</p>
        <div class="mobile-card-actions">
           ${isSuperAdmin() ? `<button type="button" class="secondary-button" data-action="edit-batch" data-id="${batch.id}">Details</button>` : ""}
           ${renderBatchActionButtons(batch)}
         </div>
       </article>
    `;
    })
    .join("");
  container.querySelectorAll("[data-action='edit-batch']").forEach((button) => {
    button.addEventListener("click", () => openBatchDialog(button.dataset.id));
  });
  bindBatchWorkflowButtons(container);
}

function renderProductsTable() {
  const table = $("productsTable");
  table.innerHTML = "";
  const visibleProducts = state.products;
  updateCatalogControls();
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Image</th>
      <th>SKU</th>
      <th>Title</th>
      <th>Category</th>
      <th>Price</th>
      <th>Slash</th>
      <th>Stock</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  `;
  const tbody = document.createElement("tbody");
  if (!visibleProducts.length) {
    tbody.innerHTML = `<tr><td colspan="9">${state.products.length ? "No products match this search." : "No products uploaded yet."}</td></tr>`;
    table.append(thead, tbody);
    renderProductCards(visibleProducts);
    return;
  }
  for (const product of visibleProducts) {
    const row = document.createElement("tr");
    const imageUrl = displayImageUrl(product.image_urls?.[0] || "");
    const category = product.category_path?.[0] || "-";
    const statusClass = product.is_active ? "active" : "inactive";
    const statusLabel = product.is_active ? "Live" : "Hidden";
    row.innerHTML = `
      <td>${imageUrl ? `<img class="product-thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : "-"}</td>
      <td>${escapeHtml(product.sku)}</td>
      <td>${escapeHtml(product.title)}</td>
      <td>${escapeHtml(category)}</td>
      <td>${format(product.local_selling_price)}</td>
      <td>${product.compare_at_price ? format(product.compare_at_price) : "-"}</td>
      <td>${format(product.inventory_count)}</td>
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      <td class="table-actions">
        <button type="button" class="secondary-button" data-action="edit" data-id="${product.id}">Edit</button>
        <button type="button" class="danger-button" data-action="delete" data-id="${product.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => openEditDialog(button.dataset.id));
  });
  table.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.id));
  });
  renderProductCards(visibleProducts);
}

function renderProductCards(products) {
  const container = $("productsCards");
  if (!container) return;
  const rows = products || state.products;
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">${state.products.length ? "No products match this search." : "No products uploaded yet."}</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map((product) => {
      const imageUrl = displayImageUrl(product.image_urls?.[0] || "");
      const category = product.category_path?.[0] || "-";
      const statusClass = product.is_active ? "active" : "inactive";
      const statusLabel = product.is_active ? "Live" : "Hidden";
      return `
        <article class="mobile-card">
          <div class="mobile-card-head">
            ${imageUrl ? `<img class="product-thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : ""}
            <div>
              <h3 class="mobile-card-title">${escapeHtml(product.title)}</h3>
              <p class="mobile-card-meta">${escapeHtml(product.sku)} · ${escapeHtml(category)}</p>
              <p class="mobile-card-meta">${format(product.local_selling_price)}${product.compare_at_price ? ` · slash ${format(product.compare_at_price)}` : ""}</p>
              <p class="mobile-card-meta">Stock ${format(product.inventory_count)} · <span class="status-pill ${statusClass}">${statusLabel}</span></p>
            </div>
          </div>
          <div class="mobile-card-actions">
            <button type="button" class="secondary-button" data-action="edit" data-id="${product.id}">Edit</button>
            <button type="button" class="danger-button" data-action="delete" data-id="${product.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
  container.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => openEditDialog(button.dataset.id));
  });
  container.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.id));
  });
}

function updateCatalogControls() {
  const totalCount = state.productPage.total;
  const visibleCount = state.products.length;
  setText(
    "catalogSummary",
    totalCount
      ? `Showing ${visibleCount} of ${totalCount} matching products.`
      : "No products uploaded yet."
  );
  $("showMoreProductsButton").classList.toggle("hidden", !state.productPage.hasMore);
  $("collapseProductsButton").classList.toggle("hidden", visibleCount <= 25);
}

function renderOrderCards(rows) {
  const container = $("ordersCards");
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No orders yet.</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map(
      (row) => `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(row.email)}</h3>
        <p class="mobile-card-meta">${escapeHtml(row.status)} · ${escapeHtml(row.stage)}</p>
        <p class="mobile-card-meta">Total ${format(row.total_amount)} · Customs ${format(row.customs_fee)} · VAT ${format(row.vat_fee)}</p>
        <p class="mobile-card-meta">${format(row.created_at)}</p>
      </article>
    `
    )
    .join("");
}

function renderTransactionCards(rows) {
  const container = $("transactionsCards");
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No transactions yet.</p></article>`;
    return;
  }
  container.innerHTML = rows
    .map(
      (row) => `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(row.email)}</h3>
        <p class="mobile-card-meta">${escapeHtml(row.order_status)} · payment ${escapeHtml(row.payment_status)}</p>
        <p class="mobile-card-meta">${escapeHtml(row.currency)} ${format(row.total_amount)}</p>
        <p class="mobile-card-meta">${escapeHtml(row.flutterwave_tx_ref || "-")}</p>
      </article>
    `
    )
    .join("");
}

function openEditDialog(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    return;
  }
  const form = $("editProductForm");
  form.elements.id.value = product.id;
  form.elements.title.value = product.title || "";
  form.elements.description.value = product.description || "";
  form.elements.local_selling_price.value = product.local_selling_price || 0;
  form.elements.compare_at_price.value = product.compare_at_price || "";
  form.elements.inventory_count.value = product.inventory_count || 0;
  form.elements.is_active.checked = Boolean(product.is_active);
  form.elements.image_files.value = "";
  form.elements.image_urls.value = (product.image_urls || []).join("\n");
  renderEditImagePreview(product.image_urls || []);
  setText("editProductMeta", `SKU ${product.sku}`);
  setText("editProductStatus", "");
  $("editProductDialog").showModal();
}

function closeEditDialog() {
  $("editProductDialog").close();
}

function openBatchDialog(batchId) {
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return;
  const form = $("editBatchForm");
  form.elements.id.value = batch.id;
  form.elements.transport_mode.value = batch.transport_mode || "air";
  form.elements.current_location.value = batch.current_location || "";
  form.elements.notes.value = batch.notes || "";
  setText("editBatchMeta", `${batch.batch_code} · ${format(batch.batch_date)} · ${batch.order_count} orders`);
  setText("editBatchStatus", "");
  $("editBatchDialog").showModal();
}

function closeBatchDialog() {
  $("editBatchDialog").close();
}

function openResetAdminDialog(adminId) {
  const admin = state.admins.find((item) => item.id === adminId);
  if (!admin) return;
  state.resetAdminTarget = admin;
  const form = $("resetAdminForm");
  form.elements.id.value = admin.id;
  form.elements.password.value = "";
  form.elements.password.type = "password";
  const toggle = $("toggleResetAdminPassword");
  if (toggle) toggle.textContent = "Show";
  setText("resetAdminMeta", `${admin.full_name || "-"} · ${admin.email || "-"}`);
  setText("resetAdminStatus", "");
  $("resetAdminDialog").showModal();
}

function closeResetAdminDialog() {
  state.resetAdminTarget = null;
  $("resetAdminDialog").close();
}

async function saveProductEdits(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  const form = new FormData(formElement);
  const productId = String(form.get("id") || "");
  setText("editProductStatus", "");
  if (submitButton) submitButton.disabled = true;
  try {
    const currentImageUrls = parseImageUrls(String(form.get("image_urls") || ""));
    const uploadedUrls = await uploadProductImages(
      form.getAll("image_files").filter((file) => file instanceof File && file.size > 0),
      "editProductStatus"
    );
    await request(`/api/v1/admin/products/${productId}`, {
      method: "PATCH",
      body: {
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || ""),
        local_selling_price: Number(form.get("local_selling_price") || 0),
        compare_at_price: Number(form.get("compare_at_price") || 0),
        inventory_count: Number(form.get("inventory_count") || 0),
        is_active: form.get("is_active") === "on",
        image_urls: [...uploadedUrls, ...currentImageUrls]
      }
    });
    closeEditDialog();
    await loadProducts({ reset: true });
    setText("catalogStatus", "Product updated.");
    $("catalogStatus").className = "success";
  } catch (error) {
    $("editProductStatus").className = "error";
    setText("editProductStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function saveBatchEdits(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  const form = new FormData(formElement);
  const batchId = String(form.get("id") || "");
  setText("editBatchStatus", "");
  if (submitButton) submitButton.disabled = true;
  try {
    await request(`/api/v1/admin/batches/${batchId}`, {
      method: "PATCH",
      body: {
        transport_mode: String(form.get("transport_mode") || ""),
        current_location: String(form.get("current_location") || ""),
        notes: String(form.get("notes") || "")
      }
    });
    closeBatchDialog();
    await loadBatches();
    $("catalogStatus").className = "success";
    setText("catalogStatus", "Batch updated.");
  } catch (error) {
    $("editBatchStatus").className = "error";
    setText("editBatchStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function saveResetAdminPassword(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  const form = new FormData(formElement);
  const adminId = String(form.get("id") || "");
  setText("resetAdminStatus", "");
  if (submitButton) submitButton.disabled = true;
  try {
    await request(`/api/v1/admin/admins/${adminId}/password`, {
      method: "PATCH",
      body: {
        password: String(form.get("password") || "")
      }
    });
    closeResetAdminDialog();
    $("catalogStatus").className = "success";
    setText("catalogStatus", "Admin password reset.");
  } catch (error) {
    $("resetAdminStatus").className = "error";
    setText("resetAdminStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function deleteProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    return;
  }
  const confirmed = window.confirm(
    `Permanently delete "${product.title}" from the database and remove its images from storage? This cannot be undone.`
  );
  if (!confirmed) {
    return;
  }
  setText("catalogStatus", "");
  try {
    await request(`/api/v1/admin/products/${productId}`, { method: "DELETE" });
    await loadProducts({ reset: true });
    $("catalogStatus").className = "success";
    setText("catalogStatus", `Deleted ${product.sku} from catalog and storage.`);
  } catch (error) {
    $("catalogStatus").className = "error";
    setText("catalogStatus", error.message);
  }
}

async function deleteUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) {
    return;
  }
  const confirmed = window.confirm(
    `Delete buyer "${user.full_name}" and all associated orders, reviews, and history? This cannot be undone.`
  );
  if (!confirmed) {
    return;
  }
  setText("catalogStatus", "");
  try {
    await request(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
    await loadAdminDirectory();
    $("catalogStatus").className = "success";
    setText("catalogStatus", `Deleted ${user.full_name}.`);
  } catch (error) {
    $("catalogStatus").className = "error";
    setText("catalogStatus", error.message);
  }
}

async function deleteAdmin(adminId) {
  const admin = state.admins.find((item) => item.id === adminId);
  if (!admin) {
    return;
  }
  const confirmed = window.confirm(
    `Delete admin "${admin.full_name}"? Super admins only can remove admin accounts. This cannot be undone.`
  );
  if (!confirmed) {
    return;
  }
  setText("adminStatus", "");
  try {
    await request(`/api/v1/admin/admins/${adminId}`, { method: "DELETE" });
    await loadAdminDirectory();
    $("adminStatus").className = "success";
    setText("adminStatus", `Deleted ${admin.full_name}.`);
  } catch (error) {
    $("adminStatus").className = "error";
    setText("adminStatus", error.message);
  }
}

function isSuperAdmin() {
  return state.role === "super_admin";
}

function isCatalogAdmin() {
  return state.role === "catalog_admin";
}

function isProcurementAdmin() {
  return state.role === "procurement_admin";
}

function isCourierAdmin() {
  return state.role === "courier_admin";
}

function roleLabel(value) {
  switch (String(value || "").toLowerCase()) {
    case "super_admin":
      return "Super Admin";
    case "catalog_admin":
      return "Admin I";
    case "procurement_admin":
      return "Admin II";
    case "courier_admin":
      return "Admin III";
    default:
      return String(value || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

function sessionRoleLabel(value) {
  const role = String(value || "").trim().toLowerCase();
  if (!role) return "";
  return `${roleLabel(role)} · ${role}`;
}

function allowedTabsForRole(role = state.role) {
  switch (role) {
    case "super_admin":
      return ["overview", "products", "orders", "batches", "transactions", "admins", "support", "analytics", "complaints"];
    case "catalog_admin":
      return ["overview", "products", "orders", "batches", "transactions", "admins", "support", "analytics", "complaints"];
    case "procurement_admin":
    case "courier_admin":
      return ["batches"];
    default:
      return ["overview"];
  }
}

function configureRoleUi() {
  const allowedTabs = new Set(allowedTabsForRole());
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((button) => {
    button.classList.toggle("hidden", !allowedTabs.has(button.dataset.tab));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", !allowedTabs.has(panel.dataset.panel));
  });
  $("purchaseManifestPanel")?.classList.toggle("hidden", !manifestView.batchId);
  $("confirmDeliveredPanel")?.classList.toggle("hidden", !(isCourierAdmin() && deliveryView.batchId));
  $("paymentReconciliationForm")?.classList.toggle("hidden", !isSuperAdmin());
  const sessionName = $("sessionName");
  const sessionRole = $("sessionRole");
  if (sessionName) sessionName.textContent = state.fullName || "Signed in";
  if (sessionRole) sessionRole.textContent = sessionRoleLabel(state.role);
  setActiveTab(state.activeTab, { persist: false });
}

async function reconcileFlutterwavePayment(event) {
  event.preventDefault();
  if (!isSuperAdmin()) return;
  const form = event.currentTarget;
  const button = $("reconcilePaymentButton");
  const status = $("paymentReconciliationStatus");
  const values = new FormData(form);
  const orderId = String(values.get("order_id") || "").trim();
  const txRef = String(values.get("tx_ref") || "").trim();
  if (!orderId || !txRef) return;

  button.disabled = true;
  button.textContent = "Verifying…";
  status.className = "muted";
  status.textContent = "Checking the transaction directly with Flutterwave…";
  try {
    const result = await request("/api/v1/admin/payments/flutterwave/reconcile", {
      method: "POST",
      body: { order_id: orderId, tx_ref: txRef }
    });
    if (result.payment_state === "pending") {
      status.className = "error";
      status.textContent = `Flutterwave reports ${result.gateway_status || "pending"}; no order data was changed.`;
      return;
    }
    status.className = "success";
    status.textContent = `Payment verified. Order ${result.order_id} is now available in tracking and its daily batch.`;
    state.transactions = [];
    await Promise.allSettled([loadOverview(), loadNamedList("transactions", { reset: true })]);
  } catch (error) {
    status.className = "error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Verify and reconcile";
  }
}

function renderSession({ restoring = false } = {}) {
  const isAuthenticated = Boolean(state.token);
  $("authPanel").classList.toggle("hidden", isAuthenticated || restoring);
  $("dashboard").classList.toggle("hidden", !isAuthenticated || restoring);
  if (!restoring) document.documentElement.classList.remove("admin-session-restoring");
  if (isAuthenticated && !restoring) {
    configureRoleUi();
  }
}

async function restoreSession() {
  try {
    const session = await request("/api/v1/admin/session");
    state.role = session.role || "";
    state.adminId = session.admin_id || "";
    state.fullName = session.full_name || "";
    localStorage.setItem("across.admin.role", state.role);
    localStorage.setItem("across.admin.adminId", state.adminId);
    localStorage.setItem("across.admin.fullName", state.fullName);
    hydrateAdminCache();
    initializeAdminDrafts();
    renderSession();
    await loadDashboard({ force: true });
    startAdminActivityPolling();
  } catch (error) {
    if (error.status === 401) {
      logout();
      setText("authError", "Your session expired. Sign in again.");
      return;
    }
    // Keep the token for a retry, but never reveal protected UI from stale
    // local role data when the server could not validate the session.
    document.documentElement.classList.remove("admin-session-restoring");
    $("authPanel").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
    setText("authError", `Unable to verify your session right now. ${error.message}`);
  }
}

function logout() {
  stopAdminActivityPolling();
  state.token = "";
  state.adminId = "";
  state.role = "";
  state.fullName = "";
  for (const key of ["token", "adminId", "role", "fullName", "activeTab"]) {
    localStorage.removeItem(`across.admin.${key}`);
  }
  clearAdminCache();
  clearAdminDrafts();
  renderSession();
}

async function request(path, options = {}) {
  const response = await fetch(`${state.apiUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.auth === false ? {} : { Authorization: `Bearer ${state.token}` })
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }
  if (!response.ok) {
    const error = new Error(data.message || data.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function updateListControls(name, rows) {
  const view = state.listViews[name];
  setText(`${name}Summary`, `Showing ${rows.length} of ${view.total} matching ${name}.`);
  const button = document.querySelector(`[data-list-toggle="${name}"]`);
  if (!button) return;
  if (!view.hasMore && rows.length <= 25) {
    button.textContent = "";
  } else if (!view.hasMore) {
    button.textContent = "Collapse";
  } else {
    button.textContent = "Load 25 more";
  }
}

function setListLoading(name, isLoading) {
  if (!isLoading) return;
  const table = $(`${name}Table`);
  if (table) {
    table.innerHTML = `<tbody>${Array.from({ length: 5 }, () =>
      `<tr><td colspan="8"><span class="skeleton-line"></span></td></tr>`
    ).join("")}</tbody>`;
  }
  const cards = $(`${name}Cards`);
  if (cards) {
    cards.innerHTML = `<article class="mobile-card"><span class="skeleton-line"></span></article>`;
  }
  setText(`${name}Summary`, "Loading…");
}

function renderNamedList(name) {
  if (name === "admins") return renderAdminsTable();
  if (name === "users") return renderUsersTable();
  if (name === "batches") return renderBatchesTable();
  if (name === "orders") {
    const rows = state.orders;
    renderTable("ordersTable", ["email", "status", "stage", "total_amount", "customs_fee", "vat_fee", "created_at"], rows);
    renderOrderCards(rows);
    return updateListControls(name, state.orders);
  }
  if (name === "transactions") {
    const rows = state.transactions;
    renderTable("transactionsTable", ["email", "order_status", "payment_status", "total_amount", "flutterwave_tx_ref", "flutterwave_transaction_id"], rows);
    renderTransactionCards(rows);
    updateListControls(name, state.transactions);
  }
}

function showListError(name, error) {
  const statusId = name === "products" ? "catalogStatus" : name === "batches" ? "batchStatus" : null;
  if (statusId) {
    $(statusId).className = "error";
    setText(statusId, error.message);
  }
}

function adminCacheKey(name) {
  return `across.admin.cache.v1:${state.apiUrl}:${state.role}:${name}`;
}

function writeAdminCache(name, value) {
  try {
    sessionStorage.setItem(adminCacheKey(name), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Cache failures must never block live data.
  }
}

function readAdminCache(name) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(adminCacheKey(name)) || "null");
    if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) return null;
    return cached.value;
  } catch {
    return null;
  }
}

function hydrateAdminCache() {
  const overview = readAdminCache("overview");
  if (overview) {
    setText("orderCount", overview.order_count ?? 0);
    setText("transactionCount", overview.transaction_count ?? 0);
    setText("manifestCount", overview.manifest_count ?? overview.batch_count ?? 0);
  }
  const products = readAdminCache("products");
  if (products?.rows) {
    state.products = products.rows;
    Object.assign(state.productPage, products.page, { loading: false, requestSeq: 0 });
    renderProductsTable();
  }
  for (const name of Object.keys(listEndpoints)) {
    const cached = readAdminCache(name);
    if (!cached?.rows) continue;
    state[name] = cached.rows;
    Object.assign(state.listViews[name], cached.page, { loading: false, requestSeq: 0 });
    renderNamedList(name);
  }
}

function clearAdminCache() {
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith("across.admin.cache.v1:")) sessionStorage.removeItem(key);
  }
}

function renderListFailure(name, error) {
  const rows = name === "products" ? state.products : state[name];
  const summaryId = name === "products" ? "catalogSummary" : `${name}Summary`;
  if (rows?.length) {
    setText(summaryId, `Showing cached data. Refresh failed: ${error.message}`);
    return;
  }
  const table = $(`${name}Table`);
  if (table) {
    table.innerHTML = `<tbody><tr><td colspan="9">Unable to load data: ${escapeHtml(error.message)}</td></tr></tbody>`;
  }
  const cards = $(`${name}Cards`);
  if (cards) {
    cards.innerHTML = `<article class="mobile-card"><p class="error">Unable to load data: ${escapeHtml(error.message)}</p></article>`;
  }
  setText(summaryId, "Data unavailable.");
}

const ADMIN_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_DRAFT_FORM_IDS = ["productForm", "adminForm", "complaintForm"];

function adminDraftKey(formId) {
  return `across.admin.draft.v1:${state.apiUrl}:${state.adminId}:${formId}`;
}

function isDraftSafeField(field) {
  const type = String(field.type || "").toLowerCase();
  const identity = String(field.name || field.id || "").toLowerCase();
  return !field.disabled
    && !["password", "file", "hidden", "submit", "button"].includes(type)
    && !/(password|secret|token|card|cvv|pin)/.test(identity);
}

function serializeFormDraft(form) {
  const values = {};
  for (const field of Array.from(form.elements)) {
    if (!isDraftSafeField(field)) continue;
    const key = field.name || field.id;
    if (!key) continue;
    values[key] = field.type === "checkbox" ? field.checked : field.value;
  }
  return values;
}

function restoreFormDraft(form) {
  try {
    const saved = JSON.parse(localStorage.getItem(adminDraftKey(form.id)) || "null");
    if (!saved || Date.now() - saved.savedAt > ADMIN_DRAFT_TTL_MS) {
      localStorage.removeItem(adminDraftKey(form.id));
      return;
    }
    let restored = 0;
    for (const field of Array.from(form.elements)) {
      if (!isDraftSafeField(field)) continue;
      const key = field.name || field.id;
      if (!key || !(key in saved.values)) continue;
      if (field.type === "checkbox") field.checked = Boolean(saved.values[key]);
      else field.value = String(saved.values[key] ?? "");
      restored += 1;
    }
    if (restored) setDraftHint(form, `Draft restored from ${new Date(saved.savedAt).toLocaleString()}.`);
  } catch {
    localStorage.removeItem(adminDraftKey(form.id));
  }
}

function saveFormDraft(form) {
  const values = serializeFormDraft(form);
  const hasContent = Object.values(values).some((value) => value !== "" && value !== false);
  if (!hasContent) {
    clearFormDraft(form);
    return;
  }
  try {
    localStorage.setItem(adminDraftKey(form.id), JSON.stringify({ savedAt: Date.now(), values }));
    setDraftHint(form, "Draft saved on this device.");
  } catch {
    setDraftHint(form, "Draft could not be saved on this device.");
  }
}

function clearFormDraft(form) {
  if (!form?.id || !state.adminId) return;
  localStorage.removeItem(adminDraftKey(form.id));
  form.querySelector("[data-draft-hint]")?.remove();
}

function setDraftHint(form, message) {
  let hint = form.querySelector("[data-draft-hint]");
  if (!hint) {
    hint = document.createElement("p");
    hint.dataset.draftHint = "true";
    hint.className = "muted draft-hint";
    form.appendChild(hint);
  }
  hint.textContent = message;
}

function initializeAdminDrafts() {
  if (!state.adminId) return;
  for (const formId of ADMIN_DRAFT_FORM_IDS) {
    const form = $(formId);
    if (!form || form.dataset.draftBound === "true") continue;
    form.dataset.draftBound = "true";
    restoreFormDraft(form);
    const persist = debounce(() => saveFormDraft(form), 350);
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
  }
}

function clearAdminDrafts() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("across.admin.draft.v1:")) localStorage.removeItem(key);
  }
}

function debounce(fn, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

async function uploadProductImages(files, statusId = "productStatus") {
  const urls = [];
  for (const file of files) {
    setText(statusId, `Uploading ${file.name}...`);
    const presign = await request("/api/v1/admin/uploads/presign", {
      method: "POST",
      body: {
        filename: file.name,
        mimeType: file.type || "image/jpeg",
        kind: "image",
        scope: "products"
      }
    });
    await putFile(presign.uploadUrl, file, file.type || "image/jpeg");
    urls.push(presign.viewUrl || presign.publicUrl);
  }
  return urls.filter(Boolean);
}

async function putFile(uploadUrl, file, mimeType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}. Check S3 CORS and bucket credentials.`);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Upload timed out. The file may be too large or the network is slow. If this repeats with a small image, check S3 CORS and backend AWS credentials.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function setActiveTab(tab, options = {}) {
  const allowedTabs = allowedTabsForRole();
  const knownTabs = new Set(allowedTabs);
  const nextTab = knownTabs.has(tab) ? tab : allowedTabs[0] || "overview";
  state.activeTab = nextTab;
  if (options.persist !== false) {
    localStorage.setItem("across.admin.activeTab", nextTab);
  }
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === nextTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== nextTab || !knownTabs.has(panel.dataset.panel));
  });
}

const manifestView = { batchId: "", items: [], cursor: "", total: 0, hasMore: false, query: "", loading: false };
const deliveryView = { batchId: "", orders: [], cursor: "", total: 0, hasMore: false, query: "", loading: false };
const selectedDeliveredOrders = new Set();

const batchActionDefinitions = {
  collecting_funds: [{ action: "close_collection", label: "Close today's batch early", description: "Stops new paid orders from entering this batch. Normally it closes automatically after the Lagos business day.", roles: ["super_admin", "catalog_admin"] }],
  closed: [{ action: "approve_procurement", label: "Approve for procurement", description: "Confirms vendors have been paid and releases the product checklist to Admin II.", roles: ["super_admin", "catalog_admin"] }],
  settled: [{ action: "approve_procurement", label: "Approve for procurement", description: "Confirms vendors have been paid and releases the product checklist to Admin II.", roles: ["super_admin", "catalog_admin"] }],
  funds_sent_to_procurement: [{ action: "start_procurement", label: "Start procurement", description: "Opens the checklist so each product can be marked purchased or unavailable.", roles: ["procurement_admin"] }],
  procurement_acknowledged: [{ action: "start_procurement", label: "Start procurement", description: "Opens the checklist so each product can be marked purchased or unavailable.", roles: ["procurement_admin"] }],
  purchasing: [{ action: "dispatch", label: "Finish procurement and dispatch", description: "Use this after every checklist item is resolved and the shipment has left China for Nigeria.", roles: ["procurement_admin"] }],
  procurement_complete: [{ action: "dispatch", label: "Finish procurement and dispatch", description: "Confirms the completed procurement has left China for Nigeria.", roles: ["procurement_admin"] }],
  enroute_nigeria: [{ action: "confirm_ready_for_pickup", label: "Confirm received and ready for pickup", description: "Check the received shipment against the product checklist, then enter the buyer pickup details.", roles: ["courier_admin"] }],
  arrived_local: [{ action: "ready_for_pickup", label: "Confirm ready for pickup", description: "Enter the pickup details to notify buyers that their packages are ready.", roles: ["courier_admin"] }]
};

function canUseBatchAction(definition) {
  return definition.roles.includes(state.role);
}

function renderBatchActionButtons(batch) {
  const definitions = batchActionDefinitions[batch.status] || [];
  const transitionButtons = definitions
    .filter(canUseBatchAction)
    .map((definition) => `<button type="button" data-batch-transition="${definition.action}" data-id="${batch.id}">${escapeHtml(definition.label)}</button>`);
  const canViewManifest = ["closed", "settled", "funds_sent_to_procurement", "procurement_acknowledged", "purchasing", "procurement_complete", "enroute_nigeria", "arrived_local", "ready_for_pickup", "completed"].includes(batch.status);
  if (canViewManifest) {
    transitionButtons.push(`<button type="button" class="secondary-button" data-action="purchase-manifest" data-id="${batch.id}">View product checklist</button>`);
  }
  if (isCourierAdmin() && batch.status === "ready_for_pickup") {
    transitionButtons.push(`<button type="button" class="secondary-button" data-action="confirm-delivered" data-id="${batch.id}">Deliver</button>`);
  }
  return transitionButtons.join("");
}

function bindBatchWorkflowButtons(root) {
  root.querySelectorAll("[data-batch-transition]").forEach((button) => {
    button.addEventListener("click", () => openBatchTransitionDialog(button.dataset.id, button.dataset.batchTransition));
  });
  root.querySelectorAll("[data-action='purchase-manifest']").forEach((button) => {
    button.addEventListener("click", () => openPurchaseManifest(button.dataset.id));
  });
  root.querySelectorAll("[data-action='confirm-delivered']").forEach((button) => {
    button.addEventListener("click", () => openConfirmDelivered(button.dataset.id));
  });
}

function openBatchTransitionDialog(batchId, action) {
  const batch = state.batches.find((item) => item.id === batchId);
  const definition = (batchActionDefinitions[batch?.status] || []).find((item) => item.action === action);
  if (!batch || !definition || !canUseBatchAction(definition)) return;
  const form = $("batchTransitionForm");
  form.reset();
  form.elements.batch_id.value = batch.id;
  form.elements.action.value = action;
  form.elements.expected_version.value = String(batch.version || 0);
  setText("batchTransitionTitle", definition.label);
  setText("batchTransitionMeta", `${batch.batch_code} · ${prettyBatchStatus(batch.status)} · version ${batch.version || 1}`);
  setText("batchTransitionGuidance", definition.description || "");
  setText("batchTransitionStatus", "");
  const needsFunds = action === "send_procurement_funds";
  const needsArrival = action === "confirm_arrival";
  const needsPickup = ["ready_for_pickup", "confirm_ready_for_pickup"].includes(action);
  const needsManifestCheck = action === "confirm_ready_for_pickup";
  $("transitionAmountField").classList.toggle("hidden", !needsFunds);
  $("transitionCurrencyField").classList.toggle("hidden", !needsFunds);
  $("transitionReferenceField").classList.toggle("hidden", !needsFunds);
  $("transitionLocationField").classList.toggle("hidden", !needsArrival);
  $("transitionPickupLocationField").classList.toggle("hidden", !needsPickup);
  $("transitionPickupPhoneField").classList.toggle("hidden", !needsPickup);
  $("transitionManifestCheckField").classList.toggle("hidden", !needsManifestCheck);
  form.elements.amount.required = needsFunds;
  form.elements.reference.required = needsFunds;
  form.elements.location.required = needsArrival;
  form.elements.pickup_location.required = needsPickup;
  form.elements.pickup_phone.required = needsPickup;
  form.elements.manifest_checked.required = needsManifestCheck;
  $("submitBatchTransitionButton").textContent = definition.label;
  $("batchTransitionDialog").showModal();
}

function closeBatchTransitionDialog() {
  $("batchTransitionDialog").close();
}

async function submitBatchTransition(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  const form = new FormData(formElement);
  const batchId = String(form.get("batch_id") || "");
  if (!batchId) return;
  if (submitButton) submitButton.disabled = true;
  try {
    await request(`/api/v1/admin/batches/${batchId}/transitions`, {
      method: "POST",
      body: {
        action: String(form.get("action") || ""),
        expected_version: Number(form.get("expected_version") || 0),
        amount: Number(form.get("amount") || 0),
        currency: String(form.get("currency") || "NGN"),
        reference: String(form.get("reference") || "").trim(),
        location: String(form.get("location") || "").trim(),
        pickup_location: String(form.get("pickup_location") || "").trim(),
        pickup_phone: String(form.get("pickup_phone") || "").trim(),
        manifest_checked: form.get("manifest_checked") === "on",
        notes: String(form.get("notes") || "").trim()
      }
    });
    closeBatchTransitionDialog();
    await loadNamedList("batches", { reset: true });
    $("batchStatus").className = "success";
    setText("batchStatus", "Batch handoff completed successfully.");
  } catch (error) {
    $("batchTransitionStatus").className = "error";
    setText("batchTransitionStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function batchLabel(batchId) {
  return state.batches.find((batch) => batch.id === batchId)?.batch_code || batchId;
}

function openPurchaseManifest(batchId) {
  manifestView.batchId = batchId;
  manifestView.query = "";
  $("manifestSearch").value = "";
  $("closeManifestButton").classList.remove("hidden");
  $("purchaseManifestPanel").classList.remove("hidden");
  setText("purchaseManifestStatus", "");
  loadPurchaseManifest({ reset: true }).catch(showManifestError);
  $("purchaseManifestPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadPurchaseManifest({ append = false, reset = false } = {}) {
  if (!manifestView.batchId || (manifestView.loading && append)) return;
  if (reset) manifestView.cursor = "";
  manifestView.loading = true;
  if (!append) setWorkflowLoading("purchaseManifest");
  try {
    const params = new URLSearchParams({ limit: "25" });
    if (manifestView.query) params.set("search", manifestView.query);
    if (append && manifestView.cursor) params.set("cursor", manifestView.cursor);
    const data = await request(`/api/v1/admin/batches/${manifestView.batchId}/purchase-manifest?${params}`);
    manifestView.items = append ? [...manifestView.items, ...(data.items || [])] : (data.items || []);
    manifestView.cursor = data.page?.next_cursor || "";
    if (!append) manifestView.total = Number(data.page?.total || 0);
    manifestView.hasMore = Boolean(data.page?.has_more);
    renderPurchaseManifest();
  } finally {
    manifestView.loading = false;
  }
}

function renderPurchaseManifest() {
  const items = manifestView.items;
  const table = $("purchaseManifestTable");
  const activeBatch = state.batches.find((batch) => batch.id === manifestView.batchId);
  const canEditManifest = isProcurementAdmin() && activeBatch?.status === "purchasing";
  const rows = items.map((item) => {
    const status = item.purchase_status || "pending";
    const resolution = item.exception_resolution || "none";
    const canResolve = canEditManifest && status === "failed" && ["none", "pending"].includes(resolution);
    const imageUrl = displayImageUrl(manifestImageURLs(item)[0] || "");
    const variant = formatManifestDetails(item.variant);
    const supplier = manifestSupplierText(item);
    const hub = manifestHubText(item);
    return `<tr>
      <td><div class="manifest-product">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : ""}
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(manifestDescription(item))}</p></div>
      </div></td>
      <td><strong>${escapeHtml(item.sku)}</strong><br><span class="muted">${escapeHtml(variant || "Standard")}</span></td>
      <td>${format(item.quantity)}<br><span class="muted">CNY ${format(manifestSupplierCost(item))} each</span></td>
      <td>${escapeHtml(supplier)}<br><span class="muted">${escapeHtml(hub)}</span></td>
      <td><strong>${escapeHtml(item.package_label || item.order_id)}</strong><br><span class="muted">${escapeHtml(item.buyer_name)} · ${escapeHtml(item.buyer_phone || item.buyer_email || "-")}</span></td>
      <td><span class="status-pill ${status === "purchased" ? "active" : status === "failed" ? "inactive" : ""}">${escapeHtml(manifestStatusLabel(status))}</span></td>
      <td>${escapeHtml(status === "failed" ? `${resolution}: ${item.purchase_notes || ""}` : "-")}</td>
      <td>${canEditManifest && status === "pending" ? `<div class="table-actions">
        <button type="button" class="secondary-button" data-purchase-status="purchased" data-item-id="${item.item_id}">Purchased</button>
        <button type="button" class="danger-button" data-purchase-status="failed" data-item-id="${item.item_id}">Unavailable</button>
      </div>` : canResolve ? `<button type="button" class="secondary-button" data-purchase-status="failed" data-item-id="${item.item_id}">Update resolution</button>` : "—"}</td>
    </tr>`;
  }).join("");
  table.innerHTML = `<thead><tr><th>Product</th><th>SKU / Variant</th><th>Quantity</th><th>Supplier / Hub</th><th>Package / Buyer</th><th>Procurement</th><th>Exception</th><th>Action</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8">No matching manifest items.</td></tr>`}</tbody>`;
  $("purchaseManifestCards").innerHTML = items.map((item) => {
    const status = item.purchase_status || "pending";
    const resolution = item.exception_resolution || "none";
    const canResolve = canEditManifest && status === "failed" && ["none", "pending"].includes(resolution);
    const imageUrl = displayImageUrl(manifestImageURLs(item)[0] || "");
    return `<article class="mobile-card">
      <div class="manifest-product">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : ""}<div>
        <h3 class="mobile-card-title">${escapeHtml(item.title)}</h3>
        <p class="mobile-card-meta">${escapeHtml(manifestDescription(item))}</p>
      </div></div>
      <p class="mobile-card-meta"><strong>${escapeHtml(item.sku)}</strong> · ${escapeHtml(formatManifestDetails(item.variant) || "Standard")}</p>
      <p class="mobile-card-meta">Quantity ${format(item.quantity)} · CNY ${format(manifestSupplierCost(item))} each</p>
      <p class="mobile-card-meta">Supplier: ${escapeHtml(manifestSupplierText(item))}</p>
      <p class="mobile-card-meta">Hub: ${escapeHtml(manifestHubText(item))}</p>
      <p class="mobile-card-meta">Package: ${escapeHtml(item.package_label || item.order_id)} · ${escapeHtml(item.buyer_name)}</p>
      <p class="mobile-card-meta">Procurement: ${escapeHtml(manifestStatusLabel(status))}</p>
      ${status === "failed" ? `<p class="mobile-card-meta">${escapeHtml(`${resolution}: ${item.purchase_notes || ""}`)}</p>` : ""}
      ${canEditManifest && status === "pending" ? `<div class="mobile-card-actions">
        <button type="button" class="secondary-button" data-purchase-status="purchased" data-item-id="${item.item_id}">Purchased</button>
        <button type="button" class="danger-button" data-purchase-status="failed" data-item-id="${item.item_id}">Unavailable</button>
      </div>` : canResolve ? `<div class="mobile-card-actions"><button type="button" class="secondary-button" data-purchase-status="failed" data-item-id="${item.item_id}">Update resolution</button></div>` : ""}
    </article>`;
  }).join("");
  for (const root of [table, $("purchaseManifestCards")]) {
    root.querySelectorAll("[data-purchase-status]").forEach((button) => {
      button.addEventListener("click", () => confirmPurchaseItem(button.dataset.itemId, button.dataset.purchaseStatus));
    });
  }
  setText("purchaseManifestMeta", `${batchLabel(manifestView.batchId)} · complete ordered-product checklist`);
  setText("manifestSummary", `Showing ${items.length} of ${manifestView.total} matching items.`);
  $("loadMoreManifestButton").classList.toggle("hidden", !manifestView.hasMore);
}

function formatManifestDetails(details) {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" · ");
}

function manifestSupplierText(item) {
  const factory = item.product_snapshot?.factory_details || item.factory_details || {};
  return formatManifestDetails(factory) || "Supplier details not recorded";
}

function manifestHubText(item) {
  const hub = item.product_snapshot?.origin_hub || {};
  return [hub.code || item.origin_hub_code, hub.name || item.origin_hub_name, hub.city || item.origin_hub_city, hub.address || item.origin_hub_address].filter(Boolean).join(" · ") || "No origin hub recorded";
}

function manifestDescription(item) {
  return item.product_snapshot?.description || item.description || "No description";
}

function manifestImageURLs(item) {
  const images = item.product_snapshot?.image_urls;
  return Array.isArray(images) ? images : (item.image_urls || []);
}

function manifestSupplierCost(item) {
  return Number(item.product_snapshot?.supplier_cost_rmb ?? item.supplier_cost_rmb ?? 0);
}

function manifestStatusLabel(status) {
  return status === "failed" ? "Unavailable" : status === "purchased" ? "Purchased" : "Pending";
}

async function confirmPurchaseItem(itemId, purchaseStatus) {
  if (purchaseStatus === "failed") {
    openManifestExceptionDialog(itemId);
    return;
  }
  try {
    await request(`/api/v1/admin/batches/${manifestView.batchId}/purchase-confirm`, {
      method: "POST",
      body: {
        items: [{
          order_item_id: itemId,
          purchase_status: purchaseStatus,
          purchase_notes: "",
          exception_resolution: "none"
        }]
      }
    });
    setText("purchaseManifestStatus", `Item marked as ${purchaseStatus}.`);
    await loadPurchaseManifest({ reset: true });
  } catch (error) {
    showManifestError(error);
  }
}

function openManifestExceptionDialog(itemId) {
  const item = manifestView.items.find((entry) => entry.item_id === itemId);
  if (!item) return;
  const form = $("manifestExceptionForm");
  form.reset();
  form.elements.item_id.value = itemId;
  form.elements.purchase_notes.value = item.purchase_notes || "";
  form.elements.exception_resolution.value = ["pending", "refunded", "substituted", "cancelled"].includes(item.exception_resolution)
    ? item.exception_resolution
    : "pending";
  setText("manifestExceptionMeta", `${item.title} · ${item.sku} · quantity ${item.quantity}`);
  setText("manifestExceptionStatus", "");
  $("manifestExceptionDialog").showModal();
}

function closeManifestExceptionDialog() {
  $("manifestExceptionDialog").close();
}

async function submitManifestException(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitButton = formElement.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await request(`/api/v1/admin/batches/${manifestView.batchId}/purchase-confirm`, {
      method: "POST",
      body: {
        items: [{
          order_item_id: String(form.get("item_id") || ""),
          purchase_status: "failed",
          purchase_notes: String(form.get("purchase_notes") || "").trim(),
          exception_resolution: String(form.get("exception_resolution") || "pending")
        }]
      }
    });
    closeManifestExceptionDialog();
    setText("purchaseManifestStatus", "Unavailable product and resolution saved.");
    await loadPurchaseManifest({ reset: true });
  } catch (error) {
    setText("manifestExceptionStatus", error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function showManifestError(error) {
  $("purchaseManifestStatus").className = "error";
  setText("purchaseManifestStatus", error.message);
}

$("closeManifestButton").addEventListener("click", () => {
  manifestView.batchId = "";
  manifestView.items = [];
  $("closeManifestButton").classList.add("hidden");
  $("purchaseManifestPanel").classList.add("hidden");
  setText("purchaseManifestMeta", "Select a closed or active batch to view its ordered products.");
  $("purchaseManifestTable").innerHTML = "";
  $("purchaseManifestCards").innerHTML = "";
});
$("loadMoreManifestButton").addEventListener("click", () => loadPurchaseManifest({ append: true }).catch(showManifestError));
$("manifestSearch").addEventListener("input", debounce(() => {
  manifestView.query = $("manifestSearch").value.trim();
  loadPurchaseManifest({ reset: true }).catch(showManifestError);
}, 250));

function openConfirmDelivered(batchId) {
  deliveryView.batchId = batchId;
  deliveryView.query = "";
  selectedDeliveredOrders.clear();
  $("deliveredOrdersSearch").value = "";
  setText("confirmDeliveredStatus", "");
  $("confirmDeliveredPanel").classList.remove("hidden");
  loadDeliveredOrders({ reset: true }).catch(showDeliveryError);
  $("confirmDeliveredPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadDeliveredOrders({ append = false, reset = false } = {}) {
  if (!deliveryView.batchId || (deliveryView.loading && append)) return;
  if (reset) deliveryView.cursor = "";
  deliveryView.loading = true;
  if (!append) setWorkflowLoading("deliveredOrders");
  try {
    const params = new URLSearchParams({ limit: "25", deliverable: "true" });
    if (deliveryView.query) params.set("search", deliveryView.query);
    if (append && deliveryView.cursor) params.set("cursor", deliveryView.cursor);
    const data = await request(`/api/v1/admin/batches/${deliveryView.batchId}/orders?${params}`);
    deliveryView.orders = append ? [...deliveryView.orders, ...(data.orders || [])] : (data.orders || []);
    deliveryView.cursor = data.page?.next_cursor || "";
    if (!append) deliveryView.total = Number(data.page?.total || 0);
    deliveryView.hasMore = Boolean(data.page?.has_more);
    renderDeliveredOrders();
  } finally {
    deliveryView.loading = false;
  }
}

function renderDeliveredOrders() {
  const orders = deliveryView.orders;
  const row = (order) => `<label class="selection-row">
    <input type="checkbox" data-delivery-order="${order.id}" ${selectedDeliveredOrders.has(order.id) ? "checked" : ""} />
    <span>${escapeHtml(order.email || "-")} · ${escapeHtml(order.package_label || "-")} · ${escapeHtml(order.stage || "-")}</span>
  </label>`;
  $("deliveredOrdersTable").innerHTML = `<thead><tr><th>Select order</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>${orders.map((order) => `<tr><td>${row(order)}</td><td>${escapeHtml(order.currency)} ${format(order.total_amount)}</td><td>${escapeHtml(order.status)}</td></tr>`).join("")
      || `<tr><td colspan="3">No matching deliverable orders.</td></tr>`}</tbody>`;
  $("deliveredOrdersCards").innerHTML = orders.map((order) => `<article class="mobile-card">${row(order)}
    <p class="mobile-card-meta">${escapeHtml(order.currency)} ${format(order.total_amount)} · ${escapeHtml(order.status)}</p></article>`).join("");
  for (const root of [$("deliveredOrdersTable"), $("deliveredOrdersCards")]) {
    root.querySelectorAll("[data-delivery-order]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedDeliveredOrders.add(checkbox.dataset.deliveryOrder);
        else selectedDeliveredOrders.delete(checkbox.dataset.deliveryOrder);
        syncDeliverySelection();
      });
    });
  }
  setText("confirmDeliveredMeta", `${batchLabel(deliveryView.batchId)} deliverable orders`);
  setText("deliveredOrdersSummary", `Showing ${orders.length} of ${deliveryView.total} matching orders.`);
  $("loadMoreDeliveredButton").classList.toggle("hidden", !deliveryView.hasMore);
  syncDeliverySelection();
}

function syncDeliverySelection() {
  document.querySelectorAll("[data-delivery-order]").forEach((checkbox) => {
    checkbox.checked = selectedDeliveredOrders.has(checkbox.dataset.deliveryOrder);
  });
  $("confirmDeliveredButton").classList.toggle("hidden", selectedDeliveredOrders.size === 0);
  $("confirmDeliveredButton").textContent = `Mark ${selectedDeliveredOrders.size} selected as delivered`;
}

function showDeliveryError(error) {
  $("confirmDeliveredStatus").className = "error";
  setText("confirmDeliveredStatus", error.message);
}

$("loadMoreDeliveredButton").addEventListener("click", () => loadDeliveredOrders({ append: true }).catch(showDeliveryError));
$("deliveredOrdersSearch").addEventListener("input", debounce(() => {
  deliveryView.query = $("deliveredOrdersSearch").value.trim();
  loadDeliveredOrders({ reset: true }).catch(showDeliveryError);
}, 250));
$("confirmDeliveredButton").addEventListener("click", async () => {
  if (!selectedDeliveredOrders.size) return;
  try {
    const data = await request("/api/v1/admin/batches/confirm-delivered", {
      method: "POST",
      body: { batch_id: deliveryView.batchId, order_ids: [...selectedDeliveredOrders] }
    });
    selectedDeliveredOrders.clear();
    setText("confirmDeliveredStatus", `${data.count || 0} orders marked delivered; buyers notified.`);
    await loadDeliveredOrders({ reset: true });
  } catch (error) {
    showDeliveryError(error);
  }
});

function setWorkflowLoading(prefix) {
  $(`${prefix}Table`).innerHTML = `<tbody><tr><td><span class="skeleton-line"></span></td></tr></tbody>`;
  $(`${prefix}Cards`).innerHTML = `<article class="mobile-card"><span class="skeleton-line"></span></article>`;
}

function prettyBatchStatus(value) {
  const labels = {
    collecting_funds: "Collecting today's paid orders",
    closed: "Waiting for procurement approval",
    settled: "Waiting for procurement approval",
    funds_sent_to_procurement: "Approved - waiting for Admin II",
    procurement_acknowledged: "Approved - waiting for Admin II",
    purchasing: "Admin II procuring products",
    procurement_complete: "Procurement complete - awaiting dispatch",
    enroute_nigeria: "En route to Nigeria",
    arrived_local: "Received in Nigeria - preparing pickup",
    sorted: "Ready for buyer pickup",
    ready_for_pickup: "Ready for buyer pickup",
    completed: "Completed"
  };
  return labels[value] || String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function batchChecklistSummary(batch) {
  const purchased = Number(batch.purchased_items || 0);
  const pending = Number(batch.pending_items || 0);
  const failed = Number(batch.failed_items || 0);
  return `${purchased} purchased · ${pending} pending · ${failed} unavailable`;
}

function prettyRole(value) {
  return roleLabel(value);
}

function prettyTransportMode(value) {
  return String(value || "").toUpperCase();
}

function parseImageUrls(value) {
  return String(value || "")
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
}

function renderEditImagePreview(urls) {
  const container = $("editImagePreviewList");
  if (!container) return;
  const cleanUrls = (urls || []).filter(Boolean);
  if (!cleanUrls.length) {
    container.innerHTML = `<span class="muted">No images saved for this product.</span>`;
    return;
  }
  container.innerHTML = cleanUrls
    .map((url) => {
      const src = displayImageUrl(url);
      return `
        <figure class="image-preview-item">
          <img src="${escapeHtml(src)}" alt="" loading="lazy" />
          <figcaption>${escapeHtml(shortUrl(url))}</figcaption>
        </figure>
      `;
    })
    .join("");
}

function displayImageUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("user-uploads/")) {
    return `${state.apiUrl}/api/v1/public/images/view/${encodeKeyPath(raw)}`;
  }
  const marker = "/api/v1/public/images/view/";
  const markerIndex = raw.indexOf(marker);
  if (markerIndex >= 0) {
    return `${state.apiUrl}${raw.slice(markerIndex)}`;
  }
  if (/^https:\/\/[^/]+\.s3[.-][^/]*amazonaws\.com\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return `${state.apiUrl}/api/v1/public/images/view/${encodeKeyPath(decodeURIComponent(url.pathname.replace(/^\/+/, "")))}`;
    } catch {
      return raw;
    }
  }
  return raw;
}

function encodeKeyPath(key) {
  return String(key || "")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function shortUrl(url) {
  const value = String(url || "");
  if (value.length <= 42) return value;
  return `${value.slice(0, 20)}...${value.slice(-16)}`;
}

function updateSkuPreview() {
  const skuInput = productForm.elements.sku;
  if (skuInput.value.trim()) return;
  const title = String(productForm.elements.title.value || "");
  const category = String(productForm.elements.category.value || "");
  skuInput.placeholder = title ? `${categoryPrefixes[category] || "PRD"}-${slugPart(title)}-AUTO` : "Auto-generated if blank";
}

function slugPart(value) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
}

function renderTable(id, columns, rows) {
  const table = $(id);
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map((column) => `<th>${label(column)}</th>`).join("")}</tr>`;
  const tbody = document.createElement("tbody");
  tbody.innerHTML = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${format(row[column])}</td>`).join("")}</tr>`)
    .join("");
  table.append(thead, tbody);
}

function label(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function format(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-NG").format(value);
  }
  if (typeof value === "string" && value.includes("T")) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

function escapeHtml(value) {
  var s = String(value);
  var map = {38: "amp", 60: "lt", 62: "gt", 34: "quot", 39: "#39"};
  return s.replace(/[&<>"']/g, function(m) { return "&" + map[m.charCodeAt(0)] + ";"; });
}

// ---- Support Tickets ----
let currentTicketId = null;

$("reloadTicketsButton").addEventListener("click", loadTickets);
$("closeTicketView").addEventListener("click", () => {
  currentTicketId = null;
  $("ticketMessages").classList.add("hidden");
});
$("sendTicketReply").addEventListener("click", sendTicketReply);

async function loadTickets() {
  try {
    const data = await request("/api/v1/admin/support/tickets");
    renderTicketsTable(data.tickets || []);
  } catch (error) {
    setText("ticketStatus", error.message);
  }
}

function renderTicketsTable(tickets) {
  const table = $("ticketsTable");
  if (!table) return;
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Subject</th><th>User</th><th>Status</th><th>Created</th><th>Actions</th></tr>`;
  const tbody = document.createElement("tbody");
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="5">No support tickets yet.</td></tr>`;
    table.append(thead, tbody);
    renderTicketCards(tickets);
    return;
  }
  for (const ticket of tickets) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(ticket.subject)}</td>
      <td>${escapeHtml(ticket.user_email)}</td>
      <td><span class="status-pill ${ticket.status === 'open' ? 'active' : ticket.status === 'responded' ? '' : 'inactive'}">${escapeHtml(ticket.status)}</span></td>
      <td>${format(ticket.created_at)}</td>
      <td class="table-actions">
        <button type="button" class="secondary-button" data-action="view-ticket" data-id="${ticket.id}" data-subject="${escapeHtml(ticket.subject)}">View</button>
        <button type="button" class="danger-button" data-action="close-ticket" data-id="${ticket.id}">Close</button>
      </td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='view-ticket']").forEach((btn) => {
    btn.addEventListener("click", () => openTicketView(btn.dataset.id, btn.dataset.subject));
  });
  table.querySelectorAll("[data-action='close-ticket']").forEach((btn) => {
    btn.addEventListener("click", () => closeTicket(btn.dataset.id));
  });
  renderTicketCards(tickets);
}

function renderTicketCards(tickets) {
  const container = $("ticketsCards");
  if (!container) return;
  if (!tickets.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No support tickets yet.</p></article>`;
    return;
  }
  container.innerHTML = tickets.map(t => `
    <article class="mobile-card">
      <h3 class="mobile-card-title">${escapeHtml(t.subject)}</h3>
      <p class="mobile-card-meta">${escapeHtml(t.user_email)} · <span class="status-pill ${t.status === 'open' ? 'active' : t.status === 'responded' ? '' : 'inactive'}">${escapeHtml(t.status)}</span></p>
      <p class="mobile-card-meta">${format(t.created_at)}</p>
      <div class="mobile-card-actions">
        <button type="button" class="secondary-button" data-action="view-ticket" data-id="${t.id}" data-subject="${escapeHtml(t.subject)}">View</button>
        <button type="button" class="danger-button" data-action="close-ticket" data-id="${t.id}">Close</button>
      </div>
    </article>
  `).join("");
  container.querySelectorAll("[data-action='view-ticket']").forEach((btn) => {
    btn.addEventListener("click", () => openTicketView(btn.dataset.id, btn.dataset.subject));
  });
  container.querySelectorAll("[data-action='close-ticket']").forEach((btn) => {
    btn.addEventListener("click", () => closeTicket(btn.dataset.id));
  });
}

async function openTicketView(ticketId, subject) {
  currentTicketId = ticketId;
  setText("ticketSubject", subject);
  $("ticketMessages").classList.remove("hidden");
  setText("ticketStatus", "");
  try {
    const data = await request(`/api/v1/admin/support/tickets/${ticketId}/messages`);
    const messages = data.messages || [];
    const container = $("ticketMessagesList");
    container.innerHTML = messages.map(m => `
      <div style="margin-bottom:12px;padding:12px;border-radius:8px;background:${m.sender_type === 'admin' ? '#EAF8F2' : '#FFFFFF'};border:1px solid #D9E0DD;">
        <p style="font-weight:700;font-size:12px;color:#66736F;margin-bottom:4px;">${m.sender_type === 'admin' ? 'Admin' : 'User'}</p>
        <p style="color:#191919;font-size:14px;">${escapeHtml(m.message)}</p>
        <p style="font-size:11px;color:#8C8C8C;margin-top:4px;">${format(m.created_at)}</p>
      </div>
    `).join("");
  } catch (error) {
    setText("ticketStatus", error.message);
  }
}

async function sendTicketReply() {
  if (!currentTicketId) return;
  const message = $("ticketReplyInput").value.trim();
  if (!message) return;
  setText("ticketStatus", "");
  try {
    await request(`/api/v1/admin/support/tickets/${currentTicketId}/reply`, {
      method: "POST",
      body: { message }
    });
    $("ticketReplyInput").value = "";
    await openTicketView(currentTicketId, $("ticketSubject").textContent);
    await loadTickets();
  } catch (error) {
    setText("ticketStatus", error.message);
  }
}

async function closeTicket(ticketId) {
  if (!confirm("Close this ticket?")) return;
  try {
    await request(`/api/v1/admin/support/tickets/${ticketId}/close`, { method: "POST" });
    if (currentTicketId === ticketId) {
      currentTicketId = null;
      $("ticketMessages").classList.add("hidden");
    }
    await loadTickets();
  } catch (error) {
    setText("ticketStatus", error.message);
  }
}

// ---- Analytics ----
$("reloadAnalyticsButton").addEventListener("click", loadAnalytics);

async function loadAnalytics() {
  setText("analyticsSummary", "Loading...");
  try {
    const data = await request("/api/v1/admin/analytics/daily-sales");
    const isSuper = state.role === "super_admin";
    const daily = data.daily || [];
    const totalOrders = data.total_orders || 0;
    const totalRevenue = data.total_revenue || 0;

    setText("analyticsSummary", `Total orders: ${format(totalOrders)}${isSuper ? ' · Total revenue: NGN ' + format(totalRevenue) : ''}`);

    // Stats cards
    const statsHtml = daily.slice(0, 7).map(d => `
      <article class="stat">
        <span>${new Date(d.date).toLocaleDateString()}</span>
        <strong>${d.order_count} orders</strong>
        ${isSuper && d.total_revenue ? `<span>NGN ${format(d.total_revenue)}</span>` : ''}
      </article>
    `).join("");
    $("analyticsStats").innerHTML = statsHtml || '<p class="muted">No sales data yet.</p>';

    // Simple bar chart
    const chartContainer = $("salesChart");
    if (daily.length === 0) {
      chartContainer.innerHTML = '<p class="muted">No sales data to chart.</p>';
      return;
    }
    const maxVal = Math.max(...daily.map(d => isSuper ? (d.total_revenue || 0) : d.order_count));
    chartContainer.innerHTML = '<div style="display:flex;align-items:end;gap:4px;height:180px;padding:8px 0;">' +
      daily.slice(0, 14).reverse().map(d => {
        const val = isSuper ? (d.total_revenue || 0) : d.order_count;
        const pct = maxVal > 0 ? (val / maxVal * 100) : 0;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
          <div style="width:100%;background:#FF4747;border-radius:4px 4px 0 0;height:${Math.max(pct, 2)}%;min-height:4px;" title="${new Date(d.date).toLocaleDateString()}: ${val}"></div>
          <span style="font-size:9px;color:#8C8C8C;margin-top:4px;writing-mode:vertical-lr;">${new Date(d.date).toLocaleDateString().slice(0,5)}</span>
        </div>`;
      }).join('') + '</div>';

    // Load profit/loss for super admin
    if (isSuper) {
      try {
        const pl = await request("/api/v1/admin/analytics/profit-loss");
        const entries = pl.profit_loss || [];
        if (entries.length > 0) {
          const totalProfit = entries.reduce((s, e) => s + (e.profit || 0), 0);
          const totalRefunds = entries.reduce((s, e) => s + (e.refunds || 0), 0);
          chartContainer.innerHTML += `
            <div class="stats-grid" style="margin-top:16px;">
              <article class="stat"><span>Net Profit</span><strong style="color:#12805F;">NGN ${format(totalProfit)}</strong></article>
              <article class="stat"><span>Total Refunds</span><strong style="color:#B42318;">NGN ${format(totalRefunds)}</strong></article>
              <article class="stat"><span>Complaints</span><strong>${entries.reduce((s, e) => s + (e.complaints || 0), 0)}</strong></article>
            </div>`;
        }
      } catch {}
    }
  } catch (error) {
    setText("analyticsSummary", error.message);
  }
}

// ---- Complaints ----
$("reloadComplaintsButton").addEventListener("click", loadComplaints);
$("complaintForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  setText("complaintStatus", "");
  try {
    await request("/api/v1/admin/analytics/complaints", {
      method: "POST",
      body: {
        order_id: form.get("order_id"),
        product_id: form.get("product_id"),
        description: form.get("description"),
        refund_amount: Number(form.get("refund_amount") || 0)
      }
    });
    event.currentTarget.reset();
    clearFormDraft(event.currentTarget);
    setText("complaintStatus", "Complaint logged.");
    $("complaintStatus").className = "success";
    await loadComplaints();
  } catch (error) {
    $("complaintStatus").className = "error";
    setText("complaintStatus", error.message);
  }
});

async function loadComplaints() {
  try {
    const data = await request("/api/v1/admin/analytics/complaints");
    renderComplaintsTable(data.complaints || []);
  } catch (error) {
    setText("complaintStatus", error.message);
  }
}

function renderComplaintsTable(complaints) {
  const table = $("complaintsTable");
  if (!table) return;
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Product</th><th>User</th><th>Description</th><th>Refund</th><th>Status</th><th>Date</th><th>Actions</th></tr>`;
  const tbody = document.createElement("tbody");
  if (!complaints.length) {
    tbody.innerHTML = `<tr><td colspan="7">No complaints yet.</td></tr>`;
    table.append(thead, tbody);
    renderComplaintCards(complaints);
    return;
  }
  for (const c of complaints) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(c.product_title)}</td>
      <td>${escapeHtml(c.user_email)}</td>
      <td>${escapeHtml(c.description)}</td>
      <td>NGN ${format(c.refund_amount)}</td>
      <td><span class="status-pill ${c.status === 'resolved' ? 'active' : ''}">${escapeHtml(c.status)}</span></td>
      <td>${format(c.created_at)}</td>
      <td class="table-actions">${c.status === 'unresolved' ? `<button type="button" class="secondary-button" data-action="resolve-complaint" data-id="${c.id}">Resolve</button>` : '-'}</td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='resolve-complaint']").forEach(btn => {
    btn.addEventListener("click", () => resolveComplaint(btn.dataset.id));
  });
  renderComplaintCards(complaints);
}

function renderComplaintCards(complaints) {
  const container = $("complaintsCards");
  if (!container) return;
  if (!complaints.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No complaints yet.</p></article>`;
    return;
  }
  container.innerHTML = complaints.map(c => `
    <article class="mobile-card">
      <h3 class="mobile-card-title">${escapeHtml(c.product_title)}</h3>
      <p class="mobile-card-meta">${escapeHtml(c.user_email)} · NGN ${format(c.refund_amount)}</p>
      <p class="mobile-card-meta">${escapeHtml(c.description)}</p>
      <p class="mobile-card-meta"><span class="status-pill ${c.status === 'resolved' ? 'active' : ''}">${escapeHtml(c.status)}</span> · ${format(c.created_at)}</p>
      ${c.status === 'unresolved' ? `<div class="mobile-card-actions"><button type="button" class="secondary-button" data-action="resolve-complaint" data-id="${c.id}">Resolve</button></div>` : ''}
    </article>
  `).join("");
  container.querySelectorAll("[data-action='resolve-complaint']").forEach(btn => {
    btn.addEventListener("click", () => resolveComplaint(btn.dataset.id));
  });
}

async function resolveComplaint(complaintId) {
  if (!confirm("Mark this complaint as resolved?")) return;
  try {
    await request(`/api/v1/admin/analytics/complaints/${complaintId}/resolve`, { method: "POST" });
    await loadComplaints();
  } catch (error) {
    setText("complaintStatus", error.message);
  }
}

