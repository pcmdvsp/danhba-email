// Deployment diagnostics: no credentials, uploaded files or real personnel data.
import {lookup,SOURCE} from './directory.js';
import {execFileSync} from 'node:child_process';
try {
  const response=await fetch(SOURCE,{redirect:'manual',signal:AbortSignal.timeout(25000)});
  console.log('DIRECTORY_GET',JSON.stringify({status:response.status,redirect:response.headers.get('location')}));
  console.log('DIRECTORY_LOOKUP',JSON.stringify(await lookup('ZZZTEST KHONGCOTEN 927463')));
} catch(e){console.log('DIRECTORY_DIAGNOSTIC_ERROR',JSON.stringify({message:e.message,cause:e.cause?.message,code:e.cause?.code}));}
let audit;
try{audit=execFileSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8',timeout:30000});}catch(e){audit=e.stdout;}
try{const report=JSON.parse(audit);console.log('DEPENDENCY_AUDIT',JSON.stringify(Object.entries(report.vulnerabilities||{}).map(([name,v])=>({name,severity:v.severity,range:v.range,via:v.via,fixAvailable:v.fixAvailable}))));}catch{console.log('DEPENDENCY_AUDIT_UNAVAILABLE');}
