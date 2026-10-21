import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TagService, bindTagsToContent } from '../tag';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, seedTestData, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';

describe('TagService', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(TagService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        
        // Seed test data
        seedTestData(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    describe('GET / - List all tags', () => {
        it('should return all tags with feed counts', async () => {
            const res = await app.request('/', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data).toBeArray();
            expect(data.length).toBe(2);
            
            const testTag = data.find((t: any) => t.name === 'test');
            expect(testTag).toBeDefined();
            expect(testTag.count).toBe(2);
            
            const integrationTag = data.find((t: any) => t.name === 'integration');
            expect(integrationTag).toBeDefined();
            expect(integrationTag.count).toBe(1);
        });

        it('should return empty array when no tags exist', async () => {
            sqlite.exec('DELETE FROM relationships');
            sqlite.exec('DELETE FROM metas');
            
            const res = await app.request('/', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data).toEqual([]);
        });
    });

    describe('GET /:name - Get tag details', () => {
        it('should return tag with feeds', async () => {
            const res = await app.request('/test', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.name).toBe('test');
            expect(data.feeds).toBeArray();
            expect(data.feeds.length).toBe(2);
        });

        it('should decode URL-encoded tag names', async () => {
            sqlite.exec(`INSERT INTO metas (id, type, name, slug) VALUES (3, 'tag', 'web dev', 'web-dev')`);
            sqlite.exec(`INSERT INTO relationships (content_id, meta_id) VALUES (1, 3)`);
            
            const res = await app.request('/web%20dev', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.name).toBe('web dev');
        });

        it('should return 404 for non-existent tag', async () => {
            const res = await app.request('/nonexistent', { method: 'GET' }, env);
            
            expect(res.status).toBe(404);
        });

        it('should exclude draft feeds for non-admin users', async () => {
            sqlite.exec(`INSERT INTO contents (id, type, title, text, uid, status) VALUES (3, 'post', 'Draft', 'Content', 1, 'draft')`);
            sqlite.exec(`INSERT INTO relationships (content_id, meta_id) VALUES (3, 1)`);
            
            const res = await app.request('/test', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.feeds.every((f: any) => f.status !== 'draft')).toBe(true);
            
            sqlite.exec(`DELETE FROM relationships WHERE content_id = 3`);
            sqlite.exec(`DELETE FROM contents WHERE id = 3`);
        });

        it('should include hashtags in feed data', async () => {
            const res = await app.request('/test', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.feeds.length).toBeGreaterThan(0);
            expect(data.feeds[0].hashtags).toBeArray();
        });
    });

    describe('bindTagsToContent function', () => {
        it('should bind tags to a feed', async () => {
            await bindTagsToContent(db, 1, ['newtag1', 'newtag2']);
            
            const result = sqlite.prepare(`
                SELECT m.name FROM metas m
                JOIN relationships r ON m.id = r.meta_id
                WHERE r.content_id = 1 AND m.type = 'tag'
            `).all();
            
            expect(result.length).toBeGreaterThan(0);
        });

        it('should create new tags if they do not exist', async () => {
            await bindTagsToContent(db, 1, ['brandnewtag']);
            
            const tagResult = sqlite.prepare(`
                SELECT * FROM metas WHERE name = 'brandnewtag' AND type = 'tag'
            `).all();
            
            expect(tagResult.length).toBe(1);
        });

        it('should remove existing tags before binding new ones', async () => {
            await bindTagsToContent(db, 1, ['tag1', 'tag2']);
            await bindTagsToContent(db, 1, ['tag3']);
            
            const result = sqlite.prepare(`
                SELECT m.name FROM metas m
                JOIN relationships r ON m.id = r.meta_id
                WHERE r.content_id = 1 AND m.type = 'tag'
            `).all();
            
            const tagNames = result.map((r: any) => r.name);
            expect(tagNames).not.toContain('tag1');
            expect(tagNames).not.toContain('tag2');
            expect(tagNames).toContain('tag3');
        });

        it('should reuse existing tags', async () => {
            await bindTagsToContent(db, 1, ['reusable']);
            
            const tagResult = sqlite.prepare(`SELECT id FROM metas WHERE name = 'reusable'`).all() as any[];
            const tagId = tagResult[0]?.id;
            
            await bindTagsToContent(db, 2, ['reusable']);
            
            const feed2Tags = sqlite.prepare(`
                SELECT meta_id FROM relationships WHERE content_id = 2
            `).all() as any[];
            
            expect(feed2Tags[0]?.meta_id).toBe(tagId);
        });

        it('should handle empty tags array', async () => {
            await bindTagsToContent(db, 1, ['tag1', 'tag2']);
            await bindTagsToContent(db, 1, []);
            
            const result = sqlite.prepare(`
                SELECT COUNT(*) as count FROM relationships WHERE content_id = 1
            `).all() as any[];
            
            expect(result[0]?.count).toBe(0);
        });
    });
});
