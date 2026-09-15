// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "LocalAIBench",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "LocalAIBench", targets: ["LocalAIBench"])],
    targets: [.executableTarget(name: "LocalAIBench", resources: [.copy("Resources/runner.py")])]
)
