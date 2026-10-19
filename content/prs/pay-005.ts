import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-005',
  title: 'Store line prices as integer cents',
  author: 'ines.f',
  area: 'payments',
  description: 'Replaces float dollar prices with integer cents so totals stop drifting.',
  language: 'ts',
  diff: `
@@ payments/prices.ts @@
 import type { Cart, LineItem } from './types';

-export function lineTotal(item: LineItem): number {
-  return item.unitPrice * item.quantity;
+export function lineTotalCents(item: LineItem): number {
+  return item.unitPriceCents * item.quantity;
 }

-export function cartTotal(cart: Cart): number {
-  return cart.items.reduce((sum, i) => sum + lineTotal(i), 0);
+export function cartTotalCents(cart: Cart): number {
+  return cart.items.reduce((sum, i) => sum + lineTotalCents(i), 0);
 }

+export function toCents(dollars: number): number {
+  return Math.round(dollars * 100);
+}
+
-export function formatPrice(amount: number): string {
-  return '$' + amount.toFixed(2);
+export function formatPrice(cents: number): string {
+  const dollars = Math.trunc(cents / 100);
+  const rest = String(cents % 100).padStart(2, '0');
+  return '$' + dollars + '.' + rest;
 }
`,
  featureValue: 1_000_000,
  bug: null,
};
