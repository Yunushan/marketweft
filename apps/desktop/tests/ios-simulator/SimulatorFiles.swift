import Foundation
import XCTest

@MainActor
func importSimulatorCSV(in app: XCUIApplication, symbol: String) {
    let web = app.webViews.firstMatch
    let open = web.buttons["Import CSV"]
    XCTAssertTrue(open.waitForExistence(timeout: 35), app.debugDescription)
    open.tap()

    enterSimulatorSymbol(symbol, in: web)
    chooseSimulatorFile(in: app, input: "Historical CSV file", folders: ["MarketWeft Test Files"], filename: "native-verification.csv")

    enterSimulatorSymbol(symbol, in: web)

    let submit = web.buttons["Import to watchlist"]
    XCTAssertTrue(submit.waitForExistence(timeout: 15), app.debugDescription)
    if !submit.isHittable { web.swipeUp() }
    submit.tap()
}

@MainActor
func enterSimulatorSymbol(_ symbol: String, in web: XCUIElement) {
    let field = web.textFields.matching(
        NSPredicate(format: "label == %@ OR placeholderValue == %@", "Symbol", "e.g. ABC")
    ).firstMatch
    guard field.waitForExistence(timeout: 15) else {
        XCTFail("The import symbol field was unavailable. \(web.debugDescription)")
        return
    }
    for _ in 0..<2 {
        if (field.value as? String) == symbol { return }
        field.tap()
        let value = field.value as? String ?? ""
        let entered = value == field.placeholderValue ? "" : value
        guard symbol.hasPrefix(entered) else {
            XCTFail("Unexpected import symbol \(entered). \(field.debugDescription)")
            return
        }
        let remaining = String(symbol.dropFirst(entered.count))
        if !remaining.isEmpty { field.typeText(remaining) }
        let typed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", symbol), object: field)
        if XCTWaiter.wait(for: [typed], timeout: 3) == .completed { return }
    }
    XCTAssertEqual(field.value as? String, symbol, field.debugDescription)
}

@MainActor
func chooseSimulatorFile(in app: XCUIApplication, input: String, folders: [String], filename: String) {
    let web = app.webViews.firstMatch
    let file = web.descendants(matching: .any)
        .matching(NSPredicate(format: "label BEGINSWITH %@", input)).firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 15), app.debugDescription)
    if !file.isHittable { web.swipeUp() }
    file.tap()

    let locations = ["On My iPhone", "On My iPad"]
    let folderControls = folders + folders.map { "\($0), Actions Menu" }
    let pickerControls = ["Browse", "Recents", "Locations"] + locations + folderControls
    let picker = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label IN %@", pickerControls)).firstMatch
    let chooseFiles = app.buttons["Choose Files"].firstMatch
    let openingControl = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label IN %@", pickerControls + ["Choose Files"])).firstMatch
    XCTAssertTrue(openingControl.waitForExistence(timeout: 25), app.debugDescription)
    if chooseFiles.exists && chooseFiles.isHittable { chooseFiles.tap() }
    XCTAssertTrue(picker.waitForExistence(timeout: 25), app.debugDescription)

    let entries = app.collectionViews["File View"].cells
    let baseName = (filename as NSString).deletingPathExtension
    let fileExtension = (filename as NSString).pathExtension
    let identifiers = [filename, "\(baseName), \(fileExtension)", "\(filename), \(fileExtension)"]
    let document = entries.matching(NSPredicate(format: "identifier IN %@", identifiers)).firstMatch
    let openFolder = folders.last.map { app.navigationBars.buttons["\($0), Actions Menu"].firstMatch }
    // Files may reopen directly in the folder that supplied the last import.
    if openFolder?.waitForExistence(timeout: 2) != true || !document.waitForExistence(timeout: 2) {
        navigateSimulatorFiles(in: app, locations: locations, folders: folders, entries: entries)
    }
    XCTAssertTrue(document.waitForExistence(timeout: 20), app.debugDescription)
    tapFilesCell(document)
    let confirm = app.navigationBars.buttons["Open"].firstMatch
    if confirm.waitForExistence(timeout: 2), confirm.isHittable { confirm.tap() }
    // WebKit can clip the visible filename in narrow file controls after the picker closes.
    let visibleFilenamePrefix = String(baseName.prefix(12))
    let selectedFile = web.buttons.matching(NSPredicate(
        format: "label BEGINSWITH %@ AND (value CONTAINS[c] %@ OR value BEGINSWITH[c] %@)",
        input, baseName, visibleFilenamePrefix
    )).firstMatch
    XCTAssertTrue(selectedFile.waitForExistence(timeout: 15), app.debugDescription)
}

@MainActor
private func navigateSimulatorFiles(
    in app: XCUIApplication, locations: [String], folders: [String], entries: XCUIElementQuery
) {
    let browse = app.buttons["Browse"].firstMatch
    if browse.exists && browse.isHittable { browse.tap() }
    let local = NSPredicate(format: "label IN %@", locations)
    let localIdentifiers = locations.map { "DOC.sidebar.item.\($0)" }
    let localCell = app.cells.matching(NSPredicate(format: "identifier IN %@", localIdentifiers)).firstMatch
    let previousFolder = app.navigationBars.buttons["MarketWeft"].firstMatch
    if previousFolder.exists && previousFolder.isHittable { previousFolder.tap() }
    let backToLocal = app.navigationBars.buttons.matching(local).firstMatch
    if backToLocal.exists && backToLocal.isHittable {
        backToLocal.tap()
    } else if localCell.exists && localCell.isHittable {
        localCell.tap()
    } else {
        let location = app.staticTexts.matching(local).firstMatch
        XCTAssertTrue(location.waitForExistence(timeout: 15), app.debugDescription)
        location.tap()
    }
    for (index, folder) in folders.enumerated() {
        let entry = entries.matching(NSPredicate(
            format: "identifier == %@ OR label == %@ OR label BEGINSWITH %@",
            "\(folder), Folder", folder, "\(folder),"
        )).firstMatch
        if index == 0, !entry.waitForExistence(timeout: 5), localCell.exists, localCell.isHittable {
            // Files can leave the local location selected in the sidebar after a tap.
            let forward = localCell.images["chevron.forward"].firstMatch
            if forward.exists && forward.isHittable { forward.tap() } else { localCell.tap() }
        }
        XCTAssertTrue(entry.waitForExistence(timeout: 20), "Missing Files folder \(folder). \(app.debugDescription)")
        tapFilesCell(entry)
    }
}

@MainActor
private func tapFilesCell(_ cell: XCUIElement) {
    let icon = cell.images.firstMatch
    if icon.exists && icon.isHittable { icon.tap() } else { cell.tap() }
}
