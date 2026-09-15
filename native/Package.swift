// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "LocalAIBench",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "LocalAIBench", targets: ["LocalAIBench"])],
    targets: [
        .executableTarget(name: "LocalAIBench", resources: [.copy("Resources/runner.py"), .copy("Resources/omlx_runner.py"), .copy("Resources/languages.json"), .copy("Resources/jobs_runner.py"), .copy("Resources/platform_support.py"), .copy("Resources/pro_license.py"), .copy("Resources/lemon-squeezy.json")]),
        .testTarget(name: "LocalAIBenchTests", dependencies: ["LocalAIBench"], path: "TestsSwift")
    ]
)
