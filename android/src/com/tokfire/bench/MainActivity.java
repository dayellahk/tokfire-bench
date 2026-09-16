package com.tokfire.bench;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
 final ExecutorService worker=Executors.newSingleThreadExecutor();BenchEngine engine=new BenchEngine();
 LinearLayout column;EditText url,model;Spinner runtime,profile,jobs,repeats,language;CheckBox sweep,remote,upload,publish;Button run,stop,export;TextView status,summary;ProgressBar progress;WebView account;
 JSONObject profiles,translations;String languageCode="en",latest;boolean running=false,uploading=false,destroyed=false;File reportDir,queueDir;final List<View> inputs=new ArrayList<>();
 static final String ORIGIN="https://tokfires.com";
 static final String[] CODES={"en","zh-Hans","hi","es","fr","ar","bn","pt","ru","ur","id","de","ja","pcm","mr","te","tr","ta","zh-Hant","vi"};
 static final String[] NAMES={"English","简体中文","हिन्दी","Español","Français","العربية","বাংলা","Português","Русский","اردو","Bahasa Indonesia","Deutsch","日本語","Naijá","मराठी","తెలుగు","Türkçe","தமிழ்","繁體中文","Tiếng Việt"};
 static final String[] PROFILES={"short-chat","business","long-summary","agent-tools"};
 @Override public void onCreate(Bundle state){super.onCreate(state);reportDir=new File(getFilesDir(),"reports");queueDir=new File(getFilesDir(),"outbox");reportDir.mkdirs();queueDir.mkdirs();
  try{profiles=new JSONObject(asset("workloads.json"));translations=new JSONObject(asset("languages.json"));}catch(Exception e){throw new IllegalStateException(e);}
  languageCode=getPreferences(0).getString("language","en");build();
 }
 String asset(String name)throws IOException{try(InputStream in=getAssets().open(name)){ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] data=new byte[8192];int n;while((n=in.read(data))!=-1)b.write(data,0,n);return b.toString("UTF-8");}}
 String t(String key){JSONObject lang=translations.optJSONObject(languageCode);return lang!=null&&lang.has(key)?lang.optString(key):translations.optJSONObject("en").optString(key,key);}
 int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
 TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(Color.rgb(245,234,220));v.setPadding(0,dp(8),0,dp(8));column.addView(v);return v;}
 Button button(String title,Runnable action){Button b=new Button(this);b.setText(title);column.addView(b);b.setOnClickListener(v->action.run());return b;}
 EditText edit(String hint,String value){EditText v=new EditText(this);v.setHint(hint);v.setText(value);v.setTextColor(Color.WHITE);v.setHintTextColor(Color.LTGRAY);v.setSingleLine();column.addView(v);inputs.add(v);return v;}
 Spinner spinner(String label,String[] values){text(label,14);Spinner s=new Spinner(this);ArrayAdapter<String> a=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values);s.setAdapter(a);column.addView(s);inputs.add(s);return s;}
 CheckBox check(String title,boolean value){CheckBox v=new CheckBox(this);v.setText(title);v.setTextColor(Color.WHITE);v.setChecked(value);column.addView(v);inputs.add(v);return v;}
 void build(){inputs.clear();ScrollView scroll=new ScrollView(this);column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(dp(22),dp(40),dp(22),dp(36));column.setBackgroundColor(Color.rgb(25,22,20));scroll.addView(column);setContentView(scroll);
  text("TokFire Bench",30).setTextColor(Color.rgb(255,158,76));text("Android preview 0.7 · TokFire Labs",15);
  text("Native benchmark client. Connect an HTTP model runtime on this phone, or explicitly select a remote LAN server. Model weights and an inference runtime are not bundled.",14);
  language=spinner(t("language"),NAMES);language.setSelection(Arrays.asList(CODES).indexOf(languageCode));language.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){}public void onItemSelected(android.widget.AdapterView<?> p,View v,int n,long id){if(!CODES[n].equals(languageCode)&&!running){languageCode=CODES[n];getPreferences(0).edit().putString("language",languageCode).apply();build();}}});
  runtime=spinner(t("runtime"),new String[]{"llama.cpp","Ollama","vLLM","oMLX"});
  url=edit(t("localEndpoint"),getPreferences(0).getString("endpoint","http://127.0.0.1:8080"));
  model=edit(t("servedModel"),getPreferences(0).getString("model",""));
  remote=check("Remote server on my LAN (results measure that server, not phone inference)",false);
  profile=spinner(t("workload"),new String[]{t(PROFILES[0]),t(PROFILES[1]),t(PROFILES[2]),t(PROFILES[3])});
  jobs=spinner(t("concurrent"),new String[]{"1 job","2 jobs","3 jobs"});
  repeats=spinner(t("repeats"),new String[]{"3","4","5"});sweep=check(t("sweep"),false);
  text(t("workloadHelp"),14);text("Free preview: 1–3 same-model jobs. Android Pro activation is not enabled in this preview.",13);
  upload=check(t("autoUpload"),getPreferences(0).getBoolean("upload",true));publish=check(t("publicShare"),false);
  text("Uploads include device model, RAM, OS and timings. No prompts, outputs, endpoint addresses, serial numbers or device IDs. Remote results identify this phone only as the request client.",13);
  upload.setOnCheckedChangeListener((v,on)->{getPreferences(0).edit().putBoolean("upload",on).apply();publish.setEnabled(on);if(!on)publish.setChecked(false);});publish.setEnabled(upload.isChecked());
  run=button(t("start"),()->start());stop=button(t("stop"),()->{engine.cancel();status.setText("Stopping requests…");});stop.setEnabled(false);
  progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);column.addView(progress);status=text(t("ready"),16);summary=text("",14);summary.setTextIsSelectable(true);
  export=button(t("export"),()->export());export.setEnabled(false);button(t("history"),()->history());button(t("connectAccount"),()->connect());button(t("retry"),()->retry());button(t("clearQueue"),()->{if(!uploading){File[] files=queueDir.listFiles();if(files!=null)for(File f:files)f.delete();status.setText("Pending uploads cleared.");}});
  text("New benchmark controls are available in English, Traditional and Simplified Chinese; existing core labels support 20 languages. Technical assessment text is English.",12);
 }
 JSONObject hardware()throws Exception{ActivityManager.MemoryInfo mem=new ActivityManager.MemoryInfo();((ActivityManager)getSystemService(ACTIVITY_SERVICE)).getMemoryInfo(mem);String chip=Build.VERSION.SDK_INT>=31?Build.SOC_MODEL:Build.HARDWARE;
  return BenchEngine.obj("platform","Android","architecture",Build.SUPPORTED_ABIS[0],"chip",chip,"machine",Build.MANUFACTURER+" "+Build.MODEL,"cpuCores",Runtime.getRuntime().availableProcessors(),"memoryBytes",mem.totalMem,"osVersion",Build.VERSION.RELEASE,"gpuNames",new JSONArray(),"gpuMemoryBytes",null);
 }
 JSONObject battery()throws Exception{Intent i=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));int level=i==null?-1:i.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=i==null?-1:i.getIntExtra(BatteryManager.EXTRA_SCALE,-1),temp=i==null?Integer.MIN_VALUE:i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,Integer.MIN_VALUE);return BenchEngine.obj("batteryPercent",level>=0&&scale>0?100.0*level/scale:null,"batteryTemperatureC",temp==Integer.MIN_VALUE?null:temp/10.0);}
 void start(){if(running)return;try{
  final boolean offDevice=remote.isChecked(),consent=upload.isChecked(),publication=publish.isChecked(),doSweep=sweep.isChecked();final java.net.URI endpoint=BenchEngine.endpoint(url.getText().toString().trim(),offDevice);
  final String modelID=model.getText().toString().trim(),runtimeName=runtime.getSelectedItem().toString(),workload=PROFILES[profile.getSelectedItemPosition()];
  if(modelID.isEmpty()||modelID.length()>200||modelID.matches(".*[\\p{Cntrl}].*"))throw new IllegalArgumentException("Enter the model ID served by your runtime.");
  if(runtimeName.equals("oMLX")&&!offDevice)throw new IllegalArgumentException("oMLX runs on a remote Apple Silicon Mac; select remote mode and enter its LAN address.");
  final int count=jobs.getSelectedItemPosition()+1,rounds=repeats.getSelectedItemPosition()+3;final JSONObject hw=hardware(),before=battery(),selected=profiles.getJSONObject(workload);
  getPreferences(0).edit().putString("endpoint",url.getText().toString()).putString("model",modelID).apply();
  running=true;engine=new BenchEngine();inputs.forEach(v->v.setEnabled(false));run.setEnabled(false);stop.setEnabled(true);export.setEnabled(false);summary.setText("");progress.setMax((doSweep?count*(count+1)/2:count)*rounds);progress.setProgress(0);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  worker.submit(()->{try{
   if(consent){ui(()->status.setText("Requesting a one-time test challenge…"));JSONArray levels=new JSONArray();for(int n=doSweep?1:count;n<=count;n++)levels.put(n);
    engine.challenge=prepareChallenge(BenchEngine.obj("workload",workload,"engine",runtimeName,"model",modelID,"concurrencyLevels",levels,"repeats",rounds));}
   if(engine.stopped)throw new InterruptedException();
   JSONObject report=engine.run(endpoint,runtimeName,modelID,selected,workload,count,rounds,doSweep,offDevice,hw,before,(message,n)->ui(()->{status.setText(message);progress.setProgress(n);}));
   if(engine.stopped)throw new InterruptedException();report.getJSONObject("telemetry").put("after",battery());String name=report.getString("runId")+".json",json=report.toString(2),comment=BenchEngine.assess(report);write(new File(reportDir,name),json);write(new File(reportDir,name.replace(".json",".md")),comment);
   if(consent)write(new File(queueDir,name),BenchEngine.obj("report",report,"consent",BenchEngine.obj("collect",true,"publish",publication,"version","2026-09-15-v1")).toString());
   ui(()->{latest=name;summary.setText(comment);status.setText(t("complete")+(consent?" · upload queued":""));export.setEnabled(true);if(consent)retry();});
  }catch(Exception e){ui(()->status.setText(engine.stopped?"Stopped. No incomplete report saved.":"Test failed: "+e.getMessage()));}
  finally{ui(()->{running=false;inputs.forEach(v->v.setEnabled(true));publish.setEnabled(upload.isChecked());run.setEnabled(true);stop.setEnabled(false);getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});}});
 }catch(Exception e){status.setText(e.getMessage());}}
 void ui(Runnable r){runOnUiThread(()->{if(!destroyed)r.run();});}
 static void write(File f,String value)throws IOException{File tmp=new File(f.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(value.getBytes(StandardCharsets.UTF_8));}if(!tmp.renameTo(f))throw new IOException("Could not save report");}
 static String read(File f)throws IOException{try(FileInputStream in=new FileInputStream(f)){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1){out.write(bytes,0,n);if(out.size()>1_500_000)throw new IOException("Report too large");}return out.toString("UTF-8");}}
 void history(){if(running)return;File[] files=reportDir.listFiles((d,n)->n.endsWith(".json"));if(files==null||files.length==0){status.setText(t("noReports"));return;}Arrays.sort(files,(a,b)->Long.compare(b.lastModified(),a.lastModified()));String[] names=Arrays.stream(files).map(File::getName).toArray(String[]::new);new AlertDialog.Builder(this).setTitle(t("history")).setItems(names,(d,n)->{try{latest=names[n];summary.setText(read(new File(reportDir,latest.replace(".json",".md"))));export.setEnabled(true);}catch(Exception e){status.setText("Could not read report.");}}).show();}
 void export(){if(latest==null)return;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,"TokFireBench-"+latest);startActivityForResult(i,7);}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==7&&result==RESULT_OK&&data!=null&&latest!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(read(new File(reportDir,latest)).getBytes(StandardCharsets.UTF_8));status.setText("Report exported.");}catch(Exception e){status.setText("Could not export report.");}}}
 JSONObject guestPost(String path,JSONObject body)throws Exception{
  java.net.HttpURLConnection connection=(java.net.HttpURLConnection)new java.net.URL(ORIGIN+path).openConnection();
  connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Origin",ORIGIN);
  String cookies=CookieManager.getInstance().getCookie(ORIGIN);if(cookies!=null)connection.setRequestProperty("Cookie",cookies);
  try{try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
   for(Map.Entry<String,List<String>> header:connection.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String value:header.getValue())CookieManager.getInstance().setCookie(ORIGIN,value);
   if(connection.getResponseCode()/100!=2)throw new IOException("Challenge unavailable");
   try(InputStream in=connection.getInputStream()){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>16384)throw new IOException("Response too large");}return new JSONObject(out.toString("UTF-8"));}
  }finally{connection.disconnect();}
 }
 JSONObject prepareChallenge(JSONObject config){try{guestPost("/api/guest",new JSONObject());JSONObject ticket=guestPost("/api/v2/challenges",config);if(!ticket.getString("nonce").matches("[a-f0-9]{64}")||ticket.getLong("expiresAt")<System.currentTimeMillis())return null;UUID.fromString(ticket.getString("id"));UUID.fromString(ticket.getString("runId"));return ticket;}catch(Exception e){ui(()->status.setText("Challenge unavailable · community-unverified run"));return null;}}
 void connect(){connect(true);}
 void connect(boolean visible){if(account==null){account=new WebView(this);account.getSettings().setJavaScriptEnabled(true);account.getSettings().setDomStorageEnabled(true);account.getSettings().setAllowFileAccess(false);account.getSettings().setAllowContentAccess(false);account.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);CookieManager.getInstance().setAcceptThirdPartyCookies(account,false);
   account.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){Uri u=r.getUrl();return !"https".equals(u.getScheme())||!"tokfires.com".equals(u.getHost());}@Override public void onPageFinished(WebView v,String u){if((ORIGIN+"/native-connect").equals(u))retry();}});
  }if(visible){if(account.getParent()!=null)((android.view.ViewGroup)account.getParent()).removeView(account);new AlertDialog.Builder(this).setTitle(t("connectAccount")).setView(account).setPositiveButton(t("done"),(d,w)->{}).show();}account.loadUrl(ORIGIN+"/native-connect");}
 void retry(){if(uploading||!upload.isChecked())return;File[] files=queueDir.listFiles((d,n)->n.endsWith(".json"));if(files==null||files.length==0)return;uploading=true;status.setText(t("uploading"));
  worker.submit(()->{try{guestPost("/api/guest",new JSONObject());JSONObject result=guestPost("/api/v2/submissions",new JSONObject(read(files[0])));if(!result.optBoolean("stored"))throw new IOException("Upload not acknowledged");boolean review="quarantined".equals(result.optString("status"));files[0].delete();ui(()->{uploading=false;status.setText(t(review?"uploadReview":"uploaded"));retry();});}
   catch(Exception e){ui(()->{uploading=false;status.setText(t("uploadFailed")+" · retained locally");});}});
 }
 @Override protected void onDestroy(){destroyed=true;engine.cancel();worker.shutdownNow();if(account!=null)account.destroy();super.onDestroy();}
}
