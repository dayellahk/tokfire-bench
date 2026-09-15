using System.Text;
using System.Text.Json.Nodes;
namespace TokFire.Bench;
internal static class Reports {
 public static string Assess(JsonObject report){
  var rows=report["models"]![0]!["samples"]!.AsArray();var jobs=report["settings"]!["concurrentJobs"]!.GetValue<int>();
  var text=new StringBuilder($"TokFire Bench — {jobs} concurrent jobs calling one model\r\n\r\n");
  foreach(var id in Enumerable.Range(1,jobs)){
   var samples=rows.Where(x=>x!["jobId"]!.GetValue<int>()==id).ToArray();
   double Median(string key){var a=samples.Select(x=>x![key]!.GetValue<double>()).Order().ToArray();return a[a.Length/2];}
   var speed=Median("decodeTps");var ttft=Median("ttftMs");var effective=Median("endToEndTps");
   var rating=speed>=100&&ttft<=2000?"Meets the selected 100 tok/s target":speed>=30&&ttft<=3000?"Comfortable interactive reading":speed>=15&&ttft<=10000?"Usable; expect a wait":"Slow for interactive use; try a smaller model or fewer jobs";
   text.AppendLine($"Job {id}: {speed:F1} decode tok/s · {ttft:F0} ms to first token · {effective:F1} end-to-end tok/s\r\n{rating}\r\n");
  }
  var aggregate=report["groups"]!.AsArray().Select(x=>x!["aggregateTps"]!.GetValue<double>()).Order().ToArray();
  text.AppendLine($"Aggregate: {aggregate[1]:F1} tok/s across all jobs. Aggregate speed is not each job's speed.");
  text.AppendLine("The 100–200 tok/s range is your comparison target, not a guaranteed speed of any ChatGPT subscription. This test measures speed and initial delay, not answer quality or prolonged thermal stability. More jobs share GPU/RAM and may reduce each job's speed.");
  return text.ToString();
 }
}
