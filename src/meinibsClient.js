'use strict';

// Reverse-engineered aus dem öffentlichen Angular-Bundle von meinibs.de (main.*.js).
// Undokumentierte private API - Feldnamen in den JSON-Antworten sind teilweise
// Vermutung. Rohdaten werden deshalb überall zusätzlich mitgespeichert
// (siehe sync.js), damit nichts verloren geht falls die Extraktion daneben liegt.

class MeinibsClient {
  constructor({ baseUrl, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.token = null;
  }

  async login(username, password) {
    const body = `login=${encodeURIComponent(username)}&pwd=${encodeURIComponent(password)}`;
    const res = await this.fetch(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Login fehlgeschlagen: HTTP ${res.status} ${await safeText(res)}`);
    }
    const session = await res.json();
    if (!session || !session.token) {
      throw new Error('Login-Antwort enthielt kein token-Feld - API-Format hat sich evtl. geändert.');
    }
    this.token = session.token;
    this.session = session;
    return session;
  }

  async _get(path) {
    if (!this.token) throw new Error('Nicht eingeloggt - login() zuerst aufrufen.');
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`GET ${path} fehlgeschlagen: HTTP ${res.status} ${await safeText(res)}`);
    }
    return res.json();
  }

  /**
   * Bestellhistorie für eine ISO-Kalenderwoche.
   * Antwortformat (best effort, siehe Rohdaten-Fallback): { order: [...] }
   */
  async getOrderHistory(isoYear, isoWeek) {
    return this._get(`/orderhistory/${isoYear}/${isoWeek}/10`);
  }

  /**
   * Menü-Slots (gewählt + Alternative(n)) für eine ISO-Kalenderwoche - live über
   * Browser-DevTools bestätigt. Antwort: { orderPlaceholder: [...], prepaidSaldo }.
   * Jedes Item hat u.a. orderPlaced (bool: dieses Menü gewählt?) und
   * disableOrdering (bool: kann die Wahl noch geändert werden?).
   */
  async getOrderPlaceholders(isoYear, isoWeek) {
    return this._get(`/order_placeholders/${isoYear}/${isoWeek}/1`);
  }

  /** Detail-Ansicht eines Tages für eine bestimmte Menülinie. */
  async getMenuDetails(dateYYYYMMDD, menuLine) {
    return this._get(`/menu_details/${dateYYYYMMDD}/${menuLine}`);
  }

  /** Links/Übersicht der verfügbaren Speisepläne. */
  async getMenuplanLinks(n, e) {
    return this._get(`/menuplanlinks/${n}/${e}/8`);
  }

  /** Prepaid-Guthaben/Kontostand. */
  async getPrepaidStatus() {
    return this._get('/prepaid/status');
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

module.exports = { MeinibsClient };
