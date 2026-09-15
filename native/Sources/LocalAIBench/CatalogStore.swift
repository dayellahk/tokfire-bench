import Foundation
import AppKit

struct CommunityRow: Decodable {
    let modelHash: String; let chip: String; let memoryBytes: Double; let runtimeHash: String
    let inputTokens: Int; let decodeTps: Double; let ttftMs: Double; let contributors: Int; let runs: Int
}
final class DownloadTransfer: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let expected: Int64
    let update: @Sendable (Double) -> Void
    private let lock = NSLock()
    private var continuation: CheckedContinuation<(URL, HTTPURLResponse), Error>?
    private var task: URLSessionDownloadTask?
    private var session: URLSession?
    private var cancelled = false
    init(expected: Int64, update: @escaping @Sendable (Double) -> Void) { self.expected = expected; self.update = update }
    func run(_ request: URLRequest) async throws -> (URL, HTTPURLResponse) {
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                if cancelled { lock.unlock(); continuation.resume(throwing: CancellationError()); return }
                self.continuation = continuation
                let config = URLSessionConfiguration.ephemeral
                config.timeoutIntervalForRequest = 120; config.timeoutIntervalForResource = 24 * 3600
                let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
                let session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
                self.session = session
                let task = session.downloadTask(with: request); self.task = task
                lock.unlock(); task.resume()
            }
        }, onCancel: { self.cancel() })
    }
    func cancel() {
        lock.lock(); cancelled = true; let task = task; lock.unlock(); task?.cancel()
    }
    private func finish(_ result: Result<(URL, HTTPURLResponse), Error>) {
        lock.lock(); let continuation = continuation; self.continuation = nil
        let session = session; self.session = nil; task = nil; lock.unlock()
        continuation?.resume(with: result); session?.finishTasksAndInvalidate()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200 else { throw URLError(.badServerResponse) }
            let retained = FileManager.default.temporaryDirectory.appendingPathComponent("localai-download-" + UUID().uuidString)
            try FileManager.default.moveItem(at: location, to: retained)
            finish(.success((retained, response)))
        } catch { finish(.failure(error)) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { finish(.failure(error)) }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > expected { downloadTask.cancel(); return }
        update(min(1, Double(totalBytesWritten) / Double(max(expected, 1))))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" ? request : nil)
    }
}
@MainActor final class CatalogStore: ObservableObject {
    @Published var online = UserDefaults.standard.object(forKey: "catalogOnline") as? Bool ?? true
    @Published var query = ""
    @Published var models: [HubModel] = []
    @Published var selected: HubModel?
    @Published var files: [HubFile] = []
    @Published var loading = false
    @Published var loadingFiles = false
    @Published var status = "連接 Hugging Face，尋找適合本機的模型。"
    @Published var fileStatus = ""
    @Published var updatedAt: Date?
    @Published var downloading = false
    @Published var downloadProgress: Double = 0
    @Published var downloadMessage = ""
    @Published var communityStatus = "社群實測尚未連接；容量建議由本機估算。"
    @Published var community: [CommunityRow] = []
    let device: DeviceProfile
    private var requestTask: Task<Void, Never>?
    private var fileTask: Task<Void, Never>?
    private var downloadTask: Task<Void, Never>?
    private var generation = UUID()
    private var fileGeneration = UUID()
    private let session: URLSession
    private let modelDirectory: URL
    init(device: DeviceProfile, session injectedSession: URLSession? = nil, modelsDirectory: URL = modelsFolder) {
        self.device = device
        self.modelDirectory = modelsDirectory
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 120
        session = injectedSession ?? URLSession(configuration: config)
    }
    func setOnline(_ value: Bool) {
        online = value
        UserDefaults.standard.set(value, forKey: "catalogOnline")
        requestTask?.cancel(); fileTask?.cancel(); generation = UUID(); fileGeneration = UUID()
        loading = false; loadingFiles = false
        if value { refresh() } else {
            cancelDownload(); models = []; files = []; selected = nil; community = []
            status = "你已選擇離線模式，所以無法提供最新網上推薦。你仍可匯入本機 GGUF；恢復連線後可到 Hugging Face 揀選模型。"
            communityStatus = "離線模式：不連接社群資料庫。"
        }
    }
    func endpoint(path: String, query: [URLQueryItem] = []) -> URL {
        var url = URLComponents(url: URL(string: "https://huggingface.co")!.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        url.queryItems = query.isEmpty ? nil : query
        return url.url!
    }
    private func read<T: Decodable>(_ type: T.Type, url: URL) async throws -> T {
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count < 12_000_000 else {
            throw NSError(domain: "Hub", code: 1, userInfo: [NSLocalizedDescriptionKey: "服務暫時不可用，或模型需要登入授權。請稍後重試／在 Hugging Face 開啟。"])
        }
        return try JSONDecoder().decode(type, from: data)
    }
    func refresh() {
        guard online else { return }
        requestTask?.cancel(); generation = UUID(); let token = generation
        loading = true; status = "正在更新 Hugging Face 熱門候選…"
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        requestTask = Task {
            do {
                var items = [URLQueryItem(name: "filter", value: "gguf"), .init(name: "sort", value: "trendingScore"), .init(name: "direction", value: "-1"), .init(name: "limit", value: "100")]
                for key in ["gguf", "downloads", "likes", "trendingScore", "tags", "sha", "pipeline_tag"] { items.append(.init(name: "expand[]", value: key)) }
                if !search.isEmpty { items.append(.init(name: "search", value: search)) }
                let fetched = try await read([HubModel].self, url: endpoint(path: "api/models", query: items))
                guard !Task.isCancelled, token == generation, online else { return }
                var seen = Set<String>()
                let candidates = fetched.filter { $0.eligible }.filter { seen.insert($0.family).inserted }
                models = candidates.sorted {
                    let a = device.fit(bytes: ($0.billions ?? 999) * 1e9 * 0.65).rank
                    let b = device.fit(bytes: ($1.billions ?? 999) * 1e9 * 0.65).rank
                    if a != b { return a < b }
                    let smallA = ($0.billions ?? 999) <= 8, smallB = ($1.billions ?? 999) <= 8
                    if smallA != smallB { return smallA }
                    return ($0.trendingScore ?? 0) > ($1.trendingScore ?? 0)
                }.prefix(10).map { $0 }
                updatedAt = Date()
                status = models.isEmpty ? "未找到符合容量範圍的文字 GGUF。試試其他模型名稱，或自行匯入本機檔案。" : "從最新 100 個候選篩選：中小型優先、同源模型去重。熱門度不代表品質或實測速度。"
            } catch {
                guard token == generation, !Task.isCancelled else { return }
                models = []
                status = "未能連接 Hugging Face，暫時無法提供最新推薦。可使用已下載的本機 GGUF，連線恢復後再試。\n" + error.localizedDescription
            }
            if token == generation { loading = false }
        }
    }
    func select(_ model: HubModel) {
        guard online, !downloading else { return }
        fileTask?.cancel(); fileGeneration = UUID(); let token = fileGeneration
        selected = model; files = []; loadingFiles = true; fileStatus = "讀取已固定版本的模型檔案…"
        fileTask = Task {
            do {
                guard model.id.range(of: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", options: .regularExpression) != nil,
                      let revision = model.sha, revision.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else {
                    throw NSError(domain: "Hub", code: 2, userInfo: [NSLocalizedDescriptionKey: "未能確認模型版本，請刷新目錄。"])
                }
                var url: URL? = endpoint(path: "api/models/\(model.id)/tree/\(revision)", query: [.init(name: "recursive", value: "true"), .init(name: "limit", value: "1000")])
                var gathered: [HubFile] = []
                var pages = 0
                while let current = url, pages < 5 {
                    let (data, response) = try await session.data(from: current)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count < 12_000_000 else { throw URLError(.badServerResponse) }
                    gathered += try JSONDecoder().decode([HubFile].self, from: data)
                    url = nil
                    if let links = http.value(forHTTPHeaderField: "Link") {
                        for link in links.components(separatedBy: ",") where link.contains("rel=\"next\"") {
                            if let start = link.firstIndex(of: "<"), let end = link.firstIndex(of: ">"), start < end,
                               let next = URL(string: String(link[link.index(after: start)..<end])), next.scheme == "https", next.host == "huggingface.co", next.path.hasPrefix("/api/models/") { url = next }
                        }
                    }
                    pages += 1
                    try Task.checkCancellation()
                }
                guard token == fileGeneration, online else { return }
                files = gathered.filter(\.usable).sorted {
                    if $0.preferred != $1.preferred { return $0.preferred }
                    return $0.size < $1.size
                }
                fileStatus = files.isEmpty ? "沒有可驗證的單檔 GGUF。分拆權重、視覺投影器及需要登入的檔案暫不支援；請在 Hugging Face 查看。" : "Q4_K_M 優先。下載前請查看作者與授權；完成後會驗證 SHA-256。\(url == nil ? "" : "（僅顯示前 5 頁檔案）")"
            } catch {
                guard token == fileGeneration, !Task.isCancelled else { return }
                fileStatus = "無法讀取檔案：" + error.localizedDescription
            }
            if token == fileGeneration { loadingFiles = false }
        }
    }
    func download(_ file: HubFile, add: @escaping (URL) -> Void) {
        guard online, !downloading, let model = selected, let revision = model.sha, let checksum = file.checksum else { return }
        guard device.fit(bytes: Double(file.size)) != .tooLarge else { downloadMessage = "模型超出本機建議容量，請選擇較小檔案。"; return }
        downloading = true; downloadProgress = 0; downloadMessage = "準備 \(file.path)…"
        downloadTask = Task {
            do {
                try FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)
                let destination = modelDirectory.appendingPathComponent(String(checksum.prefix(12)) + "-" + URL(fileURLWithPath: file.path).lastPathComponent)
                if FileManager.default.fileExists(atPath: destination.path) {
                    downloadMessage = "驗證已下載的模型…"
                    let digest = try await Task.detached { try fileSHA256(destination) }.value
                    try Task.checkCancellation()
                    guard digest == checksum else { throw NSError(domain: "Hub", code: 3, userInfo: [NSLocalizedDescriptionKey: "現有檔案校驗失敗；請移走損壞檔案後重試。"] ) }
                    add(destination); downloadMessage = "已驗證並加入測試佇列。"; downloading = false; return
                }
                let free = (try FileManager.default.attributesOfFileSystem(forPath: modelDirectory.path)[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
                guard free > file.size + 2_000_000_000 else { throw NSError(domain: "Hub", code: 4, userInfo: [NSLocalizedDescriptionKey: "可用磁碟空間不足；下載需額外預留 2 GB。"] ) }
                let transfer = DownloadTransfer(expected: file.size) { [weak self] value in
                    Task { @MainActor in self?.downloadProgress = value }
                }
                let url = endpoint(path: "\(model.id)/resolve/\(revision)/\(file.path)")
                var req = URLRequest(url: url); req.timeoutInterval = 120
                downloadMessage = "正在下載 \(file.displaySize)…"
                let (temporary, response) = try await transfer.run(req)
                defer { try? FileManager.default.removeItem(at: temporary) }
                guard response.statusCode == 200,
                      (try FileManager.default.attributesOfItem(atPath: temporary.path)[.size] as? NSNumber)?.int64Value == file.size else { throw URLError(.badServerResponse) }
                downloadMessage = "下載完成，正在驗證 SHA-256…"
                let digest = try await Task.detached { try fileSHA256(temporary) }.value
                try Task.checkCancellation()
                guard digest == checksum else { throw NSError(domain: "Hub", code: 5, userInfo: [NSLocalizedDescriptionKey: "SHA-256 不符；已拒絕此下載。"] ) }
                try FileManager.default.moveItem(at: temporary, to: destination)
                add(destination); downloadMessage = "下載及驗證完成，已加入測試佇列。"
            } catch {
                downloadMessage = Task.isCancelled ? "下載已取消，未完成的檔案不會加入佇列。" : "下載失敗：" + error.localizedDescription
            }
            downloading = false
        }
    }
    func cancelDownload() { downloadTask?.cancel() }
    func fetchCommunity() async {
        guard online else { return }
        communityStatus = "正在讀取已同意公開的社群結果…"
        do {
            struct Reply: Decodable { let results: [CommunityRow] }
            let reply = try await read(Reply.self, url: communityURL)
            guard online else { return }
            community = reply.results.filter { $0.chip == device.chip && $0.memoryBytes == device.memory && $0.inputTokens == 512 && $0.decodeTps.isFinite && $0.decodeTps > 0 && $0.contributors > 0 }
            communityStatus = community.isEmpty ? "未有相同硬件的公開實測；目前只提供容量估算。" : "已取得相同硬件的社群回報；尚未獨立驗證，會按模型及 runtime 雜湊配對。"
        } catch {
            guard online else { return }
            communityStatus = "社群實測暫不可用（網站可能需要登入）。容量估算仍可使用；不會以估算冒充實測。"
        }
    }
}
