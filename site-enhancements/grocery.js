/**
 * Mobile grocery list + weekly recipe plan for CookCLI static pages.
 *
 * Plan page: select whole recipes → add expanded ingredients to grocery.
 * Recipe page: add the whole recipe (or a pantry-filtered subset).
 * Grocery page: check off while shopping; grouped by aisle when available.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cookbook-grocery-v1';
  var HOUSEHOLD_GIST_KEY = 'cookbook-grocery-household-gist';
  var HOUSEHOLD_SYNC_KEY = 'cookbook-grocery-household-sync';
  var HOUSEHOLD_POLL_MS = 8000;
  var GIST_PAYLOAD_VERSION = 1;
  var CHAPTER_LABELS = {
    appetizers: 'Appetizers',
    basics: 'Basics',
    breakfast: 'Breakfast',
    desserts: 'Desserts',
    mains: 'Mains',
    pizza: 'Pizza',
    soups: 'Soups'
  };

  function basePath() {
    var script = document.querySelector('script[src*="grocery.js"]');
    if (script && script.src) {
      try {
        var url = new URL(script.src, window.location.href);
        return url.pathname.replace(/\/static\/js\/grocery\.js$/, '') || '';
      } catch (e) {
        /* fall through */
      }
    }
    var link = document.querySelector('link[href*="/static/css/"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      var idx = href.indexOf('/static/css/');
      if (idx >= 0) return href.slice(0, idx);
    }
    return '';
  }

  function groceryUrl() {
    return basePath() + '/grocery.html';
  }

  function planUrl() {
    return basePath() + '/plan.html';
  }

  function manifestUrl() {
    return basePath() + '/static/data/recipes-manifest.json';
  }

  function householdConfigUrl() {
    return basePath() + '/static/data/household-gist.json';
  }

  var householdConfigCache = null;
  var householdPollTimer = null;

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items, options) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (!options || !options.skipHouseholdBump) {
      bumpHouseholdLocalModified();
    }
    updateBadges();
  }

  function loadHouseholdGistId() {
    try {
      var raw = localStorage.getItem(HOUSEHOLD_GIST_KEY);
      return raw ? String(raw).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function saveHouseholdGistId(gistId) {
    var id = String(gistId || '').trim();
    if (id) {
      localStorage.setItem(HOUSEHOLD_GIST_KEY, id);
    } else {
      localStorage.removeItem(HOUSEHOLD_GIST_KEY);
    }
  }

  function loadHouseholdSyncMeta() {
    try {
      var raw = localStorage.getItem(HOUSEHOLD_SYNC_KEY);
      if (!raw) {
        return { lastSyncedAt: 0, lastRemoteUpdatedAt: 0, localModifiedAt: 0 };
      }
      var parsed = JSON.parse(raw);
      return {
        lastSyncedAt: parsed.lastSyncedAt || 0,
        lastRemoteUpdatedAt: parsed.lastRemoteUpdatedAt || 0,
        localModifiedAt: parsed.localModifiedAt || 0
      };
    } catch (e) {
      return { lastSyncedAt: 0, lastRemoteUpdatedAt: 0, localModifiedAt: 0 };
    }
  }

  function saveHouseholdSyncMeta(meta) {
    localStorage.setItem(HOUSEHOLD_SYNC_KEY, JSON.stringify(meta));
  }

  function bumpHouseholdLocalModified() {
    var meta = loadHouseholdSyncMeta();
    meta.localModifiedAt = Date.now();
    saveHouseholdSyncMeta(meta);
  }

  function hasUnpublishedHouseholdChanges() {
    var meta = loadHouseholdSyncMeta();
    return meta.localModifiedAt > meta.lastSyncedAt;
  }

  function captureGistIdFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var gistId = (params.get('gist') || '').trim();
      if (!gistId) return '';
      saveHouseholdGistId(gistId);
      params.delete('gist');
      var query = params.toString();
      var next =
        window.location.pathname +
        (query ? '?' + query : '') +
        window.location.hash;
      window.history.replaceState({}, '', next);
      return gistId;
    } catch (e) {
      return '';
    }
  }

  function loadHouseholdConfig() {
    if (householdConfigCache) return Promise.resolve(householdConfigCache);
    return fetch(householdConfigUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('household config ' + res.status);
        return res.json();
      })
      .then(function (data) {
        householdConfigCache = data || {};
        return householdConfigCache;
      })
      .catch(function () {
        householdConfigCache = { gistId: '', gistFile: 'grocery.json' };
        return householdConfigCache;
      });
  }

  function resolveHouseholdGistId(config) {
    var fromUrl = captureGistIdFromUrl();
    if (fromUrl) return fromUrl;
    var stored = loadHouseholdGistId();
    if (stored) return stored;
    return config && config.gistId ? String(config.gistId).trim() : '';
  }

  function gistFileName(config) {
    return (config && config.gistFile) || 'grocery.json';
  }

  function normalizeGistItems(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(function (item) {
      return item && item.id && item.name;
    });
  }

  function buildGistPayload(items) {
    return {
      version: GIST_PAYLOAD_VERSION,
      updatedAt: Date.now(),
      items: normalizeGistItems(items)
    };
  }

  function parseGistContent(content) {
    var parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return {
        items: normalizeGistItems(parsed),
        updatedAt: 0
      };
    }
    return {
      items: normalizeGistItems(parsed.items || []),
      updatedAt: parsed.updatedAt || 0
    };
  }

  function fetchGistFileContent(file, gistUpdatedAt) {
    if (!file) return Promise.reject(new Error('gist file missing'));
    if (file.truncated && file.raw_url) {
      return fetch(file.raw_url).then(function (res) {
        if (!res.ok) throw new Error('gist raw ' + res.status);
        return res.text();
      });
    }
    return Promise.resolve(file.content || '');
  }

  function fetchHouseholdGist(gistId, config) {
    var fileName = gistFileName(config);
    return fetch('https://api.github.com/gists/' + encodeURIComponent(gistId), {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('gist ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var file = data.files && (data.files[fileName] || data.files[Object.keys(data.files)[0]]);
        return fetchGistFileContent(file, data.updated_at).then(function (content) {
          var parsed = parseGistContent(content);
          var remoteUpdatedAt = parsed.updatedAt;
          if (!remoteUpdatedAt && data.updated_at) {
            remoteUpdatedAt = new Date(data.updated_at).getTime();
          }
          return {
            items: parsed.items,
            updatedAt: remoteUpdatedAt || 0,
            gistUrl: data.html_url || 'https://gist.github.com/' + gistId
          };
        });
      });
  }

  function mergeHouseholdItems(localItems, remoteItems) {
    var localById = {};
    localItems.forEach(function (item) {
      localById[item.id] = item;
    });

    return remoteItems.map(function (remote) {
      var local = localById[remote.id];
      if (!local) return remote;
      return {
        id: remote.id,
        name: remote.name,
        quantity: remote.quantity || '',
        aisle: remote.aisle || local.aisle || '',
        recipe: remote.recipe || local.recipe || '',
        recipePath: remote.recipePath || local.recipePath || '',
        recipeId: remote.recipeId || local.recipeId || '',
        bought: !!(local.bought || remote.bought),
        addedAt: remote.addedAt || local.addedAt || Date.now()
      };
    });
  }

  function applyHouseholdGist(remote, options) {
    var opts = options || {};
    var meta = loadHouseholdSyncMeta();
    var localItems = loadCart();
    var merged = mergeHouseholdItems(localItems, remote.items);

    if (
      !opts.force &&
      remote.updatedAt &&
      remote.updatedAt <= meta.lastRemoteUpdatedAt &&
      merged.length === localItems.length
    ) {
      return { changed: false, itemCount: merged.length };
    }

    saveCart(merged, { skipHouseholdBump: true });
    meta.lastSyncedAt = Date.now();
    meta.lastRemoteUpdatedAt = remote.updatedAt || meta.lastRemoteUpdatedAt;
    meta.localModifiedAt = meta.lastSyncedAt;
    saveHouseholdSyncMeta(meta);
    return { changed: true, itemCount: merged.length };
  }

  function syncHouseholdGist(gistId, config, options) {
    return fetchHouseholdGist(gistId, config).then(function (remote) {
      var result = applyHouseholdGist(remote, options);
      return Object.assign({ remote: remote }, result);
    });
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'never';
    var delta = Date.now() - timestamp;
    if (delta < 60000) return 'just now';
    if (delta < 3600000) return Math.floor(delta / 60000) + 'm ago';
    if (delta < 86400000) return Math.floor(delta / 3600000) + 'h ago';
    return Math.floor(delta / 86400000) + 'd ago';
  }

  function stopHouseholdPolling() {
    if (householdPollTimer) {
      clearInterval(householdPollTimer);
      householdPollTimer = null;
    }
  }

  function startHouseholdPolling(gistId, config, onUpdate) {
    stopHouseholdPolling();
    if (!gistId) return;

    householdPollTimer = setInterval(function () {
      syncHouseholdGist(gistId, config)
        .then(function (result) {
          if (result.changed && onUpdate) onUpdate(result, { silent: true });
        })
        .catch(function () {
          /* ignore transient network errors while polling */
        });
    }, HOUSEHOLD_POLL_MS);
  }

  function copyHouseholdGistPayload(items) {
    var payload = JSON.stringify(buildGistPayload(items), null, 2);
    return copyText(payload);
  }

  function promptHouseholdGistId(currentId) {
    var next = window.prompt(
      'Paste your household gist ID (from the gist URL):\n\n' +
        'https://gist.github.com/you/GIST_ID',
      currentId || ''
    );
    if (next === null) return null;
    return String(next).trim();
  }

  function renderHouseholdPanel(container, state, handlers) {
    var panel = document.createElement('section');
    panel.className = 'household-sync print:hidden';

    if (!state.gistId) {
      panel.innerHTML =
        '<h2 class="household-sync-title">Household list</h2>' +
        '<p class="household-sync-copy">Link a secret GitHub gist so everyone in the household can pull the same grocery list. ' +
        'Updates are read-only here — paste copied JSON into the gist to publish changes.</p>' +
        '<div class="household-sync-actions">' +
        '<button type="button" class="grocery-primary" data-household="link">Link household gist</button>' +
        '</div>' +
        '<p class="household-sync-hint">Create a <strong>secret gist</strong> with a file named <code>grocery.json</code> containing ' +
        '<code>{"version":1,"updatedAt":0,"items":[]}</code>. Bookmark <code>grocery.html?gist=YOUR_ID</code> on each phone.</p>';
    } else {
      var statusBits = ['Linked to gist'];
      if (state.syncing) {
        statusBits.push('syncing…');
      } else if (state.lastSyncedAt) {
        statusBits.push('synced ' + formatRelativeTime(state.lastSyncedAt));
      }
      if (state.unpublished) {
        statusBits.push('unpublished local changes');
      }

      panel.innerHTML =
        '<h2 class="household-sync-title">Household list</h2>' +
        '<p class="household-sync-status">' +
        statusBits.join(' · ') +
        '</p>' +
        '<div class="household-sync-actions">' +
        '<button type="button" class="grocery-primary" data-household="sync">Sync now</button>' +
        '<button type="button" data-household="copy-json">Copy JSON for gist</button>' +
        '<button type="button" data-household="share">Share / copy text</button>' +
        '<a class="grocery-inline-link household-sync-open" href="' +
        (state.gistUrl || '#') +
        '" target="_blank" rel="noopener">Open gist</a>' +
        '<button type="button" data-household="unlink">Unlink</button>' +
        '</div>' +
        '<p class="household-sync-hint">Pulls from the gist every ' +
        Math.round(HOUSEHOLD_POLL_MS / 1000) +
        's while this page is open. To publish, tap <strong>Copy JSON for gist</strong>, open the gist, replace <code>grocery.json</code>, and save.</p>';
      if (state.error) {
        var err = document.createElement('p');
        err.className = 'household-sync-error';
        err.textContent = state.error;
        panel.appendChild(err);
      }
    }

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-household]');
      if (!btn) return;
      var action = btn.getAttribute('data-household');
      if (handlers[action]) handlers[action](e);
    });

    return panel;
  }

  function recipeTitle() {
    var h1 = document.querySelector('h1');
    return h1 ? h1.textContent.trim() : document.title.replace(/\s*-\s*Cook\s*$/, '');
  }

  function recipeKey() {
    return window.location.pathname;
  }

  function toast(message) {
    var el = document.getElementById('grocery-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'grocery-toast';
      el.className = 'grocery-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2200);
  }

  function updateBadges() {
    var count = loadCart().filter(function (item) {
      return !item.bought;
    }).length;
    document.querySelectorAll('.grocery-badge').forEach(function (badge) {
      badge.textContent = String(count);
      badge.classList.toggle('is-visible', count > 0);
      badge.setAttribute('aria-label', count + ' grocery items');
    });
  }

  function makeNavPill(href, label, extraClass, active) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'nav-pill ' + (extraClass || '');
    if (active) a.classList.add('active');
    a.innerHTML = label;
    return a;
  }

  function ensureNavLink() {
    var path = window.location.pathname;
    var isGroceryPage = path.indexOf('/grocery') !== -1;
    var isPlanPage = path.indexOf('/plan') !== -1;

    if (!document.querySelector('a.grocery-plan-nav-link')) {
      var desktopRow = document.querySelector('nav a.nav-pill');
      if (desktopRow && desktopRow.parentElement) {
        var plan = makeNavPill(planUrl(), 'Plan', 'grocery-plan-nav-link', isPlanPage);
        desktopRow.parentElement.appendChild(plan);
      }

      var mobileRecipes = document.querySelector('#more-dropdown a[href*="index.html"]');
      if (mobileRecipes && mobileRecipes.parentElement) {
        var mPlan = document.createElement('a');
        mPlan.href = planUrl();
        mPlan.className =
          'grocery-plan-nav-link flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-semibold';
        mPlan.textContent = 'Plan';
        mobileRecipes.insertAdjacentElement('afterend', mPlan);
      }
    }

    if (!document.querySelector('a.grocery-nav-link')) {
      var desktopAnchor = document.querySelector('nav a.grocery-plan-nav-link') || document.querySelector('nav a.nav-pill');
      if (desktopAnchor && desktopAnchor.parentElement) {
        var grocery = makeNavPill(
          groceryUrl(),
          'Grocery <span class="grocery-badge" aria-hidden="true">0</span>',
          'grocery-nav-link',
          isGroceryPage
        );
        desktopAnchor.parentElement.appendChild(grocery);
      }

      var mobilePlan = document.querySelector('#more-dropdown a.grocery-plan-nav-link');
      var mobileRecipesLink = document.querySelector('#more-dropdown a[href*="index.html"]');
      var mobileInsertAfter = mobilePlan || mobileRecipesLink;
      if (mobileInsertAfter && mobileInsertAfter.parentElement) {
        var m = document.createElement('a');
        m.href = groceryUrl();
        m.className =
          'grocery-nav-link flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-semibold';
        m.innerHTML = 'Grocery <span class="grocery-badge" aria-hidden="true">0</span>';
        mobileInsertAfter.insertAdjacentElement('afterend', m);
      }
    }

    updateBadges();
  }

  function findIngredientLists() {
    var heading = null;
    document.querySelectorAll('h2').forEach(function (h2) {
      if (/ingredients/i.test(h2.textContent || '')) heading = h2;
    });
    if (!heading) return { heading: null, lists: [] };

    var panel = heading.parentElement;
    if (!panel) return { heading: heading, lists: [] };

    var lists = [];
    var cookware = null;
    panel.querySelectorAll('h2').forEach(function (h2) {
      if (/cookware/i.test(h2.textContent || '')) cookware = h2;
    });

    panel.querySelectorAll('ul').forEach(function (ul) {
      if (ul.classList.contains('cookware-list')) return;
      if (cookware && !(ul.compareDocumentPosition(cookware) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        return;
      }
      if (ul.querySelector(':scope > li span.font-medium')) lists.push(ul);
    });

    return { heading: heading, lists: lists, panel: panel };
  }

  function parseIngredientLi(li) {
    var nameEl = li.querySelector('span.font-medium');
    if (!nameEl) return null;
    var name = nameEl.textContent.trim();
    if (!name) return null;

    var qty = '';
    var qtyEl = li.querySelector('span.text-orange-700, span[class*="text-orange"]');
    if (qtyEl && qtyEl !== nameEl) {
      qty = qtyEl.textContent.replace(/\s+/g, ' ').trim();
    }

    return { name: name, quantity: qty };
  }

  function appendItemsToCart(selected) {
    if (!selected.length) {
      return { added: 0, skipped: 0 };
    }

    var cart = loadCart();
    var existing = {};
    cart.forEach(function (item) {
      existing[item.id] = true;
    });

    var added = 0;
    selected.forEach(function (item) {
      if (existing[item.id]) return;
      cart.push(item);
      existing[item.id] = true;
      added += 1;
    });

    saveCart(cart);
    return { added: added, skipped: selected.length - added };
  }

  function cartItemFromIngredient(ing, recipeMeta) {
    var qty = ing.quantity || '';
    var aisle = ing.aisle || '';
    return {
      id: recipeMeta.path + '::' + ing.name + '::' + qty,
      name: ing.name,
      quantity: qty,
      aisle: aisle,
      recipe: recipeMeta.title,
      recipePath: recipeMeta.path,
      recipeId: recipeMeta.id || '',
      bought: false,
      addedAt: Date.now()
    };
  }

  function enhanceRecipePage() {
    var found = findIngredientLists();
    if (!found.heading || !found.lists.length) return;

    var hint = document.createElement('p');
    hint.className = 'grocery-hint print:hidden';
    hint.innerHTML =
      'Add this whole recipe to your grocery list, or uncheck pantry staples first. ' +
      'To shop for several meals at once, use <a href="' +
      planUrl() +
      '">Plan</a>.';

    var toolbar = document.createElement('div');
    toolbar.className = 'grocery-toolbar print:hidden';
    toolbar.innerHTML =
      '<button type="button" class="grocery-primary" data-grocery-action="export">Add recipe to grocery</button>' +
      '<button type="button" data-grocery-action="all">Select all</button>' +
      '<button type="button" data-grocery-action="none">Select none</button>';

    found.heading.insertAdjacentElement('afterend', toolbar);
    toolbar.insertAdjacentElement('afterend', hint);

    found.lists.forEach(function (ul) {
      ul.querySelectorAll(':scope > li').forEach(function (li) {
        if (li.querySelector('.grocery-check')) return;
        var parsed = parseIngredientLi(li);
        if (!parsed) return;

        li.classList.add('grocery-ingredient-li');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'grocery-check';
        cb.checked = true;
        cb.setAttribute('aria-label', 'Include ' + parsed.name);
        cb.addEventListener('click', function (e) {
          e.stopPropagation();
        });
        cb.addEventListener('change', function () {
          li.classList.toggle('is-unchecked', !cb.checked);
        });
        li.insertBefore(cb, li.firstChild);
        li.addEventListener('click', function (e) {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });
      });
    });

    toolbar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-grocery-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-grocery-action');
      var checks = document.querySelectorAll('.grocery-check');

      if (action === 'all') {
        checks.forEach(function (cb) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change'));
        });
        return;
      }
      if (action === 'none') {
        checks.forEach(function (cb) {
          cb.checked = false;
          cb.dispatchEvent(new Event('change'));
        });
        return;
      }
      if (action === 'export') {
        exportCheckedFromPage();
      }
    });
  }

  function exportCheckedFromPage() {
    var title = recipeTitle();
    var key = recipeKey();
    var selected = [];

    document.querySelectorAll('.grocery-ingredient-li').forEach(function (li) {
      var cb = li.querySelector('.grocery-check');
      if (!cb || !cb.checked) return;
      var parsed = parseIngredientLi(li);
      if (!parsed) return;
      selected.push(
        cartItemFromIngredient(parsed, {
          title: title,
          path: key,
          id: ''
        })
      );
    });

    if (!selected.length) {
      toast('Check at least one ingredient first');
      return;
    }

    var result = appendItemsToCart(selected);
    if (result.added === 0) {
      toast('Those items are already on your grocery list');
    } else {
      toast('Added ' + result.added + ' item' + (result.added === 1 ? '' : 's') + ' · open Grocery');
    }
  }

  function formatPlainText(items) {
    if (!items.length) return 'Grocery list is empty.';
    var lines = ['Grocery list', ''];
    var byAisle = {};
    var aisleOrder = [];

    items.forEach(function (item) {
      var a = item.aisle || 'other';
      if (!byAisle[a]) {
        byAisle[a] = [];
        aisleOrder.push(a);
      }
      byAisle[a].push(item);
    });

    var hasAisle = aisleOrder.some(function (a) {
      return a && a !== 'other';
    });

    if (hasAisle) {
      aisleOrder.forEach(function (aisle) {
        lines.push(titleCaseAisle(aisle));
        byAisle[aisle].forEach(function (item) {
          var mark = item.bought ? '[x]' : '[ ]';
          var qty = item.quantity ? ' — ' + item.quantity : '';
          var recipe = item.recipe ? ' (' + item.recipe + ')' : '';
          lines.push(mark + ' ' + item.name + qty + recipe);
        });
        lines.push('');
      });
    } else {
      var byRecipe = {};
      items.forEach(function (item) {
        var r = item.recipe || 'Items';
        if (!byRecipe[r]) byRecipe[r] = [];
        byRecipe[r].push(item);
      });
      Object.keys(byRecipe).forEach(function (recipe) {
        lines.push(recipe);
        byRecipe[recipe].forEach(function (item) {
          var mark = item.bought ? '[x]' : '[ ]';
          var qty = item.quantity ? ' — ' + item.quantity : '';
          lines.push(mark + ' ' + item.name + qty);
        });
        lines.push('');
      });
    }

    return lines.join('\n').trim() + '\n';
  }

  function titleCaseAisle(aisle) {
    if (!aisle) return 'Other';
    return aisle.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function shareOrCopy(items) {
    var text = formatPlainText(items);
    if (navigator.share) {
      navigator
        .share({ title: 'Grocery list', text: text })
        .catch(function () {
          return copyText(text).then(function () {
            toast('Copied grocery list');
          });
        });
      return;
    }
    copyText(text)
      .then(function () {
        toast('Copied grocery list');
      })
      .catch(function () {
        toast('Could not copy — try selecting the list');
      });
  }

  function sortItemsForDisplay(items) {
    var aisleRank = {};
    var rank = 0;
    items.forEach(function (item) {
      var a = item.aisle || 'other';
      if (!(a in aisleRank)) aisleRank[a] = rank++;
    });
    return items
      .map(function (item, index) {
        return { item: item, index: index };
      })
      .sort(function (a, b) {
        var aa = a.item.aisle || 'other';
        var ba = b.item.aisle || 'other';
        if (aisleRank[aa] !== aisleRank[ba]) return aisleRank[aa] - aisleRank[ba];
        return (a.item.name || '').localeCompare(b.item.name || '');
      });
  }

  function renderGroceryPage() {
    var root = document.getElementById('grocery-root');
    if (!root) return;

    var householdState = {
      config: null,
      gistId: '',
      gistUrl: '',
      syncing: false,
      error: '',
      lastSyncedAt: 0,
      unpublished: false
    };

    function refreshHouseholdState() {
      var meta = loadHouseholdSyncMeta();
      householdState.lastSyncedAt = meta.lastSyncedAt;
      householdState.unpublished = hasUnpublishedHouseholdChanges();
    }

    function householdHandlers() {
      return {
        link: function () {
          var next = promptHouseholdGistId(householdState.gistId);
          if (next === null) return;
          if (!next) {
            toast('Paste a gist ID to link');
            return;
          }
          householdState.gistId = next;
          saveHouseholdGistId(next);
          householdState.error = '';
          runHouseholdSync({ force: true, announce: true });
        },
        sync: function () {
          runHouseholdSync({ force: true, announce: true });
        },
        'copy-json': function () {
          copyHouseholdGistPayload(loadCart())
            .then(function () {
              refreshHouseholdState();
              draw();
              toast('Copied JSON — paste into grocery.json on the gist');
            })
            .catch(function () {
              toast('Could not copy JSON');
            });
        },
        share: function () {
          shareOrCopy(loadCart());
        },
        unlink: function () {
          if (!confirm('Stop syncing with this household gist on this device?')) return;
          stopHouseholdPolling();
          saveHouseholdGistId('');
          householdState.gistId = '';
          householdState.gistUrl = '';
          householdState.error = '';
          draw();
          toast('Household gist unlinked');
        }
      };
    }

    function runHouseholdSync(options) {
      var opts = options || {};
      if (!householdState.gistId) return Promise.resolve();

      householdState.syncing = true;
      householdState.error = '';
      if (!opts.silent) draw();

      return syncHouseholdGist(householdState.gistId, householdState.config, {
        force: !!opts.force
      })
        .then(function (result) {
          householdState.gistUrl = result.remote.gistUrl;
          householdState.syncing = false;
          householdState.error = '';
          refreshHouseholdState();
          if (opts.announce && result.changed) {
            toast('Synced ' + result.itemCount + ' household items');
          } else if (opts.announce && !result.changed) {
            toast('Already up to date');
          } else if (result.changed && opts.silent) {
            toast('Household list updated');
          }
          draw();
          return result;
        })
        .catch(function (err) {
          householdState.syncing = false;
          householdState.error =
            (err && err.message ? err.message : 'Could not reach gist') +
            '. Check the gist ID and that grocery.json exists.';
          draw();
        });
    }

    function draw() {
      var items = loadCart();
      refreshHouseholdState();
      root.innerHTML = '';

      var title = document.createElement('h1');
      title.textContent = 'Grocery';
      root.appendChild(title);

      var sub = document.createElement('p');
      sub.className = 'grocery-sub';
      if (items.length === 0) {
        sub.innerHTML =
          'Nothing here yet. <a href="' +
          planUrl() +
          '">Plan</a> a few recipes for the week, or open a recipe and tap <strong>Add recipe to grocery</strong>.';
      } else {
        sub.textContent =
          items.length +
          ' item' +
          (items.length === 1 ? '' : 's') +
          ' · tap to check off while shopping';
      }
      root.appendChild(sub);

      root.appendChild(
        renderHouseholdPanel(root, householdState, householdHandlers())
      );

      var actions = document.createElement('div');
      actions.className = 'grocery-actions print:hidden';
      if (items.length) {
        actions.innerHTML =
          '<button type="button" class="grocery-primary" data-act="share">Share / copy</button>' +
          '<button type="button" data-act="clear-bought">Clear checked</button>' +
          '<button type="button" data-act="clear-all">Clear all</button>';
      }
      actions.innerHTML +=
        '<a href="' +
        planUrl() +
        '" class="grocery-inline-link">← Plan recipes</a>' +
        '<a href="' +
        (basePath() || '') +
        '/index.html" class="grocery-inline-link">Recipes</a>';
      root.appendChild(actions);

      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'grocery-empty';
        empty.innerHTML =
          'Your grocery list is empty.<br><a href="' + planUrl() + '">Select recipes for the week →</a>';
        root.appendChild(empty);
        actions.addEventListener('click', function (e) {
          var btn = e.target.closest('button[data-act]');
          if (!btn) return;
          var act = btn.getAttribute('data-act');
          if (act === 'share') shareOrCopy(loadCart());
        });
        updateBadges();
        return;
      }

      var recipesOnList = {};
      items.forEach(function (item) {
        if (item.recipe) recipesOnList[item.recipe] = (recipesOnList[item.recipe] || 0) + 1;
      });
      var recipeNames = Object.keys(recipesOnList);
      if (recipeNames.length) {
        var recipeBar = document.createElement('div');
        recipeBar.className = 'grocery-recipe-bar print:hidden';
        recipeBar.innerHTML =
          '<span class="grocery-recipe-bar-label">' +
          recipeNames.length +
          ' recipe' +
          (recipeNames.length === 1 ? '' : 's') +
          ':</span> ';
        recipeNames.forEach(function (name) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'grocery-recipe-chip';
          chip.textContent = name + ' ×';
          chip.title = 'Remove all items from ' + name;
          chip.addEventListener('click', function () {
            if (!confirm('Remove all grocery items from “' + name + '”?')) return;
            saveCart(
              loadCart().filter(function (item) {
                return item.recipe !== name;
              })
            );
            draw();
            toast('Removed ' + name);
          });
          recipeBar.appendChild(chip);
        });
        root.appendChild(recipeBar);
      }

      var sorted = sortItemsForDisplay(items);
      var listWrap = document.createElement('div');
      listWrap.className = 'grocery-list-wrap';

      var currentAisle = null;
      var ul = null;
      var hasRealAisle = items.some(function (item) {
        return item.aisle && item.aisle !== 'other';
      });

      sorted.forEach(function (entry) {
        var item = entry.item;
        var index = entry.index;
        var aisle = item.aisle || 'other';

        if (hasRealAisle && aisle !== currentAisle) {
          currentAisle = aisle;
          var h2 = document.createElement('h2');
          h2.className = 'grocery-aisle-heading';
          h2.textContent = titleCaseAisle(aisle);
          listWrap.appendChild(h2);
          ul = document.createElement('ul');
          ul.className = 'grocery-list';
          listWrap.appendChild(ul);
        } else if (!ul) {
          ul = document.createElement('ul');
          ul.className = 'grocery-list';
          listWrap.appendChild(ul);
        }

        var li = document.createElement('li');
        if (item.bought) li.classList.add('is-bought');

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!item.bought;
        cb.setAttribute('aria-label', 'Bought ' + item.name);
        cb.addEventListener('change', function () {
          var cart = loadCart();
          if (cart[index]) {
            cart[index].bought = cb.checked;
            saveCart(cart);
            draw();
          }
        });

        var text = document.createElement('div');
        text.className = 'grocery-item-text';
        var name = document.createElement('span');
        name.className = 'grocery-item-name';
        name.textContent = item.name;
        text.appendChild(name);
        if (item.quantity) {
          var qty = document.createElement('span');
          qty.className = 'grocery-item-qty';
          qty.textContent = item.quantity;
          text.appendChild(qty);
        }
        if (item.recipe) {
          var recipe = document.createElement('span');
          recipe.className = 'grocery-item-recipe';
          recipe.textContent = item.recipe;
          text.appendChild(recipe);
        }

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'grocery-item-remove';
        remove.setAttribute('aria-label', 'Remove ' + item.name);
        remove.textContent = '×';
        remove.addEventListener('click', function () {
          var cart = loadCart();
          cart.splice(index, 1);
          saveCart(cart);
          draw();
        });

        li.appendChild(cb);
        li.appendChild(text);
        li.appendChild(remove);
        ul.appendChild(li);
      });
      root.appendChild(listWrap);

      actions.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var cart = loadCart();
        if (act === 'share') {
          shareOrCopy(cart);
        } else if (act === 'clear-bought') {
          saveCart(
            cart.filter(function (item) {
              return !item.bought;
            })
          );
          draw();
          toast('Cleared checked items');
        } else if (act === 'clear-all') {
          if (confirm('Clear the entire grocery list?')) {
            saveCart([]);
            draw();
            toast('Grocery list cleared');
          }
        }
      });

      updateBadges();
    }

    loadHouseholdConfig().then(function (config) {
      householdState.config = config;
      householdState.gistId = resolveHouseholdGistId(config);
      if (householdState.gistId) {
        saveHouseholdGistId(householdState.gistId);
      }
      draw();
      if (householdState.gistId) {
        runHouseholdSync({ force: true });
        startHouseholdPolling(householdState.gistId, householdState.config, function (result) {
          householdState.gistUrl = result.remote.gistUrl;
          householdState.error = '';
          refreshHouseholdState();
          toast('Household list updated');
          draw();
        });
      }
    });

    window.addEventListener('pagehide', stopHouseholdPolling);
  }

  var manifestCache = null;

  function loadManifest() {
    if (manifestCache) return Promise.resolve(manifestCache);
    return fetch(manifestUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('manifest ' + res.status);
        return res.json();
      })
      .then(function (data) {
        manifestCache = data;
        return data;
      });
  }

  function chapterLabel(chapter) {
    return CHAPTER_LABELS[chapter] || titleCaseAisle(chapter);
  }

  function renderPlanPage() {
    var root = document.getElementById('plan-root');
    if (!root) return;

    root.innerHTML =
      '<h1>Plan</h1>' +
      '<p class="grocery-sub">Select whole recipes for the week, then add them to your grocery list in one tap.</p>' +
      '<p class="grocery-loading">Loading recipes…</p>';

    loadManifest()
      .then(function (data) {
        drawPlan(root, data);
      })
      .catch(function () {
        root.innerHTML =
          '<h1>Plan</h1>' +
          '<div class="grocery-empty">Could not load the recipe list. Rebuild the site with <code>inject.sh</code>.</div>';
      });
  }

  function drawPlan(root, data) {
    var selected = {};

    function selectedIds() {
      return Object.keys(selected).filter(function (id) {
        return selected[id];
      });
    }

    function redraw() {
      var ids = selectedIds();
      root.innerHTML = '';

      var title = document.createElement('h1');
      title.textContent = 'Plan';
      root.appendChild(title);

      var sub = document.createElement('p');
      sub.className = 'grocery-sub';
      sub.textContent =
        'Select whole recipes for the week, then add them to your grocery list in one tap. Composed recipes expand into their ingredients.';
      root.appendChild(sub);

      var toolbar = document.createElement('div');
      toolbar.className = 'plan-toolbar print:hidden';
      toolbar.innerHTML =
        '<button type="button" data-plan="all">Select all</button>' +
        '<button type="button" data-plan="none">Clear selection</button>' +
        '<a href="' +
        groceryUrl() +
        '" class="grocery-inline-link">View grocery →</a>';
      root.appendChild(toolbar);

      var byChapter = {};
      (data.chapters || []).forEach(function (ch) {
        byChapter[ch] = [];
      });
      (data.recipes || []).forEach(function (recipe) {
        if (!byChapter[recipe.chapter]) byChapter[recipe.chapter] = [];
        byChapter[recipe.chapter].push(recipe);
      });

      Object.keys(byChapter)
        .sort()
        .forEach(function (chapter) {
          var recipes = byChapter[chapter];
          if (!recipes.length) return;

          var section = document.createElement('section');
          section.className = 'plan-chapter';

          var h2 = document.createElement('h2');
          h2.className = 'plan-chapter-title';
          h2.textContent = chapterLabel(chapter);
          section.appendChild(h2);

          var ul = document.createElement('ul');
          ul.className = 'plan-recipe-list';

          recipes.forEach(function (recipe) {
            var li = document.createElement('li');
            li.className = 'plan-recipe-li';
            if (selected[recipe.id]) li.classList.add('is-selected');

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!selected[recipe.id];
            cb.setAttribute('aria-label', 'Select ' + recipe.title);
            cb.addEventListener('click', function (e) {
              e.stopPropagation();
            });
            cb.addEventListener('change', function () {
              selected[recipe.id] = cb.checked;
              redraw();
            });

            var body = document.createElement('div');
            body.className = 'plan-recipe-body';

            var name = document.createElement('span');
            name.className = 'plan-recipe-name';
            name.textContent = recipe.title;
            body.appendChild(name);

            var meta = document.createElement('span');
            meta.className = 'plan-recipe-meta';
            meta.textContent =
              (recipe.ingredientCount || (recipe.ingredients && recipe.ingredients.length) || 0) +
              ' ingredients';
            body.appendChild(meta);

            var open = document.createElement('a');
            open.href = recipe.href;
            open.className = 'plan-recipe-open';
            open.textContent = 'View';
            open.addEventListener('click', function (e) {
              e.stopPropagation();
            });

            li.appendChild(cb);
            li.appendChild(body);
            li.appendChild(open);
            li.addEventListener('click', function (e) {
              if (e.target === cb || e.target === open) return;
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event('change'));
            });
            ul.appendChild(li);
          });

          section.appendChild(ul);
          root.appendChild(section);
        });

      var bar = document.createElement('div');
      bar.className = 'plan-sticky-bar print:hidden';
      var count = ids.length;
      bar.innerHTML =
        '<span class="plan-sticky-count">' +
        (count === 0
          ? 'Select recipes for the week'
          : count + ' recipe' + (count === 1 ? '' : 's') + ' selected') +
        '</span>' +
        '<button type="button" class="grocery-primary" data-plan="add"' +
        (count === 0 ? ' disabled' : '') +
        '>Add to grocery</button>';
      root.appendChild(bar);

      toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-plan]');
        if (!btn) return;
        var act = btn.getAttribute('data-plan');
        if (act === 'all') {
          (data.recipes || []).forEach(function (r) {
            selected[r.id] = true;
          });
          redraw();
        } else if (act === 'none') {
          selected = {};
          redraw();
        }
      });

      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-plan="add"]');
        if (!btn || btn.disabled) return;
        addSelectedRecipes();
      });
    }

    function addSelectedRecipes() {
      var ids = selectedIds();
      var recipeMap = {};
      (data.recipes || []).forEach(function (r) {
        recipeMap[r.id] = r;
      });

      var batch = [];
      var recipeCount = 0;
      ids.forEach(function (id) {
        var recipe = recipeMap[id];
        if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return;
        recipeCount += 1;
        recipe.ingredients.forEach(function (ing) {
          batch.push(
            cartItemFromIngredient(ing, {
              title: recipe.title,
              path: recipe.href,
              id: recipe.id
            })
          );
        });
      });

      if (!batch.length) {
        toast('No ingredients found for the selected recipes');
        return;
      }

      var result = appendItemsToCart(batch);
      if (result.added === 0) {
        toast('Those recipes are already on your grocery list');
      } else {
        toast(
          'Added ' +
            recipeCount +
            ' recipe' +
            (recipeCount === 1 ? '' : 's') +
            ' (' +
            result.added +
            ' items) · open Grocery'
        );
      }
    }

    redraw();
  }

  function init() {
    ensureNavLink();
    if (document.getElementById('plan-root')) {
      renderPlanPage();
    } else if (document.getElementById('grocery-root')) {
      renderGroceryPage();
    } else if (/\/recipe\//.test(window.location.pathname)) {
      enhanceRecipePage();
    }
    updateBadges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
