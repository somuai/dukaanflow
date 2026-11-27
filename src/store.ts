import { randomUUID } from 'expo-crypto';
import { backupDatabaseAsync, deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { BACKUP_DATABASE_PATH, managedAttachmentPaths, type BackupManifest } from './backup-package.ts';
import { equivalentProductBarcodes } from './product-lookup.ts';

import {
  DEMO_CATALOG,
  MAX_MONEY_PAISE,
  MAX_QUANTITY,
  type CatalogItem,
  type PaymentMethod,
  type ReceiptInput,
  type StockUnit,
} from './domain.ts';

export type ShopMode = 'demo' | 'live';
export type ShopLanguage = 'en' | 'hi';
export type WisprSetupStep = 'not-started' | 'account' | 'keyboard' | 'dictation' | 'ready' | 'later';

export type ShopProfile = {
  id: string;
  name: string;
  language: ShopLanguage;
  setupComplete: boolean;
};

export type SavedReceipt = ReceiptInput & {
  id: string;
  createdAt: string;
  businessDate: string;
  reversedAt: string | null;
};

type CatalogInput = Omit<CatalogItem, 'id'> & { id?: string };
type CatalogRow = Pick<CatalogItem, 'id' | 'name' | 'packSize' | 'unit' | 'imageUri' | 'barcode' | 'brand' | 'packageContent' | 'catalogueSource'> & {
  aliasesJson: string;
};

type ReceiptRow = Omit<SavedReceipt, 'lines'> & ReceiptInput['lines'][number];

export type DeliveryReconciliationLineInput = {
  lineId: string;
  catalogItemId: string;
  name: string;
  packSize: string;
  unit: StockUnit;
  billedQuantity: number;
  goodQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  extraQuantity: number;
  acceptedExtraQuantity: number;
  lots?: DeliveryLotInput[];
};

export type DeliveryLotInput = { quantity: number; batchCode: string | null; expiryDate: string | null };
export type DeliveryLotObservation = DeliveryLotInput & {
  id: string;
  deliveryId: string;
  lineId: string;
  catalogueItemId: string;
  name: string;
  packSize: string;
  unit: StockUnit;
  rejectedQuantity: number;
  expiredQuantity: number;
  usableQuantity: number;
};
export type DeliveryLotReceiptSummary = {
  deliveryId: string;
  lineId: string;
  catalogueItemId: string;
  name: string;
  packSize: string;
  unit: StockUnit;
  acceptedQuantity: number;
  trackedQuantity: number;
  untrackedQuantity: number;
  usableObservedQuantity: number;
  expiredQuantity: number;
  rejectedQuantity: number;
  lots: DeliveryLotObservation[];
};
export type DeliveryLotRejection = { id: string; lotId: string; quantity: number; stockQuantityDelta: number; createdAt: string };
export type DeliveryLotRejectionEvent = { id: string; lotId: string; quantity: number; note: string | null; createdAt: string };

export type DeliveryReconciliationInput = {
  voiceNote?: string;
  supplier: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate?: string | null;
  invoiceEvidenceUris: string[];
  invoiceTotalPaise: number;
  amountPaidPaise: number | null;
  paymentMethod: PaymentMethod | null;
  lines: DeliveryReconciliationLineInput[];
};

export type SavedDeliveryReconciliation = DeliveryReconciliationInput & {
  id: string;
  createdAt: string;
  businessDate: string;
  reversedAt: string | null;
};

export type Customer = {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
  balancePaise: number;
  openPromiseCount: number;
};

export type NewCustomerInput = { name: string; aliases: string[] };
export type CustomerMatch = { id: string; name: string; matchedAlias: string };

export type SupplierProfile = {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
  balancePaise: number;
  deliveryCount: number;
  paymentCount: number;
};

export type NewSupplierInput = { name: string; aliases: string[] };
export type SupplierPaymentInput = {
  supplierId: string;
  amountPaise: number;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  allocations?: SupplierPaymentAllocationInput[];
};
export type SupplierPaymentAllocationInput = { invoiceId: string; amountPaise: number };
export type SupplierPaymentAllocation = SupplierPaymentAllocationInput & { invoiceNumber: string | null };
export type SupplierPaymentEvent = SupplierPaymentInput & {
  id: string;
  kind: 'payment' | 'reversal';
  amountDeltaPaise: number;
  createdAt: string;
  businessDate: string;
  reversesEventId: string | null;
  allocations: SupplierPaymentAllocation[];
  unallocatedPaise: number;
};
export type SupplierInvoiceStatus = 'settled' | 'not_due' | 'due_today' | 'overdue' | 'no_due_date';
export type SupplierInvoice = {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  businessDate: string;
  totalPaise: number;
  amountPaidAtReceiptPaise: number;
  allocatedPaymentPaise: number;
  creditNotePaise: number;
  openPaise: number;
  status: SupplierInvoiceStatus;
};
export type SupplierClaimKind = 'damaged' | 'missing' | 'extra' | 'return';
export type SupplierClaimStatus = 'open' | 'credit_promised' | 'replacement_promised' | 'disputed' | 'resolved_credit_note' | 'resolved_replacement' | 'closed' | 'voided';
export type SupplierClaimInput = { deliveryId: string; lineId: string; kind: SupplierClaimKind; quantity: number; note: string | null };
export type SupplierClaimEvent = {
  id: string; kind: string; quantity: number | null; amountDeltaPaise: number | null;
  reference: string | null; note: string | null; relatedDeliveryId: string | null;
  relatedDeliveryLineId: string | null; reversesEventId: string | null; createdAt: string;
};
export type SupplierClaim = SupplierClaimInput & {
  id: string; supplierId: string; supplier: string; linePosition: number; status: SupplierClaimStatus;
  createdAt: string; itemName: string; packSize: string; unit: StockUnit; events: SupplierClaimEvent[];
};
export type SupplierClaimCreditEvent = {
  id: string; claimId: string; supplierId: string; invoiceId: string; amountDeltaPaise: number;
  reference: string | null; note: string | null; reversesEventId: string | null; createdAt: string;
};
export type SupplierClaimReturnEvent = {
  id: string; claimId: string; quantity: number; stockQuantityDelta: number; note: string | null;
  createdAt: string;
};

export type SupplierOrderStatus = 'draft' | 'placed' | 'partially_received' | 'received' | 'cancelled';
export type SupplierOrderLineInput = {
  catalogueItemId: string;
  quantity: number;
  quotedUnitPricePaise: number | null;
};
export type SupplierOrderInput = {
  supplierId: string;
  expectedDate: string | null;
  note: string | null;
  lines: SupplierOrderLineInput[];
};
export type SupplierOrderLine = SupplierOrderLineInput & {
  position: number;
  name: string;
  packSize: string;
  unit: StockUnit;
  receivedQuantity: number;
  outstandingQuantity: number;
  excessQuantity: number;
};
export type SupplierOrder = Omit<SupplierOrderInput, 'lines'> & {
  id: string;
  supplier: string;
  createdAt: string;
  placedAt: string | null;
  businessDate: string;
  cancelledAt: string | null;
  status: SupplierOrderStatus;
  quotedTotalPaise: number | null;
  lines: SupplierOrderLine[];
};

export type CustomerCreditKind = 'credit_sale' | 'repayment_received' | 'sale_return' | 'write_off' | 'reversal';
export type CustomerCreditLineInput = {
  catalogueItemId: string;
  quantity: number;
  amountPaise: number;
};
export type CustomerCreditLine = CustomerCreditLineInput & {
  name: string;
  packSize: string;
  unit: StockUnit;
};
export type CustomerCreditInput = {
  customerId: string;
  kind: Exclude<CustomerCreditKind, 'reversal'>;
  amountPaise: number;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  sourceText: string | null;
  lines?: CustomerCreditLineInput[];
};

export type RetailSaleInput = {
  customerId: string | null;
  customerLabel: string;
  paymentState: 'unknown' | 'cash' | 'credit';
  amountPaise: number | null;
  sourceText: string;
  lines: { catalogueItemId: string; quantity: number }[];
};

export type HomeNoteBatchInput = {
  newCustomer?: NewCustomerInput & { id: string };
  receipt?: ReceiptInput | null;
  sale?: RetailSaleInput | null;
  credit?: {
    event: CustomerCreditInput;
    promise?: Omit<NewPromiseInput, 'customerId' | 'relatedEventId'>;
  } | null;
};

export type RetailSaleEvent = RetailSaleInput & { id: string; createdAt: string; businessDate: string };

export type CustomerCreditEvent = Omit<CustomerCreditInput, 'kind' | 'lines'> & {
  kind: CustomerCreditKind;
  id: string;
  amountDeltaPaise: number;
  createdAt: string;
  businessDate: string;
  reversesEventId: string | null;
  lines: CustomerCreditLine[];
};

export type PromiseToPay = {
  dateSource?: 'estimated' | 'owner' | null;
  replacesPromiseId?: string | null;
  id: string;
  customerId: string;
  amountPaise: number | null;
  dueDate: string | null;
  note: string | null;
  status: 'open' | 'kept' | 'missed' | 'cancelled' | 'disputed';
  createdAt: string;
  relatedEventId: string | null;
};

type DeliveryLineRow = DeliveryReconciliationLineInput & {
  eventId: string;
  createdAt: string;
  businessDate: string;
  supplier: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceEvidenceUrisJson: string;
  invoiceTotalPaise: number;
  amountPaidPaise: number | null;
  paymentMethod: PaymentMethod | null;
  reversedAt: string | null;
  payloadJson: string;
};

const DATABASE_NAME = 'dukaanflow.db';
const SCHEMA_VERSION = 17;
const businessDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const databases = new Map<string, Promise<{ reader: SQLiteDatabase; writer: SQLiteDatabase }>>();
let pendingWrite: Promise<void> = Promise.resolve();
let currentShopId = 'default';
let storeDirectory: string | undefined;

export function setStoreDirectory(directory: string | undefined) {
  storeDirectory = directory;
}

function validateShopId(shopId: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(shopId)) throw new Error('Invalid shop profile identifier.');
}

function databaseNameForShop(shopId: string) {
  validateShopId(shopId);
  return shopId === 'default' ? DATABASE_NAME : `dukaanflow-shop-${shopId}.db`;
}

function currentDatabaseName() {
  return databaseNameForShop(currentShopId);
}

export function newOperationId(): string {
  return randomUUID();
}

function catalogueKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function businessDate(instant: string) {
  const fields = businessDateFormat.formatToParts(new Date(instant));
  const values = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function transaction<T>(db: SQLiteDatabase, write: (db: SQLiteDatabase) => Promise<T>) {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await write(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    if (await db.isInTransactionAsync()) await db.execAsync('ROLLBACK');
    throw error;
  }
}

async function openDatabases(databaseName: string, directory: string | undefined) {
  // Separate handles keep history reads outside the serialized writer's open transactions.
  const writer = await openDatabaseAsync(databaseName, { useNewConnection: true }, directory);
  try {
    await writer.execAsync(`
      PRAGMA busy_timeout = 3000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
    `);
    await transaction(writer, migrate);
    const reader = await openDatabaseAsync(databaseName, { useNewConnection: true }, directory);
    return { reader, writer };
  } catch (error) {
    await writer.closeAsync();
    throw error;
  }
}

function getDatabases(databaseName = currentDatabaseName(), directory: string | null = storeDirectory ?? null) {
  const key = JSON.stringify([directory ?? null, databaseName]);
  let database = databases.get(key);
  if (!database) {
    database = openDatabases(databaseName, directory ?? undefined).catch((error: unknown) => {
      databases.delete(key);
      throw error;
    });
    databases.set(key, database);
  }
  return database;
}

function writeTransaction<T>(write: (db: SQLiteDatabase) => Promise<T>) {
  const databaseName = currentDatabaseName();
  const directory = storeDirectory ?? null;
  return enqueueStoreWrite(async () => {
    const { writer } = await getDatabases(databaseName, directory);
    return transaction(writer, write);
  });
}

function writeRegistryTransaction<T>(write: (db: SQLiteDatabase) => Promise<T>) {
  const directory = storeDirectory ?? null;
  return enqueueStoreWrite(async () => {
    const { writer } = await getDatabases(DATABASE_NAME, directory);
    return transaction(writer, write);
  });
}

function enqueueStoreWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(work);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

function canonicalSchema(rows: { type: string; name: string; sql: string | null }[]) {
  return JSON.stringify(rows.map((row) => ({
    ...row,
    sql: row.sql?.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|\s+/gu,
      (token) => /^\s+$/u.test(token) ? ' ' : token).trim() ?? null,
  })));
}

/** Check quarantined SQLite files against the supported schema and backup index. */
export async function inspectBackupDatabases(directory: string, manifest: BackupManifest): Promise<void> {
  const schemaSql = "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name";
  const template = await openDatabaseAsync(':memory:', { useNewConnection: true });
  let schema: string;
  try {
    await transaction(template, migrate);
    schema = canonicalSchema(await template.getAllAsync(schemaSql));
  } finally {
    await template.closeAsync();
  }

  const expectedShopIds = manifest.databases.flatMap(({ shopId }) => shopId ? [shopId] : []).sort();
  const referencedMedia = new Set<string>();
  for (const entry of manifest.databases) {
    if (!BACKUP_DATABASE_PATH.test(entry.path)) throw new Error('Invalid backup database path.');
    const filename = entry.path.slice('databases/'.length);
    const database = await openDatabaseAsync(filename, { useNewConnection: true }, directory);
    try {
      await database.execAsync('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON;');
      const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if (version?.user_version !== SCHEMA_VERSION || canonicalSchema(await database.getAllAsync(schemaSql)) !== schema) {
        throw new Error('The backup ledger schema is unsupported.');
      }
      const integrity = await database.getAllAsync<{ quick_check: string }>('PRAGMA quick_check');
      if (integrity.length !== 1 || integrity[0].quick_check !== 'ok' || (await database.getAllAsync('PRAGMA foreign_key_check')).length) {
        throw new Error('A backup database failed integrity checks.');
      }
      if (entry.shopId && !await database.getFirstAsync('SELECT id FROM shop_profile WHERE id = 1')) {
        throw new Error('A backup shop profile is missing.');
      }
      if (entry.registry) {
        const shops = await database.getAllAsync<{ id: string }>('SELECT id FROM shop_workspace ORDER BY id');
        const active = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_registry_preference WHERE key = 'active_shop_id'");
        if (JSON.stringify(shops.map(({ id }) => id).sort()) !== JSON.stringify(expectedShopIds)
          || (active && !expectedShopIds.includes(active.value) && !(active.value === 'default' && !expectedShopIds.length))) {
          throw new Error('The backup registry does not match its shop databases.');
        }
      }
      for (const path of managedAttachmentPaths(await attachmentReferences(database), 'file:///backup/')) {
        referencedMedia.add(`media/${path}`);
      }
    } finally {
      await database.closeAsync();
    }
  }
  const declaredMedia = new Set(manifest.media.map(({ path }) => path));
  if (declaredMedia.size !== referencedMedia.size || [...referencedMedia].some((path) => !declaredMedia.has(path))) {
    throw new Error('The backup is missing attachment metadata.');
  }
}

/** Copies the registry and every registered shop into a caller-owned local staging directory. */
export function snapshotShopDatabases(stagingDirectory: string) {
  return enqueueStoreWrite(async () => {
    if (!stagingDirectory.trim()) throw new Error('A staging directory is required.');
    const { writer: registry } = await getDatabases(DATABASE_NAME);
    const shops = await registry.getAllAsync<{ id: string }>('SELECT id FROM shop_workspace ORDER BY id');
    const shopIds = new Set(shops.map(({ id }) => id));
    const createdFiles: string[] = [];
    const snapshots: {
      filename: string; registry: boolean; shopId: string | null;
      attachments: Awaited<ReturnType<typeof attachmentReferences>>;
    }[] = [];
    try {
      for (const shopId of new Set(['default', ...shopIds])) {
        const { writer: source } = await getDatabases(databaseNameForShop(shopId));
        if (shopIds.has(shopId) && !await source.getFirstAsync('SELECT id FROM shop_profile WHERE id = 1')) {
          throw new Error('A registered shop profile is unavailable.');
        }
        const filename = `snapshot-${newOperationId()}.sqlite`;
        createdFiles.push(filename);
        const destination = await openDatabaseAsync(filename, { useNewConnection: true }, stagingDirectory);
        try {
          await backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
          await destination.execAsync('PRAGMA journal_mode = DELETE');
          const integrity = await destination.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
          if (integrity?.quick_check !== 'ok') throw new Error('A snapshot did not pass SQLite integrity checks.');
          snapshots.push({
            filename, registry: shopId === 'default', shopId: shopIds.has(shopId) ? shopId : null,
            attachments: await attachmentReferences(destination),
          });
        } finally {
          await destination.closeAsync();
        }
      }
      return snapshots;
    } catch (error) {
      await Promise.allSettled(createdFiles.map((filename) => deleteDatabaseAsync(filename, stagingDirectory)));
      throw error;
    }
  });
}

