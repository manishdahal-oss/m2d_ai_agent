import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { receive, verify } from './whatsapp/webhook';

const http = httpRouter();

// Convex Auth endpoints (JWKS / OpenID configuration used to verify session tokens).
auth.addHttpRoutes(http);

// Times WhatsApp webhook: https://<deployment>.convex.site/webhooks/whatsapp
http.route({ path: '/webhooks/whatsapp', method: 'POST', handler: receive });
http.route({ path: '/webhooks/whatsapp', method: 'GET', handler: verify });

export default http;
