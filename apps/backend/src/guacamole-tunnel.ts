import GuacamoleLite from 'guacamole-lite';

type VerifyClient = (info: unknown, done: (ok: boolean, code?: number, message?: string) => void) => void;

export function createGuacamoleTunnel(options: {
  verifyClient: VerifyClient;
  guacdHost: string;
  guacdPort: number;
  tokenKey: string;
  processConnectionSettings: (settings: any, callback: (error?: Error | null, settings?: any) => void) => void;
}) {
  // guacamole-lite 1.2.0 adds port 8080 unless the `server` key exists.
  // An explicitly undefined server keeps ws in noServer mode so the app can
  // route SSH and Guacamole upgrades through the shared proxy endpoint.
  return new GuacamoleLite(
    { server: undefined, noServer: true, verifyClient: options.verifyClient },
    { host: options.guacdHost, port: options.guacdPort },
    { crypt: { cypher: 'AES-256-CBC', key: options.tokenKey } },
    { processConnectionSettings: options.processConnectionSettings },
  );
}
