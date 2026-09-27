// Поддельный SDK Яндекс Игр для автотестов: отдаётся вместо /sdk.js и записывает все вызовы.
// Язык — параметр ?sdklang=, тип устройства — ?sdkdevice=. Облако хранится в localStorage страницы.
(function () {
  var params = new URLSearchParams(location.search);
  var calls = [];
  var listeners = { game_api_pause: [], game_api_resume: [] };
  var CLOUD_KEY = 'fake-sdk-cloud';

  function record(name) {
    calls.push({ name: name, scene: document.body.dataset.scene || '', at: Date.now() });
  }

  function readCloud() {
    try {
      return JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  var player = {
    getData: function () {
      record('getData');
      return Promise.resolve(readCloud());
    },
    setData: function (data, flush) {
      record('setData:' + String(flush));
      localStorage.setItem(CLOUD_KEY, JSON.stringify(data));
      return Promise.resolve();
    },
    isAuthorized: function () {
      return false;
    },
  };

  var sdk = {
    environment: { i18n: { lang: params.get('sdklang') || 'ru' } },
    deviceInfo: { type: params.get('sdkdevice') || 'desktop' },
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
      return Promise.resolve(player);
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
    emit: function (event) {
      (listeners[event] || []).slice().forEach(function (listener) {
        listener();
      });
    },
  };
})();
