import Guacamole from 'guacamole-common-js';

export function sendClipboardText(client: any, text: string, pasteAfterSync = false) {
  if (!client || !text) return false;
  const stream = client.createClipboardStream('text/plain;charset=utf-8');
  const writer = new Guacamole.StringWriter(stream);
  writer.sendText(text);
  writer.sendEnd();
  if (pasteAfterSync) window.setTimeout(() => {
    client.sendKeyEvent(1, 0xffe3);
    client.sendKeyEvent(1, 0x76);
    client.sendKeyEvent(0, 0x76);
    client.sendKeyEvent(0, 0xffe3);
  }, 50);
  return true;
}
