/* ============================================================
   Ideology — date vocabulary

   Months are 'YYYY-MM', days 'YYYY-MM-DD'. Both sortable as
   plain strings, which is why the feed can order itself without
   parsing anything.

   This lives on its own because two separate pages need it: the
   studio app and the client link. The client page must not load
   the editing code, so the only alternative was a second copy of
   this arithmetic — and two copies of a date routine drift.
   ============================================================ */

window.IDE = window.IDE || {};

(function (A) {
  'use strict';

  var MONTH_NAMES = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                     'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  A.MONTH_NAMES = MONTH_NAMES;
  A.DAY_NAMES = DAY_NAMES;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  A.pad = pad;

  A.monthKeyOf = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  A.todayKey = function () {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  A.thisMonth = function () { return A.monthKeyOf(new Date()); };

  A.monthLabel = function (mk) {
    if (!mk) return '—';
    var p = String(mk).split('-');
    return MONTH_NAMES[(parseInt(p[1], 10) || 1) - 1] + ' ' + p[0];
  };
  A.monthShort = function (mk) { return A.monthLabel(mk).slice(0, 3); };

  A.shiftMonth = function (mk, delta) {
    var p = String(mk).split('-'), y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1 + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  };

  A.dayLabel = function (iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return parseInt(p[2], 10) + ' ' + MONTH_NAMES[(parseInt(p[1], 10) || 1) - 1].slice(0, 3).toLowerCase();
  };

  /* "14 ottobre 2026" — the long form, for the client link where
     there is room and no ambiguity is worth risking. */
  A.dayLong = function (iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return parseInt(p[2], 10) + ' ' +
      MONTH_NAMES[(parseInt(p[1], 10) || 1) - 1].toLowerCase() + ' ' + p[0];
  };

  A.monthOfDay = function (iso) { return String(iso || '').slice(0, 7); };
})(window.IDE);
