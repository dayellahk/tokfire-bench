import SwiftUI
import AppKit
import UniformTypeIdentifiers

@main
struct LocalAIBenchApp: App {
    @StateObject private var bench = BenchController()
    var body: some Scene {
        WindowGroup {
            BenchView(bench: bench).frame(minWidth: 780, minHeight: 650)
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in bench.cancel() }
        }
    }
}

final class BenchController: ObservableObject {
    @Published var server = "/opt/homebrew/bin/llama-server"
    @Published var python = "/opt/homebrew/bin/python3"
    @Published var models: [URL] = []
    @Published var trial = false
    @Published var reportIsTrial = false
    @Published var currentModel = 0
    @Published var running = false
    @Published var message = "Choose 1–3 GGUF models. They will run one at a time."
    @Published var summaries: [String] = []
    @Published var report: URL?
    @Published var outputText = ""
    private var task: Process?
    private let website = URL(string: "https://local-ai-benchmark-lab.mossy-fern-2045.chatgpt.site/")!
    var validSelection: Bool { trial ? models.count == 1 : (1...3).contains(models.count) }

    func chooseModels() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = !trial
        panel.canChooseDirectories = false
        if let gguf = UTType(filenameExtension: "gguf") { panel.allowedContentTypes = [gguf] }
        if panel.runModal() == .OK {
            let files = panel.urls.filter { $0.pathExtension.lowercased() == "gguf" }
            guard (trial ? files.count == 1 : (1...3).contains(files.count)) else {
                message = trial ? "Please choose one GGUF file." : "Please choose 1–3 GGUF files."; return
            }
            models = files
        }
    }
    func chooseBinary(python isPython: Bool) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            if isPython { python = url.path } else { server = url.path }
        }
    }
    func run() {
        guard !running, validSelection,
              let script = (Bundle.main.url(forResource: "runner", withExtension: "py") ?? Bundle.module.url(forResource: "runner", withExtension: "py")) else { return }
        guard FileManager.default.isExecutableFile(atPath: python), FileManager.default.isExecutableFile(atPath: server) else {
            message = "Select installed Python 3.10+ and llama-server executables."; return
        }
        do {
            let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("LocalAIBench/Reports")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = folder.appendingPathComponent("benchmark-\(UUID().uuidString).json")
            let process = Process()
            process.executableURL = URL(fileURLWithPath: python)
            process.arguments = ["-u", script.path] + (trial ? ["--trial"] : []) + ["--server", server, "--output", destination.path, "--models"] + models.map(\.path)
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice
            running = true; report = nil; reportIsTrial = trial; currentModel = 0; summaries = []; outputText = ""; message = "Starting benchmark…"
            task = process
            do { try process.run() } catch { running = false; task = nil; throw error }
            // Reading on a worker queue prevents inference from blocking SwiftUI.
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                var pending = Data()
                while true {
                    let chunk = pipe.fileHandleForReading.availableData
                    if chunk.isEmpty { break }
                    pending.append(chunk)
                    while let newline = pending.firstIndex(of: 10) {
                        let line = pending.prefix(upTo: newline)
                        pending.removeSubrange(...newline)
                        guard let event = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any] else { continue }
                        DispatchQueue.main.async { self?.receive(event, destination: destination) }
                    }
                }
                process.waitUntilExit()
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.running = false; self.task = nil
                    if process.terminationStatus != 0 && self.report == nil && !self.message.hasPrefix("Stopped") {
                        self.message = "Benchmark failed: " + self.message
                    }
                }
            }
        } catch { message = error.localizedDescription }
    }
    private func receive(_ event: [String: Any], destination: URL) {
        if let index = event["modelIndex"] as? Int { currentModel = index }
        switch event["event"] as? String {
        case "progress", "error", "cancelled": message = event["message"] as? String ?? "Status unavailable"
        case "model":
            let index = event["modelIndex"] as? Int ?? 0
            let speed = event["decodeTps"] as? Double ?? 0
            summaries.append(String(format: "Model %d: %.1f tokens/sec at 512 input tokens", index, speed))
        case "complete":
            report = destination
            outputText = (try? String(contentsOf: destination, encoding: .utf8)) ?? ""
            message = reportIsTrial ? "Trial complete. Report saved locally; short trials cannot be uploaded to comparisons." : "Complete. Report saved locally. No data has been uploaded."
        default: break
        }
    }
    func cancel() { if let task = task, task.isRunning { task.terminate() }; message = "Stopped. Waiting for the model process to close…" }
    func export() {
        guard let report = report else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "local-ai-benchmark.json"
        panel.allowedContentTypes = [.json]
        if panel.runModal() == .OK, let destination = panel.url {
            do { try Data(contentsOf: report).write(to: destination, options: .atomic) }
            catch { message = error.localizedDescription }
        }
    }
    func openWebsite() { NSWorkspace.shared.open(website) }
}

