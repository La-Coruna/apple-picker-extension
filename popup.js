(function () {
  'use strict';

  var STRATEGY_KEY = 'applePickerStrategy';
  var DEFAULT_STRATEGY = [];

  function t(key) {
    if (!chrome || !chrome.i18n || !chrome.i18n.getMessage) return '';
    return chrome.i18n.getMessage(key) || '';
  }

  function applyI18n() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      var msg = t(key);
      if (msg) nodes[i].textContent = msg;
    }
  }

  function setStatus(msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  }

  function selectValue(values) {
    var inputs = document.querySelectorAll('input[name="strategy"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = values.indexOf(inputs[i].value) >= 0;
    }
  }

  function init() {
    applyI18n();
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      setStatus(t('storageUnavailable') || 'Storage not available.');
      return;
    }

    chrome.storage.local.get({ applePickerStrategy: DEFAULT_STRATEGY }, function (data) {
      var value = data.applePickerStrategy || DEFAULT_STRATEGY;
      if (!Array.isArray(value)) value = [value];
      selectValue(value);
      setStatus('');
    });

    var form = document.getElementById('strategy-form');
    form.addEventListener('change', function (event) {
      if (!event.target || event.target.name !== 'strategy') return;
      var inputs = document.querySelectorAll('input[name="strategy"]');
      var chosen = [];
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].checked) chosen.push(inputs[i].value);
      }
      chrome.storage.local.set({ applePickerStrategy: chosen });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
