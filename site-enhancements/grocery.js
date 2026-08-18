/**
 * Mobile grocery list for CookCLI static recipe pages.
 * Check ingredients on a recipe → Export to grocery → shop from /grocery.html
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cookbook-grocery-v1';

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

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

  function ensureNavLink() {
    if (document.querySelector('a.grocery-nav-link')) {
      updateBadges();
      return;
    }

    var href = groceryUrl();
    var isGroceryPage = window.location.pathname.indexOf('/grocery') !== -1;

    var desktopRow = document.querySelector('nav a.nav-pill');
    if (desktopRow && desktopRow.parentElement) {
      var a = document.createElement('a');
      a.href = href;
      a.className = 'nav-pill grocery-nav-link';
      if (isGroceryPage) a.classList.add('active');
      a.innerHTML = 'Grocery <span class="grocery-badge" aria-hidden="true">0</span>';
      desktopRow.parentElement.appendChild(a);
    }

    var mobileRecipes = document.querySelector('#more-dropdown a[href*="index.html"]');
    if (mobileRecipes && mobileRecipes.parentElement) {
      var m = document.createElement('a');
      m.href = href;
      m.className =
        'grocery-nav-link flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-semibold';
      m.innerHTML = 'Grocery <span class="grocery-badge" aria-hidden="true">0</span>';
      mobileRecipes.insertAdjacentElement('afterend', m);
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
      // Keep lists that appear before the Cookware heading
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

  function enhanceRecipePage() {
    var found = findIngredientLists();
    if (!found.heading || !found.lists.length) return;

    var hint = document.createElement('p');
    hint.className = 'grocery-hint print:hidden';
    hint.textContent = 'Uncheck what you already have, then export the rest to your grocery list.';

    var toolbar = document.createElement('div');
    toolbar.className = 'grocery-toolbar print:hidden';
    toolbar.innerHTML =
      '<button type="button" data-grocery-action="all">Select all</button>' +
      '<button type="button" data-grocery-action="none">Select none</button>' +
      '<button type="button" class="grocery-primary" data-grocery-action="export">Export to grocery</button>';

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
        exportChecked();
      }
    });
  }

  function exportChecked() {
    var title = recipeTitle();
    var key = recipeKey();
    var selected = [];

    document.querySelectorAll('.grocery-ingredient-li').forEach(function (li) {
      var cb = li.querySelector('.grocery-check');
      if (!cb || !cb.checked) return;
      var parsed = parseIngredientLi(li);
      if (!parsed) return;
      selected.push({
        id: key + '::' + parsed.name + '::' + parsed.quantity,
        name: parsed.name,
        quantity: parsed.quantity,
        recipe: title,
        recipePath: key,
        bought: false,
        addedAt: Date.now()
      });
    });

    if (!selected.length) {
      toast('Check at least one ingredient first');
      return;
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

    if (added === 0) {
      toast('Those items are already on your grocery list');
    } else {
      toast('Added ' + added + ' item' + (added === 1 ? '' : 's') + ' · open Grocery');
    }
  }

  function formatPlainText(items) {
    if (!items.length) return 'Grocery list is empty.';
    var lines = ['Grocery list', ''];
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
    return lines.join('\n').trim() + '\n';
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
          /* user cancelled — fall through to copy */
          return copyText(text).then(function () {
            toast('Copied grocery list');
          });
        });
      return;
    }
    copyText(text).then(function () {
      toast('Copied grocery list');
    }).catch(function () {
      toast('Could not copy — try selecting the list');
    });
  }

  function renderGroceryPage() {
    var root = document.getElementById('grocery-root');
    if (!root) return;

    function draw() {
      var items = loadCart();
      root.innerHTML = '';

      var title = document.createElement('h1');
      title.textContent = 'Grocery';
      root.appendChild(title);

      var sub = document.createElement('p');
      sub.className = 'grocery-sub';
      sub.textContent =
        items.length === 0
          ? 'Nothing here yet. Open a recipe, uncheck pantry staples, and tap Export to grocery.'
          : items.length + ' item' + (items.length === 1 ? '' : 's') + ' · tap to check off while shopping';
      root.appendChild(sub);

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
        (basePath() || '') +
        '/index.html" class="grocery-nav-link" style="align-self:center;font-weight:600;color:#ea580c;text-decoration:underline;">← Recipes</a>';
      root.appendChild(actions);

      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'grocery-empty';
        empty.textContent = 'Your grocery list is empty.';
        root.appendChild(empty);
        updateBadges();
        return;
      }

      var ul = document.createElement('ul');
      ul.className = 'grocery-list';
      items.forEach(function (item, index) {
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
      root.appendChild(ul);

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

    draw();
  }

  function init() {
    ensureNavLink();
    if (document.getElementById('grocery-root')) {
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
