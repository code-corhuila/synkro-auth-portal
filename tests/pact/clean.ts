import { existsSync, unlinkSync } from 'node:fs';
export default function () {
  const file='tests/pact/pacts/AuthPortal-AuthAPI.json';
  if(existsSync(file))unlinkSync(file);
}
