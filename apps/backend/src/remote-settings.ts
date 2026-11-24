export const RDP_KEYBOARD_LAYOUTS = [
  'de-de-qwertz',
  'de-ch-qwertz',
  'en-gb-qwerty',
  'en-us-qwerty',
  'fr-fr-azerty',
  'fr-be-azerty',
  'fr-ch-qwertz',
  'hu-hu-qwertz',
  'it-it-qwerty',
  'ja-jp-qwerty',
  'no-no-qwerty',
  'pt-br-qwerty',
  'es-es-qwerty',
  'es-latam-qwerty',
  'sv-se-qwerty',
  'tr-tr-qwerty',
  'failsafe'
] as const;

export function applyRdpSettings(settings: Record<string, unknown>, config: Record<string, unknown>) {
  settings.domain = config.domain ?? '';
  settings.security = config.security;
  settings['ignore-cert'] = config.ignoreCertificate === true;
  settings['resize-method'] = 'display-update';
  settings['server-layout'] = RDP_KEYBOARD_LAYOUTS.includes(config.keyboardLayout as typeof RDP_KEYBOARD_LAYOUTS[number])
    ? config.keyboardLayout
    : 'en-us-qwerty';
  return settings;
}
