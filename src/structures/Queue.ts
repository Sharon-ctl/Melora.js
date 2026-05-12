import type { TrackInfo } from '../types/index.js';
import { LoopMode } from '../types/index.js';
import { QueueLimitExceededError } from '../errors/BotErrors.js';

export class Queue {
    private tracks: TrackInfo[] = [];
    private history: TrackInfo[] = [];
    private _current: TrackInfo | null = null;
    private _loopMode: LoopMode = LoopMode.OFF;
    private _maxSize = 2500;

    // Fast duplicate checking
    private uriSet = new Set<string>();

    private static readonly HISTORY_LIMIT = 10;
    private static readonly AUTOPLAY_HISTORY_LIMIT = 50;


    get current(): TrackInfo | null {
        return this._current;
    }

    get next(): TrackInfo | null {
        return this.tracks[0] ?? null;
    }

    get loopMode(): LoopMode {
        return this._loopMode;
    }

    set loopMode(mode: LoopMode) {
        this._loopMode = mode;
    }

    get size(): number {
        return this.tracks.length;
    }

    get isEmpty(): boolean {
        return this.tracks.length === 0;
    }

    get totalDuration(): number {
        return this.tracks.reduce((sum, t) => sum + t.duration, 0);
    }

    getAll(): TrackInfo[] {
        return [...this.tracks];
    }

    getHistory(): TrackInfo[] {
        return [...this.history];
    }

    get maxSize(): number {
        return this._maxSize;
    }

    setMaxSize(size: number): void {
        this._maxSize = size;
    }

    private checkLimit(incoming: number): void {
        if (this.tracks.length + incoming > this._maxSize) {
            throw new QueueLimitExceededError(this._maxSize);
        }
    }

    getRecentUris(): string[] {
        return this.history.map((t) => t.uri);
    }

    add(track: TrackInfo): void {
        this.checkLimit(1);
        this.tracks.push(track);
        this.uriSet.add(track.uri);
    }

    addNext(track: TrackInfo): void {
        this.checkLimit(1);
        // Insert after the current next track (position 1), or at front if queue is empty
        if (this.tracks.length > 0) {
            this.tracks.splice(1, 0, track);
        } else {
            this.tracks.push(track);
        }
        this.uriSet.add(track.uri);
    }

    addTop(track: TrackInfo): void {
        this.checkLimit(1);
        this.tracks.unshift(track);
        this.uriSet.add(track.uri);
    }

    addMany(tracksToAdd: TrackInfo[]): void {
        this.checkLimit(tracksToAdd.length);
        // Use loop instead of spread to avoid stack overflow on very large arrays
        for (const t of tracksToAdd) {
            this.tracks.push(t);
            this.uriSet.add(t.uri);
        }
    }

    remove(index: number): TrackInfo | null {
        if (index < 0 || index >= this.tracks.length) return null;
        const track = this.tracks.splice(index, 1)[0] ?? null;
        if (track && !this.tracks.some(t => t.uri === track.uri) && (!this._current || this._current.uri !== track.uri)) {
            this.uriSet.delete(track.uri);
        }
        return track;
    }

    removeRange(start: number, end: number): TrackInfo[] {
        if (start < 0 || end >= this.tracks.length || start > end) return [];
        const removed = this.tracks.splice(start, end - start + 1);
        // Rebuild uriSet for exactness (easiest way since range deletes are complex)
        this.rebuildUriSet();
        return removed;
    }

    removeByUser(userId: string): number {
        const initialSize = this.tracks.length;
        this.tracks = this.tracks.filter((t) => t.requester?.id !== userId);
        this.rebuildUriSet();
        return initialSize - this.tracks.length;
    }

    move(from: number, to: number): boolean {
        if (from < 0 || from >= this.tracks.length) return false;
        if (to < 0 || to >= this.tracks.length) return false;
        const [track] = this.tracks.splice(from, 1);
        if (!track) return false;
        this.tracks.splice(to, 0, track);
        return true;
    }

