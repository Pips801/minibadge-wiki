document.addEventListener('DOMContentLoaded', () => {
  const listContainer      = document.querySelector('#items-list .minibadge-list');
  const cardTemplate       = document.getElementById('minibadge-template');

  const categoryFilter     = document.getElementById('categoryFilter');
  const yearFilter         = document.getElementById('yearFilter');
  const difficultyFilter   = document.getElementById('difficultyFilter');
  const authorFilter       = document.getElementById('authorFilter');

  const sortSelect         = document.getElementById('sortSelect');
  const emptyMessage       = document.getElementById('emptyMessage');
  const clearFiltersButton = document.getElementById('clearFiltersButton');
  const searchInput        = document.getElementById('searchInput');
  const resultsCount       = document.getElementById('resultsCount');

  // List.js config: which DOM classes are searchable/sortable/filterable
  const VALUE_NAMES = [
    'item-title',
    'item-author',
    'item-category',
    'item-conferenceYear',
    'item-solderingDifficulty',
    'item-description',
    'item-boardHouse',
    'item-howToAcquire',
    'item-timestamp',
    'item-quantityMade',
    'item-rarity'
  ];

  // Intersection Observer for lazy-loading 3D models
  const modelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const container = entry.target;
      const boxEl = container.closest('.item-3dModelBox');
      const glbUrl = boxEl ? boxEl.dataset.glbUrl : '';

      if (entry.isIntersecting && !container.querySelector('model-viewer') && glbUrl) {
        // Create and load model-viewer
        const viewer = document.createElement('model-viewer');
        viewer.setAttribute('src', glbUrl);
        viewer.setAttribute('poster', 'loading.png')
        viewer.setAttribute('camera-controls', '');
        viewer.setAttribute('disable-zoom', '');
        viewer.setAttribute('camera-orbit', '45deg 45deg auto');
        viewer.setAttribute('min-camera-orbit', 'auto 1deg 80mm');
        viewer.setAttribute('max-camera-orbit', 'auto 179deg 500mm');
        viewer.setAttribute('interaction-prompt', 'none');
        viewer.setAttribute('camera-target', '0m 0m 0m');
        viewer.setAttribute('shadow-intensity', '2');
        viewer.setAttribute('shadow-softness', '1');
        viewer.setAttribute('tone-mapping', 'auto');
        viewer.setAttribute('field-of-view', 'auto');
        viewer.setAttribute('alt', '3D model of the badge');
        viewer.style.width = '100%';
        viewer.style.height = '100%';
        container.appendChild(viewer);
      } else if (!entry.isIntersecting && container.querySelector('model-viewer')) {
        // Unload model-viewer when out of view
        const viewer = container.querySelector('model-viewer');
        viewer.remove();
      }
    });
  }, { rootMargin: '100px' }); // Start loading 100px before entering view

  // Facet metadata so we can treat them generically
  const FACETS = [
    { name: 'category',   field: 'item-category',          select: categoryFilter,   label: 'All categories'  },
    { name: 'year',       field: 'item-conferenceYear',    select: yearFilter,       label: 'All years'       },
    { name: 'difficulty', field: 'item-solderingDifficulty', select: difficultyFilter, label: 'All difficulties' },
    { name: 'author',     field: 'item-author',            select: authorFilter,     label: 'All authors'     }
  ];

  // Multi-file loader
  const DATA_FILES = [
    '2026.json',
    '2025.json',
    '2024.json',
    '2023.json',
    '2022.json',
    '2021.json'
    // add more here if needed
  ];

  let itemList = null;
  let allData  = [];
  let currentSearchQuery = '';

  // ---------- Fetch helpers ----------------------------------------------

  function fetchAllData(files) {
    return Promise.all(
      files.map(path =>
        fetch(path)
          .then(r => {
            if (!r.ok) {
              throw new Error(`Failed to load ${path}`);
            }
            return r.json();
          })
          .catch(err => {
            console.error(err);
            return []; // treat that file as empty
          })
      )
    ).then(datasets => datasets.flat());
  }

  // ---------- Difficulty coloring -----------------------------------------

  function applyDifficultyColor(tagEl, difficulty) {
    if (!tagEl) return;

    tagEl.classList.remove(
      'is-primary',
      'is-link',
      'is-light',
      'is-info',
      'is-success',
      'is-warning',
      'is-danger'
    );

    const d = (difficulty || '').trim().toLowerCase();

    if (d === 'pre-soldered') {
      tagEl.classList.add('is-info');
    } else if (d === 'beginner' || d === 'simple') {
      tagEl.classList.add('is-success');
    } else if (d === 'intermediate') {
      tagEl.classList.add('is-success');
    } else if (d === 'advanced') {
      tagEl.classList.add('is-warning');
    } else if (d === 'stupid' || d === 'stupid hard' || d === 'torture') {
      tagEl.classList.add('is-danger');
    } else {
    }
  }

  // Decode HTML entities like '&amp;' in JSON fields so they display correctly.
  function decodeHtmlEntities(str) {
    if (!str) return '';
    const el = document.createElement('div');
    el.innerHTML = str;
    return el.textContent || el.innerText || '';
  }

  // Normalize text fields: decode HTML entities and convert literal '\\n' sequences
  // to actual newlines so they render properly when we set `style.whiteSpace = 'pre-wrap'`.
  function normalizeTextField(s) {
    const decoded = decodeHtmlEntities(s || '');
    // Replace literal backslash+n sequences with actual newline characters
    return decoded.replace(/\\n/g, '\n');
  }

  // Escape HTML special characters
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Convert URLs in text to clickable links
  function convertLinksToClickable(text) {
    if (!text) return '';
    
    // Match http/https URLs and www URLs, excluding closing parentheses
    const urlRegex = /(https?:\/\/[^\s<>)]+|www\.[^\s<>)]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, i) => {
      // Even indices are non-URL text, odd indices are URLs
      if (i % 2 === 0) {
        // Non-URL text: escape HTML
        return escapeHtml(part);
      } else {
        // URL text: create a link
        const url = part.startsWith('http') ? part : 'https://' + part;
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(part)}</a>`;
      }
    }).join('');
  }

  // ---------- Render cards into DOM from JSON -----------------------------

  function renderCards(data) {
    if (!cardTemplate) {
      throw new Error('Missing #minibadge-template in HTML');
    }

    data.forEach(item => {
      const frag = cardTemplate.content.cloneNode(true);

      const titleEl      = frag.querySelector('.item-title');
      const authorEl     = frag.querySelector('.item-author');
      const categoryEl   = frag.querySelector('.item-category');
      const yearEl       = frag.querySelector('.item-conferenceYear');
      const diffEl       = frag.querySelector('.item-solderingDifficulty');
      const diffTagEl    = frag.querySelector('.difficulty-tag');
      const qtyHiddenEl  = frag.querySelector('.item-quantityMade');
      const qtyDisplayEl = frag.querySelector('.item-quantityDisplay');
      const boardHouseEl = frag.querySelector('.item-boardHouse');
      const descEl       = frag.querySelector('.item-description');
      const specialEl    = frag.querySelector('.item-specialInstructions');
      const solderingEl  = frag.querySelector('.item-solderingInstructions');
      const howEl        = frag.querySelector('.item-howToAcquire');
      const timestampEl  = frag.querySelector('.item-timestamp');
      const rarityEl     = frag.querySelector('.item-rarity');
      const model3dEl    = frag.querySelector('.item-3dModel');
      const model3dBoxEl = frag.querySelector('.item-3dModelBox');

      const profileImgEl = frag.querySelector('.item-profilePictureUrl');
      const frontImgEl   = frag.querySelector('.item-frontImageUrl');
      const backImgEl    = frag.querySelector('.item-backImageUrl');

      const profileUrl = item.profilePictureUrl || './default-profile.jpg';
      const frontUrl   = item.frontImageUrl     || './default-front.jpg';
      const backUrl    = item.backImageUrl      || './default-front.jpg';
      const difficulty = item.solderingDifficulty || '';

      // Decode potential HTML entities (e.g. '&amp;') in author so dropdown shows '&'
      const authorText = decodeHtmlEntities(item.author || '');

      if (titleEl)      titleEl.textContent      = item.title || '';
      if (authorEl)     authorEl.textContent     = authorText;
      if (categoryEl)   categoryEl.textContent   = item.category || '';
      if (yearEl)       yearEl.textContent       = item.conferenceYear || '';
      if (diffEl)       diffEl.textContent       = difficulty;
      if (qtyHiddenEl)  qtyHiddenEl.textContent  = item.quantityMade || '';
      if (qtyDisplayEl) qtyDisplayEl.textContent = item.quantityMade || '';
      if (boardHouseEl) boardHouseEl.textContent = item.boardHouse || '';
      if (descEl) {
        const normalized = normalizeTextField(item.description);
        descEl.innerHTML = convertLinksToClickable(normalized);
        descEl.style.whiteSpace = 'pre-wrap';
      }
      if (specialEl) {
        const normalized = normalizeTextField(item.specialInstructions);
        specialEl.innerHTML = convertLinksToClickable(normalized);
        specialEl.style.whiteSpace = 'pre-wrap';
      }
      if (solderingEl) {
        const normalized = normalizeTextField(item.solderingInstructions);
        solderingEl.innerHTML = convertLinksToClickable(normalized);
        solderingEl.style.whiteSpace = 'pre-wrap';
      }
      if (howEl) {
        const normalized = normalizeTextField(item.howToAcquire);
        howEl.innerHTML = convertLinksToClickable(normalized);
        howEl.style.whiteSpace = 'pre-wrap';
      }
      if (timestampEl)  timestampEl.textContent  = item.timestamp || '';
      if (rarityEl)     rarityEl.textContent     = item.rarity || ''; 

      // Handle 3D model (support both '3d-model' and '3dModel' field names)
      const model3dUrl = item['3d-model'] || item['3dModel'] || item['glb3dModel'] || '';
      if (model3dBoxEl) {
        if (model3dUrl && model3dUrl.trim()) {
          model3dBoxEl.dataset.glbUrl = model3dUrl.trim();
          const containerEl = frag.querySelector('.item-3dModelContainer');
          if (containerEl) {
            // Register the container for lazy-loading
            modelObserver.observe(containerEl);
          }
        } else {
          // Hide the 3D model box if there's no URL
          model3dBoxEl.style.display = 'none';
        }
      }

      if (profileImgEl) {
        profileImgEl.src = profileUrl;
        profileImgEl.alt = (authorText || 'Badge author') + ' profile picture';
      }
      if (frontImgEl) {
        frontImgEl.src = frontUrl;
        frontImgEl.alt = (item.title || 'Badge') + ' front';
      }
      if (backImgEl) {
        backImgEl.src = backUrl;
        backImgEl.alt = (item.title || 'Badge') + ' back';
      }

      applyDifficultyColor(diffTagEl, difficulty);

      // Remove any tag wrappers whose inner value is empty
      const hideTagIfEmpty = (innerEl) => {
        if (!innerEl) return;
        if (!innerEl.textContent || !innerEl.textContent.trim()) {
          const tag = innerEl.closest('.tag');
          if (tag) tag.remove();
        }
      };

      hideTagIfEmpty(yearEl);
      hideTagIfEmpty(categoryEl);
      hideTagIfEmpty(diffEl);
      hideTagIfEmpty(qtyDisplayEl);
      hideTagIfEmpty(boardHouseEl);
      hideTagIfEmpty(rarityEl);

      // Remove the details boxes if their content is empty
      const hideBoxIfEmpty = (contentEl) => {
        if (!contentEl) return;
        if (!contentEl.textContent || !contentEl.textContent.trim()) {
          const box = contentEl.closest('.mb-2'); // wrapper div around <details>
          if (box) box.remove();
        }
      };

      hideBoxIfEmpty(specialEl);   // "Special instructions"
      hideBoxIfEmpty(solderingEl); // "Assembly & soldering instructions"
      hideBoxIfEmpty(howEl);       // "How do people get one?"
      
      // Hide 3D model box if no model URL is provided
      if (model3dBoxEl && (!model3dUrl || !model3dUrl.trim())) {
        model3dBoxEl.remove();
      }

      listContainer.appendChild(frag);
    });
  }

  // ----- List.js + filtering/sorting -----------------------------------

  function initList() {
    return new List('items-list', {
      valueNames: VALUE_NAMES,
      listClass: 'minibadge-list'
    });
  }

  function getCurrentFacetValues() {
    const values = {};
    FACETS.forEach(({ name, select }) => {
      if (!select) return;
      values[name] = select.value || '';
    });
    return values;
  }

  function itemMatchesFacets(values) {
    const { category, year, difficulty, author } = getCurrentFacetValues();

    // Decode stored item values (they may contain HTML entities) before comparing
    const catValStored  = decodeHtmlEntities((values['item-category'] || '')).trim();
    const yearValStored = decodeHtmlEntities((values['item-conferenceYear'] || '')).trim();
    const diffValStored = decodeHtmlEntities((values['item-solderingDifficulty'] || '')).trim();
    const authValStored = decodeHtmlEntities((values['item-author'] || '')).trim();

    if (category   && catValStored  !== category)   return false;
    if (year       && yearValStored !== year)       return false;
    if (difficulty && diffValStored !== difficulty) return false;
    if (author     && authValStored !== author)     return false;

    return true;
  }

  function itemMatchesSearch(values) {
    const q = (currentSearchQuery || '').trim().toLowerCase();
    if (!q) return true;

    const haystack = [
      'item-title',
      'item-author',
      'item-category',
      'item-conferenceYear',
      'item-solderingDifficulty',
      'item-description',
      'item-boardHouse',
      'item-howToAcquire',
      'item-rarity'
    ]
      .map(k => (values[k] || '').toString().toLowerCase())
      .join(' ');

    return haystack.includes(q);
  }

  function rebuildSelect(selectEl, defaultLabel, valuesSet) {
    const previousValue = selectEl.value;
    selectEl.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = defaultLabel;
    selectEl.appendChild(defaultOption);

    Array.from(valuesSet)
      .sort((a, b) => a.localeCompare(b))
      .forEach(value => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        selectEl.appendChild(opt);
      });

    if (previousValue && valuesSet.has(previousValue)) {
      selectEl.value = previousValue;
    } else {
      selectEl.value = '';
    }
  }

  function buildFacetOptions(itemList) {
    const valueSets = {
      'item-category':            new Set(),
      'item-conferenceYear':      new Set(),
      'item-solderingDifficulty': new Set(),
      'item-author':              new Set()
    };

    itemList.items.forEach(item => {
      const v = item.values();

      // Some stored values may include HTML entities (e.g. '&amp;'). Decode them
      // so the facet lists show human-readable text.
      if (v['item-category'])            valueSets['item-category'].add(decodeHtmlEntities(v['item-category']));
      if (v['item-conferenceYear'])      valueSets['item-conferenceYear'].add(decodeHtmlEntities(v['item-conferenceYear']));
      if (v['item-solderingDifficulty']) valueSets['item-solderingDifficulty'].add(decodeHtmlEntities(v['item-solderingDifficulty']));
      if (v['item-author'])              valueSets['item-author'].add(decodeHtmlEntities(v['item-author']));
    });

    FACETS.forEach(({ field, select, label }) => {
      if (!select) return;
      rebuildSelect(select, label, valueSets[field]);
    });
  }

  function applyFiltersAndSearch(itemList) {
    itemList.filter(item => {
      const v = item.values();

      if (!itemMatchesFacets(v)) return false;
      if (!itemMatchesSearch(v)) return false;

      return true;
    });

    const visibleCount = itemList.visibleItems.length;

    if (resultsCount) {
      resultsCount.textContent = `Showing ${visibleCount} minibadge${visibleCount === 1 ? '' : 's'}`;
    }

    if (emptyMessage) {
      emptyMessage.style.display = visibleCount === 0 ? '' : 'none';
    }
  }

  function initFilters(itemList, totalCount) {
    FACETS.forEach(({ select }) => {
      if (!select) return;
      select.addEventListener('change', () => {
        applyFiltersAndSearch(itemList);
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        currentSearchQuery = searchInput.value || '';
        applyFiltersAndSearch(itemList);
      });
    }

    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', () => {
        FACETS.forEach(({ select }) => {
          if (select) select.value = '';
        });
        if (searchInput) {
          searchInput.value = '';
          currentSearchQuery = '';
        }
        applyFiltersAndSearch(itemList);
      });
    }

    if (resultsCount) {
      resultsCount.textContent = `Showing ${totalCount} minibadge${totalCount === 1 ? '' : 's'}`;
    }
  }

  // ----- Sorting helpers -------------------------------------------------

  function parseTimestamp(str) {
    if (!str) return 0;
    // Try native Date parse first
    const t = Date.parse(str);
    if (!Number.isNaN(t)) return t;

    // Fallback for Google Form style "M/D/YYYY H:MM:SS"
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const month = parseInt(m[1], 10) - 1;
      const day   = parseInt(m[2], 10);
      const year  = parseInt(m[3], 10);
      const hour  = parseInt(m[4], 10);
      const min   = parseInt(m[5], 10);
      const sec   = m[6] ? parseInt(m[6], 10) : 0;
      return new Date(year, month, day, hour, min, sec).getTime();
    }

    return 0;
  }

  function parseSortValue(val) {
    // Examples:
    // "item-timestamp:desc"
    // "item-timestamp:asc"
    // "item-quantityMade:num-asc"
    // "item-quantityMade:num-desc"
    const [field, rest] = val.split(':');
    let mode = 'text';
    let order = 'asc';

    if (rest) {
      if (rest === 'asc' || rest === 'desc') {
        order = rest;
      } else if (rest.startsWith('num-')) {
        mode = 'num';
        order = rest.slice('num-'.length) || 'asc';
      }
    }

    return { field, order, mode };
  }

  function sortItems(itemList, field, order, mode) {
    if (!field) return;

    if (field === 'item-timestamp') {
      // Custom date sort
      itemList.sort(field, {
        sortFunction: (a, b) => {
          const av = parseTimestamp(a.values()[field]);
          const bv = parseTimestamp(b.values()[field]);
          return order === 'asc' ? av - bv : bv - av;
        }
      });
    } else if (mode === 'num') {
      // Numeric sort
      itemList.sort(field, {
        sortFunction: (a, b) => {
          const av = parseFloat(a.values()[field] || '0');
          const bv = parseFloat(b.values()[field] || '0');
          return order === 'asc' ? av - bv : bv - av;
        }
      });
    } else {
      // Simple text sort
      itemList.sort(field, { order });
    }
  }

  function initSorting(itemList) {
    if (!sortSelect) return;

    const applySortFromSelect = () => {
      const val = sortSelect.value || 'item-timestamp:desc';
      const { field, order, mode } = parseSortValue(val);
      sortItems(itemList, field, order, mode);
    };

    // Apply initial sort based on the default select option ("Newest first")
    applySortFromSelect();

    // React to user changes
    sortSelect.addEventListener('change', () => {
      applySortFromSelect();
      // Re-apply filters/search to keep visible set consistent
      applyFiltersAndSearch(itemList);
    });
  }

  // ----- Bootstrapping: load data, render, init List.js ------------------

  fetchAllData(DATA_FILES)
    .then(data => {
      allData = data;
      if (!Array.isArray(allData) || allData.length === 0) {
        throw new Error('No minibadge data loaded');
      }

      renderCards(allData);

      itemList = initList();
      const totalCount = itemList.items.length;

      buildFacetOptions(itemList);
      initSorting(itemList);          // default: newest first by timestamp
      initFilters(itemList, totalCount);
      applyFiltersAndSearch(itemList); // apply current filters/search
    })
    .catch(err => {
      console.error(err);
      if (emptyMessage) {
        emptyMessage.style.display = '';
        emptyMessage.textContent = 'Failed to load minibadge data.';
      }
      if (resultsCount) {
        resultsCount.textContent = 'Showing 0 minibadges';
      }
    });
});
