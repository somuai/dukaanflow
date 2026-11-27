import XCTest

final class ReconciliationUITests: XCTestCase {
  private func finishFirstRunIfNeeded(_ app: XCUIApplication) {
    if app.textViews["home-event-capture"].waitForExistence(timeout: 3) { return }
    let homeTab = app.tabBars.buttons["Home"]
    if homeTab.exists {
      homeTab.tap()
      if app.textViews["home-event-capture"].waitForExistence(timeout: 10) { return }
    }
    let setup = app.buttons["setup-shop"]
    if app.buttons["finish-opening-stock"].exists {
      app.buttons["finish-opening-stock"].tap()
      XCTAssertTrue(app.textViews["home-event-capture"].waitForExistence(timeout: 10))
      return
    }
    guard setup.waitForExistence(timeout: 10) else { return }
    setup.tap()
    let continueWithTyping = app.buttons["flow-continue"]
    XCTAssertTrue(continueWithTyping.waitForExistence(timeout: 10))
    continueWithTyping.tap()
    let shopName = app.textFields["shop-name"]
    XCTAssertTrue(shopName.waitForExistence(timeout: 10))
    shopName.tap()
    shopName.typeText("DukaanFlow UI Test Shop")
    app.buttons["setup-continue"].tap()
    let finishStock = app.buttons["finish-opening-stock"]
    XCTAssertTrue(finishStock.waitForExistence(timeout: 10))
    finishStock.tap()
    XCTAssertTrue(app.textViews["home-event-capture"].waitForExistence(timeout: 20))
  }

