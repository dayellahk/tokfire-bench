import Foundation
import SwiftUI

struct AdvancedParameter: Decodable, Identifiable {
    let key: String; let label: String; let group: String; let type: String
    let `default`: String; let engines: [String]; let min: Double?; let max: Double?
    let choices: [String]?; let help: String; let managed: Bool
    var id: String { key }
    @MainActor func supported(_ bench: BenchController) -> Bool {
        engines.contains(bench.backend) && (!managed || !bench.externalRuntime) && !(key == "context_tokens" && bench.backend == "llama.cpp" && bench.externalRuntime)
    }
}
struct AdvancedCatalog: Decodable {
    let parameters: [AdvancedParameter]; let unsupported: [String]
    static let shared: AdvancedCatalog = {
        guard let url = Bundle.main.url(forResource: "advanced_parameters", withExtension: "json") ?? Bundle.module.url(forResource: "advanced_parameters", withExtension: "json"),
              let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode(Self.self, from: data) else { return Self(parameters: [], unsupported: ["Parameter catalog missing. Reinstall this build."]) }
        return catalog
    }()
}
struct AdvancedControls: View {
    @ObservedObject var bench: BenchController
    @ObservedObject var pro: ProStore
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(L("advancedTitle"), isOn: $bench.advancedMode)
            if bench.advancedMode {
                Text(L("advancedHelp")).font(.caption)
                if !pro.active { Text(L("advancedLocked")).foregroundColor(.orange); ProPanel(store: pro) }
                HStack { Text("\(bench.advancedValues.count) " + L("advancedSelected")); Spacer(); Button(L("advancedReset")) { bench.advancedValues = [:] } }
                ForEach(["Sampling", "Runtime", "Output / scenario"], id: \.self) { group in
                    DisclosureGroup(L("advanced" + group)) {
                        ForEach(AdvancedCatalog.shared.parameters.filter { $0.group == group }) { field in
                            parameter(field)
                        }
                    }
                }
                DisclosureGroup(L("advancedUnavailable")) {
                    ForEach(AdvancedCatalog.shared.unsupported, id: \.self) { Text($0).font(.caption) }
                }
            }
        }.onChange(of: bench.backend) { _ in bench.advancedValues = [:] }
    }
    @ViewBuilder func parameter(_ field: AdvancedParameter) -> some View {
        let supported = field.supported(bench)
        let enabled = bench.advancedValues[field.key] != nil
        VStack(alignment: .leading, spacing: 4) {
            Toggle(field.label, isOn: Binding(get: { bench.advancedValues[field.key] != nil }, set: { bench.advancedValues[field.key] = $0 ? field.default : nil })).disabled(!supported)
            if !supported { Text(L("advancedUnsupported")).font(.caption).foregroundColor(.secondary) }
            if enabled {
                let value = Binding<String>(get: { bench.advancedValues[field.key] ?? field.default }, set: { bench.advancedValues[field.key] = $0 })
                if let choices = field.choices { Picker(field.label, selection: value) { ForEach(choices, id: \.self) { Text($0).tag($0) } }.labelsHidden() }
                else if field.type == "text" { TextEditor(text: value).font(.system(.caption, design: .monospaced)).frame(height: 65) }
                else { TextField(field.default, text: value).textFieldStyle(.roundedBorder).frame(maxWidth: 180) }
                if let min = field.min, let max = field.max { Text("\(min.formatted()) … \(max.formatted())").font(.caption).foregroundColor(.secondary) }
                if !field.help.isEmpty { Text(field.help).font(.caption).foregroundColor(.secondary) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
    }
}
