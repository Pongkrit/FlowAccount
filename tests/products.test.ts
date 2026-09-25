import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';

process.env.DB_PATH = ':memory:';
const { app } = await import('../src/app.js');
const { database } = await import('../src/db/database.js');
let server: Server;
let base: string;
let counter = 0;

before(async () => {
  await database;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}/api/products`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await (await database).close();
});

async function request(path = '', method = 'GET', body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
function input(overrides = {}) {
  return { name: 'ข้าวผัด', sku: `FOOD${++counter}`, price: 45, stock: 20, category: 'อาหาร', ...overrides };
}
async function create(overrides = {}) {
  const result = await request('', 'POST', input(overrides));
  assert.equal(result.status, 201);
  return result.body;
}

test('create returns all required fields, numeric ID and ISO creation time', async () => {
  const body = input();
  const result = await request('', 'POST', body);
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { ...body, id: result.body.id, createdAt: result.body.createdAt });
  assert(Number.isSafeInteger(result.body.id));
  assert.equal(new Date(result.body.createdAt).toISOString(), result.body.createdAt);
});

test('list all, filter exact category, and return empty list for unmatched category', async () => {
  const drink = await create({ category: 'เครื่องดื่ม' });
  const all = await request();
  assert.equal(all.status, 200);
  assert(all.body.some((p: any) => p.id === drink.id));
  const filtered = await request(`?category=${encodeURIComponent('เครื่องดื่ม')}`);
  assert.equal(filtered.status, 200);
  assert(filtered.body.length > 0);
  assert(filtered.body.every((p: any) => p.category === 'เครื่องดื่ม'));
  assert.deepEqual((await request('?category=unknown')).body, []);
  assert.equal((await request('?category=a&category=b')).status, 400);
});

test('creation rejects invalid fields and aggregates validation errors', async () => {
  for (const override of [
    { name: '' }, { name: '   ' }, { name: 42 }, { sku: '' }, { sku: 'ab' }, { sku: 123 },
    { price: 0 }, { price: -1 }, { price: '45' }, { price: null },
    { stock: -1 }, { stock: '20' }, { stock: null }, { category: 'food' },
  ]) {
    const result = await request('', 'POST', input(override));
    assert.equal(result.status, 400, JSON.stringify(override));
    assert(Array.isArray(result.body.errors));
  }
  assert.equal((await request('', 'POST', {})).body.errors.length, 5);
  for (const body of [[], null, 'text']) assert.equal((await request('', 'POST', body)).status, 400);
  assert.equal((await request('', 'POST')).status, 400);
  await create({ stock: 0 });
  await create({ stock: 1.5, price: 0.5 });
});

test('duplicate SKU returns 400, including concurrent creates; UNIQUE also protects direct SQL', async () => {
  const body = input();
  const responses = await Promise.all([request('', 'POST', body), request('', 'POST', body)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]);
  assert.equal((await request('', 'POST', body)).status, 400);
  const db = await database;
  await assert.rejects(db.run(
    'INSERT INTO products (name, sku, price, stock, category, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    body.name, body.sku, body.price, body.stock, body.category, new Date().toISOString(),
  ), /UNIQUE/);
});

test('selling returns exact remaining stock; selling all reaches zero; overselling changes nothing', async () => {
  const product = await create();
  let result = await request('/sell', 'POST', { productId: product.id, quantity: 7 });
  assert.equal(result.status, 200);
  assert.equal(result.body.stock, 13);
  result = await request('/sell', 'POST', { productId: product.id, quantity: 14 });
  assert.equal(result.status, 400);
  assert.equal((await request()).body.find((p: any) => p.id === product.id).stock, 13);
  result = await request('/sell', 'POST', { productId: product.id, quantity: 13 });
  assert.equal(result.status, 200);
  assert.equal(result.body.stock, 0);
  assert.equal((await request('/sell', 'POST', { productId: product.id, quantity: 1 })).status, 400);
});

test('quantity validation precedes lookup; invalid IDs and missing products are distinguished', async () => {
  for (const quantity of [0, -1, '1', null]) {
    const result = await request('/sell', 'POST', { productId: 999999, quantity });
    assert.equal(result.status, 400);
    assert.match(result.body.errors[0], /quantity/);
  }
  for (const productId of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request('/sell', 'POST', { productId, quantity: 1 })).status, 400);
  }
  assert.equal((await request('/sell', 'POST', { quantity: 1 })).status, 400);
  assert.equal((await request('/sell', 'POST', { productId: 999999, quantity: 1 })).status, 404);
});

test('simultaneous sales cannot oversell or lose a stock deduction', async () => {
  const product = await create({ stock: 10 });
  const results = await Promise.all(Array.from({ length: 20 }, () => request('/sell', 'POST', { productId: product.id, quantity: 1 })));
  assert.equal(results.filter(r => r.status === 200).length, 10);
  assert.equal(results.filter(r => r.status === 400).length, 10);
  assert.equal((await request()).body.find((p: any) => p.id === product.id).stock, 0);
  await assert.rejects((await database).run('UPDATE products SET stock = -1 WHERE id = ?', product.id), /CHECK/);
});

test('SQL-like text is stored as data and cannot alter filters or tables', async () => {
  const product = await create({ name: "Robert'); DROP TABLE products;--", sku: "SKU' OR 1=1 --" });
  assert.equal(product.name, "Robert'); DROP TABLE products;--");
  assert.deepEqual((await request(`?category=${encodeURIComponent("' OR 1=1 --")}`)).body, []);
  assert.equal((await request()).status, 200);
});

test('malformed JSON, nonfinite numbers, and unknown routes return JSON errors', async () => {
  for (const body of ['{bad json', '{"name":"x","sku":"ABC","price":1e400,"stock":0,"category":"อาหาร"}']) {
    const result = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(result.status, 400);
    assert(Array.isArray((await result.json() as any).errors));
  }
  assert.equal((await request('/unknown')).status, 404);
});

test('bonus search matches name or SKU case-insensitively, Thai, and literal wildcards', async () => {
  const product = await create({ name: 'ข้าว ÄBC 100%_match', sku: 'MiXeD-Search' });
  for (const keyword of ['ข้าว', 'äbc', 'mixed-search', '%_']) {
    const result = await request(`/search?keyword=${encodeURIComponent(keyword)}`);
    assert.equal(result.status, 200);
    assert(result.body.some((p: any) => p.id === product.id));
  }
  assert.equal((await request('/search?keyword=%25_')).body.length, 1);
  assert.deepEqual((await request('/search?keyword=not-present-xyz')).body, []);
  assert.equal((await request('/search')).status, 400);
  assert.equal((await request('/search?keyword=a&keyword=b')).status, 400);
  assert.deepEqual((await request('/search?keyword=')).body, (await request()).body);
});

test('bonus bulk updates return success count, skip unknown IDs and preserve other fields', async () => {
  const first = await create();
  const second = await create();
  const result = await request('/bulk-price-update', 'PUT', [
    { productId: first.id, newPrice: 60 }, { productId: second.id, newPrice: 70 },
    { productId: 999999, newPrice: 80 },
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { updatedCount: 2 });
  const all = (await request()).body;
  assert.deepEqual(all.find((p: any) => p.id === first.id), { ...first, price: 60 });
  assert.deepEqual(all.find((p: any) => p.id === second.id), { ...second, price: 70 });
  assert.deepEqual((await request('/bulk-price-update', 'PUT', [])).body, { updatedCount: 0 });
  const repeated = await request('/bulk-price-update', 'PUT', [
    { productId: first.id, newPrice: 80 }, { productId: first.id, newPrice: 90 },
  ]);
  assert.deepEqual(repeated.body, { updatedCount: 2 });
  assert.equal((await request()).body.find((p: any) => p.id === first.id).price, 90);
});

test('bonus bulk validation rejects invalid entries before any writes', async () => {
  const product = await create();
  for (const body of [{}, null, [null], [{ productId: '1', newPrice: 2 }],
    [{ productId: product.id, newPrice: '2' }], [{ productId: product.id, newPrice: -1 }],
    [{ productId: product.id, newPrice: 100 }, { productId: product.id, newPrice: 0 }]]) {
    assert.equal((await request('/bulk-price-update', 'PUT', body)).status, 400);
  }
  assert.equal((await request()).body.find((p: any) => p.id === product.id).price, product.price);
});
