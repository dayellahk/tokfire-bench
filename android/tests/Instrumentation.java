package com.tokfire.bench;
import android.app.*;
import android.os.*;
import android.content.*;
import org.json.*;
import java.util.*;
public class Instrumentation extends android.app.Instrumentation {
 Bundle options;
 @Override public void onCreate(Bundle args){options=args;super.onCreate(args);start();}
 void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
 @Override public void onStart(){Bundle result=new Bundle();try{
  Intent intent=new Intent(getTargetContext(),MainActivity.class);intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);MainActivity a=(MainActivity)startActivitySync(intent);
  if(options!=null&&options.containsKey("realEndpoint")){
   runOnMainSync(()->{a.url.setText(options.getString("realEndpoint"));a.model.setText("MiniCPM5-2B-Q4_K_M.gguf");a.remote.setChecked(true);a.upload.setChecked(false);a.profile.setSelection(0);a.jobs.setSelection(0);a.start();});
   long until=System.currentTimeMillis()+180000;while(a.running&&System.currentTimeMillis()<until)Thread.sleep(100);
   check(!a.running&&a.latest!=null,"Real remote run failed: "+a.status.getText());
   JSONObject r=new JSONObject(MainActivity.read(new java.io.File(a.reportDir,a.latest)));
   check(r.getJSONObject("settings").getString("hardwareRole").equals("request-client"),"Wrong hardware attribution");
   check(r.getJSONArray("models").getJSONObject(0).getJSONArray("samples").length()==3,"Missing real samples");
   MainActivity.write(new java.io.File(getTargetContext().getFilesDir(),"qa-remote-report.json"),r.toString());
   result.putString("stream","PASS: Android client completed real Mac-hosted inference; report labels request-client / remote-server.");finish(Activity.RESULT_OK,result);return;
  }
  runOnMainSync(()->{a.url.setText("http://127.0.0.1:8767");a.model.setText("protocol-fixture");a.upload.setChecked(false);a.profile.setSelection(3);a.jobs.setSelection(2);a.sweep.setChecked(true);a.start();});
  long deadline=System.currentTimeMillis()+60000;while(a.running&&System.currentTimeMillis()<deadline)Thread.sleep(100);
  check(!a.running,"GUI benchmark timed out");check(a.latest!=null,"No saved GUI report: "+a.status.getText());
  JSONObject report=new JSONObject(MainActivity.read(new java.io.File(a.reportDir,a.latest)));JSONArray samples=report.getJSONArray("models").getJSONObject(0).getJSONArray("samples");
  check(samples.length()==18,"Expected 18 sweep samples");for(int i=0;i<samples.length();i++){JSONObject row=samples.getJSONObject(i);check(row.getString("status").equals("complete"),"Agent fixture failed");check(row.getJSONArray("requests").length()==3,"Missing agent steps");}
  check(a.progress.getProgress()==18,"GUI progress missing");check(a.summary.getText().toString().contains("P95"),"GUI assessment missing");check(a.queueDir.listFiles().length==0,"Consent off still queued data");
  java.io.File copy=new java.io.File(getTargetContext().getFilesDir(),"qa-fixture-report.json");MainActivity.write(copy,report.toString());
  for(String invalid:new String[]{"https://example.com:443","http://localhost:8767/v1","http://user:pass@localhost:8767","http://127.0.0.1:8767/?key=secret"}){boolean rejected=false;try{BenchEngine.endpoint(invalid,false);}catch(Exception e){rejected=true;}check(rejected,"Unsafe endpoint accepted");}
  runOnMainSync(()->{a.start();a.engine.cancel();});deadline=System.currentTimeMillis()+10000;while(a.running&&System.currentTimeMillis()<deadline)Thread.sleep(100);check(!a.running,"Cancellation did not complete");
  runOnMainSync(()->{a.summary.setText("QA PASS: 18 agent fixture jobs, progress, report persistence, consent-off and cancellation.\n\n"+a.summary.getText());a.status.setText("Fixture QA complete — no hardware speed claims");});
  result.putString("stream","PASS: native GUI, 18-job sweep, tool workflow, consent off, report save and cancellation. Fixture metrics only.");finish(Activity.RESULT_OK,result);
 }catch(Throwable e){result.putString("stream","FAIL: "+e.toString());finish(Activity.RESULT_CANCELED,result);}}
}
