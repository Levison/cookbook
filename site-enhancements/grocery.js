/**
 * Mobile grocery list + weekly recipe plan for CookCLI static pages.
 *
 * Plan page: select whole recipes → add expanded ingredients to grocery.
 * Recipe page: add the whole recipe (or a pantry-filtered subset).
 * Grocery page: check off while shopping; grouped by aisle when available.
 * Duplicate ingredients (same name) combine into one line with summed quantities.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cookbook-grocery-v1';
  var SHARE_LIST_HASH_PREFIX = '#l=';
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

  function normalizeIngredientName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function ingredientKey(name) {
    return 'ingredient::' + normalizeIngredientName(name);
  }

  function parseFractionOrNumber(text) {
    var s = String(text || '').trim();
    var mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
    }
    var frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      return parseInt(frac[1], 10) / parseInt(frac[2], 10);
    }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseQuantity(qtyStr) {
    if (!qtyStr || !String(qtyStr).trim()) return null;
    qtyStr = String(qtyStr).trim();
    if (/\d\s*-\s*\d/.test(qtyStr)) return { raw: qtyStr };
    var m = qtyStr.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
    if (!m) return { raw: qtyStr };
    var amount = parseFractionOrNumber(m[1]);
    if (amount === null) return { raw: qtyStr };
    return { amount: amount, unit: (m[2] || '').trim().toLowerCase() };
  }

  function formatAmount(n) {
    if (!isFinite(n) || n < 0) return String(n);
    var whole = Math.floor(n + 1e-9);
    var frac = n - whole;
    var nice = [
      [0.25, '1/4'],
      [0.333, '1/3'],
      [0.5, '1/2'],
      [0.666, '2/3'],
      [0.75, '3/4']
    ];
    var i;
    for (i = 0; i < nice.length; i += 1) {
      if (Math.abs(frac - nice[i][0]) < 0.02) {
        if (whole === 0) return nice[i][1];
        return whole + ' ' + nice[i][1];
      }
    }
    if (Math.abs(frac) < 0.01) return String(whole);
    return String(Math.round(n * 100) / 100);
  }

  function scaleNumericToken(token, factor) {
    var n = parseFractionOrNumber(token);
    if (n === null) return token;
    return formatAmount(n * factor);
  }

  /** Scale a quantity string like "1/2 c", "4", or "4-5 cloves". */
  function scaleQuantityString(qtyStr, factor) {
    if (!qtyStr) return qtyStr;
    if (!isFinite(factor) || Math.abs(factor - 1) < 1e-9) return String(qtyStr).trim();
    qtyStr = String(qtyStr).trim();

    var range = qtyStr.match(
      /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*-\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(.*)$/
    );
    if (range) {
      return (
        scaleNumericToken(range[1], factor) +
        '-' +
        scaleNumericToken(range[2], factor) +
        range[3]
      ).trim();
    }

    var m = qtyStr.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(.*)$/);
    if (!m) return qtyStr;
    return (scaleNumericToken(m[1], factor) + m[2]).trim();
  }

  function combineQuantityList(qtyList) {
    var byUnit = {};
    var raws = [];
    var seenRaw = {};

    qtyList.forEach(function (q) {
      if (!q) return;
      var parsed = parseQuantity(q);
      if (!parsed || parsed.raw) {
        if (!seenRaw[q]) {
          seenRaw[q] = true;
          raws.push(q);
        }
        return;
      }
      var key = parsed.unit || '__count__';
      byUnit[key] = (byUnit[key] || 0) + parsed.amount;
    });

    var parts = [];
    Object.keys(byUnit).forEach(function (key) {
      var unit = key === '__count__' ? '' : key;
      var text = formatAmount(byUnit[key]) + (unit ? ' ' + unit : '');
      parts.push(text.trim());
    });
    raws.forEach(function (r) {
      parts.push(r);
    });
    return parts.join(' + ');
  }

  function uniqueRecipeNames(contributions) {
    var names = [];
    var seen = {};
    contributions.forEach(function (c) {
      if (!c.recipe || seen[c.recipe]) return;
      seen[c.recipe] = true;
      names.push(c.recipe);
    });
    return names;
  }

  function migrateItem(item) {
    if (item.contributions && item.contributions.length) return item;
    return Object.assign({}, item, {
      contributions: [
        {
          recipe: item.recipe || '',
          recipePath: item.recipePath || '',
          recipeId: item.recipeId || '',
          quantity: item.quantity || ''
        }
      ]
    });
  }

  function recomputeCombinedItem(item) {
    item = migrateItem(item);
    item.id = ingredientKey(item.name);
    item.quantity = combineQuantityList(
      item.contributions.map(function (c) {
        return c.quantity;
      })
    );
    item.recipe = uniqueRecipeNames(item.contributions).join(', ');
    return item;
  }

  function normalizeCart(cart) {
    var byKey = {};
    cart.forEach(function (raw) {
      var item = recomputeCombinedItem(migrateItem(raw));
      var key = item.id;
      if (!byKey[key]) {
        byKey[key] = item;
        return;
      }
      var target = byKey[key];
      item.contributions.forEach(function (c) {
        var ck = (c.recipePath || c.recipe || '') + '::' + item.name;
        var exists = target.contributions.some(function (ec) {
          return (ec.recipePath || ec.recipe || '') + '::' + item.name === ck;
        });
        if (!exists) target.contributions.push(c);
      });
      if (!target.aisle && item.aisle) target.aisle = item.aisle;
      target.bought = target.bought && item.bought;
      target.addedAt = Math.min(target.addedAt || Date.now(), item.addedAt || Date.now());
      recomputeCombinedItem(target);
    });
    return Object.keys(byKey).map(function (key) {
      return byKey[key];
    });
  }

  function removeRecipeFromCart(cart, recipeName) {
    return normalizeCart(
      cart
        .map(function (item) {
          item = migrateItem(item);
          var contributions = item.contributions.filter(function (c) {
            return c.recipe !== recipeName;
          });
          if (!contributions.length) return null;
          return recomputeCombinedItem(Object.assign({}, item, { contributions: contributions }));
        })
        .filter(Boolean)
    );
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return normalizeCart(parsed);
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCart(items)));
    updateBadges();
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
    var added = 0;

    selected.forEach(function (incoming) {
      incoming = recomputeCombinedItem(migrateItem(incoming));
      var key = incoming.id;
      var existing = null;
      var i;
      for (i = 0; i < cart.length; i += 1) {
        if (cart[i].id === key) {
          existing = cart[i];
          break;
        }
      }

      if (existing) {
        var newContribs = incoming.contributions.filter(function (nc) {
          var ck = (nc.recipePath || nc.recipe || '') + '::' + incoming.name;
          return !existing.contributions.some(function (ec) {
            return (ec.recipePath || ec.recipe || '') + '::' + incoming.name === ck;
          });
        });
        if (!newContribs.length) return;
        existing.contributions = existing.contributions.concat(newContribs);
        if (!existing.aisle && incoming.aisle) existing.aisle = incoming.aisle;
        recomputeCombinedItem(existing);
        added += newContribs.length;
        return;
      }

      cart.push(incoming);
      added += 1;
    });

    saveCart(cart);
    return { added: added, skipped: selected.length - added };
  }

  function cartItemFromIngredient(ing, recipeMeta) {
    var qty = ing.quantity || '';
    var aisle = ing.aisle || '';
    return recomputeCombinedItem({
      id: ingredientKey(ing.name),
      name: ing.name,
      quantity: qty,
      aisle: aisle,
      recipe: recipeMeta.title,
      recipePath: recipeMeta.path,
      recipeId: recipeMeta.id || '',
      bought: false,
      addedAt: Date.now(),
      contributions: [
        {
          recipe: recipeMeta.title,
          recipePath: recipeMeta.path,
          recipeId: recipeMeta.id || '',
          quantity: qty
        }
      ]
    });
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

    loadManifest()
      .then(function (data) {
        var recipe = findRecipeInManifest(data);
        if (recipe && recipe.scaling) {
          enhanceRecipeScaling(found, recipe, toolbar);
        }
      })
      .catch(function () {
        /* manifest optional for grocery checkboxes */
      });
  }

  function findRecipeInManifest(manifest) {
    var path = decodeURIComponent(window.location.pathname || '');
    var recipes = (manifest && manifest.recipes) || [];
    var i;
    for (i = 0; i < recipes.length; i += 1) {
      var r = recipes[i];
      if (r.href) {
        var href = decodeURIComponent(r.href);
        if (path === href || path.endsWith(href) || href.endsWith(path)) return r;
      }
      if (r.cookPath) {
        var stem = r.cookPath.replace(/\.cook$/i, '');
        if (path.indexOf('/recipe/' + stem + '.html') !== -1) return r;
      }
    }
    return null;
  }

  function collectQtySpans(lists) {
    var spans = [];
    lists.forEach(function (ul) {
      ul.querySelectorAll(':scope > li').forEach(function (li) {
        var qtyEl = li.querySelector('span.text-orange-700, span[class*="text-orange"]');
        var nameEl = li.querySelector('span.font-medium');
        if (!qtyEl || qtyEl === nameEl) return;
        if (!qtyEl.getAttribute('data-base-qty')) {
          qtyEl.setAttribute('data-base-qty', qtyEl.textContent.replace(/\s+/g, ' ').trim());
        }
        spans.push(qtyEl);
      });
    });
    return spans;
  }

  function readServingsFromQuery(baseServings) {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('servings') || params.get('s');
      if (!raw) return null;
      var n = parseFloat(raw);
      if (!isFinite(n) || n <= 0) return null;
      return n;
    } catch (e) {
      return null;
    }
  }

  function writeServingsToQuery(servings) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('servings', String(servings));
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (e) {
      /* ignore */
    }
  }

  function updateServingsPill(servings) {
    var pill = document.querySelector('.metadata-servings');
    if (!pill) return;
    if (!pill.getAttribute('data-base-label')) {
      pill.setAttribute('data-base-label', pill.textContent.trim());
    }
    var label = Number(servings) === 1 ? '1 serving' : servings + ' servings';
    pill.textContent = '👥 ' + label;
  }

  function scaleCookingModeData(factor) {
    var el = document.getElementById('cooking-mode-data');
    if (!el) return;
    if (!el.getAttribute('data-base-json')) {
      el.setAttribute('data-base-json', el.textContent);
    }
    try {
      var data = JSON.parse(el.getAttribute('data-base-json'));
      data.scale = factor;
      (data.sections || []).forEach(function (section) {
        (section.ingredients || []).forEach(function (ing) {
          if (ing.quantity != null && ing.quantity !== '') {
            ing.quantity = scaleQuantityString(String(ing.quantity), factor);
          }
        });
        (section.steps || []).forEach(function (step) {
          (step.ingredients || []).forEach(function (ing) {
            if (ing.quantity != null && ing.quantity !== '') {
              ing.quantity = scaleQuantityString(String(ing.quantity), factor);
            }
          });
        });
      });
      el.textContent = JSON.stringify(data);
    } catch (e) {
      /* leave original */
    }
  }

  function enhanceRecipeScaling(found, recipe, groceryToolbar) {
    var baseServings = Number(recipe.servings) || 1;
    if (baseServings <= 0) baseServings = 1;

    var qtySpans = collectQtySpans(found.lists);
    var currentServings = readServingsFromQuery(baseServings) || baseServings;

    var scaleBar = document.createElement('div');
    scaleBar.className = 'recipe-scale-bar print:hidden';
    scaleBar.innerHTML =
      '<span class="recipe-scale-label">Servings</span>' +
      '<div class="recipe-scale-controls" role="group" aria-label="Adjust servings">' +
      '<button type="button" class="recipe-scale-btn" data-scale="dec" aria-label="Fewer servings">−</button>' +
      '<input type="number" class="recipe-scale-input" id="recipe-servings" min="1" step="1" inputmode="numeric" />' +
      '<button type="button" class="recipe-scale-btn" data-scale="inc" aria-label="More servings">+</button>' +
      '</div>' +
      '<span class="recipe-scale-base">Base: ' +
      baseServings +
      '</span>';

    // Place scale controls directly under the Ingredients heading, above grocery toolbar
    found.heading.insertAdjacentElement('afterend', scaleBar);

    var input = scaleBar.querySelector('.recipe-scale-input');
    input.value = String(currentServings);

    // Hidden CookCLI-compatible scale multiplier for keyboard shortcuts (when enabled)
    var hiddenScale = document.getElementById('scale');
    if (!hiddenScale) {
      hiddenScale = document.createElement('input');
      hiddenScale.type = 'hidden';
      hiddenScale.id = 'scale';
      hiddenScale.min = '0.25';
      hiddenScale.max = '20';
      hiddenScale.step = '0.25';
      document.body.appendChild(hiddenScale);
    }

    function applyServings(servings, opts) {
      opts = opts || {};
      servings = Math.round(Number(servings) * 100) / 100;
      if (!isFinite(servings) || servings <= 0) servings = baseServings;
      // Prefer whole servings for the stepper UX
      if (Math.abs(servings - Math.round(servings)) < 1e-9) {
        servings = Math.round(servings);
      }
      if (servings < 1) servings = 1;

      currentServings = servings;
      input.value = String(servings);

      var factor = servings / baseServings;
      hiddenScale.value = String(Math.round(factor * 1000) / 1000);

      qtySpans.forEach(function (span) {
        var base = span.getAttribute('data-base-qty') || '';
        span.textContent = scaleQuantityString(base, factor);
      });

      updateServingsPill(servings);
      scaleCookingModeData(factor);

      if (!opts.skipUrl) writeServingsToQuery(servings);
    }

    scaleBar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-scale]');
      if (!btn) return;
      var act = btn.getAttribute('data-scale');
      var next = currentServings + (act === 'inc' ? 1 : -1);
      applyServings(next);
    });

    input.addEventListener('change', function () {
      applyServings(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyServings(input.value);
        input.blur();
      }
    });

    hiddenScale.addEventListener('change', function () {
      var factor = parseFloat(hiddenScale.value);
      if (!isFinite(factor) || factor <= 0) return;
      applyServings(baseServings * factor);
    });

    applyServings(currentServings, { skipUrl: !readServingsFromQuery(baseServings) });
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

  function toBase64Url(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function fromBase64Url(encoded) {
    var b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(atob(b64)));
  }

  function normalizeSharedItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(function (item) {
        return item && item.id && item.name;
      })
      .map(function (item) {
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity || '',
          aisle: item.aisle || '',
          recipe: item.recipe || '',
          recipePath: item.recipePath || '',
          recipeId: item.recipeId || '',
          bought: !!item.bought,
          addedAt: item.addedAt || Date.now()
        };
      });
  }

  function encodeSharePayload(items) {
    return toBase64Url(JSON.stringify({ v: 1, items: normalizeSharedItems(items) }));
  }

  function buildShareLink(items) {
    var url = new URL(groceryUrl(), window.location.href);
    url.hash = 'l=' + encodeSharePayload(items);
    return url.toString();
  }

  function getSharePayloadFromUrl() {
    var hash = window.location.hash || '';
    if (hash.indexOf(SHARE_LIST_HASH_PREFIX) === 0) {
      return hash.slice(SHARE_LIST_HASH_PREFIX.length);
    }
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('list') || params.get('l') || '';
    } catch (e) {
      return '';
    }
  }

  function clearShareParamsFromUrl() {
    try {
      var url = new URL(window.location.href);
      url.hash = '';
      url.searchParams.delete('list');
      url.searchParams.delete('l');
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch (e) {
      /* ignore */
    }
  }

  function importSharedListFromUrl() {
    var encoded = getSharePayloadFromUrl();
    if (!encoded) return false;

    try {
      var parsed = JSON.parse(fromBase64Url(encoded));
      var items = normalizeSharedItems(parsed.items || parsed);
      if (!items.length) return false;
      saveCart(items);
      clearShareParamsFromUrl();
      return true;
    } catch (e) {
      return false;
    }
  }

  function shareListLink(items) {
    if (!items.length) {
      toast('Add items before sharing');
      return;
    }

    var link = buildShareLink(items);
    var text = formatPlainText(items);

    if (navigator.share) {
      navigator
        .share({
          title: 'Grocery list',
          text: text,
          url: link
        })
        .catch(function () {
          return copyText(link).then(function () {
            toast('Link copied');
          });
        });
      return;
    }

    copyText(link)
      .then(function () {
        toast('Link copied');
      })
      .catch(function () {
        toast('Could not copy link');
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

    var imported = importSharedListFromUrl();

    function draw() {
      var items = loadCart();
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
          ' · tap to check off while shopping · tap Share list to send a link';
      }
      root.appendChild(sub);

      var actions = document.createElement('div');
      actions.className = 'grocery-actions print:hidden';
      if (items.length) {
        actions.innerHTML =
          '<button type="button" class="grocery-primary" data-act="share">Share list</button>' +
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
        updateBadges();
        return;
      }

      var recipesOnList = {};
      items.forEach(function (item) {
        (item.contributions || []).forEach(function (c) {
          if (!c.recipe) return;
          recipesOnList[c.recipe] = (recipesOnList[c.recipe] || 0) + 1;
        });
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
            saveCart(removeRecipeFromCart(loadCart(), name));
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
          shareListLink(cart);
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

    draw();
    if (imported) {
      toast('Loaded shared grocery list');
    }
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
