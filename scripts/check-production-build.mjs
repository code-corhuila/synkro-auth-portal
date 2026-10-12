import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const directory='dist';
const files=(root)=>readdirSync(root).flatMap(name=>{const path=join(root,name);return statSync(path).isDirectory()?files(path):[path];});
const output=files(directory).filter(path=>/\.(js|css|html)$/.test(path)).map(path=>readFileSync(path,'utf8')).join('\n');
const forbidden=[/synkro_dev_token/,/SERVICE_TOKEN/,/BEGIN (RSA )?PRIVATE KEY/,/sessionStorage/,/localStorage/,/\/api\/v1\/auth\/(login|refresh)/,/Authorization/,/fetch\s*\(/,/\baxios\b/,/admin@synkro\.test/];
if(!output.includes('./Login') || !output.includes('shell')) throw new Error('Missing federation contract');
if(forbidden.some(pattern=>pattern.test(output))) throw new Error('Unexpected credential ownership in Auth Portal build');
console.log('Auth Portal: federated login present; no private session, transport or credentials.');
