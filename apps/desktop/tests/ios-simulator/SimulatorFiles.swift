import Foundation
import XCTest

@MainActor
func chooseSimulatorFile(in app: XCUIApplication, input: String, folders: [String], filename: String) {
    let web = app.webViews.firstMatch
    let file = web.descendants(matching: .any)
        .matching(NSPredicate(format: "label BEGINSWITH %@", input)).firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 15), app.debugDescription)
    if !file.isHittable { web.swipeUp() }
    file.tap()

    let locations = ["On My iPhone", "On My iPad"]
    let pickerControls = ["Browse", "Recents", "Locations"] + locations + folders
    let picker = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label IN %@", pickerControls)).firstMatch
    let chooseFiles = app.buttons["Choose Files"].firstMatch
    let openingControl = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label IN %@", pickerControls + ["Choose Files"])).firstMatch
    XCTAssertTrue(openingControl.waitForExistence(timeout: 25), app.debugDescription)
    if chooseFiles.exists && chooseFiles.isHittable { chooseFiles.tap() }
    XCTAssertTrue(picker.waitForExistence(timeout: 25), app.debugDescription)
    let browse = app.buttons["Browse"].firstMatch
    if browse.exists && browse.isHittable { browse.tap() }
    let local = NSPredicate(format: "label IN %@", locations)
    let previousFolder = app.navigationBars.buttons["MarketWeft"].firstMatch
    if previousFolder.exists && previousFolder.isHittable { previousFolder.tap() }
    let backToLocal = app.navigationBars.buttons.matching(local).firstMatch
    if backToLocal.exists && backToLocal.isHittable {
        backToLocal.tap()
    } else {
        let location = app.staticTexts.matching(local).firstMatch
        XCTAssertTrue(location.waitForExistence(timeout: 15), app.debugDescription)
        location.tap()
    }
    let entries = app.collectionViews["File View"].cells
    for folder in folders {
        let entry = entries.matching(NSPredicate(
            format: "identifier == %@ OR label == %@ OR label BEGINSWITH %@",
            "\(folder), Folder", folder, "\(folder),"
        )).firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 20), "Missing Files folder \(folder). \(app.debugDescription)")
        tapFilesCell(entry)
    }
    let baseName = (filename as NSString).deletingPathExtension
    let fileExtension = (filename as NSString).pathExtension
    let document = entries
        .matching(NSPredicate(format: "identifier IN %@", [filename, "\(baseName), \(fileExtension)"])).firstMatch
    XCTAssertTrue(document.waitForExistence(timeout: 20), app.debugDescription)
    tapFilesCell(document)
    let confirm = app.navigationBars.buttons["Open"].firstMatch
    if confirm.waitForExistence(timeout: 2), confirm.isHittable { confirm.tap() }
    let selectedFile = web.buttons.matching(NSPredicate(
        format: "label BEGINSWITH %@ AND value CONTAINS[c] %@", input, baseName
    )).firstMatch
    XCTAssertTrue(selectedFile.waitForExistence(timeout: 15), app.debugDescription)
}

@MainActor
private func tapFilesCell(_ cell: XCUIElement) {
    let icon = cell.images.firstMatch
    if icon.exists && icon.isHittable { icon.tap() } else { cell.tap() }
}