struct BenchView: View {
    @ObservedObject var bench: BenchController
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("LOCAL//AI  BENCH LAB").font(.system(.caption, design: .monospaced)).foregroundColor(.green)
                Text("Measure your Mac.").font(.system(size: 40, weight: .bold))
                Text("Real llama.cpp measurements · Apple Silicon · Developer alpha").foregroundColor(.secondary)
                Text("Detected: \(ProcessInfo.processInfo.processorCount) CPU cores · \(ProcessInfo.processInfo.physicalMemory / (1024 * 1024 * 1024)) GiB memory").font(.headline)
                GroupBox("Runtime") {
                    VStack(alignment: .leading) {
                        HStack { TextField("Python 3 executable", text: $bench.python); Button("Choose Python") { bench.chooseBinary(python: true) } }
                        HStack { TextField("llama-server executable", text: $bench.server); Button("Choose runtime") { bench.chooseBinary(python: false) } }
                    }.padding(10)
                }.disabled(bench.running)
                Toggle("Quick trial — one model, one short measured run", isOn: $bench.trial).disabled(bench.running)
                GroupBox(bench.trial ? "Model — choose one single-file GGUF" : "Models — choose 1–3 GGUFs; one runs at a time") {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(bench.models.enumerated()), id: \.offset) { index, url in Text("\(index + 1). \(url.lastPathComponent)").font(.system(.body, design: .monospaced)) }
                        Button(bench.trial ? "Choose model file" : "Choose up to 3 model files") { bench.chooseModels() }.disabled(bench.running)
                        Text("Selected models run in order. Each model process closes before the next starts. Each file must be below 65% of physical memory. This is a conservative preflight estimate, not a guarantee of fit.").font(.caption).foregroundColor(.secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }
                Text(bench.trial ? "Trial: 512 input tokens · 32 output tokens · 1 warm-up + 1 measured run · local-only results" : "Per model: 512 and 2,048 input tokens · 128 output tokens · 1 warm-up + 3 measured runs per workload · 4,096 context · cache disabled").font(.callout).foregroundColor(.secondary)
                HStack {
                    Button(bench.trial ? "Run trial" : "Run benchmark") { bench.run() }.buttonStyle(.borderedProminent).disabled(bench.running || !bench.validSelection)
                    if bench.running { ProgressView().controlSize(.small); Button("Stop") { bench.cancel() } }
                }
                Text(bench.message).textSelection(.enabled)
                if bench.running && bench.currentModel > 0 {
                    Text("Model round \(bench.currentModel) of \(bench.models.count) · one model active").font(.headline)
                }
                ForEach(Array(bench.summaries.enumerated()), id: \.offset) { _, line in Text(line).font(.headline) }
                if bench.report != nil {
                    HStack { Button("Export report…") { bench.export() }; if !bench.reportIsTrial { Button("Review & upload on website") { bench.openWebsite() } } }
                    DisclosureGroup("Inspect exact report contents") { Text(bench.outputText).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
                }
                Divider()
                Label("Local by default. The app never uploads results. Choose collection and publication separately on the website.", systemImage: "lock.shield").font(.callout)
                Text("TTFT includes loopback HTTP overhead. Process RSS is not total GPU/unified memory. Model names and file paths stay on this Mac; exported models are identified by content hashes.").font(.caption).foregroundColor(.secondary)
            }.padding(32)
        }.preferredColorScheme(.dark)
    }
}
