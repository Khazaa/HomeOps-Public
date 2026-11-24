import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Resource } from '../src/types';

const mocks=vi.hoisted(()=>({
  scanNetwork:vi.fn(),
  createResource:vi.fn(),
  createCategory:vi.fn(),
  deleteCategory:vi.fn(),
  networkDiscoveries:vi.fn(),
  networkSchedule:vi.fn(),
  saveNetworkSchedule:vi.fn(),
  dismissNetworkDiscoveries:vi.fn(),
  existing:{ id:'existing',type:'web',name:'Router',notes:'',tags:[],categoryId:null,icon:'link',position:0,enabled:true,hasSecret:false,hasLocalSecret:false,credentialId:null,config:{url:'http://192.168.1.10',mode:'auto',authType:'none'} } as Resource
}));
vi.mock('../src/api',()=>({api:{
  me:vi.fn().mockResolvedValue({user:{id:'user-a',username:'admin',role:'admin'}}),resources:vi.fn().mockResolvedValue([mocks.existing]),categories:vi.fn().mockResolvedValue([]),credentials:vi.fn().mockResolvedValue([]),preferences:vi.fn().mockResolvedValue({data:{}}),savePreferences:vi.fn().mockResolvedValue({data:{}}),testResource:vi.fn().mockResolvedValue({ok:true,code:'OK',message:'OK'}),scanNetwork:mocks.scanNetwork,createResource:mocks.createResource,createCategory:mocks.createCategory,deleteCategory:mocks.deleteCategory,networkDiscoveries:mocks.networkDiscoveries,networkSchedule:mocks.networkSchedule,saveNetworkSchedule:mocks.saveNetworkSchedule,dismissNetworkDiscoveries:mocks.dismissNetworkDiscoveries
}}));
import { App } from '../src/App';

beforeEach(()=>{localStorage.clear();mocks.createResource.mockReset().mockResolvedValue({id:'new'});mocks.createCategory.mockReset().mockResolvedValue({id:'scan-category',name:'Scan',icon:'folder',position:0});mocks.deleteCategory.mockReset().mockResolvedValue({ok:true});mocks.networkDiscoveries.mockReset().mockResolvedValue({results:[]});mocks.networkSchedule.mockReset().mockResolvedValue({enabled:false,cidr:'192.168.1.0/24',web:true,ssh:true,rdp:true,ports:[],runTime:'03:00',timezone:'Europe/Berlin',lastRunAt:null,lastError:null});mocks.saveNetworkSchedule.mockReset().mockImplementation(async value=>({...value,lastRunAt:null,lastError:null}));mocks.dismissNetworkDiscoveries.mockReset().mockResolvedValue({ok:true});mocks.scanNetwork.mockReset().mockResolvedValue({results:[{ip:'192.168.1.10',hostname:'router.lan',port:80,service:'web',suggestedType:'web',scheme:'http'},{ip:'192.168.1.11',hostname:'server.lan',port:22,service:'ssh',suggestedType:'ssh',scheme:'http'}]});Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})})});
afterEach(cleanup);

test('shows DNS names, marks duplicates and saves selected discoveries',async()=>{
  render(<App/>);await screen.findByPlaceholderText('Suchen …');fireEvent.click(screen.getByRole('button',{name:/Netzwerk scannen/}));fireEvent.click(screen.getByRole('button',{name:'Scan starten'}));
  expect(await screen.findByText('router.lan')).toBeVisible();expect(screen.getByText('Bereits vorhanden: Router')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Benutzer für 192.168.1.11:22'),{target:{value:'root'}});fireEvent.click(screen.getByRole('button',{name:'Ausgewählte speichern'}));
  await waitFor(()=>expect(mocks.createCategory).toHaveBeenCalledWith(expect.stringMatching(/^Scan \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)));
  expect(mocks.createResource).toHaveBeenCalledWith(expect.objectContaining({type:'ssh',name:'server.lan · SSH 22',categoryId:'scan-category',config:expect.objectContaining({host:'192.168.1.11',port:22,username:'root',verifyHostKey:false})}));
});

test('shows scheduled discoveries on the dashboard and opens them for review',async()=>{
  mocks.networkDiscoveries.mockResolvedValueOnce({results:[{ip:'192.168.1.50',hostname:'new-host.lan',port:443,service:'web',suggestedType:'web',scheme:'https'}]});
  render(<App/>);expect(await screen.findByText('Neue Systeme')).toBeVisible();expect(screen.getByText('new-host.lan')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'Funde prüfen'}));expect(await screen.findByText('192.168.1.50')).toBeVisible();
});

test('opens resource actions above a trigger near the viewport bottom',async()=>{
  Object.defineProperty(window,'innerWidth',{configurable:true,value:1024});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:800});
  const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({top:740,right:360,bottom:772,left:328,width:32,height:32,x:328,y:740,toJSON:()=>({})});
  render(<App/>);
  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button',{name:'Aktionen für Router'}));
  expect(screen.getByRole('menu',{name:'Aktionen für Router'})).toHaveStyle({left:'136px',top:'406px'});
  fireEvent.click(screen.getByRole('button',{name:'Aktionen für Router'}));
  expect(screen.queryByRole('menu',{name:'Aktionen für Router'})).not.toBeInTheDocument();
  rect.mockRestore();
});

test('shows an application scrollbar when the dashboard overflows',async()=>{
  render(<App/>);
  const scrollbar=await screen.findByRole('scrollbar',{name:'Übersicht scrollen'});
  const dashboard=document.getElementById('homeops-dashboard')!;
  Object.defineProperties(dashboard,{clientHeight:{configurable:true,value:500},scrollHeight:{configurable:true,value:1000}});
  Object.defineProperty(scrollbar,'clientHeight',{configurable:true,value:480});
  fireEvent(window,new Event('resize'));
  await waitFor(()=>expect(scrollbar).not.toHaveClass('disabled'));
  expect(scrollbar.firstElementChild).toHaveStyle({height:'240px'});
});
