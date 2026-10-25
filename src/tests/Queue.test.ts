import assert from 'node:assert/strict';
import test from 'node:test';
import { Queue } from '../structures/Queue.js';
import { QueueLimitExceededError } from '../errors/BotErrors.js';
import { LoopMode, type TrackInfo } from '../types/index.js';

function track(id: string, requesterId = 'user-1'): TrackInfo {
    return {
        encoded: `encoded-${id}`,
        title: `Track ${id}`,
        author: 'Test Artist',
        uri: `https://example.test/${id}`,
        duration: 60_000,
        requester: { id: requesterId, username: requesterId },
    };
}

test('dequeue advances tracks and keeps newest-first history', () => {
    const queue = new Queue();
    const first = track('one');
    const second = track('two');
    queue.addMany([first, second]);

    assert.equal(queue.dequeue(), first);
    assert.equal(queue.dequeue(), second);
    assert.deepEqual(queue.getHistory(), [first]);
    assert.equal(queue.totalDuration, 0);
});

test('queue limit errors do not partially add tracks', () => {
    const queue = new Queue();
    queue.setMaxSize(2);
    queue.add(track('one'));

    assert.throws(() => queue.addMany([track('two'), track('three')]), QueueLimitExceededError);
    assert.equal(queue.size, 1);
    assert.equal(queue.next?.uri, 'https://example.test/one');
});

test('deduplicate retains the current item and first queued copy', () => {
    const queue = new Queue();
    const current = track('same');
    queue.setCurrent(current);
    queue.addMany([track('same'), track('other'), track('other')]);

    assert.equal(queue.deduplicate(), 2);
    assert.deepEqual(queue.getAll().map(item => item.uri), [
        'https://example.test/other',
    ]);
    assert.equal(queue.isDuplicate(current.uri), true);
});

test('track looping repeats current without adding history', () => {
    const queue = new Queue();
    const first = track('one');
    queue.add(first);
    assert.equal(queue.dequeue(), first);

    queue.loopMode = LoopMode.TRACK;
    assert.equal(queue.dequeue(), first);
    assert.deepEqual(queue.getHistory(), []);
});

test('removeByUser updates queue contents and duplicate lookup', () => {
    const queue = new Queue();
    queue.addMany([track('one', 'user-a'), track('two', 'user-b')]);

    assert.equal(queue.removeByUser('user-a'), 1);
    assert.deepEqual(queue.getAll().map(item => item.requester.id), ['user-b']);
    assert.equal(queue.isDuplicate('https://example.test/one'), false);
});
