'use strict';
// Pure-function coverage: transposeChord + computeSemitonesFromTuning.
// Runs under the org reusable CI as `node tests/transpose.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function freshPlugin() {
    const file = path.join(__dirname, '..', 'screen.js');
    delete require.cache[require.resolve(file)];
    return require(file);
}

const { transposeChord, computeSemitonesFromTuning } = freshPlugin();

test('transposes sharp roots up with wrap-around', () => {
    assert.equal(transposeChord('C', 2), 'D');
    assert.equal(transposeChord('B', 1), 'C');
    assert.equal(transposeChord('A#', 3), 'C#');
});

test('transposes down through the octave boundary', () => {
    assert.equal(transposeChord('C', -1), 'B');
    assert.equal(transposeChord('D', -14), 'C');
});

test('preserves flat spelling', () => {
    assert.equal(transposeChord('Bb', 2), 'C');
    assert.equal(transposeChord('Eb', -1), 'D');
    assert.equal(transposeChord('Ab', 1), 'A');
    // Flat input stays in the flat note row.
    assert.equal(transposeChord('Db', 3), 'E');
    assert.equal(transposeChord('Gb', 1), 'G');
    assert.equal(transposeChord('Bb', 1), 'B');
    assert.equal(transposeChord('Eb', 1), 'E');
    assert.equal(transposeChord('Ab', -2), 'Gb');
});

test('preserves chord suffix', () => {
    assert.equal(transposeChord('Am7', 2), 'Bm7');
    assert.equal(transposeChord('F#sus4', 1), 'Gsus4');
    assert.equal(transposeChord('Cmaj7#11', 2), 'Dmaj7#11');
});

test('slash-chord bass note is part of the suffix (documented behavior)', () => {
    // Only the root is transposed; the /bass tail rides along unchanged.
    assert.equal(transposeChord('C/G', 2), 'D/G');
});

test('semitones=0 and falsy chords are no-ops', () => {
    assert.equal(transposeChord('C#m', 0), 'C#m');
    assert.equal(transposeChord('', 3), '');
    assert.equal(transposeChord(null, 3), null);
    assert.equal(transposeChord(undefined, 3), undefined);
});

test('unparseable chord names pass through unchanged', () => {
    assert.equal(transposeChord('H7', 2), 'H7');
    assert.equal(transposeChord('n.c.', 2), 'n.c.');
    assert.equal(transposeChord('?', 5), '?');
});

test('uniform tuning offsets map to inverse semitone shift', () => {
    // Whole song tuned down 2 → transpose chords up... plugin inverts sign.
    assert.equal(computeSemitonesFromTuning([-2, -2, -2, -2, -2, -2]), 2);
    assert.equal(computeSemitonesFromTuning([1, 1, 1, 1]), -1);
    assert.equal(computeSemitonesFromTuning([0, 0, 0, 0, 0, 0]), -0);
});

test('non-uniform or invalid tunings yield 0', () => {
    assert.equal(computeSemitonesFromTuning([-2, -2, -2, -2, -2, 0]), 0); // drop-D style
    assert.equal(computeSemitonesFromTuning([]), 0);
    assert.equal(computeSemitonesFromTuning(null), 0);
    assert.equal(computeSemitonesFromTuning('nope'), 0);
    assert.equal(computeSemitonesFromTuning(undefined), 0);
});

test('round-trip: transpose up then down returns original (sharp row)', () => {
    for (const chord of ['C', 'C#m7', 'E5', 'G#dim', 'Bsus2']) {
        for (let s = 1; s <= 11; s++) {
            assert.equal(transposeChord(transposeChord(chord, s), -s), chord);
        }
    }
});
