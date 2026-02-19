const DEFAULT_CSV_PATH = "../portfolio-data-2003-2026Q1.csv";

const statusEl = document.getElementById("status");
const mapSubtitle = document.getElementById("map-subtitle");
const mapMissing = document.getElementById("map-missing");
const metricTotal = document.getElementById("metric-total");
const metricActive = document.getElementById("metric-active");
const metricClosed = document.getElementById("metric-closed");
const metricAmount = document.getElementById("metric-amount");
const metricCountries = document.getElementById("metric-countries");
const metricRegions = document.getElementById("metric-regions");
const countryTable = document.getElementById("country-table");
const regionTable = document.getElementById("region-table");
const detailTable = document.getElementById("detail-table");
const statusBreakdown = document.getElementById("status-breakdown");
const roleBreakdown = document.getElementById("role-breakdown");
const amountBreakdown = document.getElementById("amount-breakdown");

const statusButtons = Array.from(document.querySelectorAll("[data-status]"));
const roleButtons = Array.from(document.querySelectorAll("[data-role]"));
let allRows = [];
let currentStatus = "All";
let currentRole = "All";
let lastFilteredRows = [];
let detailSort = { key: "Country name", dir: "asc" };

const mapNameFixes = {
  "Cote d'Ivoire": "Ivory Coast",
  "Congo, Republic of": "Republic of the Congo",
  "Congo, Democratic Republic of": "Democratic Republic of the Congo",
  "Viet Nam": "Vietnam",
  "West Bank and Gaza": "Palestine",
  "Yemen, Republic of": "Yemen",
  "Tanzania - Mainland": "Tanzania",
  "Tanzania - Zanzibar": "Tanzania",
  "Pakistan - Balochistan": "Pakistan",
  Global: null,
};

