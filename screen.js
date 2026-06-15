(function() {
    'use strict';

    let active = false;
    let semitones = 0;
    let originalChordNames = new Map(); // id -> original name

    const STANDARD_MIDI_6 = [40, 45, 50, 55, 59, 64];
    const STANDARD_MIDI_4 = [28, 33, 38, 43];

    function transposeChord(chord, semitones) {
        if (!chord || semitones === 0) return chord;
        const notesSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const notesFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const match = chord.match(/^([A-G][#b]?)(.*)$/);
        if (!match) return chord;
        let root = match[1];
        const suffix = match[2] || '';
        const isFlat = root.includes('b');
        const normalizedRoot = root === 'Bb' ? 'A#' : root === 'Db' ? 'C#' : root === 'Eb' ? 'D#' : root === 'Gb' ? 'F#' : root === 'Ab' ? 'G#' : root;
        const index = notesSharp.indexOf(normalizedRoot);
        if (index === -1) return chord;
        const newIndex = (index + semitones + 12) % 12;
        const newRoot = isFlat ? notesFlat[newIndex] : notesSharp[newIndex];
        return newRoot + suffix;
    }

    function computeSemitonesFromTuning(tuning) {
        if (!Array.isArray(tuning) || tuning.length === 0) return 0;
        if (!tuning.every(val => val === tuning[0])) return 0;
        // Tuning is offsets in semitones from E standard, low-string-first
        const lowStringIndex = 0;
        return -tuning[lowStringIndex];
    }

    function createWebSocketProxy() {
        if (window.__transposeChordsSocketPatched) return;

        const NativeWebSocket = window.WebSocket;

        class TransposeWebSocket {
            constructor(url, protocols) {
                this._url = url;
                this._ws = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
                this._onopen = null;
                this._onclose = null;
                this._onerror = null;
                this._onmessage = null;

                this._ws.onopen = (ev) => { if (this._onopen) this._onopen(ev); };
                this._ws.onclose = (ev) => { if (this._onclose) this._onclose(ev); };
                this._ws.onerror = (ev) => { if (this._onerror) this._onerror(ev); };
                this._ws.onmessage = (ev) => {
                    let event = ev;
                    if (this._url && this._url.includes('/ws/highway/')) {
                        try {
                            const msg = JSON.parse(ev.data);
                            if (msg.type === 'song_info') {
                                semitones = computeSemitonesFromTuning(msg.tuning);
                                console.log(`[Transpose Chords] Detected tuning offsets -> semitones=${semitones}`);
                            }
                            if (active && msg.type === 'chord_templates' && semitones !== 0) {
                                for (const tmpl of msg.data || []) {
                                    if (tmpl && tmpl.name) {
                                        const original = tmpl.name;
                                        originalChordNames.set(tmpl.id, original);
                                        tmpl.name = transposeChord(tmpl.name, semitones);
                                        console.log(`[Transpose Chords] Transposed: ${original} -> ${tmpl.name}`);
                                    }
                                }
                                event = new MessageEvent('message', {
                                    data: JSON.stringify(msg),
                                    origin: ev.origin,
                                    lastEventId: ev.lastEventId,
                                    source: ev.source,
                                    ports: ev.ports,
                                });
                            }
                        } catch (e) {
                            console.error('[Transpose Chords] failed to parse highway message', e);
                        }
                    }
                    if (this._onmessage) this._onmessage(event);
                };
            }

            send(data) { return this._ws.send(data); }
            close(code, reason) { return this._ws.close(code, reason); }
            addEventListener(type, listener, options) { return this._ws.addEventListener(type, listener, options); }
            removeEventListener(type, listener, options) { return this._ws.removeEventListener(type, listener, options); }
            dispatchEvent(event) { return this._ws.dispatchEvent(event); }

            get readyState() { return this._ws.readyState; }
            get bufferedAmount() { return this._ws.bufferedAmount; }
            get extensions() { return this._ws.extensions; }
            get protocol() { return this._ws.protocol; }
            get url() { return this._ws.url; }
            get binaryType() { return this._ws.binaryType; }
            set binaryType(value) { this._ws.binaryType = value; }
            get onopen() { return this._onopen; }
            set onopen(fn) { this._onopen = fn; }
            get onclose() { return this._onclose; }
            set onclose(fn) { this._onclose = fn; }
            get onerror() { return this._onerror; }
            set onerror(fn) { this._onerror = fn; }
            get onmessage() { return this._onmessage; }
            set onmessage(fn) { this._onmessage = fn; }

            static get CONNECTING() { return NativeWebSocket.CONNECTING; }
            static get OPEN() { return NativeWebSocket.OPEN; }
            static get CLOSING() { return NativeWebSocket.CLOSING; }
            static get CLOSED() { return NativeWebSocket.CLOSED; }
        }

        window.WebSocket = TransposeWebSocket;
        window.__transposeChordsSocketPatched = true;
        console.log('[Transpose Chords] WebSocket proxy installed');
    }

    function injectBtn() {
        const controls = document.getElementById('player-controls');
        if (!controls || document.getElementById('btn-transpose-chords')) return;
        const last = controls.querySelector('button:last-child');
        const button = document.createElement('button');
        button.id = 'btn-transpose-chords';
        button.className = active
            ? 'px-3 py-1.5 bg-cyan-900/50 rounded-lg text-xs text-cyan-300 transition'
            : 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-400 transition';
        button.textContent = 'Transpose Chords';
        button.title = 'Toggle chord transposition to E Standard';
        button.onclick = toggle;
        controls.insertBefore(button, last);
        button.click(); // Trigger initial state to apply to current song if loaded
    }

    function toggle() {
        const wasActive = active;
        active = !active;
        const button = document.getElementById('btn-transpose-chords');
        if (button) {
            button.className = active
                ? 'px-3 py-1.5 bg-cyan-900/50 rounded-lg text-xs text-cyan-300 transition'
                : 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-400 transition';
        }
        if (active) {
            createWebSocketProxy();
            // Apply to current song if loaded
            if (window.highway && window.highway.chordTemplates && semitones !== 0) {
                for (const tmpl of window.highway.chordTemplates) {
                    if (tmpl && tmpl.name && !originalChordNames.has(tmpl.id)) {
                        originalChordNames.set(tmpl.id, tmpl.name);
                        tmpl.name = transposeChord(tmpl.name, semitones);
                        console.log(`[Transpose Chords] Applied to current: ${originalChordNames.get(tmpl.id)} -> ${tmpl.name}`);
                    }
                }
            }
        } else {
            // Revert current song
            if (window.highway && window.highway.chordTemplates) {
                for (const tmpl of window.highway.chordTemplates) {
                    if (tmpl && originalChordNames.has(tmpl.id)) {
                        const original = originalChordNames.get(tmpl.id);
                        console.log(`[Transpose Chords] Reverted: ${tmpl.name} -> ${original}`);
                        tmpl.name = original;
                    }
                }
                originalChordNames.clear();
            }
        }
        console.log(`[Transpose Chords] ${active ? 'Enabled' : 'Disabled'}`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectBtn);
        
    } else {
        injectBtn();
    }
})();