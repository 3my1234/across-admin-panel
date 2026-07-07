const state = {
  apiUrl: localStorage.getItem("across.admin.apiUrl") || "https://across-api.sportbanter.online",
  token: localStorage.getItem("across.admin.token") || ""
};

const $ = (id) => document.getElementById(id);

$("apiUrl").value = state.apiUrl;

$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  input.type = input.type === "password" ? "text" : "password";
  $("togglePassword").textContent = input.type === "password" ? "Show" : "Hide";
});

$("loginButton").addEventListener("click", async () => {
  state.apiUrl = $("apiUrl").value.replace(/\/$/, "");
  localStorage.setItem("across.admin.apiUrl", state.apiUrl);
  $("authError").textContent = "";
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
    $("authPanel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    await loadDashboard();
  } catch (error) {
    $("authError").textContent = error.message;
  }
});

$("refreshButton").addEventListener("click", loadDashboard);

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $("productStatus").textContent = "";
  const category = String(form.get("category") || "").trim();
  const imageUrls = String(form.get("image_urls") || "")
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
  await request("/api/v1/admin/products", {
    method: "POST",
    body: {
      sku: form.get("sku"),
      title: form.get("title"),
      description: form.get("description"),
      category_path: category ? [category] : [],
      local_selling_price: Number(form.get("local_selling_price") || 0),
      compare_at_price: Number(form.get("compare_at_price") || 0),
      cost_price_rmb: Number(form.get("cost_price_rmb") || 0),
      exchange_rate_snapshot: Number(form.get("exchange_rate_snapshot") || 1),
      inventory_count: Number(form.get("inventory_count") || 0),
      image_urls: imageUrls,
      factory_name: form.get("factory_name"),
      factory_location: form.get("factory_location")
    }
  });
  event.currentTarget.reset();
  $("productStatus").textContent = "Product added. It will appear in the mobile catalog on refresh.";
});

$("adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $("adminStatus").textContent = "";
  await request("/api/v1/admin/admins", {
    method: "POST",
    body: {
      full_name: form.get("full_name"),
      email: form.get("email"),
      password: form.get("password"),
      role: form.get("role")
    }
  });
  event.currentTarget.reset();
  $("adminStatus").textContent = "Admin created.";
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
