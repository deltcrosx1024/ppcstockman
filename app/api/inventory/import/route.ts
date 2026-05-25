import { NextResponse } from 'next/server';
import XLSX from 'xlsx';
import redis from '@/lib/redis';
import { verifyToken } from '@/lib/auth';
import type { InventoryItemCreateInput } from '@/types/inventoryItem';

const LOYVERSE_DEFAULT_API_URL = 'https://api.loyverse.com/v1/items';

function generateId() {
  return `item:${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = Number(String(value).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function parseSpreadsheetRows(rows: Record<string, unknown>[]): InventoryItemCreateInput[] {
  return rows
    .map(row => {
      const item: InventoryItemCreateInput = {
        name: '',
        description: '',
        barcode: '',
        category: '',
        purchasePrice: 0,
        salePrice: 0,
        quantityInStock: 0,
        reorderLevel: 0,
        supplier: ''
      };

      for (const [key, rawValue] of Object.entries(row)) {
        const header = key.toLowerCase().trim();
        if (header.includes('name') && !header.includes('sale') && !header.includes('purchase')) {
          item.name = normalizeString(rawValue);
        }
        if (header.includes('description') || header.includes('desc')) {
          item.description = normalizeString(rawValue);
        }
        if (header.includes('barcode') || header.includes('sku') || header.includes('item code')) {
          item.barcode = normalizeString(rawValue);
        }
        if (header.includes('category') || header.includes('department')) {
          item.category = normalizeString(rawValue);
        }
        if (header.includes('purchase') || header.includes('cost')) {
          item.purchasePrice = parseNumber(rawValue, item.purchasePrice ?? 0);
        }
        if (header === 'price' || header.includes('sale price') || header.includes('selling price')) {
          item.salePrice = parseNumber(rawValue, item.salePrice ?? 0);
        }
        if (header.includes('quantity') || header.includes('stock') || header.includes('on hand')) {
          item.quantityInStock = Math.max(0, Math.floor(parseNumber(rawValue, item.quantityInStock ?? 0)));
        }
        if (header.includes('reorder')) {
          item.reorderLevel = Math.max(0, Math.floor(parseNumber(rawValue, item.reorderLevel ?? 0)));
        }
        if (header.includes('supplier')) {
          item.supplier = normalizeString(rawValue);
        }
      }

      if (!item.name) {
        item.name = normalizeString(row.name ?? row.item_name ?? row['Item Name'] ?? 'Unnamed item');
      }
      if (!item.description) {
        item.description = normalizeString(row.description ?? row.desc ?? '');
      }
      if (!item.barcode) {
        item.barcode = normalizeString(row.barcode ?? row.sku ?? row['Item Code'] ?? '');
      }
      if (!item.category) {
        item.category = normalizeString(row.category ?? row.department ?? 'General');
      }
      if (!item.supplier) {
        item.supplier = normalizeString(row.supplier ?? '');
      }

      if (item.salePrice === 0 && item.purchasePrice > 0) {
        item.salePrice = item.purchasePrice;
      }

      return item as InventoryItemCreateInput;
    })
    .filter(item => item.name && item.barcode);
}

function normalizeLoyverseItem(raw: Record<string, unknown>): InventoryItemCreateInput | null {
  const barcode = normalizeString(raw.barcode ?? raw.sku ?? raw['item_code']);
  const name = normalizeString(raw.name ?? raw['item_name'] ?? raw['product_name'] ?? 'Unnamed item');

  if (!barcode || !name) {
    return null;
  }

  const description = normalizeString(raw.description ?? raw.note ?? '');
  const category = normalizeString(raw.category_name ?? raw.category ?? raw.department ?? 'General');
  const supplier = normalizeString(raw.supplier_name ?? raw.supplier ?? '');

  return {
    name,
    description,
    barcode,
    category,
    supplier,
    purchasePrice: parseNumber(raw.cost_price ?? raw.purchase_price ?? 0),
    salePrice: parseNumber(raw.price ?? raw.sale_price ?? raw.sell_price ?? 0),
    quantityInStock: Math.max(0, Math.floor(parseNumber(raw.quantity_on_hand ?? raw.stock ?? raw.quantity ?? 0))),
    reorderLevel: Math.max(0, Math.floor(parseNumber(raw.reorder_level ?? raw.reorder_level ?? 0)))
  };
}

async function loadItemsFromLoyverse(accessToken: string, apiUrl?: string) {
  const url = apiUrl ? normalizeString(apiUrl) : LOYVERSE_DEFAULT_API_URL;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Loyverse API request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const rawItems = Array.isArray(json) ? json : json.items ?? json.data ?? [];

  if (!Array.isArray(rawItems)) {
    throw new Error('Loyverse API returned unexpected payload format');
  }

  return rawItems
    .map(item => normalizeLoyverseItem(item as Record<string, unknown>))
    .filter((item): item is InventoryItemCreateInput => item !== null);
}

async function parseUpload(file: File) {
  const name = file.name.toLowerCase();
  let workbook;

  if (name.endsWith('.csv')) {
    const csvText = await file.text();
    workbook = XLSX.read(csvText, { type: 'string', raw: false });
  } else {
    const arrayBuffer = await file.arrayBuffer();
    workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Unable to read spreadsheet sheet.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return parseSpreadsheetRows(rows);
}

async function saveItem(item: InventoryItemCreateInput) {
  const barcode = item.barcode;
  const existingId = await redis.get(`inventory:barcode:${barcode}`);
  const now = new Date().toISOString();

  if (existingId) {
    await redis.hSet(`inventory:item:${existingId}`, 'name', item.name);
    await redis.hSet(`inventory:item:${existingId}`, 'description', item.description);
    await redis.hSet(`inventory:item:${existingId}`, 'category', item.category);
    await redis.hSet(`inventory:item:${existingId}`, 'purchasePrice', item.purchasePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'salePrice', item.salePrice.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'quantityInStock', item.quantityInStock.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'reorderLevel', item.reorderLevel.toString());
    await redis.hSet(`inventory:item:${existingId}`, 'supplier', item.supplier);
    await redis.hSet(`inventory:item:${existingId}`, 'updatedAt', now);
    await redis.hSet(`inventory:item:${existingId}`, 'isActive', 'true');
    return { updated: true, id: existingId };
  }

  const itemId = generateId();
  await redis.hSet(`inventory:item:${itemId}`, 'id', itemId);
  await redis.hSet(`inventory:item:${itemId}`, 'name', item.name);
  await redis.hSet(`inventory:item:${itemId}`, 'description', item.description);
  await redis.hSet(`inventory:item:${itemId}`, 'barcode', item.barcode);
  await redis.hSet(`inventory:item:${itemId}`, 'category', item.category);
  await redis.hSet(`inventory:item:${itemId}`, 'purchasePrice', item.purchasePrice.toString());
  await redis.hSet(`inventory:item:${itemId}`, 'salePrice', item.salePrice.toString());
  await redis.hSet(`inventory:item:${itemId}`, 'quantityInStock', item.quantityInStock.toString());
  await redis.hSet(`inventory:item:${itemId}`, 'reorderLevel', item.reorderLevel.toString());
  await redis.hSet(`inventory:item:${itemId}`, 'supplier', item.supplier);
  await redis.hSet(`inventory:item:${itemId}`, 'createdAt', now);
  await redis.hSet(`inventory:item:${itemId}`, 'updatedAt', now);
  await redis.hSet(`inventory:item:${itemId}`, 'isActive', 'true');
  await redis.sAdd('inventory:itemIds', itemId);
  await redis.set(`inventory:barcode:${barcode}`, itemId);
  return { updated: false, id: itemId };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);
    if (error || !payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    let items: InventoryItemCreateInput[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'File upload is required' }, { status: 400 });
      }
      items = await parseUpload(file);
    } else {
      const body = await request.json();
      const source = String(body.source ?? 'loyverse').toLowerCase();

      if (source === 'loyverse') {
        const accessToken = String(body.accessToken ?? body.token ?? '');
        if (!accessToken) {
          return NextResponse.json({ error: 'Loyverse access token is required' }, { status: 400 });
        }
        items = await loadItemsFromLoyverse(accessToken, body.apiUrl);
      } else if (Array.isArray(body.items)) {
        items = parseSpreadsheetRows(body.items);
      } else {
        return NextResponse.json({ error: 'Unsupported import payload. Use source=loyverse or upload file.' }, { status: 400 });
      }
    }

    if (!items.length) {
      return NextResponse.json({ error: 'No importable inventory items were found' }, { status: 400 });
    }

    const imported: string[] = [];
    const updated: string[] = [];

    for (const item of items) {
      const result = await saveItem(item);
      if (result.updated) {
        updated.push(result.id);
      } else {
        imported.push(result.id);
      }
    }

    return NextResponse.json({
      message: 'Import completed',
      importedCount: imported.length,
      updatedCount: updated.length,
      importedIds: imported,
      updatedIds: updated
    });
  } catch (err) {
    console.error('Error importing inventory:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
