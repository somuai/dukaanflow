import { Asset } from 'expo-asset';
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type InvoiceOCRBounds = {
  /** Vision normalized x coordinate, measured from the image's bottom-left. */
  x: number;
  /** Vision normalized y coordinate, measured from the image's bottom-left. */
  y: number;
  width: number;
  height: number;
};

export type InvoiceOCRBlock = {
  text: string;
  confidence: number;
  bounds: InvoiceOCRBounds;
};

export type InvoiceOCRResult = {
  text: string;
  blocks: InvoiceOCRBlock[];
};

export type ScannedInvoicePage = {
  /** Local file URI persisted in the app's Documents directory. */
  uri: string;
  width: number;
  height: number;
};

export type ScannedInvoice = {
  /** UUID for the app-managed directory that holds this uncommitted scan. */
  scanId: string;
  pages: ScannedInvoicePage[];
};

type InvoiceOCRNativeModule = {
  recognizeImage(uri: string): Promise<InvoiceOCRResult>;
  scanInvoice(): Promise<ScannedInvoice>;
  deleteInvoiceScan(scanId: string): Promise<void>;
  archiveBackupFolder(uri: string): Promise<string>;
  exportBackupArchive(uri: string): Promise<boolean>;
  pickBackupArchive(): Promise<string | null>;
  activateBackupWorkspace(generationId: string): Promise<void>;
};

export async function exportStagedBackup(folder: string): Promise<boolean> {
  const native = nativeInvoiceOCR();
  return native.exportBackupArchive(await native.archiveBackupFolder(folder));
}

export function pickBackupArchive(): Promise<string | null> {
  return nativeInvoiceOCR().pickBackupArchive();
}

export function activateBackupWorkspace(generationId: string): Promise<void> {
  return nativeInvoiceOCR().activateBackupWorkspace(generationId);
}

function nativeInvoiceOCR(): InvoiceOCRNativeModule {
  if (Platform.OS !== 'ios') {
    throw new Error('The invoice OCR module currently supports iOS only.');
  }
  return requireNativeModule<InvoiceOCRNativeModule>('InvoiceOCR');
}

/** Recognizes text from a local file:// image URI using Apple Vision. */
export function recognizeInvoiceImage(uri: string): Promise<InvoiceOCRResult> {
  return nativeInvoiceOCR().recognizeImage(uri);
}

/** Presents VisionKit's native document camera and saves scanned pages locally. */
export function scanInvoice(): Promise<ScannedInvoice> {
  return nativeInvoiceOCR().scanInvoice();
}

/** Deletes one uncommitted scan directory created by scanInvoice. */
export function deleteInvoiceScan(scanId: string): Promise<void> {
  return nativeInvoiceOCR().deleteInvoiceScan(scanId);
}

/** Resolves the bundled synthetic invoice to a local cache URI for simulator OCR checks. */
export async function resolveInvoiceFixtureUri(): Promise<string> {
  const asset = Asset.fromModule(require('../../../assets/invoice-ocr-fixture.png'));
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('The invoice OCR fixture was not copied to a local file.');
  return asset.localUri;
}

export async function recognizeInvoiceFixture(): Promise<InvoiceOCRResult> {
  return recognizeInvoiceImage(await resolveInvoiceFixtureUri());
}
