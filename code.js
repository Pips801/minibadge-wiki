document.addEventListener('DOMContentLoaded', () => {
  const listContainer      = document.querySelector('#items-list .minibadge-list');
  const categoryFilter     = document.getElementById('categoryFilter');
  const yearFilter         = document.getElementById('yearFilter');
  const difficultyFilter   = document.getElementById('difficultyFilter');
  const authorFilter       = document.getElementById('authorFilter');
  const sortSelect         = document.getElementById('sortSelect');
  const emptyMessage       = document.getElementById('emptyMessage');
  const clearFiltersButton = document.getElementById('clearFiltersButton');
  const searchInput        = document.getElementById('searchInput');
  const resultsCount       = document.getElementById('resultsCount');

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCard(item) {
    const title                = esc(item.title);
    const author               = esc(item.author);
    const category             = esc(item.category);
    const conferenceYear       = esc(item.conferenceYear);
    const solderingDifficulty  = esc(item.solderingDifficulty);
    const quantityMade         = esc(item.quantityMade);
    const boardHouse           = esc(item.boardHouse);
    const description          = esc(item.description);
    const specialInstructions  = esc(item.specialInstructions);
    const solderingInstructions= esc(item.solderingInstructions);
    const howToAcquire         = esc(item.howToAcquire);
    const timestamp            = esc(item.timestamp);

    const profilePictureUrl    = esc(item.profilePictureUrl || './cat.jpeg');
    const frontImageUrl        = esc(item.frontImageUrl   || './front.png');
    const backImageUrl         = esc(item.backImageUrl    || './back.png');

    return `
      <article class="card minibadge-card">
        <div class="card-content">
          <div class="media">
            <div class="media-left">
              <figure class="image is-48x48">
                <img
                  loading="lazy"
                  class="is-rounded item-profilePictureUrl"
                  src="${profilePictureUrl}"
                  alt="${author} profile picture"
                >
              </figure>
            </div>
            <div class="media-content">
              <p class="title is-4 item-title">${title}</p>
              <p class="subtitle is-6">
                by
                <span class="has-text-weight-semibold item-author">
                  ${author}
                </span>
              </p>
              <div class="tags are-small">
                <span class="tag is-info item-category">
                  ${category}
                </span>
                <span class="tag is-primary is-light item-conferenceYear">
                  ${conferenceYear}
                </span>
                <span class="tag is-warning item-solderingDifficulty">
                  ${solderingDifficulty}
                </span>
                <span class="item-quantityMade" style="display:none;">
                  ${quantityMade}
                </span>
                <span class="tag is-light">
                  Run: ${quantityMade}
                </span>
                <span class="tag is-light item-boardHouse">
                  ${boardHouse}
                </span>
              </div>
            </div>
          </div>

          <div class="columns is-variable is-4 mt-3">
            <div class="column is-4">
              <figure class="image mb-3">
                <img
                  loading="lazy"
                  class="item-frontImageUrl"
                  src="${frontImageUrl}"
                  alt="${title} front"
                >
              </figure>
              <figure class="image">
                <img
                  loading="lazy"
                  class="item-backImageUrl"
                  src="${backImageUrl}"
                  alt="${title} back"
                >
              </figure>
            </div>

            <div class="column">
              <div class="content item-description">
                ${description}
              </div>

              <div class="mb-2">
                <details>
                  <summary class="has-text-weight-semibold">
                    Special instructions
                  </summary>
                  <div class="content item-specialInstructions mt-2">
                    ${specialInstructions}
                  </div>
                </details>
              </div>

              <div class="mb-2">
                <details>
                  <summary class="has-text-weight-semibold">
                    Assembly &amp; soldering instructions
                  </summary>
                  <div class="content item-solderingInstructions mt-2">
                    ${solderingInstructions}
                  </div>
                </details>
              </div>

              <div class="mb-2">
                <details>
                  <summary class="has-text-weight-semibold">
                    How do people get one?
                  </summary>
                  <div class="content item-howToAcquire mt-2">
                    ${howToAcquire}
                  </div>
                </details>
              </div>

              <p class="is-size-7 has-text-grey-light item-timestamp mt-3">
                ${timestamp}
              </p>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  fetch('minibadges.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load minibadges.json');
      }
      return response.json();
    })
    .then(data => {
      data.forEach(item => {
        listContainer.insertAdjacentHTML('beforeend', renderCard(item));
      });

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

      function applyFilters() {
        const category   = categoryFilter.value;
        const year       = yearFilter.value;
        const difficulty = difficultyFilter.value;
        const author     = authorFilter.value;

        itemList.filter(function (item) {
          const v = item.values();

          const catVal  = (v['item-category'] || '').trim();
          const yearVal = (v['item-conferenceYear'] || '').trim();
          const diffVal = (v['item-solderingDifficulty'] || '').trim();
          const authVal = (v['item-author'] || '').trim();

          if (category && catVal !== category) return false;
          if (year && yearVal !== year) return false;
          if (difficulty && diffVal !== difficulty) return false;
          if (author && authVal !== author) return false;

          return true;
        });
      }

    // Search box wiring: manually hook up to List.js search
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const query = searchInput.value;
          itemList.search(query);
        });
      }


      function updateResultsCount(list) {
        if (!resultsCount) return;
        const current = list.matchingItems.length;
        if (current === totalCount) {
          resultsCount.textContent = `Showing ${current} minibadges`;
        } else {
          resultsCount.textContent = `Showing ${current} of ${totalCount} minibadges`;
        }
      }

      categoryFilter.addEventListener('change', applyFilters);
      yearFilter.addEventListener('change', applyFilters);
      difficultyFilter.addEventListener('change', applyFilters);
      authorFilter.addEventListener('change', applyFilters);

      sortSelect.addEventListener('change', () => {
        const raw = sortSelect.value;
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

      if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          categoryFilter.value   = '';
          yearFilter.value       = '';
          difficultyFilter.value = '';
          authorFilter.value     = '';

          itemList.search('');
          itemList.filter();
        });
      }

      itemList.on('updated', function (list) {
        refreshFacets(list);
        updateResultsCount(list);

        if (list.matchingItems.length === 0) {
          emptyMessage.style.display = '';
        } else {
          emptyMessage.style.display = 'none';
        }
      });

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
