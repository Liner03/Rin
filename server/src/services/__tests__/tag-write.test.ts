import { afterEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createMockDB } from "../../../tests/fixtures";
import { relationships, contents, metas, users } from "../../db/schema";
import { bindTagsToContent } from "../tag";

describe("bindTagsToContent", () => {
    const databases: Array<ReturnType<typeof createMockDB>> = [];

    afterEach(() => {
        while (databases.length > 0) {
            databases.pop()?.sqlite.close();
        }
    });

    it("normalizes duplicate tags and writes relations as one set", async () => {
        const context = createMockDB();
        databases.push(context);
        await context.db.insert(users).values({ username: "admin", openid: "admin" });
        const [feed] = await context.db.insert(contents)
            .values({ title: "Post", text: "Content", uid: 1, status: "publish" })
            .returning({ id: contents.id });

        await bindTagsToContent(context.db as any, feed.id, [" TypeScript ", "TypeScript", "Bun"]);

        const storedTags = await context.db.select().from(metas);
        const relations = await context.db.select().from(relationships)
            .where(eq(relationships.contentId, feed.id));

        expect(storedTags.map((tag) => tag.name).sort()).toEqual(["Bun", "TypeScript"]);
        expect(relations).toHaveLength(2);
    });

    it("replaces tags across batches while preserving categories and refreshing counts", async () => {
        const context = createMockDB();
        databases.push(context);
        const { db } = context;
        await db.insert(users).values({ id: 1, username: "admin", openid: "admin" });
        await db.insert(contents).values({ id: 1, title: "Post", uid: 1 });
        const [category] = await db.insert(metas).values({ type: "category", name: "Category", slug: "category" }).returning();
        await db.insert(relationships).values({ contentId: 1, metaId: category.id });
        const tags = Array.from({ length: 105 }, (_, index) => `tag-${index}`);
        await bindTagsToContent(db as any, 1, [...tags, tags[0], " "]);
        expect(await db.select().from(relationships)).toHaveLength(106);
        await bindTagsToContent(db as any, 1, ["tag-104", "tag-104"]);
        const links = await db.select().from(relationships);
        expect(links).toHaveLength(2);
        expect(links.some((link) => link.metaId === category.id)).toBe(true);
        const storedTags = await db.select().from(metas).where(eq(metas.type, "tag"));
        expect(storedTags.find((tag) => tag.name === "tag-104")?.count).toBe(1);
        expect(storedTags.filter((tag) => tag.name !== "tag-104").every((tag) => tag.count === 0)).toBe(true);
        await bindTagsToContent(db as any, 1, []);
        expect((await db.select().from(relationships)).map((link) => link.metaId)).toEqual([category.id]);
    });
});
