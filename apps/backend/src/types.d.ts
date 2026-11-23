import 'fastify';
declare module 'fastify' { interface FastifyRequest { authUser?: { id: string; username: string; role: 'admin' | 'user'; csrfHash: string } } }
