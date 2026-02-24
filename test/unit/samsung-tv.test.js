'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const SamsungTV = require('../../lib/samsung-tv');

describe('SamsungTV Library', () => {
    let tv;
    let mockLog;

    beforeEach(() => {
        mockLog = {
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        };

        tv = new SamsungTV({
            host: '192.168.1.100',
            port: 8002,
            name: 'ioBroker-Test',
            token: 'testtoken',
            log: mockLog
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Constructor', () => {
        it('sollte korrekt initialisiert werden', () => {
            expect(tv.host).to.equal('192.168.1.100');
            expect(tv.port).to.equal(8002);
            expect(tv.token).to.equal('testtoken');
            expect(tv.connected).to.be.false;
        });

        it('sollte Standard-Port 8002 verwenden wenn nicht angegeben', () => {
            const tv2 = new SamsungTV({ host: '192.168.1.1', log: mockLog });
            expect(tv2.port).to.equal(8002);
        });
    });

    describe('getWSUrl', () => {
        it('sollte korrekte URL mit Token generieren', () => {
            const url = tv.getWSUrl();
            expect(url).to.include('wss://192.168.1.100:8002');
            expect(url).to.include('token=testtoken');
        });

        it('sollte URL ohne Token generieren wenn kein Token gesetzt', () => {
            tv.token = '';
            const url = tv.getWSUrl();
            expect(url).to.not.include('token=');
        });
    });

    describe('sendKey', () => {
        it('sollte Fehler werfen wenn nicht verbunden', async () => {
            tv.connected = false;
            try {
                await tv.sendKey('KEY_UP');
                expect.fail('Sollte Fehler werfen');
            } catch (e) {
                expect(e.message).to.include('Nicht verbunden');
            }
        });

        it('sollte Taste über WebSocket senden', (done) => {
            tv.connected = true;
            tv.ws = {
                send: (data, cb) => {
                    const parsed = JSON.parse(data);
                    expect(parsed.method).to.equal('ms.remote.control');
                    expect(parsed.params.DataOfCmd).to.equal('KEY_UP');
                    cb(null);
                    done();
                }
            };
            tv.sendKey('KEY_UP');
        });
    });

    describe('APPS', () => {
        it('sollte bekannte App-IDs enthalten', () => {
            expect(SamsungTV.APPS).to.have.property('NETFLIX');
            expect(SamsungTV.APPS).to.have.property('YOUTUBE');
            expect(SamsungTV.APPS).to.have.property('AMAZON_PRIME');
        });
    });
});
