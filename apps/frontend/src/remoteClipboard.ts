import Guacamole from 'guacamole-common-js';

export function sendClipboardText(client: any, text: string) {
  if (!client || !text) return false;
  const stream = client.createClipboardStream('text/plain;charset=utf-8');
  const writer = new Guacamole.StringWriter(stream);
  writer.sendText(text);
  writer.sendEnd();
  return true;
}
