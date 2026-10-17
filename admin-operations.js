/* Presentation only: keep the existing operational handlers and role checks. */
(() => {
  const views = new Set(["orders", "transactions", "xp-withdrawals", "complaints", "support", "analytics", "community"]);
  function syncView(tab) {
    document.body.classList.toggle("operations-view", views.has(tab));
    document.body.dataset.operationsPage = views.has(tab) ? tab : "";
  }
  const originalLoad = loadTabData;
  loadTabData = (tab, options = {}) => {
    syncView(tab);
    return originalLoad(tab, options);
  };
  syncView(state.activeTab);
  const paths = {
    refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
    search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    warning: "M12 3 2 21h20ZM12 9v6M12 18v1"
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    svg.classList.add("operations-icon");
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", paths[name]); svg.append(path);
    return svg;
  }
  for (const id of ["refreshButton", "xpWithdrawalRefresh", "reloadTicketsButton", "reloadComplaintsButton", "reloadAnalyticsButton", "communityAdminRefresh"]) document.getElementById(id)?.prepend(icon("refresh"));
  document.getElementById("adminNotificationButton")?.prepend(icon("bell"));
  for (const [id, label] of [["ordersSearch", "Search orders"], ["transactionsSearch", "Search transactions"]]) {
    const input = document.getElementById(id); if (!input) continue;
    input.setAttribute("aria-label", label);
    const wrap = document.createElement("div"); wrap.className = "operations-search";
    input.before(wrap); wrap.append(icon("search"), input);
  }
  const recovery = document.querySelector("#paymentReconciliationForm > div");
  if (recovery) { recovery.classList.add("recovery-introduction"); recovery.prepend(icon("warning")); }
})();
