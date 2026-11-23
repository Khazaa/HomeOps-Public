export const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    frameSrc: ["'self'", 'http:', 'https:'],
    // Do not silently rewrite explicitly configured LAN HTTP targets to HTTPS.
    upgradeInsecureRequests: null,
  },
};
