'use client';
import {useEffect} from 'react';

// Start DOM enhancements after React hydration; static pages load the same file directly.
export function CyberEffects(){
 useEffect(()=>{
  if(document.getElementById('tokfire-cyber-script'))return;
  const script=document.createElement('script');
  script.id='tokfire-cyber-script';script.src='/cyber.js';script.async=true;
  document.body.appendChild(script);
 },[]);
 return null;
}
