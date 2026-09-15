import Foundation
import CryptoKit
import Metal

let supportFolder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/LocalAIBench")
let modelsFolder = supportFolder.appendingPathComponent("Models")
let reportsFolder = supportFolder.appendingPathComponent("Reports")
let communityURL = URL(string: "https://local-ai-benchmark-lab.mossy-fern-2045.chatgpt.site/api/v1/leaderboard")!

struct DeviceProfile {
    var chip: String
    var cores: Int
    var memory: Double
    var gpu: String
    var os: String
    var memoryGiB: Double { memory / pow(1024, 3) }
    static func detect() -> DeviceProfile {
        var size = 0
        sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0)
        var name = [CChar](repeating: 0, count: max(size, 1))
        sysctlbyname("machdep.cpu.brand_string", &name, &size, nil, 0)
        return DeviceProfile(chip: String(cString: name), cores: ProcessInfo.processInfo.processorCount,
            memory: Double(ProcessInfo.processInfo.physicalMemory), gpu: MTLCreateSystemDefaultDevice()?.name ?? "未偵測到 Metal",
            os: ProcessInfo.processInfo.operatingSystemVersionString)
    }
    func fit(bytes: Double) -> FitEstimate {
        // Fixed 4096-context text profile. Reserve room for OS, KV cache and runtime.
        let estimate = bytes * 1.25 + 2 * pow(1024, 3)
        if bytes > memory * 0.65 || estimate > memory * 0.8 { return .tooLarge }
        if estimate > memory * 0.6 { return .tight }
        return .comfortable
    }
}
enum FitEstimate: String {
    case comfortable = "容量估算：較充裕"
    case tight = "容量估算：偏緊"
    case tooLarge = "建議選更小模型"
    var rank: Int { self == .comfortable ? 0 : self == .tight ? 1 : 2 }
}
struct HubModel: Decodable, Identifiable {
    struct GGUF: Decodable { var total: Double?; var architecture: String? }
    let id: String
    var sha: String?
    var downloads: Int?
    var likes: Int?
    var trendingScore: Double?
    var tags: [String]?
    var pipeline_tag: String?
    var gguf: GGUF?
    var name: String { id.components(separatedBy: "/").last ?? id }
    var author: String { id.components(separatedBy: "/").first ?? "" }
    static func number(_ pattern: String, in text: String) -> Double? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range(at: 1), in: text) else { return nil }
        return Double(text[range])
    }
    var namedBillions: Double? { Self.number("(?:^|[-_])([0-9]+(?:\\.[0-9]+)?)B(?:[-_]|$)", in: name) }
    var activeBillions: Double? { Self.number("(?:^|[-_])A([0-9]+(?:\\.[0-9]+)?)B(?:[-_]|$)", in: name) }
    var billions: Double? {
        let values = [namedBillions, gguf?.total.map { $0 / 1e9 }].compactMap { $0 }
        return values.max()
    }
    var family: String {
        (tags ?? []).first(where: { $0.hasPrefix("base_model:quantized:") })?.replacingOccurrences(of: "base_model:quantized:", with: "") ?? id
    }
    var eligible: Bool {
        guard let b = billions, b >= 0.5 else { return false }
        let text = pipeline_tag == "text-generation" || pipeline_tag == "image-text-to-text" || (tags ?? []).contains("text-generation")
        return text && (b <= 30 || (b <= 40 && (activeBillions ?? 999) <= 4))
    }
    var sizeLabel: String { billions.map { String(format: "約 %.1fB", $0) } ?? "參數量未確認" }
    var license: String { (tags ?? []).first(where: { $0.hasPrefix("license:") })?.replacingOccurrences(of: "license:", with: "") ?? "請查看模型授權" }
    var webURL: URL { URL(string: "https://huggingface.co")!.appendingPathComponent(id) }
}
struct HubFile: Decodable, Identifiable {
    struct LFS: Decodable { let oid: String; let size: Int64? }
    let type: String
    let path: String
    let size: Int64
    let lfs: LFS?
    var id: String { path }
    var usable: Bool {
        let lower = path.lowercased()
        return type == "file" && lower.hasSuffix(".gguf") && !lower.contains("mmproj") && !lower.contains("imatrix") && !lower.contains("mtp") && lower.range(of: "-[0-9]{5}-of-[0-9]{5}", options: .regularExpression) == nil && size > 1_000_000 && checksum != nil
    }
    var checksum: String? {
        guard let value = lfs?.oid, value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return nil }
        return value
    }
    var preferred: Bool { path.uppercased().contains("Q4_K_M") }
    var displaySize: String { ByteCountFormatter.string(fromByteCount: size, countStyle: .file) }
}
struct RunReport: Decodable, Identifiable {
    struct Group: Decodable { let concurrency: Int; let `repeat`: Int; let wallMs: Double; let aggregateTps: Double }
    let groups: [Group]?
    struct Hardware: Decodable { let chip: String; let memoryBytes: Double; let cpuCores: Int }
    struct Runtime: Decodable { let binarySha256: String; let name: String?; let versionText: String? }
    struct Model: Decodable {
        let modelSha256: String; let modelName: String?; let loadMs: Double; let peakProcessRssBytes: Double?; let samples: [Sample]
    }
    let specVersion: String; let runId: String; let measuredAt: String
    let hardware: Hardware; let runtime: Runtime; let models: [Model]
    var id: String { runId }
    var isOMLX: Bool { specVersion == "local-ai-omlx-v1" }
    var isTrial: Bool { specVersion == "local-ai-trial-v1" }
}
struct Sample: Decodable {
    let inputTokens: Int; let outputTokens: Int; let ttftMs: Double; let prefillTps: Double; let decodeTps: Double
    let concurrency: Int?; let `repeat`: Int?; let user: Int?; let endToEndTps: Double?
}
struct HistoryItem: Identifiable {
    let url: URL; let report: RunReport
    var id: String { report.id }
}
func median(_ values: [Double]) -> Double {
    let s = values.sorted(); guard !s.isEmpty else { return 0 }; return s.count % 2 == 0 ? (s[s.count/2-1]+s[s.count/2])/2 : s[s.count/2]
}
func fileSHA256(_ url: URL) throws -> String {
    let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
    var hash = SHA256()
    while let chunk = try file.read(upToCount: 8 * 1024 * 1024), !chunk.isEmpty {
        if Task.isCancelled { throw CancellationError() }
        hash.update(data: chunk)
    }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
}
