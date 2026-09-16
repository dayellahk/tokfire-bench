import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor final class BenchController: ObservableObject {
    @Published var server = UserDefaults.standard.string(forKey: "llamaServer") ?? "/opt/homebrew/bin/llama-server" {
        didSet { UserDefaults.standard.set(server, forKey: "llamaServer"); runtimeHash = nil }
    }
    @Published var python = UserDefaults.standard.string(forKey: "pythonExecutable") ?? "/opt/homebrew/bin/python3" {
        didSet { UserDefaults.standard.set(python, forKey: "pythonExecutable") }
    }
    let uploads = UploadStore()
    let pro = ProStore()
    @Published var workloadMode = true
    @Published var workload = "short-chat"
    @Published var repeats = 3
    @Published var sweep = false
    @Published var endpoint = "http://127.0.0.1:11434"
    @Published var servedModel = ""
    @Published var workloadResult: WorkloadReport?
    @Published var workloadCommentary = ""
    @Published var workloadHistory: [URL] = []
    var externalRuntime: Bool { ["Ollama", "vLLM"].contains(backend) }
    var usesWorkloads: Bool { externalRuntime || (usesJobs && workloadMode) }
    var workloadLevels: [Int] { sweep ? Array(Set([1,2,3,4,8,12,16,20].filter { $0 <= concurrentJobs } + [concurrentJobs])).sorted() : [concurrentJobs] }
    var expectedSamples: Int { usesWorkloads ? workloadLevels.reduce(0,+) * repeats : usesJobs ? concurrentJobs * 3 : models.count * (trial ? 1 : 6) }
    @Published var concurrentMode = true
    @Published var concurrentJobs = 1
    var usesJobs: Bool { externalRuntime || backend == "oMLX" || concurrentMode }
    @Published var backend = "llama.cpp"
    @Published var omlx = UserDefaults.standard.string(forKey: "omlxExecutable") ?? "/opt/homebrew/bin/omlx" { didSet { UserDefaults.standard.set(omlx, forKey: "omlxExecutable") } }
    @Published var mlxModel: URL?
    private var runConsent = false
    private var runPublication = false
    func chooseMLX() {
        let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true
        if panel.runModal() == .OK { mlxModel = panel.url }
    }
    @Published var models: [URL] = []
    @Published var library: [URL] = []
    @Published var trial = false
    @Published var running = false
    @Published var stopping = false
    @Published var message = "加入模型，即可開始你的第一個本機測試。"
    @Published var phase = "準備就緒"
    @Published var currentModel = 0
    @Published var completedSamples = 0
    @Published var totalSamples = 0
    @Published var latest: Sample?
    @Published var result: RunReport?
    @Published var report: URL?
    @Published var history: [HistoryItem] = []
    @Published var events: [String] = []
    @Published var started: Date?
    @Published var runtimeHash: String?
    private let device = DeviceProfile.detect()
    private var task: Process?
    private var runToken = UUID()
    var validSelection: Bool { usesJobs ? (1...pro.limit).contains(concurrentJobs) && (externalRuntime ? !servedModel.trimmingCharacters(in: .whitespaces).isEmpty : backend == "oMLX" ? mlxModel != nil : models.count == 1) : trial ? models.count == 1 : (1...3).contains(models.count) }
    var progress: Double { totalSamples == 0 ? 0 : Double(completedSamples) / Double(totalSamples) }
    init() { reloadLibrary(); reloadHistory() }
    func add(_ urls: [URL]) {
        guard !running else { return }
        for url in urls where url.pathExtension.lowercased() == "gguf" {
            let canonical = url.resolvingSymlinksInPath()
            if !models.contains(where: { $0.resolvingSymlinksInPath() == canonical }), models.count < 3 { models.append(url) }
        }
        message = "已選 \(models.count) 個模型；按開始後依次執行。"
        reloadLibrary()
    }
    func chooseModels() {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = !usesJobs; panel.canChooseDirectories = false
        panel.allowedContentTypes = [UTType(filenameExtension: "gguf") ?? .data]
        if panel.runModal() == .OK { if usesJobs { models = panel.urls } else { add(panel.urls) } }
    }
    func chooseBinary(python isPython: Bool) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { if isPython { python = url.path } else { server = url.path; runtimeHash = nil } }
    }
    func reloadLibrary() {
        library = ((try? FileManager.default.contentsOfDirectory(at: modelsFolder, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension.lowercased() == "gguf" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    func reloadHistory() {
        let urls = ((try? FileManager.default.contentsOfDirectory(at: reportsFolder, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []).filter { $0.pathExtension == "json" }
        let entries: [HistoryItem] = urls.compactMap { url in
            guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path), (attributes[.size] as? NSNumber)?.intValue ?? Int.max <= 200_000,
                  let data = try? Data(contentsOf: url), let report = try? JSONDecoder().decode(RunReport.self, from: data),
                  ["local-ai-text-v1", "local-ai-trial-v1", "local-ai-omlx-v1", "local-ai-jobs-v1"].contains(report.specVersion), !report.models.isEmpty,
                  report.models.allSatisfy({ !$0.samples.isEmpty && $0.samples.allSatisfy { $0.decodeTps.isFinite && $0.decodeTps > 0 && $0.ttftMs.isFinite && $0.ttftMs > 0 } }) else { return nil }
            return HistoryItem(url: url, report: report)
        }
        workloadHistory = urls.filter { url in
            guard let data = try? Data(contentsOf: url), data.count <= 4_000_000,
                  let report = try? JSONDecoder().decode(WorkloadReport.self, from: data) else { return false }
            return report.specVersion == "tokfire-workloads-v1" && !report.models.isEmpty
        }.sorted { $0.lastPathComponent > $1.lastPathComponent }
        history = entries.sorted { $0.report.measuredAt > $1.report.measuredAt }
    }
    func inspect(_ item: HistoryItem) { guard !running else { return }; workloadResult = nil; result = item.report; report = item.url }
    func inspectWorkload(_ url: URL) {
        guard !running, let data = try? Data(contentsOf: url), let parsed = try? JSONDecoder().decode(WorkloadReport.self, from: data) else { return }
        result = nil; workloadResult = parsed; report = url
        workloadCommentary = (try? String(contentsOf: url.deletingPathExtension().appendingPathExtension("md"), encoding: .utf8)) ?? ""
    }
    func localEvidence(_ checksum: String) -> String? {
        guard let entry = history.first(where: { $0.report.specVersion == "local-ai-text-v1" && $0.report.hardware.chip == device.chip && $0.report.hardware.memoryBytes == device.memory && $0.report.runtime.binarySha256 == runtimeHash && $0.report.models.contains { $0.modelSha256 == checksum } }),
              let model = entry.report.models.first(where: { $0.modelSha256 == checksum }) else { return nil }
        return String(format: "%.1f tok/s · 512 input", median(model.samples.filter { $0.inputTokens == 512 }.map(\.decodeTps)))
    }
    func readRuntimeHash() async {
        let url = URL(fileURLWithPath: server)
        runtimeHash = try? await Task.detached { try fileSHA256(url) }.value
    }
    func run() {
        guard !running, validSelection else { return }
        if !usesWorkloads || !uploads.enabled { startRun(challenge: nil); return }
        running=true; stopping=false; phase="Preparing upload protection"; message="Requesting a one-time test challenge…"
        let config: [String:Any] = ["workload": workload, "engine": backend,
            "model": externalRuntime ? servedModel.trimmingCharacters(in:.whitespaces) : backend == "oMLX" ? "benchmark-model" : models[0].lastPathComponent,
            "concurrencyLevels": workloadLevels, "repeats": repeats]
        Task { @MainActor in
            let ticket=await uploads.prepareChallenge(config)
            running=false
            if stopping { if let ticket { try? FileManager.default.removeItem(at:ticket) }; stopping=false; phase="Stopped"; return }
            startRun(challenge: ticket)
        }
    }
    private func startRun(challenge: URL?) {
        guard !running, validSelection else { return }
        let scriptName = usesWorkloads ? "workload_runner" : usesJobs ? "jobs_runner" : "runner"
        guard let script = Bundle.main.url(forResource: scriptName, withExtension: "py") ?? Bundle.module.url(forResource: scriptName, withExtension: "py") else { message = "找不到測試程式，請重新安裝 app。"; return }
        guard FileManager.default.isExecutableFile(atPath: python), (externalRuntime || FileManager.default.isExecutableFile(atPath: backend == "oMLX" ? omlx : server)) else { phase = "需要設定"; message = "未找到 Python 或 llama-server。請在設定選擇可執行檔。"; return }
        do {
            try FileManager.default.createDirectory(at: reportsFolder, withIntermediateDirectories: true)
            let destination = reportsFolder.appendingPathComponent("benchmark-\(UUID().uuidString).json")
            let process = Process(); process.executableURL = URL(fileURLWithPath: python)
            if usesWorkloads {
                process.arguments = ["-B", "-u", script.path, "--engine", backend, "--model", externalRuntime ? servedModel.trimmingCharacters(in: .whitespaces) : backend == "oMLX" ? mlxModel!.path : models[0].path, "--jobs", String(concurrentJobs), "--workload", workload, "--repeats", String(repeats), "--output", destination.path]
                process.arguments! += externalRuntime ? ["--endpoint", endpoint] : ["--server", backend == "oMLX" ? omlx : server]
                if sweep { process.arguments!.append("--sweep") }
            } else if usesJobs {
                process.arguments = ["-B", "-u", script.path, "--engine", backend, "--server", backend == "oMLX" ? omlx : server, "--model", backend == "oMLX" ? mlxModel!.path : models[0].path, "--jobs", String(concurrentJobs), "--output", destination.path]
            } else { process.arguments = ["-B", "-u", script.path] + (trial ? ["--trial"] : []) + ["--server", server, "--output", destination.path, "--models"] + models.map(\.path) }
            if let challenge, usesWorkloads { process.arguments! += ["--challenge", challenge.path] }
            // Keys travel over stdin, never argv, report JSON or runtime logs.
            let input = Pipe(); process.standardInput = input

            let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
            runToken = UUID(); let token = runToken
            running = true; stopping = false; result = nil; workloadResult = nil; workloadCommentary = ""; report = nil; latest = nil; completedSamples = 0
            runConsent = uploads.enabled; runPublication = uploads.publish
            totalSamples = expectedSamples; currentModel = 0; events = []; started = Date()
            phase = "檢查環境"; message = "檢查 runtime 及硬件，首次啟動可能需要編譯 Metal shaders。"
            task = process
            do { try process.run(); if usesJobs && concurrentJobs > 3, let key = pro.keyForRun { input.fileHandleForWriting.write(Data((key + "\n").utf8)) }; try? input.fileHandleForWriting.close() } catch { running = false; task = nil; throw error }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                var pending = Data(); var diagnostic = ""
                while true {
                    let chunk = pipe.fileHandleForReading.availableData
                    if chunk.isEmpty { break }; pending.append(chunk)
                    while let newline = pending.firstIndex(of: 10) {
                        let line = Data(pending.prefix(upTo: newline)); pending.removeSubrange(...newline)
                        if let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] {
                            DispatchQueue.main.async { self?.receive(event, destination: destination, token: token) }
                        } else { diagnostic = String((diagnostic + String(decoding: line, as: UTF8.self) + "\n").suffix(4000)) }
                    }
                    if pending.count > 1_000_000 { diagnostic = "Runtime 輸出過長。"; pending.removeAll(keepingCapacity: false) }
                }
                process.waitUntilExit()
                if let challenge { try? FileManager.default.removeItem(at:challenge) }
                let detail = String((diagnostic + String(decoding: pending, as: UTF8.self)).suffix(4000)).trimmingCharacters(in: .whitespacesAndNewlines)
                DispatchQueue.main.async {
                    guard let self, self.runToken == token else { return }
                    self.running = false; self.task = nil
                    if self.stopping || process.terminationStatus == 130 {
                        self.phase = "已停止"; self.message = "模型程序已結束。未完成的測試不會當成完整結果。"
                    } else if process.terminationStatus != 0 || self.report == nil {
                        self.phase = "測試失敗"; if !detail.isEmpty { self.message = detail }
                    }
                    self.stopping = false; self.reloadHistory()
                }
            }
        } catch { phase = "無法啟動"; message = error.localizedDescription }
    }
    private func receive(_ event: [String: Any], destination: URL, token: UUID) {
        guard token == runToken else { return }
        if let index = event["modelIndex"] as? Int { currentModel = index }
        if let text = event["message"] as? String {
            events.append(text); if events.count > 100 { events.removeFirst() }
            if !stopping { message = text }
        }
        if let key = event["phase"] as? String, !stopping {
            phase = ["inspect": "檢查環境", "hash": "驗證模型", "load": "載入模型", "tokenize": "準備工作負載", "warmup": "暖機中", "measure": "量度中", "cleanup": "關閉模型"] [key] ?? phase
        }
        switch event["event"] as? String {
        case "workload-sample": completedSamples += 1
        case "sample":
            if let row = event["sample"], let data = try? JSONSerialization.data(withJSONObject: row), let sample = try? JSONDecoder().decode(Sample.self, from: data) {
                latest = sample; completedSamples += 1
            }
        case "license": if event["valid"] as? Bool == false { pro.invalidate() }
        case "error": phase = "測試失敗"
        case "complete":
            if let data = try? Data(contentsOf: destination), let parsed = try? JSONDecoder().decode(WorkloadReport.self, from: data), parsed.specVersion == "tokfire-workloads-v1" {
                workloadResult = parsed; report = destination; completedSamples = totalSamples; phase = "測試完成"
                workloadCommentary = (try? String(contentsOf: destination.deletingPathExtension().appendingPathExtension("md"), encoding: .utf8)) ?? ""
                uploads.enqueue(destination, consent: runConsent, publication: runPublication); reloadHistory(); return
            }
            if let data = try? Data(contentsOf: destination), let parsed = try? JSONDecoder().decode(RunReport.self, from: data) {
                report = destination; result = parsed; completedSamples = totalSamples; phase = "測試完成"
                message = parsed.isTrial ? "快速試跑完成，結果已儲存在本機。" : "完整測試完成，結果已儲存在本機。"
                try? commentary(parsed).write(to: destination.deletingPathExtension().appendingPathExtension("md"), atomically: true, encoding: .utf8)
                uploads.enqueue(destination, consent: runConsent, publication: runPublication)
                reloadHistory()
            }
        default: break
        }
    }
    func cancel() {
        if running && task == nil { stopping=true; phase="Stopping…"; return }
        guard let task, task.isRunning, !stopping else { return }
        stopping = true; phase = "正在停止"; message = "等待模型程序關閉…"; task.terminate()
    }
    func commentary(_ report: RunReport) -> String {
        var lines = ["# " + L("assessment"), report.hardware.chip + " · " + String(Int(report.hardware.memoryBytes / pow(1024,3))) + " GiB", report.measuredAt, report.specVersion, "", L("target"), L("targetHelp"), ""]
        for model in report.models {
            lines.append("## " + (model.modelName ?? String(model.modelSha256.prefix(12))))
            for group in report.isConcurrent ? Array(Set(model.samples.compactMap(\.concurrency))).sorted() : Array(Set(model.samples.map(\.inputTokens))).sorted() {
                let rows = model.samples.filter { report.isConcurrent ? $0.concurrency == group : $0.inputTokens == group }
                let speed = median(rows.map(\.decodeTps)); let wait = median(rows.map(\.ttftMs))
                let slowest = rows.map(\.decodeTps).min() ?? speed; let longest = rows.map(\.ttftMs).max() ?? wait
                lines += ["### " + (report.isConcurrent ? L("concurrent") + ": " + String(group) : String(group) + " input"), String(format: "%@: %.1f tok/s · %@: %.0f ms", L("perUser"), speed, L("ttft"), wait), assessment(report.isConcurrent ? slowest : speed, report.isConcurrent ? longest : wait), L(slowest >= 100 ? "targetMet" : "targetMiss")]
                if report.isConcurrent {
                    for job in Array(Set(rows.compactMap { $0.jobId ?? $0.user })).sorted() {
                        let samples = rows.filter { ($0.jobId ?? $0.user) == job }
                        lines.append(String(format: "Job %d: %.1f tok/s · %@ %.0f ms", job, median(samples.map(\.decodeTps)), L("ttft"), median(samples.map(\.ttftMs))))
                    }
                    lines.append(String(format: "%@: %.1f tok/s · max %@: %.0f ms", L("worstUser"),slowest,L("ttft"),longest))
                    lines.append(String(format: "%@: %.1f tok/s",L("endToEnd"),median(rows.compactMap(\.endToEndTps))))
                    if let groups = report.groups { lines.append(String(format: "Σ: %.1f tok/s", median(groups.filter { $0.concurrency == group }.map(\.aggregateTps)))) }
                }
                lines.append("")
            }
            if !report.isConcurrent { lines.append(L("notTested")) }
        }
        lines += ["", L("referenceHelp"), "https://omlx.ai/benchmarks/performance", "https://omlx.ai/benchmarks/intelligence"]
        return lines.joined(separator: "\n") + "\n"
    }
    func exportCommentary() {
        guard result != nil || workloadResult != nil else { return }
        let text = result.map { commentary($0) } ?? workloadCommentary
        let panel=NSSavePanel(); panel.nameFieldStringValue="local-ai-assessment.md"
        if panel.runModal() == .OK, let url=panel.url { do { try text.write(to:url,atomically:true,encoding:.utf8) } catch { message=error.localizedDescription } }
    }
    func export() {
        guard let report else { return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = "local-ai-benchmark.json"; panel.allowedContentTypes = [.json]
        if panel.runModal() == .OK, let destination = panel.url {
            do { try Data(contentsOf: report).write(to: destination, options: .atomic); message = "報告已匯出。" }
            catch { message = error.localizedDescription }
        }
    }
}
