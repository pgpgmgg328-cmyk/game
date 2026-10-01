// Поддельный SDK Яндекс Игр для автотестов: отдаётся вместо /sdk.js и записывает все вызовы.
// Сетевых запросов нет. Поведение задают параметры адреса:
//   sdklang, sdkdevice — язык и тип устройства;
//   sdkads=ok|error|closed — реклама показывается / ошибка / закрыта без награды;
//   sdkauth=1 — игрок уже вошёл; sdkauthdialog=cancel — окно входа закрывают;
//   sdkpay=none — покупки не подключены; sdkpurchase=cancel — окно оплаты закрывают;
//   sdkconsume=fail — консумирование не проходит;
//   sdkflags={"имя":"значение"} — флаги remote config;
//   sdkreview=<причина> — canReview отвечает «нельзя» с этой причиной;
//   sdkshortcut=0 — ярлык предложить нельзя.
// Облако, покупки, вход и таблица рекордов хранятся в localStorage страницы.
(function () {
  var params = new URLSearchParams(location.search);
  var calls = [];
  var listeners = {};
  var GUEST_CLOUD = 'fake-sdk-cloud';
  var ACCOUNT_CLOUD = 'fake-sdk-cloud-account';
  var AUTH_KEY = 'fake-sdk-auth';
  var PURCHASES_KEY = 'fake-sdk-purchases';
  var SCORES_KEY = 'fake-sdk-scores';
  var AD_OPEN_MS = 150;
  var AD_SHOW_MS = 450;
  // Иконка портальной валюты — картинка data:, чтобы не ходить в сеть.
  var CURRENCY_ICON =
    'data:image/svg+xml;base64,' +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<circle cx="32" cy="32" r="30" fill="#ffcc00" stroke="#b07d00" stroke-width="4"/>' +
        '<path d="M20 16 L32 32 L44 16 M32 32 V50 M22 34 H42 M22 42 H42" stroke="#7a5200" ' +
        'stroke-width="6" fill="none" stroke-linecap="round"/></svg>',
    );
  var CATALOG = [
    { id: 'no_ads', title: 'Без рекламы', price: '99 YAN', priceValue: '99' },
    { id: 'skins_pack', title: 'Набор украшений', price: '49 YAN', priceValue: '49' },
    { id: 'coins_1000', title: '1000 клацов', price: '29 YAN', priceValue: '29' },
  ];
  var RIVALS = [41000, 32500, 27000, 19800, 15300, 12100, 9800, 7600, 5100, 3300, 1200, 400];

  function record(name) {
    calls.push({ name: name, scene: document.body.dataset.scene || '', at: Date.now() });
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function emit(event) {
    (listeners[event] || []).slice().forEach(function (listener) {
      listener();
    });
  }

  function later(ms, action) {
    setTimeout(action, ms);
  }

  function isAuthorized() {
    return params.get('sdkauth') === '1' || localStorage.getItem(AUTH_KEY) === '1';
  }

  function cloudKey() {
    return isAuthorized() ? ACCOUNT_CLOUD : GUEST_CLOUD;
  }

  function createPlayer() {
    var authorized = isAuthorized();
    var key = cloudKey();
    return {
      getData: function () {
        record('getData');
        return Promise.resolve(readJson(key, {}));
      },
      setData: function (data, flush) {
        record('setData:' + String(flush));
        writeJson(key, data);
        return Promise.resolve();
      },
      isAuthorized: function () {
        return authorized;
      },
      getUniqueID: function () {
        return authorized ? 'me' : 'guest';
      },
    };
  }

  // Реклама: как настоящая платформа, на время показа присылает game_api_pause/resume.
  function showAd(kind, callbacks) {
    var mode = params.get('sdkads') || 'ok';
    record('adv.' + kind);
    if (mode === 'error') {
      later(AD_OPEN_MS, function () {
        if (callbacks.onError) callbacks.onError(new Error('fake: нет рекламы'));
        if (kind === 'fullscreen' && callbacks.onClose) callbacks.onClose(false);
      });
      return;
    }
    if (mode === 'closed' && kind === 'fullscreen') {
      later(AD_OPEN_MS, function () {
        if (callbacks.onClose) callbacks.onClose(false);
      });
      return;
    }
    later(AD_OPEN_MS, function () {
      emit('game_api_pause');
      if (callbacks.onOpen) callbacks.onOpen();
      if (kind === 'rewarded' && mode === 'ok') {
        later(AD_SHOW_MS - 100, function () {
          record('adv.rewarded:onRewarded');
          if (callbacks.onRewarded) callbacks.onRewarded();
        });
      }
      later(AD_SHOW_MS, function () {
        record('adv.' + kind + ':close');
        if (callbacks.onClose) callbacks.onClose(true);
        emit('game_api_resume');
      });
    });
  }

  var banner = { visible: false };

  var payments = {
    getCatalog: function () {
      record('payments.getCatalog');
      return Promise.resolve(
        CATALOG.map(function (item) {
          return {
            id: item.id,
            title: item.title,
            description: '',
            imageURI: '',
            price: item.price,
            priceValue: item.priceValue,
            priceCurrencyCode: 'YAN',
            getPriceCurrencyImage: function () {
              return CURRENCY_ICON;
            },
          };
        }),
      );
    },
    getPurchases: function () {
      record('payments.getPurchases');
      return Promise.resolve(readJson(PURCHASES_KEY, []));
    },
    purchase: function (options) {
      record('payments.purchase:' + options.id);
      if (params.get('sdkpurchase') === 'cancel') {
        return Promise.reject(new Error('fake: окно оплаты закрыто'));
      }
      emit('game_api_pause');
      var purchase = {
        productID: options.id,
        purchaseToken: 'token-' + options.id + '-' + Date.now(),
        developerPayload: '',
      };
      var list = readJson(PURCHASES_KEY, []);
      list.push(purchase);
      writeJson(PURCHASES_KEY, list);
      return new Promise(function (resolve) {
        later(AD_OPEN_MS, function () {
          emit('game_api_resume');
          resolve(purchase);
        });
      });
    },
    consumePurchase: function (token) {
      record('payments.consume:' + token.split('-')[1]);
      if (params.get('sdkconsume') === 'fail') return Promise.reject(new Error('fake: сеть'));
      writeJson(
        PURCHASES_KEY,
        readJson(PURCHASES_KEY, []).filter(function (item) {
          return item.purchaseToken !== token;
        }),
      );
      return Promise.resolve();
    },
  };

  function leaderboardEntries() {
    var scores = readJson(SCORES_KEY, {});
    var rows = RIVALS.map(function (score, index) {
      return { score: score, id: 'rival-' + index, name: 'Игрок ' + index };
    });
    if (typeof scores.me === 'number') rows.push({ score: scores.me, id: 'me', name: 'Я' });
    rows.sort(function (a, b) {
      return b.score - a.score;
    });
    return rows.map(function (row, index) {
      return {
        score: row.score,
        rank: index + 1,
        formattedScore: String(row.score),
        extraData: '',
        player: {
          uniqueID: row.id,
          publicName: row.name,
          lang: 'ru',
          scopePermissions: {},
          getAvatarSrc: function () {
            return '';
          },
          getAvatarSrcSet: function () {
            return '';
          },
        },
      };
    });
  }

  var sdk = {
    environment: { i18n: { lang: params.get('sdklang') || 'ru' } },
    deviceInfo: { type: params.get('sdkdevice') || 'desktop' },
    EVENTS: {
      ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED',
      ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED',
    },
    features: {
      LoadingAPI: {
        ready: function () {
          record('LoadingAPI.ready');
        },
      },
      GameplayAPI: {
        start: function () {
          record('GameplayAPI.start');
        },
        stop: function () {
          record('GameplayAPI.stop');
        },
      },
    },
    adv: {
      showFullscreenAdv: function (options) {
        showAd('fullscreen', (options && options.callbacks) || {});
      },
      showRewardedVideo: function (options) {
        showAd('rewarded', (options && options.callbacks) || {});
      },
      showBannerAdv: function () {
        record('adv.banner:show');
        banner.visible = true;
        return Promise.resolve({ stickyAdvIsShowing: true });
      },
      hideBannerAdv: function () {
        record('adv.banner:hide');
        banner.visible = false;
        return Promise.resolve({ stickyAdvIsShowing: false });
      },
      getBannerAdvStatus: function () {
        return Promise.resolve({ stickyAdvIsShowing: banner.visible });
      },
    },
    auth: {
      openAuthDialog: function () {
        record('auth.openAuthDialog');
        if (params.get('sdkauthdialog') === 'cancel') {
          return Promise.reject(new Error('fake: окно входа закрыто'));
        }
        var guest = readJson(GUEST_CLOUD, {});
        var account = readJson(ACCOUNT_CLOUD, {});
        localStorage.setItem(AUTH_KEY, '1');
        if (Object.keys(account).length === 0) {
          // У аккаунта прогресса нет: платформа переносит прогресс гостя.
          writeJson(ACCOUNT_CLOUD, guest);
          return Promise.resolve();
        }
        if (Object.keys(guest).length > 0) {
          // Прогресс есть и там и там: платформа спрашивает, какой оставить (оставляем аккаунт).
          later(50, function () {
            emit('ACCOUNT_SELECTION_DIALOG_OPENED');
            later(300, function () {
              emit('ACCOUNT_SELECTION_DIALOG_CLOSED');
            });
          });
        }
        return Promise.resolve();
      },
    },
    leaderboards: {
      setScore: function (name, score) {
        record('leaderboards.setScore:' + name + ':' + score);
        var scores = readJson(SCORES_KEY, {});
        scores.me = score;
        writeJson(SCORES_KEY, scores);
        return Promise.resolve();
      },
      getEntries: function (name, options) {
        record('leaderboards.getEntries:' + name);
        var all = leaderboardEntries();
        var top = all.slice(0, (options && options.quantityTop) || 5);
        var me = all.filter(function (entry) {
          return entry.player.uniqueID === 'me';
        })[0];
        var entries = top.slice();
        if (options && options.includeUser && me && top.indexOf(me) < 0) entries.push(me);
        return Promise.resolve({
          leaderboard: { name: name },
          ranges: [{ start: 0, size: top.length }],
          userRank: options && options.includeUser && me ? me.rank : 0,
          entries: entries,
        });
      },
    },
    feedback: {
      canReview: function () {
        record('feedback.canReview');
        var reason = params.get('sdkreview');
        return Promise.resolve(reason ? { value: false, reason: reason } : { value: true });
      },
      requestReview: function () {
        record('feedback.requestReview');
        return Promise.resolve({ feedbackSent: true });
      },
    },
    shortcut: {
      canShowPrompt: function () {
        record('shortcut.canShowPrompt');
        return Promise.resolve({ canShow: params.get('sdkshortcut') !== '0' });
      },
      showPrompt: function () {
        record('shortcut.showPrompt');
        return Promise.resolve({ outcome: 'accepted' });
      },
    },
    getFlags: function (options) {
      record('getFlags');
      var flags = {};
      var defaults = (options && options.defaultFlags) || {};
      Object.keys(defaults).forEach(function (key) {
        flags[key] = defaults[key];
      });
      var overrides = JSON.parse(params.get('sdkflags') || '{}');
      Object.keys(overrides).forEach(function (key) {
        flags[key] = overrides[key];
      });
      return Promise.resolve(flags);
    },
    isAvailableMethod: function (name) {
      record('isAvailableMethod:' + name);
      return Promise.resolve(name !== 'leaderboards.setScore' || isAuthorized());
    },
    getPayments: function () {
      record('getPayments');
      if (params.get('sdkpay') === 'none') {
        return Promise.reject(new Error('fake: покупки не подключены'));
      }
      return Promise.resolve(payments);
    },
    on: function (event, listener) {
      (listeners[event] = listeners[event] || []).push(listener);
      return function () {
        sdk.off(event, listener);
      };
    },
    off: function (event, listener) {
      listeners[event] = (listeners[event] || []).filter(function (item) {
        return item !== listener;
      });
    },
    getPlayer: function () {
      record('getPlayer');
      return Promise.resolve(createPlayer());
    },
  };

  window.YaGames = {
    init: function () {
      record('init');
      return Promise.resolve(sdk);
    },
  };

  window.__fakeSdk = {
    calls: calls,
    banner: banner,
    emit: emit,
  };
})();
