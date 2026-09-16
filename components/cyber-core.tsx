'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Ordinary links also work on the static export. */
import {Cpu,ArrowUpRight} from 'lucide-react';
import {localizeTree} from '@/lib/i18n';
import {useLocale} from './language-switcher';

export function CyberCore(){const locale=useLocale();return localizeTree(
 <div className="cyber-core" data-cyber-core data-jobs="1">
  <div className="core-topline"><span><i/>LOCAL INFERENCE</span><span>01 / 03</span></div>
  <div className="core-stage">
   <div className="core-orbit orbit-one"/><div className="core-orbit orbit-two"/>
   <svg className="core-wires" viewBox="0 0 480 280" fill="none" aria-hidden="true">
    {[65,140,215].map((y,i)=><g key={y} className={'core-lane lane-'+(i+1)}><path d={`M60 ${y} H128 Q150 ${y} 170 140 H240 M240 140 H310 Q330 ${y} 352 ${y} H420`}/><circle r="3"><animateMotion dur={`${2+i*.3}s`} repeatCount="indefinite" path={`M60 ${y} H128 Q150 ${y} 170 140 H240 M240 140 H310 Q330 ${y} 352 ${y} H420`}/></circle></g>)}
   </svg>
   <div className="core-chip"><Cpu size={35}/><b>LLM</b><span>ONE MODEL</span></div>
   {[1,2,3].map(n=><div className={'core-job job-'+n} key={n}><span>JOB</span><b>0{n}</b><i/></div>)}
   <div className="core-output"><span>LOCAL</span><b>AI</b><span>OUTPUT</span></div>
  </div>
  <div className="core-control"><div><span>Concurrent jobs</span><b><output aria-live="polite" data-cyber-count>1</output><small> / 3</small></b></div><div className="core-options" role="group" aria-label="Preview concurrent jobs">{[1,2,3].map(n=><button key={n} type="button" data-cyber-job={n} aria-pressed={n===1}>{n}</button>)}</div></div>
  <p className="core-disclaimer">Interactive illustration · not benchmark results</p>
  <button className="core-motion" type="button" data-cyber-motion="true" aria-pressed="false"><span className="motion-pause">Pause animation</span><span className="motion-resume">Resume animation</span></button>
  <a href="/?tab=rankings" className="core-link">Explore real measurements <ArrowUpRight size={15}/></a>
 </div>,locale);}