async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version === SCHEMA_VERSION) return;
  if (version < 0 || version > SCHEMA_VERSION) throw new Error('This device has a newer ledger version.');

  if (version === 0) {
    await db.execAsync(`
    CREATE TABLE shop_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
      setup_complete INTEGER NOT NULL CHECK (setup_complete IN (0, 1))
    );

    CREATE TABLE active_workspace (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode TEXT NOT NULL CHECK (mode IN ('demo', 'live'))
    );

    CREATE TABLE catalogue_item (
      mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      pack_size TEXT NOT NULL,
      variant_key TEXT NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box')),
      aliases_json TEXT NOT NULL,
      PRIMARY KEY (mode, id),
      UNIQUE (mode, variant_key, unit)
    );

    CREATE TABLE ledger_entry (
      mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
      id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('receipt', 'reversal')),
      created_at TEXT NOT NULL,
      business_date TEXT NOT NULL,
      supplier TEXT,
      receipt_total_paise INTEGER CHECK (
        receipt_total_paise IS NULL OR (
          typeof(receipt_total_paise) = 'integer' AND receipt_total_paise BETWEEN 0 AND ${MAX_MONEY_PAISE}
        )
      ),
      amount_paid_paise INTEGER CHECK (
        amount_paid_paise IS NULL OR (
          typeof(amount_paid_paise) = 'integer' AND amount_paid_paise BETWEEN 0 AND ${MAX_MONEY_PAISE}
        )
      ),
      payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
      reverses_id TEXT,
      PRIMARY KEY (mode, id),
      UNIQUE (mode, reverses_id),
      FOREIGN KEY (mode, reverses_id) REFERENCES ledger_entry (mode, id),
      CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL))
    );

    CREATE TABLE stock_movement (
      mode TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      catalogue_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      pack_size TEXT NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box')),
      quantity_delta INTEGER NOT NULL CHECK (
        typeof(quantity_delta) = 'integer' AND
        quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}
      ),
      PRIMARY KEY (mode, entry_id, position),
      FOREIGN KEY (mode, entry_id) REFERENCES ledger_entry (mode, id),
      FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
    );

    CREATE INDEX ledger_history ON ledger_entry (mode, kind, created_at DESC);
    CREATE INDEX ledger_business_date ON ledger_entry (mode, business_date);
    CREATE INDEX movement_by_item ON stock_movement (mode, catalogue_item_id);
    `);

    await db.execAsync('PRAGMA user_version = 1');
    version = 1;
  }
  if (version === 1) {
    await db.execAsync(`
      CREATE TABLE delivery_event (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        supplier TEXT NOT NULL,
        supplier_key TEXT NOT NULL,
        invoice_number TEXT,
        invoice_date TEXT,
        invoice_evidence_uris_json TEXT NOT NULL,
        invoice_total_paise INTEGER NOT NULL CHECK (
          typeof(invoice_total_paise) = 'integer' AND invoice_total_paise BETWEEN 0 AND ${MAX_MONEY_PAISE}
        ),
        amount_paid_paise INTEGER CHECK (
          amount_paid_paise IS NULL OR (typeof(amount_paid_paise) = 'integer' AND amount_paid_paise BETWEEN 0 AND ${MAX_MONEY_PAISE})
        ),
        payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id)
      );

      CREATE TABLE delivery_line (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        line_id TEXT NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box')),
        billed_quantity INTEGER NOT NULL CHECK (typeof(billed_quantity) = 'integer' AND billed_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        good_quantity INTEGER NOT NULL CHECK (typeof(good_quantity) = 'integer' AND good_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        damaged_quantity INTEGER NOT NULL CHECK (typeof(damaged_quantity) = 'integer' AND damaged_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        missing_quantity INTEGER NOT NULL CHECK (typeof(missing_quantity) = 'integer' AND missing_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        extra_quantity INTEGER NOT NULL CHECK (typeof(extra_quantity) = 'integer' AND extra_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        accepted_extra_quantity INTEGER NOT NULL CHECK (typeof(accepted_extra_quantity) = 'integer' AND accepted_extra_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        UNIQUE (mode, event_id, line_id),
        CHECK (billed_quantity = good_quantity + damaged_quantity + missing_quantity),
        CHECK (accepted_extra_quantity <= extra_quantity),
        FOREIGN KEY (mode, event_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );

      CREATE TABLE delivery_stock_movement (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box')),
        quantity_delta INTEGER NOT NULL CHECK (
          typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}
        ),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );

      CREATE TABLE delivery_discrepancy (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        line_position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('damaged', 'missing', 'extra')),
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        status TEXT NOT NULL CHECK (status IN ('pending', 'voided')),
        PRIMARY KEY (mode, event_id, line_position, kind),
        FOREIGN KEY (mode, event_id, line_position) REFERENCES delivery_line (mode, event_id, position)
      );

      CREATE TABLE supplier_balance_entry (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        supplier_key TEXT NOT NULL,
        supplier TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('invoice', 'payment', 'reversal')),
        amount_delta_paise INTEGER NOT NULL CHECK (
          typeof(amount_delta_paise) = 'integer' AND amount_delta_paise BETWEEN -${MAX_MONEY_PAISE} AND ${MAX_MONEY_PAISE}
        ),
        payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
        reverses_entry_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, reverses_entry_id),
        FOREIGN KEY (mode, event_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, reverses_entry_id) REFERENCES supplier_balance_entry (mode, id)
      );

      CREATE TABLE delivery_reversal (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        reverses_event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES delivery_event (mode, id)
      );

      CREATE TABLE delivery_reversal_stock_movement (
        mode TEXT NOT NULL,
        reversal_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box')),
        quantity_delta INTEGER NOT NULL CHECK (
          typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}
        ),
        PRIMARY KEY (mode, reversal_id, position),
        FOREIGN KEY (mode, reversal_id) REFERENCES delivery_reversal (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );

      CREATE INDEX delivery_by_supplier ON delivery_event (mode, supplier_key, created_at DESC);
      CREATE INDEX delivery_balance_by_supplier ON supplier_balance_entry (mode, supplier_key, created_at DESC);
      CREATE INDEX delivery_stock_by_item ON delivery_stock_movement (mode, catalogue_item_id);
      CREATE INDEX delivery_reversal_stock_by_item ON delivery_reversal_stock_movement (mode, catalogue_item_id);
      PRAGMA user_version = 2;
    `);
    version = 2;
  }
  if (version === 2) {
    await db.execAsync(`
      CREATE TABLE app_preference (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      INSERT INTO app_preference (key, value) VALUES ('wispr_setup_step', 'not-started');
      PRAGMA user_version = 3;
    `);
    version = 3;
  }
  if (version === 3) {
    await db.execAsync(`
      CREATE TABLE shop_workspace (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
        setup_complete INTEGER NOT NULL CHECK (setup_complete IN (0, 1)),
        created_at TEXT NOT NULL
      );
      CREATE TABLE app_registry_preference (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      INSERT INTO shop_workspace (id, name, language, setup_complete, created_at)
        SELECT 'default', name, language, setup_complete, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM shop_profile WHERE id = 1 AND setup_complete = 1;
      INSERT INTO app_registry_preference (key, value) VALUES ('active_shop_id', 'default');
      INSERT INTO app_registry_preference (key, value)
        SELECT key, value FROM app_preference WHERE key = 'wispr_setup_step';
      PRAGMA user_version = 4;
    `);
    version = 4;
  }
  if (version === 4) {
    await db.execAsync(`
      CREATE TEMP TABLE _v4_catalogue AS SELECT * FROM catalogue_item;
      CREATE TEMP TABLE _v4_stock_movement AS SELECT * FROM stock_movement;
      CREATE TEMP TABLE _v4_delivery_line AS SELECT * FROM delivery_line;
      CREATE TEMP TABLE _v4_delivery_discrepancy AS SELECT * FROM delivery_discrepancy;
      CREATE TEMP TABLE _v4_delivery_stock AS SELECT * FROM delivery_stock_movement;
      CREATE TEMP TABLE _v4_delivery_reversal_stock AS SELECT * FROM delivery_reversal_stock_movement;

      DROP TABLE delivery_discrepancy;
      DROP TABLE delivery_line;
      DROP TABLE stock_movement;
      DROP TABLE delivery_stock_movement;
      DROP TABLE delivery_reversal_stock_movement;
      DROP TABLE catalogue_item;

      CREATE TABLE catalogue_item (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        variant_key TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        aliases_json TEXT NOT NULL,
        image_uri TEXT,
        barcode TEXT,
        brand TEXT,
        package_content TEXT,
        catalogue_source TEXT,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, variant_key, unit)
      );
      CREATE TABLE stock_movement (
        mode TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, entry_id, position),
        FOREIGN KEY (mode, entry_id) REFERENCES ledger_entry (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE delivery_line (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        line_id TEXT NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        billed_quantity INTEGER NOT NULL CHECK (typeof(billed_quantity) = 'integer' AND billed_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        good_quantity INTEGER NOT NULL CHECK (typeof(good_quantity) = 'integer' AND good_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        damaged_quantity INTEGER NOT NULL CHECK (typeof(damaged_quantity) = 'integer' AND damaged_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        missing_quantity INTEGER NOT NULL CHECK (typeof(missing_quantity) = 'integer' AND missing_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        extra_quantity INTEGER NOT NULL CHECK (typeof(extra_quantity) = 'integer' AND extra_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        accepted_extra_quantity INTEGER NOT NULL CHECK (typeof(accepted_extra_quantity) = 'integer' AND accepted_extra_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        UNIQUE (mode, event_id, line_id),
        CHECK (billed_quantity = good_quantity + damaged_quantity + missing_quantity),
        CHECK (accepted_extra_quantity <= extra_quantity),
        FOREIGN KEY (mode, event_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE delivery_discrepancy (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        line_position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('damaged', 'missing', 'extra')),
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        status TEXT NOT NULL CHECK (status IN ('pending', 'voided')),
        PRIMARY KEY (mode, event_id, line_position, kind),
        FOREIGN KEY (mode, event_id, line_position) REFERENCES delivery_line (mode, event_id, position)
      );
      CREATE TABLE delivery_stock_movement (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE delivery_reversal_stock_movement (
        mode TEXT NOT NULL,
        reversal_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, reversal_id, position),
        FOREIGN KEY (mode, reversal_id) REFERENCES delivery_reversal (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );

      INSERT INTO catalogue_item (mode, id, name, pack_size, variant_key, unit, aliases_json)
        SELECT mode, id, name, pack_size, variant_key, unit, aliases_json FROM _v4_catalogue;
      INSERT INTO stock_movement SELECT * FROM _v4_stock_movement;
      INSERT INTO delivery_line SELECT * FROM _v4_delivery_line;
      INSERT INTO delivery_discrepancy SELECT * FROM _v4_delivery_discrepancy;
      INSERT INTO delivery_stock_movement SELECT * FROM _v4_delivery_stock;
      INSERT INTO delivery_reversal_stock_movement SELECT * FROM _v4_delivery_reversal_stock;

      DROP TABLE _v4_catalogue;
      DROP TABLE _v4_stock_movement;
      DROP TABLE _v4_delivery_line;
      DROP TABLE _v4_delivery_discrepancy;
      DROP TABLE _v4_delivery_stock;
      DROP TABLE _v4_delivery_reversal_stock;

      CREATE INDEX movement_by_item ON stock_movement (mode, catalogue_item_id);
      CREATE INDEX delivery_stock_by_item ON delivery_stock_movement (mode, catalogue_item_id);
      CREATE INDEX delivery_reversal_stock_by_item ON delivery_reversal_stock_movement (mode, catalogue_item_id);
      CREATE TABLE stock_adjustment (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE INDEX stock_adjustment_by_item ON stock_adjustment (mode, catalogue_item_id, created_at DESC);
      PRAGMA user_version = 5;
    `);
    for (const item of DEMO_CATALOG) {
      await insertCatalogItem(db, 'demo', item);
    }
    version = 5;
  }
  if (version === 5) {
    await db.execAsync(`
      CREATE TABLE customer (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT,
        PRIMARY KEY (mode, id)
      );

      CREATE TABLE customer_alias (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
        alias_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, customer_id, alias_key),
        FOREIGN KEY (mode, customer_id) REFERENCES customer (mode, id)
      );

      CREATE TABLE customer_credit_event (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('credit_sale', 'repayment_received', 'sale_return', 'write_off', 'reversal')),
        amount_delta_paise INTEGER NOT NULL CHECK (
          typeof(amount_delta_paise) = 'integer' AND
          amount_delta_paise BETWEEN -${MAX_MONEY_PAISE} AND ${MAX_MONEY_PAISE} AND amount_delta_paise != 0
        ),
        payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
        note TEXT,
        source_text TEXT,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        reverses_event_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        CHECK (
          (kind = 'credit_sale' AND amount_delta_paise > 0) OR
          (kind IN ('repayment_received', 'sale_return', 'write_off') AND amount_delta_paise < 0) OR
          kind = 'reversal'
        ),
        CHECK ((kind = 'reversal') = (reverses_event_id IS NOT NULL)),
        FOREIGN KEY (mode, customer_id) REFERENCES customer (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES customer_credit_event (mode, id)
      );

      CREATE TABLE promise_to_pay (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        related_event_id TEXT,
        amount_paise INTEGER CHECK (
          amount_paise IS NULL OR (typeof(amount_paise) = 'integer' AND amount_paise BETWEEN 1 AND ${MAX_MONEY_PAISE})
        ),
        due_date TEXT,
        note TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'kept', 'missed', 'cancelled', 'disputed')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        FOREIGN KEY (mode, customer_id) REFERENCES customer (mode, id),
        FOREIGN KEY (mode, related_event_id) REFERENCES customer_credit_event (mode, id)
      );

      CREATE INDEX customer_by_name ON customer (mode, normalized_name);
      CREATE INDEX customer_alias_by_key ON customer_alias (mode, alias_key);
      CREATE INDEX customer_credit_by_customer ON customer_credit_event (mode, customer_id, created_at DESC);
      CREATE INDEX promise_by_due_date ON promise_to_pay (mode, status, due_date, created_at DESC);
      PRAGMA user_version = 6;
    `);
    version = 6;
  }
  if (version === 6) {
    await db.execAsync(`
      CREATE TABLE supplier_profile (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, normalized_name)
      );

      CREATE TABLE supplier_alias (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
        alias_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, alias_key),
        FOREIGN KEY (mode, supplier_id) REFERENCES supplier_profile (mode, id)
      );

      CREATE TABLE supplier_payment_event (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('payment', 'reversal')),
        amount_delta_paise INTEGER NOT NULL CHECK (
          typeof(amount_delta_paise) = 'integer' AND
          amount_delta_paise BETWEEN -${MAX_MONEY_PAISE} AND ${MAX_MONEY_PAISE} AND amount_delta_paise != 0
        ),
        payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
        note TEXT,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        reverses_event_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        CHECK ((kind = 'payment' AND amount_delta_paise < 0) OR (kind = 'reversal' AND amount_delta_paise > 0)),
        CHECK ((kind = 'reversal') = (reverses_event_id IS NOT NULL)),
        FOREIGN KEY (mode, supplier_id) REFERENCES supplier_profile (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES supplier_payment_event (mode, id)
      );

      CREATE INDEX supplier_by_name ON supplier_profile (mode, normalized_name);
      CREATE INDEX supplier_alias_by_key ON supplier_alias (mode, alias_key);
      CREATE INDEX supplier_payment_by_profile ON supplier_payment_event (mode, supplier_id, created_at DESC);
      PRAGMA user_version = 7;
    `);
    const legacySuppliers = await db.getAllAsync<{
      mode: ShopMode; supplierKey: string; supplier: string; createdAt: string;
    }>(`SELECT mode, supplier_key AS supplierKey, supplier, MIN(created_at) AS createdAt
        FROM delivery_event GROUP BY mode, supplier_key, supplier ORDER BY createdAt, supplier`);
    for (const row of legacySuppliers) {
      const name = row.supplier.normalize('NFKC').trim().replace(/\s+/gu, ' ');
      const normalizedName = catalogueKey(name);
      await db.runAsync(
        `INSERT OR IGNORE INTO supplier_profile (mode, id, display_name, normalized_name, created_at)
         VALUES (?, ?, ?, ?, ?)`, row.mode, row.supplierKey, name, row.supplierKey, row.createdAt,
      );
      if (normalizedName !== row.supplierKey) {
        await db.runAsync(
          `INSERT OR IGNORE INTO supplier_alias (mode, id, supplier_id, alias, alias_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`, row.mode, newOperationId(), row.supplierKey, name, normalizedName, row.createdAt,
        );
      }
    }
    version = 7;
  }
  if (version === 7) {
    await db.execAsync(`
      CREATE TABLE customer_credit_line (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        amount_paise INTEGER NOT NULL CHECK (typeof(amount_paise) = 'integer' AND amount_paise BETWEEN 1 AND ${MAX_MONEY_PAISE}),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id) REFERENCES customer_credit_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE customer_credit_stock_movement (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta != 0 AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id, position) REFERENCES customer_credit_line (mode, event_id, position),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE INDEX customer_credit_line_by_item ON customer_credit_line (mode, catalogue_item_id);
      CREATE INDEX customer_credit_stock_by_item ON customer_credit_stock_movement (mode, catalogue_item_id);
      PRAGMA user_version = 8;
    `);
    version = 8;
  }
  if (version === 8) {
    await db.execAsync(`
      CREATE TABLE stock_reorder_point (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        catalogue_item_id TEXT NOT NULL,
        minimum_quantity INTEGER NOT NULL CHECK (typeof(minimum_quantity) = 'integer' AND minimum_quantity BETWEEN 0 AND ${MAX_QUANTITY}),
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (mode, catalogue_item_id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE restock_draft_line (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        catalogue_item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (mode, catalogue_item_id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      PRAGMA user_version = 9;
    `);
    version = 9;
  }
  if (version === 9) {
    await db.execAsync(`
      CREATE TABLE supplier_order (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'placed', 'partially_received', 'received', 'cancelled')),
        created_at TEXT NOT NULL,
        placed_at TEXT,
        place_operation_id TEXT,
        business_date TEXT NOT NULL,
        expected_date TEXT,
        note TEXT,
        cancelled_at TEXT,
        cancel_operation_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, place_operation_id),
        UNIQUE (mode, cancel_operation_id),
        FOREIGN KEY (mode, supplier_id) REFERENCES supplier_profile (mode, id)
      );
      CREATE TABLE supplier_order_line (
        mode TEXT NOT NULL,
        order_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        ordered_quantity INTEGER NOT NULL CHECK (typeof(ordered_quantity) = 'integer' AND ordered_quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        quoted_unit_price_paise INTEGER CHECK (quoted_unit_price_paise IS NULL OR (typeof(quoted_unit_price_paise) = 'integer' AND quoted_unit_price_paise BETWEEN 0 AND ${MAX_MONEY_PAISE})),
        PRIMARY KEY (mode, order_id, position),
        UNIQUE (mode, order_id, catalogue_item_id),
        FOREIGN KEY (mode, order_id) REFERENCES supplier_order (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE supplier_order_delivery_link (
        mode TEXT NOT NULL,
        order_id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        linked_at TEXT NOT NULL,
        PRIMARY KEY (mode, delivery_id),
        UNIQUE (mode, operation_id),
        FOREIGN KEY (mode, order_id) REFERENCES supplier_order (mode, id),
        FOREIGN KEY (mode, delivery_id) REFERENCES delivery_event (mode, id)
      );
      CREATE TABLE supplier_order_delivery_line (
        mode TEXT NOT NULL,
        order_id TEXT NOT NULL,
        order_line_position INTEGER NOT NULL,
        delivery_id TEXT NOT NULL,
        delivery_line_position INTEGER NOT NULL,
        PRIMARY KEY (mode, delivery_id, delivery_line_position),
        UNIQUE (mode, delivery_id, order_line_position),
        FOREIGN KEY (mode, order_id, order_line_position) REFERENCES supplier_order_line (mode, order_id, position),
        FOREIGN KEY (mode, delivery_id, delivery_line_position) REFERENCES delivery_line (mode, event_id, position)
      );
      CREATE INDEX supplier_order_by_supplier ON supplier_order (mode, supplier_id, placed_at DESC);
      CREATE INDEX supplier_order_line_by_item ON supplier_order_line (mode, catalogue_item_id);
      CREATE INDEX supplier_order_delivery_by_order ON supplier_order_delivery_link (mode, order_id, linked_at DESC);
      PRAGMA user_version = 10;
    `);
    version = 10;
  }
  if (version === 10) {
    await db.execAsync(`
      ALTER TABLE delivery_event ADD COLUMN due_date TEXT;
      CREATE TABLE supplier_payment_allocation (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        payment_event_id TEXT NOT NULL,
        invoice_delivery_id TEXT NOT NULL,
        amount_delta_paise INTEGER NOT NULL CHECK (
          typeof(amount_delta_paise) = 'integer' AND
          amount_delta_paise BETWEEN -${MAX_MONEY_PAISE} AND ${MAX_MONEY_PAISE} AND amount_delta_paise != 0
        ),
        PRIMARY KEY (mode, payment_event_id, invoice_delivery_id),
        FOREIGN KEY (mode, payment_event_id) REFERENCES supplier_payment_event (mode, id),
        FOREIGN KEY (mode, invoice_delivery_id) REFERENCES delivery_event (mode, id)
      );
      CREATE INDEX supplier_payment_allocation_by_invoice
        ON supplier_payment_allocation (mode, invoice_delivery_id);
      PRAGMA user_version = 11;
    `);
    version = 11;
  }
  if (version === 11) {
    await db.execAsync(`
      CREATE TABLE supplier_claim (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        line_position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('damaged', 'missing', 'extra', 'return')),
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        note TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'credit_promised', 'replacement_promised', 'disputed', 'resolved_credit_note', 'resolved_replacement', 'closed', 'voided')),
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        FOREIGN KEY (mode, supplier_id) REFERENCES supplier_profile (mode, id),
        FOREIGN KEY (mode, delivery_id, line_position) REFERENCES delivery_line (mode, event_id, position)
      );
      CREATE TABLE supplier_claim_event (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('opened', 'credit_promised', 'replacement_promised', 'rejected', 'return_handed_over', 'return_reversed', 'replacement_received', 'replacement_reversed', 'credit_note_confirmed', 'credit_note_reversed', 'closed', 'reopened', 'voided')),
        quantity INTEGER,
        amount_delta_paise INTEGER,
        reference TEXT,
        note TEXT,
        related_delivery_id TEXT,
        related_delivery_line_id TEXT,
        reverses_event_id TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, claim_id) REFERENCES supplier_claim (mode, id),
        FOREIGN KEY (mode, related_delivery_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES supplier_claim_event (mode, id)
      );
      CREATE TABLE supplier_claim_credit_entry (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('credit_note', 'reversal')),
        amount_delta_paise INTEGER NOT NULL CHECK (typeof(amount_delta_paise) = 'integer' AND amount_delta_paise BETWEEN -${MAX_MONEY_PAISE} AND ${MAX_MONEY_PAISE} AND amount_delta_paise != 0),
        reference TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        reverses_event_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, claim_id) REFERENCES supplier_claim (mode, id),
        FOREIGN KEY (mode, supplier_id) REFERENCES supplier_profile (mode, id),
        FOREIGN KEY (mode, invoice_id) REFERENCES delivery_event (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES supplier_claim_credit_entry (mode, id),
        CHECK ((kind = 'reversal') = (reverses_event_id IS NOT NULL))
      );
      CREATE TABLE supplier_claim_stock_movement (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        line_position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY} AND quantity_delta != 0),
        kind TEXT NOT NULL CHECK (kind IN ('return', 'reversal')),
        created_at TEXT NOT NULL,
        reverses_event_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, claim_id) REFERENCES supplier_claim (mode, id),
        FOREIGN KEY (mode, delivery_id, line_position) REFERENCES delivery_line (mode, event_id, position),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES supplier_claim_stock_movement (mode, id),
        CHECK ((kind = 'reversal') = (reverses_event_id IS NOT NULL))
      );
      CREATE INDEX supplier_claim_by_delivery ON supplier_claim (mode, delivery_id, line_position);
      CREATE INDEX supplier_claim_events_by_claim ON supplier_claim_event (mode, claim_id, created_at, id);
      CREATE INDEX supplier_claim_credit_by_invoice ON supplier_claim_credit_entry (mode, invoice_id, created_at);
      CREATE INDEX supplier_claim_stock_by_item ON supplier_claim_stock_movement (mode, catalogue_item_id);
      PRAGMA user_version = 12;
    `);
    version = 12;
  }
  if (version === 12) {
    await db.execAsync(`
      CREATE TABLE delivery_lot_observation (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        line_position INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        batch_code TEXT,
        expiry_date TEXT,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        FOREIGN KEY (mode, delivery_id, line_position) REFERENCES delivery_line (mode, event_id, position)
      );
      CREATE TABLE delivery_lot_stock_movement (
        mode TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta BETWEEN -${MAX_QUANTITY} AND ${MAX_QUANTITY} AND quantity_delta != 0),
        kind TEXT NOT NULL CHECK (kind IN ('rejection', 'reversal')),
        created_at TEXT NOT NULL,
        reverses_event_id TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, lot_id) REFERENCES delivery_lot_observation (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES delivery_lot_stock_movement (mode, id),
        CHECK ((kind = 'reversal') = (reverses_event_id IS NOT NULL)),
        CHECK ((kind = 'rejection' AND quantity_delta < 0) OR (kind = 'reversal' AND quantity_delta > 0))
      );
      CREATE INDEX delivery_lot_by_delivery ON delivery_lot_observation (mode, delivery_id, line_position);
      CREATE INDEX delivery_lot_by_expiry ON delivery_lot_observation (mode, expiry_date, delivery_id);
      CREATE INDEX delivery_lot_stock_by_lot ON delivery_lot_stock_movement (mode, lot_id);
      PRAGMA user_version = 13;
    `);
    version = 13;
  }
  if (version === 13) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(catalogue_item)');
    const existingColumns = new Set(columns.map((column) => column.name));
    if (!existingColumns.has('barcode')) await db.execAsync('ALTER TABLE catalogue_item ADD COLUMN barcode TEXT');
    if (!existingColumns.has('brand')) await db.execAsync('ALTER TABLE catalogue_item ADD COLUMN brand TEXT');
    if (!existingColumns.has('package_content')) await db.execAsync('ALTER TABLE catalogue_item ADD COLUMN package_content TEXT');
    if (!existingColumns.has('catalogue_source')) await db.execAsync('ALTER TABLE catalogue_item ADD COLUMN catalogue_source TEXT');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS catalogue_item_barcode ON catalogue_item (mode, barcode) WHERE barcode IS NOT NULL;
      PRAGMA user_version = 14;
    `);
    version = 14;
  }
  if (version === 14) {
    await db.execAsync(`
      CREATE TABLE retail_sale_event (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        customer_id TEXT,
        customer_label TEXT NOT NULL,
        payment_state TEXT NOT NULL CHECK (payment_state IN ('unknown', 'cash', 'credit')),
        amount_paise INTEGER CHECK (amount_paise IS NULL OR (typeof(amount_paise) = 'integer' AND amount_paise > 0 AND amount_paise <= ${MAX_MONEY_PAISE})),
        source_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, operation_id),
        FOREIGN KEY (mode, customer_id) REFERENCES customer (mode, id)
      );
      CREATE TABLE retail_sale_line (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('packet', 'piece', 'bottle', 'box', 'kg', 'quintal')),
        quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND ${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id) REFERENCES retail_sale_event (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE TABLE retail_sale_stock_movement (
        mode TEXT NOT NULL,
        event_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta < 0 AND quantity_delta >= -${MAX_QUANTITY}),
        PRIMARY KEY (mode, event_id, position),
        FOREIGN KEY (mode, event_id, position) REFERENCES retail_sale_line (mode, event_id, position),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      CREATE INDEX retail_sale_by_customer ON retail_sale_event (mode, customer_id, created_at DESC);
      CREATE INDEX retail_sale_by_item ON retail_sale_line (mode, catalogue_item_id);
      CREATE INDEX retail_sale_stock_by_item ON retail_sale_stock_movement (mode, catalogue_item_id);
      PRAGMA user_version = 15;
    `);
    version = 15;
  }
  if (version === 15) {
    await db.execAsync(`
      CREATE TABLE retail_sale_reversal (
        mode TEXT NOT NULL,
        id TEXT NOT NULL,
        reverses_event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, id),
        UNIQUE (mode, reverses_event_id),
        FOREIGN KEY (mode, reverses_event_id) REFERENCES retail_sale_event (mode, id)
      );
      CREATE TABLE retail_sale_reversal_stock_movement (
        mode TEXT NOT NULL,
        reversal_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        catalogue_item_id TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL CHECK (typeof(quantity_delta) = 'integer' AND quantity_delta > 0 AND quantity_delta <= ${MAX_QUANTITY}),
        PRIMARY KEY (mode, reversal_id, position),
        FOREIGN KEY (mode, reversal_id) REFERENCES retail_sale_reversal (mode, id),
        FOREIGN KEY (mode, catalogue_item_id) REFERENCES catalogue_item (mode, id)
      );
      PRAGMA user_version = 16;
    `);
    version = 16;
  }
  if (version === 16) {
    await db.execAsync(`
      ALTER TABLE ledger_entry ADD COLUMN voice_note TEXT;
      PRAGMA user_version = 17;
    `);
    version = 17;
  }
  if (version !== SCHEMA_VERSION) throw new Error('This device has a newer ledger version.');
}

export async function readWisprSetupStep(): Promise<WisprSetupStep> {
  const { reader } = await getDatabases(DATABASE_NAME);
  const row = await reader.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_registry_preference WHERE key = 'wispr_setup_step'",
  );
  const valid: WisprSetupStep[] = ['not-started', 'account', 'keyboard', 'dictation', 'ready', 'later'];
  return valid.includes(row?.value as WisprSetupStep) ? row!.value as WisprSetupStep : 'not-started';
}

export async function writeWisprSetupStep(step: WisprSetupStep): Promise<void> {
  await writeRegistryTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO app_registry_preference (key, value) VALUES ('wispr_setup_step', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      step,
    );
  });
}

export async function readShopProfile(): Promise<ShopProfile | null> {
  return readProfileForShop(currentShopId);
}

export async function readOpeningStockPending(): Promise<boolean> {
  const { reader } = await getDatabases();
  const row = await reader.getFirstAsync<{ value: string }>("SELECT value FROM app_preference WHERE key = 'opening_stock_pending'");
  return row?.value === 'yes';
}

export function writeOpeningStockPending(pending: boolean): Promise<void> {
  return writeTransaction(async (db) => {
    await db.runAsync(
      "INSERT INTO app_preference (key, value) VALUES ('opening_stock_pending', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      pending ? 'yes' : 'no',
    );
  });
}

async function readProfileForShop(shopId: string): Promise<ShopProfile | null> {
  const { reader } = await getDatabases(databaseNameForShop(shopId));
  const row = await reader.getFirstAsync<{ name: string; language: ShopLanguage; setupComplete: number }>(
    'SELECT name, language, setup_complete AS setupComplete FROM shop_profile WHERE id = 1',
  );
  return row ? { id: shopId, ...row, setupComplete: row.setupComplete === 1 } : null;
}

export async function writeShopProfile(profile: ShopProfile): Promise<void> {
  const name = profile.name.trim();
  if (name.length > 100) throw new Error('Shop names must be 100 characters or fewer.');
  if (profile.id !== currentShopId) throw new Error('The active shop changed. Reopen its profile and try again.');
  await writeTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO shop_profile (id, name, language, setup_complete) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, language = excluded.language, setup_complete = excluded.setup_complete`,
      name,
      profile.language,
      profile.setupComplete ? 1 : 0,
    );
  });
  await writeRegistryTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO shop_workspace (id, name, language, setup_complete, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, language = excluded.language, setup_complete = excluded.setup_complete`,
      profile.id,
      name,
      profile.language,
      profile.setupComplete ? 1 : 0,
      new Date().toISOString(),
    );
    await db.runAsync(
      `INSERT INTO app_registry_preference (key, value) VALUES ('active_shop_id', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`, profile.id,
    );
  });
}

export async function listShopProfiles(): Promise<ShopProfile[]> {
  const { reader } = await getDatabases(DATABASE_NAME);
  const rows = await reader.getAllAsync<{ id: string; name: string; language: ShopLanguage; setupComplete: number }>(
    `SELECT id, name, language, setup_complete AS setupComplete
     FROM shop_workspace ORDER BY created_at, name COLLATE NOCASE`,
  );
  return rows.map((row) => ({ ...row, setupComplete: row.setupComplete === 1 }));
}

export async function readActiveShopId(): Promise<string> {
  const { reader } = await getDatabases(DATABASE_NAME);
  const row = await reader.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_registry_preference WHERE key = 'active_shop_id'",
  );
  return row?.value ?? 'default';
}

export function setCurrentShopId(shopId: string) {
  validateShopId(shopId);
  currentShopId = shopId;
}

export async function selectShopProfile(shopId: string): Promise<ShopProfile> {
  validateShopId(shopId);
  const { reader } = await getDatabases(DATABASE_NAME);
  const registered = await reader.getFirstAsync<{ id: string }>(
    'SELECT id FROM shop_workspace WHERE id = ?', shopId,
  );
  if (!registered) throw new Error('This shop profile is no longer available.');
  const profile = await readProfileForShop(shopId);
  if (!profile) throw new Error('Could not open this shop profile.');
  await writeRegistryTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO app_registry_preference (key, value) VALUES ('active_shop_id', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`, shopId,
    );
  });
  setCurrentShopId(shopId);
  return profile;
}

export async function createShopProfile(name = '', language: ShopLanguage = 'en'): Promise<ShopProfile> {
  const existing = await listShopProfiles();
  const previousId = currentShopId;
  const id = existing.length === 0 ? 'default' : randomUUID();
  setCurrentShopId(id);
  const profile: ShopProfile = { id, name: name.trim(), language, setupComplete: false };
  try {
    await writeShopProfile(profile);
  } catch (error) {
    setCurrentShopId(previousId);
    throw error;
  }
  return profile;
}

export async function readMode(): Promise<ShopMode | null> {
  const { reader } = await getDatabases();
  const row = await reader.getFirstAsync<{ mode: ShopMode }>(
    'SELECT mode FROM active_workspace WHERE id = 1',
  );
  return row?.mode ?? null;
}

export async function readShopMode(shopId: string): Promise<ShopMode | null> {
  const { reader } = await getDatabases(databaseNameForShop(shopId));
  const row = await reader.getFirstAsync<{ mode: ShopMode }>(
    'SELECT mode FROM active_workspace WHERE id = 1',
  );
  return row?.mode ?? null;
}

