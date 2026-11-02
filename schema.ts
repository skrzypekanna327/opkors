import { pgTable, pgEnum, uuid, text, timestamp, index, integer, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const category = pgEnum('opkors_category', ['Sprzątanie', 'Korepetycje', 'Opieka']);
export const ads = pgTable('ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  category: category('category').notNull(),
  town: text('town').notNull(),
  description: text('description').notNull(),
  // Compatibility placeholder for old previews; actual contacts live separately.
  phone: text('phone').notNull().default('[kontakt ukryty]'),
  ownerHash: text('owner_hash'),
  featuredUntil: timestamp('featured_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ads_created_at_idx').on(table.createdAt),
  check('ads_no_public_phone', sql`${table.phone} = '[kontakt ukryty]'`),
]);

export const adContacts = pgTable('ad_contacts', {
  adId: uuid('ad_id').primaryKey().references(() => ads.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
});

export const purchaseSessions = pgTable('purchase_sessions', {
  hash: text('hash').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const productType = pgEnum('product_type', ['phone', 'feature7', 'feature30']);
export const orderStatus = pgEnum('order_status', ['pending', 'paid', 'declined', 'cancelled']);
export const orders = pgTable('test_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adId: uuid('ad_id').notNull().references(() => ads.id, { onDelete: 'cascade' }),
  buyerHash: text('buyer_hash').notNull().references(() => purchaseSessions.hash),
  product: productType('product').notNull(),
  amount: integer('amount').notNull(),
  status: orderStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [index('orders_access_idx').on(table.buyerHash, table.adId, table.status)]);
