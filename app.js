const state = {
  apiUrl: localStorage.getItem("across.admin.apiUrl") || "https://atlanticexpress-api.sportbanter.online",
  token: localStorage.getItem("across.admin.token") || "",
  role: localStorage.getItem("across.admin.role") || "",
  products: [],
  batches: [],
  admins: [],
  users: [],
  productSearch: "",
  productLimit: 25,
  activeTab: localStorage.getItem("across.admin.activeTab") || "overview"
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
    localStorage.setItem("across.admin.token", state.token);
    localStorage.setItem("across.admin.role", state.role);
    renderSession();
    await loadDashboard();
  } catch (error) {
    setText("authError", error.message);
  }
});

$("refreshButton").addEventListener("click", loadDashboard);
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
  const [orders, transactions, manifest] = await Promise.all([
    request("/api/v1/admin/orders"),
    request("/api/v1/admin/transactions"),
    request("/api/v1/admin/manifest/pending")
  ]);
  $("orderCount").textContent = orders.orders.length;
  $("transactionCount").textContent = transactions.transactions.length;
  $("manifestCount").textContent = manifest.items.length;
  renderTable("ordersTable", ["email", "status", "stage", "total_amount", "customs_fee", "vat_fee", "created_at"], orders.orders);
  renderTable("transactionsTable", ["email", "order_status", "escrow_status", "dispute_status", "total_amount", "flutterwave_tx_ref"], transactions.transactions);
  renderOrderCards(orders.orders);
  renderTransactionCards(transactions.transactions);
  await loadAdminDirectory();
  await loadProducts();
  await loadBatches();
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
      </td>
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  table.querySelectorAll("[data-action='edit-batch']").forEach((button) => {
    button.addEventListener("click", () => openBatchDialog(button.dataset.id));
  });
  renderBatchCards(state.batches);
}

function renderAdminsTable() {
  const table = $("adminsTable");
  if (!table) return;
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Full Name</th>
      <th>Email</th>
      <th>Role</th>
      <th>Status</th>
      <th>Created</th>
    </tr>
  `;
  const tbody = document.createElement("tbody");
  if (!state.admins.length) {
    tbody.innerHTML = `<tr><td colspan="5">No admins yet.</td></tr>`;
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
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  renderAdminCards(state.admins);
}

function renderUsersTable() {
  const table = $("usersTable");
  if (!table) return;
  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Full Name</th>
      <th>Email</th>
      <th>Phone</th>
      <th>Country</th>
      <th>Status</th>
      <th>Created</th>
    </tr>
  `;
  const tbody = document.createElement("tbody");
  if (!state.users.length) {
    tbody.innerHTML = `<tr><td colspan="6">No buyers yet.</td></tr>`;
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
    `;
    tbody.appendChild(row);
  }
  table.append(thead, tbody);
  renderUserCards(state.users);
}

function renderAdminCards(rows) {
  const container = $("adminsCards");
  if (!container) return;
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
      </article>
    `)
    .join("");
}

function renderUserCards(rows) {
  const container = $("usersCards");
  if (!container) return;
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
      </article>
    `)
    .join("");
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
        <p class="mobile-card-meta">${escapeHtml(format(batch.batch_date))} · ${escapeHtml(prettyBatchStatus(batch.status))}</p>
        <p class="mobile-card-meta">${escapeHtml(prettyTransportMode(batch.transport_mode))} · ${escapeHtml(batch.current_location || "-")}</p>
        <p class="mobile-card-meta">${format(batch.order_count)} orders · NGN ${format(batch.total_ngn_collected)}</p>
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
        <p class="mobile-card-meta">${escapeHtml(row.order_status)} · escrow ${escapeHtml(row.escrow_status)}</p>
        <p class="mobile-card-meta">Dispute ${escapeHtml(row.dispute_status)} · ${format(row.total_amount)}</p>
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
  setText("editBatchMeta", `${batch.batch_code} · ${format(batch.batch_date)} · ${batch.order_count} orders`);
  setText("editBatchStatus", "");
  $("editBatchDialog").showModal();
}

function closeBatchDialog() {
  $("editBatchDialog").close();
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

function renderSession() {
  const isAuthenticated = Boolean(state.token);
  $("authPanel").classList.toggle("hidden", isAuthenticated);
  $("dashboard").classList.toggle("hidden", !isAuthenticated);
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
  const knownTabs = new Set(["overview", "products", "orders", "batches", "transactions", "admins"]);
  const nextTab = knownTabs.has(tab) ? tab : "overview";
  state.activeTab = nextTab;
  if (options.persist !== false) {
    localStorage.setItem("across.admin.activeTab", nextTab);
  }
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === nextTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== nextTab);
  });
}

function prettyBatchStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettyRole(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