export async function writeMode(mode: ShopMode): Promise<void> {
  await writeTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO active_workspace (id, mode) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET mode = excluded.mode`,
      mode,
    );
  });
}

export async function listCatalog(mode: ShopMode): Promise<CatalogItem[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<CatalogRow>(
    `SELECT id, name, pack_size AS packSize, unit, aliases_json AS aliasesJson, image_uri AS imageUri,
            barcode, brand, package_content AS packageContent, catalogue_source AS catalogueSource
     FROM catalogue_item WHERE mode = ? ORDER BY name COLLATE NOCASE, pack_size, id`,
    mode,
  );
  return rows.map(({ aliasesJson, ...item }) => ({
    ...item,
    aliases: JSON.parse(aliasesJson) as string[],
  }));
}

/** Read attachment references for recovery checks without changing the active shop. */
export async function readShopAttachmentReferences(shopId: string): Promise<{ invoices: unknown[]; products: string[] }> {
  if (!await readProfileForShop(shopId)) throw new Error('Could not open this shop profile.');
  const { reader } = await getDatabases(databaseNameForShop(shopId));
  return attachmentReferences(reader);
}

async function attachmentReferences(reader: SQLiteDatabase): Promise<{ invoices: unknown[]; products: string[] }> {
  const [invoices, products] = await Promise.all([
    reader.getAllAsync<{ evidence: string }>('SELECT invoice_evidence_uris_json AS evidence FROM delivery_event'),
    reader.getAllAsync<{ imageUri: string }>('SELECT image_uri AS imageUri FROM catalogue_item WHERE image_uri IS NOT NULL'),
  ]);
  return {
    invoices: invoices.flatMap(({ evidence }) => {
      try {
        const pages: unknown = JSON.parse(evidence);
        return Array.isArray(pages) ? pages : [null];
      } catch {
        return [null];
      }
    }),
    products: products.map(({ imageUri }) => imageUri),
  };
}

export type StockLevel = { catalogueItemId: string; quantity: number };

export async function listStockLevels(mode: ShopMode): Promise<StockLevel[]> {
  const { reader } = await getDatabases();
  return reader.getAllAsync<StockLevel>(
    `SELECT item.id AS catalogueItemId, COALESCE(SUM(movement.quantity_delta), 0) AS quantity
       FROM catalogue_item AS item
       LEFT JOIN (
         SELECT mode, catalogue_item_id, quantity_delta FROM stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_reversal_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM stock_adjustment
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM customer_credit_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM retail_sale_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM retail_sale_reversal_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM supplier_claim_stock_movement
         UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_lot_stock_movement
       ) AS movement ON movement.mode = item.mode AND movement.catalogue_item_id = item.id
      WHERE item.mode = ?
      GROUP BY item.id`,
    mode,
  );
}

export type RestockPlanningItem = {
  catalogueItemId: string;
  name: string;
  packSize: string;
  unit: StockUnit;
  onHandQuantity: number;
  minimumQuantity: number | null;
  suggestedQuantity: number | null;
};

export type RestockDraftLine = Pick<CatalogItem, 'id' | 'name' | 'packSize' | 'unit'> & { quantity: number };

/**
 * Lists threshold-based restock suggestions for this shop ledger. A suggestion
 * is the owner-set minimum minus currently recorded stock; it is not a forecast.
 */
export async function listRestockPlanning(mode: ShopMode): Promise<RestockPlanningItem[]> {
  const { reader } = await getDatabases(databaseNameForShop(currentShopId));
  const rows = await reader.getAllAsync<{
    catalogueItemId: string; name: string; packSize: string; unit: StockUnit;
    onHandQuantity: number; minimumQuantity: number | null;
  }>(`
    SELECT item.id AS catalogueItemId, item.name, item.pack_size AS packSize, item.unit,
      COALESCE(SUM(movement.quantity_delta), 0) AS onHandQuantity,
      point.minimum_quantity AS minimumQuantity
    FROM catalogue_item AS item
    LEFT JOIN (
      SELECT mode, catalogue_item_id, quantity_delta FROM stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_reversal_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM stock_adjustment
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM customer_credit_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM retail_sale_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM retail_sale_reversal_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM supplier_claim_stock_movement
      UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM delivery_lot_stock_movement
    ) AS movement ON movement.mode = item.mode AND movement.catalogue_item_id = item.id
    LEFT JOIN stock_reorder_point AS point ON point.mode = item.mode AND point.catalogue_item_id = item.id
    WHERE item.mode = ?
    GROUP BY item.mode, item.id, point.minimum_quantity
    ORDER BY item.name COLLATE NOCASE, item.pack_size, item.id`, mode);
  return rows.map((row) => ({
    ...row,
    suggestedQuantity: row.minimumQuantity === null ? null : Math.max(0, row.minimumQuantity - row.onHandQuantity),
  }));
}

/** Store an absolute, owner-chosen minimum. Repeating the same write is safe. */
export async function setReorderPoint(
  mode: ShopMode,
  catalogueItemId: string,
  minimumQuantity: number | null,
  unit: StockUnit,
): Promise<void> {
  if (minimumQuantity !== null && (!Number.isSafeInteger(minimumQuantity) || minimumQuantity < 0 || minimumQuantity > MAX_QUANTITY)) {
    throw new Error('The reorder minimum must be a non-negative whole number.');
  }
  await writeTransaction(async (db) => {
    const item = await db.getFirstAsync<{ unit: StockUnit }>(
      'SELECT unit FROM catalogue_item WHERE mode = ? AND id = ?', mode, catalogueItemId,
    );
    if (!item) throw new Error('Choose a product from this shop catalogue.');
    if (item.unit !== unit) throw new Error('The reorder point must use the catalogue unit.');
    if (minimumQuantity === null) {
      await db.runAsync('DELETE FROM stock_reorder_point WHERE mode = ? AND catalogue_item_id = ?', mode, catalogueItemId);
      return;
    }
    await db.runAsync(
      `INSERT INTO stock_reorder_point (mode, catalogue_item_id, minimum_quantity, unit, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (mode, catalogue_item_id) DO UPDATE SET minimum_quantity = excluded.minimum_quantity,
         unit = excluded.unit, updated_at = excluded.updated_at`,
      mode, catalogueItemId, minimumQuantity, unit, new Date().toISOString(),
    );
  });
}

export async function listRestockDraft(mode: ShopMode): Promise<RestockDraftLine[]> {
  const { reader } = await getDatabases(databaseNameForShop(currentShopId));
  return reader.getAllAsync<RestockDraftLine>(`
    SELECT item.id, item.name, item.pack_size AS packSize, line.unit, line.quantity
    FROM restock_draft_line AS line
    JOIN catalogue_item AS item ON item.mode = line.mode AND item.id = line.catalogue_item_id
    WHERE line.mode = ?
    ORDER BY line.updated_at, item.name COLLATE NOCASE`, mode);
}

/** Saves the desired draft amount (not a stock movement or supplier payable). */
export async function saveRestockDraftLine(
  mode: ShopMode,
  catalogueItemId: string,
  quantity: number,
  unit: StockUnit,
): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new Error('A restock draft quantity must be a positive whole number.');
  }
  await writeTransaction(async (db) => {
    const item = await db.getFirstAsync<{ unit: StockUnit }>(
      'SELECT unit FROM catalogue_item WHERE mode = ? AND id = ?', mode, catalogueItemId,
    );
    if (!item) throw new Error('Choose a product from this shop catalogue.');
    if (item.unit !== unit) throw new Error('The restock quantity must use the catalogue unit.');
    await db.runAsync(
      `INSERT INTO restock_draft_line (mode, catalogue_item_id, quantity, unit, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (mode, catalogue_item_id) DO UPDATE SET quantity = excluded.quantity,
         unit = excluded.unit, updated_at = excluded.updated_at`,
      mode, catalogueItemId, quantity, unit, new Date().toISOString(),
    );
  });
}

export async function removeRestockDraftLine(mode: ShopMode, catalogueItemId: string): Promise<void> {
  await writeTransaction(async (db) => {
    await db.runAsync('DELETE FROM restock_draft_line WHERE mode = ? AND catalogue_item_id = ?', mode, catalogueItemId);
  });
}

export function adjustStock(
  mode: ShopMode,
  operationId: string,
  catalogueItemId: string,
  quantityDelta: number,
  reason: string,
): Promise<void> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    const note = reason.trim();
    if (!id || !catalogueItemId.trim() || !note) throw new Error('Choose a product and enter an adjustment reason.');
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0 || Math.abs(quantityDelta) > MAX_QUANTITY) {
      throw new Error('Enter a valid whole stock adjustment.');
    }
    const balance = await db.getFirstAsync<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS quantity FROM (
         SELECT quantity_delta FROM stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM stock_adjustment WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM customer_credit_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM retail_sale_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM retail_sale_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM supplier_claim_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_lot_stock_movement WHERE mode = ? AND catalogue_item_id = ?
       )`,
      mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId,
      mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId,
    );
    if (!balance) throw new Error('Product stock could not be read.');
    if (balance.quantity + quantityDelta < 0) throw new Error('Stock cannot go below zero.');
    await db.runAsync(
      'INSERT INTO stock_adjustment (mode, id, catalogue_item_id, quantity_delta, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      mode, id, catalogueItemId, quantityDelta, note.slice(0, 120), new Date().toISOString(),
    );
  });
}

function insertCatalogItem(db: SQLiteDatabase, mode: ShopMode, item: CatalogItem) {
  return db.runAsync(
    `INSERT INTO catalogue_item (mode, id, name, pack_size, variant_key, unit, aliases_json, image_uri, barcode, brand, package_content, catalogue_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (mode, id) DO UPDATE SET
       name = excluded.name, pack_size = excluded.pack_size, variant_key = excluded.variant_key,
       unit = excluded.unit, aliases_json = excluded.aliases_json, image_uri = excluded.image_uri,
       barcode = excluded.barcode, brand = excluded.brand, package_content = excluded.package_content,
       catalogue_source = excluded.catalogue_source`,
    mode,
    item.id,
    item.name,
    item.packSize,
    JSON.stringify([catalogueKey(item.name), catalogueKey(item.packSize)]),
    item.unit,
    JSON.stringify(item.aliases),
    item.imageUri ?? null,
    item.barcode ?? null,
    item.brand ?? null,
    item.packageContent ?? null,
    item.catalogueSource ?? null,
  );
}

export async function listOpeningStockItems(mode: ShopMode): Promise<{ id: string; quantity: number }[]> {
  const { reader } = await getDatabases();
  return reader.getAllAsync(
    "SELECT catalogue_item_id AS id, quantity_delta AS quantity FROM stock_adjustment WHERE mode = ? AND id = 'opening-stock:' || catalogue_item_id ORDER BY created_at DESC, id",
    mode,
  );
}

export async function saveCatalogItem(mode: ShopMode, input: CatalogInput, openingQuantity?: number): Promise<CatalogItem> {
  const name = input.name.trim();
  const packSize = input.packSize.trim();
  if (!name || !packSize) throw new Error('Enter the item name and pack size.');
  if (openingQuantity !== undefined && (!input.id || !Number.isSafeInteger(openingQuantity) || openingQuantity < 1 || openingQuantity > MAX_QUANTITY)) {
    throw new Error('Enter a valid opening stock quantity.');
  }
  const barcode = input.barcode?.trim() || null;
  if (barcode && !/^(?:\d{8}|\d{12,14})$/u.test(barcode)) throw new Error('Enter a valid product barcode or scan it again.');

  const aliases = new Map<string, string>();
  for (const alias of input.aliases) {
    const key = catalogueKey(alias);
    if (key && !aliases.has(key)) aliases.set(key, alias.trim());
  }
  const item: CatalogItem = {
    id: input.id ?? newOperationId(),
    name,
    packSize,
    unit: input.unit,
    aliases: [...aliases.values()],
    imageUri: input.imageUri ?? null,
    barcode,
    brand: input.brand ?? null,
    packageContent: input.packageContent ?? null,
    catalogueSource: input.catalogueSource ?? null,
  };
  return writeTransaction(async (db) => {
    if (openingQuantity !== undefined) {
      const existing = await db.getFirstAsync<{ quantity: number; name: string; packSize: string; unit: StockUnit; barcode: string | null; aliasesJson: string; imageUri: string | null; brand: string | null; packageContent: string | null; catalogueSource: string | null }>(
        `SELECT adjustment.quantity_delta AS quantity, item.name, item.pack_size AS packSize, item.unit, item.barcode,
          item.aliases_json AS aliasesJson, item.image_uri AS imageUri, item.brand, item.package_content AS packageContent,
          item.catalogue_source AS catalogueSource
          FROM catalogue_item AS item LEFT JOIN stock_adjustment AS adjustment
            ON adjustment.mode = item.mode AND adjustment.id = 'opening-stock:' || item.id
          WHERE item.mode = ? AND item.id = ?`, mode, item.id,
      );
      if (existing) {
        const { aliasesJson, quantity, ...fields } = existing;
        if (quantity !== openingQuantity || aliasesJson !== JSON.stringify(item.aliases)
          || Object.entries(fields).some(([key, value]) => item[key as keyof CatalogItem] !== value)) {
          throw new Error('This opening stock item is already saved with different details.');
        }
        return item;
      }
    }
    if (item.barcode) {
      const equivalent = equivalentProductBarcodes(item.barcode);
      const duplicateBarcode = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM catalogue_item WHERE mode = ? AND id != ? AND barcode IN (${equivalent.map(() => '?').join(', ')})`,
        mode, item.id, ...equivalent,
      );
      if (duplicateBarcode) {
        throw new Error('This barcode is already linked to another product in this shop.');
      }
    }
    const match = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM catalogue_item WHERE mode = ? AND variant_key = ? AND unit = ?',
      mode,
      JSON.stringify([catalogueKey(name), catalogueKey(packSize)]),
      input.unit,
    );
    if (match && match.id !== item.id) {
      throw new Error('This catalogue item already exists.');
    }
    await insertCatalogItem(db, mode, item);
    if (openingQuantity !== undefined) {
      await db.runAsync(
        'INSERT INTO stock_adjustment (mode, id, catalogue_item_id, quantity_delta, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        mode, `opening-stock:${item.id}`, item.id, openingQuantity, 'Opening stock count', new Date().toISOString(),
      );
    }
    return item;
  });
}

const RECEIPT_QUERY = `
  SELECT receipt.id, receipt.created_at AS createdAt, receipt.business_date AS businessDate,
    receipt.voice_note AS voiceNote,
    receipt.supplier, receipt.receipt_total_paise AS receiptTotalPaise,
    receipt.amount_paid_paise AS amountPaidPaise, receipt.payment_method AS paymentMethod,
    reversal.created_at AS reversedAt, movement.catalogue_item_id AS catalogItemId,
    movement.name, movement.pack_size AS packSize, movement.unit,
    movement.quantity_delta AS quantity
  FROM ledger_entry AS receipt
  JOIN stock_movement AS movement ON movement.mode = receipt.mode AND movement.entry_id = receipt.id
  LEFT JOIN ledger_entry AS reversal ON reversal.mode = receipt.mode AND reversal.reverses_id = receipt.id
  WHERE receipt.mode = ? AND receipt.kind = 'receipt'
`;

function groupReceipts(rows: ReceiptRow[]): SavedReceipt[] {
  const receipts = new Map<string, SavedReceipt>();
  for (const { catalogItemId, name, packSize, quantity, unit, ...receipt } of rows) {
    const line = { catalogItemId, name, packSize, quantity, unit };
    const existing = receipts.get(receipt.id);
    if (existing) {
      existing.lines.push(line);
    } else {
      receipts.set(receipt.id, { ...receipt, lines: [line] });
    }
  }
  return [...receipts.values()];
}

export async function listReceipts(mode: ShopMode, search = ''): Promise<SavedReceipt[]> {
  const { reader } = await getDatabases();
  const query = search.trim().toLowerCase();
  const order = 'ORDER BY receipt.created_at DESC, receipt.id DESC, movement.position';
  if (!query) {
    return groupReceipts(await reader.getAllAsync<ReceiptRow>(`${RECEIPT_QUERY} ${order}`, mode));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query)) {
    return groupReceipts(await reader.getAllAsync<ReceiptRow>(
      `${RECEIPT_QUERY} AND receipt.business_date = ? ${order}`,
      mode,
      query,
    ));
  }
  const rows = await reader.getAllAsync<ReceiptRow>(
    `${RECEIPT_QUERY} AND (
      instr(lower(coalesce(receipt.supplier, '')), ?) > 0 OR EXISTS (
        SELECT 1 FROM stock_movement AS matching
        WHERE matching.mode = receipt.mode AND matching.entry_id = receipt.id
          AND instr(lower(matching.name || ' ' || matching.pack_size), ?) > 0
      )
    ) ${order}`,
    mode, query, query,
  );
  return groupReceipts(rows);
}

async function findReceipt(db: SQLiteDatabase, mode: ShopMode, id: string) {
  const rows = await db.getAllAsync<ReceiptRow>(
    `${RECEIPT_QUERY} AND receipt.id = ? ORDER BY movement.position`,
    mode,
    id,
  );
  return groupReceipts(rows)[0] ?? null;
}

export async function readReceipt(mode: ShopMode, id: string): Promise<SavedReceipt | null> {
  const { reader } = await getDatabases();
  return findReceipt(reader, mode, id);
}

function validMoney(value: number | null) {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_PAISE);
}

function validatePayment(method: PaymentMethod | null) {
  return method === null || ['cash', 'upi', 'card', 'bank_transfer', 'other'].includes(method);
}

function sameReceiptInput(saved: SavedReceipt, input: ReceiptInput) {
  return saved.voiceNote === (input.voiceNote?.trim() || null) &&
    saved.supplier === (input.supplier?.trim() || null) &&
    saved.receiptTotalPaise === input.receiptTotalPaise &&
    saved.amountPaidPaise === input.amountPaidPaise &&
    saved.paymentMethod === input.paymentMethod &&
    saved.lines.length === input.lines.length &&
    saved.lines.every((line, index) => {
      const other = input.lines[index];
      return line.catalogItemId === other.catalogItemId && line.quantity === other.quantity && line.unit === other.unit;
    });
}

async function resolveLine(
  db: SQLiteDatabase,
  mode: ShopMode,
  line: ReceiptInput['lines'][number],
) {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
    throw new Error('Use a valid whole-number item quantity.');
  }
  const item = await db.getFirstAsync<{ name: string; packSize: string; unit: StockUnit }>(
    'SELECT name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?',
    mode,
    line.catalogItemId,
  );
  if (!item || item.unit !== line.unit || item.name !== line.name || item.packSize !== line.packSize) {
    throw new Error('A catalogue item changed. Review the selected variant and unit.');
  }
  return { ...item, catalogItemId: line.catalogItemId, quantity: line.quantity };
}

async function persistReceipt(
  db: SQLiteDatabase,
  mode: ShopMode,
  operationId: string,
  input: ReceiptInput,
): Promise<SavedReceipt> {
    if (!operationId.trim() || !input.lines.length) {
      throw new Error('Add an item and review the receipt before saving.');
    }
    const saved = await findReceipt(db, mode, operationId);
    if (saved) {
      if (!sameReceiptInput(saved, input)) {
        throw new Error('This confirmation was already used for a different receipt.');
      }
      return saved;
    }
    if (!validMoney(input.receiptTotalPaise) || !validMoney(input.amountPaidPaise) || !validatePayment(input.paymentMethod)) {
      throw new Error('Check the receipt total, paid amount and payment method.');
    }

    const lines: ReceiptInput['lines'] = [];
    for (const line of input.lines) {
      lines.push(await resolveLine(db, mode, line));
    }
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    const supplier = input.supplier?.trim() || null;
    const voiceNote = input.voiceNote?.trim() || null;
    if (supplier) await ensureSupplierForName(db, mode, supplier);

    await db.runAsync(
      `INSERT INTO ledger_entry (
         mode, id, kind, created_at, business_date, supplier,
         receipt_total_paise, amount_paid_paise, payment_method, voice_note
       ) VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, ?, ?)`,
      mode, operationId, createdAt, date, supplier,
      input.receiptTotalPaise, input.amountPaidPaise, input.paymentMethod, voiceNote,
    );
    for (const [position, line] of lines.entries()) {
      await db.runAsync(
        `INSERT INTO stock_movement (
           mode, entry_id, position, catalogue_item_id, name, pack_size, unit, quantity_delta
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        mode, operationId, position, line.catalogItemId, line.name, line.packSize, line.unit, line.quantity,
      );
    }
    return {
      id: operationId,
      createdAt,
      businessDate: date,
      reversedAt: null,
      voiceNote,
      supplier,
      receiptTotalPaise: input.receiptTotalPaise,
      amountPaidPaise: input.amountPaidPaise,
      paymentMethod: input.paymentMethod,
      lines,
    };
}

export function confirmReceipt(
  mode: ShopMode,
  operationId: string,
  input: ReceiptInput,
): Promise<SavedReceipt> {
  return writeTransaction((db) => persistReceipt(db, mode, operationId, input));
}

async function persistReverseReceipt(db: SQLiteDatabase, mode: ShopMode, id: string): Promise<SavedReceipt> {
    const receipt = await findReceipt(db, mode, id);
    if (!receipt) throw new Error('This receipt is no longer available.');
    if (receipt.reversedAt) return receipt;

    const reversalId = newOperationId();
    const reversedAt = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO ledger_entry (mode, id, kind, created_at, business_date, reverses_id)
       VALUES (?, ?, 'reversal', ?, ?, ?)`,
      mode, reversalId, reversedAt, businessDate(reversedAt), id,
    );
    await db.runAsync(
      `INSERT INTO stock_movement (
         mode, entry_id, position, catalogue_item_id, name, pack_size, unit, quantity_delta
       )
       SELECT mode, ?, position, catalogue_item_id, name, pack_size, unit, -quantity_delta
       FROM stock_movement WHERE mode = ? AND entry_id = ?`,
      reversalId, mode, id,
    );
    return { ...receipt, reversedAt };
}

export function reverseReceipt(mode: ShopMode, id: string): Promise<SavedReceipt> {
  return writeTransaction((db) => persistReverseReceipt(db, mode, id));
}

const DELIVERY_ROWS_QUERY = `
  SELECT event.id AS eventId, event.created_at AS createdAt, event.business_date AS businessDate,
    event.supplier, event.invoice_number AS invoiceNumber, event.invoice_date AS invoiceDate,
    event.due_date AS dueDate,
    event.invoice_evidence_uris_json AS invoiceEvidenceUrisJson,
    event.invoice_total_paise AS invoiceTotalPaise, event.amount_paid_paise AS amountPaidPaise,
    event.payment_method AS paymentMethod, reversal.created_at AS reversedAt,
    event.payload_json AS payloadJson,
    line.line_id AS lineId, line.catalogue_item_id AS catalogItemId, line.name,
    line.pack_size AS packSize, line.unit, line.billed_quantity AS billedQuantity,
    line.good_quantity AS goodQuantity, line.damaged_quantity AS damagedQuantity,
    line.missing_quantity AS missingQuantity, line.extra_quantity AS extraQuantity,
    line.accepted_extra_quantity AS acceptedExtraQuantity
  FROM delivery_event AS event
  JOIN delivery_line AS line ON line.mode = event.mode AND line.event_id = event.id
  LEFT JOIN delivery_reversal AS reversal ON reversal.mode = event.mode AND reversal.reverses_event_id = event.id
  WHERE event.mode = ?
`;

function groupDeliveries(rows: DeliveryLineRow[]): SavedDeliveryReconciliation[] {
  const deliveries = new Map<string, SavedDeliveryReconciliation>();
  for (const {
    eventId, createdAt, businessDate, supplier, invoiceNumber, invoiceDate, dueDate,
    invoiceEvidenceUrisJson, invoiceTotalPaise, amountPaidPaise, paymentMethod, reversedAt,
    payloadJson,
    lineId, catalogItemId, name, packSize, unit, billedQuantity, goodQuantity,
    damagedQuantity, missingQuantity, extraQuantity, acceptedExtraQuantity,
  } of rows) {
    const payload = JSON.parse(payloadJson) as { voiceNote?: string; lines?: DeliveryReconciliationLineInput[] };
    const line = {
      lineId, catalogItemId, name, packSize, unit, billedQuantity,
      goodQuantity, damagedQuantity, missingQuantity, extraQuantity, acceptedExtraQuantity,
      lots: payload.lines?.find((payloadLine) => payloadLine.lineId === lineId)?.lots ?? [],
    };
    const existing = deliveries.get(eventId);
    if (existing) existing.lines.push(line);
    else deliveries.set(eventId, {
      id: eventId, createdAt, businessDate, reversedAt, supplier, invoiceNumber,
      invoiceDate, dueDate, invoiceEvidenceUris: JSON.parse(invoiceEvidenceUrisJson) as string[],
      voiceNote: payload.voiceNote ?? '',
      invoiceTotalPaise, amountPaidPaise, paymentMethod, lines: [line],
    });
  }
  return [...deliveries.values()];
}

function deliverySupplierKey(supplier: string) {
  return catalogueKey(supplier);
}

function checkedSupplierName(value: string) {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 120) throw new Error('Enter a supplier name up to 120 characters.');
  return name;
}

function supplierAliasKey(value: string) {
  return catalogueKey(checkedSupplierName(value));
}

async function findSupplierRow(db: SQLiteDatabase, mode: ShopMode, nameOrAlias: string) {
  const key = supplierAliasKey(nameOrAlias);
  return db.getFirstAsync<{ id: string; name: string; createdAt: string }>(
    `SELECT supplier.id, supplier.display_name AS name, supplier.created_at AS createdAt
       FROM supplier_profile AS supplier
      WHERE supplier.mode = ? AND (
        supplier.normalized_name = ? OR EXISTS (
          SELECT 1 FROM supplier_alias AS alias
           WHERE alias.mode = supplier.mode AND alias.supplier_id = supplier.id AND alias.alias_key = ?
        )
      ) AND supplier.archived_at IS NULL
      LIMIT 1`,
    mode, key, key,
  );
}

async function ensureSupplierForName(db: SQLiteDatabase, mode: ShopMode, suppliedName: string) {
  const name = checkedSupplierName(suppliedName);
  const match = await findSupplierRow(db, mode, name);
  if (match) return match;
  const key = supplierAliasKey(name);
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO supplier_profile (mode, id, display_name, normalized_name, created_at)
     VALUES (?, ?, ?, ?, ?)`, mode, key, name, key, createdAt,
  );
  return { id: key, name, createdAt };
}

