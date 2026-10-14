import { vi } from 'vitest';

/** In-memory stand-in for the Prisma tables billing uses (unit tests only). */

export type Row = Record<string, unknown>;
export type Where = Record<string, unknown>;

export function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('not' in c) return value !== c.not && value !== undefined;
      if ('gt' in c) return value instanceof Date && value.getTime() > (c.gt as Date).getTime();
      return false;
    }

    return value === condition;
  });
}

export function table(name: string, unique: string[][] = [], defaults: Row = {}) {
  const rows: Row[] = [];
  let next = 1;

  const conflict = (candidate: Row, self?: Row) =>
    unique.some((keys) =>
      rows.some(
        (row) =>
          row !== self &&
          keys.every((key) => candidate[key] !== null && candidate[key] !== undefined && row[key] === candidate[key]),
      ),
    );
  const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const sorted = (orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return rows;
    const [[key, direction]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const av = (a[key] as Date | null)?.getTime?.() ?? 0;
      const bv = (b[key] as Date | null)?.getTime?.() ?? 0;
      return direction === 'asc' ? av - bv : bv - av;
    });
  };

  return {
    rows,
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row: Row = { id: `${name}_${next++}`, createdAt: new Date(Date.now() + next), ...defaults, ...data };
      if (typeof row.amount === 'string') {
        // Prisma returns Decimal columns as Decimal objects.
        const value = row.amount;
        row.amount = { toFixed: (digits: number) => Number(value).toFixed(digits), toString: () => value };
      }
      if (conflict(row)) throw uniqueError();
      rows.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) =>
      sorted(orderBy).find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where?: Where }) => rows.filter((row) => matches(row, where))),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: Record<string, Where> }) => {
      const [criteria] = Object.values(where);
      const row = rows.find((candidate) => matches(candidate, criteria));
      if (!row) throw new Error('not found');
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    }),
  };
}

