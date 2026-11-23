export type ResourceType='web'|'ssh'|'rdp';
export interface Resource { id:string; type:ResourceType; name:string; notes:string; tags:string[]; categoryId:string|null; icon:string; position:number; enabled:boolean; config:Record<string,unknown>; hasSecret:boolean; hasLocalSecret:boolean; credentialId:string|null }
export interface Category { id:string; name:string; icon:string; position:number }
export interface Credential { id:string; name:string; username:string; kind:'password'|'private_key'; expiresAt:string|null; createdAt:string; updatedAt:string }
export interface Tab { id:string; resourceId:string; title:string; type:ResourceType; workspaceId:string }
export interface AuditEvent { id:string; resourceId:string|null; resourceName:string; protocol:'ssh'|'rdp'; ok:boolean; code:string; createdAt:string; username:string }
export interface NetworkScanResult { ip:string; hostname:string|null; port:number; service:'web'|'ssh'|'rdp'|'unknown'; suggestedType:ResourceType; scheme:'http'|'https' }
