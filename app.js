const state = {
  apiUrl: localStorage.getItem("across.admin.apiUrl") || "https://atlanticexpress-api.sportbanter.online",
  token: localStorage.getItem("across.admin.token") || "",
  role: localStorage.getItem("across.admin.role") || "",
  fullName: localStorage.getItem("across.admin.fullName") || "",
  products: [],
  batches: [],
  admins: [],
  users: [],
  productSearch: "",
  productLimit: 25,
  activeTab: localStorage.getItem("across.admin.activeTab") || "overview",
  resetAdminTarget: null
};

const $ = (id) => document.getElementById(id);
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
renderSession();

if (state.token) {
  loadDashboard().catch((error) => {
    state.token = "";
    localStorage.removeItem("across.admin.token");
    renderSession();
    setText("authError", `Session expired. Sign in again. ${error.message}`);
  });
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
    state.role = data.role || "";
    state.fullName = data.full_name || "";
    localStorage.setItem("across.admin.token", state.token);
    localStorage.setItem("across.admin.role", state.role);
    localStorage.setItem("across.admin.fullName", state.fullName);
    renderSession();
    await loadDashboard();
  } catch (error) {
    setText("authError", error.message);
  }
});

$("refreshButton").addEventListener("click", loadDashboard);
$("logoutButton").addEventListener("click", () => {
  state.token = "";
  state.role = "";
  state.fullName = "";
  localStorage.removeItem("across.admin.token");
  localStorage.removeItem("across.admin.role");
  localStorage.removeItem("across.admin.fullName");
  renderSession();
});
$("reloadProductsButton").addEventListener("click", loadProducts);
$("reloadBatchesButton").addEventListener("click", loadBatches);
$("reloadAdminsButton").addEventListener("click", loadAdminDirectory);
$("productSearch").addEventListener("input", () => {
  state.productSearch = $("productSearch").value.trim();
  state.productLimit = 25;
  renderProductsTable();
});
$("showMoreProductsButton").addEventListener("click", () => {
  state.productLimit += 25;
  renderProductsTable();
});
$("collapseProductsButton").addEventListener("click", () => {
  state.productLimit = 25;
  renderProductsTable();
  document.querySelector("[data-panel='products']")?.scrollIntoView({ block: "start" });
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
$("closeResetAdminDialog").addEventListener("click", closeResetAdminDialog);
$("cancelResetAdminButton").addEventListener("click", closeResetAdminDialog);
$("resetAdminForm").addEventListener("submit", saveResetAdminPassword);
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
    if (button.dataset.tab === "products") {
      loadProducts().catch((error) => setText("catalogStatus", error.message));
    } else if (button.dataset.tab === "batches") {
      loadBatches().catch((error) => setText("catalogStatus", error.message));
    }
  });
});

setActiveTab(state.activeTab, { persist: false });

document.querySelectorAll(".mobile-nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
    if (button.dataset.tab === "products") {
      loadProducts().catch((error) => setText("catalogStatus", error.message));
    } else if (button.dataset.tab === "batches") {
      loadBatches().catch((error) => setText("catalogStatus", error.message));
    }
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
    updateSkuPreview();
    $("productStatus").className = "success";
    setText("productStatus", `Product added with SKU ${product.sku}. It will appear in the mobile catalog on refresh.`);
    await loadProducts();
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
    $("adminStatus").className = "success";
    setText("adminStatus", "Admin created.");
  } catch (error) {
    $("adminStatus").className = "error";
    setText("adminStatus", error.message);
  }
});

