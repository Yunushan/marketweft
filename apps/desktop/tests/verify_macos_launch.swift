import AppKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 3 else {
    fail("Provide the exact application bundle path and bundle identifier.")
}
let bundle = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL.resolvingSymlinksInPath()
let identifier = CommandLine.arguments[2]
let deadline = Date().addingTimeInterval(30)
var launched: NSRunningApplication?
while Date() < deadline {
    launched = NSWorkspace.shared.runningApplications.first {
        $0.bundleIdentifier == identifier &&
        $0.bundleURL?.standardizedFileURL.resolvingSymlinksInPath() == bundle
    }
    if let application = launched, application.isFinishedLaunching, !application.isTerminated {
        print("Verified Launch Services startup for \(bundle.path).")
        break
    }
    RunLoop.current.run(until: Date().addingTimeInterval(0.2))
}
guard let application = launched, application.isFinishedLaunching, !application.isTerminated else {
    launched?.forceTerminate()
    fail("The exact packaged MarketWeft app did not finish launching.")
}
_ = application.terminate()
let exitDeadline = Date().addingTimeInterval(10)
while !application.isTerminated && Date() < exitDeadline {
    RunLoop.current.run(until: Date().addingTimeInterval(0.2))
}
if !application.isTerminated {
    _ = application.forceTerminate()
    fail("The packaged MarketWeft app did not close normally.")
}
