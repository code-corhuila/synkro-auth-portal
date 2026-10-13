// @vitest-environment node
/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('deploys the locked build internally on platform without credential mounts or published ports',()=>{
 const compose=readFileSync('deploy/compose.yml','utf8');const docker=readFileSync('deploy/Dockerfile','utf8');const nginx=readFileSync('deploy/nginx.conf','utf8');
 expect(compose).toContain('context: ..');expect(compose).toContain('platform');expect(compose).not.toMatch(/ports:|JWT_|SERVICE_TOKEN|password/i);
 expect(docker).toContain('npm ci');expect(docker).toContain('VITE_SHELL_ENTRY_URL');expect(nginx).toContain('no-store');expect(nginx).toContain('try_files $uri =404');
});
