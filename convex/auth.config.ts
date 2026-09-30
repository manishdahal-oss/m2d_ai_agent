// Convex validates dashboard sessions as JWTs issued by this deployment (Convex Auth).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
};
