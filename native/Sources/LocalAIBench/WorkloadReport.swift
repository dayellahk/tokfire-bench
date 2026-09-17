import Foundation
import SwiftUI

struct WorkloadReport: Decodable, Identifiable {
    struct Settings: Decodable { let workload: String; let concurrencyLevels: [Int]; let repeats: Int; let timeoutSeconds: Int?; let mode: String? }
    struct Request: Decodable { let decodeTps: Double?; let prefillTps: Double?; let ttftMs: Double; let firstVisibleMs: Double?; let elapsedMs: Double; let endToEndTps: Double }
    struct Verification: Decodable { struct Check: Decodable { let id: String; let passed: Bool }; let checks: [Check]; let retries: Int }
    struct Job: Decodable { let jobId: Int; let concurrency: Int; let status: String; let elapsedMs: Double; let requests: [Request]; let verification: Verification?; let toolErrors: Int }
    struct Model: Decodable { let modelName: String; let samples: [Job] }
    let specVersion: String; let runId: String; let measuredAt: String
    let settings: Settings; let models: [Model]; let hardware: RunReport.Hardware
    let groups: [RunReport.Group]
    var id: String { runId }
}
func tail(_ values: [Double], _ fraction: Double) -> Double? {
    let sorted = values.sorted(); guard !sorted.isEmpty else { return nil }
    return sorted[max(0, Int(ceil(Double(sorted.count) * fraction)) - 1)]
}
struct WorkloadResults: View {
    @ObservedObject var bench: BenchController
    let report: WorkloadReport
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text(L("workloadResults")).font(.title2.bold()); Spacer(); Button(L("assessment") + " ↓") { bench.exportCommentary() }; Button(L("export")) { bench.export() } }
            Text(L(report.settings.workload)).font(.headline)
            if report.settings.mode == "pro-advanced" { Text(L("advancedLocalOnly")).foregroundColor(.orange) }
            if report.models[0].samples.contains(where: { $0.verification != nil }) { Text(L("agentSimulationScope")).font(.caption); Text("\(L("taskDeadline")): \(report.settings.timeoutSeconds ?? 180) s").font(.caption) }
            ForEach(report.settings.concurrencyLevels, id: \.self) { count in
                let jobs = report.models[0].samples.filter { $0.concurrency == count }
                let requests = jobs.flatMap(\.requests)
                let speeds = requests.compactMap(\.decodeTps)
                VStack(alignment: .leading, spacing: 8) {
                    let simulation = jobs.contains { $0.verification != nil }
                    Text("\(count) jobs · \(jobs.filter { $0.status == "complete" }.count) / \(jobs.count) \(L(simulation ? "tasksPassed" : "completed"))").font(.headline)
                    let checks = jobs.flatMap { $0.verification?.checks ?? [] }
                    if !checks.isEmpty { Text("\(L("agentChecks")): \(checks.filter(\.passed).count) / \(checks.count) · \(L("agentRetries")): \(jobs.reduce(0) { $0 + ($1.verification?.retries ?? 0) })").font(.headline) }
                    Text("Decode: " + (speeds.isEmpty ? "—" : String(format: "%.1f tok/s", median(speeds))) + " · TTFT: " + String(format: "%.0f ms", median(requests.map(\.ttftMs))))
                    Text(String(format: "P95 / P99: %.0f / %.0f ms · Σ %.1f tok/s", tail(jobs.map(\.elapsedMs), 0.95) ?? 0, tail(jobs.map(\.elapsedMs), 0.99) ?? 0, median(report.groups.filter { $0.concurrency == count }.map(\.aggregateTps))))
                    let visible = requests.compactMap(\.firstVisibleMs)
                    let complete = jobs.allSatisfy { $0.status == "complete" }
                    let smooth = complete && jobs.allSatisfy { $0.toolErrors == 0 } && !requests.isEmpty && speeds.count == requests.count && visible.count == requests.count && (speeds.min() ?? 0) >= 30 && (visible.max() ?? 1e9) <= 3000
                    Text(L(!complete ? (simulation ? "agentTaskFailure" : "workloadPartial") : smooth ? "workloadSmooth" : "workloadSlow")).font(.headline).foregroundColor(smooth ? .green : .orange)
                    Text(L("tailCaution")).font(.caption)
                    DisclosureGroup(L("workloadPerJob")) {
                        ForEach(Array(Set(jobs.map(\.jobId))).sorted(), id: \.self) { id in
                            let rows = jobs.filter { $0.jobId == id }
                            let rates = rows.flatMap(\.requests).compactMap(\.decodeTps)
                            Text("Job \(id) · \(rows.filter { $0.status == "complete" }.count)/\(rows.count) · " + (rates.isEmpty ? "—" : String(format: "%.1f tok/s", median(rates))))
                        }
                    }.font(.caption)
                }.padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
            }
            DisclosureGroup(L("workloadDetails")) { Text(bench.workloadCommentary).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
            UploadStatus(store: bench.uploads)
        }.padding(22).background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 16))
    }
}
