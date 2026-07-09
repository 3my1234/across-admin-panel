const state = {
  apiUrl: localStorage.getItem("across.admin.apiUrl") || "https://atlanticexpress-api.sportbanter.online",
  token: localStorage.getItem("across.admin.token") || "",
  products: []
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
    localStorage.setItem("across.admin.token", state.token);
    renderSession();
    await loadDashboard();
  } catch (error) {
    setText("authError", error.message);
  }
});

$("refreshButton").addEventListener("click", loadDashboard);
$("reloadProductsButton").addEventListener("click", loadProducts);
$("closeEditDialog").addEventListener("click", closeEditDialog);
$("cancelEditButton").addEventListener("click", closeEditDialog);
$("editProductForm").addEventListener("submit", saveProductEdits);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
    if (button.dataset.tab === "products") {
      loadProducts().catch((error) => setText("catalogStatus", error.message));
    }
  });
});

document.querySelectorAll(".mobile-nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
    if (button.dataset.tab === "products") {
      loadProducts().catch((error) => setText("catalogStatus", error.message));
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
  await loadProducts();
}

async function loadProducts() {
  setText("catalogStatus", "");
  const data = await request("/api/v1/admin/products");
  state.products = data.products || [];
  renderProductsTable();
}

function renderProductsTable() {
  const table = $("productsTable");
  table.innerHTML = "";
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
  if (!state.products.length) {
    tbody.innerHTML = `<tr><td colspan="9">No products uploaded yet.</td></tr>`;
    table.append(thead, tbody);
    renderProductCards();
    return;
  }
  for (const product of state.products) {
    const row = document.createElement("tr");
    const imageUrl = product.image_urls?.[0] || "";
    const category = product.category_path?.[0] || "-";
    const statusClass = product.is_active ? "active" : "inactive";
    const statusLabel = product.is_active ? "Live" : "Hidden";
    row.innerHTML = `
      <td>${imageUrl ? `<img class="product-thumb" src="${escapeHtml(imageUrl)}" alt="" />` : "-"}</td>
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
  renderProductCards();
}

function renderProductCards() {
  const container = $("productsCards");
  if (!container) return;
  if (!state.products.length) {
    container.innerHTML = `<article class="mobile-card"><p class="mobile-card-meta">No products uploaded yet.</p></article>`;
    return;
  }
  container.innerHTML = state.products
    .map((product) => {
      const imageUrl = product.image_urls?.[0] || "";
      const category = product.category_path?.[0] || "-";
      const statusClass = product.is_active ? "active" : "inactive";
      const statusLabel = product.is_active ? "Live" : "Hidden";
      return `
        <article class="mobile-card">
          <div class="mobile-card-head">
            ${imageUrl ? `<img class="product-thumb" src="${escapeHtml(imageUrl)}" alt="" />` : ""}
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
  setText("editProductMeta", `SKU ${product.sku}`);
  setText("editProductStatus", "");
  $("editProductDialog").showModal();
}

function closeEditDialog() {
  $("editProductDialog").close();
}

async function saveProductEdits(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const productId = String(form.get("id") || "");
  setText("editProductStatus", "");
  try {
    await request(`/api/v1/admin/products/${productId}`, {
      method: "PATCH",
      body: {
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || ""),
        local_selling_price: Number(form.get("local_selling_price") || 0),
        compare_at_price: Number(form.get("compare_at_price") || 0),
        inventory_count: Number(form.get("inventory_count") || 0),
        is_active: form.get("is_active") === "on"
      }
    });
    closeEditDialog();
    await loadProducts();
    setText("catalogStatus", "Product updated.");
    $("catalogStatus").className = "success";
  } catch (error) {
    $("editProductStatus").className = "error";
    setText("editProductStatus", error.message);
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function uploadProductImages(files) {
  const urls = [];
  for (const file of files) {
    setText("productStatus", `Uploading ${file.name}...`);
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
  const timeout = setTimeout(() => controller.abort(), 45000);
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
      throw new Error("Upload timed out. Check S3 CORS and backend AWS credentials.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function setActiveTab(tab) {
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== tab);
  });
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
