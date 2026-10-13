import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Login from './Login';
import {authentication} from './test-doubles/authentication';
beforeEach(()=>{authentication.login.mockReset();});afterEach(()=>{cleanup();vi.useRealTimers();});
function fill(){fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'a@example.test'}});fireEvent.change(screen.getByLabelText('Contraseña'),{target:{value:'secret'}});}
it('labels inputs, supports keyboard and sends only credentials with cancellation',async()=>{
 authentication.login.mockResolvedValue({user:{sub:'a',role:'ADMIN'},destination:'/dashboard'});render(<Login/>);const user=userEvent.setup();
 await user.tab();expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();await user.keyboard('a@example.test');await user.tab();await user.keyboard('secret');await user.tab();await user.keyboard('{Enter}');
 await waitFor(()=>expect(authentication.login).toHaveBeenCalledOnce());expect(authentication.login).toHaveBeenCalledWith({email:'a@example.test',password:'secret'},expect.objectContaining({signal:expect.any(AbortSignal)}));
 expect(screen.getByLabelText('Contraseña')).toHaveValue('');
});
it('prevents duplicate submissions while pending',()=>{
 authentication.login.mockReturnValue(new Promise(()=>{}));render(<Login/>);fill();const form=screen.getByRole('button',{name:'Iniciar sesión'}).closest('form')!;
 fireEvent.submit(form);fireEvent.submit(form);expect(authentication.login).toHaveBeenCalledOnce();expect(screen.getByRole('button')).toBeDisabled();
});
it('credential rejection clears password and associates a generic Spanish error',async()=>{
 authentication.login.mockRejectedValue({code:'INVALID_CREDENTIALS'});render(<Login/>);fill();fireEvent.click(screen.getByRole('button'));
 await screen.findByText('Correo o contraseña incorrectos');expect(screen.getByLabelText('Contraseña')).toHaveValue('');
 expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-describedby','login-error');expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid','true');
 expect(authentication.login).toHaveBeenCalledOnce();
});
it.each(['UNAVAILABLE','INDETERMINATE'])('availability %s requires explicit retry without password diagnosis',async code=>{
 authentication.login.mockRejectedValue({code});render(<Login/>);fill();fireEvent.click(screen.getByRole('button'));
 expect(await screen.findByRole('alert')).not.toHaveTextContent('incorrectos');expect(screen.getByRole('button',{name:'Reintentar'})).toBeEnabled();
 expect(authentication.login).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button'));await waitFor(()=>expect(authentication.login).toHaveBeenCalledTimes(2));
});
it('respects Retry-After deadline then enables explicit retry',async()=>{
 vi.useFakeTimers();authentication.login.mockRejectedValue({code:'RATE_LIMITED',retryAt:Date.now()+5000});render(<Login/>);fill();
 await act(async()=>fireEvent.click(screen.getByRole('button')));expect(screen.getByRole('button')).toBeDisabled();
 await act(()=>vi.advanceTimersByTimeAsync(4999));expect(screen.getByRole('button')).toBeDisabled();
 await act(()=>vi.advanceTimersByTimeAsync(1001));expect(screen.getByRole('button',{name:'Reintentar'})).toBeEnabled();expect(authentication.login).toHaveBeenCalledOnce();
});
it('abandonment clears the DOM password and aborts pending work without late state writes',async()=>{
 let finish!:(v:unknown)=>void;authentication.login.mockReturnValue(new Promise(yes=>finish=yes));const view=render(<Login/>);fill();const input=screen.getByLabelText('Contraseña');fireEvent.click(screen.getByRole('button'));
 const signal=authentication.login.mock.calls[0][1].signal;view.unmount();expect(signal.aborted).toBe(true);expect(input).toHaveValue('');await act(async()=>finish({}));
});
it('never stores credentials or receives a token pair',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem');authentication.login.mockResolvedValue({user:{sub:'a',role:'ADMIN'},destination:'/dashboard'});render(<Login/>);fill();fireEvent.click(screen.getByRole('button'));await waitFor(()=>expect(screen.getByLabelText('Contraseña')).toHaveValue(''));expect(spy).not.toHaveBeenCalled();spy.mockRestore();
});
