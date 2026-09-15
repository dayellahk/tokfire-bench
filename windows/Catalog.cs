using System.Net.Http;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace TokFire.Bench;
internal sealed record HubModel(string Id,double Billions,double Score){public override string ToString()=>$"{Id}   ·   {Billions:0.#}B";}
internal static class Catalog {
 public static async Task<List<HubModel>> Load(){
  using var client=new HttpClient{Timeout=TimeSpan.FromSeconds(25)};
  var text=await client.GetStringAsync("https://huggingface.co/api/models?filter=gguf&sort=trendingScore&direction=-1&limit=100&expand[]=gguf&expand[]=trendingScore&expand[]=tags&expand[]=pipeline_tag");
  if(text.Length>12000000)throw new InvalidOperationException("Unexpected catalog size.");
  return Parse(text);
 }
 internal static List<HubModel> Parse(string text){
  var items=JsonNode.Parse(text)!.AsArray();var models=new List<HubModel>();var families=new HashSet<string>();
  foreach(var x in items){if(x is null)continue;var id=x["id"]?.GetValue<string>()??"";if(!Regex.IsMatch(id,@"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$"))continue;
   var match=Regex.Match(id,@"(?:^|[-_/])(\d+(?:\.\d+)?)B(?:[-_]|$)",RegexOptions.IgnoreCase);
   var named=match.Success?double.Parse(match.Groups[1].Value,System.Globalization.CultureInfo.InvariantCulture):0;
   var billions=Math.Max(named,(x["gguf"]?["total"]?.GetValue<double>()??0)/1e9);var active=Regex.Match(id,@"[-_]A(\d+(?:\.\d+)?)B",RegexOptions.IgnoreCase);
   var tags=x["tags"]?.AsArray().Select(t=>t?.GetValue<string>()??"").ToArray()??[];
   if(billions<.5||!(billions<=30||(billions<=40&&active.Success&&double.Parse(active.Groups[1].Value,System.Globalization.CultureInfo.InvariantCulture)<=4)))continue;
   if(x["pipeline_tag"]?.GetValue<string>()!="text-generation"&&!tags.Contains("text-generation")&&x["pipeline_tag"]?.GetValue<string>()!="image-text-to-text")continue;
   var family=tags.FirstOrDefault(t=>t.StartsWith("base_model:quantized:"))??id;if(!families.Add(family))continue;
   models.Add(new(id,billions,x["trendingScore"]?.GetValue<double>()??0));
  }
  return models.OrderBy(m=>m.Billions>8).ThenByDescending(m=>m.Score).Take(10).ToList();
 }
}