async function loadDashboard() {
  const canSeeCommerce = isSuperAdmin() || isCatalogAdmin();
  const canSeeOps = isSuperAdmin() || isProcurementAdmin() || isCourierAdmin();
  const canSeeDirectory = isSuperAdmin() || isCatalogAdmin();

  state.admins = [];
  state.users = [];
  state.products = [];
  state.batches = [];

  if (canSeeCommerce) {
    const [orders, transactions, manifest] = await Promise.all([
      request("/api/v1/admin/orders"),
      request("/api/v1/admin/transactions"),
      request("/api/v1/admin/manifest/pending")
    ]);
    $("orderCount").textContent = orders.orders.length;
    $("transactionCount").textContent = transactions.transactions.length;
    $("manifestCount").textContent = manifest.items.length;
    renderTable("ordersTable", ["email", "status", "stage", "total_amount", "customs_fee", "vat_fee", "created_at"], orders.orders);
    renderTable("transactionsTable", ["email", "order_status", "payment_status", "total_amount", "flutterwave_tx_ref", "flutterwave_transaction_id"], transactions.transactions);
    renderOrderCards(orders.orders);
    renderTransactionCards(transactions.transactions);
    await loadProducts();
  } else {
    $("orderCount").textContent = "0";
    $("transactionCount").textContent = "0";
    $("manifestCount").textContent = "0";
    renderTable("ordersTable", ["email", "status", "stage", "total_amount", "customs_fee", "vat_fee", "created_at"], []);
    renderTable("transactionsTable", ["email", "order_status", "payment_status", "total_amount", "flutterwave_tx_ref", "flutterwave_transaction_id"], []);
    renderOrderCards([]);
    renderTransactionCards([]);
  }

  if (canSeeDirectory) {
    await loadAdminDirectory();
  } else {
    renderAdminsTable();
    renderUsersTable();
  }

  if (canSeeOps) {
    await loadBatches();
  } else {
    renderBatchesTable();
  }
}

async function loadProducts() {
  setText("catalogStatus", "");
  const data = await request("/api/v1/admin/products");
  state.products = data.products || [];
  renderProductsTable();
}

async function loadBatches() {
  setText("batchStatus", "");
  const data = await request("/api/v1/admin/batches");
  state.batches = data.batches || [];
  renderBatchesTable();
}

