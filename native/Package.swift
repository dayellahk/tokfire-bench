// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "LocalAIBench",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "LocalAIBench", targets: ["LocalAIBench"])],
    targets: [
        .executableTarget(name: "LocalAIBench", resources: [.copy("Resources/runner.py"), .copy("Resources/omlx_runner.py"), .copy("Resources/languages.json")]),
        .testTarget(name: "LocalAIBenchTests", dependencies: ["LocalAIBench"], path: "TestsSwift")
    ]
)
