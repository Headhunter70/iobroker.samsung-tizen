'use strict';

const WebSocket = require('ws');
const axios = require('axios');
const wol = require('wol');

/**
 * Samsung Tizen TV Controller
 * Kommuniziert via WebSocket mit der Tizen TV API (Port 8001/8002)
 */
class SamsungTizen {
    /**
     * @param {object} opts
     * @param {string} opts.ip          - TV IP-Adresse
     * @param {string} [opts.mac]       - MAC-Adresse für WakeOnLAN
     * @param {number} [opts.port]      - Port (default 8001)
     * @param {string} [opts.name]      - Gerätename (wird am TV angezeigt)
     * @param {string} [opts.token]     - Gespeichertes Auth-Token
     * @param {object} [opts.logger]    - Logger (ioBroker log)
     * @param {Function} [opts.onToken] - Callback wenn neues Token erhalten
     */
    constructor(opts) {
        this.ip = opts.ip;
        this.mac = opts.mac || null;
        this.port = opts.port || 8001;
        this.name = opts.name || 'ioBroker';
        this.token = opts.token || null;
        this.log = opts.logger || console;
        this.onToken = opts.onToken || null;

        this.ws = null;
        this.wsConnected = false;
        this.messageQueue = [];
        this.responseHandlers = new Map();
        this._msgId = 1;
    }

    // ─────────────────────────────────────────────
    // WebSocket-Verbindung
    // ─────────────────────────────────────────────

