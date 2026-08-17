import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PageService } from '../page';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';

describe('PageService — custom fields', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(PageService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (1, 'admin', 'a.png', 'gh_admin', 1)`);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    const adminHeaders = { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' };

    async function createPage(body: any) {
        return app.request('/', { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) }, env);
    }

    it('persists str/int/float/json fields on create and returns them in detail', async () => {
        const res = await createPage({
            title: 'Portfolio', content: 'content', slug: 'portfolio', template: 'wide',
            fields: [
                { name: 'subtitle', type: 'str', value: 'My projects' },
                { name: 'year', type: 'int', value: 2026 },
                { name: 'score', type: 'float', value: 4.5 },
                { name: 'gallery', type: 'json', value: { items: ['a', 'b'] } },
            ],
        });
        expect(res.status).toBe(200);
        const { insertedId } = await res.json() as any;

        const detail = await app.request('/portfolio', { method: 'GET' }, env);
        const data = await detail.json() as any;
        expect(data.fields).toHaveLength(4);
        const byName = Object.fromEntries(data.fields.map((f: any) => [f.name, f]));
        expect(byName.subtitle).toEqual({ name: 'subtitle', type: 'str', value: 'My projects' });
        expect(byName.year).toEqual({ name: 'year', type: 'int', value: 2026 });
        expect(byName.score).toEqual({ name: 'score', type: 'float', value: 4.5 });
        expect(byName.gallery).toEqual({ name: 'gallery', type: 'json', value: { items: ['a', 'b'] } });
    });

    it('dedupes duplicate field names (last wins) without failing unique constraint', async () => {
        const res = await createPage({
            title: 'Dup', content: 'c', slug: 'dup',
            fields: [
                { name: 'tag', type: 'str', value: 'first' },
                { name: 'tag', type: 'str', value: 'second' },
            ],
        });
        expect(res.status).toBe(200);

        const detail = await app.request('/dup', { method: 'GET' }, env);
        const data = await detail.json() as any;
        expect(data.fields).toHaveLength(1);
        expect(data.fields[0].value).toBe('second');
    });

    it('updates fields on edit (replaces the whole set)', async () => {
        await createPage({ title: 'A', content: 'c', slug: 'a', fields: [{ name: 'x', type: 'str', value: '1' }] });
        const pages = await (await app.request('/', { method: 'GET' }, env)).json() as any[];
        const pageId = pages[0].id;

        const update = await app.request(`/${pageId}`, {
            method: 'POST', headers: adminHeaders,
            body: JSON.stringify({ title: 'A', content: 'c', fields: [{ name: 'y', type: 'str', value: '2' }] }),
        }, env);
        expect(update.status).toBe(200);

        const detail = await (await app.request('/a', { method: 'GET' }, env)).json() as any;
        expect(detail.fields).toHaveLength(1);
        expect(detail.fields[0].name).toBe('y');
    });

    it('handles invalid int/float and circular json gracefully', async () => {
        const res = await createPage({
            title: 'Edge', content: 'c', slug: 'edge',
            fields: [
                { name: 'big', type: 'int', value: '1e999' },
                { name: 'nan', type: 'float', value: 'abc' },
                { name: 'obj', type: 'json', value: 'not-json-object' },
            ],
        });
        expect(res.status).toBe(200);

        const detail = await (await app.request('/edge', { method: 'GET' }, env)).json() as any;
        const byName = Object.fromEntries(detail.fields.map((f: any) => [f.name, f]));
        expect(byName.big.value).toBe(0);
        expect(byName.nan.value).toBe(0);
        expect(byName.obj.value).toBe('not-json-object');
    });

    it('list includes fields so edit-save preserves them', async () => {
        await createPage({ title: 'A', content: 'c', slug: 'a', fields: [{ name: 'keep', type: 'str', value: 'me' }] });
        const pages = await (await app.request('/', { method: 'GET' }, env)).json() as any[];
        expect(pages[0].fields).toEqual([{ name: 'keep', type: 'str', value: 'me' }]);
    });
});
