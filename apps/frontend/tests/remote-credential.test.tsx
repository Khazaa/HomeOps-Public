import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Credential, Resource } from '../src/types';

const mocks=vi.hoisted(()=>({connect:vi.fn(),updateResource:vi.fn(),audit:vi.fn(),onResourceUpdated:vi.fn(),terminalData:undefined as ((data:string)=>void)|undefined,sockets:[] as Array<{readyState:number;send:ReturnType<typeof vi.fn>;onopen:(()=>void)|null;onmessage:((event:{data:string})=>void)|null;onerror:(()=>void)|null;onclose:((event:{code:number;reason:string})=>void)|null}>}));
vi.mock('../src/api',()=>({api:{connect:mocks.connect,updateResource:mocks.updateResource,audit:mocks.audit}}));
vi.mock('@xterm/xterm',()=>({Terminal:vi.fn(function Terminal(){return{cols:80,rows:24,loadAddon:vi.fn(),open:vi.fn(),onData:vi.fn((callback:(data:string)=>void)=>{mocks.terminalData=callback;return{dispose:vi.fn()};}),clear:vi.fn(),writeln:vi.fn(),write:vi.fn(),focus:vi.fn(),dispose:vi.fn()};})}));
vi.mock('@xterm/addon-fit',()=>({FitAddon:vi.fn(function FitAddon(){return{fit:vi.fn()};})}));
vi.mock('@xterm/addon-web-links',()=>({WebLinksAddon:vi.fn(function WebLinksAddon(){return{};})}));

import { SshTab } from '../src/SshTab';

const resource:Resource={id:'ssh-a',type:'ssh',name:'Server',notes:'',tags:[],categoryId:null,icon:'ssh',position:0,enabled:true,hasSecret:false,hasLocalSecret:false,credentialId:null,config:{host:'192.168.1.20',port:22,username:'root',authType:'password',verifyHostKey:false}};
const credential:Credential={id:'credential-a',name:'Linux Admin',username:'root',kind:'password',expiresAt:null,createdAt:'2026-01-01',updatedAt:'2026-01-01'};

beforeEach(()=>{
  mocks.connect.mockReset().mockResolvedValue({token:'ticket-secret',expiresIn:30,protocol:'ssh'});mocks.updateResource.mockReset().mockResolvedValue({...resource,credentialId:credential.id});mocks.audit.mockReset().mockResolvedValue({events:[]});mocks.onResourceUpdated.mockReset().mockResolvedValue(undefined);mocks.sockets.length=0;mocks.terminalData=undefined;
  Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:class FakeWebSocket{static OPEN=1;readyState=1;send=vi.fn();onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;onclose:((event:{code:number;reason:string})=>void)|null=null;constructor(){mocks.sockets.push(this);}close(code=1000,reason=''){this.readyState=3;this.onclose?.({code,reason});}}});
});
afterEach(cleanup);

test('uses xterm input and assigns a tested credential only after SSH succeeds',async()=>{
  render(<SshTab resource={resource} credentials={[credential]} active onResourceUpdated={mocks.onResourceUpdated}/>);
  fireEvent.change(screen.getByLabelText('Gespeicherte Zugangsdaten'),{target:{value:credential.id}});
  fireEvent.click(screen.getByRole('button',{name:'Verbinden'}));
  await waitFor(()=>expect(mocks.connect).toHaveBeenCalledWith(resource.id,undefined,320,200,credential.id,80,24));
  expect(mocks.updateResource).not.toHaveBeenCalled();
  const webSocket=mocks.sockets[0]!;
  webSocket.onmessage?.({data:JSON.stringify({type:'ready'})});
  expect(await screen.findByRole('dialog',{name:'Credential dauerhaft zuordnen'})).toHaveTextContent('war erfolgreich');
  mocks.terminalData?.('direkt aus der Zwischenablage');
  expect(webSocket.send).toHaveBeenCalledWith(JSON.stringify({type:'data',data:'direkt aus der Zwischenablage'}));
  fireEvent.click(screen.getByRole('button',{name:'Dauerhaft zuordnen'}));
  await waitFor(()=>expect(mocks.updateResource).toHaveBeenCalledWith(resource.id,{credentialId:credential.id}));
  expect(mocks.onResourceUpdated).toHaveBeenCalledOnce();
});
