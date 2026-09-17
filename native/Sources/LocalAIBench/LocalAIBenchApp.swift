import SwiftUI
import AppKit

@main struct LocalAIBenchApp: App {
    @StateObject private var bench = BenchController()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene {
        WindowGroup("TokFire Bench") {
            WorkspaceView(bench: bench)
                .frame(minWidth: 1080, minHeight: 760)
                .onAppear { delegate.bench = bench; NSApp.activate(ignoringOtherApps: true) }
        }.defaultSize(width: 1180, height: 840)
    }
}
final class AppDelegate: NSObject, NSApplicationDelegate {
    var bench: BenchController?
    private var waitingToQuit = false
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let bench, bench.running else { return .terminateNow }
        guard !waitingToQuit else { return .terminateCancel }
        waitingToQuit = true
        bench.cancel()
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            Task { @MainActor in if !bench.running { timer.invalidate(); sender.terminate(nil) } }
        }
        // Leave AppKit's nested termination loop so SwiftUI/main-queue cleanup
        // can finish; retry quitting once the runner has reaped its server.
        return .terminateCancel
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
enum Page: String, CaseIterable {
    case discover, benchmark, history, settings
    var icon: String { switch self { case .discover: return "square.grid.2x2"; case .benchmark: return "waveform.path.ecg"; case .history: return "clock.arrow.circlepath"; case .settings: return "slider.horizontal.3" } }
}
let ink = Color(red: 0.12, green: 0.10, blue: 0.10)
let muted = Color(red: 0.40, green: 0.46, blue: 0.50)
let accent = Color(red: 0.72, green: 0.23, blue: 0.06)
let canvas = Color(red: 0.95, green: 0.965, blue: 0.96)
struct Panel<Content: View>: View {
    var title: String? = nil
    @ViewBuilder var content: Content
    var body: some View { VStack(alignment: .leading, spacing: 16) { if let title { Text(title).font(.headline) }; content }.padding(22).frame(maxWidth: .infinity, alignment: .leading).background(.white, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(ink.opacity(0.07))) }
}
struct Tag: View { let text: String; var color: Color = accent
    var body: some View { Text(text).font(.system(size: 11, weight: .semibold)).padding(.horizontal, 9).padding(.vertical, 5).background(color.opacity(0.09), in: Capsule()).foregroundColor(color) }
}
struct Metric: View { let title: String; let value: String; let unit: String
    var body: some View { VStack(alignment: .leading, spacing: 7) { Text(title).font(.caption).foregroundColor(muted); HStack(alignment: .firstTextBaseline, spacing: 5) { Text(value).font(.system(size: 27, weight: .semibold, design: .rounded)).monospacedDigit(); Text(unit).font(.caption).foregroundColor(muted) } }.frame(maxWidth: .infinity, alignment: .leading) }
}
@MainActor func assessment(_ speed: Double, _ ttft: Double) -> String {
    L(speed >= 30 && ttft <= 1000 ? "fast" : speed >= 15 && ttft <= 3000 ? "comfortableUse" : "slow")
}
struct WorkspaceView: View {
    @ObservedObject var bench: BenchController
    @ObservedObject private var lang = LanguageStore.shared
    @StateObject private var catalog = CatalogStore(device: .detect())
    @State private var page = Page.discover
    @State private var showModel = false
    @State private var initialized = false
    private let timer = Timer.publish(every: 4, on: .main, in: .common).autoconnect()
    var body: some View {
        HStack(spacing: 0) {
            sidebar
            ScrollViewReader { proxy in
                ScrollView { VStack(alignment: .leading, spacing: 24) {
                    HStack { Text("TOKFIRE BENCH / TOKFIRE LABS").font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1.5).foregroundColor(accent); Spacer(); Tag(text: "v0.9.0 · Apple Silicon") }
                    VStack(alignment: .leading, spacing: 9) { Text(L(page == .discover ? "headline" : page.rawValue)).font(.system(size: 30, weight: .bold)); Text(L("subhead")).foregroundColor(muted) }
                    switch page { case .discover: discovery; case .benchmark: benchmark; case .history: history; case .settings: settings }
                    Label(L("privacy"), systemImage: "lock.shield").font(.caption).foregroundColor(muted)
                }.padding(30).frame(maxWidth: 1120) }.background(canvas)
                .onChange(of: bench.running) { running in if running && page == .benchmark { DispatchQueue.main.asyncAfter(deadline: .now()+0.2) { withAnimation { proxy.scrollTo("live-progress", anchor: .top) } } } }
                .onChange(of: bench.workloadResult?.id) { id in if id != nil && page == .benchmark { DispatchQueue.main.asyncAfter(deadline: .now()+0.2) { withAnimation { proxy.scrollTo("results", anchor: .top) } } } }
                .onChange(of: bench.result?.id) { id in if id != nil && page == .benchmark { DispatchQueue.main.asyncAfter(deadline: .now()+0.2) { withAnimation { proxy.scrollTo("results", anchor: .top) } } } }
            }
        }.foregroundColor(ink).tint(accent).preferredColorScheme(.light)
        .environment(\.locale, Locale(identifier: lang.code)).environment(\.layoutDirection, lang.rtl ? .rightToLeft : .leftToRight)
        .sheet(isPresented: $showModel) { modelDetail }
        .onReceive(timer) { _ in if !bench.running { bench.reloadHistory() } }
        .onChange(of: bench.phase) { value in
            captureLater(name: value == "測試完成" ? "complete" : value == "量度中" ? "running" : "state")
            if value == "量度中" && CommandLine.arguments.contains("--stop-on-measurement") { bench.cancel() }
            if value == "量度中" && CommandLine.arguments.contains("--quit-on-measurement") { NSApp.terminate(nil) }
        }
        .onChange(of: bench.completedSamples) { _ in captureLater(name: "progress") }
        .onChange(of: catalog.loading) { loading in if !loading { captureLater(name: "catalog"); if CommandLine.arguments.contains("--preview-model"), let model = catalog.models.first { catalog.select(model); showModel = true } } }
        .onChange(of: page) { _ in captureLater(name: "page") }
        .task {
            guard !initialized else { return }; initialized = true
            if let i = CommandLine.arguments.firstIndex(of: "--language"), CommandLine.arguments.indices.contains(i+1) { lang.code = CommandLine.arguments[i+1] }
            if CommandLine.arguments.contains("--offline") || !catalog.online { catalog.setOnline(false) } else { catalog.refresh() }
            if let i = CommandLine.arguments.firstIndex(of: "--workload"), CommandLine.arguments.indices.contains(i+1) { bench.workload = CommandLine.arguments[i+1] }
            bench.sweep = CommandLine.arguments.contains("--sweep")
            if CommandLine.arguments.contains("--legacy-jobs") { bench.workloadMode = false }
            if let i = CommandLine.arguments.firstIndex(of: "--jobs"), CommandLine.arguments.indices.contains(i+1), let count = Int(CommandLine.arguments[i+1]) { bench.concurrentJobs = count }
            if let i = CommandLine.arguments.firstIndex(of: "--run-model"), CommandLine.arguments.indices.contains(i+1) { bench.add([URL(fileURLWithPath: CommandLine.arguments[i+1])]); bench.backend = "llama.cpp"; bench.trial = CommandLine.arguments.contains("--quick-trial"); bench.concurrentMode = !bench.trial && !CommandLine.arguments.contains("--standard-test"); page = .benchmark; bench.run() }
            if let i = CommandLine.arguments.firstIndex(of: "--run-mlx"), CommandLine.arguments.indices.contains(i+1) { bench.mlxModel = URL(fileURLWithPath: CommandLine.arguments[i+1]); bench.backend = "oMLX"; page = .benchmark; bench.run() }
            if CommandLine.arguments.contains("--show-settings") { page = .settings }
            if CommandLine.arguments.contains("--show-benchmark") { page = .benchmark }
            captureLater(name: "initial"); await bench.pro.restore(); await bench.readRuntimeHash()
        }
    }
    private var phase: String { L(["準備就緒":"ready","檢查環境":"inspecting","驗證模型":"hashing","載入模型":"loading","準備工作負載":"inspecting","暖機中":"warmup","量度中":"measuring","關閉模型":"stopping","已停止":"stopped","正在停止":"stopping","測試失敗":"failed","測試完成":"complete","需要設定":"settings","無法啟動":"failed"][bench.phase] ?? "ready") }
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 28) {
            Label("TokFire", systemImage: "flame.fill").font(.title2.bold()).padding(.top, 20)
            Text("TokFire Bench").font(.caption).foregroundColor(.white.opacity(0.7))
            ForEach(Page.allCases, id: \.self) { item in Button { page = item } label: { HStack { Image(systemName: item.icon).frame(width: 20); Text(L(item.rawValue)); Spacer() }.padding(13).background(page == item ? .white.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 12)) }.buttonStyle(.plain).foregroundColor(page == item ? .white : .white.opacity(0.6)) }
            Spacer()
            if bench.running { Text(phase); ProgressView(value: bench.progress).tint(.orange); Text("\(bench.completedSamples) / \(bench.totalSamples)").font(.caption) }
            Text("TokFire Labs · tokfires.com").font(.system(size: 10)).foregroundColor(.white.opacity(0.6))
            Text(catalog.device.chip).font(.headline)
            Text("\(Int(catalog.device.memoryGiB)) GiB · \(catalog.device.cores) CPU").font(.caption).opacity(0.6)
            Toggle(L("online"), isOn: Binding(get: { catalog.online }, set: { catalog.setOnline($0) })).toggleStyle(.switch).font(.caption).tint(.orange)
        }.padding(20).frame(width: 220).frame(maxHeight: .infinity).foregroundColor(.white).background(ink)
    }
    private var deviceHero: some View {
        HStack(spacing: 25) { Image(systemName: "cpu").font(.system(size: 40)).foregroundColor(.orange); VStack(alignment: .leading, spacing: 8) { Text(L("device")).font(.caption).opacity(0.6); Text(catalog.device.chip).font(.title2.bold()); Text("\(L("cores")): \(catalog.device.cores) · \(L("memory")): \(Int(catalog.device.memoryGiB)) GiB") }; Spacer(); Text(L("smallModels")).font(.callout).frame(maxWidth: 230) }.padding(25).foregroundColor(.white).background(LinearGradient(colors: [ink, Color(red: 0.36, green: 0.16, blue: 0.10)], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 19))
    }
    private var discovery: some View {
        VStack(alignment: .leading, spacing: 20) {
            deviceHero
            HStack { Text(L("trending")).font(.title3.bold()); Spacer(); TextField(L("search"), text: $catalog.query).textFieldStyle(.roundedBorder).frame(width: 220).onSubmit { catalog.refresh() }; Button(L("refresh")) { catalog.refresh() }.disabled(!catalog.online || catalog.loading) }
            if catalog.loading { ProgressView(L("loadingCatalog")) }
            if !catalog.online { Text(L("offlineHelp")).foregroundColor(muted) }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 15) {
                ForEach(catalog.models) { model in Panel {
                    HStack { Tag(text: model.billions.map { String(format: "%.1fB", $0) } ?? "?"); Spacer(); Text(model.author).font(.caption).foregroundColor(muted) }
                    Text(model.name).font(.headline).lineLimit(2).frame(height: 42, alignment: .topLeading)
                    HStack { Label("\(model.downloads ?? 0)", systemImage: "arrow.down"); Label("\(model.likes ?? 0)", systemImage: "heart"); Spacer(); Button(L("details")) { catalog.select(model); showModel = true }.disabled(catalog.downloading) }.font(.caption)
                } }
            }
            HStack { Button(L("hf")) { open("https://huggingface.co/models?library=gguf&sort=trending") }; Button(L("importGGUF")) { bench.chooseModels(); page = .benchmark }.disabled(bench.running) }
            Panel(title: L("recommendation")) { Text(L("capacityHelp")).font(.callout).foregroundColor(muted); Button(L("community")) { Task { await catalog.fetchCommunity() } }.disabled(!catalog.online); DisclosureGroup(L("notes")) { Text(catalog.status + "\n" + catalog.communityStatus).font(.caption).textSelection(.enabled) } }
            Panel(title: L("reference")) { Text(L("referenceHelp")).font(.callout).foregroundColor(muted); Button(L("openWebsite")) { open(siteOrigin + "/references") } }
        }
    }
    private var modelDetail: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack { Text(catalog.selected?.name ?? L("model")).font(.title2.bold()); Spacer(); Button(L("done")) { showModel = false } }
            if let model = catalog.selected { HStack { Text(L("license") + ": " + model.license); Spacer(); Button("Hugging Face ↗") { NSWorkspace.shared.open(model.webURL) } }.font(.caption) }
            if catalog.loadingFiles { ProgressView() }
            ScrollView { VStack(spacing: 12) { ForEach(catalog.files) { file in
                let fit = catalog.device.fit(bytes: Double(file.size))
                Panel { Text(file.path).font(.system(.callout, design: .monospaced)); HStack { Tag(text: file.displaySize); Tag(text: L(fit == .comfortable ? "comfortable" : fit == .tight ? "tight" : "tooLarge"), color: fit == .comfortable ? accent : .orange) }; if let hash = file.checksum, let evidence = bench.localEvidence(hash) { Label(L("localEvidence") + ": " + evidence, systemImage: "checkmark.seal").font(.caption) }; Button(L("download")) { catalog.download(file) { url in bench.add([url]); page = .benchmark } }.disabled(catalog.downloading || bench.running || bench.models.count >= 3 || fit == .tooLarge) }
            } } }
            if catalog.downloading { ProgressView(value: catalog.downloadProgress); HStack { Text("\(Int(catalog.downloadProgress*100))%"); Spacer(); Button(L("cancel")) { catalog.cancelDownload() } } }
            DisclosureGroup(L("notes")) { Text(catalog.fileStatus + "\n" + catalog.downloadMessage).font(.caption).textSelection(.enabled) }
        }.padding(28).frame(width: 720, height: 660).background(canvas)
    }
    private var benchmark: some View {
        VStack(spacing: 20) {
            Panel(title: "01 / " + L("selectModel")) {
                Picker(L("runtime"), selection: $bench.backend) { Text("llama.cpp + GGUF").tag("llama.cpp"); Text("oMLX + MLX").tag("oMLX"); Text("Ollama").tag("Ollama"); Text("vLLM").tag("vLLM") }.pickerStyle(.segmented).disabled(bench.running)
                if bench.externalRuntime {
                    TextField(L("localEndpoint"), text: $bench.endpoint).textFieldStyle(.roundedBorder).disabled(bench.running)
                    TextField(L("servedModel"), text: $bench.servedModel).textFieldStyle(.roundedBorder).disabled(bench.running)
                    Text(L("endpointHelp")).font(.caption)
                    JobControls(bench: bench, pro: bench.pro)
                } else if bench.backend == "oMLX" {
                    HStack { Image(systemName: "folder"); Text(bench.mlxModel?.lastPathComponent ?? L("noModels")).lineLimit(2); Spacer(); Button(L("selectMLX")) { bench.chooseMLX() }.disabled(bench.running) }
                    Button("Hugging Face · MLX ↗") { open("https://huggingface.co/models?library=mlx&sort=trending") }
                    JobControls(bench: bench, pro: bench.pro)
                } else {
                    ForEach(bench.models, id: \.path) { url in HStack { Text(url.lastPathComponent).lineLimit(1); Spacer(); Button(L("remove")) { bench.models.removeAll { $0 == url } }.disabled(bench.running) } }
                    HStack { Button(L(bench.usesJobs ? "selectModel" : "addModel")) { bench.chooseModels() }; Menu(L("queue")) { ForEach(bench.library, id: \.path) { url in Button(url.lastPathComponent) { if bench.usesJobs { bench.models = [url] } else { bench.add([url]) } } } }; Spacer(); Toggle(L("trial"), isOn: $bench.trial).toggleStyle(.switch).disabled(bench.concurrentMode) }.disabled(bench.running)
                    Toggle(L("concurrentMode"), isOn: $bench.concurrentMode).disabled(bench.running)
                    if bench.concurrentMode { JobControls(bench: bench, pro: bench.pro); if bench.models.count != 1 { Text(L("oneModelJobs")).font(.caption).foregroundColor(.orange) } }
                    else { Text(bench.trial ? "512 input / 32 output · 1 ×" : "512 + 2048 input / 128 output · 3 ×").font(.caption).foregroundColor(muted) }
                }
                if bench.usesJobs {
                    Toggle(L("workloadMode"), isOn: $bench.workloadMode).disabled(bench.running || bench.externalRuntime)
                    if bench.usesWorkloads {
                        Picker(L("workload"), selection: $bench.workload) { ForEach(["short-chat", "business", "long-summary", "agent-tools", "agent-data", "agent-research", "agent-recovery"], id: \.self) { Text(L($0)).tag($0) } }.disabled(bench.running)
                        Stepper("\(L("repeats")): \(bench.repeats)", value: $bench.repeats, in: 3...5).disabled(bench.running)
                        Toggle(L("sweep"), isOn: $bench.sweep).disabled(bench.running)
                        Text(L("workloadHelp")).font(.caption).foregroundColor(muted)
                        AdvancedControls(bench: bench, pro: bench.pro).disabled(bench.running)
                    }
                }
                Divider(); if bench.advancedActive { Text(L("advancedLocalOnly")).font(.caption).foregroundColor(.orange) } else { UploadPanel(store: bench.uploads) }
                HStack { Spacer(); if bench.running { Button(L("stop")) { bench.cancel() }.disabled(bench.stopping) } else { Button { bench.run() } label: { Label(L("start"), systemImage: "play.fill").padding(.vertical, 5) }.buttonStyle(.borderedProminent).disabled(!bench.validSelection || catalog.downloading) } }
            }
            Panel(title: "02 / " + L("progress")) {
                HStack { Text(phase).font(.title2.bold()); if bench.running { ProgressView().controlSize(.small) }; Spacer(); if let start = bench.started, bench.running { TimelineView(.periodic(from: .now, by: 1)) { _ in Text("\(Int(Date().timeIntervalSince(start))) s").monospacedDigit() } } }
                Text(bench.message).font(.callout).textSelection(.enabled)
                ProgressView(value: bench.progress); Text("\(bench.completedSamples) / \(bench.totalSamples) · " + L("completed")).font(.caption).foregroundColor(muted)
                if ["測試失敗", "無法啟動", "需要設定"].contains(bench.phase) { Text(bench.message).font(.callout).foregroundColor(.red).textSelection(.enabled) }
                if let job = bench.latest?.jobId { Tag(text: "Job \(job)") }
                if let sample = bench.latest { HStack { Metric(title: L("speed"), value: String(format: "%.1f", sample.decodeTps), unit: "tok/s"); Metric(title: L("ttft"), value: String(format: "%.0f", sample.ttftMs), unit: "ms"); if let n = sample.concurrency { Metric(title: L("concurrent"), value: "\(n)", unit: "") } } }
                DisclosureGroup(L("events")) { Text(bench.events.isEmpty ? bench.message : bench.events.suffix(30).joined(separator: "\n")).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
            }.id("live-progress")
            if let report = bench.result { results(report).id("results") }; if let report = bench.workloadResult { WorkloadResults(bench: bench, report: report).id("results") }
        }
    }
    private func results(_ report: RunReport) -> some View {
        Panel(title: "03 / " + L("results")) {
            HStack { Tag(text: report.isConcurrent ? (report.runtime.name ?? "") + " · " + L("concurrent") : L(report.isTrial ? "trial" : "fullTest")); Spacer(); Button(L("assessment") + " ↓") { bench.exportCommentary() }; Button(L("export")) { bench.export() } }
            ForEach(Array(report.models.enumerated()), id: \.offset) { index, model in
                Text(model.modelName ?? "\(L("model")) \(index+1) · \(model.modelSha256.prefix(12))").font(.headline)
                ForEach(report.isConcurrent ? Array(Set(model.samples.compactMap(\.concurrency))).sorted() : Array(Set(model.samples.map(\.inputTokens))).sorted(), id: \.self) { group in
                    let rows = model.samples.filter { report.isConcurrent ? $0.concurrency == group : $0.inputTokens == group }
                    let speed = median(rows.map(\.decodeTps)); let wait = median(rows.map(\.ttftMs))
                    VStack(alignment: .leading, spacing: 12) {
                        Tag(text: report.isConcurrent ? "\(L("concurrent")): \(group)" : "\(group) input", color: ink)
                        HStack { Metric(title: L("perUser") + " · tok/s", value: String(format: "%.1f", speed), unit: ""); Metric(title: L("ttft"), value: String(format: "%.0f", wait), unit: "ms"); Metric(title: L("prefill"), value: String(format: "%.0f", median(rows.map(\.prefillTps))), unit: "tok/s") }
                        Text(assessment(report.isConcurrent ? rows.map(\.decodeTps).min() ?? speed : speed, report.isConcurrent ? rows.map(\.ttftMs).max() ?? wait : wait)).font(.headline).foregroundColor(accent)
                        if report.isConcurrent {
                            ForEach(Array(Set(rows.compactMap { $0.jobId ?? $0.user })).sorted(), id: \.self) { job in
                                let samples = rows.filter { ($0.jobId ?? $0.user) == job }
                                HStack { Text("Job \(job)").fontWeight(.semibold); Spacer(); Text(String(format: "%.1f tok/s · %@ %.0f ms", median(samples.map(\.decodeTps)), L("ttft"), median(samples.map(\.ttftMs)))) }.font(.caption).monospacedDigit()
                            }
                            let worst = rows.map(\.decodeTps).min() ?? 0
                            Text("\(L("worstUser")): \(String(format: "%.1f", worst)) tok/s · \(L("endToEnd")): \(String(format: "%.1f", median(rows.compactMap(\.endToEndTps)))) tok/s").font(.caption)
                            if let groups = report.groups { Text("Σ \(String(format: "%.1f", median(groups.filter { $0.concurrency == group }.map(\.aggregateTps)))) tok/s · max \(L("ttft")): \(String(format: "%.0f", rows.map(\.ttftMs).max() ?? wait)) ms").font(.caption) }
                            Text(L(worst >= 100 ? "targetMet" : "targetMiss")).font(.callout).foregroundColor(worst >= 100 ? accent : .orange)
                        } else { Text(L(speed >= 100 ? "targetMet" : "targetMiss")).font(.callout).foregroundColor(.orange) }
                    }.padding(18).background(canvas, in: RoundedRectangle(cornerRadius: 13))
                }
                if !report.isConcurrent { Text(L("notTested")).font(.caption).foregroundColor(muted) }
                Text("\(L("loadTime")): \(String(format: "%.2f", model.loadMs/1000)) s").font(.caption).foregroundColor(muted)
            }
            Divider(); Text(L("target")).font(.headline); Text(L("targetHelp")).font(.caption).foregroundColor(muted)
            UploadStatus(store: bench.uploads)
        }
    }
    private var history: some View {
        VStack(spacing: 18) {
            ForEach(bench.workloadHistory, id: \.path) { url in Panel { HStack { Text(L("workload") + " · " + url.deletingPathExtension().lastPathComponent).lineLimit(1); Spacer(); Button(L("view")) { bench.inspectWorkload(url); page = .benchmark }.disabled(bench.running) } } }
            HStack { Text("\(bench.history.count + bench.workloadHistory.count)"); Spacer(); Button(L("reportFolder")) { try? FileManager.default.createDirectory(at: reportsFolder, withIntermediateDirectories: true); NSWorkspace.shared.open(reportsFolder) } }; if bench.history.isEmpty && bench.workloadHistory.isEmpty { Text(L("noReports")) }; ForEach(bench.history) { item in Panel { HStack { VStack(alignment: .leading, spacing: 6) { Text(item.report.hardware.chip).font(.headline); Text(item.report.measuredAt).font(.caption).foregroundColor(muted) }; Spacer(); Tag(text: item.report.isOMLX ? "oMLX" : L(item.report.isTrial ? "trial" : "fullTest")); Button(L("view")) { bench.inspect(item); page = .benchmark }.disabled(bench.running) } } } }
    }
    private var settings: some View {
        VStack(spacing: 20) {
            Panel { ProPanel(store: bench.pro) }.disabled(bench.running)
            Panel(title: L("language")) { Picker(L("language"), selection: $lang.code) { ForEach(LanguageStore.names, id: \.0) { code, name in Text(name).tag(code) } }.labelsHidden() }
            deviceHero
            Panel(title: L("runtime")) {
                TextField(L("python"), text: $bench.python).textFieldStyle(.roundedBorder)
                TextField("llama-server", text: $bench.server).textFieldStyle(.roundedBorder)
                TextField("oMLX", text: $bench.omlx).textFieldStyle(.roundedBorder)
                Text("brew install python llama.cpp").font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                Button("oMLX ↗") { open("https://omlx.ai/") }; Text(catalog.device.os).font(.caption).foregroundColor(muted)
            }.disabled(bench.running)
            Panel { UploadPanel(store: bench.uploads) }
            Panel(title: L("reference")) { Text(L("referenceHelp")).font(.callout); Button(L("openWebsite")) { open(siteOrigin + "/references") } }
        }
    }
    private func open(_ value: String) { if let url = URL(string: value) { NSWorkspace.shared.open(url) } }
    private func captureLater(name: String) {
        guard let index = CommandLine.arguments.firstIndex(of: "--capture-directory"), CommandLine.arguments.indices.contains(index+1) else { return }
        let directory = URL(fileURLWithPath: CommandLine.arguments[index+1])
        DispatchQueue.main.asyncAfter(deadline: .now()+0.7) {
            guard let view = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil })?.contentView, let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
            view.cacheDisplay(in: view.bounds, to: bitmap); try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try? bitmap.representation(using: .png, properties: [:])?.write(to: directory.appendingPathComponent(name + ".png"))
            let state: [String: Any] = ["phase": bench.phase, "running": bench.running, "completedSamples": bench.completedSamples, "totalSamples": bench.totalSamples, "report": bench.report?.path ?? ""]
            if let data = try? JSONSerialization.data(withJSONObject: state) { try? data.write(to: directory.appendingPathComponent("state.json"), options: .atomic) }
        }
    }
}
struct UploadStatus: View {
    @ObservedObject private var language = LanguageStore.shared
    @ObservedObject var store: UploadStore
    var body: some View { HStack { Label(L(store.status), systemImage: "icloud"); if store.pending > 0 { Text("\(L("pending")): \(store.pending)") } }.font(.caption).foregroundColor(muted) }
}
struct UploadPanel: View {
    @ObservedObject private var language = LanguageStore.shared
    @ObservedObject var store: UploadStore
    var body: some View { VStack(alignment: .leading, spacing: 10) {
        Toggle(L("autoUpload"), isOn: $store.enabled).toggleStyle(.switch).disabled(store.uploadSuppressed)
        if store.enabled { Toggle(L("publicShare"), isOn: $store.publish).font(.caption) }
        Text(L("uploadHelp")).font(.caption).foregroundColor(muted)
        UploadStatus(store: store)
        HStack { Button(L(store.connected ? "accountConnected" : "connectAccount")) { store.connect() }; if store.pending > 0 { Button(L("retry")) { store.connected ? store.retry() : store.connect() }; Button(L("clearQueue")) { store.clearQueue() } } }
    }.sheet(isPresented: $store.showAccount) { VStack { HStack { Text(L("connectAccount")).font(.headline); Spacer(); Button(L("done")) { store.showAccount = false } }.padding(); AccountWebView(store: store) }.frame(width: 850, height: 700) } }
}

struct JobControls: View {
    @ObservedObject var bench: BenchController
    @ObservedObject var pro: ProStore
    @ObservedObject private var lang = LanguageStore.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(L("concurrent")).font(.headline)
                Spacer()
                Picker(L("concurrent"), selection: $bench.concurrentJobs) {
                    ForEach(1...pro.limit, id: \.self) { n in Text("\(n) \(n == 1 ? "job" : "jobs")").tag(n) }
                }.labelsHidden().frame(width: 150)
                Tag(text: pro.active ? "Pro · 20" : "Free · 3")
            }
            Text(L("jobsHelp")).font(.caption).foregroundColor(muted)
            Text(bench.usesWorkloads ? "\(bench.expectedSamples) \(L("measuredJobs"))" : "\(bench.concurrentJobs) jobs × 3 · 128 max output").font(.caption).monospacedDigit()
            if !pro.active { DisclosureGroup(L("proUnlock")) { ProPanel(store: pro).padding(.top, 8) } }
        }.disabled(bench.running)
        .onChange(of: pro.limit) { limit in if bench.concurrentJobs > limit { bench.concurrentJobs = limit } }
    }
}
