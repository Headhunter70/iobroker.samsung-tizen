'use strict';

const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const tls = require('tls');

class SamsungTV {
    constructor(options) {
        this.host = options.host;
        this.port = options.port || 8002;
        this.name = Buffer.from(options.name || 'ioBroker').toString('base64');
        this.token = options.token || '';
        this.log = options.log || console;
        this.onToken = options.onToken || (() => {});
        this.onConnected = options.onConnected || (() => {});
        this.onDisconnected = options.onDisconnected || (() => {});
        this.onError = options.onError || (() => {});

        this.ws = null;
        this.connected = false;
        this.commandQueue = [];
        this.processing = false;
    }

    getWSUrl() {
        const token = this.token ? `&token=${this.token}` : '';
        return `wss://${this.host}:${this.port}/api/v2/channels/samsung.remote.control?name=${this.name}${token}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const url = this.getWSUrl();
            this.log.debug(`Verbinde mit: ${url}`);

            this.ws = new WebSocket(url, {
                rejectUnauthorized: false,
                handshakeTimeout: 10000
            });

            const timeout = setTimeout(() => {
                if (!this.connected) {
                    this.ws.terminate();
                    reject(new Error('Verbindungs-Timeout'));
                }
            }, 12000);

            this.ws.on('open', () => {
                this.log.debug('WebSocket geöffnet');
            });

            this.ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    this.log.debug(`Nachricht empfangen: ${JSON.stringify(msg)}`);

                    if (msg.event === 'ms.channel.connect') {
                        clearTimeout(timeout);
                        this.connected = true;

                        // Token speichern falls vorhanden
                        if (msg.data && msg.data.token) {
                            this.token = msg.data.token;
                            this.onToken(msg.data.token);
                        }

                        this.onConnected();
                        resolve();
                    } else if (msg.event === 'ms.channel.unauthorized') {
                        clearTimeout(timeout);
                        reject(new Error('TV hat die Verbindung abgelehnt - bitte am TV bestätigen'));
                    }
                } catch (e) {
                    this.log.warn(`Fehler beim Parsen der Nachricht: ${e.message}`);
                }
            });

            this.ws.on('error', (err) => {
                this.log.warn(`WebSocket Fehler: ${err.message}`);
                this.onError(err);
                if (!this.connected) {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            this.ws.on('close', () => {
                this.connected = false;
                this.onDisconnected();
            });
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        this.connected = false;
    }

    sendKey(key) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.ws) {
                return reject(new Error('Nicht verbunden'));
            }

            const cmd = JSON.stringify({
                method: 'ms.remote.control',
                params: {
                    Cmd: 'Click',
                    DataOfCmd: key,
                    Option: 'false',
                    TypeOfRemote: 'SendRemoteKey'
                }
            });

            this.log.debug(`Sende Taste: ${key}`);
            this.ws.send(cmd, (err) => {
                if (err) {
                    this.log.error(`Fehler beim Senden von ${key}: ${err.message}`);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    launchApp(appId) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.ws) {
                return reject(new Error('Nicht verbunden'));
            }

            const cmd = JSON.stringify({
                method: 'ms.channel.emit',
                params: {
                    event: 'ed.apps.launch',
                    to: 'host',
                    data: {
                        appId: appId,
                        action_type: 'DEEP_LINK'
                    }
                }
            });

            this.log.debug(`Starte App: ${appId}`);
            this.ws.send(cmd, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    openURL(url) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.ws) {
                return reject(new Error('Nicht verbunden'));
            }

            const cmd = JSON.stringify({
                method: 'ms.channel.emit',
                params: {
                    event: 'ed.apps.launch',
                    to: 'host',
                    data: {
                        appId: 'org.tizen.browser',
                        action_type: 'DEEP_LINK',
                        metaTag: url
                    }
                }
            });

            this.ws.send(cmd, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    getDeviceInfo() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.host,
                port: 8001,
                path: '/api/v2/',
                method: 'GET',
                timeout: 5000,
                rejectUnauthorized: false
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout beim Abrufen der Geräteinformationen'));
            });
            req.end();
        });
    }
}

// Bekannte App-IDs für Samsung Tizen TVs
SamsungTV.APPS = {
    NETFLIX: '11101200001',
    YOUTUBE: '111299001912',
    AMAZON_PRIME: '3201910019365',
    DISNEY_PLUS: '3201901017640',
    SPOTIFY: '3201606009684',
    PLEX: '3201512006963',
    TWITCH: '3201504001965',
    BROWSER: 'org.tizen.browser',
    HDMI1: 'KEY_HDMI1',
    HDMI2: 'KEY_HDMI2',
    HDMI3: 'KEY_HDMI3',
};

module.exports = SamsungTV;
