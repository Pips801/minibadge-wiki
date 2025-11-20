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
    'item-quantityMade'
  ];

  // Facet metadata so we can treat them generically
  const FACETS = [
    { name: 'category',   field: 'item-category',          select: categoryFilter,   label: 'All categories'  },
    { name: 'year',       field: 'item-conferenceYear',    select: yearFilter,       label: 'All years'       },
    { name: 'difficulty', field: 'item-solderingDifficulty', select: difficultyFilter, label: 'All difficulties' },
    { name: 'author',     field: 'item-author',            select: authorFilter,     label: 'All authors'     }
  ];

  // Free-text search string
  let currentSearchQuery = '';

  // ----- Helpers ----------------------------------------------------------

  function getCurrentFacetValues() {
    return {
      category:   (categoryFilter.value   || '').trim(),
      year:       (yearFilter.value       || '').trim(),
      difficulty: (difficultyFilter.value || '').trim(),
      author:     (authorFilter.value     || '').trim()
    };
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
      'item-howToAcquire'
    ]
      .map(k => (values[k] || '').toString().toLowerCase())
      .join(' ');

    return haystack.includes(q);
  }

  function rebuildSelect(selectEl, defaultLabel, valuesSet) {
    const previousValue = selectEl.value;
    selectEl.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = defaultLabel;
    selectEl.appendChild(defaultOpt);

    Array.from(valuesSet)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectEl.appendChild(opt);
      });

    if (previousValue && valuesSet.has(previousValue)) {
      selectEl.value = previousValue;
    } else {
      selectEl.value = '';
    }
  }

  function applyDifficultyColor(tagEl, difficulty) {
    if (!tagEl) return;

    tagEl.classList.remove(
      'is-success',
      'is-success-light',
      'is-warning',
      'is-danger',
      'is-danger-light',
      'is-info',
      'is-primary',
      'is-link',
      'is-light'
    );

    const d = (difficulty || '').trim().toLowerCase();

    if (d === 'pre-soldered') {
      tagEl.classList.add('is-info');
    } else if (d === 'beginner') {
      tagEl.classList.add('is-success');
    } else if (d === 'intermediate') {
      tagEl.classList.add('is-success');
    } else if (d === 'advanced') {
      tagEl.classList.add('is-warning');
    } else if (d === 'torture') {
      tagEl.classList.add('is-danger');
    }
  }

  // ----- Render cards from JSON into DOM (using <template>) --------------

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

      const profileImgEl = frag.querySelector('.item-profilePictureUrl');
      const frontImgEl   = frag.querySelector('.item-frontImageUrl');
      const backImgEl    = frag.querySelector('.item-backImageUrl');

      const profileUrl = item.profilePictureUrl || './cat.jpeg';
      const frontUrl   = item.frontImageUrl     || './front.png';
      const backUrl    = item.backImageUrl      || './back.png';
      const difficulty = item.solderingDifficulty || '';

      if (titleEl)      titleEl.textContent      = item.title || '';
      if (authorEl)     authorEl.textContent     = item.author || '';
      if (categoryEl)   categoryEl.textContent   = item.category || '';
      if (yearEl)       yearEl.textContent       = item.conferenceYear || '';
      if (diffEl)       diffEl.textContent       = difficulty;
      if (qtyHiddenEl)  qtyHiddenEl.textContent  = item.quantityMade || '';
      if (qtyDisplayEl) qtyDisplayEl.textContent = item.quantityMade || '';
      if (boardHouseEl) boardHouseEl.textContent = item.boardHouse || '';
      if (descEl)       descEl.textContent       = item.description || '';
      if (specialEl)    specialEl.textContent    = item.specialInstructions || '';
      if (solderingEl)  solderingEl.textContent  = item.solderingInstructions || '';
      if (howEl)        howEl.textContent        = item.howToAcquire || '';
      if (timestampEl)  timestampEl.textContent  = item.timestamp || '';

      if (profileImgEl) {
        profileImgEl.src = profileUrl;
        profileImgEl.alt = (item.author || 'Badge author') + ' profile picture';
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

      listContainer.appendChild(frag);
    });
  }

  // ----- List.js + filtering/sorting -------------------------------------

  function initList() {
    return new List('items-list', { valueNames: VALUE_NAMES });
  }

  function applyAllFilters(itemList) {
    const { category, year, difficulty, author } = getCurrentFacetValues();

    itemList.filter(item => {
      const v = item.values();
      const catVal  = (v['item-category'] || '').trim();
      const yearVal = (v['item-conferenceYear'] || '').trim();
      const diffVal = (v['item-solderingDifficulty'] || '').trim();
      const authVal = (v['item-author'] || '').trim();

      if (category   && catVal  !== category)   return false;
      if (year       && yearVal !== year)       return false;
      if (difficulty && diffVal !== difficulty) return false;
      if (author     && authVal !== author)     return false;

      return itemMatchesSearch(v);
    });
  }

  function refreshFacets(itemList) {
    const facetValues = {
      category:   new Set(),
      year:       new Set(),
      difficulty: new Set(),
      author:     new Set()
    };

    const current = getCurrentFacetValues();

    itemList.items.forEach(item => {
      const v = item.values();
      if (!itemMatchesSearch(v)) return;

      FACETS.forEach(f => {
        const val = (v[f.field] || '').trim();
        if (!val) return;

        // Check all other facets' filters, but ignore this facet's own filter
        const matchesOthers = FACETS.every(other => {
          if (other.name === f.name) return true; // ignore itself
          const filterVal = current[other.name];
          if (!filterVal) return true;
          const itemVal = (v[other.field] || '').trim();
          return itemVal === filterVal;
        });

        if (matchesOthers) {
          facetValues[f.name].add(val);
        }
      });
    });

    FACETS.forEach(f => {
      rebuildSelect(f.select, f.label, facetValues[f.name]);
    });
  }

  function updateResultsCount(itemList, totalCount) {
    if (!resultsCount) return;
    const current = itemList.matchingItems.length;
    resultsCount.textContent = (current === totalCount)
      ? `Showing ${current} minibadges`
      : `Showing ${current} of ${totalCount} minibadges`;
  }

  function initSorting(itemList) {
    sortSelect.addEventListener('change', () => {
      const raw = sortSelect.value; // e.g. "item-title:asc" or "item-quantityMade:num-asc"
      const [field, spec] = raw.split(':');
      const [mode, orderRaw] = (spec || '').split('-');
      const order = orderRaw || spec || 'asc';

      if (field === 'item-quantityMade' && mode === 'num') {
        itemList.sort(field, {
          sortFunction: (a, b) => {
            const toNum = (v) => parseInt((v || '0').replace(/\D/g, ''), 10) || 0;
            const av = toNum(a.values()[field]);
            const bv = toNum(b.values()[field]);
            return order === 'asc' ? av - bv : bv - av;
          }
        });
      } else {
        itemList.sort(field, { order });
      }
    });
  }

  function initFilters(itemList, totalCount) {
    // Live search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value || '';
        applyAllFilters(itemList);
      });
    }

    // Dropdown filters
    [categoryFilter, yearFilter, difficultyFilter, authorFilter].forEach(sel => {
      sel.addEventListener('change', () => applyAllFilters(itemList));
    });

    // Clear filters
    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        currentSearchQuery = '';
        categoryFilter.value   = '';
        yearFilter.value       = '';
        difficultyFilter.value = '';
        authorFilter.value     = '';
        applyAllFilters(itemList);
      });
    }

    // React to List.js updates
    itemList.on('updated', (list) => {
      refreshFacets(list);
      updateResultsCount(list, totalCount);
      emptyMessage.style.display = list.matchingItems.length ? 'none' : '';
    });

    // Initial state
    refreshFacets(itemList);
    itemList.sort('item-timestamp', { order: 'desc' });
    updateResultsCount(itemList, totalCount);
  }

  // ----- Bootstrapping: load data, render, init List.js ------------------

  fetch('2025.json')
    .then(r => {
      if (!r.ok) throw new Error('Failed to load minibadges.json');
      return r.json();
    })
    .then(data => {
      renderCards(data);
      const itemList   = initList();
      const totalCount = itemList.items.length;

      initSorting(itemList);
      initFilters(itemList, totalCount);
    })
    .catch(err => {
      console.error(err);
      emptyMessage.style.display = '';
      emptyMessage.textContent = 'Failed to load minibadge data.';
      if (resultsCount) resultsCount.textContent = 'Showing 0 minibadges';
    });
});
