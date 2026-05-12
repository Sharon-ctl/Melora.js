import type { MeloraClient } from '../core/Client.js';
import type { PlaylistData, TrackInfo } from '../types/index.js';
import { PlaylistRepo } from '../database/repositories/PlaylistRepo.js';

export class PlaylistManager {
    private readonly repo: PlaylistRepo;

    constructor(client: MeloraClient) {
        this.repo = new PlaylistRepo(client.database);
    }

    async create(userId: string, name: string): Promise<PlaylistData> {
        return this.repo.create(userId, name);
    }

    async get(userId: string, name: string): Promise<PlaylistData | null> {
        return this.repo.get(userId, name);
    }

    async getUserPlaylists(userId: string): Promise<PlaylistData[]> {
        return this.repo.getUserPlaylists(userId);
    }

    async addTrack(userId: string, name: string, track: TrackInfo): Promise<void> {
        await this.repo.addTrack(userId, name, track);
    }

    async addTracks(userId: string, name: string, tracks: TrackInfo[]): Promise<void> {
        await this.repo.addTracks(userId, name, tracks);
    }

    async removeTrack(userId: string, name: string, index: number): Promise<void> {
        await this.repo.removeTrack(userId, name, index);
    }

    async delete(userId: string, name: string): Promise<boolean> {
        return this.repo.delete(userId, name);
    }

    async rename(userId: string, oldName: string, newName: string): Promise<void> {
        await this.repo.rename(userId, oldName, newName);
    }

    async addEditor(userId: string, name: string, editorId: string): Promise<void> {
        await this.repo.addEditor(userId, name, editorId);
    }

    async removeEditor(userId: string, name: string, editorId: string): Promise<void> {
        await this.repo.removeEditor(userId, name, editorId);
    }
}
