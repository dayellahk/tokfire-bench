package com.tokfire.bench;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Native HTTP benchmark engine. No dynamic tools, generated code or file execution. */
public final class BenchEngine {
 public interface Progress { void update(String message, int completed); }
 public volatile boolean stopped;
 private final Set<HttpURLConnection> connections=ConcurrentHashMap.newKeySet();
 public void cancel(){stopped=true;for(HttpURLConnection c:connections)c.disconnect();}
 public static boolean local(String host){return "localhost".equals(host)||"127.0.0.1".equals(host)||"[::1]".equals(host)||"::1".equals(host);}
 public static URI endpoint(String value,boolean remote) throws Exception{
  URI u=new URI(value);String host=u.getHost();
  boolean lan=host!=null&&(host.matches("10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")||host.matches("192\\.168\\.\\d{1,3}\\.\\d{1,3}")||host.matches("172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}"));
  if(!("http".equals(u.getScheme())||"https".equals(u.getScheme()))||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||u.getPort()<1||(!u.getPath().isEmpty()&&!u.getPath().equals("/"))||(!local(host)&&!(remote&&lan)))throw new IllegalArgumentException("Use a loopback origin, or enable remote mode and enter a private LAN IP with port. No /v1 path.");
  if(remote&&local(host))throw new IllegalArgumentException("Loopback is on-device: turn remote mode off.");
  return u;
 }
 static JSONObject obj(Object... values)throws JSONException{JSONObject o=new JSONObject();for(int i=0;i<values.length;i+=2)o.put((String)values[i],values[i+1]==null?JSONObject.NULL:values[i+1]);return o;}
 static Object positive(double n){return Double.isFinite(n)&&n>0?n:JSONObject.NULL;}
 static Object optional(JSONObject o,String key){double n=o.optDouble(key,Double.NaN);return positive(n);}
 static double now(){return System.nanoTime()/1e6;}
 static final class Reply {JSONObject metrics;String text;Reply(JSONObject m,String t){metrics=m;text=t;}}
 Reply stream(URI base,String engine,String model,JSONArray messages,int max,int context)throws Exception{
  if(stopped)throw new InterruptedException();boolean ollama=engine.equals("Ollama");
  JSONObject payload=obj("model",model,"messages",messages,"stream",true);
  if(ollama)payload.put("options",obj("temperature",0,"seed",42,"num_predict",max,"num_ctx",context)).put("think",false);
  else {payload.put("temperature",0).put("max_tokens",max).put("stream_options",obj("include_usage",true));if(engine.equals("llama.cpp"))payload.put("cache_prompt",false).put("seed",42).put("chat_template_kwargs",obj("enable_thinking",false));}
  HttpURLConnection c=(HttpURLConnection)new URL(base.toString().replaceAll("/$","")+(ollama?"/api/chat":"/v1/chat/completions")).openConnection();
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(180000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");connections.add(c);
  double start=now(),first=-1,last=-1,visible=-1;int chunks=0,size=0;JSONObject usage=null,timing=new JSONObject(),finalRow=null;boolean done=false;String reason=null;StringBuilder content=new StringBuilder();
  try{
   try(OutputStream out=c.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
   if(c.getResponseCode()!=200)throw new IOException("http-error");
   if(!ollama&&(c.getContentType()==null||!c.getContentType().contains("text/event-stream")))throw new IOException("invalid-stream");
   try(BufferedReader in=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
    String raw;while((raw=boundedLine(in))!=null){
     if(stopped)throw new InterruptedException();if(now()-start>180000)throw new IOException("timeout");
     c.setReadTimeout(Math.max(1,(int)(180000-(now()-start))));size+=raw.length();if(size>8_000_000)throw new IOException("response-too-large");
     if(!ollama){if(!raw.startsWith("data:"))continue;raw=raw.substring(5).trim();if(raw.equals("[DONE]")){done=true;break;}}
     if(raw.isEmpty())continue;JSONObject row=new JSONObject(raw);if(row.has("error"))throw new IOException("runtime-error");
     JSONObject msg;String text,thinking;
     if(ollama){msg=row.optJSONObject("message");if(row.optBoolean("done")){done=true;finalRow=row;reason=row.optString("done_reason","stop");}}
     else {JSONArray choices=row.optJSONArray("choices");JSONObject choice=choices!=null&&choices.length()>0?choices.getJSONObject(0):new JSONObject();msg=choice.optJSONObject("delta");if(!choice.isNull("finish_reason"))reason=choice.optString("finish_reason");if(row.optJSONObject("usage")!=null)usage=row.getJSONObject("usage");if(row.optJSONObject("timings")!=null)timing=row.getJSONObject("timings");}
     if(msg==null)msg=new JSONObject();text=msg.optString("content","");thinking=msg.optString(ollama?"thinking":"reasoning_content",msg.optString("reasoning",""));
     if(!text.isEmpty()||!thinking.isEmpty()){double at=now();if(first<0)first=at;last=at;chunks++;}
     if(!text.isEmpty()){if(visible<0)visible=now();content.append(text);}
     if(ollama&&done)break;
    }
   }
   double elapsed=now()-start;Object decode=JSONObject.NULL,prefill=JSONObject.NULL,cached=JSONObject.NULL;
   if(!done||first<0||!("stop".equals(reason)||"length".equals(reason)))throw new IOException("incomplete-stream");
   if(ollama){usage=obj("prompt_tokens",finalRow.opt("prompt_eval_count"),"completion_tokens",finalRow.opt("eval_count"));decode=positive(finalRow.optDouble("eval_count")/(finalRow.optDouble("eval_duration")/1e9));cached=finalRow.opt("prompt_eval_cached_count");prefill=cached instanceof Number?positive((finalRow.optDouble("prompt_eval_count")-((Number)cached).doubleValue())/(finalRow.optDouble("prompt_eval_duration")/1e9)):JSONObject.NULL;}
   else {if(usage==null)throw new IOException("missing-token-usage");decode=optional(timing,"predicted_per_second");if(decode==JSONObject.NULL)decode=optional(usage,"generation_tokens_per_second");prefill=optional(timing,"prompt_per_second");if(prefill==JSONObject.NULL)prefill=optional(usage,"prompt_tokens_per_second");JSONObject details=usage.optJSONObject("prompt_tokens_details");cached=details!=null?details.opt("cached_tokens"):timing.opt("cache_n");}
   int input=usage.optInt("prompt_tokens",-1),output=usage.optInt("completion_tokens",-1);
   if(input<=0||output<=0||output>max)throw new IOException("invalid-token-usage");if(input+output>context)throw new IOException("context-exceeded");
   if(!(cached instanceof Number)||((Number)cached).intValue()<0||((Number)cached).intValue()>input)cached=JSONObject.NULL;
   return new Reply(obj("inputTokens",input,"outputTokens",output,"ttftMs",first-start,"firstVisibleMs",visible<0?null:visible-start,"elapsedMs",elapsed,"decodeTps",decode,"prefillTps",prefill,"cachedTokens",cached,"streamTps",output>1&&chunks>1&&last>first?(output-1)/((last-first)/1000):null,"endToEndTps",output/(elapsed/1000),"finishReason",reason),content.toString());
  }finally{connections.remove(c);c.disconnect();}
 }
 static String boundedLine(Reader r)throws IOException{StringBuilder b=new StringBuilder();int ch;while((ch=r.read())!=-1){if(ch=='\n')return b.toString();if(ch!='\r')b.append((char)ch);if(b.length()>1_048_576)throw new IOException("response-too-large");}return b.length()==0?null:b.toString();}
 JSONObject job(URI base,String engine,String model,JSONObject profile,String id,int count,int repeat,int job,CyclicBarrier barrier)throws Exception{
  if(barrier!=null)barrier.await(30,TimeUnit.SECONDS);double start=now(),toolMs=0;JSONArray requests=new JSONArray();String status="complete",error=null;int stage=0,calls=0,errors=0;
  JSONArray messages=new JSONArray().put(obj("role","user","content","Run ID: "+UUID.randomUUID()+"\n"+profile.getString("prompt")));
  try{
   for(int step=0;step<(id.equals("agent-tools")?5:1);step++){
    Reply reply=stream(base,engine,model,messages,profile.getInt("maxOutputTokens"),profile.getInt("contextTokens"));requests.put(reply.metrics);
    if(!id.equals("agent-tools")){if(reply.metrics.isNull("firstVisibleMs"))status="partial";break;}
    double toolStart=now();JSONObject result=null;
    try{
     JSONObject action=new JSONObject(reply.text.trim());
     if(action.length()==1&&action.has("answer")){status=stage==2&&action.opt("answer") instanceof Number&&action.getDouble("answer")==774?"complete":stage>0?"partial":"failure";toolMs+=now()-toolStart;break;}
     calls++;JSONObject args=action.getJSONObject("arguments");String name=action.getString("tool");if(action.length()!=2)throw new JSONException("extra keys");
     if(stage==0&&name.equals("lookup")&&args.length()==1&&args.optString("table").equals("orders")){stage=1;result=new JSONObject("{\"records\":[{\"quantity\":2,\"unit_price\":129},{\"quantity\":1,\"unit_price\":249},{\"quantity\":3,\"unit_price\":89}]}");}
     else if(stage==1&&name.equals("sum")&&args.length()==1){JSONArray values=args.getJSONArray("values");if(values.length()!=3||!(values.get(0) instanceof Number)||!(values.get(1) instanceof Number)||!(values.get(2) instanceof Number)||values.getDouble(0)!=258||values.getDouble(1)!=249||values.getDouble(2)!=267)throw new JSONException("wrong totals");stage=2;result=obj("total",774);}
     else throw new JSONException("invalid tool");
    }catch(JSONException ex){errors++;status=stage>0?"partial":"failure";toolMs+=now()-toolStart;break;}
    toolMs+=now()-toolStart;messages.put(obj("role","assistant","content",reply.text)).put(obj("role","user","content","Tool result: "+result+". Return the next JSON action or final answer."));if(step==4)status=stage>0?"partial":"failure";
   }
  }catch(InterruptedException ex){throw ex;}catch(Exception ex){if(stopped)throw new InterruptedException();status="error";String code=ex.getMessage();error=Arrays.asList("http-error","invalid-stream","timeout","response-too-large","runtime-error","incomplete-stream","missing-token-usage","invalid-token-usage","context-exceeded").contains(code)?code:"transport-or-protocol-error";}
  return obj("jobId",job,"concurrency",count,"repeat",repeat,"status",status,"errorCode",error,"elapsedMs",now()-start,"requests",requests,"toolCalls",calls,"toolErrors",errors,"toolMs",toolMs);
 }
 public JSONObject run(URI base,String engine,String model,JSONObject profile,String workload,int jobs,int repeats,boolean sweep,boolean remote,JSONObject hardware,JSONObject before,Progress progress)throws Exception{
  if(jobs<1||jobs>3||repeats<3||repeats>5)throw new IllegalArgumentException("Android preview supports 1–3 jobs and 3–5 repeats.");
  stopped=false;progress.update("Warming up (excluded from measurements)…",0);
  JSONObject warm=job(base,engine,model,profile,workload,1,0,0,null);if(warm.getString("status").equals("error"))throw new IOException("Warm-up failed: "+warm.getString("errorCode")+". Check model ID, context and streaming usage support.");
  JSONArray samples=new JSONArray(),groups=new JSONArray(),levels=new JSONArray();int completed=0;
  for(int count=sweep?1:jobs;count<=jobs;count++){
   levels.put(count);
   for(int repeat=1;repeat<=repeats;repeat++){
    if(stopped)throw new InterruptedException();progress.update(count+" jobs · repeat "+repeat+" / "+repeats,completed);
    ExecutorService pool=Executors.newFixedThreadPool(count);CompletionService<JSONObject> queue=new ExecutorCompletionService<>(pool);CyclicBarrier barrier=new CyclicBarrier(count);double start=now();int tokens=0;
    try{
     final int n=count,round=repeat;for(int i=1;i<=count;i++){final int index=i;queue.submit(()->job(base,engine,model,profile,workload,n,round,index,barrier));}
     for(int i=0;i<count;i++){JSONObject row=queue.take().get();samples.put(row);JSONArray requests=row.getJSONArray("requests");for(int j=0;j<requests.length();j++)tokens+=requests.getJSONObject(j).getInt("outputTokens");completed++;progress.update(count+" jobs · repeat "+repeat+" · job "+row.getInt("jobId")+": "+row.getString("status"),completed);}
    }finally{pool.shutdownNow();}
    double elapsed=now()-start;groups.put(obj("concurrency",count,"repeat",repeat,"wallMs",elapsed,"aggregateTps",tokens/(elapsed/1000)));
   }
  }
  return obj("specVersion","tokfire-workloads-v1","runnerVersion","0.7.0","runId",UUID.randomUUID().toString(),"measuredAt",java.time.Instant.now().toString(),"hardware",hardware,
   "runtime",obj("name",engine,"binarySha256",null,"management",remote?"external-network":"external-loopback","identity","unverified-server-model-id","gpuLayersRequested",null),
   "settings",obj("workload",workload,"workloadSha256",profile.getString("sha256"),"concurrencyLevels",levels,"repeats",repeats,"maxOutputTokens",profile.getInt("maxOutputTokens"),"contextTokens",profile.getInt("contextTokens"),"warmups",1,"temperature",0,"cachePolicy","unique-prefix; report observed cache counts","targetTps",new JSONArray("[100,200]"),"timing","runtime decode/prefill; client first output and wall time","inferenceLocation",remote?"remote-server":"same-device","hardwareRole",remote?"request-client":"inference-host","timeoutSeconds",180),
   "models",new JSONArray().put(obj("modelName",model,"modelSha256",null,"loadMs",null,"samples",samples)),"groups",groups,
   "telemetry",obj("before",before,"after",before,"energyJoules",null,"peakGpuMemoryBytes",null));
 }
 public static String assess(JSONObject report)throws Exception{
  StringBuilder out=new StringBuilder("TokFire Bench 0.7 — "+report.getJSONObject("settings").getString("workload")+"\n\n");JSONArray rows=report.getJSONArray("models").getJSONObject(0).getJSONArray("samples"),levels=report.getJSONObject("settings").getJSONArray("concurrencyLevels");
  if(report.getJSONObject("settings").getString("inferenceLocation").equals("remote-server"))out.append("REMOTE SERVER TEST: the Android hardware is the request client, not the inference host. Do not compare this as phone inference performance.\n\n");
  for(int k=0;k<levels.length();k++){
   int n=levels.getInt(k),total=0,success=0;List<Double> times=new ArrayList<>(),speeds=new ArrayList<>(),waits=new ArrayList<>();boolean allDecode=true,allVisible=true;double worst=Double.MAX_VALUE,longest=0;
   for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);if(r.getInt("concurrency")!=n)continue;total++;if(r.getString("status").equals("complete"))success++;times.add(r.getDouble("elapsedMs"));JSONArray requests=r.getJSONArray("requests");for(int j=0;j<requests.length();j++){JSONObject q=requests.getJSONObject(j);if(q.isNull("decodeTps"))allDecode=false;else {double speed=q.getDouble("decodeTps");speeds.add(speed);worst=Math.min(worst,speed);}waits.add(q.getDouble("ttftMs"));if(q.isNull("firstVisibleMs"))allVisible=false;else longest=Math.max(longest,q.getDouble("firstVisibleMs"));}}
   Collections.sort(times);Collections.sort(speeds);Collections.sort(waits);
   out.append(n+" jobs: "+success+" / "+total+" complete\nDecode: "+(speeds.isEmpty()?"unavailable":String.format(Locale.US,"%.1f tok/s",median(speeds)))+" · first output: "+(waits.isEmpty()?"unavailable":String.format(Locale.US,"%.0f ms",median(waits)))+"\nP95 / P99 task: "+String.format(Locale.US,"%.0f / %.0f ms",times.get((int)Math.ceil(times.size()*.95)-1),times.get((int)Math.ceil(times.size()*.99)-1))+"\n");
   out.append(success==total&&allDecode&&allVisible&&!speeds.isEmpty()&&worst>=30&&longest<=3000?"Meets the interactive guideline in all measured requests.\n":"Below the interactive guideline, partial/failed tasks, or missing decode metrics. Consider a smaller model or fewer jobs.\n");
   out.append(success==total&&allDecode&&allVisible&&!speeds.isEmpty()&&worst>=100&&longest<=3000?"Every request meets the 100 tok/s target.\n\n":"100–200 tok/s target not met by every request or cannot be classified.\n\n");
  }
  out.append("P95/P99 describe a small sample, not an SLA. Aggregate throughput is total tokens / whole round wall time, not per-job speed. The 100–200 tok/s target is not a ChatGPT/Claude subscription guarantee. Chat completion does not grade answer quality. Agent success checks only the local lookup → sum → answer fixture, not Hermes/OpenClaw. Battery temperature is not total energy or thermal stability. No generated text is saved.\n");return out.toString();
 }
 static double median(List<Double> a){int n=a.size();return n%2==0?(a.get(n/2-1)+a.get(n/2))/2:a.get(n/2);}
}