export async function listSuppliers(mode: ShopMode): Promise<SupplierProfile[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{
    id: string; name: string; createdAt: string; balancePaise: number; deliveryCount: number; receiptCount: number;
    paymentCount: number; alias: string | null;
  }>(
    `SELECT supplier.id, supplier.display_name AS name, supplier.created_at AS createdAt,
            COALESCE(balance.balance_paise, 0) AS balancePaise,
            COALESCE(delivery.delivery_count, 0) AS deliveryCount,
            COALESCE(receipt.receipt_count, 0) AS receiptCount,
            COALESCE(payment.payment_count, 0) AS paymentCount,
            alias.alias
       FROM supplier_profile AS supplier
       LEFT JOIN (
         SELECT mode, supplier_id, SUM(balance_paise) AS balance_paise FROM (
           SELECT mode, supplier_key AS supplier_id, SUM(amount_delta_paise) AS balance_paise
             FROM supplier_balance_entry GROUP BY mode, supplier_key
           UNION ALL
           SELECT mode, supplier_id, SUM(amount_delta_paise) AS balance_paise
             FROM supplier_payment_event GROUP BY mode, supplier_id
           UNION ALL
           SELECT mode, supplier_id, SUM(amount_delta_paise) AS balance_paise
             FROM supplier_claim_credit_entry GROUP BY mode, supplier_id
         ) GROUP BY mode, supplier_id
       ) AS balance ON balance.mode = supplier.mode AND balance.supplier_id = supplier.id
       LEFT JOIN (
         SELECT mode, supplier_key AS supplier_id, COUNT(DISTINCT id) AS delivery_count
           FROM delivery_event GROUP BY mode, supplier_key
       ) AS delivery ON delivery.mode = supplier.mode AND delivery.supplier_id = supplier.id
       LEFT JOIN (
         SELECT mode, supplier, COUNT(*) AS receipt_count
           FROM ledger_entry AS receipt
          WHERE receipt.kind = 'receipt' AND receipt.supplier IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM ledger_entry AS reversal
               WHERE reversal.mode = receipt.mode AND reversal.reverses_id = receipt.id
            )
          GROUP BY mode, supplier
       ) AS receipt ON receipt.mode = supplier.mode AND receipt.supplier = supplier.display_name
       LEFT JOIN (
         SELECT mode, supplier_id, COUNT(*) AS payment_count
           FROM supplier_payment_event WHERE kind = 'payment' GROUP BY mode, supplier_id
       ) AS payment ON payment.mode = supplier.mode AND payment.supplier_id = supplier.id
       LEFT JOIN supplier_alias AS alias ON alias.mode = supplier.mode AND alias.supplier_id = supplier.id
      WHERE supplier.mode = ? AND supplier.archived_at IS NULL
      ORDER BY supplier.display_name COLLATE NOCASE, alias.alias COLLATE NOCASE`,
    mode,
  );
  const suppliers = new Map<string, SupplierProfile>();
  for (const row of rows) {
    let supplier = suppliers.get(row.id);
    if (!supplier) {
      supplier = {
        id: row.id, name: row.name, createdAt: row.createdAt,
        balancePaise: row.balancePaise, deliveryCount: row.deliveryCount + row.receiptCount,
        paymentCount: row.paymentCount, aliases: [],
      };
      suppliers.set(row.id, supplier);
    }
    if (row.alias) supplier.aliases.push(row.alias);
  }
  return [...suppliers.values()];
}

export async function createSupplier(mode: ShopMode, input: NewSupplierInput): Promise<SupplierProfile> {
  const name = checkedSupplierName(input.name);
  const aliases = [...new Set(input.aliases.map(checkedSupplierName))]
    .filter((alias) => supplierAliasKey(alias) !== supplierAliasKey(name));
  const createdAt = new Date().toISOString();
  await writeTransaction(async (db) => {
    const nameMatch = await findSupplierRow(db, mode, name);
    if (nameMatch && nameMatch.id !== supplierAliasKey(name)) {
      throw new Error(`“${name}” is already saved as an alias for ${nameMatch.name}. Choose that supplier instead.`);
    }
    if (!nameMatch) {
      const key = supplierAliasKey(name);
      await db.runAsync(
        `INSERT INTO supplier_profile (mode, id, display_name, normalized_name, created_at)
         VALUES (?, ?, ?, ?, ?)`, mode, key, name, key, createdAt,
      );
    }
    const supplier = await findSupplierRow(db, mode, name);
    if (!supplier) throw new Error('Could not create this supplier profile.');
    for (const alias of aliases) {
      const key = supplierAliasKey(alias);
      const match = await findSupplierRow(db, mode, alias);
      if (match && match.id !== supplier.id) {
        throw new Error(`“${alias}” already identifies ${match.name}. Choose a different alias.`);
      }
      if (!match) {
        await db.runAsync(
          `INSERT INTO supplier_alias (mode, id, supplier_id, alias, alias_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`, mode, newOperationId(), supplier.id, alias, key, createdAt,
        );
      }
    }
  });
  const suppliers = await listSuppliers(mode);
  const profile = suppliers.find((supplier) => supplier.id === supplierAliasKey(name));
  if (!profile) throw new Error('Could not read the saved supplier profile.');
  return profile;
}

function calculateOrderStatus(status: SupplierOrderStatus, cancelledAt: string | null, lines: SupplierOrderLine[]): SupplierOrderStatus {
  if (cancelledAt) return 'cancelled';
  if (status === 'draft') return 'draft';
  if (lines.every((line) => line.outstandingQuantity === 0) && lines.some((line) => line.receivedQuantity > 0)) return 'received';
  if (lines.some((line) => line.receivedQuantity > 0)) return 'partially_received';
  return status;
}

async function readSupplierOrderWith(reader: SQLiteDatabase, mode: ShopMode, id: string): Promise<SupplierOrder | null> {
  const header = await reader.getFirstAsync<{
    id: string; supplierId: string; supplier: string; status: SupplierOrderStatus;
    createdAt: string; placedAt: string | null; businessDate: string;
    expectedDate: string | null; note: string | null; cancelledAt: string | null; payloadJson: string;
  }>(`
    SELECT id, supplier_id AS supplierId, supplier_name AS supplier,
      status, created_at AS createdAt, placed_at AS placedAt, business_date AS businessDate,
      expected_date AS expectedDate, note, cancelled_at AS cancelledAt, payload_json AS payloadJson
    FROM supplier_order WHERE mode = ? AND id = ?`, mode, id);
  if (!header) return null;
  const lines = await reader.getAllAsync<{
    position: number; catalogueItemId: string; name: string; packSize: string; unit: StockUnit;
    quantity: number; quotedUnitPricePaise: number | null; receivedQuantity: number;
  }>(`
    SELECT line.position, line.catalogue_item_id AS catalogueItemId, line.name, line.pack_size AS packSize,
      line.unit, line.ordered_quantity AS quantity, line.quoted_unit_price_paise AS quotedUnitPricePaise,
      COALESCE(SUM(received.good_quantity + received.damaged_quantity + received.extra_quantity), 0) AS receivedQuantity
    FROM supplier_order_line AS line
    LEFT JOIN supplier_order_delivery_line AS link
      ON link.mode = line.mode AND link.order_id = line.order_id AND link.order_line_position = line.position
    LEFT JOIN delivery_line AS received
      ON received.mode = link.mode AND received.event_id = link.delivery_id AND received.position = link.delivery_line_position
    LEFT JOIN delivery_event AS event
      ON event.mode = received.mode AND event.id = received.event_id
    WHERE line.mode = ? AND line.order_id = ?
      AND (event.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM delivery_reversal AS reversal
        WHERE reversal.mode = event.mode AND reversal.reverses_event_id = event.id
      ))
    GROUP BY line.mode, line.order_id, line.position
    ORDER BY line.position`, mode, id);
  const orderLines: SupplierOrderLine[] = lines.map((line) => ({
    catalogueItemId: line.catalogueItemId,
    position: line.position,
    name: line.name,
    packSize: line.packSize,
    unit: line.unit,
    quantity: line.quantity,
    quotedUnitPricePaise: line.quotedUnitPricePaise,
    receivedQuantity: line.receivedQuantity,
    outstandingQuantity: Math.max(0, line.quantity - line.receivedQuantity),
    excessQuantity: Math.max(0, line.receivedQuantity - line.quantity),
  }));
  const payload = JSON.parse(header.payloadJson) as SupplierOrderInput;
  const quotedTotalPaise = payload.lines.every((line) => line.quotedUnitPricePaise !== null)
    ? payload.lines.reduce((total, line) => total + line.quantity * (line.quotedUnitPricePaise ?? 0), 0)
    : null;
  return {
    id: header.id,
    supplierId: header.supplierId,
    supplier: header.supplier,
    createdAt: header.createdAt,
    placedAt: header.placedAt,
    businessDate: header.businessDate,
    expectedDate: header.expectedDate,
    note: header.note,
    cancelledAt: header.cancelledAt,
    status: calculateOrderStatus(header.status, header.cancelledAt, orderLines),
    quotedTotalPaise,
    lines: orderLines,
  };
}

/** Saves an order draft. Quotes remain planning data, never payable entries. */
export function recordSupplierOrder(
  mode: ShopMode,
  operationId: string,
  rawInput: SupplierOrderInput,
): Promise<SupplierOrder> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('An order operation ID is required.');
    if (!rawInput.supplierId.trim()) throw new Error('Choose a supplier for this order.');
    const expectedDate = checkedDueDate(rawInput.expectedDate);
    const note = checkedCustomerText(rawInput.note, 'Order note', 500);
    if (!Array.isArray(rawInput.lines) || rawInput.lines.length === 0) throw new Error('Add at least one product to this order.');
    const lines: SupplierOrderLineInput[] = [];
    const seenItems = new Set<string>();
    let fullyQuotedTotal = 0;
    for (const line of rawInput.lines) {
      if (!line.catalogueItemId.trim()) throw new Error('Choose a catalogue product for every order line.');
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
        throw new Error('Order quantities must be positive whole numbers.');
      }
      if (line.quotedUnitPricePaise !== null && !validMoney(line.quotedUnitPricePaise)) {
        throw new Error('Enter a valid quoted unit price or leave it blank.');
      }
      if (seenItems.has(line.catalogueItemId)) throw new Error('Each product can appear only once in an order.');
      seenItems.add(line.catalogueItemId);
      const item = await db.getFirstAsync<{ name: string; packSize: string; unit: StockUnit }>(
        'SELECT name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?', mode, line.catalogueItemId,
      );
      if (!item) throw new Error('Choose a product from this shop catalogue.');
      lines.push({ ...line });
      if (line.quotedUnitPricePaise !== null) fullyQuotedTotal += line.quantity * line.quotedUnitPricePaise;
      if (!Number.isSafeInteger(fullyQuotedTotal) || fullyQuotedTotal > MAX_MONEY_PAISE) {
        throw new Error('The quoted order value is too large.');
      }
    }
    const input: SupplierOrderInput = { supplierId: rawInput.supplierId, expectedDate, note, lines };
    const prior = await db.getFirstAsync<{ id: string; payloadJson: string }>(
      'SELECT id, payload_json AS payloadJson FROM supplier_order WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.payloadJson !== JSON.stringify(input)) throw new Error('This order operation ID was already used for different details.');
      const saved = await readSupplierOrderWith(db, mode, prior.id);
      if (!saved) throw new Error('The saved supplier order could not be read.');
      return saved;
    }
    const supplier = await db.getFirstAsync<{ id: string; name: string }>(
      `SELECT id, display_name AS name FROM supplier_profile
       WHERE mode = ? AND id = ? AND archived_at IS NULL`, mode, input.supplierId,
    );
    if (!supplier) throw new Error('Choose a saved supplier before recording an order.');
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    await db.runAsync(`
      INSERT INTO supplier_order (
        mode, id, operation_id, supplier_id, supplier_name, status, created_at,
        placed_at, place_operation_id, business_date, expected_date, note,
        cancelled_at, cancel_operation_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?, ?, ?, NULL, NULL, ?)`,
    mode, id, id, supplier.id, supplier.name, createdAt, date, input.expectedDate, input.note, JSON.stringify(input));
    for (const [position, line] of lines.entries()) {
      const item = await db.getFirstAsync<{ name: string; packSize: string; unit: StockUnit }>(
        'SELECT name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?', mode, line.catalogueItemId,
      );
      if (!item) throw new Error('A catalogue item changed. Review the order and try again.');
      await db.runAsync(`
        INSERT INTO supplier_order_line (
          mode, order_id, position, catalogue_item_id, name, pack_size, unit,
          ordered_quantity, quoted_unit_price_paise
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mode, id, position, line.catalogueItemId, item.name, item.packSize, item.unit,
      line.quantity, line.quotedUnitPricePaise);
    }
    const saved = await readSupplierOrderWith(db, mode, id);
    if (!saved) throw new Error('The supplier order could not be read after saving.');
    return saved;
  });
}

export async function listSupplierOrders(mode: ShopMode, supplierId?: string): Promise<SupplierOrder[]> {
  const { reader } = await getDatabases();
  const headers = await reader.getAllAsync<{ id: string }>(
    `SELECT id FROM supplier_order WHERE mode = ? ${supplierId ? 'AND supplier_id = ?' : ''}
     ORDER BY created_at DESC, id DESC`, ...(supplierId ? [mode, supplierId] : [mode]),
  );
  const orders = await Promise.all(headers.map(({ id }) => readSupplierOrderWith(reader, mode, id)));
  return orders.filter((order): order is SupplierOrder => !!order);
}

export async function readSupplierOrder(mode: ShopMode, id: string): Promise<SupplierOrder | null> {
  const { reader } = await getDatabases();
  return readSupplierOrderWith(reader, mode, id);
}

/** Records the owner's assertion that a saved draft was actually placed; no contact is sent. */
export function markSupplierOrderPlaced(mode: ShopMode, orderId: string, operationId: string): Promise<SupplierOrder> {
  return writeTransaction(async (db) => {
    const placedOperationId = operationId.trim();
    if (!placedOperationId) throw new Error('An order-placement operation ID is required.');
    const order = await readSupplierOrderWith(db, mode, orderId);
    if (!order) throw new Error('This supplier order is no longer available.');
    if (order.status !== 'draft') {
      if (order.status === 'placed') return order;
      throw new Error('Only a draft supplier order can be marked placed.');
    }
    const placedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE supplier_order SET status = 'placed', placed_at = ?, place_operation_id = ?
       WHERE mode = ? AND id = ? AND status = 'draft'`, placedAt, placedOperationId, mode, orderId,
    );
    const placed = await readSupplierOrderWith(db, mode, orderId);
    if (!placed) throw new Error('The placed supplier order could not be read.');
    return placed;
  });
}

