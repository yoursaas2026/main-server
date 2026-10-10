import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts, developers, productCategories } from '../../db/schema.js';

/**
 * Compact catalog index for buyer-portal sitemaps (all live listings + public sellers).
 */
export class PublicSeoController {
    async sitemap(c: Context) {
        try {
            const products = await db
                .select({
                    slug: developerProducts.slug,
                    updatedAt: developerProducts.updatedAt,
                    name: developerProducts.name,
                })
                .from(developerProducts)
                .where(eq(developerProducts.listingStatus, 'live'))
                .orderBy(developerProducts.slug);

            const developerRows = await db
                .select({
                    id: developers.id,
                    updatedAt: developers.updatedAt,
                })
                .from(developers)
                .innerJoin(developerProducts, eq(developerProducts.developerId, developers.id))
                .where(
                    and(
                        eq(developerProducts.listingStatus, 'live'),
                        eq(developers.status, 'active'),
                    ),
                )
                .groupBy(developers.id, developers.updatedAt)
                .orderBy(developers.id);

            const categories = await db
                .select({
                    id: productCategories.id,
                    name: productCategories.name,
                })
                .from(productCategories)
                .orderBy(productCategories.name);

            return c.json({
                success: true,
                data: {
                    generatedAt: new Date().toISOString(),
                    productCount: products.length,
                    developerCount: developerRows.length,
                    products: products.map((p) => ({
                        slug: p.slug,
                        name: p.name,
                        updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt ?? null,
                    })),
                    developers: developerRows.map((d) => ({
                        id: d.id,
                        updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt ?? null,
                    })),
                    categories: categories.map((cat) => ({
                        id: cat.id,
                        name: cat.name,
                    })),
                },
            });
        } catch (error) {
            console.error('[PublicSeo] sitemap error:', error);
            return c.json({ success: false, error: 'Failed to build sitemap index' }, 500);
        }
    }
}

export const publicSeoController = new PublicSeoController();
