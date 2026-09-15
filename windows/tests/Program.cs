using System.Text.Json.Nodes;
using TokFire.Bench;
var report=JsonNode.Parse(File.ReadAllText(args[0]))!.AsObject();
var result=Reports.Assess(report);
if(!result.Contains("Job 1:")||!result.Contains("not a guaranteed speed")||!result.Contains("Aggregate speed is not each job"))throw new Exception("Report explanations missing");
var models=Catalog.Parse("""[{"id":"a/model-400B","pipeline_tag":"text-generation","trendingScore":999},{"id":"a/model-36B-A3B","pipeline_tag":"text-generation","trendingScore":20},{"id":"a/model-2B","pipeline_tag":"text-generation","trendingScore":1},{"id":"a/../../evil","pipeline_tag":"text-generation"},{"id":"a/model-7B","pipeline_tag":"audio","trendingScore":100}]""");
if(models.Count!=2||models[0].Billions!=2||models[1].Billions!=36)throw new Exception("Catalog size/type/popularity filter failed");
Console.WriteLine("PASS: per-job assessment and small-model catalogue filtering");
