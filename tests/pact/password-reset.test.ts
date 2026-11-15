import { Pact, Matchers } from '@pact-foundation/pact';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { apiClient } from '../../src/test-doubles/apiClient';
import { resetUserPassword } from '../../src/auth/api/usersApi';
import { classifyFailure, fieldErrorsFrom, formErrorMessage } from '../../src/auth/model/errors';

const ID='550e8400-e29b-41d4-a716-446655440019';
const timestamp='2026-11-11T12:00:00Z';
const conflict='The Idempotency-Key was already used with a different request';
const scenarios=[
  {state:'an active salesperson can be reset',key:'pact-auth-reset-success',status:200},
  {state:'the original reset preceded a later password change',key:'pact-auth-reset-replay',status:200},
  {state:'the reset receipt expired',key:'pact-auth-reset-expired',status:422},
  {state:'the expired reset receipt was purged',key:'pact-auth-reset-purged',status:422},
  {state:'the caller is a salesperson',key:'pact-auth-reset-denied',status:403},
];
for(const scenario of scenarios)it(`actual Auth client: ${scenario.state}`,async()=>{
  const pact=new Pact({consumer:'AuthPortal',provider:'AuthAPI',dir:resolve('tests/pact/pacts'),logLevel:'error'});
  const response=scenario.status===200
    ?{userId:Matchers.uuid(ID),passwordResetAt:Matchers.regex('^\\d{4}-\\d{2}-\\d{2}T.*Z$',timestamp)}
    :scenario.status===422
      ?{error:'BUSINESS_RULE_VIOLATION',message:conflict,details:[{field:'Idempotency-Key',message:conflict}],traceId:Matchers.like('pact-reset')}
      :{error:'FORBIDDEN',message:'Role SALESPERSON is not authorized to reset passwords',traceId:Matchers.like('pact-reset')};
  await pact.addInteraction().given(scenario.state).uponReceiving(scenario.key)
    .withRequest('POST',Matchers.fromProviderState('/api/v1/auth/users/${targetId}/password-reset',`/api/v1/auth/users/${ID}/password-reset`),
      builder=>builder.headers({'Idempotency-Key':scenario.key}).jsonBody({newPassword:Matchers.string('[redacted]'),confirmPassword:Matchers.string('[redacted]')}))
    .willRespondWith(scenario.status,builder=>{
      builder.headers({'Content-Type':'application/json'}).jsonBody(response);
      if(scenario.status===200)builder.headers({'Cache-Control':'no-store'});
    }).executeTest(async mock=>{
      // The artifact contains type-matcher examples, never the transient input used by the real client.
      const secret=randomUUID();
      apiClient.request.mockImplementation(async(path,options)=>{
        const response=await fetch(mock.url+path,{method:options?.method,signal:options?.signal,
          headers:{'Content-Type':'application/json','Idempotency-Key':options!.idempotencyKey},body:JSON.stringify(options?.body)});
        const body=await response.json();
        if(!response.ok)throw {status:response.status,body};
        return body;
      });
      const request=resetUserPassword(ID,{newPassword:secret,confirmPassword:secret},scenario.key);
      if(scenario.status===200){expect(await request).toEqual({userId:ID,passwordResetAt:timestamp});}
      else {
        const failure=await request.then(()=>{throw Error('Expected rejection');},e=>e);
        expect(failure.status).toBe(scenario.status);
        if(scenario.status===422){
          expect(classifyFailure(failure)).toBe('field');
          expect(fieldErrorsFrom(failure)['Idempotency-Key']).toContain('el restablecimiento original puede haberse aplicado');
        }else expect(formErrorMessage(failure)).toBe('No tienes permiso para realizar esta acción.');
      }
    });
});