async function loadAdminDirectory() {
  const [admins, users] = await Promise.all([
    request("/api/v1/admin/admins"),
    request("/api/v1/admin/users")
  ]);
  state.admins = admins.admins || [];
  state.users = users.users || [];
  renderAdminsTable();
  renderUsersTable();
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
      <th>Actions</th>
    </tr>
  `;
  const tbody = document.createElement("tbody");
  if (!state.batches.length) {
    tbody.innerHTML = `<tr><td colspan="8">No batches yet.</td></tr>`;
    table.append(thead, tbody);
    renderBatchCards([]);
    return;
  }
  for (const batch of state.batches) {
    const row = document.createElement("tr");
    const isProcurement = isProcurementAdmin() || isSuperAdmin();
    const isCourier = isCourierAdmin() || isSuperAdmin();
    row.innerHTML = `
      <td>${escapeHtml(batch.batch_code)}</td>
      <td>${format(batch.batch_date)}</td>
      <td>${escapeHtml(prettyBatchStatus(batch.status))}</td>
      <td>${escapeHtml(prettyTransportMode(batch.transport_mode))}</td>
      <td>${escapeHtml(batch.current_location || "-")}</td>
      <td>${format(batch.order_count)}</td>
      <td>${format(batch.total_ngn_collected)}</td>
      <td class="table-actions">
        <button type="button" class="secondary-button" data-action="edit-batch" data-id="${batch.id}">Update</button>
        ${isProcurement ? `<button type="button" class="secondary-button" data-action="purchase-manifest" data-id="${batch.id}">Manifest</button>` : ''}
        ${isCourier ? `<button type="button" class="secondary-button" data-action="confirm-arrival" data-id="${batch.id}">Arrival</button>` : ''}
        ${isCourier ? `<button type="button" class="secondary-button" data-action="confirm-delivered" data-id="${batch.id}">Deliver</button>` : ''}
      </td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='edit-batch']").forEach((button) => {
    button.addEventListener("click", () => openBatchDialog(button.dataset.id));
  });
  table.querySelectorAll("[data-action='purchase-manifest']").forEach((button) => {
    button.addEventListener("click", () => openPurchaseManifest(button.dataset.id));
  });
  table.querySelectorAll("[data-action='confirm-arrival']").forEach((button) => {
    button.addEventListener("click", () => openConfirmArrival(button.dataset.id));
  });
  table.querySelectorAll("[data-action='confirm-delivered']").forEach((button) => {
    button.addEventListener("click", () => openConfirmDelivered(button.dataset.id));
  });
  renderBatchCards(state.batches);
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
  if (!state.admins.length) {
    tbody.innerHTML = `<tr><td colspan="${canManageAdmins ? 6 : 5}">No admins yet.</td></tr>`;
    table.append(thead, tbody);
    renderAdminCards([]);
    return;
  }
  for (const admin of state.admins) {
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
  renderAdminCards(state.admins);
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
  if (!state.users.length) {
    tbody.innerHTML = `<tr><td colspan="${canDeleteUsers ? 7 : 6}">No buyers yet.</td></tr>`;
    table.append(thead, tbody);
    renderUserCards([]);
    return;
  }
  for (const user of state.users) {
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
  renderUserCards(state.users);
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
    .map((batch) => `
      <article class="mobile-card">
        <h3 class="mobile-card-title">${escapeHtml(batch.batch_code)}</h3>
        <p class="mobile-card-meta">${escapeHtml(format(batch.batch_date))} Ã‚· ${escapeHtml(prettyBatchStatus(batch.status))}</p>
        <p class="mobile-card-meta">${escapeHtml(prettyTransportMode(batch.transport_mode))} Ã‚· ${escapeHtml(batch.current_location || "-")}</p>
        <p class="mobile-card-meta">${format(batch.order_count)} orders Ã‚· NGN ${format(batch.total_ngn_collected)}</p>
        <div class="mobile-card-actions">
          <button type="button" class="secondary-button" data-action="edit-batch" data-id="${batch.id}">Update</button>
        </div>
      </article>
    `)
    .join("");
  container.querySelectorAll("[data-action='edit-batch']").forEach((button) => {
    button.addEventListener("click", () => openBatchDialog(button.dataset.id));
  });
}

function renderProductsTable() {
  const table = $("productsTable");
  table.innerHTML = "";
  const filteredProducts = getFilteredProducts();
  const visibleProducts = filteredProducts.slice(0, state.productLimit);
  updateCatalogControls(filteredProducts.length, visibleProducts.length);
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
  const rows = products || getFilteredProducts().slice(0, state.productLimit);
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
              <p class="mobile-card-meta">${escapeHtml(product.sku)} Ã‚· ${escapeHtml(category)}</p>
              <p class="mobile-card-meta">${format(product.local_selling_price)}${product.compare_at_price ? ` Ã‚· slash ${format(product.compare_at_price)}` : ""}</p>
              <p class="mobile-card-meta">Stock ${format(product.inventory_count)} Ã‚· <span class="status-pill ${statusClass}">${statusLabel}</span></p>
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

function getFilteredProducts() {
  const query = state.productSearch.toLowerCase();
  if (!query) {
    return state.products;
  }
  return state.products.filter((product) => {
    const haystack = [
      product.sku,
      product.title,
      product.description,
      product.category_path?.join(" "),
      product.is_active ? "live active visible" : "hidden inactive"
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function updateCatalogControls(filteredCount, visibleCount) {
  const totalCount = state.products.length;
  const hasMore = visibleCount < filteredCount;
  setText(
    "catalogSummary",
    totalCount
      ? `Showing ${visibleCount} of ${filteredCount} matching products (${totalCount} total).`
      : "No products uploaded yet."
  );
  $("showMoreProductsButton").classList.toggle("hidden", !hasMore);
  $("collapseProductsButton").classList.toggle("hidden", !(filteredCount > 25 && visibleCount > 25));
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
        <p class="mobile-card-meta">${escapeHtml(row.status)} Ã‚· ${escapeHtml(row.stage)}</p>
        <p class="mobile-card-meta">Total ${format(row.total_amount)} Ã‚· Customs ${format(row.customs_fee)} Ã‚· VAT ${format(row.vat_fee)}</p>
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
        <p class="mobile-card-meta">${escapeHtml(row.order_status)} - payment ${escapeHtml(row.payment_status)}</p>
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
  form.elements.status.value = batch.status || "collecting_funds";
  form.elements.transport_mode.value = batch.transport_mode || "air";
  form.elements.current_location.value = batch.current_location || "";
  form.elements.notes.value = batch.notes || "";
  setText("editBatchMeta", `${batch.batch_code} Ã‚· ${format(batch.batch_date)} Ã‚· ${batch.order_count} orders`);
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
  setText("resetAdminMeta", `${admin.full_name || "-"} Ã‚· ${admin.email || "-"}`);
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
    await loadProducts();
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
        status: String(form.get("status") || ""),
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
    await loadProducts();
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

function allowedTabsForRole(role = state.role) {
  switch (role) {
    case "super_admin":
      return ["overview", "products", "orders", "batches", "transactions", "admins", "support", "analytics", "complaints"];
    case "catalog_admin":
      return ["overview", "products", "orders", "transactions", "admins", "support", "analytics", "complaints"];
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
  const sessionName = $("sessionName");
  const sessionRole = $("sessionRole");
  if (sessionName) sessionName.textContent = state.fullName || "Signed in";
  if (sessionRole) sessionRole.textContent = roleLabel(state.role);
  setActiveTab(state.activeTab, { persist: false });
}

function renderSession() {
  const isAuthenticated = Boolean(state.token);
  $("authPanel").classList.toggle("hidden", isAuthenticated);
  $("dashboard").classList.toggle("hidden", !isAuthenticated);
  if (isAuthenticated) {
    configureRoleUi();
  }
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
    throw new Error(data.message || data.error || `Request failed: ${response.status}`);
  }
  return data;
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

// ---- Admin II: Purchase Manifest ----
let currentManifestBatchId = null;

function openPurchaseManifest(batchId) {
  currentManifestBatchId = batchId;
  const batch = state.batches.find(b => b.id === batchId);
  setText("purchaseManifestMeta", `Loading manifest for ${batch ? batch.batch_code : batchId}...`);
  $("closeManifestButton").classList.remove("hidden");
  $("purchaseManifestStatus").className = "success";
  setText("purchaseManifestStatus", "");
  void loadPurchaseManifest(batchId);
}

$("closeManifestButton").addEventListener("click", () => {
  currentManifestBatchId = null;
  $("closeManifestButton").classList.add("hidden");
  setText("purchaseManifestMeta", "Select a batch to view its purchase manifest.");
  $("purchaseManifestTable").innerHTML = "";
  $("purchaseManifestCards").innerHTML = "";
});

async function loadPurchaseManifest(batchId) {
  try {
    const data = await request(`/api/v1/admin/batches/${batchId}/purchase-manifest`);
    const items = data.items || [];
    const batch = state.batches.find(b => b.id === batchId);
    setText("purchaseManifestMeta", `${batch ? batch.batch_code : batchId} · ${items.length} item(s)`);
    renderPurchaseManifest(items);
  } catch (error) {
    setText("purchaseManifestMeta", "Failed to load manifest");
    $("purchaseManifestStatus").className = "error";
    setText("purchaseManifestStatus", error.message);
  }
}

function renderPurchaseManifest(items) {
  const table = $("purchaseManifestTable");
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Buyer</th><th>SKU</th><th>Title</th><th>Qty</th><th>Price</th><th>Status</th><th>Actions</th></tr>`;
  const tbody = document.createElement("tbody");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7">No items in this batch.</td></tr>`;
    table.append(thead, tbody);
    $("purchaseManifestCards").innerHTML = "";
    return;
  }
  for (const item of items) {
    const row = document.createElement("tr");
    const status = item.purchase_status || "pending";
    row.innerHTML = `
      <td>${escapeHtml(item.buyer_name)}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${item.quantity}</td>
      <td>NGN ${format(item.unit_price)}</td>
      <td><span class="status-pill ${status === 'purchased' ? 'active' : status === 'failed' ? 'inactive' : ''}">${escapeHtml(status)}</span></td>
      <td class="table-actions">
        ${status === 'pending' ? `
          <button type="button" class="secondary-button" data-action="mark-purchased" data-item-id="${item.item_id}">Purchased</button>
          <button type="button" class="danger-button" data-action="mark-failed" data-item-id="${item.item_id}">Failed</button>
        ` : `<span class="muted">${status === 'purchased' ? 'Done' : 'Failed'}</span>`}
      </td>`;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);

  // Mobile cards
  $("purchaseManifestCards").innerHTML = items.map(item => {
    const status = item.purchase_status || "pending";
    return `<article class="mobile-card">
      <h3 class="mobile-card-title">${escapeHtml(item.title)}</h3>
      <p class="mobile-card-meta">${escapeHtml(item.buyer_name)} · ${item.sku} · ${item.quantity} × NGN ${format(item.unit_price)}</p>
      <p class="mobile-card-meta"><span class="status-pill ${status === 'purchased' ? 'active' : status === 'failed' ? 'inactive' : ''}">${escapeHtml(status)}</span></p>
      ${status === 'pending' ? `<div class="mobile-card-actions">
        <button type="button" class="secondary-button" data-action="mark-purchased" data-item-id="${item.item_id}">Purchased</button>
        <button type="button" class="danger-button" data-action="mark-failed" data-item-id="${item.item_id}">Failed</button>
      </div>` : ''}
    </article>`;
  }).join("");

  // Attach event listeners
  table.querySelectorAll("[data-action='mark-purchased']").forEach(btn => {
    btn.addEventListener("click", () => confirmPurchaseItem(btn.dataset.itemId, "purchased"));
  });
  table.querySelectorAll("[data-action='mark-failed']").forEach(btn => {
    btn.addEventListener("click", () => confirmPurchaseItem(btn.dataset.itemId, "failed"));
  });
  $("purchaseManifestCards").querySelectorAll("[data-action='mark-purchased']").forEach(btn => {
    btn.addEventListener("click", () => confirmPurchaseItem(btn.dataset.itemId, "purchased"));
  });
  $("purchaseManifestCards").querySelectorAll("[data-action='mark-failed']").forEach(btn => {
    btn.addEventListener("click", () => confirmPurchaseItem(btn.dataset.itemId, "failed"));
  });
}

async function confirmPurchaseItem(orderItemId, status) {
  if (!currentManifestBatchId) return;
  setText("purchaseManifestStatus", "");
  try {
    await request(`/api/v1/admin/batches/${currentManifestBatchId}/purchase-confirm`, {
      method: "POST",
      body: { items: [{ order_item_id: orderItemId, purchase_status: status, purchase_notes: "" }] }
    });
    $("purchaseManifestStatus").className = "success";
    setText("purchaseManifestStatus", `Item marked as ${status}.`);
    await loadPurchaseManifest(currentManifestBatchId);
    await loadBatches();
  } catch (error) {
    $("purchaseManifestStatus").className = "error";
    setText("purchaseManifestStatus", error.message);
  }
}

// ---- Admin III: Confirm Arrival ----
$("confirmArrivalForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const batchId = $("arrivalBatchId").value;
  if (!batchId) return;
  setText("confirmArrivalStatus", "");
  try {
    await request(`/api/v1/admin/batches/${batchId}/confirm-arrival`, {
      method: "POST",
      body: {
        pickup_location: $("arrivalPickupLocation").value.trim(),
        pickup_phone: $("arrivalPickupPhone").value.trim(),
        notes: $("arrivalNotes").value.trim()
      }
    });
    $("confirmArrivalStatus").className = "success";
    setText("confirmArrivalStatus", "Arrival confirmed! Buyers have been notified.");
    $("arrivalBatchId").value = "";
    $("arrivalPickupLocation").value = "";
    $("arrivalPickupPhone").value = "";
    $("arrivalNotes").value = "";
    setText("confirmArrivalMeta", "Mark a batch as arrived at local hub.");
    await loadBatches();
  } catch (error) {
    $("confirmArrivalStatus").className = "error";
    setText("confirmArrivalStatus", error.message);
  }
});

function openConfirmArrival(batchId) {
  const batch = state.batches.find(b => b.id === batchId);
  $("arrivalBatchId").value = batchId;
  setText("confirmArrivalMeta", `Confirm arrival for ${batch ? batch.batch_code : batchId}`);
  $("arrivalPickupLocation").value = "";
  $("arrivalPickupPhone").value = "";
  $("arrivalNotes").value = "";
  setText("confirmArrivalStatus", "");
  $("confirmArrivalForm").scrollIntoView({ behavior: "smooth" });
}

// ---- Admin III: Confirm Delivered ----
let currentDeliveredBatchId = null;
let selectedDeliveredOrders = new Set();

function openConfirmDelivered(batchId) {
  currentDeliveredBatchId = batchId;
  selectedDeliveredOrders = new Set();
  const batch = state.batches.find(b => b.id === batchId);
  setText("confirmDeliveredMeta", `Loading orders for ${batch ? batch.batch_code : batchId}...`);
  $("confirmDeliveredButton").classList.add("hidden");
  setText("confirmDeliveredStatus", "");
  void loadDeliveredOrders(batchId);
}

async function loadDeliveredOrders(batchId) {
  try {
    const data = await request(`/api/v1/admin/batches/${batchId}/orders`);
    const orders = data.orders || [];
    const batch = state.batches.find(b => b.id === batchId);
    setText("confirmDeliveredMeta", `${batch ? batch.batch_code : batchId} · ${orders.length} order(s)`);
    renderDeliveredOrders(orders);
  } catch (error) {
    setText("confirmDeliveredMeta", "Failed to load orders");
    $("confirmDeliveredStatus").className = "error";
    setText("confirmDeliveredStatus", error.message);
  }
}

function renderDeliveredOrders(orders) {
  const table = $("deliveredOrdersTable");
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Select</th><th>Buyer</th><th>Items</th><th>Amount</th><th>Status</th><th>Tracking</th></tr>`;
  const tbody = document.createElement("tbody");
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="6">No orders in this batch.</td></tr>`;
    table.append(thead, tbody);
    $("deliveredOrdersCards").innerHTML = "";
    $("confirmDeliveredButton").classList.add("hidden");
    return;
  }

  const deliverable = orders.filter(o => o.current_tracking_stage !== "Delivered" && o.current_tracking_stage !== "Completed");
  if (deliverable.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">All orders in this batch are already delivered or completed.</td></tr>`;
    table.append(thead, tbody);
    $("deliveredOrdersCards").innerHTML = "";
    $("confirmDeliveredButton").classList.add("hidden");
    return;
  }

  for (const order of deliverable) {
    const row = document.createElement("tr");
    const checked = selectedDeliveredOrders.has(order.id) ? "checked" : "";
    row.innerHTML = `
      <td><input type="checkbox" data-order-id="${order.id}" ${checked} /></td>
      <td>${escapeHtml(order.user_name || order.user_email || "-")}</td>
      <td>${escapeHtml(order.items_summary || `${order.item_count} item(s)`)}</td>
      <td>NGN ${format(order.total_amount)}</td>
      <td>${escapeHtml(order.order_status)}</td>
      <td>${escapeHtml(order.current_tracking_stage || "-")}</td>`;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);

  // Mobile cards
  $("deliveredOrdersCards").innerHTML = deliverable.map(order => {
    const checked = selectedDeliveredOrders.has(order.id) ? "checked" : "";
    return `<article class="mobile-card">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" data-order-id="${order.id}" ${checked} />
        <div>
          <h3 class="mobile-card-title">${escapeHtml(order.items_summary || `${order.item_count} item(s)`)}</h3>
          <p class="mobile-card-meta">${escapeHtml(order.user_name || order.user_email || "-")} · NGN ${format(order.total_amount)}</p>
          <p class="mobile-card-meta">${escapeHtml(order.order_status)} · ${escapeHtml(order.current_tracking_stage || "-")}</p>
        </div>
      </label>
    </article>`;
  }).join("");

  // Attach checkbox listeners
  const updateSelected = () => {
    const checkboxes = table.querySelectorAll("input[type='checkbox']");
    selectedDeliveredOrders = new Set();
    checkboxes.forEach(cb => { if (cb.checked) selectedDeliveredOrders.add(cb.dataset.orderId); });
    $("confirmDeliveredButton").classList.toggle("hidden", selectedDeliveredOrders.size === 0);
    $("confirmDeliveredButton").textContent = `Mark ${selectedDeliveredOrders.size} Selected as Delivered`;
  };

  table.querySelectorAll("input[type='checkbox']").forEach(cb => cb.addEventListener("change", updateSelected));
  $("deliveredOrdersCards").querySelectorAll("input[type='checkbox']").forEach(cb => cb.addEventListener("change", updateSelected));
  updateSelected();
}

$("confirmDeliveredButton").addEventListener("click", async () => {
  if (selectedDeliveredOrders.size === 0) return;
  if (!confirm(`Mark ${selectedDeliveredOrders.size} order(s) as delivered?`)) return;
  setText("confirmDeliveredStatus", "");
  try {
    const data = await request("/api/v1/admin/batches/confirm-delivered", {
      method: "POST",
      body: { order_ids: Array.from(selectedDeliveredOrders) }
    });
    $("confirmDeliveredStatus").className = "success";
    setText("confirmDeliveredStatus", `${data.count} order(s) marked as delivered. Buyers notified.`);
    selectedDeliveredOrders = new Set();
    $("confirmDeliveredButton").classList.add("hidden");
    if (currentDeliveredBatchId) await loadDeliveredOrders(currentDeliveredBatchId);
    await loadBatches();
  } catch (error) {
    $("confirmDeliveredStatus").className = "error";
    setText("confirmDeliveredStatus", error.message);
  }
});

function prettyBatchStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

