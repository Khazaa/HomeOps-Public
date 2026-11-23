import type { AuditEvent,Category,Credential,NetworkScanResult,Resource } from './types';
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('homeops_csrf='))?.split('=')[1]??'');
async function request<T>(url:string,init:RequestInit={}):Promise<T>{const headers=new Headers(init.headers);if(init.body)headers.set('content-type','application/json');if(init.method&&!['GET','HEAD'].includes(init.method))headers.set('x-csrf-token',csrf());const response=await fetch(url,{...init,headers,credentials:'include'});if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.message??detail.error??`HTTP ${response.status}`)}return response.json()}
export const api={
  me:()=>request<{user:{id:string;username:string;role:string}}>('/api/v1/auth/me'),
  login:(username:string,password:string)=>request('/api/v1/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  logout:()=>request('/api/v1/auth/logout',{method:'POST'}),
  changePassword:(currentPassword:string,newPassword:string)=>request('/api/v1/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
  audit:()=>request<{events:AuditEvent[]}>('/api/v1/audit'),
  scanNetwork:(body:{cidr:string;web:boolean;ssh:boolean;rdp:boolean;ports:number[]})=>request<{results:NetworkScanResult[]}>('/api/v1/network/scan',{method:'POST',body:JSON.stringify(body)}),
  credentials:()=>request<Credential[]>('/api/v1/credentials'),
  createCredential:(body:{name:string;username:string;kind:Credential['kind'];secret:string;expiresAt:string|null})=>request<Credential>('/api/v1/credentials',{method:'POST',body:JSON.stringify(body)}),
  updateCredential:(id:string,body:{name:string;username:string;kind:Credential['kind'];secret?:string;expiresAt:string|null})=>request<Credential>(`/api/v1/credentials/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  deleteCredential:(id:string)=>request(`/api/v1/credentials/${id}`,{method:'DELETE'}),
  resources:()=>request<Resource[]>('/api/v1/resources'), categories:()=>request<Category[]>('/api/v1/categories'),
  createResource:(body:unknown)=>request<Resource>('/api/v1/resources',{method:'POST',body:JSON.stringify(body)}),
  updateResource:(id:string,body:unknown)=>request<Resource>(`/api/v1/resources/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  deleteTag:(tag:string)=>request<{ok:boolean;resourceIds:string[]}>(`/api/v1/tags/${encodeURIComponent(tag)}`,{method:'DELETE'}),
  duplicateResource:(id:string)=>request<Resource>(`/api/v1/resources/${id}/duplicate`,{method:'POST'}),
  deleteResource:(id:string)=>request(`/api/v1/resources/${id}`,{method:'DELETE'}),
  createCategory:(name:string)=>request<Category>('/api/v1/categories',{method:'POST',body:JSON.stringify({name,icon:'folder',position:0})}),
  updateCategory:(id:string,body:unknown)=>request<Category>(`/api/v1/categories/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  deleteCategory:(id:string)=>request(`/api/v1/categories/${id}`,{method:'DELETE'}),
  testResource:(id:string)=>request<{ok:boolean;code:string;message:string}>(`/api/v1/resources/${id}/test`,{method:'POST'}),
  connect:(id:string,secret:string|undefined,width:number,height:number)=>request<{token:string;expiresIn:number;protocol:string}>(`/api/v1/resources/${id}/connect`,{method:'POST',body:JSON.stringify({secret,width,height})}),
  preferences:()=>request<{data:Record<string,unknown>}>('/api/v1/preferences'), savePreferences:(data:unknown)=>request('/api/v1/preferences',{method:'PUT',body:JSON.stringify(data)})
};
