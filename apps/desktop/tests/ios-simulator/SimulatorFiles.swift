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

    let chooseFiles = app.buttons["Choose Files"].firstMatch
    if chooseFiles.waitForExistence(timeout: 3) { chooseFiles.tap() }
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3), browse.isHittable { browse.tap() }
    let local = NSPredicate(format: "label IN %@", ["On My iPhone", "On My iPad"])
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
    for folder in folders {
        let entry = app.staticTexts[folder].firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 15), app.debugDescription)
        entry.tap()
    }
    let baseName = (filename as NSString).deletingPathExtension
    let fileExtension = (filename as NSString).pathExtension
    let document = app.collectionViews["File View"].cells
        .matching(NSPredicate(format: "identifier IN %@", [filename, "\(baseName), \(fileExtension)"])).firstMatch
    XCTAssertTrue(document.waitForExistence(timeout: 20), app.debugDescription)
    let icon = document.images.firstMatch
    if icon.exists && icon.isHittable { icon.tap() } else { document.tap() }
    let confirm = app.navigationBars.buttons["Open"].firstMatch
    if confirm.waitForExistence(timeout: 2), confirm.isHittable { confirm.tap() }
    let selectedFile = web.buttons.matching(NSPredicate(
        format: "label BEGINSWITH %@ AND value CONTAINS[c] %@", input, baseName
    )).firstMatch
    XCTAssertTrue(selectedFile.waitForExistence(timeout: 15), app.debugDescription)
}