/** Cancels remaining supply only. Prior receipts and their stock/payable events remain unchanged. */
export function cancelSupplierOrder(mode: ShopMode, orderId: string, operationId: string): Promise<SupplierOrder> {
  return writeTransaction(async (db) => {
    const cancelId = operationId.trim();
    if (!cancelId) throw new Error('A cancellation operation ID is required.');
    const order = await readSupplierOrderWith(db, mode, orderId);
    if (!order) throw new Error('This supplier order is no longer available.');
    if (order.cancelledAt) return order;
    if (order.status === 'received') throw new Error('This order is already fully received.');
    const cancelledAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE supplier_order SET status = 'cancelled', cancelled_at = ?, cancel_operation_id = ?
       WHERE mode = ? AND id = ? AND cancelled_at IS NULL`, cancelledAt, cancelId, mode, orderId,
    );
    const cancelled = await readSupplierOrderWith(db, mode, orderId);
    if (!cancelled) throw new Error('The cancelled supplier order could not be read.');
    return cancelled;
  });
}

/** Links a saved receipt to an order by exact product and unit. This metadata-only action never posts stock or payable. */
export function linkDeliveryToSupplierOrder(
  mode: ShopMode,
  operationId: string,
  orderId: string,
  deliveryId: string,
): Promise<SupplierOrder> {
  return writeTransaction(async (db) => {
    const linkId = operationId.trim();
    if (!linkId) throw new Error('A receipt-link operation ID is required.');
    const payload = { orderId, deliveryId };
    const priorOperation = await db.getFirstAsync<{ orderId: string; deliveryId: string; payloadJson: string }>(
      `SELECT order_id AS orderId, delivery_id AS deliveryId, payload_json AS payloadJson
       FROM supplier_order_delivery_link WHERE mode = ? AND operation_id = ?`, mode, linkId,
    );
    if (priorOperation) {
      if (priorOperation.payloadJson !== JSON.stringify(payload)) throw new Error('This receipt-link operation ID was already used for different details.');
      const saved = await readSupplierOrderWith(db, mode, priorOperation.orderId);
      if (!saved) throw new Error('The linked supplier order could not be read.');
      return saved;
    }
    const order = await readSupplierOrderWith(db, mode, orderId);
    const delivery = await findDelivery(db, mode, deliveryId);
    if (!order || !delivery) throw new Error('Choose an existing supplier order and confirmed receipt.');
    if (order.status === 'draft') throw new Error('Mark the order placed before linking its receipt.');
    if (order.status === 'cancelled') throw new Error('A cancelled order cannot accept another receipt.');
    if (delivery.reversedAt) throw new Error('A reversed receipt cannot be linked to an order.');
    const supplier = await findSupplierRow(db, mode, delivery.supplier);
    if (!supplier || supplier.id !== order.supplierId) throw new Error('The order and receipt must belong to the same supplier.');
    const existingLink = await db.getFirstAsync<{ orderId: string }>(
      'SELECT order_id AS orderId FROM supplier_order_delivery_link WHERE mode = ? AND delivery_id = ?', mode, deliveryId,
    );
    if (existingLink) {
      if (existingLink.orderId !== orderId) throw new Error('This receipt is already linked to another order.');
      return order;
    }

    const orderLines = await db.getAllAsync<{ position: number; catalogueItemId: string; unit: StockUnit }>(
      `SELECT position, catalogue_item_id AS catalogueItemId, unit
       FROM supplier_order_line WHERE mode = ? AND order_id = ?`, mode, orderId,
    );
    const deliveryLines = await db.getAllAsync<{ position: number; catalogueItemId: string; unit: StockUnit }>(
      `SELECT position, catalogue_item_id AS catalogueItemId, unit
       FROM delivery_line WHERE mode = ? AND event_id = ? ORDER BY position`, mode, deliveryId,
    );
    const byItem = new Map(orderLines.map((line) => [`${line.catalogueItemId}\u0000${line.unit}`, line]));
    const matches = deliveryLines.flatMap((line) => {
      const orderLine = byItem.get(`${line.catalogueItemId}\u0000${line.unit}`);
      return orderLine ? [{ deliveryPosition: line.position, orderPosition: orderLine.position }] : [];
    });
    if (!matches.length) throw new Error('No receipt lines match this order by exact product and unit.');
    const linkedAt = new Date().toISOString();
    await db.runAsync(`
      INSERT INTO supplier_order_delivery_link (mode, order_id, delivery_id, operation_id, payload_json, linked_at)
      VALUES (?, ?, ?, ?, ?, ?)`, mode, orderId, deliveryId, linkId, JSON.stringify(payload), linkedAt);
    for (const match of matches) {
      await db.runAsync(`
        INSERT INTO supplier_order_delivery_line (
          mode, order_id, order_line_position, delivery_id, delivery_line_position
        ) VALUES (?, ?, ?, ?, ?)`, mode, orderId, match.orderPosition, deliveryId, match.deliveryPosition);
    }
    const linked = await readSupplierOrderWith(db, mode, orderId);
    if (!linked) throw new Error('The linked supplier order could not be read.');
    return linked;
  });
}

export async function listSupplierOrderLinkedDeliveryIds(mode: ShopMode): Promise<string[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{ deliveryId: string }>(
    'SELECT delivery_id AS deliveryId FROM supplier_order_delivery_link WHERE mode = ?', mode,
  );
  return rows.map(({ deliveryId }) => deliveryId);
}

function supplierPaymentFromRow(row: {
  id: string; supplierId: string; kind: 'payment' | 'reversal'; amountDeltaPaise: number;
  paymentMethod: PaymentMethod | null; note: string | null; createdAt: string; businessDate: string;
  reversesEventId: string | null;
}): SupplierPaymentEvent {
  return {
    ...row,
    amountPaise: Math.abs(row.amountDeltaPaise),
    allocations: [],
    unallocatedPaise: row.kind === 'payment' ? Math.abs(row.amountDeltaPaise) : 0,
  };
}

async function supplierPaymentAllocationsWith(db: SQLiteDatabase, mode: ShopMode, eventId: string): Promise<SupplierPaymentAllocation[]> {
  const rows = await db.getAllAsync<{ invoiceId: string; invoiceNumber: string | null; amountPaise: number }>(
    `SELECT allocation.invoice_delivery_id AS invoiceId, delivery.invoice_number AS invoiceNumber,
            ABS(allocation.amount_delta_paise) AS amountPaise
       FROM supplier_payment_allocation AS allocation
       JOIN delivery_event AS delivery ON delivery.mode = allocation.mode AND delivery.id = allocation.invoice_delivery_id
      WHERE allocation.mode = ? AND allocation.payment_event_id = ? ORDER BY delivery.business_date, delivery.id`,
    mode, eventId,
  );
  return rows;
}

async function supplierPaymentEventWith(db: SQLiteDatabase, mode: ShopMode, row: Parameters<typeof supplierPaymentFromRow>[0]): Promise<SupplierPaymentEvent> {
  const event = supplierPaymentFromRow(row);
  const allocations = await supplierPaymentAllocationsWith(db, mode, event.id);
  return { ...event, allocations, unallocatedPaise: event.kind === 'payment'
    ? Math.max(0, event.amountPaise - allocations.reduce((total, allocation) => total + allocation.amountPaise, 0))
    : 0 };
}

const supplierPaymentSelect = `SELECT id, supplier_id AS supplierId, kind,
  amount_delta_paise AS amountDeltaPaise, payment_method AS paymentMethod, note,
  created_at AS createdAt, business_date AS businessDate,
  reverses_event_id AS reversesEventId FROM supplier_payment_event`;

export async function listSupplierPaymentEvents(mode: ShopMode, supplierId: string): Promise<SupplierPaymentEvent[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<Parameters<typeof supplierPaymentFromRow>[0]>(
    `${supplierPaymentSelect} WHERE mode = ? AND supplier_id = ? ORDER BY created_at DESC, id DESC`, mode, supplierId,
  );
  return Promise.all(rows.map((row) => supplierPaymentEventWith(reader, mode, row)));
}

export async function listSupplierInvoices(mode: ShopMode, supplierId: string, today = businessDate(new Date().toISOString())): Promise<SupplierInvoice[]> {
  const asOfDate = checkedSupplierDueDate(today);
  if (!asOfDate) throw new Error('Enter a valid invoice aging date.');
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{
    invoiceId: string; invoiceNumber: string | null; invoiceDate: string | null; dueDate: string | null;
    businessDate: string; totalPaise: number; amountPaidAtReceiptPaise: number | null; allocatedPaymentPaise: number; creditNoteDeltaPaise: number;
  }>(
    `SELECT invoice.id AS invoiceId, invoice.invoice_number AS invoiceNumber, invoice.invoice_date AS invoiceDate,
            invoice.due_date AS dueDate, invoice.business_date AS businessDate,
            invoice.invoice_total_paise AS totalPaise, invoice.amount_paid_paise AS amountPaidAtReceiptPaise,
            COALESCE((SELECT SUM(allocation.amount_delta_paise) FROM supplier_payment_allocation AS allocation
                       WHERE allocation.mode = invoice.mode AND allocation.invoice_delivery_id = invoice.id), 0) AS allocatedPaymentPaise,
            COALESCE((SELECT SUM(credit.amount_delta_paise) FROM supplier_claim_credit_entry AS credit
                       WHERE credit.mode = invoice.mode AND credit.invoice_id = invoice.id), 0) AS creditNoteDeltaPaise
       FROM delivery_event AS invoice
       LEFT JOIN delivery_reversal AS reversal ON reversal.mode = invoice.mode AND reversal.reverses_event_id = invoice.id
       JOIN supplier_profile AS supplier ON supplier.mode = invoice.mode AND supplier.id = invoice.supplier_key
      WHERE invoice.mode = ? AND supplier.id = ? AND reversal.id IS NULL
      ORDER BY COALESCE(invoice.due_date, invoice.business_date), invoice.business_date, invoice.id`,
    mode, supplierId,
  );
  return rows.map((row) => {
    const openPaise = Math.max(0, row.totalPaise - (row.amountPaidAtReceiptPaise ?? 0) + row.allocatedPaymentPaise + row.creditNoteDeltaPaise);
    const status: SupplierInvoiceStatus = openPaise === 0 ? 'settled'
      : !row.dueDate ? 'no_due_date'
        : row.dueDate < asOfDate ? 'overdue'
          : row.dueDate === asOfDate ? 'due_today' : 'not_due';
    return { ...row, amountPaidAtReceiptPaise: row.amountPaidAtReceiptPaise ?? 0, creditNotePaise: -row.creditNoteDeltaPaise, openPaise, status };
  });
}

export function recordSupplierPayment(
  mode: ShopMode,
  operationId: string,
  rawInput: SupplierPaymentInput,
): Promise<SupplierPaymentEvent> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('A payment operation ID is required.');
    if (!Number.isSafeInteger(rawInput.amountPaise) || rawInput.amountPaise <= 0 || rawInput.amountPaise > MAX_MONEY_PAISE) {
      throw new Error('Enter a payment amount greater than zero.');
    }
    if (rawInput.paymentMethod !== null && !['cash', 'upi', 'card', 'bank_transfer', 'other'].includes(rawInput.paymentMethod)) {
      throw new Error('Choose a valid payment method.');
    }
    const supplier = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM supplier_profile WHERE mode = ? AND id = ? AND archived_at IS NULL', mode, rawInput.supplierId,
    );
    if (!supplier) throw new Error('Choose a saved supplier before recording payment.');
    const rawAllocations = rawInput.allocations ?? [];
    if (!Array.isArray(rawAllocations)) throw new Error('Choose invoice allocations explicitly or leave the payment unallocated.');
    const allocations = rawAllocations.map(({ invoiceId, amountPaise }) => {
      if (!invoiceId.trim() || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > MAX_MONEY_PAISE) {
        throw new Error('Enter a valid invoice allocation amount.');
      }
      return { invoiceId: invoiceId.trim(), amountPaise };
    });
    if (new Set(allocations.map((allocation) => allocation.invoiceId)).size !== allocations.length) {
      throw new Error('An invoice can only be allocated once per payment.');
    }
    if (allocations.reduce((total, allocation) => total + allocation.amountPaise, 0) > rawInput.amountPaise) {
      throw new Error('Invoice allocations cannot exceed the payment amount.');
    }
    const input = {
      supplierId: rawInput.supplierId,
      amountPaise: rawInput.amountPaise,
      paymentMethod: rawInput.paymentMethod,
      note: checkedCustomerText(rawInput.note, 'Payment note', 500),
      allocations,
    };
    const prior = await db.getFirstAsync<{ id: string; payloadJson: string }>(
      'SELECT id, payload_json AS payloadJson FROM supplier_payment_event WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.payloadJson !== JSON.stringify(input)) throw new Error('This payment operation ID was already used for different details.');
      const row = await db.getFirstAsync<Parameters<typeof supplierPaymentFromRow>[0]>(
        `${supplierPaymentSelect} WHERE mode = ? AND id = ?`, mode, prior.id,
      );
      if (!row) throw new Error('The saved supplier payment could not be read.');
      return supplierPaymentEventWith(db, mode, row);
    }
    for (const allocation of allocations) {
      const invoice = await db.getFirstAsync<{
        supplierId: string; totalPaise: number; amountPaidPaise: number | null; allocatedPaise: number; creditNoteDeltaPaise: number;
        reversed: number;
      }>(
        `SELECT delivery.supplier_key AS supplierId, delivery.invoice_total_paise AS totalPaise,
                delivery.amount_paid_paise AS amountPaidPaise,
                COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_payment_allocation
                           WHERE mode = delivery.mode AND invoice_delivery_id = delivery.id), 0) AS allocatedPaise,
                COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_claim_credit_entry
                           WHERE mode = delivery.mode AND invoice_id = delivery.id), 0) AS creditNoteDeltaPaise,
                EXISTS(SELECT 1 FROM delivery_reversal WHERE mode = delivery.mode AND reverses_event_id = delivery.id) AS reversed
           FROM delivery_event AS delivery WHERE delivery.mode = ? AND delivery.id = ?`, mode, allocation.invoiceId,
      );
      if (!invoice || invoice.supplierId !== supplier.id || invoice.reversed) {
        throw new Error('Choose an active invoice from this supplier.');
      }
      const open = invoice.totalPaise - (invoice.amountPaidPaise ?? 0) + invoice.allocatedPaise + invoice.creditNoteDeltaPaise;
      if (allocation.amountPaise > open) throw new Error('This allocation exceeds the invoice amount remaining.');
    }
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    await db.runAsync(
      `INSERT INTO supplier_payment_event (
        mode, id, operation_id, supplier_id, kind, amount_delta_paise,
        payment_method, note, created_at, business_date, reverses_event_id, payload_json
      ) VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?, ?, NULL, ?)`,
      mode, id, id, supplier.id, -input.amountPaise, input.paymentMethod, input.note,
      createdAt, date, JSON.stringify(input),
    );
    for (const allocation of allocations) {
      await db.runAsync(
        `INSERT INTO supplier_payment_allocation (mode, payment_event_id, invoice_delivery_id, amount_delta_paise)
         VALUES (?, ?, ?, ?)`, mode, id, allocation.invoiceId, -allocation.amountPaise,
      );
    }
    const saved = await db.getFirstAsync<Parameters<typeof supplierPaymentFromRow>[0]>(
      `${supplierPaymentSelect} WHERE mode = ? AND id = ?`, mode, id,
    );
    if (!saved) throw new Error('The supplier payment could not be read after saving.');
    return supplierPaymentEventWith(db, mode, saved);
  });
}

export function reverseSupplierPayment(mode: ShopMode, paymentId: string, operationId: string): Promise<SupplierPaymentEvent> {
  return writeTransaction(async (db) => {
    const original = await db.getFirstAsync<Parameters<typeof supplierPaymentFromRow>[0] & { payloadJson: string }>(
      `SELECT id, supplier_id AS supplierId, kind, amount_delta_paise AS amountDeltaPaise,
              payment_method AS paymentMethod, note, created_at AS createdAt,
              business_date AS businessDate, reverses_event_id AS reversesEventId,
              payload_json AS payloadJson
         FROM supplier_payment_event WHERE mode = ? AND id = ?`, mode, paymentId,
    );
    if (!original || original.kind !== 'payment') throw new Error('This supplier payment is no longer available.');
    const existing = await db.getFirstAsync<Parameters<typeof supplierPaymentFromRow>[0]>(
      `${supplierPaymentSelect} WHERE mode = ? AND reverses_event_id = ?`, mode, original.id,
    );
    if (existing) return supplierPaymentEventWith(db, mode, existing);
    const id = operationId.trim();
    if (!id) throw new Error('A reversal operation ID is required.');
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    const payload = { reversesEventId: original.id };
    await db.runAsync(
      `INSERT INTO supplier_payment_event (
        mode, id, operation_id, supplier_id, kind, amount_delta_paise,
        payment_method, note, created_at, business_date, reverses_event_id, payload_json
      ) VALUES (?, ?, ?, ?, 'reversal', ?, ?, ?, ?, ?, ?, ?)`,
      mode, id, id, original.supplierId, -original.amountDeltaPaise, original.paymentMethod,
      original.note, createdAt, date, original.id, JSON.stringify(payload),
    );
    const allocations = await db.getAllAsync<{ invoiceId: string; amountDeltaPaise: number }>(
      'SELECT invoice_delivery_id AS invoiceId, amount_delta_paise AS amountDeltaPaise FROM supplier_payment_allocation WHERE mode = ? AND payment_event_id = ?',
      mode, original.id,
    );
    for (const allocation of allocations) {
      await db.runAsync(
        `INSERT INTO supplier_payment_allocation (mode, payment_event_id, invoice_delivery_id, amount_delta_paise)
         VALUES (?, ?, ?, ?)`, mode, id, allocation.invoiceId, -allocation.amountDeltaPaise,
      );
    }
    const saved = await db.getFirstAsync<Parameters<typeof supplierPaymentFromRow>[0]>(
      `${supplierPaymentSelect} WHERE mode = ? AND id = ?`, mode, id,
    );
    if (!saved) throw new Error('The supplier payment reversal could not be read after saving.');
    return supplierPaymentEventWith(db, mode, saved);
  });
}

function normalizedDeliveryInput(input: DeliveryReconciliationInput): DeliveryReconciliationInput {
  if (!Array.isArray(input.invoiceEvidenceUris) || input.invoiceEvidenceUris.some((uri) => typeof uri !== 'string')) {
    throw new Error('Invoice evidence must be a list of local file references.');
  }
  return {
    voiceNote: (input.voiceNote ?? '').trim().slice(0, 3000),
    supplier: input.supplier.trim().replace(/\s+/gu, ' '),
    invoiceNumber: input.invoiceNumber?.trim() || null,
    invoiceDate: input.invoiceDate?.trim() || null,
    dueDate: checkedSupplierDueDate(input.dueDate),
    invoiceEvidenceUris: input.invoiceEvidenceUris.map((uri) => uri.trim()),
    invoiceTotalPaise: input.invoiceTotalPaise,
    amountPaidPaise: input.amountPaidPaise,
    paymentMethod: input.paymentMethod,
    lines: input.lines.map((line) => ({
      ...line,
      lineId: line.lineId.trim(),
      ...(line.lots === undefined ? {} : { lots: line.lots.map((lot) => ({
        quantity: lot.quantity,
        batchCode: checkedCustomerText(lot.batchCode, 'Lot batch code', 120),
        expiryDate: checkedSupplierDueDate(lot.expiryDate),
      })) }),
    })),
  };
}

function validateDeliveryInput(input: DeliveryReconciliationInput) {
  if (!input.supplier.trim()) throw new Error('Choose or enter the supplier before confirming.');
  if (!Array.isArray(input.invoiceEvidenceUris) || input.invoiceEvidenceUris.some((uri) =>
    typeof uri !== 'string' || !/^(?:file|content):\/\//u.test(uri))) {
    throw new Error('Invoice evidence must use local file references.');
  }
  if (!validMoney(input.invoiceTotalPaise) || !validMoney(input.amountPaidPaise) || !validatePayment(input.paymentMethod)) {
    throw new Error('Check the invoice total, paid amount and payment method.');
  }
  if (!input.lines.length) throw new Error('Add at least one reconciled item before confirming.');
  const lineIds = new Set<string>();
  for (const line of input.lines) {
    if (!line.lineId.trim() || lineIds.has(line.lineId.trim())) throw new Error('Each delivery line needs a unique ID.');
    lineIds.add(line.lineId.trim());
    if (!line.catalogItemId.trim() || !line.name.trim() || !line.packSize.trim()) {
      throw new Error('Match every delivery line to an exact catalogue item.');
    }
    if (!['packet', 'piece', 'bottle', 'box', 'kg', 'quintal'].includes(line.unit)) {
      throw new Error('Choose a valid catalogue stock unit.');
    }
    const quantities = [line.billedQuantity, line.goodQuantity, line.damagedQuantity,
      line.missingQuantity, line.extraQuantity, line.acceptedExtraQuantity];
    if (quantities.some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_QUANTITY)) {
      throw new Error('Use valid whole-number quantities for each delivery line.');
    }
    if (line.billedQuantity !== line.goodQuantity + line.damagedQuantity + line.missingQuantity) {
      throw new Error('Billed quantity must equal good, damaged and missing billed units.');
    }
    if (line.billedQuantity === 0 && line.extraQuantity === 0) {
      throw new Error('A delivery line must include a billed item or received extra quantity.');
    }
    if (line.acceptedExtraQuantity > line.extraQuantity) {
      throw new Error('Accepted extra quantity cannot exceed the extra quantity received.');
    }
    if (line.goodQuantity + line.acceptedExtraQuantity > MAX_QUANTITY) {
      throw new Error('Saleable delivery quantity exceeds the allowed limit.');
    }
    const lots = line.lots ?? [];
    if (!Array.isArray(lots) || lots.some((lot) => !Number.isSafeInteger(lot.quantity) || lot.quantity < 1 || lot.quantity > MAX_QUANTITY)) {
      throw new Error('Enter valid whole-number quantities for each observed lot.');
    }
    const trackedQuantity = lots.reduce((total, lot) => total + lot.quantity, 0);
    if (trackedQuantity > saleableDeliveryQuantity(line)) {
      throw new Error('Lot quantities exceed the accepted receipt quantity.');
    }
  }
}

export function validateDeliveryReconciliationInput(input: DeliveryReconciliationInput): void {
  validateDeliveryInput(normalizedDeliveryInput(input));
}

export function saleableDeliveryQuantity(line: Pick<DeliveryReconciliationLineInput, 'goodQuantity' | 'acceptedExtraQuantity'>) {
  return line.goodQuantity + line.acceptedExtraQuantity;
}

export async function listDeliveryLotReceipts(
  mode: ShopMode,
  deliveryId?: string,
  today = businessDate(new Date().toISOString()),
): Promise<DeliveryLotReceiptSummary[]> {
  const asOfDate = checkedSupplierDueDate(today);
  if (!asOfDate) throw new Error('Enter a valid lot observation date.');
  const { reader } = await getDatabases();
  const deliveryFilter = deliveryId ? 'AND event.id = ?' : '';
  const params = deliveryId ? [mode, deliveryId] : [mode];
  const rows = await reader.getAllAsync<{
    deliveryId: string; lineId: string; catalogueItemId: string; name: string; packSize: string; unit: StockUnit;
    acceptedQuantity: number; lotId: string | null; quantity: number | null; batchCode: string | null;
    expiryDate: string | null; rejectedQuantity: number | null;
  }>(
    `SELECT event.id AS deliveryId, line.line_id AS lineId, line.catalogue_item_id AS catalogueItemId,
            line.name, line.pack_size AS packSize, line.unit,
            line.good_quantity + line.accepted_extra_quantity AS acceptedQuantity,
            lot.id AS lotId, lot.quantity, lot.batch_code AS batchCode, lot.expiry_date AS expiryDate,
            CASE WHEN lot.id IS NULL THEN 0 ELSE MAX(0, -COALESCE((
              SELECT SUM(movement.quantity_delta) FROM delivery_lot_stock_movement AS movement
               WHERE movement.mode = lot.mode AND movement.lot_id = lot.id
            ), 0)) END AS rejectedQuantity
       FROM delivery_event AS event
       JOIN delivery_line AS line ON line.mode = event.mode AND line.event_id = event.id
       LEFT JOIN delivery_reversal AS reversal ON reversal.mode = event.mode AND reversal.reverses_event_id = event.id
       LEFT JOIN delivery_lot_observation AS lot ON lot.mode = line.mode AND lot.delivery_id = line.event_id AND lot.line_position = line.position
      WHERE event.mode = ? AND reversal.id IS NULL ${deliveryFilter}
      ORDER BY event.created_at DESC, event.id, line.position, lot.id`,
    ...params,
  );
  const summaries = new Map<string, DeliveryLotReceiptSummary>();
  for (const row of rows) {
    const key = `${row.deliveryId}\u0000${row.lineId}`;
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        deliveryId: row.deliveryId, lineId: row.lineId, catalogueItemId: row.catalogueItemId,
        name: row.name, packSize: row.packSize, unit: row.unit, acceptedQuantity: row.acceptedQuantity,
        trackedQuantity: 0, untrackedQuantity: row.acceptedQuantity, usableObservedQuantity: 0,
        expiredQuantity: 0, rejectedQuantity: 0, lots: [],
      };
      summaries.set(key, summary);
    }
    if (!row.lotId || row.quantity === null) continue;
    const rejectedQuantity = Math.min(row.quantity, row.rejectedQuantity ?? 0);
    const remaining = row.quantity - rejectedQuantity;
    const expiredQuantity = row.expiryDate && row.expiryDate < asOfDate ? remaining : 0;
    const usableQuantity = remaining - expiredQuantity;
    summary.trackedQuantity += row.quantity;
    summary.rejectedQuantity += rejectedQuantity;
    summary.expiredQuantity += expiredQuantity;
    summary.usableObservedQuantity += usableQuantity;
    summary.lots.push({
      id: row.lotId, deliveryId: row.deliveryId, lineId: row.lineId,
      catalogueItemId: row.catalogueItemId, name: row.name, packSize: row.packSize, unit: row.unit,
      quantity: row.quantity, batchCode: row.batchCode, expiryDate: row.expiryDate,
      rejectedQuantity, expiredQuantity, usableQuantity,
    });
  }
  return [...summaries.values()].map((summary) => ({
    ...summary,
    untrackedQuantity: Math.max(0, summary.acceptedQuantity - summary.trackedQuantity),
  }));
}

export async function listDeliveryLotRejections(mode: ShopMode, deliveryId: string): Promise<DeliveryLotRejectionEvent[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{ id: string; lotId: string; quantityDelta: number; createdAt: string; payloadJson: string }>(
    `SELECT movement.id, movement.lot_id AS lotId, movement.quantity_delta AS quantityDelta,
            movement.created_at AS createdAt, movement.payload_json AS payloadJson
       FROM delivery_lot_stock_movement AS movement
       JOIN delivery_lot_observation AS lot ON lot.mode = movement.mode AND lot.id = movement.lot_id
      WHERE movement.mode = ? AND lot.delivery_id = ? AND movement.kind = 'rejection'
        AND NOT EXISTS (SELECT 1 FROM delivery_lot_stock_movement AS reversal
                         WHERE reversal.mode = movement.mode AND reversal.reverses_event_id = movement.id)
      ORDER BY movement.created_at DESC, movement.id DESC`, mode, deliveryId,
  );
  return rows.map((row) => ({
    id: row.id, lotId: row.lotId, quantity: Math.abs(row.quantityDelta), createdAt: row.createdAt,
    note: (JSON.parse(row.payloadJson) as { note?: string | null }).note ?? null,
  }));
}

export function rejectDeliveryLot(
  mode: ShopMode,
  operationId: string,
  lotId: string,
  quantity: number,
  note: string | null,
): Promise<DeliveryLotRejection> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    const checkedNote = checkedCustomerText(note, 'Lot rejection note', 500);
    if (!id || !lotId.trim()) throw new Error('Choose a received lot before rejecting stock.');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw new Error('Enter a valid rejected lot quantity.');
    const payload = { lotId, quantity, note: checkedNote };
    const prior = await db.getFirstAsync<{ id: string; payloadJson: string; createdAt: string }>(
      'SELECT id, payload_json AS payloadJson, created_at AS createdAt FROM delivery_lot_stock_movement WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.payloadJson !== JSON.stringify(payload)) throw new Error('This lot rejection operation ID was already used for different details.');
      return { id: prior.id, lotId, quantity, stockQuantityDelta: -quantity, createdAt: prior.createdAt };
    }
    const lot = await db.getFirstAsync<{ quantity: number; deliveryId: string; catalogueItemId: string; unit: StockUnit }>(
      `SELECT lot.quantity, lot.delivery_id AS deliveryId, line.catalogue_item_id AS catalogueItemId, line.unit
         FROM delivery_lot_observation AS lot
       JOIN delivery_line AS line ON line.mode = lot.mode AND line.event_id = lot.delivery_id AND line.position = lot.line_position
       JOIN delivery_event AS delivery ON delivery.mode = lot.mode AND delivery.id = lot.delivery_id
       LEFT JOIN delivery_reversal AS reversal ON reversal.mode = delivery.mode AND reversal.reverses_event_id = delivery.id
       WHERE lot.mode = ? AND lot.id = ? AND reversal.id IS NULL`, mode, lotId,
    );
    if (!lot) throw new Error('Choose an active lot from this shop.');
    const rejected = await db.getFirstAsync<{ quantity: number }>(
      'SELECT COALESCE(SUM(quantity_delta), 0) AS quantity FROM delivery_lot_stock_movement WHERE mode = ? AND lot_id = ?', mode, lotId,
    );
    if (quantity > lot.quantity + (rejected?.quantity ?? 0)) throw new Error('Rejected quantity exceeds the unrejected lot quantity.');
    const createdAt = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO delivery_lot_stock_movement (
         mode, id, operation_id, lot_id, catalogue_item_id, unit, quantity_delta, kind, created_at, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejection', ?, ?)`,
      mode, id, id, lotId, lot.catalogueItemId, lot.unit, -quantity, createdAt, JSON.stringify(payload),
    );
    return { id, lotId, quantity, stockQuantityDelta: -quantity, createdAt };
  });
}

export function reverseDeliveryLotRejection(
  mode: ShopMode,
  rejectionId: string,
  operationId: string,
): Promise<DeliveryLotRejection> {
  return writeTransaction(async (db) => {
    const original = await db.getFirstAsync<{ id: string; lotId: string; quantityDelta: number; catalogueItemId: string; unit: StockUnit; payloadJson: string }>(
      `SELECT movement.id, movement.lot_id AS lotId, movement.quantity_delta AS quantityDelta,
              movement.catalogue_item_id AS catalogueItemId, movement.unit, movement.payload_json AS payloadJson
         FROM delivery_lot_stock_movement AS movement
         JOIN delivery_lot_observation AS lot ON lot.mode = movement.mode AND lot.id = movement.lot_id
         LEFT JOIN delivery_reversal AS reversal ON reversal.mode = lot.mode AND reversal.reverses_event_id = lot.delivery_id
        WHERE movement.mode = ? AND movement.id = ? AND movement.kind = 'rejection' AND reversal.id IS NULL`,
      mode, rejectionId,
    );
    if (!original) throw new Error('This lot rejection is no longer available.');
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM delivery_lot_stock_movement WHERE mode = ? AND reverses_event_id = ?', mode, original.id,
    );
    const originalPayload = JSON.parse(original.payloadJson) as { quantity: number };
    if (existing) return { id: existing.id, lotId: original.lotId, quantity: originalPayload.quantity, stockQuantityDelta: originalPayload.quantity, createdAt: '' };
    const id = operationId.trim();
    if (!id) throw new Error('A lot rejection reversal operation ID is required.');
    const priorOperation = await db.getFirstAsync<{ id: string; payloadJson: string }>(
      'SELECT id, payload_json AS payloadJson FROM delivery_lot_stock_movement WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (priorOperation) {
      if (priorOperation.payloadJson !== JSON.stringify({ rejectionId: original.id })) throw new Error('This lot rejection reversal operation ID was already used for different details.');
      return { id: priorOperation.id, lotId: original.lotId, quantity: originalPayload.quantity, stockQuantityDelta: originalPayload.quantity, createdAt: '' };
    }
    const createdAt = new Date().toISOString();
    const payload = { rejectionId: original.id };
    await db.runAsync(
      `INSERT INTO delivery_lot_stock_movement (
         mode, id, operation_id, lot_id, catalogue_item_id, unit, quantity_delta, kind, created_at, reverses_event_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`,
      mode, id, id, original.lotId, original.catalogueItemId, original.unit, -original.quantityDelta, createdAt, original.id, JSON.stringify(payload),
    );
    return { id, lotId: original.lotId, quantity: originalPayload.quantity, stockQuantityDelta: originalPayload.quantity, createdAt };
  });
}

async function findDelivery(db: SQLiteDatabase, mode: ShopMode, id: string) {
  const rows = await db.getAllAsync<DeliveryLineRow>(
    `${DELIVERY_ROWS_QUERY} AND event.id = ? ORDER BY line.position`, mode, id,
  );
  return groupDeliveries(rows)[0] ?? null;
}

export async function listDeliveryReconciliations(
  mode: ShopMode,
  search = '',
): Promise<SavedDeliveryReconciliation[]> {
  const { reader } = await getDatabases();
  const query = search.trim().toLocaleLowerCase();
  const rows = query
    ? await reader.getAllAsync<DeliveryLineRow>(
      `${DELIVERY_ROWS_QUERY} AND (
        instr(lower(event.supplier), ?) > 0 OR event.business_date = ? OR EXISTS (
          SELECT 1 FROM delivery_line AS matching
          WHERE matching.mode = event.mode AND matching.event_id = event.id
            AND instr(lower(matching.name || ' ' || matching.pack_size), ?) > 0
        )
      ) ORDER BY event.created_at DESC, event.id DESC, line.position`,
      mode, query, query, query,
    )
    : await reader.getAllAsync<DeliveryLineRow>(
      `${DELIVERY_ROWS_QUERY} ORDER BY event.created_at DESC, event.id DESC, line.position`, mode,
    );
  return groupDeliveries(rows);
}

export async function readDeliveryReconciliation(
  mode: ShopMode,
  id: string,
): Promise<SavedDeliveryReconciliation | null> {
  const { reader } = await getDatabases();
  return findDelivery(reader, mode, id);
}

/**
 * Atomically records owner-confirmed delivery facts. `goodQuantity` covers saleable
 * billed units only; `extraQuantity` is physically received, unbilled overage.
 * Unresolved discrepancies do not change supplier payable: only invoice and
 * explicitly recorded payment amounts enter the supplier balance ledger.
 */
