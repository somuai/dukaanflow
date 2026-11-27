# Invoice OCR local Expo module

This Apple-only local module keeps invoice OCR on device with Vision and presents VisionKit's document camera for physical capture.

```ts
import { deleteInvoiceScan, recognizeInvoiceImage, recognizeInvoiceFixture, scanInvoice } from '../modules/invoice-ocr/src';

const fixture = await recognizeInvoiceFixture();
const scan = await scanInvoice(); // Physical iPhone/iPad only; Simulator has no camera.
const firstPageText = await recognizeInvoiceImage(scan.pages[0].uri);
await deleteInvoiceScan(scan.scanId); // Remove only if the delivery was not saved.
```

`recognizeInvoiceImage` accepts a local `file://` image URI. OCR returns line text, Vision confidence, and normalized bounds. Scanned page JPEGs are written under `Documents/invoice-scans/<scanId>/`. A scan is temporary until delivery confirmation commits; the app deletes it after OCR failure, an empty OCR result, or abandoning reconciliation. After a successful delivery save, those evidence URIs remain attached to the delivery. Cancellation and unsupported hardware reject the `scanInvoice` promise with a specific error code.

`recognizeInvoiceFixture()` downloads the synthetic image in `assets/invoice-ocr-fixture.png` to the app cache and runs the same native OCR method. This makes the recognition path manually callable in the iOS Simulator without camera hardware or network access after the app bundle is installed.
