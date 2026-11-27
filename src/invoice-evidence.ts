const ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const MEDIA_PREFIX = '(?:file:///[^?#\\r\\n]*/Documents/(?:dukaanflow-workspaces/' + ID + '/media/)?)?';
const SAVED_PAGE = new RegExp('^' + MEDIA_PREFIX + '(invoice-scans/' + ID + '/page-[1-9]\\d*\\.jpg)$', 'iu');
const PRODUCT_PHOTO = new RegExp('^' + MEDIA_PREFIX + '(product-photos/product-' + ID + '\\.jpg)$', 'iu');

/** Navigation can discard a scan only after any save has finished. */
export async function discardUncommittedScan(
  save: Promise<void> | null,
  committed: () => boolean,
  remove: () => Promise<void>,
): Promise<void> {
  try {
    await save;
  } finally {
    if (!committed()) await remove();
  }
}

/** Resolve only native scanner pages, including references from an older iOS container. */
export function resolveSavedInvoicePage(reference: unknown, documentsDirectory: string | null): string | null {
  return resolveManagedPhoto(reference, documentsDirectory, SAVED_PAGE);
}

export function resolveSavedProductPhoto(reference: unknown, documentsDirectory: string | null): string | null {
  return resolveManagedPhoto(reference, documentsDirectory, PRODUCT_PHOTO);
}

function resolveManagedPhoto(reference: unknown, documentsDirectory: string | null, pattern: RegExp): string | null {
  if (typeof reference !== 'string' || !documentsDirectory?.startsWith('file:///')) return null;
  const relativePath = reference.match(pattern)?.[1];
  if (!relativePath) return null;
  return `${documentsDirectory.replace(/\/*$/u, '/')}${relativePath}`;
}