export function confirmDeliveryReconciliation(
  mode: ShopMode,
  operationId: string,
  rawInput: DeliveryReconciliationInput,
): Promise<SavedDeliveryReconciliation> {
  return writeTransaction(async (db) => {
    if (!operationId.trim()) throw new Error('A confirmation operation ID is required.');
    const eventId = operationId.trim();
    const requestedInput = normalizedDeliveryInput(rawInput);
    validateDeliveryInput(requestedInput);
    const supplierProfile = await ensureSupplierForName(db, mode, requestedInput.supplier);
    const input = { ...requestedInput, supplier: supplierProfile.name };
    const saved = await findDelivery(db, mode, eventId);
    if (saved) {
      const prior = await db.getFirstAsync<{ payloadJson: string }>(
        'SELECT payload_json AS payloadJson FROM delivery_event WHERE mode = ? AND id = ?', mode, eventId,
      );
      if (prior?.payloadJson !== JSON.stringify(input)) {
        throw new Error('This confirmation was already used for a different delivery.');
      }
      return saved;
    }

    const lines: DeliveryReconciliationLineInput[] = [];
    for (const line of input.lines) {
      const item = await db.getFirstAsync<{ name: string; packSize: string; unit: StockUnit }>(
        'SELECT name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?',
        mode, line.catalogItemId,
      );
      if (!item || item.name !== line.name || item.packSize !== line.packSize || item.unit !== line.unit) {
        throw new Error('A catalogue item changed. Review the selected variant and unit.');
      }
      lines.push(line);
    }

    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    const supplierKey = supplierProfile.id;
    await db.runAsync(
      `INSERT INTO delivery_event (
         mode, id, created_at, business_date, supplier, supplier_key, invoice_number,
         invoice_date, due_date, invoice_evidence_uris_json, invoice_total_paise, amount_paid_paise, payment_method, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mode, eventId, createdAt, date, input.supplier, supplierKey, input.invoiceNumber,
      input.invoiceDate, input.dueDate ?? null, JSON.stringify(input.invoiceEvidenceUris), input.invoiceTotalPaise,
      input.amountPaidPaise, input.paymentMethod,
      JSON.stringify(input),
    );

    for (const [position, line] of lines.entries()) {
      await db.runAsync(
        `INSERT INTO delivery_line (
           mode, event_id, position, line_id, catalogue_item_id, name, pack_size, unit,
           billed_quantity, good_quantity, damaged_quantity, missing_quantity,
           extra_quantity, accepted_extra_quantity
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        mode, eventId, position, line.lineId, line.catalogItemId, line.name, line.packSize,
        line.unit, line.billedQuantity, line.goodQuantity, line.damagedQuantity,
        line.missingQuantity, line.extraQuantity, line.acceptedExtraQuantity,
      );

      for (const [lotPosition, lot] of (line.lots ?? []).entries()) {
        await db.runAsync(
          `INSERT INTO delivery_lot_observation (
             mode, id, delivery_id, line_position, quantity, batch_code, expiry_date, observed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          mode, `${eventId}:lot:${position}:${lotPosition}`, eventId, position, lot.quantity,
          lot.batchCode, lot.expiryDate, createdAt,
        );
      }

      const saleableQuantity = saleableDeliveryQuantity(line);
      if (saleableQuantity > 0) {
        await db.runAsync(
          `INSERT INTO delivery_stock_movement (
             mode, event_id, position, catalogue_item_id, name, pack_size, unit, quantity_delta
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          mode, eventId, position, line.catalogItemId, line.name, line.packSize, line.unit, saleableQuantity,
        );
      }
      for (const [kind, quantity] of [
        ['damaged', line.damagedQuantity], ['missing', line.missingQuantity], ['extra', line.extraQuantity],
      ] as const) {
        if (quantity > 0) {
          await db.runAsync(
            `INSERT INTO delivery_discrepancy (mode, event_id, line_position, kind, quantity, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            mode, eventId, position, kind, quantity,
          );
        }
      }
    }

    const supplierEntries: { kind: 'invoice' | 'payment'; amountDeltaPaise: number; paymentMethod: PaymentMethod | null }[] = [
      { kind: 'invoice', amountDeltaPaise: input.invoiceTotalPaise, paymentMethod: null },
    ];
    if (input.amountPaidPaise !== null && input.amountPaidPaise > 0) {
      supplierEntries.push({ kind: 'payment', amountDeltaPaise: -input.amountPaidPaise, paymentMethod: input.paymentMethod });
    }
    for (const [position, entry] of supplierEntries.entries()) {
      await db.runAsync(
        `INSERT INTO supplier_balance_entry (
           mode, id, event_id, supplier_key, supplier, kind, amount_delta_paise,
           payment_method, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        mode, `${eventId}:${entry.kind}:${position}`, eventId, supplierKey,
        input.supplier, entry.kind, entry.amountDeltaPaise, entry.paymentMethod, createdAt,
      );
    }
    return {
      id: eventId, createdAt, businessDate: date, reversedAt: null, ...input, lines,
    };
  });
}

/** Records a compensating stock and supplier-ledger event; the original remains immutable. */
export function reverseDeliveryReconciliation(
  mode: ShopMode,
  id: string,
): Promise<SavedDeliveryReconciliation> {
  return writeTransaction(async (db) => {
    const delivery = await findDelivery(db, mode, id);
    if (!delivery) throw new Error('This delivery reconciliation is no longer available.');
    if (delivery.reversedAt) return delivery;
    const openClaims = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM supplier_claim WHERE mode = ? AND delivery_id = ?
       AND status NOT IN ('closed', 'resolved_credit_note', 'resolved_replacement', 'voided')`, mode, id,
    );
    if ((openClaims?.count ?? 0) > 0) throw new Error('Resolve or close the delivery claims before reversing the full delivery.');
    const claimAdjustments = await db.getFirstAsync<{ creditDelta: number; stockDelta: number }>(
      `SELECT
        COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_claim_credit_entry WHERE mode = ? AND invoice_id = ?), 0) AS creditDelta,
        COALESCE((SELECT SUM(quantity_delta) FROM supplier_claim_stock_movement WHERE mode = ? AND delivery_id = ?), 0) AS stockDelta`,
      mode, id, mode, id,
    );
    if (claimAdjustments?.creditDelta || claimAdjustments?.stockDelta) {
      throw new Error('Reverse confirmed claim credit notes and stock returns before reversing the full delivery.');
    }
    const lotAdjustments = await db.getFirstAsync<{ quantityDelta: number }>(
      `SELECT COALESCE(SUM(movement.quantity_delta), 0) AS quantityDelta
         FROM delivery_lot_stock_movement AS movement
         JOIN delivery_lot_observation AS lot ON lot.mode = movement.mode AND lot.id = movement.lot_id
        WHERE movement.mode = ? AND lot.delivery_id = ?`, mode, id,
    );
    if (lotAdjustments?.quantityDelta) throw new Error('Reverse lot rejection adjustments before reversing the full delivery.');

    const reversalId = newOperationId();
    const reversedAt = new Date().toISOString();
    const date = businessDate(reversedAt);
    await db.runAsync(
      `INSERT INTO delivery_reversal (mode, id, reverses_event_id, created_at, business_date)
       VALUES (?, ?, ?, ?, ?)`, mode, reversalId, id, reversedAt, date,
    );
    await db.runAsync(
      `INSERT INTO delivery_reversal_stock_movement (
         mode, reversal_id, position, catalogue_item_id, name, pack_size, unit, quantity_delta
       )
       SELECT mode, ?, position, catalogue_item_id, name, pack_size, unit, -quantity_delta
       FROM delivery_stock_movement WHERE mode = ? AND event_id = ?`,
      reversalId, mode, id,
    );
    const balanceRows = await db.getAllAsync<{
      id: string; supplierKey: string; supplier: string; amountDeltaPaise: number; paymentMethod: PaymentMethod | null;
    }>(
      `SELECT id, supplier_key AS supplierKey, supplier, amount_delta_paise AS amountDeltaPaise, payment_method AS paymentMethod
       FROM supplier_balance_entry WHERE mode = ? AND event_id = ? AND kind IN ('invoice', 'payment')`, mode, id,
    );
    for (const [position, entry] of balanceRows.entries()) {
      await db.runAsync(
        `INSERT INTO supplier_balance_entry (
           mode, id, event_id, supplier_key, supplier, kind, amount_delta_paise,
           payment_method, reverses_entry_id, created_at
         ) VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, ?, ?)`,
        mode, `${reversalId}:${position}`, id, entry.supplierKey, entry.supplier,
        -entry.amountDeltaPaise, entry.paymentMethod, entry.id, reversedAt,
      );
    }
    await db.runAsync(
      `UPDATE delivery_discrepancy SET status = 'voided' WHERE mode = ? AND event_id = ? AND status = 'pending'`,
      mode, id,
    );
    const claimsResolvedByThisReceipt = await db.getAllAsync<{ claimId: string; eventId: string; quantity: number; lineId: string | null }>(
      `SELECT event.claim_id AS claimId, event.id AS eventId, event.quantity,
        event.related_delivery_line_id AS lineId
       FROM supplier_claim_event AS event
       WHERE event.mode = ? AND event.related_delivery_id = ? AND event.kind = 'replacement_received'
         AND NOT EXISTS (SELECT 1 FROM supplier_claim_event AS reversal
           WHERE reversal.mode = event.mode AND reversal.reverses_event_id = event.id)`, mode, id,
    );
    for (const replacement of claimsResolvedByThisReceipt) {
      await appendSupplierClaimEvent(db, mode, newOperationId(), replacement.claimId, {
        kind: 'replacement_reversed', status: 'open', quantity: replacement.quantity,
        relatedDeliveryId: id, relatedDeliveryLineId: replacement.lineId,
        reversesEventId: replacement.eventId, payload: { replacementEventId: replacement.eventId },
      });
    }
    const claimsOnReversedSource = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM supplier_claim WHERE mode = ? AND delivery_id = ? AND status != \'voided\'', mode, id,
    );
    for (const claim of claimsOnReversedSource) {
      await appendSupplierClaimEvent(db, mode, newOperationId(), claim.id, {
        kind: 'voided', status: 'voided', note: 'Source delivery reversed',
        payload: { sourceDeliveryReversed: id },
      });
    }
    return { ...delivery, reversedAt };
  });
}

type SupplierClaimRow = {
  id: string; supplierId: string; supplier: string; deliveryId: string; linePosition: number;
  lineId: string; kind: SupplierClaimKind; quantity: number; note: string | null;
  status: SupplierClaimStatus; createdAt: string; itemName: string; packSize: string; unit: StockUnit;
};

async function readSupplierClaimWith(db: SQLiteDatabase, mode: ShopMode, claimId: string): Promise<SupplierClaim | null> {
  const header = await db.getFirstAsync<SupplierClaimRow>(`
    SELECT claim.id, claim.supplier_id AS supplierId, supplier.display_name AS supplier,
      claim.delivery_id AS deliveryId, claim.line_position AS linePosition, line.line_id AS lineId,
      claim.kind, claim.quantity, claim.note, claim.status, claim.created_at AS createdAt,
      line.name AS itemName, line.pack_size AS packSize, line.unit
    FROM supplier_claim AS claim
    JOIN supplier_profile AS supplier ON supplier.mode = claim.mode AND supplier.id = claim.supplier_id
    JOIN delivery_line AS line ON line.mode = claim.mode AND line.event_id = claim.delivery_id AND line.position = claim.line_position
    WHERE claim.mode = ? AND claim.id = ?`, mode, claimId);
  if (!header) return null;
  const events = await db.getAllAsync<SupplierClaimEvent>(`
    SELECT id, kind, quantity, amount_delta_paise AS amountDeltaPaise, reference, note,
      related_delivery_id AS relatedDeliveryId, related_delivery_line_id AS relatedDeliveryLineId,
      reverses_event_id AS reversesEventId, created_at AS createdAt
    FROM supplier_claim_event WHERE mode = ? AND claim_id = ? ORDER BY created_at, id`, mode, claimId);
  return { ...header, events };
}

async function readSupplierClaimByOperation(db: SQLiteDatabase, mode: ShopMode, operationId: string) {
  const row = await db.getFirstAsync<{ id: string; payloadJson: string }>(
    'SELECT id, payload_json AS payloadJson FROM supplier_claim WHERE mode = ? AND operation_id = ?', mode, operationId,
  );
  return row;
}

export async function listSupplierClaims(mode: ShopMode, deliveryId?: string): Promise<SupplierClaim[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{ id: string }>(
    `SELECT id FROM supplier_claim WHERE mode = ? ${deliveryId ? 'AND delivery_id = ?' : ''} ORDER BY created_at DESC, id DESC`,
    ...(deliveryId ? [mode, deliveryId] : [mode]),
  );
  const claims = await Promise.all(rows.map(({ id }) => readSupplierClaimWith(reader, mode, id)));
  return claims.filter((claim): claim is SupplierClaim => !!claim);
}

export async function readSupplierClaim(mode: ShopMode, claimId: string): Promise<SupplierClaim | null> {
  const { reader } = await getDatabases();
  return readSupplierClaimWith(reader, mode, claimId);
}

export function createSupplierClaim(mode: ShopMode, operationId: string, rawInput: SupplierClaimInput): Promise<SupplierClaim> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('A claim operation ID is required.');
    if (!Number.isSafeInteger(rawInput.quantity) || rawInput.quantity < 1 || rawInput.quantity > MAX_QUANTITY) {
      throw new Error('Claim quantity must be a positive whole number.');
    }
    if (!['damaged', 'missing', 'extra', 'return'].includes(rawInput.kind)) throw new Error('Choose a valid supplier claim type.');
    const note = checkedCustomerText(rawInput.note, 'Claim note', 500);
    const input = { deliveryId: rawInput.deliveryId.trim(), lineId: rawInput.lineId.trim(), kind: rawInput.kind, quantity: rawInput.quantity, note };
    if (!input.deliveryId || !input.lineId) throw new Error('Choose a delivery line for this claim.');
    const payloadJson = JSON.stringify(input);
    const prior = await readSupplierClaimByOperation(db, mode, id);
    if (prior) {
      if (prior.payloadJson !== payloadJson) throw new Error('This claim operation ID was already used for different details.');
      const saved = await readSupplierClaimWith(db, mode, prior.id);
      if (!saved) throw new Error('The saved supplier claim could not be read.');
      return saved;
    }
    const delivery = await findDelivery(db, mode, input.deliveryId);
    if (!delivery || delivery.reversedAt) throw new Error('Choose an active confirmed supplier delivery.');
    const supplier = await findSupplierRow(db, mode, delivery.supplier);
    if (!supplier) throw new Error('The delivery supplier profile could not be found.');
    const line = await db.getFirstAsync<{
      position: number; catalogueItemId: string; unit: StockUnit; damagedQuantity: number; missingQuantity: number;
      extraQuantity: number; acceptedExtraQuantity: number; goodQuantity: number;
    }>(`SELECT position, catalogue_item_id AS catalogueItemId, unit, damaged_quantity AS damagedQuantity,
      missing_quantity AS missingQuantity, extra_quantity AS extraQuantity,
      accepted_extra_quantity AS acceptedExtraQuantity, good_quantity AS goodQuantity
      FROM delivery_line WHERE mode = ? AND event_id = ? AND line_id = ?`, mode, input.deliveryId, input.lineId);
    if (!line) throw new Error('Choose an item line from this delivery.');
    const eligible = input.kind === 'damaged' ? line.damagedQuantity
      : input.kind === 'missing' ? line.missingQuantity
        : input.kind === 'extra' ? line.extraQuantity
          : line.goodQuantity + line.acceptedExtraQuantity;
    const alreadyClaimed = await db.getFirstAsync<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM supplier_claim
       WHERE mode = ? AND delivery_id = ? AND line_position = ? AND kind = ?`, mode, input.deliveryId, line.position, input.kind,
    );
    if (input.quantity + (alreadyClaimed?.quantity ?? 0) > eligible) throw new Error('Claim quantity exceeds the unclaimed discrepancy or received quantity.');
    await db.runAsync(`INSERT INTO supplier_claim (
      mode, id, operation_id, supplier_id, delivery_id, line_position, kind, quantity, note, status, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    mode, id, id, supplier.id, input.deliveryId, line.position, input.kind, input.quantity, note, new Date().toISOString(), payloadJson);
    await db.runAsync(`INSERT INTO supplier_claim_event (
      mode, id, operation_id, claim_id, kind, quantity, amount_delta_paise, reference, note,
      related_delivery_id, related_delivery_line_id, created_at, payload_json
    ) VALUES (?, ?, ?, ?, 'opened', ?, NULL, NULL, ?, NULL, NULL, ?, ?)`,
    mode, id, id, id, input.quantity, note, new Date().toISOString(), payloadJson);
    const saved = await readSupplierClaimWith(db, mode, id);
    if (!saved) throw new Error('The supplier claim could not be read after saving.');
    return saved;
  });
}

async function appendSupplierClaimEvent(
  db: SQLiteDatabase, mode: ShopMode, operationId: string, claimId: string,
  event: { kind: string; status: SupplierClaimStatus; quantity?: number | null; amountDeltaPaise?: number | null; reference?: string | null; note?: string | null; relatedDeliveryId?: string | null; relatedDeliveryLineId?: string | null; reversesEventId?: string | null; payload: unknown },
) {
  const id = operationId.trim();
  if (!id) throw new Error('A claim event operation ID is required.');
  const payloadJson = JSON.stringify({ claimId, ...event.payload as object, kind: event.kind });
  const prior = await db.getFirstAsync<{ id: string; claimId: string; payloadJson: string }>(
    'SELECT id, claim_id AS claimId, payload_json AS payloadJson FROM supplier_claim_event WHERE mode = ? AND operation_id = ?', mode, id,
  );
  if (prior) {
    if (prior.claimId !== claimId || prior.payloadJson !== payloadJson) throw new Error('This claim event operation ID was already used for different details.');
    return false;
  }
  await db.runAsync(`INSERT INTO supplier_claim_event (
    mode, id, operation_id, claim_id, kind, quantity, amount_delta_paise, reference, note,
    related_delivery_id, related_delivery_line_id, reverses_event_id, created_at, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, mode, id, id, claimId, event.kind,
  event.quantity ?? null, event.amountDeltaPaise ?? null, event.reference ?? null, event.note ?? null,
  event.relatedDeliveryId ?? null, event.relatedDeliveryLineId ?? null, event.reversesEventId ?? null, new Date().toISOString(), payloadJson);
  await db.runAsync('UPDATE supplier_claim SET status = ? WHERE mode = ? AND id = ?', event.status, mode, claimId);
  return true;
}

export function recordSupplierClaimResponse(
  mode: ShopMode, operationId: string, claimId: string,
  response: 'credit_promised' | 'replacement_promised' | 'rejected', note: string | null,
): Promise<SupplierClaim> {
  return writeTransaction(async (db) => {
    const claim = await readSupplierClaimWith(db, mode, claimId);
    if (!claim || ['closed', 'voided', 'resolved_credit_note', 'resolved_replacement'].includes(claim.status)) throw new Error('This supplier claim is not open for a response.');
    const checkedNote = checkedCustomerText(note, 'Supplier response note', 500);
    await appendSupplierClaimEvent(db, mode, operationId, claimId, {
      kind: response, status: response === 'rejected' ? 'disputed' : response,
      note: checkedNote, payload: { response, note: checkedNote },
    });
    const saved = await readSupplierClaimWith(db, mode, claimId);
    if (!saved) throw new Error('The supplier claim could not be read after its response.');
    return saved;
  });
}

export function closeSupplierClaim(mode: ShopMode, claimId: string, operationId: string, note: string | null): Promise<SupplierClaim> {
  return writeTransaction(async (db) => {
    const claim = await readSupplierClaimWith(db, mode, claimId);
    if (!claim || claim.status === 'voided') throw new Error('This supplier claim is no longer available.');
    const checkedNote = checkedCustomerText(note, 'Claim close note', 500);
    await appendSupplierClaimEvent(db, mode, operationId, claimId, {
      kind: 'closed', status: 'closed', note: checkedNote, payload: { note: checkedNote },
    });
    const saved = await readSupplierClaimWith(db, mode, claimId);
    if (!saved) throw new Error('The supplier claim could not be read after closing.');
    return saved;
  });
}

export function recordSupplierClaimReturn(
  mode: ShopMode, operationId: string, claimId: string, quantity: number, note: string | null,
): Promise<SupplierClaimReturnEvent> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('A return operation ID is required.');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw new Error('Return quantity must be a positive whole number.');
    const checkedNote = checkedCustomerText(note, 'Return note', 500);
    const payload = { claimId, quantity, note: checkedNote };
    const payloadJson = JSON.stringify({ ...payload, kind: 'return_handed_over' });
    const prior = await db.getFirstAsync<{ id: string; claimId: string; quantity: number; payloadJson: string }>(
      `SELECT id, claim_id AS claimId, quantity, payload_json AS payloadJson FROM supplier_claim_event
       WHERE mode = ? AND operation_id = ?`, mode, id,
    );
    if (prior) {
      if (prior.claimId !== claimId || prior.payloadJson !== payloadJson) throw new Error('This return operation ID was already used for different details.');
      const movement = await db.getFirstAsync<{ quantityDelta: number; createdAt: string }>(
        `SELECT movement.quantity_delta AS quantityDelta, event.created_at AS createdAt
         FROM supplier_claim_event AS event LEFT JOIN supplier_claim_stock_movement AS movement
           ON movement.mode = event.mode AND movement.id = event.id
         WHERE event.mode = ? AND event.id = ?`, mode, prior.id,
      );
      return { id: prior.id, claimId, quantity, stockQuantityDelta: movement?.quantityDelta ?? 0, note: checkedNote, createdAt: movement?.createdAt ?? '' };
    }
    const claim = await readSupplierClaimWith(db, mode, claimId);
    if (!claim || ['closed', 'voided', 'resolved_credit_note', 'resolved_replacement'].includes(claim.status)) throw new Error('This supplier claim is not open for a return.');
    if (claim.kind === 'missing') throw new Error('Missing goods cannot be returned.');
    const returned = await db.getFirstAsync<{ quantity: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'return_handed_over' THEN quantity ELSE -quantity END), 0) AS quantity
       FROM supplier_claim_event WHERE mode = ? AND claim_id = ? AND kind IN ('return_handed_over', 'return_reversed')`, mode, claimId,
    );
    if (quantity + (returned?.quantity ?? 0) > claim.quantity) throw new Error('Return quantity exceeds the open claim quantity.');
    const stockable = claim.kind === 'return' || claim.kind === 'extra';
    let stockQuantityDelta = 0;
    if (stockable) {
      const item = await db.getFirstAsync<{ acceptedExtraQuantity: number; goodQuantity: number; catalogueItemId: string; linePosition: number }>(
        `SELECT accepted_extra_quantity AS acceptedExtraQuantity, good_quantity AS goodQuantity,
          catalogue_item_id AS catalogueItemId, position AS linePosition
         FROM delivery_line WHERE mode = ? AND event_id = ? AND line_id = ?`, mode, claim.deliveryId, claim.lineId,
      );
      if (!item) throw new Error('The claim product line could not be read.');
      let stockReturnQuantity = quantity;
      if (claim.kind === 'extra') {
        const previousStockReturns = await db.getFirstAsync<{ quantity: number }>(
          'SELECT COALESCE(-SUM(quantity_delta), 0) AS quantity FROM supplier_claim_stock_movement WHERE mode = ? AND claim_id = ?', mode, claimId,
        );
        stockReturnQuantity = Math.min(quantity, Math.max(0, item.acceptedExtraQuantity - (previousStockReturns?.quantity ?? 0)));
      }
      const stock = await readStockQuantity(db, mode, item.catalogueItemId);
      if (stock < stockReturnQuantity) throw new Error('Returned quantity exceeds current recorded stock. Record a separate stock correction first if the count is wrong.');
      stockQuantityDelta = -stockReturnQuantity;
      if (stockQuantityDelta !== 0) await db.runAsync(`INSERT INTO supplier_claim_stock_movement (
        mode, id, operation_id, claim_id, delivery_id, line_position, catalogue_item_id, unit,
        quantity_delta, kind, created_at, reverses_event_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'return', ?, NULL, ?)`,
      mode, id, id, claimId, claim.deliveryId, claim.linePosition, item.catalogueItemId, claim.unit,
      stockQuantityDelta, new Date().toISOString(), payloadJson);
    }
    await appendSupplierClaimEvent(db, mode, id, claimId, {
      kind: 'return_handed_over', status: 'open', quantity, note: checkedNote, payload: payload,
    });
    const result = await db.getFirstAsync<{ createdAt: string }>(
      'SELECT created_at AS createdAt FROM supplier_claim_event WHERE mode = ? AND id = ?', mode, id,
    );
    return { id, claimId, quantity, stockQuantityDelta, note: checkedNote, createdAt: result?.createdAt ?? '' };
  });
}

export function reverseSupplierClaimReturn(mode: ShopMode, returnEventId: string, operationId: string): Promise<{ id: string; claimId: string; quantityDelta: number }> {
  return writeTransaction(async (db) => {
    const original = await db.getFirstAsync<{ id: string; claimId: string; quantity: number; payloadJson: string }>(
      `SELECT id, claim_id AS claimId, quantity, payload_json AS payloadJson FROM supplier_claim_event
       WHERE mode = ? AND id = ? AND kind = 'return_handed_over'`, mode, returnEventId,
    );
    if (!original) throw new Error('This supplier return is no longer available.');
    const previous = await db.getFirstAsync<{ id: string; claimId: string; quantity: number }>(
      `SELECT id, claim_id AS claimId, quantity FROM supplier_claim_event
       WHERE mode = ? AND reverses_event_id = ?`, mode, returnEventId,
    );
    if (previous) return { id: previous.id, claimId: previous.claimId, quantityDelta: Math.abs(previous.quantity) };
    const id = operationId.trim();
    if (!id) throw new Error('A return reversal operation ID is required.');
    const existingOp = await db.getFirstAsync<{ id: string; payloadJson: string }>(
      'SELECT id, payload_json AS payloadJson FROM supplier_claim_event WHERE mode = ? AND operation_id = ?', mode, id,
    );
    const payload = { returnEventId };
    if (existingOp) {
      if (existingOp.payloadJson !== JSON.stringify({ claimId: original.claimId, ...payload, kind: 'return_reversed' })) throw new Error('This return reversal operation ID was already used for different details.');
      return { id, claimId: original.claimId, quantityDelta: original.quantity };
    }
    const movement = await db.getFirstAsync<{ catalogueItemId: string; deliveryId: string; linePosition: number; unit: StockUnit; quantityDelta: number }>(
      `SELECT catalogue_item_id AS catalogueItemId, delivery_id AS deliveryId, line_position AS linePosition,
        unit, quantity_delta AS quantityDelta FROM supplier_claim_stock_movement
       WHERE mode = ? AND id = ? AND kind = 'return'`, mode, returnEventId,
    );
    if (movement) {
      await db.runAsync(`INSERT INTO supplier_claim_stock_movement (
        mode, id, operation_id, claim_id, delivery_id, line_position, catalogue_item_id, unit,
        quantity_delta, kind, created_at, reverses_event_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`, mode, id, id, original.claimId,
      movement.deliveryId, movement.linePosition, movement.catalogueItemId, movement.unit,
      -movement.quantityDelta, new Date().toISOString(), returnEventId, JSON.stringify(payload));
    }
    await appendSupplierClaimEvent(db, mode, id, original.claimId, {
      kind: 'return_reversed', status: 'open', quantity: -original.quantity,
      note: null, reversesEventId: returnEventId, payload,
    });
    return { id, claimId: original.claimId, quantityDelta: original.quantity };
  });
}

export function recordSupplierClaimCreditNote(
  mode: ShopMode, operationId: string, claimId: string, input: { amountPaise: number; reference: string | null; note: string | null },
): Promise<SupplierClaim> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('A credit-note operation ID is required.');
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_MONEY_PAISE) throw new Error('Enter a positive credit-note amount.');
    const reference = checkedCustomerText(input.reference, 'Credit-note reference', 120);
    const note = checkedCustomerText(input.note, 'Credit-note note', 500);
    const payload = { claimId, amountPaise: input.amountPaise, reference, note };
    const payloadJson = JSON.stringify(payload);
    const prior = await db.getFirstAsync<{ id: string; payloadJson: string; claimId: string }>(
      'SELECT id, payload_json AS payloadJson, claim_id AS claimId FROM supplier_claim_credit_entry WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.claimId !== claimId || prior.payloadJson !== payloadJson) throw new Error('This credit-note operation ID was already used for different details.');
      const saved = await readSupplierClaimWith(db, mode, claimId);
      if (!saved) throw new Error('The saved supplier claim could not be read.');
      return saved;
    }
    const claim = await readSupplierClaimWith(db, mode, claimId);
    if (!claim || ['closed', 'voided', 'resolved_credit_note', 'resolved_replacement'].includes(claim.status)) throw new Error('This supplier claim is not open for a credit note.');
    const invoice = await db.getFirstAsync<{ supplierId: string; totalPaise: number; amountPaidPaise: number | null; allocatedPaise: number; creditsPaise: number; reversed: number }>(
      `SELECT delivery.supplier_key AS supplierId, delivery.invoice_total_paise AS totalPaise,
        delivery.amount_paid_paise AS amountPaidPaise,
        COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_payment_allocation WHERE mode = delivery.mode AND invoice_delivery_id = delivery.id), 0) AS allocatedPaise,
        COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_claim_credit_entry WHERE mode = delivery.mode AND invoice_id = delivery.id), 0) AS creditsPaise,
        EXISTS(SELECT 1 FROM delivery_reversal WHERE mode = delivery.mode AND reverses_event_id = delivery.id) AS reversed
       FROM delivery_event AS delivery WHERE delivery.mode = ? AND delivery.id = ?`, mode, claim.deliveryId,
    );
    if (!invoice || invoice.supplierId !== claim.supplierId || invoice.reversed) throw new Error('The claim invoice is no longer active.');
    const invoiceOpen = invoice.totalPaise - (invoice.amountPaidPaise ?? 0) + invoice.allocatedPaise + invoice.creditsPaise;
    if (input.amountPaise > invoiceOpen) throw new Error('Credit note exceeds the linked invoice amount remaining.');
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    await db.runAsync(`INSERT INTO supplier_claim_credit_entry (
      mode, id, operation_id, claim_id, supplier_id, invoice_id, kind, amount_delta_paise,
      reference, note, created_at, business_date, reverses_event_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, 'credit_note', ?, ?, ?, ?, ?, NULL, ?)`,
    mode, id, id, claimId, claim.supplierId, claim.deliveryId, -input.amountPaise, reference, note, createdAt, date, payloadJson);
    await appendSupplierClaimEvent(db, mode, id, claimId, {
      kind: 'credit_note_confirmed', status: 'resolved_credit_note', amountDeltaPaise: -input.amountPaise,
      reference, note, payload,
    });
    const saved = await readSupplierClaimWith(db, mode, claimId);
    if (!saved) throw new Error('The supplier claim could not be read after credit-note confirmation.');
    return saved;
  });
}

export function reverseSupplierClaimCreditNote(mode: ShopMode, creditNoteId: string, operationId: string): Promise<SupplierClaimCreditEvent> {
  return writeTransaction(async (db) => {
    const original = await db.getFirstAsync<SupplierClaimCreditEvent & { kind: string; payloadJson: string }>(
      `SELECT id, claim_id AS claimId, supplier_id AS supplierId, invoice_id AS invoiceId,
        amount_delta_paise AS amountDeltaPaise, reference, note, reverses_event_id AS reversesEventId,
        created_at AS createdAt, kind, payload_json AS payloadJson
       FROM supplier_claim_credit_entry WHERE mode = ? AND id = ?`, mode, creditNoteId,
    );
    if (!original || original.kind !== 'credit_note') throw new Error('This supplier credit note is no longer available.');
    const previous = await db.getFirstAsync<SupplierClaimCreditEvent>(
      `SELECT id, claim_id AS claimId, supplier_id AS supplierId, invoice_id AS invoiceId,
        amount_delta_paise AS amountDeltaPaise, reference, note, reverses_event_id AS reversesEventId,
        created_at AS createdAt FROM supplier_claim_credit_entry WHERE mode = ? AND reverses_event_id = ?`, mode, creditNoteId,
    );
    if (previous) return previous;
    const id = operationId.trim();
    if (!id) throw new Error('A credit-note reversal operation ID is required.');
    const payload = { reversesEventId: creditNoteId };
    const prior = await db.getFirstAsync<{ payloadJson: string; id: string }>(
      'SELECT payload_json AS payloadJson, id FROM supplier_claim_credit_entry WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.payloadJson !== JSON.stringify(payload)) throw new Error('This credit-note reversal operation ID was already used for different details.');
      const found = await db.getFirstAsync<SupplierClaimCreditEvent>(
        `SELECT id, claim_id AS claimId, supplier_id AS supplierId, invoice_id AS invoiceId,
          amount_delta_paise AS amountDeltaPaise, reference, note, reverses_event_id AS reversesEventId,
          created_at AS createdAt FROM supplier_claim_credit_entry WHERE mode = ? AND id = ?`, mode, prior.id,
      );
      if (!found) throw new Error('The credit-note reversal could not be read.');
      return found;
    }
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    await db.runAsync(`INSERT INTO supplier_claim_credit_entry (
      mode, id, operation_id, claim_id, supplier_id, invoice_id, kind, amount_delta_paise,
      reference, note, created_at, business_date, reverses_event_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, 'reversal', ?, ?, ?, ?, ?, ?, ?)`,
    mode, id, id, original.claimId, original.supplierId, original.invoiceId, -original.amountDeltaPaise,
    original.reference, original.note, createdAt, date, original.id, JSON.stringify(payload));
    await appendSupplierClaimEvent(db, mode, id, original.claimId, {
      kind: 'credit_note_reversed', status: 'open', amountDeltaPaise: -original.amountDeltaPaise,
      reference: original.reference, note: original.note, payload,
    });
    return {
      id, claimId: original.claimId, supplierId: original.supplierId, invoiceId: original.invoiceId,
      amountDeltaPaise: -original.amountDeltaPaise, reference: original.reference, note: original.note,
      reversesEventId: original.id, createdAt,
    };
  });
}

export function recordSupplierClaimReplacement(
  mode: ShopMode, operationId: string, claimId: string, deliveryId: string, lineId: string,
): Promise<SupplierClaim> {
  return writeTransaction(async (db) => {
    const id = operationId.trim();
    if (!id) throw new Error('A replacement-link operation ID is required.');
    const payload = { claimId, deliveryId, lineId };
    const payloadJson = JSON.stringify({ ...payload, kind: 'replacement_received' });
    const prior = await db.getFirstAsync<{ id: string; payloadJson: string; claimId: string }>(
      'SELECT id, payload_json AS payloadJson, claim_id AS claimId FROM supplier_claim_event WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (prior) {
      if (prior.claimId !== claimId || prior.payloadJson !== payloadJson) throw new Error('This replacement operation ID was already used for different details.');
      const saved = await readSupplierClaimWith(db, mode, claimId);
      if (!saved) throw new Error('The supplier claim could not be read.');
      return saved;
    }
    const claim = await readSupplierClaimWith(db, mode, claimId);
    const receipt = await findDelivery(db, mode, deliveryId);
    if (!claim || !receipt || receipt.reversedAt || ['closed', 'voided', 'resolved_credit_note', 'resolved_replacement'].includes(claim.status)) throw new Error('Choose an open claim and an active confirmed replacement receipt.');
    if (deliveryId === claim.deliveryId) throw new Error('A claim cannot be resolved by its original delivery.');
    const replacementLine = await db.getFirstAsync<{ position: number; catalogueItemId: string; unit: StockUnit; goodQuantity: number; acceptedExtraQuantity: number }>(
      `SELECT position, catalogue_item_id AS catalogueItemId, unit, good_quantity AS goodQuantity,
        accepted_extra_quantity AS acceptedExtraQuantity FROM delivery_line WHERE mode = ? AND event_id = ? AND line_id = ?`, mode, deliveryId, lineId,
    );
    const originLine = await db.getFirstAsync<{ catalogueItemId: string; unit: StockUnit }>(
      'SELECT catalogue_item_id AS catalogueItemId, unit FROM delivery_line WHERE mode = ? AND event_id = ? AND position = ?',
      mode, claim.deliveryId, claim.linePosition,
    );
    if (!replacementLine || !originLine || receipt.supplier !== claim.supplier || replacementLine.catalogueItemId !== originLine.catalogueItemId || replacementLine.unit !== originLine.unit) {
      throw new Error('The replacement receipt must match the claim supplier, product and unit.');
    }
    if (replacementLine.goodQuantity + replacementLine.acceptedExtraQuantity < claim.quantity) throw new Error('The replacement receipt does not contain enough accepted quantity for this claim.');
    await appendSupplierClaimEvent(db, mode, id, claimId, {
      kind: 'replacement_received', status: 'resolved_replacement', quantity: claim.quantity,
      relatedDeliveryId: deliveryId, relatedDeliveryLineId: lineId,
      payload,
    });
    const saved = await readSupplierClaimWith(db, mode, claimId);
    if (!saved) throw new Error('The supplier claim could not be read after linking its replacement.');
    return saved;
  });
}

async function readStockQuantity(db: SQLiteDatabase, mode: ShopMode, catalogueItemId: string) {
  const row = await db.getFirstAsync<{ quantity: number }>(`SELECT COALESCE(SUM(quantity_delta), 0) AS quantity FROM (
    SELECT quantity_delta FROM stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM delivery_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM delivery_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM stock_adjustment WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM customer_credit_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM retail_sale_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM retail_sale_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM supplier_claim_stock_movement WHERE mode = ? AND catalogue_item_id = ?
    UNION ALL SELECT quantity_delta FROM delivery_lot_stock_movement WHERE mode = ? AND catalogue_item_id = ?
  )`, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId, mode, catalogueItemId);
  return row?.quantity ?? 0;
}

/** Returns confirmed invoice amounts less payments and confirmed credit notes. */
export async function readSupplierBalance(mode: ShopMode, supplier: string): Promise<number> {
  const { reader } = await getDatabases();
  const profile = await findSupplierRow(reader, mode, supplier);
  const supplierId = profile?.id ?? deliverySupplierKey(supplier);
  const row = await reader.getFirstAsync<{ balancePaise: number }>(
    `SELECT
       COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_balance_entry
                  WHERE mode = ? AND supplier_key = ?), 0) +
       COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_payment_event
                  WHERE mode = ? AND supplier_id = ?), 0) +
       COALESCE((SELECT SUM(amount_delta_paise) FROM supplier_claim_credit_entry
                  WHERE mode = ? AND supplier_id = ?), 0) AS balancePaise`,
    mode, supplierId, mode, supplierId, mode, supplierId,
  );
  return row?.balancePaise ?? 0;
}

function normalizeCustomerName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function checkedCustomerName(value: string) {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 120) throw new Error('Enter a customer name up to 120 characters.');
  return name;
}

async function insertCustomerForHomeBatch(
  db: SQLiteDatabase,
  mode: ShopMode,
  id: string,
  input: NewCustomerInput,
) {
  const customerId = id.trim();
  if (!customerId || customerId.length > 160) throw new Error('Could not create a customer from this note.');
  const name = checkedCustomerName(input.name);
  const aliases = [...new Set(input.aliases.map(checkedCustomerName))]
    .filter((alias) => normalizeCustomerName(alias) !== normalizeCustomerName(name));
  const identities = [...new Set([name, ...aliases].map(normalizeCustomerName))];
  for (const identity of identities) {
    const collision = await db.getFirstAsync<{ id: string; name: string }>(
      `SELECT customer.id, customer.display_name AS name
         FROM customer
         LEFT JOIN customer_alias AS alias ON alias.mode = customer.mode AND alias.customer_id = customer.id
        WHERE customer.mode = ? AND customer.archived_at IS NULL
          AND (customer.normalized_name = ? OR alias.alias_key = ?)
        LIMIT 1`, mode, identity, identity,
    );
    if (collision) throw new Error(`“${name}” may already be saved as ${collision.name}. Choose that customer instead.`);
  }
  const createdAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO customer (mode, id, display_name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)',
    mode, customerId, name, normalizeCustomerName(name), createdAt,
  );
  for (const alias of aliases) {
    await db.runAsync(
      'INSERT INTO customer_alias (mode, id, customer_id, alias, alias_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      mode, newOperationId(), customerId, alias, normalizeCustomerName(alias), createdAt,
    );
  }
  return { id: customerId, name, aliases, createdAt, balancePaise: 0, openPromiseCount: 0 } satisfies Customer;
}

function checkedCustomerText(value: string | null, field: string, maxLength: number) {
  const text = value?.normalize('NFKC').trim() || null;
  if (text && text.length > maxLength) throw new Error(`${field} is too long.`);
  return text;
}

function checkedDueDate(value: string | null) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Enter a valid promise date.');
  const [year, month, day] = value.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) {
    throw new Error('Enter a valid promise date.');
  }
  return value;
}

function checkedSupplierDueDate(value: string | null | undefined) {
  if (value === undefined || value === null || value.trim() === '') return null;
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('Enter a valid invoice due date in YYYY-MM-DD format.');
  const [year, month, day] = date.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) {
    throw new Error('Enter a valid invoice due date.');
  }
  return date;
}

export async function listCustomers(mode: ShopMode): Promise<Customer[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<{
    id: string;
    name: string;
    createdAt: string;
    balancePaise: number;
    openPromiseCount: number;
    alias: string | null;
  }>(
    `SELECT c.id, c.display_name AS name, c.created_at AS createdAt,
            COALESCE(b.balance_paise, 0) AS balancePaise,
            COALESCE(p.open_count, 0) AS openPromiseCount,
            a.alias
       FROM customer AS c
       LEFT JOIN (
         SELECT mode, customer_id, SUM(amount_delta_paise) AS balance_paise
           FROM customer_credit_event GROUP BY mode, customer_id
       ) AS b ON b.mode = c.mode AND b.customer_id = c.id
       LEFT JOIN (
         SELECT mode, customer_id, COUNT(*) AS open_count
           FROM promise_to_pay WHERE status = 'open' GROUP BY mode, customer_id
       ) AS p ON p.mode = c.mode AND p.customer_id = c.id
       LEFT JOIN customer_alias AS a ON a.mode = c.mode AND a.customer_id = c.id
      WHERE c.mode = ? AND c.archived_at IS NULL
      ORDER BY c.display_name COLLATE NOCASE, a.alias COLLATE NOCASE`,
    mode,
  );
  const customers = new Map<string, Customer>();
  for (const row of rows) {
    let customer = customers.get(row.id);
    if (!customer) {
      customer = { id: row.id, name: row.name, createdAt: row.createdAt, balancePaise: row.balancePaise, openPromiseCount: row.openPromiseCount, aliases: [] };
      customers.set(row.id, customer);
    }
    if (row.alias) customer.aliases.push(row.alias);
  }
  return [...customers.values()];
}

export async function createCustomer(mode: ShopMode, id: string, input: NewCustomerInput): Promise<Customer> {
  const name = checkedCustomerName(input.name);
  const aliases = [...new Set(input.aliases.map((value) => checkedCustomerName(value)))].filter((alias) => normalizeCustomerName(alias) !== normalizeCustomerName(name));
  const createdAt = new Date().toISOString();
  await writeTransaction(async (db) => {
    await db.runAsync(
      'INSERT INTO customer (mode, id, display_name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)',
      mode, id, name, normalizeCustomerName(name), createdAt,
    );
    for (const alias of aliases) {
      await db.runAsync(
        'INSERT INTO customer_alias (mode, id, customer_id, alias, alias_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        mode, newOperationId(), id, alias, normalizeCustomerName(alias), createdAt,
      );
    }
  });
  return { id, name, aliases, createdAt, balancePaise: 0, openPromiseCount: 0 };
}

export async function findCustomersByAlias(mode: ShopMode, phrase: string): Promise<CustomerMatch[]> {
  const query = normalizeCustomerName(phrase);
  if (!query) return [];
  const { reader } = await getDatabases();
  return reader.getAllAsync<CustomerMatch>(
    `SELECT DISTINCT c.id, c.display_name AS name,
            CASE WHEN c.normalized_name = ? THEN c.display_name ELSE a.alias END AS matchedAlias
       FROM customer AS c
       LEFT JOIN customer_alias AS a ON a.mode = c.mode AND a.customer_id = c.id
      WHERE c.mode = ? AND c.archived_at IS NULL AND (c.normalized_name = ? OR a.alias_key = ?)
      ORDER BY c.display_name COLLATE NOCASE`,
    query, mode, query, query,
  );
}

export async function readCustomerBalance(mode: ShopMode, customerId: string): Promise<number> {
  const { reader } = await getDatabases();
  const row = await reader.getFirstAsync<{ balancePaise: number | null }>(
    'SELECT SUM(amount_delta_paise) AS balancePaise FROM customer_credit_event WHERE mode = ? AND customer_id = ?',
    mode, customerId,
  );
  return row?.balancePaise ?? 0;
}

function customerEventFromRow(row: {
  id: string;
  customerId: string;
  kind: CustomerCreditKind;
  amountDeltaPaise: number;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  sourceText: string | null;
  createdAt: string;
  businessDate: string;
  reversesEventId: string | null;
}): CustomerCreditEvent {
  return {
    id: row.id,
    customerId: row.customerId,
    kind: row.kind,
    amountPaise: Math.abs(row.amountDeltaPaise),
    amountDeltaPaise: row.amountDeltaPaise,
    paymentMethod: row.paymentMethod,
    note: row.note,
    sourceText: row.sourceText,
    createdAt: row.createdAt,
    businessDate: row.businessDate,
    reversesEventId: row.reversesEventId,
    lines: [],
  };
}

async function readCustomerCreditLines(db: SQLiteDatabase, mode: ShopMode, eventId: string): Promise<CustomerCreditLine[]> {
  return db.getAllAsync<CustomerCreditLine>(
    `SELECT catalogue_item_id AS catalogueItemId, name, pack_size AS packSize, unit, quantity, amount_paise AS amountPaise
       FROM customer_credit_line WHERE mode = ? AND event_id = ? ORDER BY position`, mode, eventId,
  );
}

const customerEventSelect = `SELECT id, customer_id AS customerId, kind,
  amount_delta_paise AS amountDeltaPaise, payment_method AS paymentMethod, note,
  source_text AS sourceText, created_at AS createdAt, business_date AS businessDate,
  reverses_event_id AS reversesEventId FROM customer_credit_event`;

export async function listCustomerCreditEvents(mode: ShopMode, customerId: string): Promise<CustomerCreditEvent[]> {
  const { reader } = await getDatabases();
  const rows = await reader.getAllAsync<Parameters<typeof customerEventFromRow>[0]>(
    `${customerEventSelect} WHERE mode = ? AND customer_id = ? ORDER BY created_at DESC, id DESC`, mode, customerId,
  );
  return Promise.all(rows.map(async (row) => {
    const event = customerEventFromRow(row);
    return { ...event, lines: await readCustomerCreditLines(reader, mode, event.id) };
  }));
}

function prepareCustomerCreditEvent(input: CustomerCreditInput) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_MONEY_PAISE) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (input.kind === 'repayment_received' && input.paymentMethod !== null && !['cash', 'upi', 'card', 'bank_transfer', 'other'].includes(input.paymentMethod)) {
    throw new Error('Choose a valid payment method.');
  }
  if (input.kind !== 'repayment_received' && input.paymentMethod !== null) throw new Error('Payment method is only valid for a repayment.');
  const note = checkedCustomerText(input.note, 'Note', 500);
  const sourceText = checkedCustomerText(input.sourceText, 'Source text', 2_000);
  const lines = (input.lines ?? []).map((line) => ({ ...line }));
  if (lines.length > 0) {
    if (input.kind !== 'credit_sale') throw new Error('Only a credit sale can include product lines.');
    if (lines.some((line) => !line.catalogueItemId.trim()
      || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > MAX_QUANTITY
      || !Number.isSafeInteger(line.amountPaise) || line.amountPaise <= 0 || line.amountPaise > MAX_MONEY_PAISE)) {
      throw new Error('Check each product quantity and amount.');
    }
    const lineTotal = lines.reduce((sum, line) => sum + line.amountPaise, 0);
    if (!Number.isSafeInteger(lineTotal) || lineTotal !== input.amountPaise) {
      throw new Error('Product line amounts must equal the credit sale amount.');
    }
  }
  const normalizedInput = { ...input, lines, note, sourceText };
  const payloadJson = JSON.stringify(normalizedInput);
  const amountDeltaPaise = input.kind === 'credit_sale' ? input.amountPaise : -input.amountPaise;
  return { normalizedInput, payloadJson, amountDeltaPaise };
}

async function persistCustomerCreditEvent(
  db: SQLiteDatabase,
  mode: ShopMode,
  operationId: string,
  prepared: ReturnType<typeof prepareCustomerCreditEvent>,
): Promise<CustomerCreditEvent> {
  const { normalizedInput, payloadJson, amountDeltaPaise } = prepared;
  const now = new Date().toISOString();
  const date = businessDate(now);
  const existing = await db.getFirstAsync<{ id: string; payloadJson: string }>(
    'SELECT id, payload_json AS payloadJson FROM customer_credit_event WHERE mode = ? AND operation_id = ?', mode, operationId,
  );
  if (existing) {
    if (existing.payloadJson !== payloadJson) throw new Error('This save ID is already used for a different customer entry.');
    const row = await db.getFirstAsync<Parameters<typeof customerEventFromRow>[0]>(
      `${customerEventSelect} WHERE mode = ? AND id = ?`, mode, existing.id,
    );
    if (!row) throw new Error('The saved customer entry could not be read.');
    const event = customerEventFromRow(row);
    return { ...event, lines: await readCustomerCreditLines(db, mode, event.id) };
  }
  const customer = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM customer WHERE mode = ? AND id = ? AND archived_at IS NULL', mode, normalizedInput.customerId,
  );
  if (!customer) throw new Error('Choose a customer from this shop.');
  const catalogLines: CustomerCreditLine[] = [];
  for (const line of normalizedInput.lines) {
    const catalog = await db.getFirstAsync<{ id: string; name: string; packSize: string; unit: StockUnit }>(
      'SELECT id, name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?',
      mode, line.catalogueItemId,
    );
    if (!catalog) throw new Error('Choose a product from this shop catalogue.');
    const stock = await db.getFirstAsync<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS quantity FROM (
         SELECT quantity_delta FROM stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM stock_adjustment WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM customer_credit_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM retail_sale_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM retail_sale_reversal_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM supplier_claim_stock_movement WHERE mode = ? AND catalogue_item_id = ?
         UNION ALL SELECT quantity_delta FROM delivery_lot_stock_movement WHERE mode = ? AND catalogue_item_id = ?
      )`, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id, mode, catalog.id,
    );
    if (!stock || stock.quantity < line.quantity) {
      throw new Error(`Not enough ${catalog.name} (${catalog.packSize}) in recorded stock. Update stock and try again.`);
    }
    catalogLines.push({ ...line, name: catalog.name, packSize: catalog.packSize, unit: catalog.unit });
  }
  await db.runAsync(
    `INSERT INTO customer_credit_event (
      mode, id, operation_id, customer_id, kind, amount_delta_paise, payment_method,
      note, source_text, created_at, business_date, reverses_event_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    mode, operationId, operationId, normalizedInput.customerId, normalizedInput.kind, amountDeltaPaise,
    normalizedInput.paymentMethod, normalizedInput.note, normalizedInput.sourceText, now, date, payloadJson,
  );
  for (const [position, line] of catalogLines.entries()) {
    await db.runAsync(
      `INSERT INTO customer_credit_line (mode, event_id, position, catalogue_item_id, name, pack_size, unit, quantity, amount_paise)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mode, operationId, position, line.catalogueItemId, line.name, line.packSize, line.unit, line.quantity, line.amountPaise,
    );
    await db.runAsync(
      `INSERT INTO customer_credit_stock_movement (mode, event_id, position, catalogue_item_id, quantity_delta)
       VALUES (?, ?, ?, ?, ?)`, mode, operationId, position, line.catalogueItemId, -line.quantity,
    );
  }
  return {
    id: operationId, ...normalizedInput, lines: catalogLines, amountDeltaPaise, createdAt: now,
    businessDate: date, reversesEventId: null,
  };
}

