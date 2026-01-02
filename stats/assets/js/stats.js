// Stats loader & visualizer for MiniBadge — placed at /stats/assets/js/stats.js
// Behavior:
// - Attempts to fetch {year}_form.json for years 2018..currentYear from the site root (e.g. /2023_form.json).
// - Only files that return OK are used.
// - Aggregates badges per person, badges per year, and categories per year.
// - Renders charts with ApexCharts and fills HTML tables.
// - You can tweak detection mappings in the `FIELD_PREFERENCES` object below.

(function () {
  const START_YEAR = 2018;
  const currentYear = new Date().getFullYear();

  // Configure preferences for detecting person and category fields in your JSON records.
  // The script will search each record for these candidate keys (case-insensitive).
  const FIELD_PREFERENCES = {
    person: ['name', 'full_name', 'fullname', 'person', 'submitter', 'author'],
    category: ['category', 'type', 'badge_category', 'badge type', 'badge_type', 'badge'],
    // optional date-ish fields if you want year detection from record:
    date: ['date', 'submitted', 'timestamp', 'created_at']
  };

  // Utility to find the first present key in an object from candidates (case insensitive)
  function findKey(obj, candidates) {
    const lowerMap = {};
    Object.keys(obj).forEach(k => lowerMap[k.toLowerCase()] = k);
    for (const c of candidates) {
      const lc = c.toLowerCase();
      if (lowerMap[lc]) return lowerMap[lc];
    }
    // fallback: check for any close match
    for (const k of Object.keys(obj)) {
      for (const c of candidates) {
        if (k.toLowerCase().includes(c.toLowerCase())) return k;
      }
    }
    return null;
  }

  // Try to extract a string from a field value safely
  function asString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v && v.name) return String(v.name);
    return JSON.stringify(v);
  }

  // Build list of candidate filenames to fetch
  const years = [];
  for (let y = START_YEAR; y <= currentYear; y++) years.push(y);
  const candidateFiles = years.map(y => `/${y}_form.json`);

  // DOM refs
  const generatedDateEl = document.getElementById('generatedDate');
  const yearFilter = document.getElementById('yearFilter');
  const personSearch = document.getElementById('personSearch');
  const resetFilters = document.getElementById('resetFilters');
  const downloadCsvBtn = document.getElementById('downloadCsv');

  const totalBadgesEl = document.getElementById('totalBadges');
  const uniquePeopleEl = document.getElementById('uniquePeople');
  const yearsCountEl = document.getElementById('yearsCount');

  const tableTopPeople = document.querySelector('#tableTopPeople tbody');
  const tableByYearCategory = document.querySelector('#tableByYearCategory tbody');

  // Data store
  let rawEntries = []; // each entry: {year, record}
  let availableYears = new Set();

  // Fetch all candidate files in parallel (but skip 404s)
  async function fetchAll() {
    const fetches = candidateFiles.map(async (path) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const json = await res.json();
        return { path, json };
      } catch (err) {
        return null;
      }
    });
    const results = await Promise.all(fetches);
    return results.filter(Boolean);
  }

  // Normalize returned JSON into an array of records
  function normalizeJsonPayload(json) {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (json.data && Array.isArray(json.data)) return json.data;
    // try to find an array property
    for (const k of Object.keys(json)) {
      if (Array.isArray(json[k])) return json[k];
    }
    // otherwise wrap as single-record array
    return [json];
  }

  // Aggregate helpers
  function aggregate(entries) {
    const badgesPerPerson = new Map();
    const badgesPerYear = new Map();
    const categoriesPerYear = new Map(); // year -> Map(category->count)

    for (const e of entries) {
      const year = e.year;
      const record = e.record;

      // find fields
      const personKey = findKey(record, FIELD_PREFERENCES.person);
      const categoryKey = findKey(record, FIELD_PREFERENCES.category);

      const person = personKey ? asString(record[personKey]) : '';
      const category = categoryKey ? asString(record[categoryKey]) : 'Uncategorized';

      // badges per person
      if (!badgesPerPerson.has(person)) badgesPerPerson.set(person, 0);
      badgesPerPerson.set(person, badgesPerPerson.get(person) + 1);

      // badges per year
      if (!badgesPerYear.has(year)) badgesPerYear.set(year, 0);
      badgesPerYear.set(year, badgesPerYear.get(year) + 1);

      // categories per year
      if (!categoriesPerYear.has(year)) categoriesPerYear.set(year, new Map());
      const catMap = categoriesPerYear.get(year);
      if (!catMap.has(category)) catMap.set(category, 0);
      catMap.set(category, catMap.get(category) + 1);
    }

    return { badgesPerPerson, badgesPerYear, categoriesPerYear };
  }

  // Convert maps to chart-friendly arrays
  function sortMapByValueDesc(map) {
    return Array.from(map.entries()).sort((a,b) => b[1]-a[1]);
  }

  // Render charts using ApexCharts
  let chartYear = null, chartPeople = null, chartCategories = null;

  function renderBadgesPerYear(badgesPerYear) {
    const yearsArr = Array.from(badgesPerYear.keys()).sort();
    const counts = yearsArr.map(y => badgesPerYear.get(y) || 0);
    const options = {
      chart: { type: 'bar', toolbar: { show: true }, background: 'transparent', foreColor: '#e6eef4' },
      series: [{ name: 'Badges', data: counts }],
      xaxis: { categories: yearsArr },
      theme: { mode: 'dark' },
      dataLabels: { enabled: false },
    };
    const el = document.querySelector('#chartBadgesPerYear');
    el.innerHTML = '';
    chartYear = new ApexCharts(el, options);
    chartYear.render();
  }

  function renderBadgesPerPerson(badgesPerPerson) {
    // take top N
    const sorted = sortMapByValueDesc(badgesPerPerson);
    const top = sorted.slice(0, 20);
    const labels = top.map(t => t[0] || '(blank)');
    const counts = top.map(t => t[1]);
    const options = {
      chart: { type: 'bar', height: 380, toolbar: { show: true }, background: 'transparent', foreColor: '#e6eef4' },
      series: [{ name: 'Badges', data: counts }],
      plotOptions: { bar: { horizontal: true } },
      xaxis: { labels: { formatter: v => parseInt(v,10) } },
      theme: { mode: 'dark' },
      dataLabels: { enabled: false },
    };
    const el = document.querySelector('#chartBadgesPerPerson');
    el.innerHTML = '';
    chartPeople = new ApexCharts(el, options);
    chartPeople.render();
  }

  function renderCategoriesPerYear(categoriesPerYear) {
    // gather all categories across years
    const yearsArr = Array.from(categoriesPerYear.keys()).sort();
    const allCatsSet = new Set();
    for (const m of categoriesPerYear.values()) {
      for (const k of m.keys()) allCatsSet.add(k);
    }
    const categories = Array.from(allCatsSet);
    // build series: one series per category, data for each year
    const series = categories.map(cat => {
      return {
        name: cat,
        data: yearsArr.map(y => {
          const m = categoriesPerYear.get(y);
          return m && m.get(cat) ? m.get(cat) : 0;
        })
      };
    });
    const options = {
      chart: { type: 'bar', stacked: true, toolbar: { show: true }, background: 'transparent', foreColor: '#e6eef4' },
      series,
      xaxis: { categories: yearsArr },
      plotOptions: { bar: { horizontal: false } },
      theme: { mode: 'dark' },
      dataLabels: { enabled: false },
    };
    const el = document.querySelector('#chartCategoriesPerYear');
    el.innerHTML = '';
    chartCategories = new ApexCharts(el, options);
    chartCategories.render();
  }

  // Fill tables
  function fillTables(badgesPerPerson, categoriesPerYear) {
    // top people
    tableTopPeople.innerHTML = '';
    const sortedPeople = sortMapByValueDesc(badgesPerPerson);
    for (const [person, count] of sortedPeople.slice(0,100)) {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.textContent = person || '(blank)';
      const tdCount = document.createElement('td');
      tdCount.textContent = count;
      tr.appendChild(tdName);
      tr.appendChild(tdCount);
      tableTopPeople.appendChild(tr);
    }

    // by year & category
    tableByYearCategory.innerHTML = '';
    const yearsList = Array.from(categoriesPerYear.keys()).sort();
    for (const y of yearsList) {
      const m = categoriesPerYear.get(y);
      const cats = Array.from(m.entries()).sort((a,b) => b[1]-a[1]);
      for (const [cat, cnt] of cats) {
        const tr = document.createElement('tr');
        const tdYear = document.createElement('td'); tdYear.textContent = y;
        const tdCat = document.createElement('td'); tdCat.textContent = cat;
        const tdCnt = document.createElement('td'); tdCnt.textContent = cnt;
        tr.appendChild(tdYear); tr.appendChild(tdCat); tr.appendChild(tdCnt);
        tableByYearCategory.appendChild(tr);
      }
    }
  }

  // CSV export
  function downloadCSV(rows, filename = 'minibadge_stats.csv') {
    if (!rows || rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    for (const r of rows) {
      const vals = keys.map(k => {
        let v = r[k];
        if (v == null) return '';
        v = String(v).replace(/"/g, '""');
        if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v}"`;
        return v;
      });
      lines.push(vals.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  // Helper to build raw CSV rows (one row per record)
  function buildCsvRows(entries) {
    // flatten record keys to include common ones
    const rows = [];
    for (const e of entries) {
      const record = e.record;
      const row = { year: e.year };
      for (const k of Object.keys(record)) {
        // ignore large nested objects? stringify small primitives
        const v = record[k];
        if (typeof v === 'object') {
          try {
            row[k] = JSON.stringify(v);
          } catch (err) {
            row[k] = '';
          }
        } else {
          row[k] = v;
        }
      }
      rows.push(row);
    }
    return rows;
  }

  // Populate year dropdown
  function populateYearSelect(yearsSet) {
    const yearsArr = Array.from(yearsSet).sort();
    // clear except 'all'
    while (yearFilter.options.length > 1) yearFilter.remove(1);
    for (const y of yearsArr) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      yearFilter.appendChild(opt);
    }
  }

  // Apply filters and re-render charts/tables
  function applyFilters() {
    const selYear = yearFilter.value;
    const search = personSearch.value.trim().toLowerCase();

    const filtered = rawEntries.filter(e => {
      if (selYear !== 'all' && String(e.year) !== String(selYear)) return false;
      if (search) {
        // attempt to match person field
        const personKey = findKey(e.record, FIELD_PREFERENCES.person);
        const person = personKey ? asString(e.record[personKey]).toLowerCase() : '';
        if (!person.includes(search)) return false;
      }
      return true;
    });

    const agg = aggregate(filtered);
    totalBadgesEl.textContent = filtered.length;
    uniquePeopleEl.textContent = agg.badgesPerPerson.size;
    yearsCountEl.textContent = new Set(filtered.map(e => e.year)).size;

    renderBadgesPerYear(agg.badgesPerYear);
    renderBadgesPerPerson(agg.badgesPerPerson);
    renderCategoriesPerYear(agg.categoriesPerYear);
    fillTables(agg.badgesPerPerson, agg.categoriesPerYear);
  }

  // Reset filters
  function resetAll() {
    yearFilter.value = 'all';
    personSearch.value = '';
    applyFilters();
  }

  // Main run
  async function run() {
    generatedDateEl.textContent = new Date().toLocaleString();

    const results = await fetchAll();
    if (!results || results.length === 0) {
      totalBadgesEl.textContent = '0';
      uniquePeopleEl.textContent = '0';
      yearsCountEl.textContent = '0';
      // show message
      document.querySelector('.charts').innerHTML = '<div class="chart-card"><p>No _form.json files found or accessible at site root.</p></div>';
      return;
    }

    // normalize and collect all records
    for (const r of results) {
      // path like /2023_form.json
      const match = r.path.match(/\/?([0-9]{4})_form\.json$/);
      const year = match ? match[1] : 'unknown';
      const arr = normalizeJsonPayload(r.json);
      for (const rec of arr) {
        rawEntries.push({ year, record: rec });
      }
      availableYears.add(year);
    }

    // initial aggregates
    const agg = aggregate(rawEntries);

    // populate filters / stats
    populateYearSelect(availableYears);
    totalBadgesEl.textContent = rawEntries.length;
    uniquePeopleEl.textContent = agg.badgesPerPerson.size;
    yearsCountEl.textContent = availableYears.size;

    // initial render of charts & tables
    renderBadgesPerYear(agg.badgesPerYear);
    renderBadgesPerPerson(agg.badgesPerPerson);
    renderCategoriesPerYear(agg.categoriesPerYear);
    fillTables(agg.badgesPerPerson, agg.categoriesPerYear);

    // wire controls
    yearFilter.addEventListener('change', applyFilters);
    personSearch.addEventListener('input', debounce(applyFilters, 250));
    resetFilters.addEventListener('click', resetAll);
    downloadCsvBtn.addEventListener('click', () => {
      const rows = buildCsvRows(rawEntries);
      downloadCSV(rows, 'minibadge_all_records.csv');
    });
  }

  // simple debounce
  function debounce(fn, wait) {
    let t = null;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Run on load
  document.addEventListener('DOMContentLoaded', run);
})();