function setStatus(message, tone = "info") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function parseCSV(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell && cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    if (row.some((cell) => cell && cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function buildRecords(rows) {
  if (!rows.length) return [];

  let working = rows.slice();
  const firstCell = (working[0][0] || "").toLowerCase();
  if (firstCell.includes("selected filters")) {
    working = working.slice(1);
  }

  const header = working[0].map((h) => (h || "").trim());
  const dataRows = working.slice(1);

  return dataRows
    .map((row) => {
      const record = {};
      header.forEach((h, idx) => {
        record[h] = (row[idx] || "").trim();
      });
      return record;
    })
    .filter((record) => Object.values(record).some((v) => v && v.trim() !== ""));
}

function parseWithAutoDelimiter(text) {
  let rows = parseCSV(text, ";");
  if (rows.length >= 2) {
    const header = rows[0];
    if (header.length <= 2) {
      rows = parseCSV(text, ",");
    }
  }
  return buildRecords(rows);
}

function isUNESCOAgent(value) {
  if (!value) return false;
  const cleaned = String(value).trim().toLowerCase();
  return /\bunesco\b/.test(cleaned);
}

function getAgentRole(value) {
  if (!isUNESCOAgent(value)) return null;
  const tokens = String(value)
    .split(/\s*(?:,|;|\/|\band\b|&|\+|\|)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const otherAgents = tokens.filter((t) => !/\bunesco\b/i.test(t));
  return otherAgents.length ? "Shared" : "Solo";
}

function filterUNESCO(rows) {
  return rows.filter((row) => isUNESCOAgent(row["Grant agent"]));
}

function filterByStatus(rows, status) {
  if (status === "All") return rows;
  return rows.filter(
    (row) => (row["Grant status"] || "").trim().toLowerCase() === status.toLowerCase()
  );
}

function filterByRole(rows, role) {
  if (role === "All") return rows;
  return rows.filter((row) => getAgentRole(row["Grant agent"]) === role);
}

function parseAmount(value) {
  if (!value) return 0;
  let s = String(value).replace(/[^0-9.,-]/g, "");
  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    s = /\.\d{3}$/.test(s) ? s.replace(/\./g, "") : s;
  }

  const num = Number.parseFloat(s);
  return Number.isFinite(num) ? num : 0;
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAmountCompact(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  let short = value;
  let suffix = "";
  if (abs >= 1e9) {
    short = value / 1e9;
    suffix = "B";
  } else if (abs >= 1e6) {
    short = value / 1e6;
    suffix = "M";
  } else if (abs >= 1e3) {
    short = value / 1e3;
    suffix = "K";
  }
  const rounded = Math.round(short * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  return `$${formatted}${suffix}`;
}

function parseDate(value) {
  if (!value) return null;
  const parts = String(value).split(/[\\/\\-]/);
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function countBy(rows, key) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = (row[key] || "Unknown").trim() || "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function sortRows(rows, columns, sortState) {
  const col = columns.find((c) => c.key === sortState.key) || columns[0];
  const type = col.type || "text";
  const dir = sortState.dir === "desc" ? -1 : 1;

  const toValue = (row) => {
    const raw = row[col.key];
    if (type === "amount") return parseAmount(raw);
    if (type === "date") return parseDate(raw);
    if (type === "number") {
      const num = Number.parseFloat(raw);
      return Number.isFinite(num) ? num : null;
    }
    return (raw || "").toString().toLowerCase();
  };

  return [...rows].sort((a, b) => {
    const va = toValue(a);
    const vb = toValue(b);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (va === vb) return 0;
    return va > vb ? dir : -dir;
  });
}

function renderSortableTable(container, data, columns, sortState) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = col.label;
    btn.addEventListener("click", () => updateDetailSort(col.key));
    if (sortState.key === col.key) {
      const arrow = document.createElement("span");
      arrow.textContent = sortState.dir === "asc" ? "▲" : "▼";
      btn.appendChild(arrow);
    }
    th.appendChild(btn);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  data.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col.key] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function renderTable(container, data, columns) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  data.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col.key] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function normalizeCountryName(name) {
  if (!name) return null;
  if (mapNameFixes.hasOwnProperty(name)) {
    return mapNameFixes[name];
  }
  return name;
}

function renderMap(rows, statusLabel) {
  const counts = countBy(rows, "Country name");
  const mapped = [];
  const missing = [];

  counts.forEach((entry) => {
    const mappedName = normalizeCountryName(entry.label);
    if (!mappedName) {
      return;
    }
    mapped.push({
      country: mappedName,
      count: entry.count,
      raw: entry.label,
    });
  });

  counts.forEach((entry) => {
    const mappedName = normalizeCountryName(entry.label);
    if (!mappedName) {
      missing.push(entry.label);
    }
  });

  if (!mapped.length) {
    mapMissing.textContent = "No country data available for the map.";
    return;
  }

  mapMissing.textContent = missing.length
    ? `Excluded from map: ${missing.join(", ")}`
    : "";

  const trace = {
    type: "choropleth",
    locationmode: "country names",
    locations: mapped.map((d) => d.country),
    z: mapped.map((d) => d.count),
    text: mapped.map((d) => `${d.raw}: ${d.count}`),
    colorscale: [
      [0, "#dbeafe"],
      [0.5, "#60a5fa"],
      [1, "#1f6feb"],
    ],
    marker: {
      line: {
        color: "rgba(31,29,26,0.25)",
        width: 0.6,
      },
    },
  };

  const layout = {
    title: {
      text: `UNESCO Grants by Country (${statusLabel})`,
      x: 0.02,
      font: { family: "Space Grotesk", size: 18, color: "#1f1d1a" },
    },
    geo: {
      projection: { type: "natural earth" },
      showframe: false,
      showcountries: true,
      countrycolor: "rgba(31,29,26,0.2)",
      showcoastlines: false,
      landcolor: "#f6f0e6",
      bgcolor: "rgba(0,0,0,0)",
    },
    margin: { l: 0, r: 0, t: 50, b: 0 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
  };

  Plotly.newPlot("map", [trace], layout, { responsive: true, displayModeBar: false });
}

function updateDetailSort(key) {
  if (detailSort.key === key) {
    detailSort.dir = detailSort.dir === "asc" ? "desc" : "asc";
  } else {
    detailSort.key = key;
    detailSort.dir = "asc";
  }
  renderDetail(lastFilteredRows);
}

function renderDetail(rows) {
  const columns = [
    { label: "Country", key: "Country name", type: "text" },
    { label: "Region", key: "Region", type: "text" },
    { label: "Grant type", key: "Grant type", type: "text" },
    { label: "Grant amount", key: "Grant amount", type: "amount" },
    { label: "Approval date", key: "Actual approval date", type: "date" },
    { label: "Start date", key: "Start date", type: "date" },
    { label: "Status", key: "Grant status", type: "text" },
    { label: "Grant ID", key: "GPE Grant ID", type: "text" },
  ];
  const sortedRows = sortRows(rows, columns, detailSort);
  renderSortableTable(detailTable, sortedRows, columns, detailSort);
}

function renderAll() {
  if (!allRows.length) return;
  const unescoRows = filterUNESCO(allRows);
  const statusFiltered = filterByStatus(unescoRows, currentStatus);
  const roleFiltered = filterByRole(statusFiltered, currentRole);

  const activeCount = statusFiltered.filter(
    (row) => (row["Grant status"] || "").trim().toLowerCase() === "active"
  ).length;
  const closedCount = statusFiltered.filter(
    (row) => (row["Grant status"] || "").trim().toLowerCase() === "closed"
  ).length;
  const otherCount = Math.max(statusFiltered.length - activeCount - closedCount, 0);

  const roleCounts = { Solo: 0, Shared: 0 };
  statusFiltered.forEach((row) => {
    const role = getAgentRole(row["Grant agent"]);
    if (role === "Solo" || role === "Shared") {
      roleCounts[role] += 1;
    }
  });

  const amountFiltered = roleFiltered.reduce(
    (sum, row) => sum + parseAmount(row["Grant amount"]),
    0
  );
  const amountStatusAllRoles = statusFiltered.reduce(
    (sum, row) => sum + parseAmount(row["Grant amount"]),
    0
  );

  const filtered = roleFiltered;
  const countryCounts = countBy(filtered, "Country name");
  const regionCounts = countBy(filtered, "Region");

  metricTotal.textContent = filtered.length;
  metricActive.textContent = activeCount;
  metricClosed.textContent = closedCount;
  metricAmount.textContent = formatAmountCompact(amountFiltered);
  metricCountries.textContent = countryCounts.length;
  metricRegions.textContent = regionCounts.length;

  mapSubtitle.textContent = `${filtered.length} grants shown for status: ${currentStatus} • Role: ${currentRole}`;

  renderTable(
    countryTable,
    countryCounts.map((d) => ({ Country: d.label, Grants: d.count })),
    [
      { label: "Country", key: "Country" },
      { label: "Grants", key: "Grants" },
    ]
  );

  renderTable(
    regionTable,
    regionCounts.map((d) => ({ Region: d.label, Grants: d.count })),
    [
      { label: "Region", key: "Region" },
      { label: "Grants", key: "Grants" },
    ]
  );

  if (currentStatus === "All") {
    statusBreakdown.textContent = `Status breakdown: Active ${activeCount} | Closed ${closedCount} | Other ${otherCount}`;
  } else {
    statusBreakdown.textContent = `Status filter: ${currentStatus} (${statusFiltered.length})`;
  }

  roleBreakdown.textContent = `Role breakdown: Solo ${roleCounts.Solo} | Shared ${roleCounts.Shared}`;
  amountBreakdown.textContent = `Amount (status filter, all roles): ${formatAmount(amountStatusAllRoles)}`;

  lastFilteredRows = filtered;
  renderMap(filtered, `${currentStatus} / ${currentRole}`);
  renderDetail(filtered);
}

async function loadDefaultCSV() {
  setStatus("Loading CSV...", "info");
  try {
    const res = await fetch(DEFAULT_CSV_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    allRows = parseWithAutoDelimiter(text);
    setStatus(`Loaded ${allRows.length} rows from default CSV.`, "success");
    renderAll();
  } catch (err) {
    setStatus(
      "Could not load CSV. Make sure you're running a local server from the repo root.",
      "warn"
    );
  }
}

statusButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    statusButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status || "All";
    renderAll();
  });
});

roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRole = btn.dataset.role || "All";
    renderAll();
  });
});

loadDefaultCSV();