export async function confirmCustomerCreditEvent(
  mode: ShopMode,
  operationId: string,
  input: CustomerCreditInput,
): Promise<CustomerCreditEvent> {
  const prepared = prepareCustomerCreditEvent(input);
  return writeTransaction((db) => persistCustomerCreditEvent(db, mode, operationId, prepared));
}

/** Records a quantity-only customer sale without inventing an amount or credit balance. */
async function persistRetailSale(
  db: SQLiteDatabase,
  mode: ShopMode,
  operationId: string,
  input: RetailSaleInput,
): Promise<RetailSaleEvent> {
  const id = operationId.trim();
  const customerLabel = input.customerLabel.trim();
  const sourceText = input.sourceText.trim();
  if (!id || !customerLabel || !sourceText || input.lines.length === 0) throw new Error('A customer and at least one product are required.');
  if (!['unknown', 'cash', 'credit'].includes(input.paymentState)) throw new Error('Choose a valid payment state.');
  if (input.amountPaise !== null && (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_MONEY_PAISE)) throw new Error('Enter a valid sale amount.');
  if (input.paymentState === 'credit' && input.amountPaise === null) throw new Error('A credit sale requires an amount; use an unresolved sale note until it is known.');
  const payload = JSON.stringify({ ...input, customerLabel, sourceText });
    const existing = await db.getFirstAsync<{ payloadJson: string }>(
      'SELECT payload_json AS payloadJson FROM retail_sale_event WHERE mode = ? AND operation_id = ?', mode, id,
    );
    if (existing) {
      if (existing.payloadJson !== payload) throw new Error('This save ID is already used for a different sale.');
      const row = await db.getFirstAsync<{ id: string; createdAt: string; businessDate: string }>(
        'SELECT id, created_at AS createdAt, business_date AS businessDate FROM retail_sale_event WHERE mode = ? AND operation_id = ?', mode, id,
      );
      if (!row) throw new Error('The saved sale could not be read.');
      return { ...input, customerLabel, sourceText, id: row.id, createdAt: row.createdAt, businessDate: row.businessDate };
    }
    if (input.customerId) {
      const customer = await db.getFirstAsync<{ id: string }>('SELECT id FROM customer WHERE mode = ? AND id = ? AND archived_at IS NULL', mode, input.customerId);
      if (!customer) throw new Error('Choose a customer from this shop.');
    }
    const lines: { catalogueItemId: string; name: string; packSize: string; unit: StockUnit; quantity: number }[] = [];
    const productIds = new Set<string>();
    for (const line of input.lines) {
      if (productIds.has(line.catalogueItemId)) throw new Error('Combine quantities for the same product before saving.');
      productIds.add(line.catalogueItemId);
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) throw new Error('Check the product quantity.');
      const item = await db.getFirstAsync<{ id: string; name: string; packSize: string; unit: StockUnit }>(
        'SELECT id, name, pack_size AS packSize, unit FROM catalogue_item WHERE mode = ? AND id = ?', mode, line.catalogueItemId,
      );
      if (!item) throw new Error('Choose a product from this shop catalogue.');
      if (await readStockQuantity(db, mode, item.id) < line.quantity) throw new Error(`Not enough ${item.name} (${item.packSize}) in recorded stock.`);
      lines.push({ ...item, catalogueItemId: item.id, quantity: line.quantity });
    }
    const createdAt = new Date().toISOString();
    const date = businessDate(createdAt);
    await db.runAsync(
      `INSERT INTO retail_sale_event (mode,id,operation_id,customer_id,customer_label,payment_state,amount_paise,source_text,created_at,business_date,payload_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      mode, id, id, input.customerId, customerLabel, input.paymentState, input.amountPaise, sourceText, createdAt, date, payload,
    );
    for (const [position, line] of lines.entries()) {
      await db.runAsync('INSERT INTO retail_sale_line (mode,event_id,position,catalogue_item_id,name,pack_size,unit,quantity) VALUES (?,?,?,?,?,?,?,?)',
        mode, id, position, line.catalogueItemId, line.name, line.packSize, line.unit, line.quantity);
      await db.runAsync('INSERT INTO retail_sale_stock_movement (mode,event_id,position,catalogue_item_id,quantity_delta) VALUES (?,?,?,?,?)',
        mode, id, position, line.catalogueItemId, -line.quantity);
    }
    return { ...input, customerLabel, sourceText, lines: input.lines, id, createdAt, businessDate: date };
}

export function recordRetailSale(mode: ShopMode, operationId: string, input: RetailSaleInput): Promise<RetailSaleEvent> {
  return writeTransaction((db) => persistRetailSale(db, mode, operationId, input));
}

/** Saves independently parsed supplier, retail-sale, and customer-credit events as one SQLite transaction. */
export async function recordHomeNoteBatch(
  mode: ShopMode,
  operationId: string,
  input: HomeNoteBatchInput,
): Promise<void> {
  const id = operationId.trim();
  if (!id || (!input.receipt && !input.sale && !input.credit)) throw new Error('A note needs at least one resolved shop event.');
  if (input.sale && input.credit) {
    const { sale, credit } = input;
    if (sale.paymentState !== 'credit' || !sale.customerId ||
        sale.customerId !== credit.event.customerId ||
        sale.amountPaise !== credit.event.amountPaise ||
        sale.sourceText.trim() !== credit.event.sourceText?.trim() ||
        credit.event.kind !== 'credit_sale' || credit.event.lines?.length) {
      throw new Error('A note can contain one customer event at a time.');
    }
  } else if (input.sale?.paymentState === 'credit') {
    throw new Error('A note with a credit sale must include its matching ledger entry.');
  }
  const preparedCredit = input.credit ? prepareCustomerCreditEvent(input.credit.event) : null;
  let preparedPromise: ReturnType<typeof preparePromiseToPay> | null = null;
  if (input.credit?.promise) {
    if (input.credit.event.kind !== 'credit_sale') throw new Error('A payment promise must be linked to a credit sale.');
    preparedPromise = preparePromiseToPay({
      customerId: input.credit.event.customerId,
      amountPaise: input.credit.promise.amountPaise,
      dueDate: input.credit.promise.dueDate,
      note: input.credit.promise.note,
      relatedEventId: `${id}:credit`,
      ...(input.credit.promise.dateSource ? { dateSource: input.credit.promise.dateSource } : {}),
    });
  }
  return writeTransaction(async (db) => {
    const receiptId = `${id}:supplier`;
    const saleId = `${id}:customer`;
    const creditId = `${id}:credit`;
    const promiseId = `${id}:promise`;
    const [existingReceipt, existingSale, existingCredit, existingPromise] = await Promise.all([
      findReceipt(db, mode, receiptId),
      db.getFirstAsync<{ id: string }>('SELECT id FROM retail_sale_event WHERE mode = ? AND operation_id = ?', mode, saleId),
      db.getFirstAsync<{ id: string }>('SELECT id FROM customer_credit_event WHERE mode = ? AND operation_id = ?', mode, creditId),
      db.getFirstAsync<{ id: string }>('SELECT id FROM promise_to_pay WHERE mode = ? AND operation_id = ?', mode, promiseId),
    ]);
    const batchAlreadyExists = Boolean(existingReceipt || existingSale || existingCredit || existingPromise);
    if (batchAlreadyExists && (
      Boolean(input.receipt) !== Boolean(existingReceipt)
      || Boolean(input.sale) !== Boolean(existingSale)
      || Boolean(input.credit) !== Boolean(existingCredit)
      || Boolean(input.credit?.promise) !== Boolean(existingPromise)
    )) {
      throw new Error('This operation ID was already used for different note contents.');
    }
    if (input.newCustomer) {
      const newCustomerId = input.newCustomer.id.trim();
      const linkedToSale = input.sale?.customerId === newCustomerId;
      const linkedToCredit = input.credit?.event.customerId === newCustomerId;
      if (!newCustomerId || (!linkedToSale && !linkedToCredit)) throw new Error('A new customer must be linked to a customer event in this note.');
      const existingCustomer = await db.getFirstAsync<{ id: string; name: string }>(
        'SELECT id, display_name AS name FROM customer WHERE mode = ? AND id = ? AND archived_at IS NULL', mode, newCustomerId,
      );
      if (existingCustomer) {
        const savedAliases = await db.getAllAsync<{ alias: string }>(
          'SELECT alias FROM customer_alias WHERE mode = ? AND customer_id = ? ORDER BY alias_key', mode, newCustomerId,
        );
        const requestedAliases = [...new Set(input.newCustomer.aliases.map(checkedCustomerName))]
          .filter((alias) => normalizeCustomerName(alias) !== normalizeCustomerName(input.newCustomer!.name))
          .map(normalizeCustomerName).sort();
        if (normalizeCustomerName(existingCustomer.name) !== normalizeCustomerName(checkedCustomerName(input.newCustomer.name))
          || JSON.stringify(savedAliases.map(({ alias }) => normalizeCustomerName(alias)).sort()) !== JSON.stringify(requestedAliases)) {
          throw new Error('This save ID is already linked to a different customer profile.');
        }
      } else {
        if (batchAlreadyExists) throw new Error('This note was already saved without its customer profile.');
        await insertCustomerForHomeBatch(db, mode, newCustomerId, input.newCustomer);
      }
    }
    if (input.receipt) await persistReceipt(db, mode, `${id}:supplier`, input.receipt);
    // Receive first so a sale in the same spoken note can consume stock delivered in it.
    if (input.sale) await persistRetailSale(db, mode, `${id}:customer`, input.sale);
    if (input.credit && preparedCredit) {
      const event = await persistCustomerCreditEvent(db, mode, `${id}:credit`, preparedCredit);
      if (input.credit.promise && preparedPromise) {
        if (preparedPromise.normalizedInput.relatedEventId !== event.id) throw new Error('The promise does not match its credit event.');
        await persistPromiseToPay(db, mode, `${id}:promise`, preparedPromise);
      }
    }
  });
}

export async function listRetailSales(mode: ShopMode, customerId?: string, limit?: number): Promise<RetailSaleEvent[]> {
  const { reader } = await getDatabases();
  const events = await reader.getAllAsync<{
    id: string; customerId: string | null; customerLabel: string; paymentState: RetailSaleInput['paymentState'];
    amountPaise: number | null; sourceText: string; createdAt: string; businessDate: string;
  }>(`SELECT sale.id, sale.customer_id AS customerId, sale.customer_label AS customerLabel,
      sale.payment_state AS paymentState, sale.amount_paise AS amountPaise, sale.source_text AS sourceText,
      sale.created_at AS createdAt, sale.business_date AS businessDate
    FROM retail_sale_event AS sale
    LEFT JOIN retail_sale_reversal AS reversal ON reversal.mode = sale.mode AND reversal.reverses_event_id = sale.id
    WHERE sale.mode = ? AND reversal.id IS NULL ${customerId ? 'AND sale.customer_id = ?' : ''}
    ORDER BY sale.created_at DESC, sale.id DESC
    LIMIT ?`, ...(customerId ? [mode, customerId, limit ?? -1] : [mode, limit ?? -1]));
  return Promise.all(events.map(async (event) => {
    const lines = await reader.getAllAsync<{ catalogueItemId: string; quantity: number }>(
      'SELECT catalogue_item_id AS catalogueItemId, quantity FROM retail_sale_line WHERE mode = ? AND event_id = ? ORDER BY position', mode, event.id,
    );
    return { ...event, lines, paymentState: event.paymentState };
  }));
}

/** Adds a linked inverse stock event; original sale and its source transcript remain immutable. */
async function persistReverseRetailSale(db: SQLiteDatabase, mode: ShopMode, eventId: string, operationId: string): Promise<void> {
  const reversalId = operationId.trim();
  if (!reversalId) throw new Error('A reversal operation ID is required.');
    const sale = await db.getFirstAsync<{ id: string }>('SELECT id FROM retail_sale_event WHERE mode = ? AND id = ?', mode, eventId);
    if (!sale) throw new Error('This sale is no longer available.');
    const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM retail_sale_reversal WHERE mode = ? AND reverses_event_id = ?', mode, eventId);
    if (existing) return;
    await db.runAsync('INSERT INTO retail_sale_reversal (mode,id,reverses_event_id,created_at) VALUES (?,?,?,?)', mode, reversalId, eventId, new Date().toISOString());
    await db.runAsync(
      `INSERT INTO retail_sale_reversal_stock_movement (mode,reversal_id,position,catalogue_item_id,quantity_delta)
       SELECT mode, ?, position, catalogue_item_id, -quantity_delta FROM retail_sale_stock_movement WHERE mode = ? AND event_id = ?`,
      reversalId, mode, eventId,
    );
}

export function reverseRetailSale(mode: ShopMode, eventId: string, operationId: string): Promise<void> {
  return writeTransaction(async (db) => {
    if (eventId.endsWith(':customer')) {
      const credit = await db.getFirstAsync<{ id: string }>(
        `SELECT credit.id FROM retail_sale_event AS sale
         JOIN customer_credit_event AS credit ON credit.mode = sale.mode AND credit.id = ?
         WHERE sale.mode = ? AND sale.id = ? AND sale.payment_state = 'credit'`,
        `${eventId.slice(0, -':customer'.length)}:credit`, mode, eventId,
      );
      if (credit) await persistReverseCustomerCreditEvent(db, mode, credit.id, `${operationId}:credit`, new Date().toISOString());
    }
    await persistReverseRetailSale(db, mode, eventId, operationId);
  });
}

/** Reverses all records created by one submitted Home note in one SQLite transaction. */
export function reverseHomeNoteBatch(mode: ShopMode, operationId: string): Promise<void> {
  const id = operationId.trim();
  if (!id) throw new Error('A note reversal ID is required.');
  return writeTransaction(async (db) => {
    const receiptId = `${id}:supplier`;
    const saleId = `${id}:customer`;
    const receipt = await findReceipt(db, mode, receiptId);
    const sale = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM retail_sale_event WHERE mode = ? AND operation_id = ?', mode, saleId,
    );
    const creditId = `${id}:credit`;
    const credit = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM customer_credit_event WHERE mode = ? AND operation_id = ?', mode, creditId,
    );
    if (!receipt && !sale && !credit) throw new Error('This saved note is no longer available.');
    if (sale) await persistReverseRetailSale(db, mode, saleId, `${id}:customer-reversal`);
    if (credit) await persistReverseCustomerCreditEvent(db, mode, credit.id, `${id}:credit-reversal`, new Date().toISOString());
    if (receipt) await persistReverseReceipt(db, mode, receiptId);
  });
}

export async function confirmCustomerCreditEventWithPromise(
  mode: ShopMode,
  eventOperationId: string,
  input: CustomerCreditInput,
  promiseOperationId: string,
  promise: Omit<NewPromiseInput, 'customerId' | 'relatedEventId'>,
): Promise<{ event: CustomerCreditEvent; promise: PromiseToPay }> {
  if (input.kind !== 'credit_sale') throw new Error('A payment promise must be linked to a credit sale.');
  const preparedEvent = prepareCustomerCreditEvent(input);
  const promiseInput: NewPromiseInput = {
    customerId: input.customerId,
    amountPaise: promise.amountPaise,
    dueDate: promise.dueDate,
    note: promise.note,
    relatedEventId: eventOperationId,
    ...(promise.dateSource ? { dateSource: promise.dateSource } : {}),
  };
  // Validate all owner-entered promise values before opening the transaction.
  preparePromiseToPay(promiseInput);
  return writeTransaction(async (db) => {
    const event = await persistCustomerCreditEvent(db, mode, eventOperationId, preparedEvent);
    const linkedPromise = preparePromiseToPay({ ...promiseInput, relatedEventId: event.id });
    const savedPromise = await persistPromiseToPay(db, mode, promiseOperationId, linkedPromise);
    return { event, promise: savedPromise };
  });
}

async function persistReverseCustomerCreditEvent(
  db: SQLiteDatabase,
  mode: ShopMode,
  eventId: string,
  operationId: string,
  now: string,
): Promise<CustomerCreditEvent> {
    const date = businessDate(now);
    const original = await db.getFirstAsync<{
      id: string; operationId: string; customerId: string; kind: CustomerCreditKind;
      amountDeltaPaise: number; paymentMethod: PaymentMethod | null; note: string | null;
      sourceText: string | null; createdAt: string; businessDate: string; reversesEventId: string | null;
    }>(
      `SELECT id, operation_id AS operationId, customer_id AS customerId, kind,
              amount_delta_paise AS amountDeltaPaise, payment_method AS paymentMethod, note,
              source_text AS sourceText, created_at AS createdAt, business_date AS businessDate,
              reverses_event_id AS reversesEventId FROM customer_credit_event
       WHERE mode = ? AND id = ?`, mode, eventId,
    );
    if (!original || original.kind === 'reversal') throw new Error('This customer entry cannot be reversed.');
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM customer_credit_event WHERE mode = ? AND reverses_event_id = ?', mode, eventId,
    );
    if (existing) {
      const row = await db.getFirstAsync<Parameters<typeof customerEventFromRow>[0]>(
        `${customerEventSelect} WHERE mode = ? AND id = ?`, mode, existing.id,
      );
      if (!row) throw new Error('The reversal could not be read.');
      const event = customerEventFromRow(row);
      return { ...event, lines: await readCustomerCreditLines(db, mode, event.id) };
    }
    const originalLines = await readCustomerCreditLines(db, mode, eventId);
    const payloadJson = JSON.stringify({ reversesEventId: eventId });
    await db.runAsync(
      `INSERT INTO customer_credit_event (
        mode, id, operation_id, customer_id, kind, amount_delta_paise, payment_method,
        note, source_text, created_at, business_date, reverses_event_id, payload_json
      ) VALUES (?, ?, ?, ?, 'reversal', ?, NULL, ?, NULL, ?, ?, ?, ?)`,
      mode, operationId, operationId, original.customerId, -original.amountDeltaPaise,
      `Reversal of ${eventId}`, now, date, eventId, payloadJson,
    );
    await db.runAsync(
      `UPDATE promise_to_pay SET status = 'cancelled', resolved_at = ?
       WHERE mode = ? AND related_event_id = ? AND status = 'open'`,
      now, mode, eventId,
    );
    if (original.kind === 'credit_sale') {
      for (const [position, line] of originalLines.entries()) {
        await db.runAsync(
          `INSERT INTO customer_credit_line (mode, event_id, position, catalogue_item_id, name, pack_size, unit, quantity, amount_paise)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          mode, operationId, position, line.catalogueItemId, line.name, line.packSize, line.unit, line.quantity, line.amountPaise,
        );
        await db.runAsync(
          `INSERT INTO customer_credit_stock_movement (mode, event_id, position, catalogue_item_id, quantity_delta)
           VALUES (?, ?, ?, ?, ?)`, mode, operationId, position, line.catalogueItemId, line.quantity,
        );
      }
    }
    const row = await db.getFirstAsync<Parameters<typeof customerEventFromRow>[0]>(
      `${customerEventSelect} WHERE mode = ? AND id = ?`, mode, operationId,
    );
    if (!row) throw new Error('The reversal could not be read.');
    const event = customerEventFromRow(row);
    return { ...event, lines: await readCustomerCreditLines(db, mode, event.id) };
}