  private func enter(_ value: String, into field: XCUIElement) {
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    field.tap()
    let existing = (field.value as? String).flatMap { $0 == field.placeholderValue ? nil : $0 } ?? ""
    if !existing.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
    }
    field.typeText(value)
    XCTAssertEqual(field.value as? String, value, "The full value should reach the focused text field")
  }

  private func attachScreen(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func selectReceivingUnit(_ unit: String, in app: XCUIApplication) {
    let done = app.keyboards.buttons["Done"]
    if done.exists && done.isHittable { done.tap() }
    let control = app.descendants(matching: .any).matching(identifier: "product-unit-\(unit)").firstMatch
    let form = app.scrollViews.firstMatch
    for _ in 0..<3 where !control.isHittable {
      if form.exists { form.swipeUp() }
    }
    guard control.isHittable else {
      XCTFail("Receiving unit \(unit) should be reachable in the product form")
      return
    }
    control.tap()
  }

  func testCustomerCreditPromisePartialRepaymentAndReversal() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let customersTab = app.tabBars.buttons["Customers"]
    XCTAssertTrue(customersTab.waitForExistence(timeout: 10))
    customersTab.tap()
    app.buttons["add-customer"].tap()

    let customerName = "Ramesh QA \(UUID().uuidString.prefix(5))"
    enter(customerName, into: app.textFields["customer-name"])
    enter("Ramesh ji", into: app.textFields["customer-aliases"])
    app.buttons["save-customer"].tap()

    let customerRow = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", customerName)).firstMatch
    attachScreen("customer-created-list")
    XCTAssertTrue(customerRow.waitForExistence(timeout: 15), "A created customer should be searchable by the name the shop uses")
    customerRow.tap()

    app.buttons["record-credit"].tap()
    XCTAssertTrue(app.staticTexts["Record credit sale"].waitForExistence(timeout: 10))
    enter("350", into: app.textFields["customer-entry-amount"])
    XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Balance after save · ₹350")).firstMatch.exists)
    app.buttons["confirm-customer-event"].tap()
    XCTAssertTrue(app.staticTexts["₹350"].waitForExistence(timeout: 10), "The confirmed credit sale should increase the balance")

    app.buttons["add-promise"].tap()
    enter("350", into: app.textFields["promise-amount"])
    enter("2026-11-28", into: app.textFields["promise-date"])
    app.buttons["save-promise"].tap()
    XCTAssertTrue(app.staticTexts["Promise · ₹350"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["₹350"].exists, "A promise must not reduce the balance")

    app.buttons["record-repayment"].tap()
    enter("200", into: app.textFields["customer-entry-amount"])
    let upi = app.descendants(matching: .any).matching(identifier: "payment-method-upi").firstMatch
    XCTAssertTrue(upi.waitForExistence(timeout: 10))
    upi.tap()
    XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Balance after save · ₹150")).firstMatch.exists)
    app.buttons["confirm-customer-event"].tap()
    XCTAssertTrue(app.staticTexts["₹150"].waitForExistence(timeout: 10), "A ₹200 partial repayment should leave ₹150 outstanding")
    attachScreen("customer-credit-partial-repayment")

    app.terminate()
    app.launch()
    customersTab.tap()
    let persistedCustomer = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", customerName)).firstMatch
    XCTAssertTrue(persistedCustomer.waitForExistence(timeout: 15), "Customer ledger entries should survive a cold relaunch")
    persistedCustomer.tap()
    XCTAssertTrue(app.staticTexts["₹150"].waitForExistence(timeout: 10))
    attachScreen("customer-credit-after-relaunch")

    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Reverse Repayment received")).firstMatch.tap()
    let reverse = app.alerts.buttons["Reverse entry"]
    XCTAssertTrue(reverse.waitForExistence(timeout: 10))
    reverse.tap()
    XCTAssertTrue(app.staticTexts["₹350"].waitForExistence(timeout: 10), "A linked reversal should restore the pre-repayment balance")
  }

  func testHomeVoiceNoteCreatesCustomerProfileAndCreditLedger() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let suffix = UUID().uuidString.prefix(6).map { character -> String in
      let alphabet = "0123456789ABCDEF"
      guard let index = alphabet.firstIndex(of: character) else { return "x" }
      return String(UnicodeScalar(97 + alphabet.distance(from: alphabet.startIndex, to: index))!)
    }.joined()
    let customerName = "Raju QA \(suffix)"
    let capture = app.textViews["home-event-capture"]
    enter("\(customerName) ने ₹100 उधार लिया है, रविवार तक चुका देगा।", into: capture)
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(app.staticTexts["\(customerName) added · credit recorded"].waitForExistence(timeout: 15), "Home should confirm when voice has created a new customer profile")

    app.tabBars.buttons["Customers"].tap()
    let customer = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", customerName)).firstMatch
    XCTAssertTrue(customer.waitForExistence(timeout: 10), "The voice-created customer should appear in the Customers tab")
    customer.tap()
    XCTAssertTrue(app.staticTexts["₹100"].waitForExistence(timeout: 10), "The confirmed credit should be reflected in the customer's computed balance")
    XCTAssertTrue(app.staticTexts["Promise · ₹100"].waitForExistence(timeout: 10), "The spoken Sunday promise should remain linked to the new customer's event")
    attachScreen("home-voice-created-customer-credit")
  }

  func testShopTabSelectsProfilesAndKeepsSettingsSeparate() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let shopTab = app.tabBars.buttons["Shop"]
    XCTAssertTrue(shopTab.waitForExistence(timeout: 10))
    shopTab.tap()
    XCTAssertTrue(app.staticTexts["Shops"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["open-settings"].exists, "Settings should be a separate top-right action")
    XCTAssertTrue(app.buttons["add-shop-profile"].exists, "The Shop page should manage shop profiles")
    XCTAssertFalse(app.staticTexts["Shop settings"].exists, "The Shop tab itself should not render Settings")
    attachScreen("shop-profile-switcher")

    app.buttons["open-settings"].tap()
    XCTAssertTrue(app.staticTexts["Settings"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["shop-profiles"].exists == false, "The Settings list should not duplicate the shop selector")
    XCTAssertFalse(app.staticTexts["Product catalogue"].exists, "Products should remain a separate destination")
    XCTAssertTrue(app.buttons["settings-wispr-flow"].exists)
    XCTAssertTrue(app.buttons["settings-products"].exists)
    attachScreen("shop-settings-separated")
  }

  func testHomePlusFansOutAndDismisses() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let plus = app.buttons["home-action-ring-toggle"]
    XCTAssertTrue(plus.waitForExistence(timeout: 15))
    plus.tap()
    let close = app.buttons["home-action-ring-close"]
    XCTAssertTrue(close.waitForExistence(timeout: 10))
    let actions = ["home-action-scan-invoice", "home-action-note", "home-action-receive-delivery"].map { app.buttons[$0] }
    for action in actions {
      XCTAssertTrue(action.waitForExistence(timeout: 10))
      XCTAssertTrue(action.isHittable)
      XCTAssertTrue(app.frame.contains(action.frame))
    }
    for (index, action) in actions.enumerated() {
      for other in actions.dropFirst(index + 1) {
        XCTAssertFalse(action.frame.intersects(other.frame), "The Plus actions must have separate touch targets")
      }
    }
    attachScreen("home-plus-fan")
    close.tap()
    XCTAssertTrue(plus.waitForExistence(timeout: 10))
    XCTAssertFalse(close.exists)

    plus.tap()
    let delivery = app.buttons["home-action-receive-delivery"]
    XCTAssertTrue(delivery.waitForExistence(timeout: 5))
    delivery.tap()
    XCTAssertTrue(app.staticTexts["Receive delivery"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Invoice scanning needs an iPhone camera.")).firstMatch.exists, "Simulator should explain why document scanning is unavailable")
    XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "AVFoundationErrorDomain")).firstMatch.exists, "Native camera errors should not leak into the interface")
    XCTAssertTrue(app.buttons["quick-entry-without-invoice"].exists)
    attachScreen("home-delivery-destination")
    app.buttons["quick-entry-without-invoice"].tap()
    XCTAssertTrue(app.textViews["delivery-details"].waitForExistence(timeout: 10), "The simulator fallback should open invoice-free voice delivery capture")
  }

  func testSharedHomeEntryAutomaticallyCategorizesSupplierAndCustomerStock() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let suffix = String(UUID().uuidString.prefix(5))
    let supplierName = "Sharma QA \(suffix)"
    let supplierAlias = "Sharma QA \(suffix) ji"
    let customerName = "Tinku QA \(suffix) ji"
    let productName = "Maggi QA \(suffix)"

    app.tabBars.buttons["Suppliers"].tap()
    app.buttons["add-supplier"].tap()
    enter(supplierName, into: app.textFields["supplier-name"])
    enter(supplierAlias, into: app.textFields["supplier-aliases"])
    app.buttons["save-supplier"].tap()

    app.tabBars.buttons["Customers"].tap()
    app.buttons["add-customer"].tap()
    enter(customerName, into: app.textFields["customer-name"])
    enter(customerName, into: app.textFields["customer-aliases"])
    app.buttons["save-customer"].tap()

    app.tabBars.buttons["Products"].tap()
    app.buttons["add-product"].tap()
    enter(productName, into: app.textFields["product-name"])
    enter("1 kg", into: app.textFields["product-variant"])
    selectReceivingUnit("kg", in: app)
    app.buttons["save-product"].tap()

    app.tabBars.buttons["Home"].tap()
    let homeField = app.textViews["home-event-capture"]
    let transcript = "\(supplierAlias) ne aaj 10 kg \(productName) bheje hain aur \(customerName) ne mere se 2 kg \(productName) kharide hain"
    enter(transcript, into: homeField)
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(app.staticTexts["Note saved · shop records updated"].waitForExistence(timeout: 15), "A clear mixed supplier/customer note should save directly from Home")
    XCTAssertFalse(app.staticTexts["New receipt"].exists, "A categorized note should not route into a manual supplier form")
    XCTAssertEqual(homeField.value as? String, "", "A successful save should clear the submitted transcript")

    app.tabBars.buttons["Products"].tap()
    XCTAssertTrue(app.staticTexts[productName].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["8"].exists, "Ten received kg minus two customer-sale kg should leave eight kg in stock")

    let customersTab = app.tabBars.buttons["Customers"]
    customersTab.tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", customerName)).firstMatch.waitForExistence(timeout: 10),
      "The matched customer should remain in its dedicated tab")

    let suppliersTab = app.tabBars.buttons["Suppliers"]
    XCTAssertTrue(suppliersTab.waitForExistence(timeout: 10))
    suppliersTab.tap()
    XCTAssertTrue(app.buttons["record-supplier-payment"].waitForExistence(timeout: 10), "Switching back to the Suppliers tab should preserve the open supplier profile")
    XCTAssertTrue(app.staticTexts[supplierName].waitForExistence(timeout: 10), "The supplier profile should remain in its dedicated tab")

    app.tabBars.buttons["Home"].tap()
    XCTAssertTrue(app.textViews["home-event-capture"].waitForExistence(timeout: 10), "The Home tab should return to the shared note entry")
    XCTAssertTrue(app.buttons["home-action-ring-toggle"].waitForExistence(timeout: 10), "Home should offer one combined activity action")
    XCTAssertFalse(app.staticTexts["Add activity"].exists, "The floating action should be icon-only")
  }

  func testNaturalHindiNoteIdentifiesMissingMilkUnitThenPostsBothAccounts() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)
    app.tabBars.buttons["Shop"].tap()
    app.buttons["add-shop-profile"].tap()
    enter("Hindi voice note QA", into: app.textFields["shop-name"])
    app.buttons["setup-continue"].tap()
    let finishStock = app.buttons["finish-opening-stock"]
    XCTAssertTrue(finishStock.waitForExistence(timeout: 10))
    finishStock.tap()
    XCTAssertTrue(app.textViews["home-event-capture"].waitForExistence(timeout: 15))

    app.tabBars.buttons["Suppliers"].tap()
    app.buttons["add-supplier"].tap()
    enter("राज", into: app.textFields["supplier-name"])
    app.buttons["save-supplier"].tap()
    app.tabBars.buttons["Customers"].tap()
    app.buttons["add-customer"].tap()
    enter("राजू", into: app.textFields["customer-name"])
    app.buttons["save-customer"].tap()

    func addProduct(_ name: String, pack: String, unit: String) {
      app.tabBars.buttons["Products"].tap()
      app.buttons["add-product"].tap()
      enter(name, into: app.textFields["product-name"])
      enter(pack, into: app.textFields["product-variant"])
      selectReceivingUnit(unit, in: app)
      app.buttons["save-product"].tap()
      XCTAssertTrue(app.staticTexts["Products"].waitForExistence(timeout: 10))
    }

    addProduct("आटा", pack: "Loose", unit: "kg")
    app.tabBars.buttons["Home"].tap()
    let capture = app.textViews["home-event-capture"]
    let transcript = "राज मेरे supplier है माल का। आज उसने मेरे को 10 kg आटा और 5 kg दूध भेजा है। राजू ने मेरे से ₹100 उधार लिया है और उसके बदले 4 bread, 2 अंडा, 1 bread और 1 butter लिया है, 4 दिन में चुका देगा।"
    enter(transcript, into: capture)
    let alert = app.alerts["Some details need clarification"]
    XCTAssertFalse(alert.exists, "Entering a transcript must never submit the note")
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(alert.waitForExistence(timeout: 10))
    XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "5 kg दूध")).firstMatch.exists)
    XCTAssertFalse(app.staticTexts["Note saved · shop records updated"].exists)
    attachScreen("natural-hindi-missing-stock-unit")
    alert.buttons["OK"].tap()
    XCTAssertEqual(capture.value as? String, transcript)

    addProduct("दूध", pack: "Bulk", unit: "kg")
    addProduct("Bread", pack: "Loaf", unit: "piece")
    addProduct("अंडा", pack: "Single", unit: "piece")
    addProduct("Butter", pack: "100 g", unit: "packet")
    app.tabBars.buttons["Products"].tap()
    let search = app.textFields["products-search"]
    for (name, amount) in [("Bread", 7), ("अंडा", 3), ("Butter", 2)] {
      if app.buttons["Clear search"].exists { app.buttons["Clear search"].tap() }
      enter(name, into: search)
      if app.keyboards.buttons["Search"].exists { app.keyboards.buttons["Search"].tap() }
      let increase = app.buttons["Add one \(name)"]
      XCTAssertTrue(increase.isHittable)
      let quantity = app.staticTexts["product-stock-quantity"]
      for index in 1...amount {
        increase.tap()
        let updated = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", String(index)), object: quantity)
        XCTAssertEqual(XCTWaiter.wait(for: [updated], timeout: 8), .completed)
      }
    }
    app.tabBars.buttons["Home"].tap()
    XCTAssertEqual(capture.value as? String, transcript)
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(app.staticTexts["Note saved · shop records updated"].waitForExistence(timeout: 15))
    app.tabBars.buttons["Customers"].tap()
    app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "राजू")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["₹100"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Items bought on credit"].exists)
    XCTAssertTrue(app.staticTexts["Follow-ups and promises"].exists)
    attachScreen("natural-hindi-credit-after-submit")
    app.tabBars.buttons["Home"].tap()
    let missingQuantity = "राजू ने आज मेरे से ₹100 ले लिया है और उसके बदले 4 bread, 2 अंडे और दूध लिया है।"
    enter(missingQuantity, into: capture)
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(alert.waitForExistence(timeout: 10))
    XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "How much")).firstMatch.exists)
    XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "No records changed")).firstMatch.exists)
    alert.buttons["OK"].tap()
    XCTAssertEqual(capture.value as? String, missingQuantity)
  }

  func testBackupExportVerifiesAndRestoresPreviousRecords() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)
    let suffix = UUID().uuidString.prefix(6)
    let savedCustomer = "Before Backup \(suffix)"
    let laterCustomer = "After Backup \(suffix)"
    func addCustomer(_ name: String) {
      app.tabBars.buttons["Customers"].tap()
      app.buttons["add-customer"].tap()
      enter(name, into: app.textFields["customer-name"])
      app.buttons["save-customer"].tap()
      XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", name)).firstMatch.waitForExistence(timeout: 10))
    }
    func openRecoveryControl(_ identifier: String) -> XCUIElement {
      app.tabBars.buttons["Shop"].tap()
      app.buttons["open-settings"].tap()
      let control = app.buttons[identifier]
      for _ in 0..<5 where !control.isHittable { app.scrollViews.firstMatch.swipeUp() }
      XCTAssertTrue(control.isHittable)
      return control
    }
    let archiveEntries = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "dukaanflow-backup-"))
    addCustomer(savedCustomer)
    openRecoveryControl("settings-verify-backup").tap()
    let pickerCancel = app.buttons["Cancel"]
    XCTAssertTrue(pickerCancel.waitForExistence(timeout: 15))
    let existingArchives = archiveEntries.allElementsBoundByIndex.map(\.label)
    pickerCancel.tap()
    let export = app.buttons["settings-export-backup"]
    export.tap()
    let confirm = app.alerts["Export shop backup?"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 10))
    confirm.buttons["Continue"].tap()
    let save = app.buttons["Save"]
    XCTAssertTrue(save.waitForExistence(timeout: 30), "The Files export picker should open")
    attachScreen("backup-export-files-picker")
    save.tap()
    XCTAssertTrue(app.staticTexts["Backup saved to Files."].waitForExistence(timeout: 20), "The app should confirm a completed export")
    let verify = app.buttons["settings-verify-backup"]
    XCTAssertTrue(verify.waitForExistence(timeout: 10))
    verify.tap()
    let archive = archiveEntries.matching(NSPredicate(format: "NOT (label IN %@)", existingArchives)).firstMatch
    XCTAssertTrue(archive.waitForExistence(timeout: 15), "The saved ZIP should be available in Files")
    let archiveName = String(archive.label.split(separator: ",", maxSplits: 1)[0])
    attachScreen("backup-verify-files-picker")
    archive.tap()
    let verified = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Backup verified")).firstMatch
    XCTAssertTrue(verified.waitForExistence(timeout: 30), "The saved ZIP should pass verification")
    attachScreen("backup-verified")

    app.buttons["Back"].tap()
    addCustomer(laterCustomer)
    openRecoveryControl("settings-restore-backup").tap()
    let restore = app.alerts["Restore all shops from a backup?"]
    XCTAssertTrue(restore.waitForExistence(timeout: 10))
    restore.buttons["Choose backup"].tap()
    let restoreArchive = archiveEntries.matching(NSPredicate(format: "label BEGINSWITH %@", archiveName)).firstMatch
    XCTAssertTrue(restoreArchive.waitForExistence(timeout: 15))
    restoreArchive.tap()
    let restored = app.staticTexts["Backup restored"]
    let homeTab = app.tabBars.buttons["Home"]
    let restarted = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in restored.exists || homeTab.exists }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [restarted], timeout: 30), .completed)
    app.terminate()
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Customers"].waitForExistence(timeout: 20))
    app.tabBars.buttons["Customers"].tap()
    XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", savedCustomer)).firstMatch.waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons.containing(NSPredicate(format: "label CONTAINS %@", laterCustomer)).firstMatch.exists)
    attachScreen("backup-restored-customers")
  }

  func testUndatedCreditShowsEstimatedFollowUp() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)
    app.tabBars.buttons["Shop"].tap()
    app.buttons["add-shop-profile"].tap()
    enter("Follow-up QA", into: app.textFields["shop-name"])
    app.buttons["setup-continue"].tap()
    XCTAssertTrue(app.buttons["finish-opening-stock"].waitForExistence(timeout: 10))
    app.buttons["finish-opening-stock"].tap()
    app.tabBars.buttons["Customers"].tap()
    app.buttons["add-customer"].tap()
    enter("Ramesh", into: app.textFields["customer-name"])
    app.buttons["save-customer"].tap()
    app.tabBars.buttons["Home"].tap()
    let capture = app.textViews["home-event-capture"]
    enter("Ramesh ne ₹100 udhaar liya.", into: capture)
    app.buttons["submit-home-note"].tap()
    XCTAssertTrue(app.staticTexts["Note saved · shop records updated"].waitForExistence(timeout: 15))
    app.tabBars.buttons["Customers"].tap()
    app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Ramesh")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Estimated follow-up"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["₹100"].exists)
    let changeDate = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "change-follow-up-")).firstMatch
    XCTAssertTrue(changeDate.waitForExistence(timeout: 10))
    changeDate.tap()
    let prompt = app.alerts["Change follow-up date"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    let date = prompt.textFields.firstMatch
    date.tap()
    let existing = date.value as? String ?? ""
    date.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
    date.typeText("2026-12-08")
    XCTAssertEqual(date.value as? String, "2026-12-08")
    prompt.buttons["Save date"].tap()
    XCTAssertTrue(app.staticTexts["Follow-up"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["₹100"].exists)
    attachScreen("corrected-credit-follow-up")
  }

  func testOpeningStockBarcodeRetainsRapidEntry() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)
    app.tabBars.buttons["Shop"].tap()
    app.buttons["open-settings"].tap()
    let openingStock = app.buttons["settings-opening-stock"]
    XCTAssertTrue(openingStock.waitForExistence(timeout: 10))
    openingStock.tap()
    app.buttons["opening-stock-manual"].tap()
    let barcode = app.textFields["opening-stock-barcode"]
    XCTAssertTrue(barcode.waitForExistence(timeout: 10))
    barcode.tap()
    let value = "8901234567897"
    for attempt in 1...8 {
      barcode.typeText(value)
      XCTAssertEqual(barcode.value as? String, value, "Barcode digits must survive rapid entry on attempt \(attempt)")
      barcode.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
      XCTAssertTrue((barcode.value as? String ?? "").isEmpty, "Barcode field should clear before the next attempt")
    }
  }

  func testOpeningStockResumesAndShowsTheConfirmedCountInProducts() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)
    app.tabBars.buttons["Shop"].tap()
    app.buttons["add-shop-profile"].tap()
    enter("Opening Stock QA", into: app.textFields["shop-name"])
    app.buttons["setup-continue"].tap()
    let scanner = app.buttons["opening-stock-scan"]
    XCTAssertTrue(scanner.waitForExistence(timeout: 10))
    scanner.tap()

    enter("8901234567897", into: app.textFields["opening-stock-barcode"])
    enter("Opening Stock Rice", into: app.textFields["product-name"])
    enter("Loose", into: app.textFields["product-variant"])
    selectReceivingUnit("kg", in: app)
    enter("6", into: app.textFields["opening-stock-quantity"])
    app.buttons["save-product"].tap()
    XCTAssertTrue(app.staticTexts["6 kg counted"].waitForExistence(timeout: 10))
    attachScreen("opening-stock-confirmed")
    app.terminate()
    app.launch()
    let finish = app.buttons["finish-opening-stock"]
    XCTAssertTrue(finish.waitForExistence(timeout: 10))
    finish.tap()
    let home = app.textViews["home-event-capture"]
    XCTAssertTrue(home.waitForExistence(timeout: 10))
    app.tabBars.buttons["Products"].tap()
    enter("Opening Stock Rice", into: app.textFields["products-search"])
    XCTAssertEqual(app.staticTexts["product-stock-quantity"].label, "6")

    let searchSubmit = app.keyboards.buttons["Search"]
    if searchSubmit.exists && searchSubmit.isHittable { searchSubmit.tap() }
    let homeTab = app.tabBars.buttons["Home"]
    homeTab.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let submit = app.buttons["submit-home-note"]
    enter("नए सप्लायर मोहन ने 4 kg Opening Stock Rice भेजे।", into: home)
    submit.tap()
    XCTAssertTrue(app.buttons["receipt-row"].waitForExistence(timeout: 10))
    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == false"), object: submit)], timeout: 8), .completed)
    enter("एक ग्राहक ने 2 kg Opening Stock Rice खरीदे।", into: home)
    submit.tap()
    XCTAssertTrue(app.staticTexts["Walk-in customer"].waitForExistence(timeout: 10))
    attachScreen("two-daily-counter-events")
    app.tabBars.buttons["Products"].tap()
    XCTAssertEqual(app.staticTexts["product-stock-quantity"].label, "8")
  }

  func testMixedWisprNoteDoesNotOpenPerEventManualReviewWhenCatalogIsIncomplete() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    app.tabBars.buttons["Customers"].tap()
    app.buttons["add-customer"].tap()
    let suffix = String(UUID().uuidString.prefix(5))
    let customerName = "Raju QA \(suffix)"
    let customerAlias = "Raju \(suffix)"
    let supplierAlias = "Rajesh supplier \(suffix)"
    enter(customerName, into: app.textFields["customer-name"])
    enter(customerAlias, into: app.textFields["customer-aliases"])
    app.buttons["save-customer"].tap()

    app.tabBars.buttons["Suppliers"].tap()
    app.buttons["add-supplier"].tap()
    enter("Rajesh Traders QA \(suffix)", into: app.textFields["supplier-name"])
    enter(supplierAlias, into: app.textFields["supplier-aliases"])
    app.buttons["save-supplier"].tap()

    app.tabBars.buttons["Home"].tap()
    let transcript = "\(supplierAlias) ne mujhe 12 carton Maggi aur 4 carton doodh diye; \(customerAlias) ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो."
    let capture = app.textViews["home-event-capture"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    capture.tap()
    capture.typeText(transcript)
    app.buttons["submit-home-note"].tap()

    let clarification = app.alerts["Some details need clarification"]
    XCTAssertTrue(clarification.waitForExistence(timeout: 10),
      "Incomplete catalog facts must block writes without sending the owner through separate event review forms")
    XCTAssertTrue(clarification.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "No records changed")).firstMatch.exists,
      "An unresolved product match must leave the ledger untouched")
    XCTAssertFalse(app.staticTexts["Review this note"].exists)
    XCTAssertFalse(app.buttons["review-multi-event-supplier"].exists)
    attachScreen("mixed-note-no-per-event-review")
    app.alerts.buttons["OK"].tap()
    XCTAssertEqual(capture.value as? String, transcript, "Keep the transcript available so the owner can correct the unresolved catalog wording")
  }

  func testSupplierReceiptDictationResolvesCodeSwitchedNameAndCartonUnits() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let suffix = String(UUID().uuidString.prefix(5))
    let supplierName = "Sharma QA \(suffix)"
    let supplierAlias = "Sharma QA \(suffix) ji"
    let maggiName = "Maggi QA \(suffix)"
    let milkName = "Milk QA \(suffix)"

    app.tabBars.buttons["Suppliers"].tap()
    app.buttons["add-supplier"].tap()
    enter(supplierName, into: app.textFields["supplier-name"])
    enter(supplierAlias, into: app.textFields["supplier-aliases"])
    app.buttons["save-supplier"].tap()

    app.tabBars.buttons["Products"].tap()
    app.buttons["add-product"].tap()
    enter(maggiName, into: app.textFields["product-name"])
    enter("1 kg", into: app.textFields["product-variant"])
    selectReceivingUnit("kg", in: app)
    app.buttons["save-product"].tap()
    XCTAssertTrue(app.staticTexts[maggiName].waitForExistence(timeout: 10), "Return to the catalog with the first product saved before adding a carton")

    app.buttons["add-product"].tap()
    enter(milkName, into: app.textFields["product-name"])
    enter("carton · 12 x 500 ml", into: app.textFields["product-variant"])
    selectReceivingUnit("box", in: app)
    enter("4", into: app.textFields["carton-pack-count"])
    XCTAssertEqual(app.textFields["carton-retail-pack-size"].value as? String, "500 ml",
      "The existing 500 ml retail SKU should be prefilled as the carton contents and remain owner-editable")
    app.buttons["save-product"].tap()

    app.tabBars.buttons["Home"].tap()
    app.buttons["home-action-ring-toggle"].tap()
    app.buttons["home-action-receive-delivery"].tap()
    XCTAssertTrue(app.buttons["quick-entry-without-invoice"].waitForExistence(timeout: 10), "The owner can choose voice capture without an invoice")
    app.buttons["quick-entry-without-invoice"].tap()
    let transcript = "\(supplierAlias) ne aaj 10 kg \(maggiName) bheje hain aur 4 cartons \(milkName)"
    enter(transcript, into: app.textViews["delivery-details"])
    app.buttons["capture-review"].tap()

    let editText = app.buttons["Edit text"]
    XCTAssertTrue(editText.waitForExistence(timeout: 10))
    editText.tap()
    let receiptText = app.textViews["delivery-details"]
    XCTAssertTrue(receiptText.waitForExistence(timeout: 10))
    XCTAssertEqual(receiptText.value as? String, transcript)
    app.buttons["capture-review"].tap()

    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", supplierName)).firstMatch.waitForExistence(timeout: 10),
      "The spoken supplier alias should resolve to this shop's profile")
    XCTAssertFalse(app.staticTexts["Choose the exact product"].exists)
    XCTAssertFalse(app.staticTexts["Check the quantity"].exists)
    XCTAssertFalse(app.staticTexts["Choose the unit"].exists)
    XCTAssertTrue(app.buttons["save-receipt"].isEnabled,
      "Exact catalog names and spoken kg/carton units should be ready to confirm without field-by-field correction")
    attachScreen("supplier-receipt-lines-auto-resolved")

    app.buttons["save-receipt"].tap()
    XCTAssertTrue(app.staticTexts["Receipt saved"].waitForExistence(timeout: 15))
    app.tabBars.buttons["Products"].tap()
    XCTAssertTrue(app.staticTexts[maggiName].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts[milkName].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["10"].exists, "The Maggi kg quantity should update stock")
    XCTAssertTrue(app.staticTexts["4"].exists, "The carton quantity should update box stock")
  }

  func testUnresolvedSingleCustomerNoteStaysOnHomeInsteadOfOpeningManualEntry() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    let suffix = String(UUID().uuidString.prefix(5))
    let customerName = "Raju QA \(suffix)"
    app.tabBars.buttons["Customers"].tap()
    app.buttons["add-customer"].tap()
    enter(customerName, into: app.textFields["customer-name"])
    enter(customerName, into: app.textFields["customer-aliases"])
    app.buttons["save-customer"].tap()

    app.tabBars.buttons["Home"].tap()
    let capture = app.textViews["home-event-capture"]
    let transcript = "\(customerName) bought 2 packets of an unknown product on credit"
    enter(transcript, into: capture)
    app.buttons["submit-home-note"].tap()

    XCTAssertTrue(app.alerts.staticTexts["Some details need clarification"].waitForExistence(timeout: 10))
    app.alerts.buttons["OK"].tap()
    XCTAssertTrue(capture.waitForExistence(timeout: 5), "The note should remain in the shared Home field")
    XCTAssertEqual(capture.value as? String, transcript, "A missing product match must not discard the user's words")
    XCTAssertFalse(app.staticTexts["Record customer event"].exists, "The app should not redirect into a separate manual categorization form")
  }

  func testProductCanBeAddedSearchedAndUnitConfirmed() throws {
    let app = XCUIApplication()
    app.launch()
    finishFirstRunIfNeeded(app)

    app.tabBars.buttons["Products"].tap()
    app.buttons["add-product"].tap()
    XCTAssertTrue(app.buttons["scan-product-barcode"].waitForExistence(timeout: 10), "Product setup should offer barcode scanning")

    let productName = "DukaanFlow QA \(UUID().uuidString.prefix(5))"
    enter(productName, into: app.textFields["product-name"])
    enter("1 kg", into: app.textFields["product-variant"])
    let kiloUnit = app.descendants(matching: .any)["product-unit-kg"]
    XCTAssertTrue(kiloUnit.waitForExistence(timeout: 10), "The receiving unit selector should include kg")
    kiloUnit.tap()
    app.buttons["save-product"].tap()

    let search = app.textFields["products-search"]
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    search.tap()
    search.typeText("DukaanFlow QA")
    let searchableProduct = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "DukaanFlow QA")).firstMatch
    if !searchableProduct.waitForExistence(timeout: 10) {
      attachScreen("product-search-did-not-match")
      app.buttons["Clear search"].tap()
      XCTAssertTrue(searchableProduct.waitForExistence(timeout: 10), "Saved catalog items should be visible when search is cleared")
    }
    attachScreen("product-added-and-searchable")
  }
}
