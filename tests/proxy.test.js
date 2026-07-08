'use strict';
// WebSocket proxy + toggle behavior against stubbed window/document globals.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Minimal fake for the native WebSocket the proxy wraps.
class FakeWebSocket {
    constructor(url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.sent = [];
        this.closed = null;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this.readyState = FakeWebSocket.OPEN;
        this.bufferedAmount = 0;
        this.extensions = '';
        this.protocol = '';
        this.binaryType = 'blob';
    }
    send(data) { this.sent.push(data); }
    close(code, reason) { this.closed = { code, reason }; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
    emit(data) { if (this.onmessage) this.onmessage({ data, origin: '', lastEventId: '', source: null, ports: [] }); }
    static get CONNECTING() { return 0; }
    static get OPEN() { return 1; }
    static get CLOSING() { return 2; }
    static get CLOSED() { return 3; }
}

function freshPlugin() {
    global.window = { WebSocket: FakeWebSocket, highway: null };
    global.document = { getElementById: () => null };
    global.MessageEvent = class MessageEvent {
        constructor(type, init) { Object.assign(this, { type }, init); }
    };
    const file = path.join(__dirname, '..', 'screen.js');
    delete require.cache[require.resolve(file)];
    const plugin = require(file);
    return plugin;
}

function connectHighway(plugin) {
    plugin.createWebSocketProxy();
    const ws = new window.WebSocket('ws://localhost/ws/highway/1');
    const received = [];
    ws.onmessage = (ev) => received.push(ev.data);
    return { ws, inner: ws._ws, received };
}

test('proxy installs once and flags the window', () => {
    const plugin = freshPlugin();
    plugin.createWebSocketProxy();
    const Patched = window.WebSocket;
    assert.notEqual(Patched, FakeWebSocket);
    assert.equal(window.__transposeChordsSocketPatched, true);
    plugin.createWebSocketProxy();
    assert.equal(window.WebSocket, Patched); // no double wrap
});

test('song_info tuning sets semitone shift', () => {
    const plugin = freshPlugin();
    const { inner } = connectHighway(plugin);
    inner.emit(JSON.stringify({ type: 'song_info', tuning: [-2, -2, -2, -2, -2, -2] }));
    assert.equal(plugin._getState().semitones, 2);
});

test('chord_templates are rewritten only when active and shifted', () => {
    const plugin = freshPlugin();
    const { inner, received } = connectHighway(plugin);
    inner.emit(JSON.stringify({ type: 'song_info', tuning: [-2, -2, -2, -2, -2, -2] }));

    // Inactive: payload passes through untouched.
    const payload = JSON.stringify({ type: 'chord_templates', data: [{ id: 1, name: 'Am' }] });
    inner.emit(payload);
    assert.equal(received.at(-1), payload);

    plugin.toggle(); // activate
    inner.emit(payload);
    const msg = JSON.parse(received.at(-1));
    assert.equal(msg.data[0].name, 'Bm');
    // Original name is remembered for revert.
    assert.equal(plugin._getState().originalChordNames.get(1), 'Am');
});

test('zero shift leaves chord_templates untouched even when active', () => {
    const plugin = freshPlugin();
    const { inner, received } = connectHighway(plugin);
    inner.emit(JSON.stringify({ type: 'song_info', tuning: [0, 0, 0, 0, 0, 0] }));
    plugin.toggle();
    const payload = JSON.stringify({ type: 'chord_templates', data: [{ id: 1, name: 'Am' }] });
    inner.emit(payload);
    assert.equal(received.at(-1), payload);
});

test('non-highway sockets are passed through untouched', () => {
    const plugin = freshPlugin();
    plugin.createWebSocketProxy();
    const ws = new window.WebSocket('ws://localhost/ws/other');
    const received = [];
    ws.onmessage = (ev) => received.push(ev.data);
    ws._ws.emit(JSON.stringify({ type: 'song_info', tuning: [-3, -3, -3, -3] }));
    assert.equal(plugin._getState().semitones, 0); // not parsed for tuning
    assert.equal(received.length, 1);
});

test('malformed highway JSON does not break message delivery', () => {
    const plugin = freshPlugin();
    const { inner, received } = connectHighway(plugin);
    const origError = console.error;
    console.error = () => {};
    try {
        inner.emit('not-json{');
    } finally {
        console.error = origError;
    }
    assert.deepEqual(received, ['not-json{']);
});

test('proxy forwards send/close and readyState to the native socket', () => {
    const plugin = freshPlugin();
    const { ws, inner } = connectHighway(plugin);
    ws.send('ping');
    assert.deepEqual(inner.sent, ['ping']);
    ws.close(1000, 'done');
    assert.deepEqual(inner.closed, { code: 1000, reason: 'done' });
    assert.equal(ws.readyState, FakeWebSocket.OPEN);
    assert.equal(window.WebSocket.OPEN, 1);
});

test('toggle applies shift to a loaded song and revert restores names', () => {
    const plugin = freshPlugin();
    const { inner } = connectHighway(plugin);
    inner.emit(JSON.stringify({ type: 'song_info', tuning: [-1, -1, -1, -1, -1, -1] }));

    window.highway = { chordTemplates: [{ id: 7, name: 'F#m' }, { id: 8, name: 'A' }] };
    plugin.toggle(); // on: apply to current song
    assert.deepEqual(window.highway.chordTemplates.map(t => t.name), ['Gm', 'A#']);

    plugin.toggle(); // off: revert
    assert.deepEqual(window.highway.chordTemplates.map(t => t.name), ['F#m', 'A']);
    assert.equal(plugin._getState().originalChordNames.size, 0);
});
