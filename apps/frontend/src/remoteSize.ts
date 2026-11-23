export function sendRemoteSize(client: any, width: number, height: number) {
  if (!client) return false;
  client.sendSize(Math.max(320, Math.floor(width)), Math.max(200, Math.floor(height)));
  return true;
}
