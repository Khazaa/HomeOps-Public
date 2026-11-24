import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Credential, Resource } from '../src/types';

const mocks=vi.hoisted(()=>({connect:vi.fn(),updateResource:vi.fn(),audit:vi.fn(),onResourceUpdated:vi.fn()}));
vi.mock('../src/api',()=>({api:{connect:mocks.connect,updateResource:mocks.updateResource,audit:mocks.audit}}));
vi.mock('guacamole-common-js',()=>({default:{
  WebSocketTunnel:vi.fn(function WebSocketTunnel(){return{};}),
  Client:vi.fn(function Client(){const client:any={getDisplay:()=>({getElement:()=>document.createElement('div'),getWidth:()=>0,getHeight:()=>0,scale:vi.fn()}),getDisplayElement:vi.fn(),sendMouseState:vi.fn(),sendKeyEvent:vi.fn(),connect:vi.fn(()=>client.onstatechange?.(3)),disconnect:vi.fn()};return client;}),
  Mouse:vi.fn(function Mouse(){return{};}),Keyboard:vi.fn(function Keyboard(){return{reset:vi.fn()};}),StringWriter:vi.fn()
}}));

import { RemoteTab } from '../src/RemoteTab';

const resource:Resource={id:'ssh-a',type:'ssh',name:'Server',notes:'',tags:[],categoryId:null,icon:'ssh',position:0,enabled:true,hasSecret:false,hasLocalSecret:false,credentialId:null,config:{host:'192.168.1.20',port:22,username:'root',authType:'password',verifyHostKey:false}};
const credential:Credential={id:'credential-a',name:'Linux Admin',username:'root',kind:'password',expiresAt:null,createdAt:'2026-01-01',updatedAt:'2026-01-01'};

beforeEach(()=>{mocks.connect.mockReset().mockResolvedValue({token:'ticket-secret',expiresIn:30,protocol:'ssh'});mocks.updateResource.mockReset().mockResolvedValue({...resource,credentialId:credential.id});mocks.audit.mockReset().mockResolvedValue({events:[]});mocks.onResourceUpdated.mockReset().mockResolvedValue(undefined);Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}disconnect(){}}});});
afterEach(cleanup);

test('tests a saved credential and assigns it only after the remote connection succeeds',async()=>{
  render(<RemoteTab resource={resource} credentials={[credential]} active onResourceUpdated={mocks.onResourceUpdated}/>);
  fireEvent.change(screen.getByLabelText('Gespeicherte Zugangsdaten'),{target:{value:credential.id}});
  fireEvent.click(screen.getByRole('button',{name:'Verbinden'}));
  await waitFor(()=>expect(mocks.connect).toHaveBeenCalledWith(resource.id,undefined,640,400,credential.id));
  expect(mocks.updateResource).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog',{name:'Credential dauerhaft zuordnen'})).toHaveTextContent('war erfolgreich');
  fireEvent.click(screen.getByRole('button',{name:'Dauerhaft zuordnen'}));
  await waitFor(()=>expect(mocks.updateResource).toHaveBeenCalledWith(resource.id,{credentialId:credential.id}));
  expect(mocks.onResourceUpdated).toHaveBeenCalledOnce();
});