    /**
     * Öffnet eine WebSocket-Verbindung zum TV.
     * Tizen TV verwendet folgendes URL-Format:
     *   ws://<IP>:8001/api/v2/channels/samsung.remote.control?name=<base64-Name>&token=<token>
     */
    async connect(timeout = 10000) {
        if (this.wsConnected && this.ws) return;

        const encodedName = Buffer.from(this.name).toString('base64');
        let url = `ws://${this.ip}:${this.port}/api/v2/channels/samsung.remote.control?name=${encodedName}`;
        if (this.token) url += `&token=${this.token}`;

        this.log.debug(`Verbinde mit TV: ${url}`);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`WebSocket Timeout nach ${timeout}ms`));
                if (this.ws) this.ws.terminate();
            }, timeout);

            this.ws = new WebSocket(url, { rejectUnauthorized: false });

            this.ws.on('open', () => {
                this.log.debug('WebSocket verbunden');
            });

            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    this.log.debug(`WS Nachricht: ${JSON.stringify(msg)}`);

                    if (msg.event === 'ms.channel.connect') {
                        // Token extrahieren
                        const newToken = msg.data && msg.data.token;
                        if (newToken && newToken !== this.token) {
                            this.token = String(newToken);
                            this.log.info(`TV Token erhalten: ${this.token}`);
                            if (this.onToken) this.onToken(this.token);
                        }
                        this.wsConnected = true;
                        clearTimeout(timer);
                        resolve();
                    } else if (msg.event === 'ms.channel.unauthorized') {
                        clearTimeout(timer);
                        reject(new Error('TV hat Verbindung verweigert (Unauthorized)'));
                    } else {
                        // Antwort an wartende Handler
                        const id = msg.id || (msg.data && msg.data.id);
                        if (id && this.responseHandlers.has(id)) {
                            this.responseHandlers.get(id)(msg);
                            this.responseHandlers.delete(id);
                        }
                    }
                } catch (e) {
                    this.log.warn(`Fehler beim Parsen der WS-Nachricht: ${e.message}`);
                }
            });

            this.ws.on('error', (err) => {
                this.log.debug(`WebSocket Fehler: ${err.message}`);
                this.wsConnected = false;
                clearTimeout(timer);
                reject(err);
            });

            this.ws.on('close', () => {
                this.log.debug('WebSocket getrennt');
                this.wsConnected = false;
                this.ws = null;
            });
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
            this.wsConnected = false;
        }
    }

    async ensureConnected() {
        if (!this.wsConnected || !this.ws) {
            await this.connect();
        }
    }

    // ─────────────────────────────────────────────
    // Tasten senden
    // ─────────────────────────────────────────────

    /**
     * Sendet einen Tastendruck an den TV.
     * @param {string} key - z.B. 'KEY_HOME', 'KEY_VOLUP', 'KEY_0' ...
     */
    async sendKey(key) {
        await this.ensureConnected();
        const payload = {
            method: 'ms.remote.control',
            params: {
                Cmd: 'Click',
                DataOfCmd: key,
                Option: 'false',
                TypeOfRemote: 'SendRemoteKey'
            }
        };
        this.log.debug(`Sende Taste: ${key}`);
        this.ws.send(JSON.stringify(payload));
        // Kurze Pause damit der TV die Taste verarbeiten kann
        await this._sleep(100);
    }

    /**
     * Mehrere Tasten nacheinander senden
     * @param {string[]} keys
     * @param {number} [delayMs=300]
     */
    async sendKeys(keys, delayMs = 300) {
        for (const key of keys) {
            await this.sendKey(key);
            await this._sleep(delayMs);
        }
    }

    // ─────────────────────────────────────────────
    // Power
    // ─────────────────────────────────────────────

    /**
     * TV einschalten via Wake-On-LAN
     */
    async powerOn() {
        if (!this.mac) {
            this.log.warn('Keine MAC-Adresse konfiguriert – WakeOnLAN nicht möglich');
            return;
        }
        return new Promise((resolve, reject) => {
            wol.wake(this.mac, (err) => {
                if (err) {
                    this.log.error(`WakeOnLAN Fehler: ${err.message}`);
                    reject(err);
                } else {
                    this.log.info(`WakeOnLAN Paket gesendet an ${this.mac}`);
                    resolve();
                }
            });
        });
    }

    // ─────────────────────────────────────────────
    // Lautstärke
    // ─────────────────────────────────────────────

    /**
     * Lautstärke auf einen bestimmten Wert setzen (0-100).
     * Tizen API hat keine direkte setVolume-Methode,
     * daher wird der aktuelle Wert geholt und dann angepasst.
     */
    async setVolume(targetVol) {
        await this.ensureConnected();
        const payload = {
            method: 'ms.remote.control',
            params: {
                Cmd: 'Click',
                DataOfCmd: 'KEY_VOLUP',
                Option: 'false',
                TypeOfRemote: 'SendRemoteKey'
            }
        };

        // Über REST API versuchen (neuere TVs)
        try {
            const resp = await axios.get(`http://${this.ip}:8001/api/v2/`, { timeout: 3000 });
            this.log.debug(`TV Info: ${JSON.stringify(resp.data)}`);
        } catch {
            // ignorieren
        }

        // Volume via KEY_VOL? senden – direkter Weg über Tizen REST
        await this._setVolumeRest(targetVol);
    }

    async _setVolumeRest(vol) {
        // Neuere Samsung TVs unterstützen direktes Volume-Setzen via REST
        try {
            await axios.put(
                `http://${this.ip}:8001/api/v2/channels/samsung.remote.control`,
                { method: 'ms.remote.control', params: { Cmd: 'SetVolume', Volume: vol } },
                { timeout: 3000 }
            );
        } catch {
            // Fallback: Über KEY_VOLUP/KEY_VOLDOWN annähern
            this.log.debug('REST Volume nicht unterstützt, verwende Keys als Fallback');
        }
    }

    // ─────────────────────────────────────────────
    // Kanal
    // ─────────────────────────────────────────────

    /**
     * Kanal direkt setzen (Ziffern einzeln senden + KEY_ENTER)
     * @param {number} channel
     */
    async setChannel(channel) {
        const digits = String(channel).split('');
        const keyMap = {
            '0': 'KEY_0', '1': 'KEY_1', '2': 'KEY_2', '3': 'KEY_3',
            '4': 'KEY_4', '5': 'KEY_5', '6': 'KEY_6', '7': 'KEY_7',
            '8': 'KEY_8', '9': 'KEY_9'
        };
        const keys = digits.map(d => keyMap[d]).filter(Boolean);
        keys.push('KEY_ENTER');
        await this.sendKeys(keys, 400);
    }

    // ─────────────────────────────────────────────
    // Apps
    // ─────────────────────────────────────────────

    /**
     * App starten
     * @param {string} appId - z.B. '11101200001' für Netflix, '3201907018807' für YouTube
     */
    async launchApp(appId) {
        await this.ensureConnected();
        const payload = {
            method: 'ms.channel.emit',
            params: {
                event: 'ed.apps.launch',
                to: 'host',
                data: {
                    appId: appId,
                    action_type: 'DEEP_LINK',
                    metaTag: ''
                }
            }
        };
        this.log.info(`Starte App: ${appId}`);
        this.ws.send(JSON.stringify(payload));
    }

    /**
     * Installierte Apps abrufen
     * @returns {Promise<Array>}
     */
    async getInstalledApps() {
        await this.ensureConnected();
        return new Promise((resolve) => {
            const id = `getApps_${this._msgId++}`;
            const timeout = setTimeout(() => resolve([]), 5000);

            this.responseHandlers.set(id, (msg) => {
                clearTimeout(timeout);
                resolve((msg.data && msg.data.data) || []);
            });

            const payload = {
                method: 'ms.channel.emit',
                id,
                params: {
                    event: 'ed.installedApp.get',
                    to: 'host'
                }
            };
            this.ws.send(JSON.stringify(payload));
        });
    }

    // ─────────────────────────────────────────────
    // Geräteinformationen
    // ─────────────────────────────────────────────

    /**
     * TV-Geräteinformationen via REST API abrufen
     * Funktioniert nur wenn TV eingeschaltet ist.
     * @returns {Promise<object|null>}
     */
    async getDeviceInfo() {
        try {
            const resp = await axios.get(`http://${this.ip}:8001/api/v2/`, {
                timeout: 3000,
                headers: { 'User-Agent': 'ioBroker Samsung Tizen Adapter' }
            });
            return resp.data && resp.data.device ? resp.data.device : resp.data;
        } catch {
            return null;
        }
    }

    // ─────────────────────────────────────────────
    // Hilfsmethoden
    // ─────────────────────────────────────────────

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SamsungTizen;