export async function reverseCustomerCreditEvent(mode: ShopMode, eventId: string, operationId: string): Promise<CustomerCreditEvent> {
  const now = new Date().toISOString();
  return writeTransaction(async (db) => {
    const event = await persistReverseCustomerCreditEvent(db, mode, eventId, operationId, now);
    if (eventId.endsWith(':credit')) {
      const saleId = `${eventId.slice(0, -':credit'.length)}:customer`;
      const sale = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM retail_sale_event WHERE mode = ? AND id = ? AND customer_id = ? AND payment_state = 'credit'",
        mode, saleId, event.customerId,
      );
      if (sale) await persistReverseRetailSale(db, mode, sale.id, `${operationId}:sale`);
    }
    return event;
  });
}

export type NewPromiseInput = {
  dateSource?: 'estimated' | 'owner';
  replacesPromiseId?: string;
  customerId: string;
  amountPaise: number | null;
  dueDate: string | null;
  note: string | null;
  relatedEventId: string | null;
};

function preparePromiseToPay(input: NewPromiseInput) {
  if (input.amountPaise !== null && (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_MONEY_PAISE)) {
    throw new Error('Enter a valid promised amount.');
  }
  const dueDate = checkedDueDate(input.dueDate);
  const note = checkedCustomerText(input.note, 'Note', 500);
  const normalizedInput = { ...input, dueDate, note };
  const payloadJson = JSON.stringify(normalizedInput);
  return { normalizedInput, payloadJson };
}

async function persistPromiseToPay(
  db: SQLiteDatabase,
  mode: ShopMode,
  operationId: string,
  prepared: ReturnType<typeof preparePromiseToPay>,
): Promise<PromiseToPay> {
  const { normalizedInput, payloadJson } = prepared;
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: string; payloadJson: string; status: PromiseToPay['status']; createdAt: string }>(
    'SELECT id, payload_json AS payloadJson, status, created_at AS createdAt FROM promise_to_pay WHERE mode = ? AND operation_id = ?', mode, operationId,
  );
  if (existing) {
    if (existing.payloadJson !== payloadJson) throw new Error('This save ID is already used for a different promise.');
    return { id: existing.id, ...normalizedInput, status: existing.status, createdAt: existing.createdAt };
  }
  const customer = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM customer WHERE mode = ? AND id = ? AND archived_at IS NULL', mode, normalizedInput.customerId,
  );
  if (!customer) throw new Error('Choose a customer from this shop.');
  if (normalizedInput.relatedEventId) {
    const event = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM customer_credit_event WHERE mode = ? AND id = ? AND customer_id = ?', mode, normalizedInput.relatedEventId, normalizedInput.customerId,
    );
    if (!event) throw new Error('The promise must link to an entry for this customer.');
  }
  await db.runAsync(
    `INSERT INTO promise_to_pay (
      mode, id, operation_id, customer_id, related_event_id, amount_paise,
      due_date, note, status, created_at, resolved_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, ?)`,
    mode, operationId, operationId, normalizedInput.customerId, normalizedInput.relatedEventId,
    normalizedInput.amountPaise, normalizedInput.dueDate, normalizedInput.note, now, payloadJson,
  );
  return { id: operationId, ...normalizedInput, status: 'open', createdAt: now };
}

export async function createPromiseToPay(mode: ShopMode, operationId: string, input: NewPromiseInput): Promise<PromiseToPay> {
  const prepared = preparePromiseToPay(input);
  return writeTransaction((db) => persistPromiseToPay(db, mode, operationId, prepared));
}

export async function listCustomerPromises(mode: ShopMode, customerId?: string): Promise<(PromiseToPay & { customerName: string })[]> {
  const { reader } = await getDatabases();
  const today = businessDate(new Date().toISOString());
  const rows = customerId
    ? await reader.getAllAsync<PromiseToPay & { customerName: string }>(
      `SELECT p.id, p.customer_id AS customerId, p.amount_paise AS amountPaise,
              p.due_date AS dueDate, p.note, p.status, p.created_at AS createdAt,
              p.related_event_id AS relatedEventId, json_extract(p.payload_json, '$.dateSource') AS dateSource, json_extract(p.payload_json, '$.replacesPromiseId') AS replacesPromiseId, c.display_name AS customerName
       FROM promise_to_pay AS p JOIN customer AS c ON c.mode = p.mode AND c.id = p.customer_id
       WHERE p.mode = ? AND p.customer_id = ? ORDER BY COALESCE(p.due_date, '9999-12-31'), p.created_at DESC`, mode, customerId,
    )
    : await reader.getAllAsync<PromiseToPay & { customerName: string }>(
      `SELECT p.id, p.customer_id AS customerId, p.amount_paise AS amountPaise,
              p.due_date AS dueDate, p.note, p.status, p.created_at AS createdAt,
              p.related_event_id AS relatedEventId, json_extract(p.payload_json, '$.dateSource') AS dateSource, json_extract(p.payload_json, '$.replacesPromiseId') AS replacesPromiseId, c.display_name AS customerName
       FROM promise_to_pay AS p JOIN customer AS c ON c.mode = p.mode AND c.id = p.customer_id
       WHERE p.mode = ? AND p.status = 'open'
       ORDER BY CASE WHEN p.due_date < ? THEN 0 ELSE 1 END, p.due_date, p.created_at DESC`, mode, today,
    );
  return rows;
}

export async function correctCustomerPromiseDate(
  mode: ShopMode,
  promiseId: string,
  operationId: string,
  dueDate: string,
): Promise<PromiseToPay> {
  const correctedDate = checkedDueDate(dueDate.trim());
  if (!correctedDate || !operationId.trim()) throw new Error('Enter a valid promise date.');
  return writeTransaction(async (db) => {
    const original = await db.getFirstAsync<{
      customerId: string; amountPaise: number | null; note: string | null;
      relatedEventId: string | null; status: PromiseToPay['status'];
    }>(
      `SELECT customer_id AS customerId, amount_paise AS amountPaise, note,
              related_event_id AS relatedEventId, status FROM promise_to_pay WHERE mode = ? AND id = ?`,
      mode, promiseId,
    );
    if (!original) throw new Error('This follow-up could not be found in the current shop.');
    const prepared = preparePromiseToPay({
      customerId: original.customerId, amountPaise: original.amountPaise, dueDate: correctedDate,
      note: original.note, relatedEventId: original.relatedEventId, replacesPromiseId: promiseId, dateSource: 'owner',
    });
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM promise_to_pay WHERE mode = ? AND operation_id = ?', mode, operationId,
    );
    if (existing) return persistPromiseToPay(db, mode, operationId, prepared);
    if (original.status !== 'open') throw new Error('This follow-up is no longer open.');
    const replacement = await persistPromiseToPay(db, mode, operationId, prepared);
    await db.runAsync(
      "UPDATE promise_to_pay SET status = 'cancelled', resolved_at = ? WHERE mode = ? AND id = ? AND status = 'open'",
      new Date().toISOString(), mode, promiseId,
    );
    return replacement;
  });
}

export async function updateCustomerPromiseStatus(
  mode: ShopMode,
  promiseId: string,
  status: PromiseToPay['status'],
): Promise<void> {
  const allowed: PromiseToPay['status'][] = ['open', 'kept', 'missed', 'cancelled', 'disputed'];
  if (!allowed.includes(status)) throw new Error('Choose a valid promise status.');
  await writeTransaction(async (db) => {
    const result = await db.runAsync(
      `UPDATE promise_to_pay SET status = ?, resolved_at = ?
       WHERE mode = ? AND id = ?`,
      status, status === 'open' ? null : new Date().toISOString(), mode, promiseId,
    );
    if (result.changes !== 1) throw new Error('This promise could not be found in the current shop.');
  });
}