    swap(indexA: number, indexB: number): boolean {
        if (indexA < 0 || indexA >= this.tracks.length) return false;
        if (indexB < 0 || indexB >= this.tracks.length) return false;
        const temp = this.tracks[indexA]!;
        this.tracks[indexA] = this.tracks[indexB]!;
        this.tracks[indexB] = temp;
        return true;
    }

    jump(index: number): TrackInfo | null {
        if (index < 0 || index >= this.tracks.length) return null;
        this.tracks.splice(0, index);
        return this.dequeue();
    }

    clear(): void {
        this.tracks = [];
        this.uriSet.clear();
        if (this._current) this.uriSet.add(this._current.uri);
    }

    previous(): TrackInfo | null {
        if (this.history.length === 0) return null;
        const previousTrack = this.history.shift(); // Get most recent history item
        if (!previousTrack) return null;

        // If something is currently playing, push it back to the head of the queue
        // so it becomes "next" again.
        if (this._current) {
            this.tracks.unshift(this._current);
        }

        this._current = previousTrack;
        this.uriSet.add(this._current.uri);
        return this._current;
    }

    dequeue(): TrackInfo | null {
        if (this._loopMode === LoopMode.TRACK && this._current) {
            return this._current;
        }

        if (this._loopMode === LoopMode.QUEUE && this._current) {
            this.tracks.push(this._current);
        }

        if (this._current) {
            if (this._loopMode !== LoopMode.TRACK) { // Don't spam history if looping 1 track
                this.history.unshift(this._current);
                const limit = this._loopMode === LoopMode.AUTOPLAY
                    ? Queue.AUTOPLAY_HISTORY_LIMIT
                    : Queue.HISTORY_LIMIT;
                if (this.history.length > limit) {
                    this.history.pop();
                }
            }
        }

        this._current = this.tracks.shift() ?? null;
        this.rebuildUriSet();
        return this._current;
    }

    setCurrent(track: TrackInfo | null): void {
        this._current = track;
        if (track) this.uriSet.add(track.uri);
    }

    private rebuildUriSet() {
        this.uriSet.clear();
        if (this._current) this.uriSet.add(this._current.uri);
        for (const t of this.tracks) {
            this.uriSet.add(t.uri);
        }
    }

    smartShuffle(): void {
        if (this.tracks.length <= 2) return;

        // Group tracks by author (O(N))
        const authorGroups = new Map<string, TrackInfo[]>();
        for (const track of this.tracks) {
            const author = track.author || 'Unknown';
            if (!authorGroups.has(author)) {
                authorGroups.set(author, []);
            }
            authorGroups.get(author)!.push(track);
        }

        // Shuffle each author's tracks (Durstenfeld Shuffle - O(N))
        for (const group of authorGroups.values()) {
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = group[i];
                group[i] = group[j]!;
                group[j] = temp!;
            }
        }

        // Interleave tracks (Spreading Logic - O(N log K))
        const newQueue: TrackInfo[] = [];
        const activeGroups = Array.from(authorGroups.values()).filter(g => g.length > 0);

        while (activeGroups.length > 0) {
            // Sort active groups by remaining length (longest first) so they get spread evenly
            activeGroups.sort((a, b) => b.length - a.length);

            // Take one track from each group to prevent clustering
            for (let i = activeGroups.length - 1; i >= 0; i--) {
                const group = activeGroups[i]!;
                newQueue.push(group.shift()!);
                // Remove group if empty
                if (group.length === 0) {
                    activeGroups.splice(i, 1);
                }
            }
        }

        this.tracks = newQueue;
    }

    isDuplicate(uri: string): boolean {
        // Fast O(1) lookup
        return this.uriSet.has(uri);
    }

    deduplicate(): number {
        const seen = new Set<string>();
        const initialSize = this.tracks.length;

        // Keep current if it exists
        if (this._current) {
            seen.add(this._current.uri);
        }

        this.tracks = this.tracks.filter((track) => {
            if (seen.has(track.uri)) return false;
            seen.add(track.uri);
            return true;
        });

        this.uriSet = seen;
        return initialSize - this.tracks.length;
    }

    destroy(): void {
        this.tracks = [];
        this.history = [];
        this._current = null;
        this.uriSet.clear();
        this._loopMode = LoopMode.OFF;
    }
}
