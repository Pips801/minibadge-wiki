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

  // current search query
  let currentSearchQuery = '';

  // Load minibadges.json and initialize List.js + filters
  fetch('minibadges.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load minibadges.json');
      }
      return response.json();
    })
    .then(data => {
      if (!cardTemplate) {
        throw new Error('Missing #minibadge-template in HTML');
      }

      // Render all cards into the DOM using the template
      data.forEach(item => {
        const fragment = cardTemplate.content.cloneNode(true);

        const titleEl          = fragment.querySelector('.item-title');
        const authorEl         = fragment.querySelector('.item-author');
        const categoryEl       = fragment.querySelector('.item-category');
        const yearEl           = fragment.querySelector('.item-conferenceYear');
        const diffEl           = fragment.querySelector('.item-solderingDifficulty');
        const qtyHiddenEl      = fragment.querySelector('.item-quantityMade');
        const qtyDisplayEl     = fragment.querySelector('.item-quantityDisplay');
        const boardHouseEl     = fragment.querySelector('.item-boardHouse');
        const descEl           = fragment.querySelector('.item-description');
        const specialEl        = fragment.querySelector('.item-specialInstructions');
        const solderingEl      = fragment.querySelector('.item-solderingInstructions');
        const howEl            = fragment.querySelector('.item-howToAcquire');
        const timestampEl      = fragment.querySelector('.item-timestamp');

        const profileImgEl     = fragment.querySelector('.item-profilePictureUrl');
        const frontImgEl       = fragment.querySelector('.item-frontImageUrl');
        const backImgEl        = fragment.querySelector('.item-backImageUrl');

        const profileUrl = item.profilePictureUrl || './cat.jpeg';
        const frontUrl   = item.frontImageUrl     || './front.png';
        const backUrl    = item.backImageUrl      || './back.png';

        if (titleEl)      titleEl.textContent      = item.title || '';
        if (authorEl)     authorEl.textContent     = item.author || '';
        if (categoryEl)   categoryEl.textContent   = item.category || '';
        if (yearEl)       yearEl.textContent       = item.conferenceYear || '';
        if (diffEl)       diffEl.textContent       = item.solderingDifficulty || '';
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

        listContainer.appendChild(fragment);
      });

      // Initialize List.js on the populated DOM
      const options = {
        valueNames: [
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
        ]
      };

      const itemList   = new List('items-list', options);
      const totalCount = itemList.items.length;

      // Rebuild a <select> from a set of values
      function rebuildSelect(selectEl, defaultLabel, valuesSet) {
        const previousValue = selectEl.value;
        selectEl.innerHTML = '';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = defaultLabel;
        selectEl.appendChild(defaultOpt);

        const sorted = Array.from(valuesSet).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );

        sorted.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          selectEl.appendChild(opt);
        });

        if (previousValue && valuesSet.has(previousValue)) {
          selectEl.value = previousValue;
        } else {
          selectEl.value = '';
        }
      }

      // Refresh dropdown options based on current matching items
      function refreshFacets(list) {
        const items = list.matchingItems.length ? list.matchingItems : list.items;

        const authors    = new Set();
        const years      = new Set();
        const categories = new Set();
        const diffs      = new Set();

        items.forEach(item => {
          const v = item.values();
          const a = (v['item-author'] || '').trim();
          const y = (v['item-conferenceYear'] || '').trim();
          const c = (v['item-category'] || '').trim();
          const d = (v['item-solderingDifficulty'] || '').trim();

          if (a) authors.add(a);
          if (y) years.add(y);
          if (c) categories.add(c);
          if (d) diffs.add(d);
        });

        rebuildSelect(authorFilter, 'All authors', authors);
        rebuildSelect(yearFilter, 'All years', years);
        rebuildSelect(categoryFilter, 'All categories', categories);
        rebuildSelect(difficultyFilter, 'All difficulties', diffs);
      }

      // Combined search + dropdown filters
      function applyAllFilters() {
        const category   = (categoryFilter.value || '').trim();
        const year       = (yearFilter.value || '').trim();
        const difficulty = (difficultyFilter.value || '').trim();
        const author     = (authorFilter.value || '').trim();
        const q          = (currentSearchQuery || '').toLowerCase();

        itemList.filter(function (item) {
          const v = item.values();

          const catVal  = (v['item-category'] || '').trim();
          const yearVal = (v['item-conferenceYear'] || '').trim();
          const diffVal = (v['item-solderingDifficulty'] || '').trim();
          const authVal = (v['item-author'] || '').trim();

          // dropdown filters
          if (category && catVal !== category) return false;
          if (year && yearVal !== year) return false;
          if (difficulty && diffVal !== difficulty) return false;
          if (author && authVal !== author) return false;

          // search filter (over several fields)
          if (q) {
            const haystack = [
              v['item-title'] || '',
              v['item-author'] || '',
              v['item-category'] || '',
              v['item-conferenceYear'] || '',
              v['item-solderingDifficulty'] || '',
              v['item-description'] || '',
              v['item-boardHouse'] || '',
              v['item-howToAcquire'] || ''
            ]
              .join(' ')
              .toLowerCase();

            if (!haystack.includes(q)) return false;
          }

          return true;
        });
      }

      // Update "Showing X of Y minibadges" text
      function updateResultsCount(list) {
        if (!resultsCount) return;
        const current = list.matchingItems.length;
        if (current === totalCount) {
          resultsCount.textContent = `Showing ${current} minibadges`;
        } else {
          resultsCount.textContent = `Showing ${current} of ${totalCount} minibadges`;
        }
      }

      // Wire search box: live search as you type
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          currentSearchQuery = e.target.value || '';
          applyAllFilters();
        });
      }

      // Hook up filter dropdowns
      categoryFilter.addEventListener('change', applyAllFilters);
      yearFilter.addEventListener('change', applyAllFilters);
      difficultyFilter.addEventListener('change', applyAllFilters);
      authorFilter.addEventListener('change', applyAllFilters);

      // Sort handler (including numeric quantity sort)
      sortSelect.addEventListener('change', () => {
        const raw = sortSelect.value; // e.g. "item-title:asc" or "item-quantityMade:num-asc"
        const [field, modeAndOrder] = raw.split(':');
        const [mode, orderRaw] = (modeAndOrder || '').split('-');
        const order = orderRaw || modeAndOrder || 'asc';

        if (field === 'item-quantityMade' && mode === 'num') {
          itemList.sort(field, {
            sortFunction: (a, b) => {
              const av = parseInt((a.values()[field] || '0').replace(/\D/g, ''), 10) || 0;
              const bv = parseInt((b.values()[field] || '0').replace(/\D/g, ''), 10) || 0;
              return order === 'asc' ? av - bv : bv - av;
            }
          });
        } else {
          itemList.sort(field, { order });
        }
      });

      // Clear filters button
      if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
          }
          currentSearchQuery  = '';
          categoryFilter.value   = '';
          yearFilter.value       = '';
          difficultyFilter.value = '';
          authorFilter.value     = '';

          applyAllFilters();
        });
      }

      // On each List.js update, refresh facets, count, and empty message
      itemList.on('updated', function (list) {
        refreshFacets(list);
        updateResultsCount(list);

        if (list.matchingItems.length === 0) {
          emptyMessage.style.display = '';
        } else {
          emptyMessage.style.display = 'none';
        }
      });

      // Initial facet population, sort, and count
      refreshFacets(itemList);
      itemList.sort('item-timestamp', { order: 'desc' });
      updateResultsCount(itemList);
    })
    .catch(err => {
      console.error(err);
      emptyMessage.style.display = '';
      emptyMessage.textContent = 'Failed to load minibadge data.';
      if (resultsCount) {
        resultsCount.textContent = 'Showing 0 minibadges';
      }
    });
});
