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

  // Facet metadata so we can treat them generically
  const FACETS = [
    { name: 'category',   field: 'item-category',          select: categoryFilter,   label: 'All categories'  },
    { name: 'year',       field: 'item-conferenceYear',    select: yearFilter,       label: 'All years'       },
    { name: 'difficulty', field: 'item-solderingDifficulty', select: difficultyFilter, label: 'All difficulties' },
    { name: 'author',     field: 'item-author',            select: authorFilter,     label: 'All authors'     }
  ];

  // Multi-file loader
  const DATA_FILES = [
    'form.json',
    '2025.json',
    '2024.json',
    '2023.json'
    // add more here if needed, e.g. '2024.json'
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
    } else if (d === 'beginner') {
      tagEl.classList.add('is-success');
    } else if (d === 'intermediate') {
      tagEl.classList.add('is-success');
    } else if (d === 'advanced') {
      tagEl.classList.add('is-warning');
    } else if (d === 'stupid') {
      tagEl.classList.add('is-danger');
    } else {
      tagEl.classList.add('is-light');
    }
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

      const profileImgEl = frag.querySelector('.item-profilePictureUrl');
      const frontImgEl   = frag.querySelector('.item-frontImageUrl');
      const backImgEl    = frag.querySelector('.item-backImageUrl');

      const profileUrl = item.profilePictureUrl || './default-profile.jpg';
      const frontUrl   = item.frontImageUrl     || './default-front.jpg';
      const backUrl    = item.backImageUrl      || './default-front.jpg';
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
      if (rarityEl)     rarityEl.textContent     = item.rarity || '';

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

      // NEW: remove the details boxes if their content is empty
      const hideBoxIfEmpty = (contentEl) => {
        if (!contentEl) return;
        if (!contentEl.textContent || !contentEl.textContent.trim()) {
          const box = contentEl.closest('.mb-2'); // wrapper div around <details>
          if (box) box.remove();
        }
      };

      hideBoxIfEmpty(specialEl);   // "Special instructions" box
      hideBoxIfEmpty(solderingEl); // "Assembly & soldering instructions" box
      hideBoxIfEmpty(howEl);       // "How do people get one?" box

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

    const catVal  = (values['item-category'] || '').trim();
    const yearVal = (values['item-conferenceYear'] || '').trim();
    const diffVal = (values['item-solderingDifficulty'] || '').trim();
    const authVal = (values['item-author'] || '').trim();

    if (category   && catVal  !== category)   return false;
    if (year       && yearVal !== year)       return false;
    if (difficulty && diffVal !== difficulty) return false;
    if (author     && authVal !== author)     return false;

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

      if (v['item-category'])            valueSets['item-category'].add(v['item-category']);
      if (v['item-conferenceYear'])      valueSets['item-conferenceYear'].add(v['item-conferenceYear']);
      if (v['item-solderingDifficulty']) valueSets['item-solderingDifficulty'].add(v['item-solderingDifficulty']);
      if (v['item-author'])              valueSets['item-author'].add(v['item-author']);
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

  function initSorting(itemList) {
    if (!sortSelect) return;

    sortSelect.addEventListener('change', () => {
      const val = sortSelect.value;

      switch (val) {
        case 'title-asc':
          itemList.sort('item-title', { order: 'asc' });
          break;
        case 'title-desc':
          itemList.sort('item-title', { order: 'desc' });
          break;
        case 'year-desc':
          itemList.sort('item-conferenceYear', { order: 'desc' });
          break;
        case 'year-asc':
          itemList.sort('item-conferenceYear', { order: 'asc' });
          break;
        case 'quantity-desc':
          itemList.sort('item-quantityMade', {
            order: 'desc',
            sortFunction: (a, b) => {
              const av = parseInt(a.values()['item-quantityMade'] || '0', 10);
              const bv = parseInt(b.values()['item-quantityMade'] || '0', 10);
              return av - bv;
            }
          });
          break;
        case 'quantity-asc':
          itemList.sort('item-quantityMade', {
            order: 'asc',
            sortFunction: (a, b) => {
              const av = parseInt(a.values()['item-quantityMade'] || '0', 10);
              const bv = parseInt(b.values()['item-quantityMade'] || '0', 10);
              return av - bv;
            }
          });
          break;
        default:
          break;
      }
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
      initSorting(itemList);
      initFilters(itemList, totalCount);
      applyFiltersAndSearch(itemList);
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
