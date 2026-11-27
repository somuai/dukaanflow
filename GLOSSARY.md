# DukaanFlow

DukaanFlow helps a shopkeeper record and retrieve confirmed customer and supplier events, with voice as a convenient way to create and query those records.

## Language

**Shop**  
The kirana or neighborhood retail business whose customer, supplier, product, and transaction history is recorded.

**Shop profile**  
The local display name and app-language preference for one shop and its separate customer, supplier, product, and transaction records. One installation can switch between shop profiles; they are not separate sign-ins and do not sync to other devices.

**Customer**  
A person or household the shop sells goods to, including when the shop records a sale for later payment.

**Customer alias**  
A shop-approved spoken or written name that refers to a customer. Similar or colliding aliases do not establish that two records are the same person.

**Credit sale**  
A confirmed sale for which the shop has not yet received the full amount. It increases the customer's open balance by the unpaid amount.

**Repayment**  
Money the shop owner confirms was received against a customer's open balance. A partial repayment reduces that balance only by its confirmed amount.

**Promise to pay**  
A customer's stated intention to pay an amount by a date. It may guide owner-controlled follow-up but does not change the balance.

**Open balance**  
The amount computed from confirmed credit sales, repayments, returns, and corrections for one customer. A promise or unconfirmed proposal does not affect it.

**Customer dispute**  
A customer or owner challenge to one or more recorded events or the resulting balance. The challenged amount remains visible and must not be presented as an uncontested fact.

**Owner-confirmed event**  
A financial or relationship record the owner reviewed and explicitly approved. Corrections link to the original event instead of silently erasing it.

**Follow-up reminder**  
A suggested next contact linked to a customer promise or open balance. The owner chooses whether, when, and how to send it.

**Supplier delivery**  
Goods physically brought to the shop by a supplier. A delivery may be received without an invoice or may differ from the invoice.

**Supplier**  
A person or business that provides goods to a shop. A supplier record and its alternate names belong to one shop profile.

**Supplier alias**  
A shop-approved alternate spoken or written name for one supplier. An alias already assigned to another supplier cannot be reused or silently merged.

**Supplier payable**  
The amount the shop still owes from confirmed supplier invoices after confirmed payments and linked corrections. A promise or unconfirmed payment does not reduce it.

**Supplier payment**  
An amount the owner confirms was paid to a supplier. It reduces the payable by that amount; it does not prove the bank or UPI transaction settled.

**Supplier credit**  
An amount the shop has paid beyond its confirmed supplier payable or has otherwise confirmed as an advance. It is shown separately from money the shop owes.

**Supplier invoice**  
A supplier's statement of billed items, quantities, and amounts for a delivery.

**Invoice due date**
The date by which the shop expects to pay a supplier invoice, when the supplier or owner has provided one. An unknown due date remains unknown and is not inferred from supplier habits.

**Supplier payment allocation**
An owner-selected link between a confirmed payment and one or more supplier invoices. An unallocated part remains supplier credit; the app does not silently apply payments to the oldest invoice.

**Invoice aging**
A view of each open supplier invoice as undated, not yet due, due today, overdue, or settled, calculated from its recorded due date and open amount.

**Delivery reconciliation**  
The comparison of a supplier invoice with the items and quantities physically received, including damaged goods, missing goods, extras, and substitutions.

**Invoice line**  
One item, billed quantity, and stated value on a supplier invoice.

**Received good quantity**  
The physically counted quantity the owner confirms as usable stock.

**Observed delivery lot**  
An owner-recorded portion of accepted stock with optional observed batch code and expiry date. It is evidence recorded at receiving, not proof of the date if the owner did not check the package.

**Lot rejection**  
A later owner-confirmed removal of some tracked lot quantity from usable stock, with a reason and linked reversal. It does not automatically create supplier credit.

**Untracked accepted stock**  
The accepted delivery quantity not assigned to an observed lot. It remains usable stock but cannot be used for lot-specific expiry or rejection calculations.

**Damaged quantity**  
Goods physically received but reported as damaged during reconciliation.

**Missing quantity**  
The quantity billed on an invoice line that was not physically received.

**Supplier claim**  
An owner-recorded follow-up about damaged, missing, extra, or returned goods. Recording a claim or a supplier promise does not change stock or supplier balance.

**Supplier return**  
Goods the owner confirms were handed back to a supplier. Only returned goods that had entered usable stock create a negative stock movement; the return alone does not reduce the supplier payable.

**Supplier credit note**  
A credit amount the owner confirms was actually received from a supplier. It reduces the linked invoice and supplier balance, independently of any stock return.

**Extra quantity**  
Goods physically received that are not represented by a matching invoice line.

**Substitution**  
An item physically received in place of an item described on an invoice line.

**Owner confirmation**  
The owner's explicit approval of a reviewed delivery reconciliation before it changes the shop's records.

**Stock receipt**  
A saved record of the goods actually accepted from a supplier delivery. Each item specifies its exact variant, quantity and unit. Supplier and payment details may be unknown.

**Receipt draft**  
A proposed stock receipt that the shopkeeper can review and correct before saving.

**Catalogue item**  
A distinct sellable or stockable product variant, including its pack size where applicable.

**Reversal**  
A correction linked to a saved receipt that cancels its recorded effect.

**Receipt total**  
The stated total value of the supplier receipt.

**Amount paid**  
The amount the shopkeeper states was paid for the delivery.

**Reorder point**  
An owner-set minimum stock quantity for one catalogue item and its explicit unit. Reaching or falling below it can produce a threshold-based restock suggestion; it is not a demand forecast.

**Restock draft**  
A shop-local, editable list of intended replenishment quantities. It does not place an order, add stock, or change a supplier payable. Only a separately confirmed delivery updates stock and the supplier ledger.

**Supplier order note**
A shopkeeper's record of the products and quantities intended or agreed to be ordered from one supplier. A draft is not sent to the supplier and does not change stock or payables.

**Placed supplier order**
A supplier order note the owner marks as actually communicated or placed. This records the owner's action; it is not proof that the supplier accepted the order.

**Expected delivery date**
The date the shop expects an order to arrive. It is a planning date, not proof of dispatch or delivery.

**Outstanding order quantity**
The quantity on a placed supplier order that has not yet been matched to a confirmed receipt, accounting for cancellations and recorded excess separately.

**Linked receipt**
A confirmed supplier delivery connected to an order note when the supplier, catalogue product, and unit match. Linking provides reconciliation context and does not change the receipt's stock or payable effects.
